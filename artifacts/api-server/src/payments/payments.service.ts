import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LedgerEntryType,
  OrderStatus,
  PaymentPurpose,
  PaymentStatus,
  PaymentShareStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymongoService } from './paymongo.service';
import { RefundsService } from '../refunds/refunds.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymongoService: PaymongoService,
    private readonly refundsService: RefundsService,
  ) {}

  async createCheckout(
    userId: string,
    paymentShareId: string,
    idempotencyKey: string | undefined,
  ) {
    const normalizedKey = idempotencyKey?.trim();

    if (!normalizedKey) {
      throw new BadRequestException(
        'Idempotency-Key header is required',
      );
    }

    if (normalizedKey.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key must not exceed 255 characters',
      );
    }

    const paymentShare = await this.prisma.paymentShare.findFirst({
      where: {
        id: paymentShareId,
        payerUserId: userId,
      },
      include: {
        order: {
          select: {
            id: true,
            status: true,
          },
        },
        payment: true,
      },
    });

    if (!paymentShare) {
      throw new NotFoundException('Payment share not found');
    }

    if (paymentShare.order.status !== OrderStatus.PENDING) {
      throw new ConflictException(
        `Order cannot be paid while its status is ${paymentShare.order.status}`,
      );
    }

    if (paymentShare.status === PaymentShareStatus.PAID) {
      throw new ConflictException(
        'Payment share has already been paid',
      );
    }

    if (
      paymentShare.payment &&
      paymentShare.payment.status === PaymentStatus.SUCCEEDED
    ) {
      throw new ConflictException('Payment has already succeeded');
    }

    if (paymentShare.amountDue.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'Payment share amount must be greater than zero',
      );
    }

    /*
    * Reserve the idempotency key before contacting PayMongo.
    *
    * The unique (userId, key) constraint prevents two concurrent
    * requests from independently creating checkout sessions.
    */
    let idempotencyRecord =
      await this.prisma.paymentIdempotencyKey.findUnique({
        where: {
          userId_key: {
            userId,
            key: normalizedKey,
          },
        },
        include: {
          payment: true,
        },
      });

    if (idempotencyRecord) {
      if (idempotencyRecord.paymentShareId !== paymentShareId) {
        throw new ConflictException(
          'Idempotency-Key has already been used for another payment share',
        );
      }

      if (
        idempotencyRecord.paymentId &&
        idempotencyRecord.checkoutSessionId &&
        idempotencyRecord.checkoutUrl &&
        idempotencyRecord.payment
      ) {
        return {
          paymentId: idempotencyRecord.payment.id,
          paymentShareId,
          orderId: paymentShare.order.id,
          amount: paymentShare.amountDue.toFixed(2),
          currency: idempotencyRecord.payment.currency,
          status: idempotencyRecord.payment.status,
          provider: idempotencyRecord.payment.provider,
          checkoutSessionId:
            idempotencyRecord.checkoutSessionId,
          checkoutUrl: idempotencyRecord.checkoutUrl,
          idempotentReplay: true,
        };
      }

      throw new ConflictException(
        'A checkout request with this Idempotency-Key is already being processed',
      );
    }

    try {
      idempotencyRecord =
        await this.prisma.paymentIdempotencyKey.create({
          data: {
            userId,
            key: normalizedKey,
            paymentShareId,
          },
          include: {
            payment: true,
          },
        });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing =
          await this.prisma.paymentIdempotencyKey.findUnique({
            where: {
              userId_key: {
                userId,
                key: normalizedKey,
              },
            },
            include: {
              payment: true,
            },
          });

        if (!existing) {
          throw new ConflictException(
            'A checkout request with this Idempotency-Key is already being processed',
          );
        }

        if (existing.paymentShareId !== paymentShareId) {
          throw new ConflictException(
            'Idempotency-Key has already been used for another payment share',
          );
        }

        if (
          existing.paymentId &&
          existing.checkoutSessionId &&
          existing.checkoutUrl &&
          existing.payment
        ) {
          return {
            paymentId: existing.payment.id,
            paymentShareId,
            orderId: paymentShare.order.id,
            amount: paymentShare.amountDue.toFixed(2),
            currency: existing.payment.currency,
            status: existing.payment.status,
            provider: existing.payment.provider,
            checkoutSessionId: existing.checkoutSessionId,
            checkoutUrl: existing.checkoutUrl,
            idempotentReplay: true,
          };
        }

        throw new ConflictException(
          'A checkout request with this Idempotency-Key is already being processed',
        );
      }

      throw error;
    }

    const amountCentavos = paymentShare.amountDue
      .mul(100)
      .toDecimalPlaces(0)
      .toNumber();

    const payment = await this.prisma.$transaction(async (tx) => {
      if (paymentShare.paymentId) {
        const existingPayment = await tx.payment.update({
          where: {
            id: paymentShare.paymentId,
          },
          data: {
            status: PaymentStatus.PENDING,
          },
        });

        await tx.paymentIdempotencyKey.update({
          where: {
            id: idempotencyRecord.id,
          },
          data: {
            paymentId: existingPayment.id,
          },
        });

        return existingPayment;
      }

      const createdPayment = await tx.payment.create({
        data: {
          payerUserId: userId,
          purpose: PaymentPurpose.ORDER_SHARE,
          amount: new Prisma.Decimal(paymentShare.amountDue),
          currency: 'PHP',
          status: PaymentStatus.PENDING,
        },
      });

      await tx.paymentShare.update({
        where: {
          id: paymentShare.id,
        },
        data: {
          paymentId: createdPayment.id,
        },
      });

      await tx.paymentIdempotencyKey.update({
        where: {
          id: idempotencyRecord.id,
        },
        data: {
          paymentId: createdPayment.id,
        },
      });

      return createdPayment;
    });

    try {
      const checkout =
        await this.paymongoService.createCheckoutSession({
          amount: amountCentavos,
          description: `QueueLess order ${paymentShare.order.id}`,
          referenceNumber: payment.id,
          orderId: paymentShare.order.id,
        });

      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: {
            id: payment.id,
          },
          data: {
            providerPaymentId: checkout.checkoutSessionId,
          },
        }),
        this.prisma.paymentIdempotencyKey.update({
          where: {
            id: idempotencyRecord.id,
          },
          data: {
            checkoutSessionId: checkout.checkoutSessionId,
            checkoutUrl: checkout.checkoutUrl,
          },
        }),
      ]);

      return {
        paymentId: payment.id,
        paymentShareId: paymentShare.id,
        orderId: paymentShare.order.id,
        amount: paymentShare.amountDue.toFixed(2),
        currency: payment.currency,
        status: payment.status,
        provider: payment.provider,
        checkoutSessionId: checkout.checkoutSessionId,
        checkoutUrl: checkout.checkoutUrl,
        idempotentReplay: false,
      };
    } catch (error) {
      await this.prisma.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          status: PaymentStatus.FAILED,
        },
      });

      /*
      * Remove the incomplete reservation so a failed PayMongo
      * request can be retried using the same key.
      */
      await this.prisma.paymentIdempotencyKey.deleteMany({
        where: {
          id: idempotencyRecord.id,
          checkoutSessionId: null,
        },
      });

      throw error;
    }
  }
    async getOrderPaymentStatus(userId: string, orderId: string) {
    const paymentShare = await this.prisma.paymentShare.findFirst({
      where: {
        orderId,
        payerUserId: userId,
      },
      select: {
        id: true,
        amountDue: true,
        status: true,
        order: {
          select: {
            id: true,
            orderType: true,
            status: true,
            totalAmount: true,
          },
        },
        payment: {
          select: {
            id: true,
            amount: true,
            currency: true,
            provider: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!paymentShare) {
      throw new NotFoundException(
        'Payment information for order not found',
      );
    }

    return {
      orderId: paymentShare.order.id,
      orderType: paymentShare.order.orderType,
      orderStatus: paymentShare.order.status,
      totalAmount: paymentShare.order.totalAmount.toFixed(2),
      paymentShare: {
        id: paymentShare.id,
        amountDue: paymentShare.amountDue.toFixed(2),
        status: paymentShare.status,
      },
      payment: paymentShare.payment
        ? {
            id: paymentShare.payment.id,
            amount: paymentShare.payment.amount.toFixed(2),
            currency: paymentShare.payment.currency,
            provider: paymentShare.payment.provider,
            status: paymentShare.payment.status,
            createdAt: paymentShare.payment.createdAt,
            updatedAt: paymentShare.payment.updatedAt,
          }
        : null,
    };
  }

  verifyWebhookSignature(
    rawBody: Buffer,
    signature: string | undefined,
  ): void {
    this.paymongoService.verifyWebhookSignature(
      rawBody,
      signature,
    );
  }

  async handleWebhookEvent(event: unknown) {
    if (
      typeof event !== 'object' ||
      event === null ||
      !('data' in event)
    ) {
      throw new BadRequestException(
        'Invalid PayMongo webhook payload',
      );
    }

    const data = (event as {
      data?: {
        id?: string;
        type?: string;
        attributes?: {
          type?: string;
          data?: {
            id?: string;
            type?: string;
            attributes?: {
              status?: string;
              reference_number?: string;
              payments?: Array<{ id?: string }>;
            };
          };
        };
      };
    }).data;

    if (!data?.attributes?.type) {
      throw new BadRequestException(
        'Invalid PayMongo webhook event',
      );
    }

    const eventType = data.attributes.type;

    // Ignore PayMongo events that are unrelated to a successful
    // QueueLess checkout.
    if (eventType !== 'checkout_session.payment.paid') {
      return {
        received: true,
        processed: false,
        eventType,
      };
    }

    const checkoutSession = data.attributes.data;

    if (
      !checkoutSession ||
      typeof checkoutSession.id !== 'string' ||
      checkoutSession.id.trim().length === 0
    ) {
      throw new BadRequestException(
        'PayMongo checkout session ID is missing',
      );
    }

    if (checkoutSession.type !== 'checkout_session') {
      throw new BadRequestException(
        'Invalid PayMongo webhook resource type',
      );
    }

    if (checkoutSession.attributes?.status !== 'paid') {
      throw new BadRequestException(
        'PayMongo checkout session is not paid',
      );
    }

    const providerPaymentResourceId =
      checkoutSession.attributes?.payments?.[0]?.id ?? null;

    const payment = await this.prisma.payment.findFirst({
      where: {
        providerPaymentId: checkoutSession.id,
        purpose: PaymentPurpose.ORDER_SHARE,
      },
      include: {
        paymentShares: true,
      },
    });

    if (!payment) {
      throw new NotFoundException(
        'Payment for PayMongo checkout session not found',
      );
    }

    const referenceNumber =
      checkoutSession.attributes?.reference_number;

    if (
      typeof referenceNumber !== 'string' ||
      referenceNumber.trim().length === 0
    ) {
      throw new BadRequestException(
        'PayMongo payment reference number is missing',
      );
    }

    if (referenceNumber !== payment.id) {
      throw new BadRequestException(
        'PayMongo payment reference does not match',
      );
    }

    // Idempotency:
    // PayMongo may deliver the same webhook more than once.
    if (payment.status === PaymentStatus.SUCCEEDED) {
      return {
        received: true,
        processed: false,
        duplicate: true,
        eventType,
        paymentId: payment.id,
      };
    }

    if (payment.paymentShares.length === 0) {
      // Payment succeeded at PayMongo but nothing was ever linked to it —
      // refund automatically rather than leaving the buyer out of pocket.
      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: { not: PaymentStatus.SUCCEEDED } },
        data: {
          status: PaymentStatus.SUCCEEDED,
          providerPaymentResourceId,
        },
      });

      await this.refundsService.autoRefundPayment(
        payment.id,
        'ORPHANED_PAYMENT',
        'Payment succeeded but no order was linked to it.',
      );

      return {
        received: true,
        processed: true,
        duplicate: false,
        eventType,
        paymentId: payment.id,
        orderId: null,
        orderMarkedPaid: false,
        autoRefunded: true,
      };
    }

    const orderIds = [
      ...new Set(
        payment.paymentShares.map((share) => share.orderId),
      ),
    ];

    if (orderIds.length !== 1) {
      throw new BadRequestException(
        'Payment must belong to exactly one order',
      );
    }

    const orderId = orderIds[0];

    const result = await this.prisma.$transaction(async (tx) => {
      const paymentUpdate = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: {
            not: PaymentStatus.SUCCEEDED,
          },
        },
        data: {
          status: PaymentStatus.SUCCEEDED,
          providerPaymentResourceId,
        },
      });

      if (paymentUpdate.count === 0) {
        return {
          duplicate: true,
          duplicatePayment: false,
          orderId,
          orderMarkedPaid: false,
          unpaidShares: await tx.paymentShare.count({
            where: {
              orderId,
              status: PaymentShareStatus.PENDING,
            },
          }),
        };
      }

      const existingOrder = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });

      if (existingOrder && existingOrder.status !== OrderStatus.PENDING) {
        // Some other payment already settled this order — this payment
        // succeeding too means the buyer was charged twice for it.
        return {
          duplicate: false,
          duplicatePayment: true,
          orderId,
          orderMarkedPaid: false,
          unpaidShares: 0,
        };
      }

      await tx.paymentShare.updateMany({
        where: {
          paymentId: payment.id,
          status: PaymentShareStatus.PENDING,
        },
        data: {
          status: PaymentShareStatus.PAID,
        },
      });

      const unpaidShares = await tx.paymentShare.count({
        where: {
          orderId,
          status: PaymentShareStatus.PENDING,
        },
      });

      let orderMarkedPaid = false;

      if (unpaidShares === 0) {
        const orderUpdate = await tx.order.updateMany({
          where: {
            id: orderId,
            status: OrderStatus.PENDING,
          },
          data: {
            status: OrderStatus.PAID,
            paidAt: new Date(),
          },
        });

        if (orderUpdate.count === 1) {
          await tx.orderStatusHistory.create({
            data: {
              orderId,
              status: OrderStatus.PAID,
              changedByUserId: null,
              note: 'Payment confirmed by PayMongo webhook',
            },
          });

          const order = await tx.order.findUnique({
            where: { id: orderId },
            select: { vendorId: true, totalAmount: true, marketplaceFee: true },
          });

          if (order) {
            await tx.vendorLedgerEntry.create({
              data: {
                vendorId: order.vendorId,
                orderId,
                type: LedgerEntryType.ORDER_CREDIT,
                amount: order.totalAmount.sub(order.marketplaceFee),
              },
            });
          }

          orderMarkedPaid = true;
        }
      }

      return {
        duplicate: false,
        duplicatePayment: false,
        orderId,
        orderMarkedPaid,
        unpaidShares,
      };
    });

    if (result.duplicatePayment) {
      await this.refundsService.autoRefundPayment(
        payment.id,
        'DUPLICATE_PAYMENT',
        'This order was already paid by another payment.',
        orderId,
      );
    }

    return {
      received: true,
      processed: !result.duplicate,
      duplicate: result.duplicate,
      eventType,
      paymentId: payment.id,
      orderId: result.orderId,
      orderMarkedPaid: result.orderMarkedPaid,
      remainingUnpaidShares: result.unpaidShares,
      autoRefunded: result.duplicatePayment,
    };
  }
}
