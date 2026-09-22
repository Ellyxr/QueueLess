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
import { PaymongoService } from '../payments/paymongo.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateRefundDto,
  RefundStatusQueryDto,
  UpdateRefundStatusDto,
} from './dto/refund.dto';

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

    if (dto.status === RefundStatus.PROCESSED) {
      throw new BadRequestException(
        'Use the refund processing endpoint to process an approved refund',
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
      APPROVED: [],
      PROCESSED: [],
      DENIED: [],
    };

    /*
    * Manual status transitions:
    *
    * REQUESTED -> APPROVED or DENIED
    *
    * APPROVED -> PROCESSED is handled exclusively
    * by processRefund() after PayMongo confirms the refund.
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

  async processRefund(
    refundId: string,
    actorUserId: string,
  ) {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      select: {
        id: true,
        paymentId: true,
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

    if (!refund.payment.providerPaymentResourceId) {
      throw new ConflictException(
        'PayMongo payment resource ID is unavailable for this payment',
      );
    }

    const amountInCentavos = Number(
      refund.amount.mul(100).toFixed(0),
    );

    const providerRefund = await this.paymongoService.createRefund({
      paymentId: refund.payment.providerPaymentResourceId,
      amount: amountInCentavos,
      reason: refund.reason ?? undefined,
    });

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

    return {
      ...updatedRefund,
      amount: updatedRefund.amount.toFixed(2),
      idempotentReplay: false,
    };
  }

}
