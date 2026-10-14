import { OrderStatus, PasabuyStatus, Prisma } from '@prisma/client';

// Who collects a READY_FOR_PICKUP order, and therefore hears the buzzer
// (US-067 order.ready) and sees it in GET /orders/ready-for-pickup (US-068):
//   - normal order: the customer and JOINED group-order participants
//   - Pasabuy order: only the assigned fulfiller while the request is active
export const ACTIVE_FULFILLER_STATUSES: PasabuyStatus[] = [
  PasabuyStatus.ACCEPTED,
  PasabuyStatus.AWAITING_PAYMENT,
  PasabuyStatus.PAID,
];

export function readyPickupWhere(userId: string): Prisma.OrderWhereInput {
  return {
    status: OrderStatus.READY_FOR_PICKUP,
    OR: [
      { isPasabuyRequest: false, customerId: userId },
      {
        isPasabuyRequest: false,
        groupOrder: { participants: { some: { userId, status: 'JOINED' } } },
      },
      {
        isPasabuyRequest: true,
        pasabuyRequests: {
          some: { fulfillerUserId: userId, status: { in: ACTIVE_FULFILLER_STATUSES } },
        },
      },
    ],
  };
}

// The status-history row written when the vendor marked the order ready. Its
// id is the order.ready eventId, so clients dedupe socket and REST the same way.
export const READY_HISTORY_SELECT = {
  where: { status: OrderStatus.READY_FOR_PICKUP },
  orderBy: { changedAt: 'desc' },
  take: 1,
  select: { id: true, changedAt: true },
} satisfies Prisma.Order$statusHistoryArgs;

export function readyFields(history: { id: string; changedAt: Date }[] | undefined) {
  const ready = history?.[0];
  return {
    readyAt: ready?.changedAt ?? null,
    readyEventId: ready?.id ?? null,
  };
}
