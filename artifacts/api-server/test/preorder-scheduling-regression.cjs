// US-057: reserve at any hour with a pickup time inside the vendor's hours.
// Covers slot validation (future, lead time, inside a window, max days
// ahead, Asia/Manila), the create-order DTO, server-side pricing,
// idempotency, and the vendor-accept timeout starting at the pickup time.
// Run after `pnpm build`:  node --test test/preorder-scheduling-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { Prisma } = require('@prisma/client');
const { validatePreorderSlot, preorderMinLeadMinutes, acceptClockStart } = require('../dist/orders/preorder-slot.policy');
const { CreateOrderDto } = require('../dist/orders/dto/create-order.dto');
const { OrdersService } = require('../dist/orders/orders.service');
const { RefundsService } = require('../dist/refunds/refunds.service');

const status = (error) => error.getStatus?.();
// Manila is UTC+8, no DST. 2026-10-12 is a Monday.
const manila = (local) => new Date(`${local}+08:00`);
const MON = (time) => manila(`2026-10-12T${time}:00`);
const TUE = (time) => manila(`2026-10-13T${time}:00`);
const win = (dayOfWeek, openTime, closeTime) => ({ dayOfWeek, isEnabled: true, openTime, closeTime });
const WINDOWS = [win('TUESDAY', '07:00', '10:00'), win('TUESDAY', '13:00', '16:00')];

// ------------------------------------------------------------ slot rules

const slot = (at, now = MON('23:00'), leadMinutes = 30) => () =>
  validatePreorderSlot({ slot: at, now, windows: WINDOWS, leadMinutes });

test('the story: reserve Monday 11 PM, pick up Tuesday 8 AM', () => {
  assert.doesNotThrow(slot(TUE('08:00')));
  assert.doesNotThrow(slot(new Date('2026-10-13T00:00:00Z')), 'same instant written in UTC');
});

test('invalid slots are rejected with 400 and point to the earliest valid pickup', () => {
  const cases = [
    ['in the past', MON('22:00'), /must be in the future/],
    ['exactly now', MON('23:00'), /must be in the future/],
    ['inside the lead time', TUE('07:10'), /at least 30 minutes/, TUE('06:50')],
    ['before the window opens', TUE('06:59'), /outside the vendor's pickup hours/],
    ['at closing time (exclusive)', TUE('10:00'), /outside the vendor's pickup hours/],
    ['between two windows', TUE('11:30'), /outside the vendor's pickup hours/],
    ['a day with no window', manila('2026-10-14T08:00:00'), /outside the vendor's pickup hours/],
    ['Sunday', manila('2026-10-18T08:00:00'), /outside the vendor's pickup hours/],
    ['more than 7 days ahead', manila('2026-10-20T08:00:00'), /at most 7 days/],
    ['not a date', new Date('nope'), /valid date-time/],
  ];
  for (const [name, at, message, now] of cases) {
    assert.throws(slot(at, now), (e) => status(e) === 400 && message.test(e.message), name);
  }
  assert.throws(slot(TUE('11:30')), /Earliest available pickup: Tomorrow, 7:00 AM - 10:00 AM\./);
});

test('the window check uses Manila time, not UTC', () => {
  // 23:30 UTC Monday = 07:30 Tuesday Manila: inside the 07:00-10:00 window.
  assert.doesNotThrow(slot(new Date('2026-10-12T23:30:00Z'), MON('20:00')));
  // 08:00 UTC Tuesday looks like "8 AM" but is 16:00 Manila: closing time, outside.
  assert.throws(slot(new Date('2026-10-13T08:00:00Z'), MON('20:00')), /outside/);
});

test('minimum lead time is configurable and defaults to 30 minutes', () => {
  assert.equal(preorderMinLeadMinutes({}), 30);
  assert.equal(preorderMinLeadMinutes({ PREORDER_MIN_LEAD_MINUTES: '45' }), 45);
  assert.equal(preorderMinLeadMinutes({ PREORDER_MIN_LEAD_MINUTES: 'abc' }), 30);
});

// -------------------------------------------------------------------- DTO

const dtoErrors = (body) => validateSync(plainToInstance(CreateOrderDto, body)).map((e) => e.property);
const CART = '0f8fad5b-d9cb-469f-a165-70867728950e';

test('DTO: a preorder needs scheduledPickupAt with an explicit timezone offset', () => {
  assert.deepEqual(dtoErrors({ cartId: CART }), []);
  assert.deepEqual(dtoErrors({ cartId: CART, isPreorder: true, scheduledPickupAt: '2026-10-13T08:00:00+08:00' }), []);
  assert.deepEqual(dtoErrors({ cartId: CART, isPreorder: true, scheduledPickupAt: '2026-10-13T00:00:00Z' }), []);
  assert.deepEqual(dtoErrors({ cartId: CART, isPreorder: true }), ['scheduledPickupAt']);
  assert.deepEqual(dtoErrors({ cartId: CART, isPreorder: true, scheduledPickupAt: '2026-10-13T08:00:00' }), ['scheduledPickupAt']);
  assert.deepEqual(dtoErrors({ cartId: CART, isPreorder: true, scheduledPickupAt: 'tomorrow 8am' }), ['scheduledPickupAt']);
});

// -------------------------------------------------- order creation (service)

function harness({ prepMinutes = 10, price = '60.00' } = {}) {
  const state = { keys: {}, orders: [], carts: { cart: 'ACTIVE' }, now: MON('23:00') };
  const vendor = { id: 'vendor', ownerUserId: 'owner', name: 'V', status: 'ACTIVE', preorderEnabled: true };
  const tx = {
    orderIdempotencyKey: {
      create: async ({ data }) => { state.keys[data.key] = { ...data, orderId: null }; },
      update: async ({ where, data }) => Object.assign(state.keys[where.userId_key.key], data),
    },
    cart: {
      findFirst: async () => (state.carts.cart === 'ACTIVE' ? { id: 'cart', vendorId: 'vendor', vendor, items: [{
        productId: 'p1', quantity: 2,
        product: { vendorId: 'vendor', name: 'Silog', isAvailable: true, price: new Prisma.Decimal(price), preparationTimeMinutes: prepMinutes },
      }] } : null),
      updateMany: async () => { state.carts.cart = 'CHECKED_OUT'; return { count: 1 }; },
    },
    vendor: { findUniqueOrThrow: async () => ({ preorderSameAsStoreHours: false, preorderAvailability: WINDOWS, availability: [] }) },
    order: {
      create: async ({ data }) => {
        const order = { ...data, id: `order-${state.orders.length + 1}-xxxx`, vendor: { ...vendor }, items: [],
          cancellationReason: null, cancellationNote: null, pickupConfirmedAt: null, createdAt: state.now };
        state.orders.push(order);
        return order;
      },
    },
    auditRecord: { create: async () => {} },
  };
  const prisma = {
    orderIdempotencyKey: { findUnique: async ({ where }) => {
      const key = state.keys[where.userId_key.key];
      return key && { ...key, order: state.orders.find((o) => o.id === key.orderId) ?? null };
    } },
    $transaction: async (work) => {
      const before = JSON.stringify({ keys: state.keys, carts: state.carts, n: state.orders.length });
      try {
        return await work(tx);
      } catch (error) {
        const snap = JSON.parse(before);
        state.keys = snap.keys; state.carts = snap.carts; state.orders.length = snap.n;
        throw error;
      }
    },
  };
  const pricing = { calculateOrderTotals: (subtotal) => ({
    subtotal, marketplaceFee: new Prisma.Decimal(0), totalAmount: subtotal, marketplaceFeeRate: new Prisma.Decimal(0), ruleVersion: 't',
  }) };
  const service = new OrdersService(prisma, {}, {}, pricing, { emitNewOrder: () => {} });
  service.clock = () => state.now;
  return { service, state };
}

const PREORDER = { cartId: 'cart', isPreorder: true, scheduledPickupAt: '2026-10-13T08:00:00+08:00' };

test('preorder is stored with its pickup time; ready time is the pickup time; price is server-side', async () => {
  const h = harness();
  const order = await h.service.createOrder('student', PREORDER, 'key-1');
  assert.equal(order.isPreorder, true);
  assert.equal(order.scheduledPickupAt.toISOString(), '2026-10-13T00:00:00.000Z');
  assert.equal(order.estimatedReadyAt.toISOString(), '2026-10-13T00:00:00.000Z');
  // US-058: reserved at 23:00 Manila, held unpaid for 15 minutes.
  assert.equal(order.reservationExpiresAt.toISOString(), MON('23:15').toISOString());
  assert.equal(order.subtotal, '120.00', '2 x PHP 60.00 from the product, not the client');
  assert.equal(h.state.orders[0].totalAmount.toFixed(2), '120.00');
});

test('idempotency: a replay returns the same order even after the slot is no longer bookable', async () => {
  const h = harness();
  const first = await h.service.createOrder('student', PREORDER, 'key-1');
  h.state.now = TUE('09:00'); // later, inside the lead time of the original slot
  const replay = await h.service.createOrder('student', PREORDER, 'key-1');
  assert.equal(replay.id, first.id);
  // The same instant written in UTC is the same request.
  const utc = await h.service.createOrder('student', { ...PREORDER, scheduledPickupAt: '2026-10-13T00:00:00Z' }, 'key-1');
  assert.equal(utc.id, first.id);
  assert.equal(h.state.orders.length, 1);
});

test('idempotency: the same key with a different pickup time is a conflict (409)', async () => {
  const h = harness();
  await h.service.createOrder('student', PREORDER, 'key-1');
  await assert.rejects(
    h.service.createOrder('student', { ...PREORDER, scheduledPickupAt: '2026-10-13T09:00:00+08:00' }, 'key-1'),
    (e) => status(e) === 409,
  );
  assert.equal(h.state.orders.length, 1);
});

test('an invalid slot creates nothing and releases the key and cart', async () => {
  const h = harness();
  await assert.rejects(
    h.service.createOrder('student', { ...PREORDER, scheduledPickupAt: '2026-10-13T11:30:00+08:00' }, 'key-1'),
    (e) => status(e) === 400,
  );
  assert.deepEqual([h.state.orders.length, h.state.keys['key-1'], h.state.carts.cart], [0, undefined, 'ACTIVE']);
  const retry = await h.service.createOrder('student', PREORDER, 'key-1');
  assert.ok(retry.id, 'the student can retry with a valid slot');
});

test('lead time grows with the slowest item\'s preparation time', async () => {
  const h = harness({ prepMinutes: 90 });
  h.state.now = TUE('07:00');
  await assert.rejects(
    h.service.createOrder('student', { ...PREORDER, scheduledPickupAt: '2026-10-13T08:00:00+08:00' }, 'k'),
    (e) => status(e) === 400 && /at least 90 minutes/.test(e.message),
  );
  const ok = await h.service.createOrder('student', { ...PREORDER, scheduledPickupAt: '2026-10-13T08:30:00+08:00' }, 'k2');
  assert.ok(ok.id);
});

test('a pickup time on a regular order, or a preorder without one, is rejected', async () => {
  const h = harness();
  await assert.rejects(h.service.createOrder('student', { cartId: 'cart', scheduledPickupAt: '2026-10-13T08:00:00+08:00' }, 'k'), (e) => status(e) === 400);
  await assert.rejects(h.service.createOrder('student', { cartId: 'cart', isPreorder: true }, 'k'), (e) => status(e) === 400);
  assert.equal(h.state.orders.length, 0);
});

// --------------------------------------------- vendor-accept timeout

function matches(row, where) {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return condition.some((c) => matches(row, c));
    if (condition === null) return row[key] === null;
    if (condition && typeof condition === 'object' && 'lte' in condition) return row[key] !== null && row[key] <= condition.lte;
    return row[key] === condition;
  });
}

test('auto-cancel: an overnight preorder is not refunded until 5 minutes after its pickup time', async () => {
  const now = MON('23:10');
  const rows = [
    { id: 'regular-late', status: 'PAID', isPreorder: false, scheduledPickupAt: null, paidAt: MON('23:00') },
    { id: 'regular-fresh', status: 'PAID', isPreorder: false, scheduledPickupAt: null, paidAt: MON('23:08') },
    { id: 'preorder-tomorrow', status: 'PAID', isPreorder: true, scheduledPickupAt: TUE('08:00'), paidAt: MON('20:00') },
    { id: 'preorder-missed', status: 'PAID', isPreorder: true, scheduledPickupAt: MON('23:04'), paidAt: MON('20:00') },
    { id: 'preorder-just-due', status: 'PAID', isPreorder: true, scheduledPickupAt: MON('23:07'), paidAt: MON('20:00') },
    { id: 'legacy-preorder', status: 'PAID', isPreorder: true, scheduledPickupAt: null, paidAt: MON('23:00') },
  ];
  let call = 0;
  const prisma = { order: { findMany: async ({ where }) => (call++ === 0 ? rows.filter((r) => matches(r, where)) : []) } };
  const service = new OrdersService(prisma, {}, {}, {}, {});
  const cancelled = [];
  service.autoCancelAndRefund = async (id) => cancelled.push(id);
  const realNow = Date.now;
  Date.now = () => now.getTime();
  try {
    await service.sweepStalledOrdersForAutoRefund();
  } finally {
    Date.now = realNow;
  }
  assert.deepEqual(cancelled.sort(), ['legacy-preorder', 'preorder-missed', 'regular-late']);
});

test('buyer "vendor did not accept" refund waits for the preorder pickup time', () => {
  const refunds = new RefundsService({}, {}, {}, {});
  const check = (order) => refunds.assertAutoEligibility(order, 'VENDOR_NOT_ACCEPTED');
  const base = { status: 'PAID', buyerContactPingAt: null, updatedAt: new Date() };
  const hourAgo = new Date(Date.now() - 60 * 60_000);
  assert.doesNotThrow(() => check({ ...base, isPreorder: false, scheduledPickupAt: null, paidAt: hourAgo }));
  assert.throws(
    () => check({ ...base, isPreorder: true, scheduledPickupAt: new Date(Date.now() + 8 * 60 * 60_000), paidAt: hourAgo }),
    (e) => status(e) === 400 && /after your scheduled pickup time/.test(e.message),
  );
  assert.doesNotThrow(() => check({ ...base, isPreorder: true, scheduledPickupAt: new Date(Date.now() - 10 * 60_000), paidAt: hourAgo }));
  assert.equal(acceptClockStart({ isPreorder: true, scheduledPickupAt: null, paidAt: hourAgo }), hourAgo);
});
