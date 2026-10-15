// Admin view of the featured-listing introductory discount program: whether
// it is on, one-time vs constant, which 1st-3rd tier is taken by whom, how
// many vendors still hold an active discount, and when switching it off has
// taken full effect. Run after `pnpm build`:
//   node --test test/featured-discount-status-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { FeaturedListingsService, discountStatusMessage } = require('../dist/featured-listings/featured-listings.service');
const { FeaturedListingsController } = require('../dist/featured-listings/featured-listings.controller');
const { RolesGuard } = require('../dist/auth/roles.guard');

const NOW = new Date('2026-10-16T00:00:00Z');
const days = (n) => new Date(NOW.getTime() + n * 86_400_000);

function harness({ enabled = true, renewals = true, claims = [], listings = [] } = {}) {
  const calls = {};
  const prisma = {
    featuredListingSettings: { findUniqueOrThrow: async () => ({
      introDiscountEnabled: enabled, discountOnRenewals: renewals,
      firstVendorDiscount: 30, secondVendorDiscount: 20, thirdVendorDiscount: 10 }) },
    featuredIntroClaim: { findMany: async () => claims },
    featuredListing: { findMany: async (args) => {
      calls.listings = args;
      return listings.filter((l) => l.discountPercent > 0 &&
        ((l.status === 'ACTIVE' && l.endDate > NOW) || l.status === 'PENDING'));
    } },
  };
  return { service: new FeaturedListingsService(prisma, {}), calls };
}

const claim = (rank, id, name, consumedAt = days(-20)) => ({ rank, consumedAt, createdAt: days(-21), vendor: { id, name } });
const listing = (id, vendorId, status, endDate, discountPercent = 30) => ({ id, vendorId, status, endDate, discountPercent });

test('tier status: who holds the 1st, 2nd and 3rd slot, and whether it is still running', async () => {
  const { service } = harness({
    claims: [claim(1, 'v1', 'Chiksilog'), claim(2, 'v2', 'Kuya Grill', null)],
    listings: [listing('l1', 'v1', 'ACTIVE', days(10)), listing('l2', 'v2', 'PENDING', null, 20)],
  });
  const status = await service.discountStatus(NOW);
  assert.deepEqual(status.tiers.map((t) => [t.rank, t.discountPercent, t.status, t.vendor?.name ?? null]), [
    [1, 30, 'CLAIMED', 'Chiksilog'],
    [2, 20, 'RESERVED', 'Kuya Grill'],
    [3, 10, 'AVAILABLE', null],
  ]);
  assert.deepEqual(status.tiers[0].activeDiscountedListing, { id: 'l1', discountPercent: 30, endsAt: days(10) });
  assert.equal(status.tiers[1].activeDiscountedListing, null, 'a pending checkout is not a running plan');
  assert.equal(status.tiersTaken, 2);
  assert.deepEqual([status.mode, status.enabled], ['CONSTANT', true]);
});

test('active discounted vendors and the last expiry date', async () => {
  const { service, calls } = harness({
    enabled: false,
    listings: [
      listing('a', 'v1', 'ACTIVE', days(5)), listing('b', 'v2', 'ACTIVE', days(40)),
      listing('c', 'v2', 'ACTIVE', days(12)), listing('old', 'v3', 'ACTIVE', days(-1)),
      listing('full', 'v4', 'ACTIVE', days(90), 0), listing('p', 'v5', 'PENDING', null),
    ],
  });
  const status = await service.discountStatus(NOW);
  assert.equal(status.activeDiscountedVendors, 2, 'v1 and v2 (v3 expired, v4 paid full price)');
  assert.equal(status.activeDiscountedListings, 3);
  assert.equal(status.pendingDiscountedCheckouts, 1);
  assert.deepEqual(status.lastDiscountExpiresAt, days(40));
  assert.deepEqual(status.fullyDisabledAt, days(40), 'switching off takes full effect when the last one ends');
  assert.deepEqual(calls.listings.where.discountPercent, { gt: 0 });
});

test('switched off with no discounted plan running: fully disabled now', async () => {
  const status = await harness({ enabled: false }).service.discountStatus(NOW);
  assert.deepEqual([status.lastDiscountExpiresAt, status.fullyDisabledAt], [null, NOW]);
  assert.match(status.message, /fully disabled now/);
});

test('while switched on there is no "fully disabled" date', async () => {
  const status = await harness({ listings: [listing('a', 'v1', 'ACTIVE', days(5))] }).service.discountStatus(NOW);
  assert.equal(status.fullyDisabledAt, null);
  assert.deepEqual(status.lastDiscountExpiresAt, days(5));
});

test('one-time vs constant mode follows the renewals setting', async () => {
  assert.equal((await harness({ renewals: false }).service.discountStatus(NOW)).mode, 'ONE_TIME');
  assert.equal((await harness({ renewals: true }).service.discountStatus(NOW)).mode, 'CONSTANT');
});

test('admin message spells out the effective date (Manila time) and what is pending', () => {
  assert.equal(
    discountStatusMessage(false, 2, new Date('2026-11-25T04:00:00Z'), 1, 3),
    'The discount is OFF for every new purchase. It takes full effect globally on November 25, 2026 at 12:00 PM ' +
      '(Manila), once the last active promotional plan ends - 2 vendors still on a discounted plan. ' +
      '1 discounted checkout is still pending and will be honoured if paid.',
  );
  assert.equal(discountStatusMessage(true, 1, null, 0, 2),
    'The 1st-3rd vendor discount is ON. 2 of 3 tiers taken; 1 vendor currently on a discounted plan.');
});

test('the status endpoint is admin-only', () => {
  const handler = FeaturedListingsController.prototype.discountStatus;
  assert.equal(Reflect.getMetadata('path', handler), 'settings/discount-status');
  assert.deepEqual(Reflect.getMetadata('roles', handler), ['ADMIN']);
  assert.ok(Reflect.getMetadata('__guards__', handler).includes(RolesGuard));
});
