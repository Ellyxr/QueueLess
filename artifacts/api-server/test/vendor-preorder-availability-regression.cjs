// US-055: vendor preorder pickup windows - validation (close > open, no
// overlap), owner/admin authorization, Asia/Manila time, and enforcement
// (preorders need pickup hours; a preorder is marked ready only inside a
// window). Run after `pnpm build`:
//   node --test test/vendor-preorder-availability-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const {
  validatePickupWindows, computeAvailabilityStatus, preorderPickupStatus, getManilaClock,
} = require('../dist/vendors/availability.util');
const { VendorsService } = require('../dist/vendors/vendors.service');
const { OrdersService } = require('../dist/orders/orders.service');

const status = (error) => error.getStatus?.();
// Manila is UTC+8 with no DST, so a Manila wall-clock time is exact this way.
const manila = (local) => new Date(`${local}+08:00`);
// 2026-10-12 is a Monday; 2026-10-18 is a Sunday.
const MON = (time) => manila(`2026-10-12T${time}:00`);

const win = (dayOfWeek, openTime, closeTime) => ({ dayOfWeek, isEnabled: true, openTime, closeTime });
const off = (dayOfWeek) => ({ dayOfWeek, isEnabled: false });

// ------------------------------------------------------------- validation

test('valid: several non-overlapping windows a day, touching windows, a disabled day', () => {
  assert.doesNotThrow(() => validatePickupWindows([
    win('MONDAY', '07:00', '10:00'), win('MONDAY', '13:00', '16:00'),
    win('TUESDAY', '10:00', '12:00'), win('TUESDAY', '12:00', '14:00'),
    off('WEDNESDAY'),
  ]));
});

test('invalid windows are rejected with 400 and a clear message', () => {
  const cases = [
    ['close equals open', [win('MONDAY', '09:00', '09:00')], /close time must be after/],
    ['close before open', [win('MONDAY', '17:00', '09:00')], /close time must be after/],
    ['overnight window', [win('FRIDAY', '22:00', '02:00')], /close time must be after/],
    ['missing close time', [{ dayOfWeek: 'MONDAY', isEnabled: true, openTime: '09:00' }], /missing an open or close/],
    ['partial overlap', [win('MONDAY', '09:00', '12:00'), win('MONDAY', '11:00', '13:00')], /overlap/],
    ['contained window', [win('MONDAY', '08:00', '17:00'), win('MONDAY', '10:00', '11:00')], /overlap/],
    ['identical windows', [win('MONDAY', '09:00', '10:00'), win('MONDAY', '09:00', '10:00')], /overlap/],
    ['overlap given out of order', [win('MONDAY', '13:00', '15:00'), win('MONDAY', '08:00', '13:30')], /overlap/],
    ['disabled and enabled same day', [off('MONDAY'), win('MONDAY', '09:00', '10:00')], /unavailable and also/],
    ['disabled twice', [off('MONDAY'), off('MONDAY')], /unavailable and also/],
    ['too many windows', ['07', '09', '11', '13', '15'].map((h) => win('MONDAY', `${h}:00`, `${h}:30`)), /more than 4/],
  ];
  for (const [name, days, message] of cases) {
    assert.throws(() => validatePickupWindows(days), (e) => status(e) === 400 && message.test(e.message), name);
  }
});

test('the same window on different days does not count as overlap', () => {
  assert.doesNotThrow(() => validatePickupWindows([win('MONDAY', '09:00', '12:00'), win('TUESDAY', '09:00', '12:00')]));
});

// --------------------------------------------------------- Asia/Manila time

const store = (windows) => windows.map((w) => ({ dayOfWeek: w.dayOfWeek, isOpen: true, openTime: w.openTime, closeTime: w.closeTime }));

test('Manila clock: weekday and time come from Asia/Manila, not the server timezone', () => {
  // 23:30 UTC Monday is 07:30 Tuesday in Manila.
  assert.deepEqual(getManilaClock(new Date('2026-10-12T23:30:00Z')), { dayOfWeek: 'TUESDAY', timeMinutes: 450 });
  assert.deepEqual(getManilaClock(MON('00:00')), { dayOfWeek: 'MONDAY', timeMinutes: 0 });
});

test('open/next window with two windows on one day (close time is exclusive)', () => {
  const days = store([win('MONDAY', '07:00', '10:00'), win('MONDAY', '13:00', '16:00')]);
  assert.deepEqual(computeAvailabilityStatus(days, MON('06:59')), { isOpenNow: false, nextAvailableLabel: 'today at 7:00 AM' });
  assert.deepEqual(computeAvailabilityStatus(days, MON('07:00')), { isOpenNow: true, nextAvailableLabel: null });
  assert.deepEqual(computeAvailabilityStatus(days, MON('11:00')), { isOpenNow: false, nextAvailableLabel: 'today at 1:00 PM' });
  assert.deepEqual(computeAvailabilityStatus(days, MON('15:59')), { isOpenNow: true, nextAvailableLabel: null });
  assert.deepEqual(computeAvailabilityStatus(days, MON('16:00')), { isOpenNow: false, nextAvailableLabel: 'next Monday at 7:00 AM' });
});

test('a UTC instant late on Monday opens Tuesday\'s Manila morning window', () => {
  const days = store([win('TUESDAY', '07:00', '10:00')]);
  assert.equal(computeAvailabilityStatus(days, new Date('2026-10-12T23:30:00Z')).isOpenNow, true);
  assert.equal(computeAvailabilityStatus(days, new Date('2026-10-12T22:30:00Z')).isOpenNow, false);
});

test('Sunday has no windows; the next window is Monday', () => {
  const days = store([win('MONDAY', '08:00', '12:00')]);
  assert.deepEqual(computeAvailabilityStatus(days, manila('2026-10-18T10:00:00')),
    { isOpenNow: false, nextAvailableLabel: 'Monday at 8:00 AM' });
});

test('sameAsStoreHours uses store hours as the pickup windows', () => {
  const vendor = { preorderSameAsStoreHours: true, preorderAvailability: [win('MONDAY', '07:00', '08:00')],
    availability: store([win('MONDAY', '10:00', '12:00')]) };
  assert.equal(preorderPickupStatus(vendor, MON('11:00')).isOpenNow, true);
  assert.equal(preorderPickupStatus(vendor, MON('07:30')).isOpenNow, false);
});

// ---------------------------------------------------- endpoints and authz

function vendorsHarness({ preorderAvailability = [], availability = [], sameAsStoreHours = false, enabled = true } = {}) {
  const state = { preorderAvailability, availability, sameAsStoreHours, enabled, writes: 0 };
  const tx = {
    vendor: { update: async ({ data }) => { state.writes += 1; state.enabled = data.preorderEnabled; state.sameAsStoreHours = data.preorderSameAsStoreHours; } },
    vendorPreorderAvailability: {
      deleteMany: async () => { state.writes += 1; state.preorderAvailability = []; },
      createMany: async ({ data }) => { state.writes += 1; state.preorderAvailability = data.map(({ vendorId, ...w }) => w); },
    },
  };
  const prisma = {
    vendor: {
      findUnique: async ({ where }) => (where.id === 'vendor' ? { id: 'vendor', ownerUserId: 'owner' } : null),
      findUniqueOrThrow: async () => ({
        id: 'vendor', preorderEnabled: state.enabled, preorderSameAsStoreHours: state.sameAsStoreHours,
        preorderAvailability: state.preorderAvailability, availability: state.availability,
      }),
    },
    $transaction: async (work) => work(tx),
  };
  return { service: new VendorsService(prisma), state };
}

const UPDATE = {
  preorderEnabled: true, sameAsStoreHours: false,
  days: [win('MONDAY', '13:00', '16:00'), win('MONDAY', '07:00', '10:00'), off('SATURDAY')],
};

test('owner and admin can read and update; another vendor or a student gets 403; unknown vendor 404', async () => {
  const h = vendorsHarness();
  const saved = await h.service.updatePreorderAvailability('owner', 'vendor', UPDATE, ['VENDOR_OWNER']);
  assert.deepEqual(saved.preorderAvailability.map((w) => `${w.dayOfWeek} ${w.openTime}`),
    ['MONDAY 07:00', 'MONDAY 13:00', 'SATURDAY null'], 'stored and returned in week/time order');
  assert.equal((await h.service.getPreorderAvailability('admin', 'vendor', ['ADMIN'])).id, 'vendor');

  for (const [user, roles] of [['other-owner', ['VENDOR_OWNER']], ['student', ['BUYER']]]) {
    const before = h.state.writes;
    await assert.rejects(h.service.getPreorderAvailability(user, 'vendor', roles), (e) => status(e) === 403);
    await assert.rejects(h.service.updatePreorderAvailability(user, 'vendor', UPDATE, roles), (e) => status(e) === 403);
    await assert.rejects(h.service.getStoreAvailability(user, 'vendor', roles), (e) => status(e) === 403);
    assert.equal(h.state.writes, before, `${user} changed data`);
  }
  await assert.rejects(h.service.getPreorderAvailability('owner', 'missing', ['VENDOR_OWNER']), (e) => status(e) === 404);
});

test('an invalid schedule is rejected before anything is written', async () => {
  const h = vendorsHarness({ preorderAvailability: [win('MONDAY', '09:00', '10:00')] });
  const overlapping = { ...UPDATE, days: [win('MONDAY', '09:00', '12:00'), win('MONDAY', '11:00', '13:00')] };
  await assert.rejects(h.service.updatePreorderAvailability('owner', 'vendor', overlapping, ['VENDOR_OWNER']), (e) => status(e) === 400);
  assert.equal(h.state.writes, 0);
  assert.deepEqual(h.state.preorderAvailability, [win('MONDAY', '09:00', '10:00')]);
});

test('read returns timezone, configured and effective windows, and pickup status', async () => {
  const h = vendorsHarness({ preorderAvailability: [win('MONDAY', '07:00', '10:00')] });
  const result = await h.service.getPreorderAvailability('owner', 'vendor', ['VENDOR_OWNER'], MON('08:00'));
  assert.equal(result.timezone, 'Asia/Manila');
  assert.deepEqual(result.pickup, { hasPickupWindows: true, isOpenNow: true, nextAvailableLabel: null });

  const later = await h.service.getPreorderAvailability('owner', 'vendor', ['VENDOR_OWNER'], MON('11:00'));
  assert.deepEqual(later.pickup, { hasPickupWindows: true, isOpenNow: false, nextAvailableLabel: 'next Monday at 7:00 AM' });

  const disabled = vendorsHarness({ preorderAvailability: [win('MONDAY', '07:00', '10:00')], enabled: false });
  const off = await disabled.service.getPreorderAvailability('owner', 'vendor', ['VENDOR_OWNER'], MON('08:00'));
  assert.equal(off.pickup.isOpenNow, false, 'preorders switched off are never open');
});

// ------------------------------------------------------------- enforcement

const SCHEDULE = (preorderAvailability) => ({ preorderSameAsStoreHours: false, preorderAvailability, availability: [] });

test('placing a preorder requires the vendor to have pickup hours', async () => {
  const attempt = async (preorderAvailability) => {
    const tx = {
      orderIdempotencyKey: { create: async () => {} },
      cart: {
        findFirst: async () => ({ id: 'cart', vendorId: 'vendor', items: [{ quantity: 1, productId: 'p',
          product: { vendorId: 'vendor', isAvailable: true, name: 'P', price: new Prisma.Decimal(1), preparationTimeMinutes: 5 } }],
        vendor: { status: 'ACTIVE', preorderEnabled: true } }),
        updateMany: async () => { throw new Error('reached checkout'); },
      },
      vendor: { findUniqueOrThrow: async () => SCHEDULE(preorderAvailability) },
    };
    const prisma = { orderIdempotencyKey: { findUnique: async () => null }, $transaction: async (work) => work(tx) };
    const pricing = { calculateOrderTotals: (s) => ({ subtotal: s, marketplaceFee: s.mul(0), totalAmount: s }) };
    const service = new OrdersService(prisma, {}, {}, pricing, {});
    service.clock = () => MON('06:00');
    // US-057: a preorder carries a pickup time inside the window.
    return service.createOrder('student', { cartId: 'cart', isPreorder: true, scheduledPickupAt: '2026-10-12T08:00:00+08:00' }, 'key');
  };
  await assert.rejects(attempt([]), (e) => status(e) === 400 && /pickup hours/.test(e.message));
  await assert.rejects(attempt([off('MONDAY')]), (e) => status(e) === 400 && /pickup hours/.test(e.message));
  await assert.rejects(attempt([win('MONDAY', '07:00', '10:00')]), /reached checkout/);
});

function readyHarness({ isPreorder = true, preorderAvailability = [win('MONDAY', '07:00', '10:00')], from = 'COOKING' } = {}) {
  const state = { status: from, history: 0 };
  const order = () => ({ id: 'order-1', customerId: 'student', vendorId: 'vendor', status: state.status,
    isPasabuyRequest: false, isPreorder, items: [], vendor: { id: 'vendor', name: 'V', status: 'ACTIVE' },
    subtotal: new Prisma.Decimal(1), updatedAt: new Date() });
  const tx = {
    order: {
      findUnique: async () => order(),
      updateMany: async ({ where, data }) => (state.status === where.status ? (state.status = data.status, { count: 1 }) : { count: 0 }),
      findUniqueOrThrow: async () => order(),
    },
    vendor: { findUniqueOrThrow: async () => SCHEDULE(preorderAvailability) },
    orderStatusHistory: { create: async () => { state.history += 1; return { id: 'h', changedAt: new Date() }; } },
    auditRecord: { create: async () => {} },
  };
  const prisma = { vendor: { findUnique: async () => ({ id: 'vendor' }) }, $transaction: async (work) => work(tx) };
  const realtime = { emitOrderStatusUpdated: async () => {}, emitOrderReady: async () => {} };
  const service = new OrdersService(prisma, {}, {}, {}, realtime);
  return { service, state };
}

test('a preorder can only be marked ready inside a pickup window (Manila time)', async () => {
  const outside = readyHarness();
  outside.service.clock = () => MON('11:00');
  await assert.rejects(
    outside.service.updateVendorOrderStatus('owner', 'order-1', { status: 'READY_FOR_PICKUP' }),
    (e) => status(e) === 400 && /pickup hours; next window opens next Monday at 7:00 AM/.test(e.message),
  );
  assert.deepEqual(outside.state, { status: 'COOKING', history: 0 });

  const inside = readyHarness();
  inside.service.clock = () => MON('08:15');
  await inside.service.updateVendorOrderStatus('owner', 'order-1', { status: 'READY_FOR_PICKUP' });
  assert.equal(inside.state.status, 'READY_FOR_PICKUP');
});

test('the pickup window does not restrict regular orders, other steps, or vendors without hours', async () => {
  const cases = [
    [{ isPreorder: false }, 'READY_FOR_PICKUP', 'COOKING'],
    [{ from: 'PAID' }, 'COOKING', 'PAID'],
    [{ preorderAvailability: [] }, 'READY_FOR_PICKUP', 'COOKING'],
  ];
  for (const [options, next, from] of cases) {
    const h = readyHarness({ ...options, from });
    h.service.clock = () => MON('22:00');
    await h.service.updateVendorOrderStatus('owner', 'order-1', { status: next });
    assert.equal(h.state.status, next, JSON.stringify(options));
  }
});
