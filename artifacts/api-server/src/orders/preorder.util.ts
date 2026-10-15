import { OrderStatus } from '@prisma/client';

/** How long a buyer has to pay a pre-order at reservation before it expires. */
export const PREORDER_PAYMENT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Status a just-paid order moves to. Pre-orders wait in SCHEDULED until
 * their release time; everything else (and pre-orders already due) goes
 * straight to the live queue as PAID.
 */
export function resolvePaidStatus(
  order: { isPreorder: boolean; scheduledReleaseAt: Date | null },
  now: Date = new Date(),
): OrderStatus {
  return order.isPreorder &&
    order.scheduledReleaseAt &&
    order.scheduledReleaseAt.getTime() > now.getTime()
    ? OrderStatus.SCHEDULED
    : OrderStatus.PAID;
}
