// US-071: failure paths for the preorder background jobs. Two API instances
// (or an overlapping tick) run the same job at once against one database:
// each order must be released / expired / flagged exactly once, and an order
// handed to a job too early must not be released.
// Run after `pnpm build`:  node --test test/preorder-jobs-concurrency-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { PreorderReservationsService } = require('../dist/orders/preorder-reservations.service');

const NOW = new Date('2026-10-13T07:00:00+08:00');
const minutes = (n) => new Date(NOW.getTime() + n * 60_000);

// One shared in-memory database; transactions run one at a time, like rows
// locked in Postgres, so two "instances" really do race on the same rows.
function sharedDatabase(orders) {
  const db = { orders: structuredClone(orders), history: [], audits: [], events: [], expiredSessions: [] };
  let queue = Promise.resolve();
  const matches = (order, where) =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'id') return order.id === value;
      if (value && typeof value === 'object' && 'lte' in value) return order[key] !== null && order[key] <= value.lte;
      return order[key] === value;
    });
  const tx = {
    $queryRaw: async () => [],
    order: {
      updateMany: async ({ where, data }) => {
        const order = db.orders.find((o) => matches(o, where));
        if (!order) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }) => {
        const order = db.orders.find((o) => o.id === where.id);
        return { ...order, vendorId: 'vendor', customerId: 'student', totalAmount: new Prisma.Decimal('120'),
          createdAt: NOW, updatedAt: NOW, vendor: { ownerUserId: 'owner' } };
      },
    },
    payment: { updateMany: async () => ({ count: 1 }) },
    orderStatusHistory: { create: async ({ data }) => { db.history.push(data); return { id: `h${db.history.length}` }; } },
    auditRecord: { create: async ({ data }) => db.audits.push(data) },
  };
  // Every instance reads the same rows (both see the order as due).
  const findMany = async ({ where }) => db.orders
    .filter((o) => o.status === where.status && (!where.isPreorder || o.isPreorder))
    .map((o) => ({ ...o, paymentShares: [] }));
  const prisma = {
    order: { findMany },
    $transaction: (work) => {
      const run = queue.then(() => work(tx));
      queue = run.catch(() => undefined);
      return run;
    },
  };
  const realtime = {
    emitNewOrder: (owner, payload) => db.events.push(['order.created', payload.orderId]),
    emitOrderStatusUpdated: async (user, payload) => db.events.push(['order.status.updated', payload.status]),
    emitPreorderEvent: async (event, orderId) => db.events.push([event, orderId]),
  };
  const paymongo = { expireCheckoutSession: async (id) => { db.expiredSessions.push(id); return true; } };
  const instance = () => {
    const service = new PreorderReservationsService(prisma, paymongo, realtime);
    service.clock = () => NOW;
    service.logger.warn = () => {};
    return service;
  };
  return { db, instance };
}

test('two instances releasing at once: each scheduled preorder is released exactly once', async () => {
  const { db, instance } = sharedDatabase([
    { id: 'a', status: 'SCHEDULED', isPreorder: true, queueReleaseAt: minutes(-1) },
    { id: 'b', status: 'SCHEDULED', isPreorder: true, queueReleaseAt: minutes(0) },
  ]);
  const [first, second] = await Promise.all([instance().releaseScheduledPreorders(), instance().releaseScheduledPreorders()]);

  assert.deepEqual([...first, ...second].sort(), ['a', 'b'], 'each released by exactly one instance');
  assert.deepEqual(db.orders.map((o) => o.status), ['PAID', 'PAID']);
  assert.equal(db.history.length, 2, 'one history row per order');
  assert.equal(db.events.filter(([e]) => e === 'preorder.released').length, 2);
  assert.equal(db.events.filter(([e]) => e === 'order.created').length, 2, 'the vendor is told once per order');
});

test('a release run that comes back later does nothing (no duplicate release)', async () => {
  const { db, instance } = sharedDatabase([{ id: 'a', status: 'SCHEDULED', isPreorder: true, queueReleaseAt: minutes(-1) }]);
  assert.deepEqual(await instance().releaseScheduledPreorders(), ['a']);
  assert.deepEqual(await instance().releaseScheduledPreorders(), []);
  assert.equal(db.history.length, 1);
});

test('early release: an order handed to the job before its release time is not released', async () => {
  // e.g. a stale read or a clock-skewed instance: the conditional update refuses.
  const { db, instance } = sharedDatabase([{ id: 'early', status: 'SCHEDULED', isPreorder: true, queueReleaseAt: minutes(5) }]);
  assert.deepEqual(await instance().releaseScheduledPreorders(), []);
  assert.equal(db.orders[0].status, 'SCHEDULED');
  assert.deepEqual([db.history.length, db.events.length], [0, 0]);
});

test('two instances expiring unpaid reservations at once: cancelled exactly once', async () => {
  const { db, instance } = sharedDatabase([
    { id: 'unpaid', status: 'PENDING', isPreorder: true, reservationExpiresAt: minutes(-1) },
  ]);
  const results = await Promise.all([instance().expireUnpaidReservations(), instance().expireUnpaidReservations()]);
  assert.deepEqual(results.flat(), ['unpaid']);
  assert.equal(db.orders[0].status, 'CANCELLED');
  assert.equal(db.orders[0].cancellationReason, 'RESERVATION_EXPIRED');
  assert.equal(db.history.length, 1);
  assert.deepEqual(db.events, [['order.status.updated', 'CANCELLED']]);
});

test('two instances flagging uncollected preorders at once: flagged exactly once', async () => {
  const { db, instance } = sharedDatabase([
    { id: 'left', status: 'READY_FOR_PICKUP', isPreorder: true, pickupConfirmedAt: null,
      pickupWindowEndsAt: minutes(-60), scheduledPickupAt: minutes(-90) },
  ]);
  const results = await Promise.all([instance().flagUncollectedPreorders(), instance().flagUncollectedPreorders()]);
  assert.deepEqual(results.flat(), ['left']);
  assert.equal(db.orders[0].status, 'UNCOLLECTED');
  assert.equal(db.history.length, 1);
  assert.equal(db.events.filter(([e]) => e === 'preorder.uncollected').length, 1);
});
