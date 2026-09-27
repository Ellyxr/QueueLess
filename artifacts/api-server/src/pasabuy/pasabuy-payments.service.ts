import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PaymentPurpose, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymongoService } from '../payments/paymongo.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class PasabuyPaymentsService {
  private readonly logger = new Logger(PasabuyPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymongo: PaymongoService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async createCheckout(userId: string, requestId: string) {
    const request = await this.prisma.pasabuyRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        requesterUserId: true,
        status: true,
        paymentStatus: true,
        paymentDeadline: true,
        convenienceFee: true,
      },
    });
    if (!request || request.requesterUserId !== userId) {
      throw new NotFoundException('Pasabuy request not found');
    }
    if (request.status !== 'AWAITING_PAYMENT' ||
      !['AWAITING_PAYMENT', 'PAYMENT_FAILED'].includes(request.paymentStatus) ||
      !request.paymentDeadline || request.paymentDeadline <= new Date()) {
      throw new ConflictException('Pasabuy fee can no longer be paid');
    }

    let payment = await this.prisma.payment.findUnique({
      where: { pasabuyRequestId: requestId },
    });
    if (payment?.checkoutUrl && payment.providerPaymentId &&
      payment.status === PaymentStatus.PENDING) {
      return this.checkoutResponse(payment, requestId, true);
    }
    if (payment?.status === PaymentStatus.PENDING) {
      throw new ConflictException('Pasabuy checkout is being created');
    }
    if (payment?.status === PaymentStatus.SUCCEEDED) {
      throw new ConflictException('Pasabuy fee has already been paid');
    }

    if (payment?.status === PaymentStatus.FAILED) {
      const reserved = await this.prisma.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.FAILED, providerPaymentId: null },
        data: { status: PaymentStatus.PENDING },
      });
      if (!reserved.count) throw new ConflictException('Pasabuy checkout is being created');
    } else {
      try {
        payment = await this.prisma.payment.create({
          data: {
            payerUserId: userId,
            purpose: PaymentPurpose.PASABUY,
            pasabuyRequestId: requestId,
            amount: request.convenienceFee,
            currency: 'PHP',
            status: PaymentStatus.PENDING,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Pasabuy checkout is being created');
        }
        throw error;
      }
    }
    if (!payment) throw new ConflictException('Pasabuy checkout is being created');

    let checkout: Awaited<ReturnType<PaymongoService['createCheckoutSession']>>;
    try {
      checkout = await this.paymongo.createCheckoutSession({
        amount: request.convenienceFee.mul(100).toNumber(),
        description: `QueueLess Pasabuy fee ${requestId}`,
        referenceNumber: payment.id,
        pasabuyRequestId: requestId,
        itemName: 'QueueLess Pasabuy convenience fee',
      });
    } catch (error) {
      const [, changed] = await this.prisma.$transaction([
        this.prisma.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING, providerPaymentId: null },
          data: { status: PaymentStatus.FAILED },
        }),
        this.prisma.pasabuyRequest.updateMany({
          where: { id: requestId, status: 'AWAITING_PAYMENT', paymentStatus: 'AWAITING_PAYMENT' },
          data: { paymentStatus: 'PAYMENT_FAILED' },
        }),
      ]);
      if (changed.count) await this.realtimeGateway.emitPasabuyStatusUpdated(requestId);
      throw error;
    }

    const linked = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING, providerPaymentId: null },
      data: {
        providerPaymentId: checkout.checkoutSessionId,
        checkoutUrl: checkout.checkoutUrl,
      },
    });
    if (!linked.count) {
      // A valid paid webhook can arrive before the checkout response is saved.
      const confirmed = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (confirmed.status === PaymentStatus.SUCCEEDED) {
        return { ...this.checkoutResponse(confirmed, requestId, false), status: 'SUCCEEDED' };
      }
      throw new ConflictException('Checkout state changed; please check payment status');
    }
    const saved = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    return this.checkoutResponse(saved, requestId, false);
  }

  private checkoutResponse(
    payment: { id: string; amount: Prisma.Decimal; currency: string;
      status: PaymentStatus; providerPaymentId: string | null; checkoutUrl: string | null },
    requestId: string,
    idempotentReplay: boolean,
  ) {
    return {
      paymentId: payment.id,
      pasabuyRequestId: requestId,
      amount: payment.amount.toFixed(2),
      currency: payment.currency,
      status: payment.status,
      checkoutSessionId: payment.providerPaymentId,
      checkoutUrl: payment.checkoutUrl,
      idempotentReplay,
    };
  }

  async confirmPaid(paymentId: string, providerPaymentResourceId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        select: { pasabuyRequestId: true, status: true, providerPaymentResourceId: true },
      });
      if (!payment.pasabuyRequestId) throw new ConflictException('Payment has no Pasabuy request');
      if (payment.providerPaymentResourceId &&
        payment.providerPaymentResourceId !== providerPaymentResourceId) {
        throw new ConflictException('A different provider payment already succeeded');
      }

      const updated = await tx.payment.updateMany({
        where: { id: paymentId, status: { not: PaymentStatus.SUCCEEDED } },
        data: { status: PaymentStatus.SUCCEEDED, providerPaymentResourceId },
      });
      const request = await tx.pasabuyRequest.updateMany({
        where: {
          id: payment.pasabuyRequestId,
          status: 'AWAITING_PAYMENT',
          paymentStatus: { in: ['AWAITING_PAYMENT', 'PAYMENT_FAILED'] },
        },
        data: { status: 'PAID', paymentStatus: 'PAID' },
      });
      if (request.count) {
        await tx.pasabuyStatusHistory.create({
          data: {
            pasabuyRequestId: payment.pasabuyRequestId,
            status: 'PAID',
            note: 'Pasabuy fee confirmed by PayMongo webhook',
          },
        });
      }
      const currentRequest = await tx.pasabuyRequest.findUniqueOrThrow({
        where: { id: payment.pasabuyRequestId },
        select: { paymentStatus: true },
      });
      return {
        duplicate: !updated.count,
        requestMarkedPaid: !!request.count,
        autoRefund: !request.count && currentRequest.paymentStatus !== 'PAID',
        pasabuyRequestId: payment.pasabuyRequestId,
      };
    });
    if (result.requestMarkedPaid) {
      await this.realtimeGateway.emitPasabuyStatusUpdated(result.pasabuyRequestId);
    }
    return result;
  }

  @Interval(30_000)
  async expireUnpaidAssignments() {
    const expired = await this.prisma.pasabuyRequest.findMany({
      where: {
        status: 'AWAITING_PAYMENT',
        paymentDeadline: { lte: new Date() },
      },
      select: { id: true, fulfillerUserId: true, payment: {
        select: { providerPaymentId: true, status: true } } },
      take: 50,
    });
    for (const request of expired) {
      try {
        const payment = request.payment;
        if (payment?.status === PaymentStatus.SUCCEEDED) continue;
        if (payment?.providerPaymentId &&
          !(await this.paymongo.expireCheckoutSession(payment.providerPaymentId))) continue;

        const changed = await this.prisma.$transaction(async (tx) => {
          const changed = await tx.pasabuyRequest.updateMany({
            where: { id: request.id, status: 'AWAITING_PAYMENT',
              paymentDeadline: { lte: new Date() } },
            data: { status: 'PAYMENT_EXPIRED', paymentStatus: 'PAYMENT_EXPIRED',
              fulfillerUserId: null },
          });
          if (changed.count) {
            await tx.payment.updateMany({
              where: {
                pasabuyRequestId: request.id,
                status: PaymentStatus.PENDING,
              },
              data: { status: PaymentStatus.FAILED },
            });
            await tx.pasabuyStatusHistory.create({
              data: { pasabuyRequestId: request.id, status: 'PAYMENT_EXPIRED',
                note: 'The fee payment window expired' },
            });
          }
          return changed.count;
        });
        if (changed) {
          await this.realtimeGateway.emitPasabuyStatusUpdated(request.id,
            request.fulfillerUserId ?? undefined);
        }
      } catch (error) {
        this.logger.warn(`Could not expire Pasabuy request ${request.id}: ${String(error)}`);
      }
    }
  }
}
