// US-056: the storefront tells a student whether the vendor is open now,
// whether it accepts preorders (even while closed) and the next pickup
// windows, computed from the vendor schedule and server time (Asia/Manila).
// Run after `pnpm build`:
//   node --test test/vendor-storefront-availability-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { upcomingWindows, storefrontPreorderInfo, nextStoreOpening } = require('../dist/vendors/availability.util');
const { VendorsService } = require('../dist/vendors/vendors.service');

// Manila is UTC+8 with no DST. 2026-10-12 is a Monday.
const manila = (local) => new Date(`${local}+08:00`);
const MON = (time) => manila(`2026-10-12T${time}:00`);
const win = (dayOfWeek, openTime, closeTime) => ({ dayOfWeek, isEnabled: true, openTime, closeTime });
const storeDay = (dayOfWeek, openTime, closeTime) => ({ dayOfWeek, isOpen: true, openTime, closeTime });
const brief = (w) => [w.date, w.openTime, w.closeTime, w.isOpenNow, w.label];

const WINDOWS = [win('MONDAY', '13:00', '16:00'), win('MONDAY', '07:00', '10:00'), win('WEDNESDAY', '09:00', '11:00')];

test('next windows: the one in progress first, then later today, then later days', () => {
  assert.deepEqual(upcomingWindows(WINDOWS, MON('08:00')).map(brief), [
    ['2026-10-12', '07:00', '10:00', true, 'Today, 7:00 AM - 10:00 AM'],
    ['2026-10-12', '13:00', '16:00', false, 'Today, 1:00 PM - 4:00 PM'],
    ['2026-10-14', '09:00', '11:00', false, 'Wednesday, Oct 14, 9:00 AM - 11:00 AM'],
  ]);
});

test('window instants are exact (Manila 07:00 Monday is 23:00 UTC Sunday)', () => {
  const [first] = upcomingWindows(WINDOWS, MON('06:00'));
  assert.equal(first.opensAt.toISOString(), '2026-10-11T23:00:00.000Z');
  assert.equal(first.closesAt.toISOString(), '2026-10-12T02:00:00.000Z');
});

test('ended windows are skipped and the schedule wraps to next week', () => {
  assert.deepEqual(upcomingWindows(WINDOWS, MON('16:00')).map(brief), [
    ['2026-10-14', '09:00', '11:00', false, 'Wednesday, Oct 14, 9:00 AM - 11:00 AM'],
    ['2026-10-19', '07:00', '10:00', false, 'Monday, Oct 19, 7:00 AM - 10:00 AM'],
    ['2026-10-19', '13:00', '16:00', false, 'Monday, Oct 19, 1:00 PM - 4:00 PM'],
  ]);
});

test('Sunday is skipped; from Saturday night the next window is Monday', () => {
  const [fromSaturday] = upcomingWindows(WINDOWS, manila('2026-10-17T22:00:00'));
  assert.deepEqual(brief(fromSaturday), ['2026-10-19', '07:00', '10:00', false, 'Monday, Oct 19, 7:00 AM - 10:00 AM']);
  const [fromSunday] = upcomingWindows(WINDOWS, manila('2026-10-18T10:00:00'));
  assert.equal(fromSunday.label, 'Tomorrow, 7:00 AM - 10:00 AM');
});

test('Manila calendar is used: 23:30 UTC Monday is Tuesday morning in Manila', () => {
  const [current] = upcomingWindows([win('TUESDAY', '07:00', '10:00')], new Date('2026-10-12T23:30:00Z'));
  assert.deepEqual(brief(current), ['2026-10-13', '07:00', '10:00', true, 'Today, 7:00 AM - 10:00 AM']);
});

test('limit, disabled days and an empty schedule', () => {
  assert.equal(upcomingWindows(WINDOWS, MON('06:00'), 1).length, 1);
  assert.deepEqual(upcomingWindows([{ dayOfWeek: 'MONDAY', isEnabled: false, openTime: null, closeTime: null }], MON('06:00')), []);
  assert.deepEqual(upcomingWindows([], MON('06:00')), []);
});

test('preorders are accepted while the store is closed; disabled or hourless vendors are not', () => {
  const base = { preorderSameAsStoreHours: false, preorderAvailability: WINDOWS, availability: [] };
  const open = storefrontPreorderInfo({ ...base, preorderEnabled: true }, MON('11:00'));
  assert.equal(open.acceptingPreorders, true);
  assert.equal(open.pickupOpenNow, false);
  assert.equal(open.nextPickupLabel, 'Today, 1:00 PM - 4:00 PM');

  for (const vendor of [
    { ...base, preorderEnabled: false },
    { ...base, preorderEnabled: true, preorderAvailability: [] },
  ]) {
    const info = storefrontPreorderInfo(vendor, MON('11:00'));
    assert.deepEqual([info.acceptingPreorders, info.pickupOpenNow, info.nextPickupLabel, info.nextPickupWindows], [false, false, null, []]);
  }
});

test('next store opening: null while open, the next start while closed', () => {
  const store = [storeDay('MONDAY', '10:00', '12:00')];
  assert.equal(nextStoreOpening(store, MON('11:00')), null);
  assert.equal(nextStoreOpening(store, MON('08:00')).toISOString(), '2026-10-12T02:00:00.000Z');
  assert.equal(nextStoreOpening(store, MON('13:00')).toISOString(), '2026-10-19T02:00:00.000Z');
  assert.equal(nextStoreOpening([], MON('13:00')), null);
});

// ------------------------------------------------------------ storefront

function storefront(vendorOverrides, now) {
  const vendor = {
    id: 'vendor', name: 'Kuya Grill', description: null, campusLocation: null, categoryOrder: [],
    vendorType: 'CAMPUS', status: 'ACTIVE', preorderEnabled: true, preorderSameAsStoreHours: false,
    availability: [storeDay('MONDAY', '10:00', '12:00')],
    preorderAvailability: WINDOWS, products: [], _count: { favoritedBy: 3 }, favoritedBy: [],
    ...vendorOverrides,
  };
  const prisma = {
    vendor: { findFirst: async () => vendor },
    // US-064: rating summary on the storefront (two 5-star, one 4-star).
    orderReview: { groupBy: async () => [{ rating: 5, _count: { _all: 2 } }, { rating: 4, _count: { _all: 1 } }] },
  };
  return new VendorsService(prisma).getVendorStorefront('vendor', 'student', now);
}

test('storefront: closed store still shows preorders accepted and the next pickup windows', async () => {
  const now = MON('08:00');
  const result = await storefront({}, now);
  assert.equal(result.isOpenNow, false);
  assert.equal(result.nextAvailableLabel, 'today at 10:00 AM');
  assert.equal(result.nextOpenAt.toISOString(), '2026-10-12T02:00:00.000Z');
  assert.equal(result.serverTime, now);
  assert.equal(result.timezone, 'Asia/Manila');
  assert.equal(result.preorder.acceptingPreorders, true);
  assert.equal(result.preorder.pickupOpenNow, true);
  assert.deepEqual(result.preorder.nextPickupWindows.map((w) => w.label), [
    'Today, 7:00 AM - 10:00 AM', 'Today, 1:00 PM - 4:00 PM', 'Wednesday, Oct 14, 9:00 AM - 11:00 AM',
  ]);
});

test('storefront: existing fields are unchanged for the current frontend', async () => {
  const result = await storefront({}, MON('11:00'));
  assert.equal(result.isOpenNow, true);
  assert.equal(result.nextOpenAt, null);
  assert.equal(result.favoritesCount, 3);
  assert.deepEqual(result.availabilityDays, [storeDay('MONDAY', '10:00', '12:00')]);
  assert.deepEqual(result.preorderAvailability.map((w) => w.openTime), ['07:00', '13:00', '09:00']);
  assert.equal(result.preorderEnabled, true);
  assert.deepEqual(result.reviewSummary, { averageRating: 4.7, totalReviews: 3 }, 'US-064');
});

test('storefront: "same as store hours" uses store hours as pickup windows', async () => {
  const result = await storefront({ preorderSameAsStoreHours: true }, MON('08:00'));
  assert.deepEqual(result.preorder.nextPickupWindows.map((w) => w.label)[0], 'Today, 10:00 AM - 12:00 PM');
  assert.equal(result.preorder.pickupOpenNow, false);
});
