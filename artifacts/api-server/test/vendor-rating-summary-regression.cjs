// US-065: a vendor's own rating summary and recent reviews, and the average
// rating on the vendor listing. Run after `pnpm build`:
//   node --test test/vendor-rating-summary-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { ReviewsService, RECENT_REVIEWS_LIMIT } = require('../dist/reviews/reviews.service');
const { VendorsService } = require('../dist/vendors/vendors.service');
const { VendorReviewsController } = require('../dist/reviews/vendor-reviews.controller');
const { RolesGuard } = require('../dist/auth/roles.guard');

const status = (error) => error.getStatus?.();
const NOW = new Date('2026-10-15T00:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000);
const groups = (counts, extra = {}) => Object.entries(counts).map(([rating, n]) => ({ rating: Number(rating), _count: { _all: n }, ...extra }));

// ----------------------------------------------------- vendor's own summary

const REVIEWS = [
  { id: 'r1', orderId: 'a1b2c3d4-0000-4000-8000-000000000001', rating: 5, comment: 'Great', createdAt: daysAgo(1), reviewer: { fullName: 'Juan Dela Cruz' } },
  { id: 'r2', orderId: 'b2c3d4e5-0000-4000-8000-000000000002', rating: 4, comment: null, createdAt: daysAgo(10), reviewer: { fullName: 'Maria Santos' } },
  { id: 'r3', orderId: 'c3d4e5f6-0000-4000-8000-000000000003', rating: 1, comment: 'Cold', createdAt: daysAgo(45), reviewer: { fullName: 'Cardo' } },
];

function summaryHarness({ hasVendor = true } = {}) {
  const calls = { groupBy: [], findMany: null, vendor: null };
  const prisma = {
    vendor: { findUnique: async (args) => { calls.vendor = args; return hasVendor ? { id: 'vendor', name: 'Kuya Grill' } : null; } },
    orderReview: {
      groupBy: async (args) => {
        calls.groupBy.push(args);
        const counts = {};
        for (const r of REVIEWS) {
          if (args.where.createdAt && r.createdAt < args.where.createdAt.gte) continue;
          counts[r.rating] = (counts[r.rating] ?? 0) + 1;
        }
        return groups(counts);
      },
      findMany: async (args) => { calls.findMany = args; return REVIEWS.slice(0, args.take); },
    },
  };
  return { service: new ReviewsService(prisma), calls };
}

test('vendor summary: all time, last 30 days, and latest reviews for their own store', async () => {
  const h = summaryHarness();
  const result = await h.service.getMyVendorReviewSummary('owner', NOW);

  assert.deepEqual(h.calls.vendor.where, { ownerUserId: 'owner' }, 'scoped to the signed-in owner');
  assert.deepEqual(result.vendor, { id: 'vendor', name: 'Kuya Grill' });
  assert.deepEqual(result.summary, {
    averageRating: 3.3, totalReviews: 3, distribution: { 1: 1, 2: 0, 3: 0, 4: 1, 5: 1 },
  });
  assert.deepEqual(result.last30Days, { averageRating: 4.5, totalReviews: 2 }, 'the 45-day-old 1-star is excluded');
  assert.deepEqual(h.calls.groupBy[1].where, { vendorId: 'vendor', createdAt: { gte: daysAgo(30) } });

  assert.deepEqual(h.calls.findMany.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.equal(h.calls.findMany.take, RECENT_REVIEWS_LIMIT);
  assert.equal(RECENT_REVIEWS_LIMIT, 5);
  assert.deepEqual(result.recentReviews[0], {
    id: 'r1', orderReference: 'A1B2C3D4', rating: 5, comment: 'Great', createdAt: daysAgo(1),
    reviewer: { displayName: 'Juan C.' },
  });
  assert.ok(!JSON.stringify(result.recentReviews).includes('Dela Cruz'), 'reviewer full name not exposed');
});

test('a user without a vendor profile gets 404', async () => {
  await assert.rejects(summaryHarness({ hasVendor: false }).service.getMyVendorReviewSummary('student', NOW),
    (e) => status(e) === 404);
});

test('the summary route is vendor-owner only and registered before :vendorId/reviews', () => {
  const proto = VendorReviewsController.prototype;
  assert.equal(Reflect.getMetadata('path', proto.getMyVendorReviewSummary), 'mine/reviews/summary');
  assert.deepEqual(Reflect.getMetadata('roles', proto.getMyVendorReviewSummary), ['VENDOR_OWNER']);
  assert.ok((Reflect.getMetadata('__guards__', proto.getMyVendorReviewSummary) ?? []).includes(RolesGuard));
  const order = Object.getOwnPropertyNames(proto).filter((name) => name !== 'constructor');
  assert.ok(order.indexOf('getMyVendorReviewSummary') < order.indexOf('listVendorReviews'));
});

// ------------------------------------------------------------ vendor list

function listHarness(vendors, ratingGroups) {
  const calls = { groupBy: [] };
  const prisma = {
    vendor: { findMany: async () => vendors },
    orderReview: { groupBy: async (args) => { calls.groupBy.push(args); return ratingGroups; } },
  };
  return { service: new VendorsService(prisma), calls };
}

const vendor = (id, name) => ({ id, name, description: null, campusLocation: null, categoryOrder: [], vendorType: 'CAMPUS',
  status: 'ACTIVE', products: [{ id: `${id}-p`, name: 'Silog' }] });

test('vendor listing includes each vendor\'s average rating from a single grouped query', async () => {
  const h = listHarness([vendor('v1', 'A'), vendor('v2', 'B'), vendor('v3', 'C')], [
    ...groups({ 5: 2, 4: 1 }, { vendorId: 'v1' }),
    ...groups({ 2: 1 }, { vendorId: 'v2' }),
  ]);
  const result = await h.service.listActiveVendors();

  assert.equal(h.calls.groupBy.length, 1, 'one query for all vendors, not one per vendor');
  assert.deepEqual(h.calls.groupBy[0].by, ['vendorId', 'rating']);
  assert.deepEqual(h.calls.groupBy[0].where, { vendorId: { in: ['v1', 'v2', 'v3'] } });
  assert.deepEqual(result.map((v) => [v.id, v.averageRating, v.totalReviews]), [
    ['v1', 4.7, 3], ['v2', 2, 1], ['v3', null, 0],
  ]);
  assert.deepEqual(result[0].products, [{ id: 'v1-p', name: 'Silog' }], 'existing fields kept');
  assert.equal(result[0].name, 'A');
});

test('no active vendors: no rating query at all', async () => {
  const h = listHarness([], []);
  assert.deepEqual(await h.service.listActiveVendors(), []);
  assert.equal(h.calls.groupBy.length, 0);
});
