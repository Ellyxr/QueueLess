import { BadRequestException } from '@nestjs/common';
import {
  PreorderWindow,
  getManilaClock,
  upcomingWindows,
} from '../vendors/availability.util';

// US-057: rules for the pickup time a student picks when reserving.
// Lead time is the larger of this floor and the slowest item's prep time.
export const DEFAULT_PREORDER_MIN_LEAD_MINUTES = 30;
export const PREORDER_MAX_DAYS_AHEAD = 7;
// How long after the scheduled pickup an unaccepted preorder is refunded
// (same 5 minutes a regular order gets after payment).
export const PREORDER_ACCEPT_GRACE_MS = 5 * 60 * 1000;

const MINUTE_MS = 60 * 1000;

export function preorderMinLeadMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.PREORDER_MIN_LEAD_MINUTES);
  return Number.isInteger(configured) && configured >= 0 ? configured : DEFAULT_PREORDER_MIN_LEAD_MINUTES;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Throws 400 unless `slot` is in the future, at least `leadMinutes` away,
 * no more than PREORDER_MAX_DAYS_AHEAD days away, and inside one of the
 * vendor's pickup windows (Asia/Manila; close time exclusive). Messages name
 * the earliest window the student could pick instead.
 */
export function validatePreorderSlot(params: {
  slot: Date;
  now: Date;
  windows: PreorderWindow[];
  leadMinutes: number;
}): void {
  const { slot, now, windows, leadMinutes } = params;
  const earliest = new Date(now.getTime() + leadMinutes * MINUTE_MS);
  const suggestion = () => {
    const [next] = upcomingWindows(windows, earliest, 1);
    return next ? ` Earliest available pickup: ${next.label}.` : '';
  };

  if (Number.isNaN(slot.getTime())) {
    throw new BadRequestException('scheduledPickupAt must be a valid date-time');
  }
  if (slot <= now) {
    throw new BadRequestException(`scheduledPickupAt must be in the future.${suggestion()}`);
  }
  if (slot < earliest) {
    throw new BadRequestException(
      `Pickup must be at least ${leadMinutes} minutes from now so the vendor can prepare your order.${suggestion()}`,
    );
  }
  if (slot.getTime() > now.getTime() + PREORDER_MAX_DAYS_AHEAD * 24 * 60 * MINUTE_MS) {
    throw new BadRequestException(
      `Pickup can be scheduled at most ${PREORDER_MAX_DAYS_AHEAD} days ahead`,
    );
  }

  const { dayOfWeek, timeMinutes } = getManilaClock(slot);
  const inWindow = windows.some(
    (window) =>
      window.isEnabled &&
      window.dayOfWeek === dayOfWeek &&
      window.openTime &&
      window.closeTime &&
      timeMinutes >= toMinutes(window.openTime) &&
      timeMinutes < toMinutes(window.closeTime),
  );
  if (!inWindow) {
    throw new BadRequestException(
      `The chosen pickup time is outside the vendor's pickup hours.${suggestion()}`,
    );
  }
}

// US-058: how long an unpaid reservation is held.
export const DEFAULT_PREORDER_PAYMENT_WINDOW_MINUTES = 15;

export function preorderPaymentWindowMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.PREORDER_PAYMENT_WINDOW_MINUTES);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_PREORDER_PAYMENT_WINDOW_MINUTES;
}

/**
 * When an unpaid reservation is released: after the payment window, or at
 * the pickup time if that comes first.
 */
export function reservationExpiresAt(
  createdAt: Date,
  scheduledPickupAt: Date,
  windowMinutes = preorderPaymentWindowMinutes(),
): Date {
  return new Date(Math.min(createdAt.getTime() + windowMinutes * MINUTE_MS, scheduledPickupAt.getTime()));
}

export function isReservationExpired(
  order: { isPreorder: boolean; reservationExpiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  return order.isPreorder && !!order.reservationExpiresAt && order.reservationExpiresAt <= now;
}

/**
 * US-059: when a paid preorder leaves SCHEDULED for the vendor's live queue:
 * the opening of the pickup window that contains the slot, or earlier if the
 * prep lead time needs it (slot - leadMinutes). E.g. window 07:00-10:00,
 * slot 08:00, lead 30 -> 07:00; window 07:00-10:00, slot 07:15, lead 30 -> 06:45.
 */
// The pickup window (Asia/Manila) a slot falls in, as exact start/end instants.
function containingWindow(slot: Date, windows: PreorderWindow[]): { start: Date; end: Date } | null {
  const { dayOfWeek, timeMinutes } = getManilaClock(slot);
  const window = windows.find(
    (w) =>
      w.isEnabled &&
      w.dayOfWeek === dayOfWeek &&
      w.openTime &&
      w.closeTime &&
      timeMinutes >= toMinutes(w.openTime) &&
      timeMinutes < toMinutes(w.closeTime),
  );
  if (!window) return null;
  return {
    start: new Date(slot.getTime() - (timeMinutes - toMinutes(window.openTime!)) * MINUTE_MS),
    end: new Date(slot.getTime() + (toMinutes(window.closeTime!) - timeMinutes) * MINUTE_MS),
  };
}

export function queueReleaseAt(slot: Date, windows: PreorderWindow[], leadMinutes: number): Date {
  const leadStart = slot.getTime() - leadMinutes * MINUTE_MS;
  const window = containingWindow(slot, windows);
  return new Date(window ? Math.min(window.start.getTime(), leadStart) : leadStart);
}

/** US-062: close of the pickup window a slot was booked into (the slot if none). */
export function pickupWindowEndsAt(slot: Date, windows: PreorderWindow[]): Date {
  return containingWindow(slot, windows)?.end ?? slot;
}

// US-062: how long after the pickup window closes a ready preorder may still
// be collected before it is flagged UNCOLLECTED.
export const DEFAULT_PREORDER_PICKUP_GRACE_MINUTES = 30;

export function preorderPickupGraceMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.PREORDER_PICKUP_GRACE_MINUTES);
  return Number.isInteger(configured) && configured >= 0 ? configured : DEFAULT_PREORDER_PICKUP_GRACE_MINUTES;
}

/** US-062: when an uncollected ready preorder is flagged. */
export function uncollectedAfter(
  order: { pickupWindowEndsAt: Date | null; scheduledPickupAt: Date | null },
  graceMinutes = preorderPickupGraceMinutes(),
): Date | null {
  const end = order.pickupWindowEndsAt ?? order.scheduledPickupAt;
  return end ? new Date(end.getTime() + graceMinutes * MINUTE_MS) : null;
}

/**
 * US-059: the status an order gets once fully paid. A preorder whose release
 * time is still ahead is held as SCHEDULED; everything else goes straight to
 * the live queue as PAID.
 */
export function statusAfterPayment(
  order: { isPreorder: boolean; queueReleaseAt: Date | null },
  now: Date = new Date(),
): 'SCHEDULED' | 'PAID' {
  return order.isPreorder && order.queueReleaseAt && order.queueReleaseAt > now ? 'SCHEDULED' : 'PAID';
}

/**
 * US-060: the last moment a student may reschedule or cancel a preorder: when
 * it enters the vendor's live queue (queueReleaseAt), since preparation can
 * start then. Older preorders without a release time use pickup - lead time.
 */
export function changeCutoffAt(order: { queueReleaseAt: Date | null; scheduledPickupAt: Date | null }): Date | null {
  if (order.queueReleaseAt) return order.queueReleaseAt;
  if (!order.scheduledPickupAt) return null;
  return new Date(order.scheduledPickupAt.getTime() - preorderMinLeadMinutes() * MINUTE_MS);
}

/**
 * When the vendor-accept timeout starts: payment time for a regular order,
 * the scheduled pickup time for a preorder (a reservation made at 11 PM must
 * not be refunded because the vendor was asleep).
 */
export function acceptClockStart(order: {
  isPreorder: boolean;
  scheduledPickupAt: Date | null;
  paidAt: Date | null;
}): Date | null {
  return order.isPreorder && order.scheduledPickupAt ? order.scheduledPickupAt : order.paidAt;
}
