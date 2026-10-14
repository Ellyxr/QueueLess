// US-068: authoritative order responses expose readyAt/readyEventId so the
// client can tell a new ready event from one it already rang for after a
// reconnect, and GET /orders/ready-for-pickup lists every order the student
// collects. Runs against the compiled service (pnpm build first):
//   node --test test/order-ready-recovery-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { OrdersService } = require('../dist/orders/orders.service');
const { readyPickupWhere, READY_HISTORY_SELECT, ACTIVE_FULFILLER_STATUSES } = require('../dist/orders/order-ready.policy');

const ORDER_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const READY_AT = new Date('2026-10-15T08:00:00Z');
const VENDOR = { id: 'vendor', name: 'Kuya Grill', pickupLocation: 'Canteen B' };

function serviceWith(order) {
  const calls = [];
  const record = (name) => async (args) => {
    calls.push({ name, args });
    return typeof order[name] === 'function' ? order[name](args) : order[name];
  };
  const prisma = {
    order: { findMany: record('findMany'), findFirst: record('findFirst') },
  };
  return { service: new OrdersService(prisma, {}, {}, {}, {}), calls };
}

test('ready recipients rule: own orders, joined group orders, active Pasabuy fulfiller; READY only', () => {
  const where = readyPickupWhere('student');
  assert.equal(where.status, 'READY_FOR_PICKUP');
  assert.deepEqual(where.OR, [
    { isPasabuyRequest: false, customerId: 'student' },
    { isPasabuyRequest: false, groupOrder: { participants: { some: { userId: 'student', status: 'JOINED' } } } },
    { isPasabuyRequest: true, pasabuyRequests: { some: { fulfillerUserId: 'student', status: { in: ACTIVE_FULFILLER_STATUSES } } } },
  ]);
  // A Pasabuy requester is never matched as the collector.
  assert.ok(!where.OR.some((c) => c.isPasabuyRequest === true && c.customerId));
});

test('ready-for-pickup returns the order.ready event shape, eventId = status-history id', async () => {
  const { service, calls } = serviceWith({
    findMany: [
      { id: ORDER_ID, status: 'READY_FOR_PICKUP', customerId: 'student', isPasabuyRequest: false,
        vendor: VENDOR, statusHistory: [{ id: 'history-1', changedAt: READY_AT }] },
      { id: 'b2c3d4e5-0000', status: 'READY_FOR_PICKUP', customerId: 'friend', isPasabuyRequest: false,
        vendor: VENDOR, statusHistory: [{ id: 'history-2', changedAt: READY_AT }] },
      { id: 'c3d4e5f6-0000', status: 'READY_FOR_PICKUP', customerId: 'requester', isPasabuyRequest: true,
        vendor: VENDOR, statusHistory: [{ id: 'history-3', changedAt: READY_AT }] },
    ],
  });
  const before = Date.now();
  const result = await service.getReadyForPickup('student');

  assert.deepEqual(calls[0].args.where, readyPickupWhere('student'));
  assert.deepEqual(calls[0].args.select.statusHistory, READY_HISTORY_SELECT);
  assert.ok(result.serverTime instanceof Date && result.serverTime.getTime() >= before);
  assert.deepEqual(result.orders[0], {
    eventId: 'history-1', orderId: ORDER_ID, orderReference: 'A1B2C3D4',
    status: 'READY_FOR_PICKUP', readyAt: READY_AT, vendor: VENDOR, pickupRole: 'CUSTOMER',
  });
  assert.deepEqual(result.orders.map((o) => o.pickupRole), ['CUSTOMER', 'GROUP_MEMBER', 'PASABUY_FULFILLER']);
});

test('READY history lookup takes the latest READY row only', () => {
  assert.deepEqual(READY_HISTORY_SELECT, {
    where: { status: 'READY_FOR_PICKUP' }, orderBy: { changedAt: 'desc' }, take: 1,
    select: { id: true, changedAt: true },
  });
});

const listRow = (extra) => ({
  id: ORDER_ID, status: 'READY_FOR_PICKUP', isPreorder: false, isPasabuyRequest: false,
  totalAmount: new Prisma.Decimal('100'), createdAt: READY_AT, paidAt: READY_AT, buyerContactPingAt: null,
  vendor: VENDOR, items: [], refunds: [], statusHistory: [], ...extra,
});

test('GET /orders/mine: readyAt/readyEventId set once ready, kept after completion, null before', async () => {
  const { service, calls } = serviceWith({
    findMany: [
      listRow({ statusHistory: [{ id: 'history-1', changedAt: READY_AT }] }),
      listRow({ id: 'b2c3d4e5-0000', status: 'COMPLETED', statusHistory: [{ id: 'history-2', changedAt: READY_AT }] }),
      listRow({ id: 'c3d4e5f6-0000', status: 'COOKING' }),
    ],
  });
  const orders = await service.getCustomerOrders('student');
  assert.deepEqual(calls[0].args.select.statusHistory, READY_HISTORY_SELECT);
  assert.deepEqual(orders.map((o) => [o.status, o.readyEventId, o.readyAt]), [
    ['READY_FOR_PICKUP', 'history-1', READY_AT],
    ['COMPLETED', 'history-2', READY_AT],
    ['COOKING', null, null],
  ]);
});

test('GET /orders/:id/status: ready fields come from the READY history entry', async () => {
  const { service } = serviceWith({
    findFirst: {
      id: ORDER_ID, customerId: 'student', orderType: 'PICKUP', status: 'COMPLETED',
      isPasabuyRequest: false, isPreorder: false, cancellationReason: null, cancellationNote: null,
      estimatedReadyAt: null, updatedAt: READY_AT, pickupConfirmedAt: READY_AT, paidAt: READY_AT,
      buyerContactPingAt: null, refunds: [], paymentShares: [], vendor: VENDOR, items: [], groupOrder: null,
      statusHistory: [
        { id: 'h-paid', status: 'PAID', note: null, changedAt: new Date('2026-10-15T07:40:00Z') },
        { id: 'history-1', status: 'READY_FOR_PICKUP', note: null, changedAt: READY_AT },
        { id: 'h-done', status: 'COMPLETED', note: null, changedAt: new Date('2026-10-15T08:10:00Z') },
      ],
    },
  });
  const status = await service.getOrderStatus('student', ORDER_ID);
  assert.equal(status.readyEventId, 'history-1');
  assert.equal(status.readyAt, READY_AT);
  assert.equal(status.status, 'COMPLETED');
});

test('GET /orders/:id includes ready fields; campus eventId is unchanged', async () => {
  const { service, calls } = serviceWith({
    findFirst: {
      id: ORDER_ID, customerId: 'student', eventId: 'campus-event', orderType: 'PICKUP',
      status: 'READY_FOR_PICKUP', isPasabuyRequest: false, isPreorder: false,
      cancellationReason: null, cancellationNote: null, estimatedReadyAt: null, pickupConfirmedAt: null,
      subtotal: new Prisma.Decimal('100'), vendor: { ...VENDOR, status: 'ACTIVE' }, items: [],
      statusHistory: [{ id: 'history-1', changedAt: READY_AT }],
    },
  });
  const order = await service.getOrder('student', ORDER_ID);
  assert.deepEqual(calls[0].args.include.statusHistory, READY_HISTORY_SELECT);
  assert.equal(order.eventId, 'campus-event');
  assert.equal(order.readyEventId, 'history-1');
  assert.equal(order.readyAt, READY_AT);
});
