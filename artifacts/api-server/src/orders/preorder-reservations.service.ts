import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CancellationReason, OrderStatus, PaymentProvider, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymongoService } from '../payments/paymongo.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/**
 * US-059: releaseScheduledPreorders moves paid preorders from SCHEDULED to
 * the vendor's live queue when their pickup window opens.
 *
 * US-058: a preorder is a reservation only once it is paid. An unpaid
 * preorder past its reservationExpiresAt is cancelled (RESERVATION_EXPIRED)
 * and its slot released. Its open PayMongo checkout is expired first so it can
 * no longer be paid; if PayMongo reports it already paid, the order is left
 * for the payment webhook to mark PAID. A payment that still lands after
 * expiry is refunded by the existing duplicate-payment rule in the webhook.
 */
@Injectable()
export class PreorderReservationsService {
  private readonly logger = new Logger(PreorderReservationsService.name);

  // Current time; replaced in tests.
  clock: () => Date = () => new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymongo: PaymongoService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  @Interval(30_000)
  async expireUnpaidReservations(): Promise<string[]> {
    const now = this.clock();
    const due = await this.prisma.order.findMany({
      where: {
        isPreorder: true,
        status: OrderStatus.PENDING,
        reservationExpiresAt: { lte: now },
      },
      select: {
        id: true,
        paymentShares: {
          select: {
            payment: { select: { id: true, status: true, provider: true, providerPaymentId: true } },
          },
        },
      },
      orderBy: { reservationExpiresAt: 'asc' },
      take: 50,
    });

    const expiredIds: string[] = [];
    for (const order of due) {
      try {
        if (await this.expireOne(order, now)) expiredIds.push(order.id);
      } catch (error) {
        this.logger.warn(`Could not expire reservation ${order.id}: ${String(error)}`);
      }
    }
    return expiredIds;
  }

  /**
   * US-059: moves paid SCHEDULED preorders into the vendor's live queue
   * (PAID) once their queueReleaseAt arrives, recording status history, and
   * tells the vendor (order.created) and the student (order.status.updated).
   */
  @Interval(30_000)
  async releaseScheduledPreorders(): Promise<string[]> {
    const now = this.clock();
    const due = await this.prisma.order.findMany({
      where: { status: OrderStatus.SCHEDULED, queueReleaseAt: { lte: now } },
      select: { id: true },
      orderBy: { queueReleaseAt: 'asc' },
      take: 50,
    });

    const released: string[] = [];
    for (const { id } of due) {
      try {
        const order = await this.prisma.$transaction(async (tx) => {
          const changed = await tx.order.updateMany({
            where: { id, status: OrderStatus.SCHEDULED, queueReleaseAt: { lte: now } },
            data: { status: OrderStatus.PAID },
          });
          if (!changed.count) return null;
          await tx.orderStatusHistory.create({
            data: {
              orderId: id,
              status: OrderStatus.PAID,
              changedByUserId: null,
              note: 'Scheduled preorder released to the live queue',
            },
          });
          await tx.auditRecord.create({ data: {
            actorUserId: null, actionType: 'ORDER_STATUS_UPDATED',
            entityType: 'Order', entityId: id,
            beforeState: { status: OrderStatus.SCHEDULED },
            afterState: { status: OrderStatus.PAID, source: 'SCHEDULED_RELEASE' },
          } });
          return tx.order.findUniqueOrThrow({
            where: { id },
            select: {
              id: true, vendorId: true, customerId: true, status: true, totalAmount: true,
              createdAt: true, updatedAt: true, vendor: { select: { ownerUserId: true } },
            },
          });
        });
        if (!order) continue;

        released.push(order.id);
        this.realtimeGateway.emitNewOrder(order.vendor.ownerUserId, {
          orderId: order.id,
          vendorId: order.vendorId,
          customerId: order.customerId,
          status: order.status,
          totalAmount: order.totalAmount.toFixed(2),
          createdAt: order.createdAt,
        });
        await this.realtimeGateway.emitOrderStatusUpdated(order.customerId, {
          orderId: order.id,
          status: order.status,
          updatedAt: order.updatedAt,
        });
      } catch (error) {
        this.logger.warn(`Could not release scheduled preorder ${id}: ${String(error)}`);
      }
    }
    return released;
  }

  private async expireOne(
    order: {
      id: string;
      paymentShares: {
        payment: { id: string; status: PaymentStatus; provider: PaymentProvider; providerPaymentId: string | null } | null;
      }[];
    },
    now: Date,
  ): Promise<boolean> {
    const payments = order.paymentShares.flatMap((share) => (share.payment ? [share.payment] : []));
    // A succeeded payment means the webhook is about to mark the order PAID.
    if (payments.some((payment) => payment.status === PaymentStatus.SUCCEEDED)) return false;

    for (const payment of payments) {
      if (
        payment.status === PaymentStatus.PENDING &&
        payment.provider === PaymentProvider.PAYMONGO &&
        payment.providerPaymentId &&
        !(await this.paymongo.expireCheckoutSession(payment.providerPaymentId))
      ) {
        return false; // paid at PayMongo; wait for its webhook
      }
    }

    const expired = await this.prisma.$transaction(async (tx) => {
      // Same lock the payment webhook takes, so the two cannot both win.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id}::uuid FOR UPDATE`;
      const changed = await tx.order.updateMany({
        where: {
          id: order.id,
          isPreorder: true,
          status: OrderStatus.PENDING,
          reservationExpiresAt: { lte: now },
        },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason: CancellationReason.RESERVATION_EXPIRED,
          cancellationNote: 'Not paid before the reservation expired',
        },
      });
      if (!changed.count) return null;

      const failed = await tx.payment.updateMany({
        where: { id: { in: payments.map((payment) => payment.id) }, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      });
      for (const payment of failed.count ? payments.filter((p) => p.status === PaymentStatus.PENDING) : []) {
        await tx.auditRecord.create({ data: {
          actorUserId: null, actionType: 'PAYMENT_STATUS_UPDATED',
          entityType: 'Payment', entityId: payment.id,
          beforeState: { status: PaymentStatus.PENDING },
          afterState: { status: PaymentStatus.FAILED, reason: 'RESERVATION_EXPIRED' },
        } });
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: OrderStatus.CANCELLED,
          changedByUserId: null,
          note: 'Reservation expired before payment',
        },
      });
      await tx.auditRecord.create({ data: {
        actorUserId: null, actionType: 'ORDER_STATUS_UPDATED',
        entityType: 'Order', entityId: order.id,
        beforeState: { status: OrderStatus.PENDING },
        afterState: { status: OrderStatus.CANCELLED, source: 'RESERVATION_EXPIRED' },
      } });
      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { id: true, customerId: true, status: true, updatedAt: true },
      });
    });

    if (!expired) return false;
    await this.realtimeGateway.emitOrderStatusUpdated(expired.customerId, {
      orderId: expired.id,
      status: expired.status,
      updatedAt: expired.updatedAt,
    });
    return true;
  }
}
