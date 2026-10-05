import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { FeaturedListingPlacement, FeaturedListingStatus, LedgerEntryType, PaymentProvider, PaymentPurpose, PaymentStatus, Prisma, VendorStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymongoService } from '../payments/paymongo.service';
import { CreateFeaturedListingDto, CreateFeaturedPlanDto, ListAdminFeaturedListingsDto, UpdateFeaturedSettingsDto, UpdateFeaturedPlanDto } from './dto/featured-listing.dto';

import { discountedPrice, listingEndDate, lockFeaturedPricing, lockVendorWallet } from './featured-pricing.policy';
import { createHash } from 'crypto';

@Injectable()
export class FeaturedListingsService {
  private readonly logger = new Logger(FeaturedListingsService.name);

  constructor(private readonly prisma: PrismaService, private readonly paymongo: PaymongoService) {}

  plans() {
    return this.prisma.featuredListingPlan.findMany({
      where: { isActive: true }, orderBy: [{ placement: 'asc' }, { price: 'asc' }],
    });
  }

  allPlans() { return this.prisma.featuredListingPlan.findMany({ orderBy: [{ placement: 'asc' }, { durationMonths: 'asc' }, { price: 'asc' }] }); }

  async adminListings(query: ListAdminFeaturedListingsDto) {
    const { page, limit, status, placement, vendorId, planId } = query;
    const skip = (page - 1) * limit;
    if (!Number.isSafeInteger(skip) || skip > 2147483647) throw new BadRequestException('Page is too large');
    const where: Prisma.FeaturedListingWhereInput = {
      ...(status !== undefined ? { status } : {}),
      ...(placement !== undefined ? { placement } : {}),
      ...(vendorId !== undefined ? { vendorId } : {}),
      ...(planId !== undefined ? { planId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.featuredListing.findMany({
        where, skip, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true, vendorId: true, productId: true, planId: true, placement: true,
          status: true, createdAt: true, startDate: true, endDate: true,
          pricePaid: true, discountPercent: true, imageUrl: true,
          durationDaysSnapshot: true, durationMonthsSnapshot: true, settingsVersion: true,
          vendor: { select: { id: true, name: true, status: true, vendorType: true } },
          product: { select: { id: true, name: true, isAvailable: true } },
          plan: { select: { id: true, name: true, isActive: true, managedMonthly: true,
            price: true, durationDays: true, durationMonths: true } },
          payments: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: {
            id: true, provider: true, status: true, amount: true, currency: true, createdAt: true,
          } },
        },
      }),
      this.prisma.featuredListing.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items, total, page, limit };
  }

  settings() { return this.prisma.featuredListingSettings.findUniqueOrThrow({ where: { id: 1 } }); }

  async updateSettings(dto: UpdateFeaturedSettingsDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockFeaturedPricing(tx);
      const before = await tx.featuredListingSettings.findUniqueOrThrow({ where: { id: 1 } });
      if (before.version !== dto.version) throw new ConflictException('Settings changed; reload before saving');
      const after = await tx.featuredListingSettings.update({ where: { id: 1 }, data: {
        monthlyPrice: dto.monthlyPrice, firstVendorDiscount: dto.firstVendorDiscount,
        secondVendorDiscount: dto.secondVendorDiscount, thirdVendorDiscount: dto.thirdVendorDiscount,
        discountOnRenewals: dto.discountOnRenewals, version: { increment: 1 },
      } });
      const plans = await tx.featuredListingPlan.findMany({ where: { managedMonthly: true } });
      for (const plan of plans) await tx.featuredListingPlan.update({ where: { id: plan.id },
        data: { price: after.monthlyPrice.mul(plan.durationMonths!) } });
      const audit = (value: typeof before) => ({ monthlyPrice: value.monthlyPrice.toFixed(2),
        firstVendorDiscount: value.firstVendorDiscount, secondVendorDiscount: value.secondVendorDiscount,
        thirdVendorDiscount: value.thirdVendorDiscount, discountOnRenewals: value.discountOnRenewals, version: value.version });
      await tx.auditRecord.create({ data: { actorUserId, actionType: 'FEATURED_SETTINGS_UPDATED',
        entityType: 'FeaturedListingSettings', entityId: '1', beforeState: audit(before), afterState: audit(after) } });
      return after;
    }, { maxWait: 10000, timeout: 30000 });
  }

  async createPlan(dto: CreateFeaturedPlanDto, actorUserId: string) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Plan name is required');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const plan = await tx.featuredListingPlan.create({
          data: { name, placement: dto.placement, price: dto.price, durationDays: dto.durationDays },
        });
        await tx.auditRecord.create({ data: {
          actorUserId, actionType: 'FEATURED_PLAN_CREATED',
          entityType: 'FeaturedListingPlan', entityId: plan.id,
          afterState: { name: plan.name, placement: plan.placement,
            price: plan.price.toFixed(2), durationDays: plan.durationDays },
        } });
        return plan;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Featured listing plan name already exists');
      }
      throw error;
    }
  }

  async updatePlan(id: string, dto: UpdateFeaturedPlanDto, actorUserId: string) {
    if ([dto.name, dto.price, dto.durationDays, dto.isActive].every(value => value === undefined)) throw new BadRequestException('At least one plan field is required');
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) throw new BadRequestException('Plan name is required');
    try {
      return await this.prisma.$transaction(async tx => {
        await lockFeaturedPricing(tx);
        const before = await tx.featuredListingPlan.findUnique({ where: { id } });
        if (!before) throw new NotFoundException('Featured listing plan not found');
        if (before.managedMonthly && (dto.price !== undefined || dto.durationDays !== undefined))
          throw new BadRequestException('Monthly plan pricing is managed through featured listing settings');
        const after = await tx.featuredListingPlan.update({ where: { id }, data: { ...dto, ...(name ? { name } : {}) } });
        const audit = (plan: typeof before) => ({ name: plan.name, price: plan.price.toFixed(2), durationDays: plan.durationDays, isActive: plan.isActive });
        await tx.auditRecord.create({ data: { actorUserId, actionType: 'FEATURED_PLAN_UPDATED', entityType: 'FeaturedListingPlan', entityId: id,
          beforeState: audit(before), afterState: audit(after) } });
        return after;
      }, { maxWait: 10000, timeout: 30000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Plan name already exists');
      throw error;
    }
  }

  async mine(userId: string) {
    const vendor = await this.ownedVendor(userId);
    return this.prisma.featuredListing.findMany({
      where: { vendorId: vendor.id }, include: {
        plan: true, product: { select: { id: true, name: true, isAvailable: true } },
        payments: { select: { id: true, status: true, amount: true, currency: true, createdAt: true } },
      }, orderBy: { createdAt: 'desc' }, take: 50,
    });
  }

  list(placement?: FeaturedListingPlacement) {
    const now = new Date();
    return this.prisma.featuredListing.findMany({
      where: {
        status: FeaturedListingStatus.ACTIVE,
        startDate: { lte: now }, endDate: { gt: now },
        vendor: { status: VendorStatus.ACTIVE },
        OR: [{ productId: null }, { product: { isAvailable: true } }],
        ...(placement ? { placement } : {}),
      },
      select: {
        id: true, placement: true, startDate: true, endDate: true, imageUrl: true,
        vendor: { select: { id: true, name: true, businessName: true, campusLocation: true } },
        product: { select: { id: true, name: true, price: true, imageUrl: true } },
      },
      orderBy: { startDate: 'desc' }, take: 100,
    });
  }

  private async sumLedgerBalance(vendorId: string, client: PrismaService | Prisma.TransactionClient = this.prisma) {
    const result = await client.vendorLedgerEntry.aggregate({ where: { vendorId }, _sum: { amount: true } });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }

  private async price(tx: Prisma.TransactionClient, vendorId: string, dto: CreateFeaturedListingDto, reserve: boolean) {
    const vendor = await tx.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor || vendor.status !== VendorStatus.ACTIVE) throw new ConflictException('Vendor is not active');
    const plan = await tx.featuredListingPlan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new NotFoundException('Featured listing plan not found');
    if (!plan.isActive || plan.price.lessThan(1)) throw new ConflictException('Plan is unavailable');
    if (plan.placement === FeaturedListingPlacement.PRODUCT_SPOTLIGHT && !dto.productId)
      throw new BadRequestException('Product is required for this placement');
    const product = dto.productId ? await tx.product.findFirst({ where: {
      id: dto.productId, vendorId, isAvailable: true }, select: { imageUrl: true } }) : null;
    if (dto.productId && !product) throw new NotFoundException('Available vendor product not found');
    if (dto.productId && !['PRODUCT_SPOTLIGHT', 'MARKETPLACE_HOME'].includes(plan.placement))
      throw new BadRequestException('Product is not accepted for this placement');
    const settings = await tx.featuredListingSettings.findUniqueOrThrow({ where: { id: 1 } });
    let rank: number | null = null;
    let percent = 0;
    if (plan.placement === FeaturedListingPlacement.MARKETPLACE_HOME) {
      let claim = await tx.featuredIntroClaim.findUnique({ where: { vendorId } });
      const paidBefore = await tx.payment.count({ where: { status: PaymentStatus.SUCCEEDED,
        featuredListing: { vendorId, placement: FeaturedListingPlacement.MARKETPLACE_HOME } } });
      if (!claim && !paidBefore) {
        const claims = await tx.featuredIntroClaim.findMany({ select: { rank: true } });
        const available = [1, 2, 3].find(value => !claims.some(item => item.rank === value));
        if (available) claim = reserve ? await tx.featuredIntroClaim.create({ data: { vendorId, rank: available } })
          : { vendorId, rank: available, consumedAt: null, createdAt: new Date() };
      }
      rank = claim?.rank ?? null;
      if (rank && (!paidBefore || settings.discountOnRenewals))
        percent = [settings.firstVendorDiscount, settings.secondVendorDiscount, settings.thirdVendorDiscount][rank - 1];
    }
    const base = plan.managedMonthly ? settings.monthlyPrice.mul(plan.durationMonths!) : plan.price;
    const amount = discountedPrice(base, percent);
    const balance = await this.sumLedgerBalance(vendorId, tx);
    return { plan, settings, rank, percent, base, amount, balance, imageUrl: dto.imageUrl?.trim() || product?.imageUrl || null };
  }

  async quote(userId: string, dto: CreateFeaturedListingDto) {
    const vendor = await this.ownedVendor(userId);
    return this.prisma.$transaction(async tx => {
      await lockFeaturedPricing(tx);
      const price = await this.price(tx, vendor.id, dto, false);
      return { planId: price.plan.id, durationMonths: price.plan.durationMonths, durationDays: price.plan.durationDays,
        baseAmount: price.base.toFixed(2), discountPercent: price.percent, introductoryRank: price.rank, discountEligible: price.percent > 0, discountAmount: price.base.sub(price.amount).toFixed(2),
        amount: price.amount.toFixed(2), currency: 'PHP', walletBalance: price.balance.toFixed(2),
        canPayWithWallet: price.balance.greaterThanOrEqualTo(price.amount), settingsVersion: price.settings.version,
        discountOnRenewals: price.settings.discountOnRenewals, reservation: false };
    }, { maxWait: 10000, timeout: 30000 });
  }

  async create(userId: string, dto: CreateFeaturedListingDto, key?: string) {
    const purchaseKey = key?.trim();
    if (!purchaseKey || purchaseKey.length > 255) throw new BadRequestException('Idempotency-Key header is required (maximum 255 characters)');
    const fingerprint = createHash('sha256').update(JSON.stringify([dto.planId, dto.productId ?? null,
      dto.imageUrl?.trim() || null, dto.paymentMethod ?? 'PAYMONGO'])).digest('hex');
    const vendor = await this.ownedVendor(userId);
    await this.expireVendor(vendor.id);
    let result;
    try {
      result = await this.prisma.$transaction(async tx => {
        await lockFeaturedPricing(tx);
        await lockVendorWallet(tx, vendor.id);
        const existing = await tx.featuredListing.findUnique({ where: { vendorId_purchaseKey: { vendorId: vendor.id, purchaseKey } }, include: { payments: true } });
        if (existing) {
          if (existing.purchaseFingerprint !== fingerprint) throw new ConflictException('Idempotency-Key belongs to another listing');
          return { listing: existing, payment: existing.payments[0], replay: true, balance: await this.sumLedgerBalance(vendor.id, tx) };
        }
        const price = await this.price(tx, vendor.id, dto, true);
        if (dto.expectedAmount !== undefined && !price.amount.equals(new Prisma.Decimal(dto.expectedAmount)))
          throw new ConflictException('Price changed; reload the quote before confirming');
        const wallet = dto.paymentMethod === 'WALLET';
        if (wallet && price.balance.lessThan(price.amount)) throw new ConflictException('Insufficient vendor wallet balance');
        const now = new Date();
        const listing = await tx.featuredListing.create({ data: {
          vendorId: vendor.id, planId: price.plan.id, placement: price.plan.placement,
          productId: dto.productId ?? null, imageUrl: price.imageUrl, discountPercent: price.percent,
          durationDaysSnapshot: price.plan.durationDays, durationMonthsSnapshot: price.plan.durationMonths,
          settingsVersion: price.settings.version, purchaseKey, purchaseFingerprint: fingerprint,
          status: wallet ? FeaturedListingStatus.ACTIVE : FeaturedListingStatus.PENDING,
          ...(wallet ? { startDate: now, endDate: listingEndDate(now, price.plan.durationDays, price.plan.durationMonths), pricePaid: price.amount } : {}),
        } });
        const payment = await tx.payment.create({ data: {
          payerUserId: userId, purpose: PaymentPurpose.FEATURED_LISTING, featuredListingId: listing.id,
          amount: price.amount, currency: 'PHP', provider: wallet ? PaymentProvider.WALLET : PaymentProvider.PAYMONGO,
          status: wallet ? PaymentStatus.SUCCEEDED : PaymentStatus.PENDING,
        } });
        if (wallet) {
          await tx.vendorLedgerEntry.create({ data: { vendorId: vendor.id, featuredListingId: listing.id,
            type: LedgerEntryType.PROMOTION_DEBIT, amount: price.amount.negated() } });
          if (price.plan.placement === FeaturedListingPlacement.MARKETPLACE_HOME) await tx.featuredIntroClaim.updateMany({ where: { vendorId: vendor.id, consumedAt: null }, data: { consumedAt: now } });
        }
        await tx.auditRecord.create({ data: { actorUserId: userId, actionType: 'FEATURED_LISTING_CREATED', entityType: 'FeaturedListing', entityId: listing.id,
          afterState: { status: listing.status, planId: price.plan.id, paymentId: payment.id, amount: price.amount.toFixed(2), discountPercent: price.percent, introductoryRank: price.rank, settingsVersion: price.settings.version } } });
        await tx.auditRecord.create({ data: { actorUserId: userId, actionType: 'PAYMENT_CREATED', entityType: 'Payment', entityId: payment.id,
          afterState: { status: payment.status, provider: payment.provider, amount: payment.amount.toFixed(2), purpose: payment.purpose } } });
        return { listing, payment, replay: false, balance: wallet ? price.balance.sub(price.amount) : price.balance };
      }, { maxWait: 10000, timeout: 30000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Vendor already has a pending or active listing for this placement');
      throw error;
    }
    if (result.payment.provider === PaymentProvider.PAYMONGO && result.listing.status === FeaturedListingStatus.PENDING)
      return this.checkout(userId, result.listing.id);
    return { listingId: result.listing.id, paymentId: result.payment.id, amount: result.payment.amount.toFixed(2),
      currency: 'PHP', status: result.listing.status, discountPercent: result.listing.discountPercent,
      walletBalance: result.balance.toFixed(2), idempotentReplay: result.replay };
  }

  async cancel(userId: string, id: string) {
    const vendor = await this.ownedVendor(userId);
    const result = await this.prisma.$transaction(async tx => {
      await lockFeaturedPricing(tx);
      const listing = await tx.featuredListing.findFirst({
        where: { id, vendorId: vendor.id },
        include: { payments: { select: { provider: true, providerPaymentId: true, checkoutUrl: true } } },
      });
      if (!listing) throw new NotFoundException('Featured listing not found');
      if (listing.status === FeaturedListingStatus.CANCELLED)
        return { listing, replay: true };
      if (listing.status !== FeaturedListingStatus.PENDING && listing.status !== FeaturedListingStatus.ACTIVE)
        throw new ConflictException('Only pending or active featured listings can be cancelled');
      if (listing.status === FeaturedListingStatus.PENDING && listing.payments.some(payment => payment.checkoutUrl === 'CREATING'))
        throw new ConflictException('Checkout creation is unresolved; reconcile it before cancelling');
      const changed = await tx.featuredListing.updateMany({
        where: { id, vendorId: vendor.id, status: listing.status },
        data: { status: FeaturedListingStatus.CANCELLED },
      });
      if (!changed.count) throw new ConflictException('Listing changed; reload before cancelling');
      const remaining = await tx.featuredListing.count({ where: {
        vendorId: vendor.id, placement: FeaturedListingPlacement.MARKETPLACE_HOME,
        status: { in: [FeaturedListingStatus.PENDING, FeaturedListingStatus.ACTIVE] },
      } });
      if (!remaining) await tx.featuredIntroClaim.deleteMany({ where: { vendorId: vendor.id, consumedAt: null } });
      // Keep pending payments pending: a late verified payment must reach the automatic refund path.
      // Paid payments and vendor ledger entries are retained; cancellation is not a refund.
      await tx.auditRecord.create({ data: {
        actorUserId: userId, actionType: 'FEATURED_LISTING_CANCELLED',
        entityType: 'FeaturedListing', entityId: id,
        beforeState: { status: listing.status },
        afterState: { status: FeaturedListingStatus.CANCELLED, source: 'VENDOR', automaticRefund: false },
      } });
      return { listing, replay: false };
    }, { maxWait: 10000, timeout: 30000 });
    // Provider I/O happens after committing cancellation, outside the database lock.
    if (result.listing.status === FeaturedListingStatus.PENDING) {
      for (const payment of result.listing.payments) {
        if (payment.provider !== PaymentProvider.PAYMONGO || !payment.providerPaymentId) continue;
        try {
          if (!(await this.paymongo.expireCheckoutSession(payment.providerPaymentId)))
            this.logger.warn(`Cancelled listing ${id}: checkout may already be paid; awaiting reconciliation`);
        } catch {
          this.logger.warn(`Cancelled listing ${id}: provider checkout expiry failed; awaiting reconciliation`);
        }
      }
    }
    return { listingId: id, status: FeaturedListingStatus.CANCELLED,
      idempotentReplay: result.replay, automaticRefund: false };
  }

  async checkout(userId: string, id: string) {
    const vendor = await this.ownedVendor(userId);
    if (vendor.status !== VendorStatus.ACTIVE) throw new ConflictException('Vendor is not active');
    const listing = await this.prisma.featuredListing.findFirst({
      where: { id, vendorId: vendor.id }, include: { plan: true, product: true, payments: true },
    });
    if (!listing) throw new NotFoundException('Featured listing not found');
    if (listing.status !== FeaturedListingStatus.PENDING || !listing.plan) {
      throw new ConflictException('Featured listing is not awaiting payment');
    }
    if (listing.productId && !listing.product?.isAvailable) {
      throw new ConflictException('Featured product is unavailable');
    }
    const payment = listing.payments[0];
    if (!payment || payment.status !== PaymentStatus.PENDING) {
      throw new ConflictException('Featured listing payment is not pending');
    }
    if (payment.checkoutUrl && payment.providerPaymentId) {
      return this.checkoutResponse(listing.id, payment.id, payment.amount, payment.checkoutUrl, true, vendor.id);
    }
    const reserved = await this.prisma.$transaction(async tx => {
      await lockFeaturedPricing(tx);
      const current = await tx.featuredListing.findUnique({ where: { id: listing.id } });
      if (!current || current.status !== FeaturedListingStatus.PENDING) throw new ConflictException('Listing is no longer awaiting payment');
      return tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING, providerPaymentId: null, checkoutUrl: null },
        data: { checkoutUrl: 'CREATING' },
      });
    }, { maxWait: 10000, timeout: 30000 });
    if (!reserved.count) throw new ConflictException('Checkout is being created');
    try {
      const result = await this.paymongo.createCheckoutSession({
        amount: payment.amount.mul(100).toNumber(),
        description: `QueueLess featured listing ${listing.id}`,
        referenceNumber: payment.id, featuredListingId: listing.id,
        itemName: listing.plan.name,
      });
      await this.prisma.payment.update({ where: { id: payment.id }, data: {
        providerPaymentId: result.checkoutSessionId, checkoutUrl: result.checkoutUrl,
      } });
      return this.checkoutResponse(listing.id, payment.id, payment.amount, result.checkoutUrl, false, vendor.id);
    } catch (error) {
      this.logger.warn(`Checkout creation uncertain for payment ${payment.id}; reservation retained for reconciliation`);
      throw error;
    }
  }

  private async checkoutResponse(listingId: string, paymentId: string, amount: Prisma.Decimal, checkoutUrl: string, idempotentReplay: boolean, vendorId: string) {
    return { listingId, paymentId, amount: amount.toFixed(2), currency: 'PHP',
      checkoutUrl, status: 'PENDING', idempotentReplay, walletBalance: (await this.sumLedgerBalance(vendorId)).toFixed(2) };
  }

  private async ownedVendor(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { ownerUserId: userId }, select: { id: true, status: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  private async expireVendor(vendorId: string) {
    await this.expireActive(vendorId);
  }

  private async expireActive(vendorId?: string) {
    const expired = await this.prisma.featuredListing.findMany({
      where: { ...(vendorId ? { vendorId } : {}),
        status: FeaturedListingStatus.ACTIVE, endDate: { lte: new Date() } },
      select: { id: true }, take: 100,
    });
    for (const listing of expired) {
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.featuredListing.updateMany({
          where: { id: listing.id, status: FeaturedListingStatus.ACTIVE,
            endDate: { lte: new Date() } },
          data: { status: FeaturedListingStatus.EXPIRED },
        });
        if (changed.count) await tx.auditRecord.create({ data: {
          actorUserId: null, actionType: 'FEATURED_LISTING_STATUS_UPDATED',
          entityType: 'FeaturedListing', entityId: listing.id,
          beforeState: { status: 'ACTIVE' }, afterState: { status: 'EXPIRED' },
        } });
      });
    }
  }

  @Interval(60_000)
  async expireListings() {
    await this.expireActive();
    const stale = await this.prisma.featuredListing.findMany({
      where: { status: FeaturedListingStatus.PENDING,
        createdAt: { lte: new Date(Date.now() - 30 * 60_000) } },
      select: { id: true, vendorId: true, payments: { select: { id: true, providerPaymentId: true, status: true, checkoutUrl: true } } },
      take: 50,
    });
    for (const listing of stale) {
      try {
        const payment = listing.payments[0];
        if (!payment || payment.status === PaymentStatus.SUCCEEDED || payment.checkoutUrl === 'CREATING') continue;
        if (payment.providerPaymentId &&
          !(await this.paymongo.expireCheckoutSession(payment.providerPaymentId))) continue;
        await this.prisma.$transaction(async (tx) => {
          await lockFeaturedPricing(tx);
          const changed = await tx.featuredListing.updateMany({
            where: { id: listing.id, status: FeaturedListingStatus.PENDING },
            data: { status: FeaturedListingStatus.CANCELLED },
          });
          if (changed.count) {
            const remaining = await tx.featuredListing.count({ where: { vendorId: listing.vendorId,
              placement: FeaturedListingPlacement.MARKETPLACE_HOME, status: { in: ['PENDING', 'ACTIVE'] } } });
            if (!remaining) await tx.featuredIntroClaim.deleteMany({ where: { vendorId: listing.vendorId, consumedAt: null } });
            const failed = await tx.payment.findMany({
              where: { featuredListingId: listing.id, status: PaymentStatus.PENDING },
              select: { id: true },
            });
            await tx.auditRecord.create({ data: {
              actorUserId: null, actionType: 'FEATURED_LISTING_STATUS_UPDATED',
              entityType: 'FeaturedListing', entityId: listing.id,
              beforeState: { status: 'PENDING' }, afterState: { status: 'CANCELLED' },
            } });
            for (const payment of failed) {
              const paymentChanged = await tx.payment.updateMany({
                where: { id: payment.id, status: PaymentStatus.PENDING },
                data: { status: PaymentStatus.FAILED },
              });
              if (paymentChanged.count) await tx.auditRecord.create({ data: {
                actorUserId: null, actionType: 'PAYMENT_STATUS_UPDATED',
                entityType: 'Payment', entityId: payment.id,
                beforeState: { status: 'PENDING' }, afterState: { status: 'FAILED', source: 'CHECKOUT_EXPIRED' },
              } });
            }
          }
        });
      } catch (error) {
        this.logger.warn(`Could not expire featured listing ${listing.id}: ${String(error)}`);
      }
    }
  }
}
