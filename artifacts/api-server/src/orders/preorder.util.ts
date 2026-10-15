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

/** How long after the pickup time a ready pre-order may sit before it is flagged as uncollected. */
export const UNCOLLECTED_GRACE_MS = 30 * 60 * 1000;

export function isUncollectedPreorder(
  order: { isPreorder: boolean; status: OrderStatus; pickupAt: Date | null },
  now: Date = new Date(),
): boolean {
  return (
    order.isPreorder &&
    order.status === OrderStatus.READY_FOR_PICKUP &&
    order.pickupAt !== null &&
    now.getTime() > order.pickupAt.getTime() + UNCOLLECTED_GRACE_MS
  );
}

/**
 * A student may reschedule or cancel a pre-order until its release time —
 * the moment it enters the vendor's live queue and preparation can begin.
 */
export function getPreorderModifyState(
  order: {
    isPreorder: boolean;
    status: OrderStatus;
    scheduledReleaseAt: Date | null;
  },
  now: Date = new Date(),
): { canModify: boolean; lockedReason: string | null } {
  if (!order.isPreorder) return { canModify: false, lockedReason: null };
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.COMPLETED) {
    return { canModify: false, lockedReason: null };
  }
  const beforeRelease =
    !order.scheduledReleaseAt || order.scheduledReleaseAt.getTime() > now.getTime();
  if (
    (order.status === OrderStatus.PENDING || order.status === OrderStatus.SCHEDULED) &&
    beforeRelease
  ) {
    return { canModify: true, lockedReason: null };
  }
  return {
    canModify: false,
    lockedReason:
      'Changes closed when your pre-order was sent to the vendor to prepare. Contact the vendor if you need help.',
  };
}
