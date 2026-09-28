import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RefundInitiator, RefundStatus, PaymentStatus } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymongoService } from '../payments/paymongo.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class PasabuyWorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymongo: PaymongoService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async cancel(userId: string, requestId: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('Cancellation reason is required');
    const request = await this.prisma.pasabuyRequest.findUnique({
      where: { id: requestId },
      select: {
        requesterUserId: true, fulfillerUserId: true, status: true,
        paymentStatus: true, relatedOrderId: true,
        payment: { select: { id: true, status: true, amount: true,
          providerPaymentId: true } },
      },
    });
    if (!request || (request.requesterUserId !== userId && request.fulfillerUserId !== userId)) {
      throw new NotFoundException('Pasabuy request not found');
    }
    if (!['PENDING', 'AWAITING_PAYMENT', 'PAID', 'PICKUP_READY'].includes(request.status)) {
      throw new ConflictException('This Pasabuy request cannot be cancelled');
    }
    if (request.status === 'PICKUP_READY') {
      throw new ConflictException('Pickup was verified; report a problem instead');
    }
    const paid = request.status === 'PAID' && request.paymentStatus === 'PAID';
    if (paid && request.payment?.status !== PaymentStatus.SUCCEEDED) {
      throw new ConflictException('Fee payment is not confirmed');
    }
    if (!paid && request.payment?.providerPaymentId &&
      !(await this.paymongo.expireCheckoutSession(request.payment.providerPaymentId))) {
      throw new ConflictException('Checkout may have been paid; wait for confirmation');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.pasabuyRequest.updateMany({
        where: {
          id: requestId, status: request.status, paymentStatus: request.paymentStatus,
          requesterUserId: request.requesterUserId, fulfillerUserId: request.fulfillerUserId,
        },
        data: { status: 'CANCELLED', cancelledAt: new Date(),
          ...(!paid ? { paymentStatus: 'NOT_CHARGED' as const } : {}) },
      });
      if (changed.count !== 1) throw new ConflictException('Request changed; please retry');
      if (request.relatedOrderId) {
        await tx.order.update({ where: { id: request.relatedOrderId },
          data: { isPasabuyRequest: false } });
      }
      if (!paid && request.payment) {
        const failed = await tx.payment.updateMany({
          where: { id: request.payment.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.FAILED },
        });
        if (failed.count) await tx.auditRecord.create({ data: {
          actorUserId: userId, actionType: 'PAYMENT_STATUS_UPDATED',
          entityType: 'Payment', entityId: request.payment.id,
          beforeState: { status: PaymentStatus.PENDING },
          afterState: { status: PaymentStatus.FAILED, reason: 'PASABUY_CANCELLED' },
        } });
      }
      if (paid && request.payment) {
        const refund = await tx.refund.create({ data: {
          paymentId: request.payment.id, amount: request.payment.amount,
          status: RefundStatus.REQUESTED,
          initiatedBy: userId === request.requesterUserId
            ? RefundInitiator.BUYER : RefundInitiator.SYSTEM,
          requestedByUserId: userId,
          reason: `Pasabuy cancellation: ${reason.trim()}`,
        } });
        await tx.auditRecord.create({ data: {
          actorUserId: userId, actionType: 'REFUND_REQUESTED',
          entityType: 'Refund', entityId: refund.id,
          afterState: { status: refund.status, paymentId: refund.paymentId,
            amount: refund.amount.toFixed(2) },
        } });
      }
      await tx.pasabuyStatusHistory.create({ data: {
        pasabuyRequestId: requestId, status: 'CANCELLED', changedByUserId: userId,
        note: reason.trim(),
      } });
      await tx.auditRecord.create({ data: {
        actorUserId: userId, actionType: 'PASABUY_STATUS_UPDATED',
        entityType: 'PasabuyRequest', entityId: requestId,
        beforeState: { status: request.status, paymentStatus: request.paymentStatus },
        afterState: { status: 'CANCELLED', paymentStatus: paid ? 'PAID' : 'NOT_CHARGED' },
      } });
      return tx.pasabuyRequest.findUniqueOrThrow({ where: { id: requestId },
        select: { id: true, status: true, paymentStatus: true, updatedAt: true } });
    });
    await this.realtime.emitPasabuyStatusUpdated(requestId);
    return result;
  }

  async report(userId: string, requestId: string, description: string) {
    if (!description?.trim()) throw new BadRequestException('Report description is required');
    const report = await this.prisma.$transaction(async (tx) => {
      const request = await tx.pasabuyRequest.findUnique({ where: { id: requestId },
        select: { requesterUserId: true, fulfillerUserId: true, status: true } });
      if (!request ||
        (request.requesterUserId !== userId && request.fulfillerUserId !== userId)) {
        throw new NotFoundException('Pasabuy request not found');
      }
      if (!['PAID', 'PICKUP_READY', 'PICKED_UP', 'DELIVERED', 'COMPLETED'].includes(request.status)) {
        throw new ConflictException('This Pasabuy request cannot be disputed');
      }
      const changed = await tx.pasabuyRequest.updateMany({
        where: { id: requestId, status: request.status },
        data: { status: 'DISPUTED' },
      });
      if (changed.count !== 1) throw new ConflictException('Request changed; please retry');
      const created = await tx.report.create({ data: {
        reporterUserId: userId, reportedPasabuyId: requestId,
        category: 'PASABUY_PROBLEM', description: description.trim(),
      }, select: { id: true, status: true, createdAt: true } });
      await tx.pasabuyStatusHistory.create({ data: {
        pasabuyRequestId: requestId, status: 'DISPUTED', changedByUserId: userId,
        note: 'Participant reported a problem',
      } });
      await tx.auditRecord.create({ data: {
        actorUserId: userId, actionType: 'REPORT_CREATED',
        entityType: 'Report', entityId: created.id,
        afterState: { status: created.status, targetType: 'PASABUY', targetId: requestId },
      } });
      await tx.auditRecord.create({ data: {
        actorUserId: userId, actionType: 'PASABUY_STATUS_UPDATED',
        entityType: 'PasabuyRequest', entityId: requestId,
        beforeState: { status: request.status }, afterState: { status: 'DISPUTED' },
      } });
      return created;
    });
    await this.realtime.emitPasabuyStatusUpdated(requestId);
    return report;
  }

  async vendorOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, vendor: { ownerUserId: userId } },
      select: { id: true, status: true, isPreorder: true, vendor: {
        select: { pickupLocation: true } }, pasabuyRequests: {
        orderBy: { createdAt: 'desc' }, take: 1,
        select: { id: true, status: true, paymentStatus: true,
          pickupCode: true, pickupVerifiedAt: true,
          fulfiller: { select: { id: true, fullName: true,
            pasabuyProfile: { select: { verifiedAt: true } } } } },
      } },
    });
    if (!order) throw new NotFoundException('Order not found');
    const request = order.pasabuyRequests[0];
    return { orderId: order.id, orderStatus: order.status,
      isPreorder: order.isPreorder, pickupLocation: order.vendor.pickupLocation,
      pasabuy: request ? {
        id: request.id, status: request.status, paymentStatus: request.paymentStatus,
        pickupCode: request.paymentStatus === 'PAID' &&
          ['PAID', 'PICKUP_READY'].includes(request.status) ? request.pickupCode : null,
        pickupVerifiedAt: request.pickupVerifiedAt,
        deliverer: request.fulfiller &&
          !['CANCELLED', 'EXPIRED', 'PAYMENT_EXPIRED'].includes(request.status)
          ? { id: request.fulfiller.id,
          fullName: request.fulfiller.fullName,
          studentIdVerified: request.fulfiller.pasabuyProfile?.verifiedAt != null } : null,
      } : null };
  }

  async verifyPickup(userId: string, orderId: string, code: string) {
    const request = await this.prisma.pasabuyRequest.findFirst({
      where: { relatedOrderId: orderId, relatedOrder: { vendor: { ownerUserId: userId } },
        status: 'PAID', paymentStatus: 'PAID' },
      select: { id: true, pickupCode: true, pickupVerificationAttempts: true,
        relatedOrder: { select: { status: true } } },
    });
    if (!request) throw new NotFoundException('Paid Pasabuy pickup not found');
    if (request.relatedOrder?.status !== 'READY_FOR_PICKUP') {
      throw new ConflictException('The food order is not ready for pickup');
    }
    if (request.pickupVerificationAttempts >= 5) {
      throw new ForbiddenException('Pickup verification limit reached');
    }
    const valid = request.pickupCode !== null && request.pickupCode.length === code.length &&
      timingSafeEqual(Buffer.from(request.pickupCode), Buffer.from(code));
    if (!valid) {
      await this.prisma.pasabuyRequest.updateMany({
        where: { id: request.id, status: 'PAID', pickupVerificationAttempts: { lt: 5 } },
        data: { pickupVerificationAttempts: { increment: 1 } },
      });
      throw new ForbiddenException('Invalid pickup code');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.pasabuyRequest.updateMany({
        where: { id: request.id, status: 'PAID', paymentStatus: 'PAID',
          pickupCode: code, pickupVerifiedAt: null,
          pickupVerificationAttempts: { lt: 5 },
          relatedOrder: { status: 'READY_FOR_PICKUP' } },
        data: { status: 'PICKUP_READY', pickupVerifiedAt: new Date() },
      });
      if (!changed.count) throw new ConflictException('Pickup verification is no longer available');
      await tx.pasabuyStatusHistory.create({ data: {
        pasabuyRequestId: request.id, status: 'PICKUP_READY', changedByUserId: userId,
        note: 'Vendor verified the pickup code',
      } });
      await tx.auditRecord.create({ data: {
        actorUserId: userId, actionType: 'PASABUY_STATUS_UPDATED',
        entityType: 'PasabuyRequest', entityId: request.id,
        beforeState: { status: 'PAID' }, afterState: { status: 'PICKUP_READY' },
      } });
      return tx.pasabuyRequest.findUniqueOrThrow({ where: { id: request.id },
        select: { id: true, status: true, updatedAt: true } });
    });
    await this.realtime.emitPasabuyStatusUpdated(request.id);
    return updated;
  }
}
