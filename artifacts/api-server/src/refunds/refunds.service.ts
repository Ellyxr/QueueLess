import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CancellationReason,
  OrderStatus,
  PaymentStatus,
  Prisma,
  RefundInitiator,
  RefundStatus,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymongoService } from '../payments/paymongo.service';
import {
  CreateRefundDto,
  RefundStatusQueryDto,
  UpdateRefundStatusDto,
} from './dto/refund.dto';
import {
  AUTO_REFUND_CATEGORIES,
  RequestOrderRefundDto,
} from './dto/request-order-refund.dto';

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
    private readonly prisma: PrismaService,
    private readonly paymongoService: PaymongoService,
  ) {}

  async createRefund(
    userId: string,
    dto: CreateRefundDto,
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: dto.paymentId,
        payerUserId: userId,
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        paymentShares: {
          select: {
            orderId: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new ConflictException(
        'Only successful payments can be refunded',
      );
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

    if (requestedAmount.greaterThan(remaining)) {
      throw new BadRequestException(
        `Refund amount exceeds the remaining refundable amount of ${remaining.toFixed(2)}`,
      );
    }

    const reason = dto.reason?.trim() || null;

    const refund =
      await this.prisma.refund.create({
        data: {
          paymentId: payment.id,
          orderId,
          orderItemId: orderItem?.id ?? null,
          amount: requestedAmount,
          reason,
          status: RefundStatus.REQUESTED,
          initiatedBy: RefundInitiator.BUYER,
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
              currency: true,
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
        orderId:
          paymentShare?.orderId ?? null,
        requesterName:
          refund.requestedBy.fullName,
        requesterEmail:
          refund.requestedBy
            .dataAccessGrantedAt !== null
            ? refund.requestedBy.email
            : null,
        vendorName:
          paymentShare?.order.vendor
            .businessName ?? null,
        orderedAt:
          paymentShare?.order.createdAt ?? null,
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
    const refund =
      await this.prisma.refund.findUnique({
        where: {
          id: refundId,
        },
        select: {
          id: true,
          paymentId: true,
          amount: true,
          status: true,
        },
      });

    if (!refund) {
      throw new NotFoundException(
        'Refund request not found',
      );
    }

    const allowedTransitions: Record<
      RefundStatus,
      RefundStatus[]
    > = {
      REQUESTED: [
        RefundStatus.APPROVED,
        RefundStatus.DENIED,
      ],
      APPROVED: [
        RefundStatus.PROCESSED,
      ],
      PROCESSED: [],
      DENIED: [],
    };

    /*
     * Reject invalid state transitions.
     *
     * REQUESTED -> APPROVED or DENIED
     * APPROVED  -> PROCESSED
     */
    if (
      !allowedTransitions[refund.status].includes(
        dto.status,
      )
    ) {
      throw new ConflictException(
        `Refund cannot transition from ${refund.status} to ${dto.status}`,
      );
    }

    let updatedRefund: {
      id: string;
      paymentId: string;
      orderItemId: string | null;
      amount: Prisma.Decimal;
      reason: string | null;
      status: RefundStatus;
      providerRefundId: string | null;
      processedAt: Date | null;
      createdAt: Date;
    };

    if (dto.status === RefundStatus.PROCESSED) {
      // Moving money happens outside a DB transaction — an external API
      // call must never hold a Postgres transaction open.
      updatedRefund = await this.processRefundWithPaymongo(refund);
    } else {
      updatedRefund = await this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: dto.status,
          processedAt: null,
        },
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
    }

    await this.prisma.auditRecord.create({
      data: {
        actorUserId,
        actionType: 'REFUND_STATUS_UPDATED',
        entityType: 'Refund',
        entityId: refund.id,
        beforeState: {
          status: refund.status,
        },
        afterState: {
          status: updatedRefund.status,
        },
      },
    });

    return {
      ...updatedRefund,
      amount:
        updatedRefund.amount.toFixed(2),
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

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason: CancellationReason.AUTO_REFUND_TIMEOUT,
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
    });

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
        'The order has progressed since you contacted the vendor — this refund is no longer applicable.',
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

    const refund = await this.prisma.refund.create({
      data: {
        paymentId: payment.id,
        orderId,
        orderItemId: orderItem?.id ?? null,
        amount: remaining,
        reason: dto.description?.trim() || null,
        category: dto.category,
        status: RefundStatus.REQUESTED,
        initiatedBy: RefundInitiator.BUYER,
        requestedByUserId: userId,
      },
      select: {
        id: true,
        paymentId: true,
        orderId: true,
        orderItemId: true,
        amount: true,
        reason: true,
        category: true,
        status: true,
        createdAt: true,
      },
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
  async autoRefundPayment(
    paymentId: string,
    category: string,
    note: string | null,
    orderId: string | null = null,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        amount: true,
        payerUserId: true,
        status: true,
      },
    });

    if (!payment || payment.status !== PaymentStatus.SUCCEEDED) {
      return null;
    }

    let remaining: Prisma.Decimal;

    try {
      remaining = await this.resolveRefundableAmount(payment, null);
    } catch {
      return null;
    }

    const refund = await this.prisma.refund.create({
      data: {
        paymentId: payment.id,
        orderId,
        amount: remaining,
        reason: note,
        category,
        status: RefundStatus.APPROVED,
        initiatedBy: RefundInitiator.SYSTEM,
        requestedByUserId: payment.payerUserId,
      },
      select: {
        id: true,
        paymentId: true,
        amount: true,
        status: true,
      },
    });

    return this.processRefundWithPaymongo(refund);
  }

  /**
   * Calls PayMongo and moves the refund to PROCESSED. On failure, leaves
   * the refund at its current (APPROVED) status so an admin can retry it
   * manually via PATCH /refunds/:id rather than losing the record.
   */
  private async processRefundWithPaymongo(refund: {
    id: string;
    paymentId: string;
    amount: Prisma.Decimal;
  }) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: refund.paymentId },
      select: { providerPaymentResourceId: true },
    });

    if (!payment?.providerPaymentResourceId) {
      return this.prisma.refund.findUniqueOrThrow({
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
    }

    try {
      const amountCentavos = Math.round(
        refund.amount.toNumber() * 100,
      );

      const result = await this.paymongoService.createRefund({
        paymentResourceId: payment.providerPaymentResourceId,
        amount: amountCentavos,
      });

      return this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: RefundStatus.PROCESSED,
          providerRefundId: result.refundId,
          processedAt: new Date(),
        },
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
    } catch {
      return this.prisma.refund.findUniqueOrThrow({
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
    }
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
