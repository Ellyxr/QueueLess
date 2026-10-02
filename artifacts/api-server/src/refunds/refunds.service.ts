import { WalletService } from '../wallet/wallet.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CancellationReason,
  OrderStatus,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
  RefundInitiator,
  RefundStatus,
} from '@prisma/client';
import { PaymongoService } from '../payments/paymongo.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateRefundDto,
  RefundStatusQueryDto,
  UpdateRefundStatusDto,
} from './dto/refund.dto';
import {
  AUTO_REFUND_CATEGORIES,
  RequestOrderRefundDto,
} from './dto/request-order-refund.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { UserRole } from '../auth/roles';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TWO_MINUTES_MS = 2 * 60 * 1000;
const REFUNDABLE_STATUSES: RefundStatus[] = [
  RefundStatus.REQUESTED,
  RefundStatus.APPROVED,
  RefundStatus.PROCESSED,
];

@Injectable()
export class RefundsService {
  constructor(
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
    private readonly paymongoService: PaymongoService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}
  async createRefund(
    userId: string,
    dto: CreateRefundDto,
    roles: UserRole[],
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: {
        id: dto.paymentId,
      },
      select: {
        id: true,
        payerUserId: true,
        amount: true,
        currency: true,
        status: true,
        purpose: true,
        pasabuyRequestId: true,
        pasabuyRequest: { select: { status: true } },
        paymentShares: {
          select: {
            orderId: true,
            order: {
              select: {
                vendor: { select: { ownerUserId: true } },
              },
            },
          },
        },
      },
    });

    const isPayer = payment?.payerUserId === userId;
    const isVendorOwner = Boolean(
      payment &&
      roles.includes('VENDOR_OWNER') &&
      payment.paymentShares.length > 0 &&
      payment.paymentShares.every(
        (share) => share.order.vendor.ownerUserId === userId,
      ),
    );

    if (!payment || (!isPayer && !isVendorOwner)) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.purpose === PaymentPurpose.WALLET_TOPUP) {
      throw new BadRequestException('Wallet cash-ins cannot be refunded through food payment refunds');
    }

    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new ConflictException(
        'Only successful payments can be refunded',
      );
    }

    if (payment.purpose === PaymentPurpose.PASABUY && payment.pasabuyRequestId) {
      if (!isPayer) throw new NotFoundException('Payment not found');
      if (payment.pasabuyRequest?.status !== 'CANCELLED' &&
        payment.pasabuyRequest?.status !== 'DISPUTED') {
        throw new ConflictException('Pasabuy fee refund requires cancellation or dispute');
      }
      if (dto.orderItemId) {
        throw new BadRequestException('Pasabuy fee refunds cannot target a food item');
      }
      const amount = new Prisma.Decimal(dto.amount);
      const remaining = await this.resolveRefundableAmount(payment, null);
      if (amount.greaterThan(remaining)) {
        throw new BadRequestException('Refund amount exceeds the remaining Pasabuy fee');
      }
      const refund = await this.prisma.$transaction(async (tx) => {
        const created = await tx.refund.create({
          data: { paymentId: payment.id, amount,
            reason: dto.reason?.trim() || null, status: RefundStatus.REQUESTED,
            initiatedBy: RefundInitiator.BUYER, requestedByUserId: userId },
        });
        await tx.auditRecord.create({ data: {
          actorUserId: userId, actionType: 'REFUND_REQUESTED',
          entityType: 'Refund', entityId: created.id,
          afterState: { status: created.status, paymentId: payment.id,
            amount: created.amount.toFixed(2) },
        } });
        return created;
      });
      return { ...refund, amount: refund.amount.toFixed(2), currency: payment.currency };
    }

    if (payment.paymentShares.length === 0) {
      throw new BadRequestException(
        'Payment is not linked to an order',
      );
    }

    const orderIds = [
      ...new Set(
        payment.paymentShares.map(
          (share) => share.orderId,
        ),
      ),
    ];

    if (orderIds.length !== 1) {
      throw new BadRequestException(
        'Payment must belong to exactly one order',
      );
    }

    const orderId = orderIds[0];

    let orderItem:
      | {
          id: string;
          lineSubtotal: Prisma.Decimal;
        }
      | null = null;

    if (dto.orderItemId) {
      orderItem =
        await this.prisma.orderItem.findFirst({
          where: {
            id: dto.orderItemId,
            orderId,
            removedAt: null,
          },
          select: {
            id: true,
            lineSubtotal: true,
          },
        });

      if (!orderItem) {
        throw new BadRequestException(
          'Order item does not belong to this payment order',
        );
      }
    }

    const requestedAmount = new Prisma.Decimal(
      dto.amount,
    );

    const remaining = await this.resolveRefundableAmount(
      payment,
      orderItem,
    );

    if (remaining.lessThan(1)) {
      throw new ConflictException(
        'Remaining refundable amount is below PHP 1.00',
      );
    }

    if (requestedAmount.greaterThan(remaining)) {
      throw new BadRequestException(
        `Refund amount exceeds the remaining refundable amount of ${remaining.toFixed(2)}`,
      );
    }

    const reason = dto.reason?.trim() || null;

    const refund =
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.refund.create({
        data: {
          paymentId: payment.id,
          orderId,
          orderItemId: orderItem?.id ?? null,
          amount: requestedAmount,
          reason,
          status: RefundStatus.REQUESTED,
          initiatedBy: isPayer
            ? RefundInitiator.BUYER
            : RefundInitiator.VENDOR,
          requestedByUserId: userId,
        },
        select: {
          id: true,
          paymentId: true,
          orderItemId: true,
          amount: true,
          reason: true,
          status: true,
          createdAt: true,
        },
        });
        await tx.auditRecord.create({ data: {
          actorUserId: userId, actionType: 'REFUND_REQUESTED',
          entityType: 'Refund', entityId: created.id,
          afterState: { status: created.status, paymentId: payment.id,
            orderId, amount: created.amount.toFixed(2) },
        } });
        return created;
      });

    return {
      ...refund,
      orderId,
      amount: refund.amount.toFixed(2),
      currency: payment.currency,
    };
  }

  async listRefunds(
    query: RefundStatusQueryDto,
  ) {
    const refunds =
      await this.prisma.refund.findMany({
        where: query.status
          ? {
              status: query.status,
            }
          : undefined,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          amount: true,
          reason: true,
          category: true,
          status: true,
          initiatedBy: true,
          createdAt: true,
          processedAt: true,
          providerRefundId: true,
          requestedBy: {
            select: {
              fullName: true,
              email: true,
              dataAccessGrantedAt: true,
            },
          },
          payment: {
            select: {
              id: true,
              currency: true,
              pasabuyRequestId: true,
              pasabuyRequest: {
                select: {
                  relatedOrderId: true,
                  relatedOrder: {
                    select: {
                      createdAt: true,
                      vendor: { select: { businessName: true } },
                    },
                  },
                },
              },
              paymentShares: {
                select: {
                  orderId: true,
                  order: {
                    select: {
                      createdAt: true,
                      groupOrderId: true,
                      vendor: {
                        select: {
                          businessName: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

    return refunds.map((refund) => {
      const paymentShare =
        refund.payment.paymentShares[0];

      return {
        id: refund.id,
        paymentId: refund.payment.id,
        pasabuyRequestId: refund.payment.pasabuyRequestId,
        orderId:
          paymentShare?.orderId ?? refund.payment.pasabuyRequest?.relatedOrderId ?? null,
        requesterName:
          refund.requestedBy.fullName,
        requesterEmail:
          refund.requestedBy
            .dataAccessGrantedAt !== null
            ? refund.requestedBy.email
            : null,
        vendorName:
          paymentShare?.order.vendor
            .businessName ?? refund.payment.pasabuyRequest?.relatedOrder?.vendor.businessName ?? null,
        orderedAt:
          paymentShare?.order.createdAt ?? refund.payment.pasabuyRequest?.relatedOrder?.createdAt ?? null,
        isGroupOrder:
          paymentShare?.order.groupOrderId != null,
        amount: Number(
          refund.amount.toFixed(2),
        ),
        currency: refund.payment.currency,
        reason: refund.reason ?? '',
        category: refund.category,
        initiatedBy: refund.initiatedBy,
        status: refund.status,
        createdAt: refund.createdAt,
        processedAt: refund.processedAt,
        providerRefundId:
          refund.providerRefundId,
      };
    });
  }

  async updateRefundStatus(
    refundId: string,
    dto: UpdateRefundStatusDto,
    actorUserId: string,
  ) {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      select: {
        id: true,
        paymentId: true,
        amount: true,
        status: true,
      },
    });

    if (!refund) {
      throw new NotFoundException('Refund request not found');
    }

    if (dto.status === RefundStatus.PROCESSED) {
      return this.processRefund(refundId, actorUserId);
    }

    const allowedTransitions: Record<
      RefundStatus,
      RefundStatus[]
    > = {
      REQUESTED: [
        RefundStatus.APPROVED,
        RefundStatus.DENIED,
      ],
      APPROVED: [],
      PROCESSED: [],
      DENIED: [],
    };

    if (
      !allowedTransitions[refund.status].includes(dto.status)
    ) {
      throw new ConflictException(
        `Refund cannot transition from ${refund.status} to ${dto.status}`,
      );
    }

    const updatedRefund = await this.prisma.$transaction(
      async (tx) => {
        const result = await tx.refund.updateMany({
          where: { id: refund.id, status: refund.status },
          data: { status: dto.status },
        });
        if (result.count !== 1) {
          throw new ConflictException('Refund status changed; please retry');
        }
        const updated = await tx.refund.findUniqueOrThrow({
          where: { id: refund.id },
          select: {
            id: true,
            paymentId: true,
            orderItemId: true,
            amount: true,
            reason: true,
            status: true,
            providerRefundId: true,
            processedAt: true,
            createdAt: true,
          },
        });

        await tx.auditRecord.create({
          data: {
            actorUserId,
            actionType: 'REFUND_STATUS_UPDATED',
            entityType: 'Refund',
            entityId: refund.id,
            beforeState: {
              status: refund.status,
            },
            afterState: {
              status: updated.status,
            },
          },
        });

        return updated;
      },
    );

    return {
      ...updatedRefund,
      amount: updatedRefund.amount.toFixed(2),
    };
  }

  async markPasabuyRefunded(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { purpose: true, pasabuyRequestId: true, amount: true,
        refunds: { where: { status: RefundStatus.PROCESSED },
          select: { amount: true } } },
    });
    if (payment?.purpose !== PaymentPurpose.PASABUY || !payment.pasabuyRequestId) return;
    const refunded = payment.refunds.reduce((total, refund) => total.add(refund.amount),
      new Prisma.Decimal(0));
    if (refunded.lessThan(payment.amount)) return;
    const updated = await this.prisma.pasabuyRequest.updateMany({
      where: { id: payment.pasabuyRequestId, paymentStatus: 'PAID' },
      data: { paymentStatus: 'REFUNDED' },
    });
    if (updated.count) {
      await this.realtimeGateway.emitPasabuyStatusUpdated(payment.pasabuyRequestId);
    }
  }

  async processRefund(
    refundId: string,
    actorUserId: string | null,
  ) {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      select: {
        id: true,
        paymentId: true,
        orderItemId: true,
        amount: true,
        reason: true,
        status: true,
        providerRefundId: true,
        processedAt: true,
        payment: {
          select: {
            status: true,
            provider: true,
            providerPaymentResourceId: true,
          },
        },
      },
    });

    if (!refund) {
      throw new NotFoundException('Refund request not found');
    }

    if (
      refund.status === RefundStatus.PROCESSED &&
      refund.providerRefundId
    ) {
      return {
        id: refund.id,
        paymentId: refund.paymentId,
        amount: refund.amount.toFixed(2),
        status: refund.status,
        providerRefundId: refund.providerRefundId,
        processedAt: refund.processedAt,
        idempotentReplay: true,
      };
    }

    if (
      refund.status === RefundStatus.APPROVED &&
      refund.providerRefundId
    ) {
      throw new ConflictException(
        'Refund has already been submitted to PayMongo and is awaiting confirmation',
      );
    }

    if (refund.status !== RefundStatus.APPROVED) {
      throw new ConflictException(
        'Only approved refunds can be processed',
      );
    }

    if (refund.payment.status !== PaymentStatus.SUCCEEDED) {
      throw new ConflictException(
        'Only successful payments can be refunded',
      );
    }

    if (refund.payment.provider === 'WALLET') {
      return this.wallet.refund(refund.id, actorUserId);
    }

    if (!refund.payment.providerPaymentResourceId) {
      throw new ConflictException(
        'PayMongo payment resource ID is unavailable for this payment',
      );
    }

    if (actorUserId === null) {
      const lastFailure = await this.prisma.auditRecord.findFirst({
        where: { entityType: 'Refund', entityId: refund.id,
          actionType: 'REFUND_PROCESSING_FAILED' },
        orderBy: { createdAt: 'desc' }, select: { afterState: true },
      });
      const state = lastFailure?.afterState;
      if (state && typeof state === 'object' && !Array.isArray(state) &&
          state.failureCode === 'REFUND_METHOD_REJECTED' && state.requiresReview === true) {
        return { id: refund.id, paymentId: refund.paymentId,
          amount: refund.amount.toFixed(2), status: refund.status,
          processedAt: null, requiresReview: true, idempotentReplay: true };
      }
    }

    const amountInCentavos = Number(
      refund.amount.mul(100).toFixed(0),
    );

    let providerRefund: Awaited<ReturnType<PaymongoService['createRefund']>>;
    try {
      providerRefund = await this.paymongoService.createRefund({
        paymentResourceId: refund.payment.providerPaymentResourceId,
        amount: amountInCentavos,
        idempotencyKey: refund.id,
        reason: 'others',
        notes: refund.reason ?? undefined,
      });
    } catch (error) {
      // Preserve the approved reservation and the same provider idempotency key.
      // Do not store provider payloads, credentials, or customer details in audit.
      const methodRejected = error instanceof Error &&
        /refunds are not allowed for payments with source type/i.test(error.message);
      await this.prisma.auditRecord.create({ data: {
        actorUserId,
        actionType: 'REFUND_PROCESSING_FAILED',
        entityType: 'Refund', entityId: refund.id,
        afterState: {
          status: RefundStatus.APPROVED, provider: 'PAYMONGO',
          failureCode: methodRejected ? 'REFUND_METHOD_REJECTED' : 'PROVIDER_REFUND_FAILED',
          requiresReview: methodRejected,
        },
      } });
      // A permanent method rejection has a durable review record. Acknowledge
      // automatic handling without claiming the refund succeeded. Admin retries
      // remain explicit; uncertain/network failures still propagate for retry.
      if (methodRejected && actorUserId === null) {
        return { id: refund.id, paymentId: refund.paymentId,
          amount: refund.amount.toFixed(2), status: refund.status,
          processedAt: null, requiresReview: true, idempotentReplay: false };
      }
      throw error;
    }

    const providerStatus = providerRefund.status.toLowerCase();

    if (
      providerStatus !== 'succeeded' &&
      providerStatus !== 'pending'
    ) {
      throw new ConflictException(
        `PayMongo refund returned unsupported status: ${providerRefund.status}`,
      );
    }

    if (providerStatus === 'pending') {
      await this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          providerRefundId: providerRefund.refundId,
        },
      });

      return {
        id: refund.id,
        paymentId: refund.paymentId,
        amount: refund.amount.toFixed(2),
        status: RefundStatus.APPROVED,
        providerRefundId: providerRefund.refundId,
        processedAt: null,
        providerStatus: 'pending',
        idempotentReplay: false,
      };
    }

    const processedAt = new Date();

    const updatedRefund = await this.prisma.$transaction(
      async (tx) => {
        const updateResult = await tx.refund.updateMany({
          where: {
            id: refund.id,
            status: RefundStatus.APPROVED,
            providerRefundId: null,
          },
          data: {
            status: RefundStatus.PROCESSED,
            providerRefundId: providerRefund.refundId,
            processedAt,
          },
        });

        if (updateResult.count !== 1) {
          throw new ConflictException(
            'Refund has already been processed or changed',
          );
        }

        const updated = await tx.refund.findUniqueOrThrow({
          where: { id: refund.id },
          select: {
            id: true,
            paymentId: true,
            orderItemId: true,
            amount: true,
            reason: true,
            status: true,
            providerRefundId: true,
            processedAt: true,
            createdAt: true,
          },
        });

        await tx.auditRecord.create({
          data: {
            actorUserId,
            actionType: 'REFUND_PROCESSED',
            entityType: 'Refund',
            entityId: refund.id,
            beforeState: {
              status: RefundStatus.APPROVED,
            },
            afterState: {
              status: RefundStatus.PROCESSED,
              providerRefundId: providerRefund.refundId,
            },
          },
        });

        return updated;
      },
    );

    await this.markPasabuyRefunded(refund.paymentId);

    return {
      ...updatedRefund,
      amount: updatedRefund.amount.toFixed(2),
      idempotentReplay: false,
    };
  }

  /**
   * Buyer-facing entry point from an order. Auto-eligible categories
   * (vendor timeout rules) are validated and, if valid, refunded and the
   * order cancelled immediately with no admin involved. Anything else
   * becomes a REQUESTED refund for admin review.
   */
  async requestOrderRefund(
    userId: string,
    orderId: string,
    dto: RequestOrderRefundDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        customerId: true,
        status: true,
        paidAt: true,
        buyerContactPingAt: true,
        updatedAt: true,
      },
    });

    if (!order || order.customerId !== userId) {
      throw new NotFoundException('Order not found');
    }

    const isAutoCategory = (
      AUTO_REFUND_CATEGORIES as readonly string[]
    ).includes(dto.category);

    if (!isAutoCategory) {
      const refund = await this.createDisputeRefund(userId, orderId, dto);
      return { outcome: 'PENDING_REVIEW' as const, refund };
    }

    this.assertAutoEligibility(order, dto.category);

   const cancelledOrder = await this.prisma.$transaction(
    async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason:
            CancellationReason.AUTO_REFUND_TIMEOUT,
        },
        select: {
          id: true,
          customerId: true,
          status: true,
          updatedAt: true,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: OrderStatus.CANCELLED,
          changedByUserId: null,
          note: `Auto-cancelled: ${dto.category}`,
        },
      });

      return updatedOrder;
    },
  );

  await this.realtimeGateway.emitOrderStatusUpdated(
    cancelledOrder.customerId,
    {
      orderId: cancelledOrder.id,
      status: cancelledOrder.status,
      updatedAt: cancelledOrder.updatedAt,
    },
  );

    const refunds = await this.autoRefundOrderPayments(
      orderId,
      dto.category,
      dto.description?.trim() || null,
    );

    return { outcome: 'AUTO_REFUNDED' as const, refunds };
  }

  private assertAutoEligibility(
    order: {
      status: string;
      paidAt: Date | null;
      buyerContactPingAt: Date | null;
      updatedAt: Date;
    },
    category: string,
  ): void {
    const now = Date.now();

    if (category === 'VENDOR_NOT_ACCEPTED') {
      if (order.status !== OrderStatus.PAID) {
        throw new BadRequestException(
          'This order is not currently waiting on the vendor to accept it.',
        );
      }

      if (!order.paidAt) {
        throw new BadRequestException(
          'This order has no payment confirmation yet.',
        );
      }

      const remainingMs =
        FIVE_MINUTES_MS - (now - order.paidAt.getTime());

      if (remainingMs > 0) {
        throw new BadRequestException(
          `You can request this refund once the vendor has had 5 minutes to accept your order (about ${Math.ceil(remainingMs / 1000)}s left).`,
        );
      }

      return;
    }

    // VENDOR_UNRESPONSIVE
    if (
      order.status === OrderStatus.COMPLETED ||
      order.status === OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'This order has already been resolved.',
      );
    }

    if (!order.buyerContactPingAt) {
      throw new BadRequestException(
        'Please contact the vendor first before requesting this refund.',
      );
    }

    if (order.updatedAt > order.buyerContactPingAt) {
      throw new BadRequestException(
        'The order has progressed since you contacted the vendor â€” this refund is no longer applicable.',
      );
    }

    const remainingMs =
      TWO_MINUTES_MS - (now - order.buyerContactPingAt.getTime());

    if (remainingMs > 0) {
      throw new BadRequestException(
        `Please give the vendor a bit more time to respond (about ${Math.ceil(remainingMs / 1000)}s left).`,
      );
    }
  }

  private async createDisputeRefund(
    userId: string,
    orderId: string,
    dto: RequestOrderRefundDto,
  ) {
    const paymentShare = await this.prisma.paymentShare.findFirst({
      where: { orderId, payerUserId: userId },
      include: { payment: true },
    });

    if (
      !paymentShare?.payment ||
      paymentShare.payment.status !== PaymentStatus.SUCCEEDED
    ) {
      throw new BadRequestException(
        'No successful payment was found for this order.',
      );
    }

    const payment = paymentShare.payment;

    let orderItem: { id: string; lineSubtotal: Prisma.Decimal } | null = null;

    if (dto.orderItemId) {
      orderItem = await this.prisma.orderItem.findFirst({
        where: { id: dto.orderItemId, orderId, removedAt: null },
        select: { id: true, lineSubtotal: true },
      });

      if (!orderItem) {
        throw new BadRequestException(
          'Order item not found on this order.',
        );
      }
    }

    const remaining = await this.resolveRefundableAmount(
      payment,
      orderItem,
    );

    if (remaining.lessThan(1)) {
      throw new ConflictException(
        'Remaining refundable amount is below PHP 1.00',
      );
    }

    const refund = await this.prisma.$transaction(async (tx) => {
      const created = await tx.refund.create({
        data: {
          paymentId: payment.id, orderId, orderItemId: orderItem?.id ?? null,
          amount: remaining, reason: dto.description?.trim() || null,
          category: dto.category, status: RefundStatus.REQUESTED,
          initiatedBy: RefundInitiator.BUYER, requestedByUserId: userId,
        },
        select: {
          id: true, paymentId: true, orderId: true, orderItemId: true,
          amount: true, reason: true, category: true, status: true, createdAt: true,
        },
      });
      await tx.auditRecord.create({ data: {
        actorUserId: userId, actionType: 'REFUND_REQUESTED',
        entityType: 'Refund', entityId: created.id,
        afterState: { status: created.status, paymentId: payment.id,
          orderId, amount: created.amount.toFixed(2) },
      } });
      return created;
    });

    return {
      ...refund,
      amount: refund.amount.toFixed(2),
      currency: payment.currency,
    };
  }

  /**
   * Refunds every SUCCEEDED payment linked to an order's payment shares.
   * Used by vendor-cancel, the 5-min/2-min timeout rules, and their cron
   * sweep. No-op per payment if nothing is left to refund.
   */
  async autoRefundOrderPayments(
    orderId: string,
    category: string,
    note: string | null,
  ) {
    const shares = await this.prisma.paymentShare.findMany({
      where: { orderId },
      include: { payment: true },
    });

    const paymentIds = [
      ...new Set(
        shares
          .filter(
            (share) =>
              share.payment &&
              share.payment.status === PaymentStatus.SUCCEEDED,
          )
          .map((share) => share.payment!.id),
      ),
    ];

    const refunds = [];

    for (const paymentId of paymentIds) {
      const refund = await this.autoRefundPayment(
        paymentId,
        category,
        note,
        orderId,
      );

      if (refund) {
        refunds.push(refund);
      }
    }

    return refunds;
  }

  /**
   * Single-payment automatic refund, used by the order-level sweep above
   * and directly by the payment webhook for anomalies with no valid order
   * (orphaned/duplicate payments).
   */
  async retryPendingAutoRefunds(paymentId: string) {
    const pending = await this.prisma.refund.findMany({
      where: { paymentId, initiatedBy: RefundInitiator.SYSTEM,
        status: RefundStatus.APPROVED, providerRefundId: null },
      select: { id: true }, orderBy: { createdAt: 'asc' },
    });
    // Submitted refunds await provider confirmation; completed refunds are skipped.
    let requiresReview = false;
    for (const refund of pending) {
      const result = await this.processRefund(refund.id, null);
      if ('requiresReview' in result && result.requiresReview) requiresReview = true;
    }
    return { requiresReview };
  }

  async autoRefundPayment(
    paymentId: string,
    category: string,
    note: string | null,
    orderId: string | null = null,
  ) {
    const refund = await this.prisma.$transaction(async (tx) => {
      // Serialize automatic refund reservations for the same payment.
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { id: true, amount: true, payerUserId: true, status: true },
      });
      if (!payment || payment.status !== PaymentStatus.SUCCEEDED) return null;

      const existing = await tx.refund.findFirst({
        where: { paymentId, initiatedBy: RefundInitiator.SYSTEM,
          status: RefundStatus.APPROVED },
        select: { id: true, paymentId: true, amount: true, status: true,
          providerRefundId: true }, orderBy: { createdAt: 'asc' },
      });
      if (existing) return existing;

      const reserved = await tx.refund.aggregate({
        where: { paymentId, status: { in: REFUNDABLE_STATUSES } },
        _sum: { amount: true },
      });
      const remaining = payment.amount.minus(reserved._sum.amount ?? new Prisma.Decimal(0));
      if (remaining.lessThanOrEqualTo(0)) return null;
      if (remaining.lessThan(1)) {
        throw new ConflictException('Remaining refundable amount is below PHP 1.00');
      }
      const created = await tx.refund.create({
        data: {
          paymentId: payment.id, orderId, amount: remaining, reason: note,
          category, status: RefundStatus.APPROVED,
          initiatedBy: RefundInitiator.SYSTEM, requestedByUserId: payment.payerUserId,
        },
        select: { id: true, paymentId: true, amount: true, status: true,
          providerRefundId: true },
      });
      await tx.auditRecord.create({ data: {
        actorUserId: null, actionType: 'REFUND_REQUESTED',
        entityType: 'Refund', entityId: created.id,
        afterState: { status: created.status, paymentId: payment.id,
          orderId, amount: created.amount.toFixed(2), category },
      } });
      return created;
    }, { maxWait: 10000, timeout: 30000 });

    if (!refund) return null;
    if (refund.providerRefundId) {
      return { ...refund, amount: refund.amount.toFixed(2), idempotentReplay: true };
    }
    return this.processRefund(refund.id, null);
  }

  private async resolveRefundableAmount(
    payment: { id: string; amount: Prisma.Decimal },
    orderItem: { id: string; lineSubtotal: Prisma.Decimal } | null,
  ): Promise<Prisma.Decimal> {
    const paymentAgg = await this.prisma.refund.aggregate({
      where: {
        paymentId: payment.id,
        status: { in: REFUNDABLE_STATUSES },
      },
      _sum: { amount: true },
    });

    const paymentRemaining = payment.amount.minus(
      paymentAgg._sum.amount ?? new Prisma.Decimal(0),
    );

    if (paymentRemaining.lessThanOrEqualTo(0)) {
      throw new ConflictException(
        'Payment has no remaining refundable amount',
      );
    }

    if (!orderItem) {
      return paymentRemaining;
    }

    const itemAgg = await this.prisma.refund.aggregate({
      where: {
        paymentId: payment.id,
        orderItemId: orderItem.id,
        status: { in: REFUNDABLE_STATUSES },
      },
      _sum: { amount: true },
    });

    const itemRemaining = orderItem.lineSubtotal.minus(
      itemAgg._sum.amount ?? new Prisma.Decimal(0),
    );

    if (itemRemaining.lessThanOrEqualTo(0)) {
      throw new ConflictException(
        'Order item has no remaining refundable amount',
      );
    }

    return Prisma.Decimal.min(paymentRemaining, itemRemaining);
  }
}
