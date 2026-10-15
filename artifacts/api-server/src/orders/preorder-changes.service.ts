import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CancellationReason,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymongoService } from '../payments/paymongo.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RefundsService } from '../refunds/refunds.service';
import { resolvePreorderWindows, upcomingWindows } from '../vendors/availability.util';
import { CancelPreorderDto, ReschedulePreorderDto } from './dto/preorder-change.dto';
import {
  changeCutoffAt,
  isReservationExpired,
  pickupWindowEndsAt,
  preorderMinLeadMinutes,
  queueReleaseAt,
  validatePreorderSlot,
} from './preorder-slot.policy';

// Refund category recorded when a student cancels a paid preorder (US-029 rules).
export const CUSTOMER_PREORDER_REFUND_CATEGORY = 'CUSTOMER_CANCELLED_PREORDER';

const CHANGEABLE: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.SCHEDULED];

const PREORDER_SELECT = {
  id: true,
  customerId: true,
  vendorId: true,
  status: true,
  isPreorder: true,
  scheduledPickupAt: true,
  queueReleaseAt: true,
  reservationExpiresAt: true,
  updatedAt: true,
  items: { select: { product: { select: { preparationTimeMinutes: true } } } },
  vendor: {
    select: {
      preorderSameAsStoreHours: true,
      preorderAvailability: {
        select: { dayOfWeek: true, isEnabled: true, openTime: true, closeTime: true },
      },
      availability: {
        select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true },
      },
    },
  },
  paymentShares: {
    select: {
      payment: { select: { id: true, status: true, provider: true, providerPaymentId: true } },
    },
  },
} satisfies Prisma.OrderSelect;

type Preorder = Prisma.OrderGetPayload<{ select: typeof PREORDER_SELECT }>;

/**
 * US-060: a student views, reschedules or cancels their own preorder until
 * the change cutoff (when it enters the vendor's live queue). Cancelling a
 * paid preorder refunds it through the existing automatic refund rules.
 */
@Injectable()
export class PreorderChangesService {
  private readonly logger = new Logger(PreorderChangesService.name);

  // Current time; replaced in tests.
  clock: () => Date = () => new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly refundsService: RefundsService,
    private readonly paymongo: PaymongoService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async view(userId: string, orderId: string) {
    const order = await this.load(this.prisma, userId, orderId);
    const now = this.clock();
    const cutoff = changeCutoffAt(order);
    const changeable = this.changeBlocker(order, now) === null;
    const leadMinutes = this.leadMinutes(order);
    const windows = resolvePreorderWindows(order.vendor);

    return {
      orderId: order.id,
      orderReference: order.id.slice(0, 8).toUpperCase(),
      status: order.status,
      scheduledPickupAt: order.scheduledPickupAt,
      queueReleaseAt: order.queueReleaseAt,
      reservationExpiresAt: order.reservationExpiresAt,
      changeCutoffAt: cutoff,
      canReschedule: changeable,
      canCancel: changeable,
      refundOnCancel: changeable && order.status === OrderStatus.SCHEDULED,
      // Windows the student could move to (earliest bookable first).
      rescheduleWindows: changeable
        ? upcomingWindows(windows, new Date(now.getTime() + leadMinutes * 60_000), 6)
        : [],
      serverTime: now,
    };
  }

  async reschedule(userId: string, orderId: string, dto: ReschedulePreorderDto) {
    const slot = new Date(dto.scheduledPickupAt);
    const now = this.clock();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await this.load(tx, userId, orderId);
      this.assertChangeable(order, now);

      if (order.scheduledPickupAt?.getTime() === slot.getTime()) {
        return { order, changed: false };
      }

      const windows = resolvePreorderWindows(order.vendor);
      const leadMinutes = this.leadMinutes(order);
      validatePreorderSlot({ slot, now, windows, leadMinutes });
      const releaseAt = queueReleaseAt(slot, windows, leadMinutes);

      await tx.order.update({
        where: { id: order.id },
        data: {
          scheduledPickupAt: slot,
          estimatedReadyAt: slot,
          queueReleaseAt: releaseAt,
          pickupWindowEndsAt: pickupWindowEndsAt(slot, windows),
          // An unpaid reservation keeps its payment deadline, never past the new slot.
          ...(order.status === OrderStatus.PENDING && order.reservationExpiresAt
            ? { reservationExpiresAt: new Date(Math.min(order.reservationExpiresAt.getTime(), slot.getTime())) }
            : {}),
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: order.status,
          changedByUserId: userId,
          note: `Pickup rescheduled by the student from ${order.scheduledPickupAt?.toISOString()} to ${slot.toISOString()}`,
        },
      });
      await tx.auditRecord.create({ data: {
        actorUserId: userId, actionType: 'ORDER_PICKUP_RESCHEDULED',
        entityType: 'Order', entityId: order.id,
        beforeState: { scheduledPickupAt: order.scheduledPickupAt?.toISOString() ?? null,
          queueReleaseAt: order.queueReleaseAt?.toISOString() ?? null },
        afterState: { scheduledPickupAt: slot.toISOString(), queueReleaseAt: releaseAt.toISOString() },
      } });
      return { order: await this.load(tx, userId, orderId), changed: true };
    });

    if (result.changed) await this.notify(result.order);
    return { ...(await this.view(userId, orderId)), rescheduled: result.changed };
  }

  async cancel(userId: string, orderId: string, dto: CancelPreorderDto) {
    const now = this.clock();
    const reason = dto.reason?.trim() || null;

    // Close an open PayMongo checkout first so an unpaid reservation cannot
    // be paid after it is cancelled. A provider call never runs in a transaction.
    const current = await this.load(this.prisma, userId, orderId);
    this.assertChangeable(current, now);
    if (current.status === OrderStatus.PENDING) {
      for (const payment of this.payments(current)) {
        if (
          payment.status === PaymentStatus.PENDING &&
          payment.provider === PaymentProvider.PAYMONGO &&
          payment.providerPaymentId &&
          !(await this.paymongo.expireCheckoutSession(payment.providerPaymentId))
        ) {
          throw new ConflictException(
            'Your payment is being confirmed; try again in a moment',
          );
        }
      }
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await this.load(tx, userId, orderId);
      this.assertChangeable(order, now);

      const changed = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason: CancellationReason.CUSTOMER_REQUEST,
          cancellationNote: reason ?? 'Preorder cancelled by the student',
        },
      });
      if (!changed.count) {
        throw new ConflictException('This preorder changed; reload and try again');
      }
      if (order.status === OrderStatus.PENDING) {
        await tx.payment.updateMany({
          where: { id: { in: this.payments(order).map((p) => p.id) }, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.FAILED },
        });
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: OrderStatus.CANCELLED,
          changedByUserId: userId,
          note: reason ? `Preorder cancelled by the student: ${reason}` : 'Preorder cancelled by the student',
        },
      });
      await tx.auditRecord.create({ data: {
        actorUserId: userId, actionType: 'ORDER_STATUS_UPDATED',
        entityType: 'Order', entityId: order.id,
        beforeState: { status: order.status },
        afterState: { status: OrderStatus.CANCELLED, source: 'CUSTOMER_PREORDER_CANCEL' },
      } });
      return { order: await this.load(tx, userId, orderId), wasPaid: order.status === OrderStatus.SCHEDULED };
    });

    await this.notify(cancelled.order);

    // US-029: a paid preorder is refunded by the existing automatic refund
    // flow (PayMongo or wallet), after the cancellation has committed.
    const refunds = cancelled.wasPaid
      ? await this.refundsService.autoRefundOrderPayments(orderId, CUSTOMER_PREORDER_REFUND_CATEGORY, reason)
      : [];

    return {
      orderId: cancelled.order.id,
      status: cancelled.order.status,
      refunded: refunds.length > 0,
      refunds,
    };
  }

  // Only the student who placed it can see or change it; others get 404.
  private async load(
    db: Pick<PrismaService, 'order'> | Prisma.TransactionClient,
    userId: string,
    orderId: string,
  ): Promise<Preorder> {
    const order = await db.order.findFirst({
      where: { id: orderId, customerId: userId },
      select: PREORDER_SELECT,
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.isPreorder) throw new BadRequestException('This order is not a preorder');
    return order;
  }

  private changeBlocker(order: Preorder, now: Date): string | null {
    if (!CHANGEABLE.includes(order.status)) {
      return `This preorder can no longer be changed (status ${order.status})`;
    }
    // Only an unpaid reservation can expire; a paid one's deadline is moot.
    if (order.status === OrderStatus.PENDING && isReservationExpired(order, now)) {
      return 'This reservation expired before it was paid';
    }
    const cutoff = changeCutoffAt(order);
    if (cutoff && now >= cutoff) {
      return `The change cutoff passed at ${cutoff.toISOString()}; the vendor may already be preparing it`;
    }
    return null;
  }

  private assertChangeable(order: Preorder, now: Date) {
    const blocker = this.changeBlocker(order, now);
    if (blocker) throw new ConflictException(blocker);
  }

  private leadMinutes(order: Preorder) {
    return Math.max(
      preorderMinLeadMinutes(),
      ...order.items.map((item) => item.product.preparationTimeMinutes),
    );
  }

  private payments(order: Preorder) {
    return order.paymentShares.flatMap((share) => (share.payment ? [share.payment] : []));
  }

  private async notify(order: Preorder) {
    await this.realtimeGateway.emitOrderStatusUpdated(order.customerId, {
      orderId: order.id,
      status: order.status,
      updatedAt: order.updatedAt,
    });
  }
}
