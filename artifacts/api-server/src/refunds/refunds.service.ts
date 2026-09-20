import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentStatus,
  Prisma,
  RefundStatus,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateRefundDto,
  RefundStatusQueryDto,
  UpdateRefundStatusDto,
} from './dto/refund.dto';

@Injectable()
export class RefundsService {
  constructor(private readonly prisma: PrismaService) {}

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

    const countedRefundStatuses = [
      RefundStatus.REQUESTED,
      RefundStatus.APPROVED,
      RefundStatus.PROCESSED,
    ];

    const requestedAmount = new Prisma.Decimal(
      dto.amount,
    );

    /*
     * PAYMENT-LEVEL LIMIT
     *
     * Every REQUESTED, APPROVED, or PROCESSED refund
     * associated with this payment counts against the
     * payment's refundable balance.
     *
     * DENIED refunds do not count.
     */
    const paymentRefundAggregate =
      await this.prisma.refund.aggregate({
        where: {
          paymentId: payment.id,
          status: {
            in: countedRefundStatuses,
          },
        },
        _sum: {
          amount: true,
        },
      });

    const paymentAlreadyRefunded =
      paymentRefundAggregate._sum.amount ??
      new Prisma.Decimal(0);

    const paymentRemaining = payment.amount.minus(
      paymentAlreadyRefunded,
    );

    if (paymentRemaining.lessThanOrEqualTo(0)) {
      throw new ConflictException(
        'Payment has no remaining refundable amount',
      );
    }

    if (
      requestedAmount.greaterThan(paymentRemaining)
    ) {
      throw new BadRequestException(
        `Refund amount exceeds the remaining refundable amount of ${paymentRemaining.toFixed(2)}`,
      );
    }

    /*
     * ITEM-LEVEL LIMIT
     *
     * When the refund targets a specific OrderItem,
     * enforce its line subtotal in addition to the
     * payment-level limit above.
     */
    if (orderItem) {
      const itemRefundAggregate =
        await this.prisma.refund.aggregate({
          where: {
            paymentId: payment.id,
            orderItemId: orderItem.id,
            status: {
              in: countedRefundStatuses,
            },
          },
          _sum: {
            amount: true,
          },
        });

      const itemAlreadyRefunded =
        itemRefundAggregate._sum.amount ??
        new Prisma.Decimal(0);

      const itemRemaining =
        orderItem.lineSubtotal.minus(
          itemAlreadyRefunded,
        );

      if (itemRemaining.lessThanOrEqualTo(0)) {
        throw new ConflictException(
          'Order item has no remaining refundable amount',
        );
      }

      if (
        requestedAmount.greaterThan(itemRemaining)
      ) {
        throw new BadRequestException(
          `Refund amount exceeds the remaining refundable amount for this order item of ${itemRemaining.toFixed(2)}`,
        );
      }
    }

    const reason = dto.reason?.trim() || null;

    const refund =
      await this.prisma.refund.create({
        data: {
          paymentId: payment.id,
          orderItemId: orderItem?.id ?? null,
          amount: requestedAmount,
          reason,
          status: RefundStatus.REQUESTED,
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
          status: true,
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
        amount: Number(
          refund.amount.toFixed(2),
        ),
        currency: refund.payment.currency,
        reason: refund.reason ?? '',
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

    const processedAt =
      dto.status === RefundStatus.PROCESSED
        ? new Date()
        : null;

    const updatedRefund =
      await this.prisma.$transaction(
        async (tx) => {
          const updated =
            await tx.refund.update({
              where: {
                id: refund.id,
              },
              data: {
                status: dto.status,
                processedAt,
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

          await tx.auditRecord.create({
            data: {
              actorUserId,
              actionType:
                'REFUND_STATUS_UPDATED',
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
      amount:
        updatedRefund.amount.toFixed(2),
    };
  }
}
