import { activateStudentApplication } from '../vendor-applications/activate-student-application';
import { subscriptionEnd } from '../vendor-applications/vendor-application.policy';
import { WalletService } from '../wallet/wallet.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FeaturedListingStatus,
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
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PasabuyPaymentsService } from '../pasabuy/pasabuy-payments.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
    private readonly paymongoService: PaymongoService,
    private readonly refundsService: RefundsService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly pasabuyPayments: PasabuyPaymentsService,
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

    const paymentShare =
      await this.prisma.paymentShare.findFirst({
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
      throw new ConflictException(
        'Payment has already succeeded',
      );
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
      if (
        idempotencyRecord.paymentShareId !== paymentShareId
      ) {
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

    const payment = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${paymentShare.order.id}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM payment_shares WHERE id = ${paymentShare.id}::uuid FOR UPDATE`;
        const currentShare = await tx.paymentShare.findUniqueOrThrow({ where: { id: paymentShare.id }, include: { order: true } });
        if (currentShare.status !== PaymentShareStatus.PENDING || currentShare.order.status !== OrderStatus.PENDING || currentShare.paymentId !== paymentShare.paymentId) {
          throw new ConflictException('Payment share changed; reload payment status');
        }
        if (paymentShare.paymentId) {
          const prior = await tx.payment.findUniqueOrThrow({
            where: { id: paymentShare.paymentId }, select: { status: true },
          });
          if (prior.status === PaymentStatus.SUCCEEDED) {
            throw new ConflictException('Payment has already succeeded');
          }
          const existingPayment = await tx.payment.update({
            where: {
              id: paymentShare.paymentId,
            },
            data: {
              status: PaymentStatus.PENDING,
            },
          });
          if (prior.status !== PaymentStatus.PENDING) await tx.auditRecord.create({ data: {
            actorUserId: userId, actionType: 'PAYMENT_STATUS_UPDATED',
            entityType: 'Payment', entityId: existingPayment.id,
            beforeState: { status: prior.status }, afterState: { status: 'PENDING', source: 'CHECKOUT_RETRY' },
          } });

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
        await tx.auditRecord.create({ data: {
          actorUserId: userId, actionType: 'PAYMENT_CREATED',
          entityType: 'Payment', entityId: createdPayment.id,
          afterState: { status: createdPayment.status, purpose: createdPayment.purpose,
            amount: createdPayment.amount.toFixed(2), orderId: paymentShare.order.id },
        } });

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
      },
    );

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
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.FAILED },
        });
        if (changed.count) await tx.auditRecord.create({ data: {
          actorUserId: null, actionType: 'PAYMENT_STATUS_UPDATED',
          entityType: 'Payment', entityId: payment.id,
          beforeState: { status: 'PENDING' },
          afterState: { status: 'FAILED', source: 'CHECKOUT_CREATION_FAILED' },
        } });
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

  async getOrderPaymentStatus(
    userId: string,
    orderId: string,
  ) {
    const paymentShare =
      await this.prisma.paymentShare.findFirst({
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

    const modern = (event as {
      data?: { type?: string; data?: unknown };
    }).data;
    const webhookEvent = modern?.type === 'checkout_session.payment.paid' && modern.data
      ? { data: { attributes: { type: modern.type, data: modern.data } } }
      : event;

    const data = (webhookEvent as {
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

              payments?: Array<{
                id?: string;
                type?: string;
                attributes?: {
                  status?: string;
                  amount?: number;
                  currency?: string;
                };
              }>;

              refunds?: Array<{
                id?: string;
                type?: string;
                attributes?: {
                  amount?: number;
                  currency?: string;
                  payment_id?: string;
                  reason?: string;
                  status?: string;
                  created_at?: number;
                  refunded_at?: number;
                  updated_at?: number;
                };
              }>;

              amount?: number;
              currency?: string;
              payment_id?: string;
              reason?: string;
              notes?: string;
              created_at?: number;
              updated_at?: number;

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

    /*
     * payment.refunded is a payment-level notification.
     *
     * A single payment may contain multiple historical refunds,
     * so this event must not arbitrarily select one refund and
     * mark it as processed.
     *
     * payment.refund.updated below is the authoritative event for
     * completing an individual QueueLess refund.
     */
    if (eventType === 'payment.refunded') {
      const eventResource = data.attributes.data;

      if (
        !eventResource ||
        eventResource.type !== 'payment' ||
        typeof eventResource.id !== 'string' ||
        eventResource.id.trim().length === 0
      ) {
        throw new BadRequestException(
          'Invalid PayMongo refunded payment resource',
        );
      }

      return {
        received: true,
        processed: false,
        duplicate: false,
        eventType,
        providerPaymentId: eventResource.id.trim(),
      };
    }

    /*
     * Individual PayMongo refund status update.
     *
     * A refund remains APPROVED while PayMongo reports pending.
     * It becomes PROCESSED only after PayMongo reports succeeded.
     */
    if (eventType === 'payment.refund.updated') {
      const eventResource = data.attributes.data;

      if (
        !eventResource ||
        eventResource.type !== 'refund' ||
        typeof eventResource.id !== 'string' ||
        eventResource.id.trim().length === 0
      ) {
        throw new BadRequestException(
          'Invalid PayMongo refund webhook resource',
        );
      }

      const providerRefundId = eventResource.id.trim();
      const providerStatus =
        eventResource.attributes?.status?.toLowerCase();

      const refund = await this.prisma.refund.findFirst({
        where: {
          providerRefundId,
        },
        select: {
          id: true,
          status: true,
          providerRefundId: true,
          processedAt: true,
          paymentId: true,
        },
      });

      if (!refund) {
        throw new NotFoundException(
          'Refund for PayMongo webhook not found',
        );
      }

      if (providerStatus !== 'succeeded') {
        return {
          received: true,
          processed: false,
          duplicate: false,
          eventType,
          refundId: refund.id,
          providerRefundId,
          providerStatus: providerStatus ?? null,
        };
      }

      /*
       * PayMongo may retry a webhook that QueueLess has already
       * processed. Treat that delivery as a successful duplicate.
       */
      if (refund.status === 'PROCESSED') {
        return {
          received: true,
          processed: false,
          duplicate: true,
          eventType,
          refundId: refund.id,
          providerRefundId,
          providerStatus,
        };
      }

      if (refund.status !== 'APPROVED') {
        throw new ConflictException(
          `Refund cannot be completed while its status is ${refund.status}`,
        );
      }

      const processedAt = new Date();

      /*
       * The conditional update makes webhook completion idempotent
       * even if two deliveries are handled concurrently.
       *
       * The audit record is created in the same transaction so the
       * state change and audit cannot be committed separately.
       */
      const result = await this.prisma.$transaction(
        async (tx) => {
          const updateResult = await tx.refund.updateMany({
            where: {
              id: refund.id,
              status: 'APPROVED',
              providerRefundId,
            },
            data: {
              status: 'PROCESSED',
              processedAt,
            },
          });

          if (updateResult.count === 0) {
            return {
              duplicate: true,
            };
          }

          await tx.auditRecord.create({
            data: {
              actorUserId: null,
              actionType: 'REFUND_PROCESSED',
              entityType: 'Refund',
              entityId: refund.id,
              beforeState: {
                status: 'APPROVED',
              },
              afterState: {
                status: 'PROCESSED',
                providerRefundId,
                source: 'PAYMONGO_WEBHOOK',
              },
            },
          });

          return {
            duplicate: false,
          };
        },
      );

      if (result.duplicate) {
        return {
          received: true,
          processed: false,
          duplicate: true,
          eventType,
          refundId: refund.id,
          providerRefundId,
          providerStatus,
        };
      }

      await this.refundsService.markPasabuyRefunded(refund.paymentId);

      return {
        received: true,
        processed: true,
        duplicate: false,
        eventType,
        refundId: refund.id,
        providerRefundId,
        providerStatus,
      };
    }

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



    let payment = await this.prisma.payment.findFirst({
      where: {
        providerPaymentId: checkoutSession.id,
        provider: 'PAYMONGO',
        purpose: { in: [PaymentPurpose.ORDER_SHARE, PaymentPurpose.PASABUY, PaymentPurpose.SUBSCRIPTION, PaymentPurpose.FEATURED_LISTING, PaymentPurpose.WALLET_TOPUP] },
      },
      include: {
        paymentShares: true,
      },
    });

    const referenceNumber = checkoutSession.attributes?.reference_number;
    if (!payment && typeof referenceNumber === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(referenceNumber)) {
      payment = await this.prisma.payment.findFirst({
        where: { id: referenceNumber, provider: 'PAYMONGO', purpose: { in: [PaymentPurpose.PASABUY, PaymentPurpose.SUBSCRIPTION, PaymentPurpose.FEATURED_LISTING, PaymentPurpose.WALLET_TOPUP] },
          providerPaymentId: null },
        include: { paymentShares: true },
      });
    }
    if (!payment) {
      throw new NotFoundException(
        'Payment for PayMongo checkout session not found',
      );
    }

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

    if (payment.purpose === PaymentPurpose.WALLET_TOPUP) {
      const result = await this.wallet.confirmTopup(payment.id, checkoutSession.id);
      return { received: true, processed: !result.duplicate, duplicate: result.duplicate, eventType, paymentId: payment.id };
    }

    if (payment.purpose === PaymentPurpose.FEATURED_LISTING) {
      if (!payment.featuredListingId ||
        (payment.providerPaymentId && payment.providerPaymentId !== checkoutSession.id)) {
        throw new BadRequestException('Featured listing checkout session does not match');
      }
      const checkout = await this.paymongoService.retrieveCheckoutPaymentIds(checkoutSession.id);
      if (checkout.referenceNumber !== payment.id ||
        !checkout.paymentIds.length || checkout.paymentIds.length > 10) {
        throw new BadRequestException('Featured listing checkout cannot be verified');
      }
      let paidPaymentId: string | undefined;
      for (const candidate of checkout.paymentIds) {
        const verified = await this.paymongoService.retrievePayment(candidate);
        if (verified.status === 'paid' &&
          verified.amount === payment.amount.mul(100).toNumber() &&
          verified.currency === payment.currency) {
          paidPaymentId = candidate;
          break;
        }
      }
      if (!paidPaymentId) throw new BadRequestException('Featured listing payment is not paid or amount does not match');
      const listingId = payment.featuredListingId;
      const result = await this.prisma.$transaction(async (tx) => {
        const current = await tx.featuredListing.findUnique({
          where: { id: listingId }, include: { plan: true,
            vendor: { select: { status: true } },
            product: { select: { isAvailable: true } } },
        });
        if (!current) throw new NotFoundException('Featured listing not found');
        if (payment.status === PaymentStatus.SUCCEEDED) {
          return { duplicate: true, autoRefund: false };
        }
        const updatedPayment = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.SUCCEEDED, providerPaymentResourceId: paidPaymentId,
            providerPaymentId: checkoutSession.id },
        });
        if (!updatedPayment.count) return { duplicate: true, autoRefund: false };
        await tx.auditRecord.create({ data: {
          actorUserId: null, actionType: 'PAYMENT_STATUS_UPDATED',
          entityType: 'Payment', entityId: payment.id,
          beforeState: { status: payment.status },
          afterState: { status: PaymentStatus.SUCCEEDED, source: 'PAYMONGO_WEBHOOK' },
        } });
        const now = new Date();
        const eligible = current.plan && current.vendor.status === 'ACTIVE' &&
          (!current.productId || current.product?.isAvailable);
        const activated = eligible ? await tx.featuredListing.updateMany({
          where: { id: listingId, status: FeaturedListingStatus.PENDING },
          data: { status: FeaturedListingStatus.ACTIVE, pricePaid: payment.amount,
            startDate: now,
            endDate: new Date(now.getTime() + current.plan!.durationDays * 86_400_000) },
        }) : { count: 0 };
        if (activated.count) await tx.auditRecord.create({ data: {
          actorUserId: null, actionType: 'FEATURED_LISTING_STATUS_UPDATED',
          entityType: 'FeaturedListing', entityId: listingId,
          beforeState: { status: FeaturedListingStatus.PENDING },
          afterState: { status: FeaturedListingStatus.ACTIVE, paymentId: payment.id },
        } });
        return { duplicate: false, autoRefund: !activated.count };
      });
      if (result.duplicate) await this.refundsService.retryPendingAutoRefunds(payment.id);
      if (result.autoRefund) await this.refundsService.autoRefundPayment(payment.id,
        'FEATURED_LISTING_UNAVAILABLE', 'Featured listing payment arrived after the placement became unavailable.');
      return { received: true, processed: !result.duplicate, eventType,
        paymentId: payment.id, listingId, ...result };
    }

    if (payment.purpose === PaymentPurpose.SUBSCRIPTION) {
      if (!payment.vendorSubscriptionId ||
        (payment.providerPaymentId && payment.providerPaymentId !== checkoutSession.id)) {
        throw new BadRequestException('Subscription checkout session does not match');
      }
      const checkout = await this.paymongoService.retrieveCheckoutPaymentIds(checkoutSession.id);
      if (checkout.referenceNumber !== payment.id ||
        !checkout.paymentIds.length || checkout.paymentIds.length > 10) {
        throw new BadRequestException('Subscription checkout cannot be verified');
      }
      let paidPaymentId: string | undefined;
      for (const candidate of checkout.paymentIds) {
        const verified = await this.paymongoService.retrievePayment(candidate);
        if (verified.status === 'paid' &&
          verified.amount === payment.amount.mul(100).toNumber() &&
          verified.currency === payment.currency) {
          paidPaymentId = candidate;
          break;
        }
      }
      if (!paidPaymentId) throw new BadRequestException('Subscription payment is not paid or amount does not match');
      const subscriptionId = payment.vendorSubscriptionId;
      const result = await this.prisma.$transaction(async (tx) => {
        const current = await tx.vendorSubscription.findUnique({
          where: { id: subscriptionId }, include: { plan: true, application: true,
            vendor: { select: { status: true, ownerUserId: true } } },
        });
        if (!current) throw new NotFoundException('Vendor subscription not found');
        if (payment.status === PaymentStatus.SUCCEEDED && current.status === 'ACTIVE') {
          return { duplicate: true, autoRefund: false };
        }
        const updatedPayment = await tx.payment.updateMany({
          where: { id: payment.id, status: { not: PaymentStatus.SUCCEEDED } },
          data: { status: PaymentStatus.SUCCEEDED, providerPaymentResourceId: paidPaymentId,
            providerPaymentId: checkoutSession.id },
        });
        if (!updatedPayment.count) return { duplicate: true, autoRefund: false };
        await tx.auditRecord.create({ data: {
          actorUserId: null, actionType: 'PAYMENT_STATUS_UPDATED',
          entityType: 'Payment', entityId: payment.id,
          beforeState: { status: payment.status },
          afterState: { status: PaymentStatus.SUCCEEDED, source: 'PAYMONGO_WEBHOOK' },
        } });
        const now = new Date();
        const application = current.application;
        const applicationActivated = await activateStudentApplication(tx, current, payment.id);
        const activated = (!application || applicationActivated) ? await tx.vendorSubscription.updateMany({
          where: { id: subscriptionId, status: 'PENDING', vendor: { status: 'ACTIVE' } },
          data: { status: 'ACTIVE', startDate: now,
            endDate: subscriptionEnd(now, application?.quotedDurationDays ?? current.plan.durationDays,
              application?.quotedDurationMonths ?? current.plan.durationMonths) },
        }) : { count: 0 };
        if (applicationActivated && !activated.count) throw new ConflictException('Subscription changed during activation');
        if (activated.count) await tx.auditRecord.create({ data: {
          actorUserId: null, actionType: 'SUBSCRIPTION_STATUS_UPDATED',
          entityType: 'VendorSubscription', entityId: subscriptionId,
          beforeState: { status: 'PENDING' },
          afterState: { status: 'ACTIVE', paymentId: payment.id },
        } });
        return { duplicate: false, autoRefund: !activated.count };
      }, { maxWait: 10_000, timeout: 30_000 });
      if (result.duplicate) await this.refundsService.retryPendingAutoRefunds(payment.id);
      if (result.autoRefund) await this.refundsService.autoRefundPayment(payment.id,
        'SUBSCRIPTION_CHECKOUT_EXPIRED', 'Subscription payment arrived after checkout expiry.');
      return { received: true, processed: !result.duplicate, eventType,
        paymentId: payment.id, subscriptionId, ...result };
    }

    if (payment.purpose === PaymentPurpose.PASABUY) {
      if (payment.providerPaymentId && payment.providerPaymentId !== checkoutSession.id) {
        throw new BadRequestException('Pasabuy checkout session does not match');
      }
      // The event can omit payments altogether. Read the checkout directly
      // from PayMongo and verify its payment before updating local state.
      const checkout = await this.paymongoService.retrieveCheckoutPaymentIds(checkoutSession.id);
      if (checkout.referenceNumber !== payment.id) {
        throw new BadRequestException('PayMongo checkout reference does not match');
      }
      if (!checkout.paymentIds.length || checkout.paymentIds.length > 10) {
        throw new BadRequestException('PayMongo checkout session has no verifiable payment');
      }
      let paidPaymentId: string | undefined;
      for (const paymentId of checkout.paymentIds) {
        const verified = await this.paymongoService.retrievePayment(paymentId);
        if (verified.status === 'paid' &&
          verified.amount === payment.amount.mul(100).toNumber() &&
          verified.currency === payment.currency) {
          paidPaymentId = paymentId;
          break;
        }
      }
      if (!paidPaymentId) {
        throw new BadRequestException('Pasabuy payment is not paid or amount does not match');
      }
      const result = await this.pasabuyPayments.confirmPaid(payment.id, paidPaymentId);
      if (result.duplicate) await this.refundsService.retryPendingAutoRefunds(payment.id);
      if (result.autoRefund) {
        await this.refundsService.autoRefundPayment(payment.id, 'PASABUY_PAYMENT_EXPIRED',
          'Pasabuy fee arrived after the assignment expired.');
      }
      return { received: true, processed: !result.duplicate, eventType,
        paymentId: payment.id, ...result };
    }

    /*
     * PayMongo checkout_session.payment.paid sends the actual
     * Payment resource inside attributes.payments.
     *
     * The checkout-session resource itself can remain "active",
     * so the nested paid Payment is what confirms success.
     */
    const providerPayment =
      checkoutSession.attributes?.payments?.find(
        (providerPayment) =>
          (providerPayment.type === 'payment' ||
            (modern?.type === 'checkout_session.payment.paid' && !providerPayment.type)) &&
          providerPayment.attributes?.status === 'paid' &&
          typeof providerPayment.id === 'string' &&
          providerPayment.id.trim().length > 0,
      );

    if (!providerPayment) {
      throw new BadRequestException(
        'PayMongo checkout session has no successful payment',
      );
    }

    const providerPaymentResourceId =
      providerPayment.id!.trim();

    // Idempotency:
    // PayMongo may deliver the same webhook more than once.
    if (payment.status === PaymentStatus.SUCCEEDED) {
      /*
       * Older successful QueueLess payments may have been
       * completed before providerPaymentResourceId was stored.
       * Backfill it from this valid PayMongo webhook when needed.
       */
      if (!payment.providerPaymentResourceId) {
        await this.prisma.payment.update({
          where: {
            id: payment.id,
          },
          data: {
            providerPaymentResourceId,
          },
        });
      }

      let refundRequiresReview = false;
      if (payment.paymentShares.length === 0) {
        const refund = await this.refundsService.autoRefundPayment(payment.id,
          'ORPHANED_PAYMENT', 'Payment succeeded but no order was linked to it.');
        refundRequiresReview = Boolean(refund && 'requiresReview' in refund && refund.requiresReview);
      } else {
        const retry = await this.refundsService.retryPendingAutoRefunds(payment.id);
        refundRequiresReview = retry.requiresReview;
      }

      return {
        refundRequiresReview,
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
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.payment.updateMany({
          where: { id: payment.id, status: { not: PaymentStatus.SUCCEEDED } },
          data: { status: PaymentStatus.SUCCEEDED, providerPaymentResourceId },
        });
        if (changed.count) await tx.auditRecord.create({ data: {
          actorUserId: null, actionType: 'PAYMENT_STATUS_UPDATED',
          entityType: 'Payment', entityId: payment.id,
          beforeState: { status: payment.status },
          afterState: { status: PaymentStatus.SUCCEEDED,
            source: 'PAYMONGO_WEBHOOK', linkedOrder: false },
        } });
      });

      const refund = await this.refundsService.autoRefundPayment(
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
        autoRefunded: refund?.status === 'PROCESSED',
        refundRequiresReview: Boolean(refund && 'requiresReview' in refund && refund.requiresReview),
      };
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

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const linkedShares = await tx.paymentShare.count({ where: { paymentId: payment.id, status: PaymentShareStatus.PENDING } });
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

      await tx.auditRecord.create({ data: {
        actorUserId: null, actionType: 'PAYMENT_STATUS_UPDATED',
        entityType: 'Payment', entityId: payment.id,
        beforeState: { status: payment.status },
        afterState: { status: PaymentStatus.SUCCEEDED, source: 'PAYMONGO_WEBHOOK' },
      } });

      const existingOrder = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });

      if (
        !linkedShares || (existingOrder &&
        existingOrder.status !== OrderStatus.PENDING)
      ) {
        return {
          duplicate: false,
          duplicatePayment: true,
          orderId,
          orderMarkedPaid: false,
          unpaidShares: 0,
          paidOrder: null,
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

      let paidOrder:
      | {
          id: string;
          customerId: string;
          status: OrderStatus;
          updatedAt: Date;
        }
      | null = null;

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
          await tx.auditRecord.create({ data: {
            actorUserId: null, actionType: 'ORDER_STATUS_UPDATED',
            entityType: 'Order', entityId: orderId,
            beforeState: { status: OrderStatus.PENDING },
            afterState: { status: OrderStatus.PAID, paymentId: payment.id },
          } });

          const order = await tx.order.findUnique({
            where: { id: orderId },
            select: {
              id: true,
              customerId: true,
              status: true,
              updatedAt: true,
              vendorId: true,
              totalAmount: true,
              marketplaceFee: true,
            },
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
            paidOrder = {
              id: order.id,
              customerId: order.customerId,
              status: order.status,
              updatedAt: order.updatedAt,
            };
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
        paidOrder,
      };
    });

    if (result.orderMarkedPaid && result.paidOrder) {
      await this.realtimeGateway.emitOrderStatusUpdated(
        result.paidOrder.customerId,
        {
          orderId: result.paidOrder.id,
          status: result.paidOrder.status,
          updatedAt: result.paidOrder.updatedAt,
        },
      );
    }

    let refundRequiresReview = false;
    let autoRefunded = false;
    if (result.duplicate) {
      const retry = await this.refundsService.retryPendingAutoRefunds(payment.id);
      refundRequiresReview = retry.requiresReview;
    }

    if (result.duplicatePayment) {
      const refund = await this.refundsService.autoRefundPayment(
        payment.id,
        'DUPLICATE_PAYMENT',
        'This order was already paid by another payment.',
        orderId,
      );
      autoRefunded = refund?.status === 'PROCESSED';
      refundRequiresReview = Boolean(refund && 'requiresReview' in refund && refund.requiresReview);
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
      autoRefunded,
      refundRequiresReview,
    };
  }
}
