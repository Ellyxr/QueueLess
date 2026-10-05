import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma, VendorApplication, VendorApplicationStatus as Status, VendorApplicationDocumentKind as Kind } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { ImagekitService } from '../imagekit/imagekit.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CONTRACT_WINDOW_MS, VENDOR_TERMS_VERSION, ApplicationUpload, contractIsOverdue, decryptBankDetails, documentExtension, encryptBankDetails, requireTransition } from './vendor-application.policy';
import { ListVendorApplicationsDto, ReviewApplicationDto, SubmitVendorApplicationDto } from './vendor-application.dto';

const safeSelect = {
  id: true, studentUserId: true, businessName: true, foodCategory: true, planId: true,
  quotedPrice: true, quotedDurationDays: true, quotedDurationMonths: true, status: true,
  bankAccountLast4: true, termsAcceptedAt: true, termsVersion: true, contractDueAt: true,
  contractVerifiedAt: true, rejectionReason: true, contractRejectionReason: true,
  paymentFailureReason: true, vendorId: true, subscriptionId: true, createdAt: true,
  updatedAt: true, validIdDocumentId: true, idSelfieDocumentId: true, signedContractDocumentId: true,
} satisfies Prisma.VendorApplicationSelect;

@Injectable()
export class VendorApplicationsService {
  constructor(private readonly prisma: PrismaService, private readonly images: ImagekitService,
    private readonly subscriptions: SubscriptionsService) {}

  private atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(work, { maxWait: 10_000, timeout: 30_000 });
  }
  private async lock(tx: Prisma.TransactionClient, id: string, ownerId?: string) {
    await tx.$queryRaw`SELECT id FROM vendor_applications WHERE id = ${id}::uuid FOR UPDATE`;
    const application = await tx.vendorApplication.findFirst({ where: { id, ...(ownerId ? { studentUserId: ownerId } : {}) } });
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }
  private audit(tx: Prisma.TransactionClient, id: string, actor: string | null, action: string,
    before: Status | null, after: Status, extra: Prisma.InputJsonObject = {}) {
    return tx.auditRecord.create({ data: { actorUserId: actor, entityType: 'VendorApplication', entityId: id,
      actionType: action, beforeState: before ? { status: before } : Prisma.JsonNull,
      afterState: { status: after, ...extra } } });
  }
  private async eligibleUser(tx: Prisma.TransactionClient, id: string) {
    const user = await tx.user.findFirst({ where: { id, isActive: true, archivedAt: null,
      roleAssignments: { some: { role: 'BUYER', revokedAt: null } } } });
    if (!user) throw new ConflictException('An active buyer account is required');
  }
  private async document(tx: Prisma.TransactionClient, id: string, owner: string, kind: Kind) {
    const document = await tx.vendorApplicationDocument.findFirst({ where: { id, ownerUserId: owner, kind } });
    if (!document) throw new NotFoundException('Document not found');
    const used = await tx.vendorApplication.count({ where: { OR: [
      { validIdDocumentId: id }, { idSelfieDocumentId: id }, { signedContractDocumentId: id },
    ] } });
    if (used) throw new ConflictException('Document is already attached to an application');
    return document;
  }
  private view<T extends { status: Status; contractDueAt: Date | null; quotedPrice: Prisma.Decimal }>(item: T) {
    return { ...item, quotedPrice: item.quotedPrice.toFixed(2), currency: 'PHP',
      contractOverdue: contractIsOverdue(item.status, item.contractDueAt) || item.status === Status.CONTRACT_EXPIRED };
  }
  plans() {
    return this.prisma.subscriptionPlan.findMany({ where: { studentApplicationEnabled: true },
      select: { id: true, name: true, price: true, durationDays: true, durationMonths: true, benefitsDescription: true },
      orderBy: { price: 'asc' } });
  }
  async upload(owner: string, kind: Kind, file?: ApplicationUpload) {
    const extension = documentExtension(file);
    const recent = await this.prisma.vendorApplicationDocument.count({ where: { ownerUserId: owner,
      createdAt: { gt: new Date(Date.now() - 86_400_000) } } });
    if (recent >= 12) throw new ConflictException('Daily document upload limit reached');
    const id = randomUUID();
    const stored = await this.images.uploadPrivateVendorDocument(id, file!.buffer, extension);
    try {
      await this.atomic(async tx => {
        await this.eligibleUser(tx, owner);
        await tx.vendorApplicationDocument.create({ data: { id, ownerUserId: owner, kind,
          fileId: stored.fileId, privatePath: stored.path } });
        await tx.auditRecord.create({ data: { actorUserId: owner, actionType: 'VENDOR_APPLICATION_DOCUMENT_UPLOADED',
          entityType: 'VendorApplicationDocument', entityId: id, afterState: { kind } } });
      });
    } catch (error) {
      await this.images.deletePrivateFile(stored.fileId).catch(() => undefined);
      throw error;
    }
    return { id, kind };
  }
  async submit(owner: string, dto: SubmitVendorApplicationDto) {
    const businessName = dto.businessName.trim(), foodCategory = dto.foodCategory.trim();
    const holder = dto.bankAccountHolderName.trim();
    if (!businessName || !foodCategory || !holder || !dto.termsAccepted || dto.termsVersion !== VENDOR_TERMS_VERSION) {
      throw new BadRequestException('Required application fields or accepted terms are missing');
    }
    const id = randomUUID();
    const encrypted = encryptBankDetails(id, dto.bankAccountNumber, holder);
    try {
      await this.atomic(async tx => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${owner}::uuid FOR UPDATE`;
        await this.eligibleUser(tx, owner);
        if (await tx.vendorApplication.count({ where: { studentUserId: owner,
          status: { notIn: [Status.REJECTED, Status.CONTRACT_EXPIRED] } } })) {
          throw new ConflictException('An application is already in progress or active');
        }
        const vendor = await tx.vendor.findUnique({ where: { ownerUserId: owner } });
        if (vendor && (vendor.vendorType !== 'STUDENT' || vendor.status !== 'PENDING_APPROVAL')) {
          throw new ConflictException('Existing vendor cannot enter the application workflow');
        }
        await this.document(tx, dto.validIdDocumentId, owner, Kind.VALID_ID);
        await this.document(tx, dto.idSelfieDocumentId, owner, Kind.ID_SELFIE);
        const plan = await tx.subscriptionPlan.findFirst({ where: { id: dto.planId, studentApplicationEnabled: true } });
        if (!plan || plan.price.lessThan(1) || plan.durationDays < 1) throw new BadRequestException('Application plan is unavailable');
        await tx.vendorApplication.create({ data: { id, studentUserId: owner, businessName, foodCategory,
          validIdDocumentId: dto.validIdDocumentId, idSelfieDocumentId: dto.idSelfieDocumentId,
          bankDetailsEncrypted: encrypted, bankAccountLast4: dto.bankAccountNumber.slice(-4),
          planId: plan.id, quotedPrice: plan.price, quotedDurationDays: plan.durationDays,
          quotedDurationMonths: plan.durationMonths, termsVersion: dto.termsVersion, termsAcceptedAt: new Date(),
          vendorId: vendor?.id } });
        await this.audit(tx, id, owner, 'VENDOR_APPLICATION_SUBMITTED', null, Status.PENDING_REVIEW,
          { planId: plan.id, amount: plan.price.toFixed(2), termsVersion: dto.termsVersion });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Application or document already exists');
      }
      throw error;
    }
    return this.detail(id);
  }
  async mine(owner: string) {
    const item = await this.prisma.vendorApplication.findFirst({ where: { studentUserId: owner }, select: safeSelect,
      orderBy: { createdAt: 'desc' } });
    if (!item) return null;
    const subscription = item.subscriptionId ? await this.prisma.vendorSubscription.findUnique({
      where: { id: item.subscriptionId }, select: { status: true, startDate: true, endDate: true } }) : null;
    return { ...this.view(item), subscription,
      hasActiveSubscription: subscription?.status === 'ACTIVE' && !!subscription.endDate && subscription.endDate > new Date() };

  }
  async detail(id: string) {
    const item = await this.prisma.vendorApplication.findUnique({ where: { id }, select: safeSelect });
    if (!item) throw new NotFoundException('Application not found');
    return this.view(item);
  }
  async list(dto: ListVendorApplicationsDto) {
    const where = { ...(dto.status ? { status: dto.status } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.vendorApplication.findMany({ where, select: { ...safeSelect,
        student: { select: { id: true, fullName: true, email: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (dto.page - 1) * dto.limit, take: dto.limit }),
      this.prisma.vendorApplication.count({ where }),
    ]);
    return { items: items.map(x => this.view(x)), total, page: dto.page, limit: dto.limit, totalPages: Math.ceil(total / dto.limit) };
  }
  async bankDetails(id: string, actor: string) {
    return this.atomic(async tx => {
      const item = await this.lock(tx, id);
      const details = decryptBankDetails(id, item.bankDetailsEncrypted);
      await this.audit(tx, id, actor, 'VENDOR_APPLICATION_BANK_DETAILS_VIEWED', item.status, item.status);
      return details;
    });
  }
  async documentUrl(id: string, actor: string, admin: boolean) {
    const item = await this.prisma.vendorApplicationDocument.findFirst({ where: { id,
      ...(admin ? { OR: [{ validIdFor: { isNot: null } }, { selfieFor: { isNot: null } }, { contractFor: { isNot: null } }] } : { ownerUserId: actor }) } });
    if (!item) throw new NotFoundException('Document not found');
    await this.prisma.auditRecord.create({ data: { actorUserId: actor, actionType: 'VENDOR_APPLICATION_DOCUMENT_VIEWED',
      entityType: 'VendorApplicationDocument', entityId: id, afterState: { kind: item.kind } } });
    return { url: this.images.signedVendorDocumentUrl(item.privatePath), expiresIn: 300 };
  }
  async review(id: string, actor: string, dto: ReviewApplicationDto) {
    await this.atomic(async tx => {
      const item = await this.lock(tx, id);
      requireTransition(item.status, [Status.PENDING_REVIEW]);
      const reject = dto.action === 'REJECT';
      const reason = dto.reason?.trim();
      if (reject && !reason) throw new BadRequestException('Rejection reason is required');
      if (!reject) await this.eligibleUser(tx, item.studentUserId);
      const status = reject ? Status.REJECTED : Status.AWAITING_CONTRACT;
      await tx.vendorApplication.update({ where: { id }, data: { status,
        rejectionReason: reject ? reason : null, contractDueAt: reject ? null : new Date(Date.now() + CONTRACT_WINDOW_MS) } });
      await this.audit(tx, id, actor, reject ? 'VENDOR_APPLICATION_REJECTED' : 'VENDOR_APPLICATION_APPROVED', item.status, status);
    });
    return this.detail(id);
  }
  async contract(id: string, owner: string, documentId: string) {
    const expired = await this.atomic(async tx => {
      const item = await this.lock(tx, id, owner);
      requireTransition(item.status, [Status.AWAITING_CONTRACT, Status.CONTRACT_REJECTED]);
      if (contractIsOverdue(item.status, item.contractDueAt)) {
        await this.markExpired(tx, item);
        return true;
      }
      await this.document(tx, documentId, owner, Kind.SIGNED_CONTRACT);
      await tx.vendorApplication.update({ where: { id }, data: { status: Status.CONTRACT_SUBMITTED, signedContractDocumentId: documentId } });
      await this.audit(tx, id, owner, 'VENDOR_APPLICATION_CONTRACT_SUBMITTED', item.status, Status.CONTRACT_SUBMITTED);
      return false;
    });
    if (expired) throw new ConflictException('Contract window expired; submit a new application');
    return this.detail(id);
  }
  async rejectContract(id: string, actor: string, reason: string) {
    if (!reason.trim()) throw new BadRequestException('Contract rejection reason is required');
    await this.atomic(async tx => {
      const item = await this.lock(tx, id);
      requireTransition(item.status, [Status.CONTRACT_SUBMITTED]);
      await tx.vendorApplication.update({ where: { id }, data: { status: Status.CONTRACT_REJECTED,
        contractRejectionReason: reason.trim(), contractDueAt: new Date(Date.now() + CONTRACT_WINDOW_MS),
        contractVerifiedAt: null } });
      await this.audit(tx, id, actor, 'VENDOR_APPLICATION_CONTRACT_REJECTED', item.status, Status.CONTRACT_REJECTED);
    });
    return this.detail(id);
  }
  async verify(id: string, actor: string) {
    return this.startPayment(id, actor, false);
  }
  async retry(id: string, owner: string) {
    return this.startPayment(id, owner, true);
  }
  private async startPayment(id: string, actor: string, retry: boolean) {
    const reservation = await this.atomic(async tx => {
      const item = await this.lock(tx, id, retry ? actor : undefined);
      // A repeated verify/retry resumes the same reserved checkout, never a new charge.
      if (item.status === Status.PAYMENT_PROCESSING && item.subscriptionId) {
        return { owner: item.studentUserId, subscriptionId: item.subscriptionId };
      }
      requireTransition(item.status, retry ? [Status.PAYMENT_FAILED] : [Status.CONTRACT_SUBMITTED]);
      if (!item.signedContractDocumentId || (retry && !item.contractVerifiedAt)) throw new ConflictException('Verified contract required');
      await this.eligibleUser(tx, item.studentUserId);
      let vendor = await tx.vendor.findUnique({ where: { ownerUserId: item.studentUserId } });
      if (vendor && (vendor.status !== 'PENDING_APPROVAL' || vendor.vendorType !== 'STUDENT')) {
        throw new ConflictException('Vendor is not eligible for activation');
      }
      if (vendor) {
        const changed = await tx.vendor.updateMany({ where: { id: vendor.id, status: 'PENDING_APPROVAL' },
          data: { name: item.businessName, businessName: item.businessName } });
        if (!changed.count) throw new ConflictException('Vendor eligibility changed');
      }
      if (!vendor) vendor = await tx.vendor.create({ data: { ownerUserId: item.studentUserId,
        name: item.businessName, businessName: item.businessName, vendorType: 'STUDENT', status: 'PENDING_APPROVAL' } });
      if (item.subscriptionId) {
        const old = await tx.vendorSubscription.findUnique({ where: { id: item.subscriptionId }, include: { payments: true } });
        if (old?.status === 'PENDING') {
          await tx.vendorApplication.update({ where: { id }, data: { status: Status.PAYMENT_PROCESSING, paymentFailureReason: null } });
          await this.audit(tx, id, actor, 'VENDOR_APPLICATION_PAYMENT_RESUMED', item.status, Status.PAYMENT_PROCESSING);
          return { owner: item.studentUserId, subscriptionId: old.id };
        }
        if (old && old.payments.some(p => p.status === 'SUCCEEDED')) throw new ConflictException('Existing payment requires review');
      }
      const subscription = await tx.vendorSubscription.create({ data: { vendorId: vendor.id, planId: item.planId } });
      const payment = await tx.payment.create({ data: { payerUserId: item.studentUserId,
        purpose: 'SUBSCRIPTION', vendorSubscriptionId: subscription.id, amount: item.quotedPrice,
        currency: 'PHP', status: 'PENDING', provider: 'PAYMONGO' } });
      await tx.vendorApplication.update({ where: { id }, data: { vendorId: vendor.id, subscriptionId: subscription.id,
        contractVerifiedAt: item.contractVerifiedAt ?? new Date(), status: Status.PAYMENT_PROCESSING, paymentFailureReason: null } });
      await this.audit(tx, id, actor, 'VENDOR_APPLICATION_CONTRACT_VERIFIED', item.status, Status.PAYMENT_PROCESSING,
        { subscriptionId: subscription.id, paymentId: payment.id });
      await tx.auditRecord.create({ data: { actorUserId: actor, entityType: 'Payment', entityId: payment.id,
        actionType: 'PAYMENT_CREATED', afterState: { purpose: 'SUBSCRIPTION', amount: item.quotedPrice.toFixed(2), status: 'PENDING' } } });
      await tx.auditRecord.create({ data: { actorUserId: actor, entityType: 'VendorSubscription', entityId: subscription.id,
        actionType: 'SUBSCRIPTION_CREATED', afterState: { vendorId: vendor.id, planId: item.planId, status: 'PENDING' } } });
      return { owner: item.studentUserId, subscriptionId: subscription.id };
    });
    try {
      const checkout = await this.subscriptions.checkout(reservation.owner, reservation.subscriptionId);
      return { application: await this.detail(id), checkout };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      // Keep the reservation/session on uncertain provider outcomes. Retry resumes it.
      await this.atomic(async tx => {
        const item = await this.lock(tx, id);
        if (item.status !== Status.PAYMENT_PROCESSING) return;
        await tx.vendorApplication.update({ where: { id }, data: { status: Status.PAYMENT_FAILED,
          paymentFailureReason: 'Checkout could not be prepared; retry the reserved payment or contact support.' } });
        await this.audit(tx, id, actor, 'VENDOR_APPLICATION_PAYMENT_FAILED', item.status, Status.PAYMENT_FAILED);
      });
      throw error;
    }
  }
  private async markExpired(tx: Prisma.TransactionClient, item: VendorApplication) {
    await tx.vendorApplication.update({ where: { id: item.id }, data: { status: Status.CONTRACT_EXPIRED } });
    await this.audit(tx, item.id, null, 'VENDOR_APPLICATION_CONTRACT_EXPIRED', item.status, Status.CONTRACT_EXPIRED);
  }
  @Interval(60_000)
  async expireContractWindows() {
    const items = await this.prisma.vendorApplication.findMany({ where: {
      status: { in: [Status.AWAITING_CONTRACT, Status.CONTRACT_REJECTED] }, contractDueAt: { lte: new Date() },
    }, select: { id: true }, take: 100 });
    for (const item of items) await this.atomic(async tx => {
      const current = await this.lock(tx, item.id);
      if (contractIsOverdue(current.status, current.contractDueAt)) await this.markExpired(tx, current);
    });
  }
}
