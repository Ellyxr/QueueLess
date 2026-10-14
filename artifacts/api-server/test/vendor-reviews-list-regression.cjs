// US-064: the storefront Reviews tab - a vendor's reviews, newest first, with
// pagination and an aggregate rating summary.
// Run after `pnpm build`:  node --test test/vendor-reviews-list-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { ValidationPipe } = require('@nestjs/common');
const { summarizeRatings, reviewerDisplayName } = require('../dist/reviews/review-summary');
const { ListVendorReviewsDto } = require('../dist/reviews/dto/list-vendor-reviews.dto');
const { ReviewsService } = require('../dist/reviews/reviews.service');

const status = (error) => error.getStatus?.();
const groups = (counts) => Object.entries(counts).map(([rating, n]) => ({ rating: Number(rating), _count: { _all: n } }));

// --------------------------------------------------------------- summary

test('summary: average (1 decimal), total and per-star distribution', () => {
  assert.deepEqual(summarizeRatings(groups({ 5: 2, 4: 1 })), {
    averageRating: 4.7, totalReviews: 3, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 },
  });
  assert.equal(summarizeRatings(groups({ 5: 1, 4: 3 })).averageRating, 4.3, '4.25 rounds to 4.3');
  assert.equal(summarizeRatings(groups({ 1: 1, 2: 1 })).averageRating, 1.5);
  assert.equal(summarizeRatings(groups({ 3: 7 })).averageRating, 3);
});

test('summary with no reviews: no average, zero counts', () => {
  assert.deepEqual(summarizeRatings([]), {
    averageRating: null, totalReviews: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });
});

// --------------------------------------------------------------- privacy

test('reviewers are shown as first name + last initial, never the full name', () => {
  assert.equal(reviewerDisplayName('Juan Dela Cruz'), 'Juan C.');
  assert.equal(reviewerDisplayName('  maria   santos '), 'maria S.');
  assert.equal(reviewerDisplayName('Cardo'), 'Cardo');
  assert.equal(reviewerDisplayName(''), 'Student');
  assert.equal(reviewerDisplayName(null), 'Student');
});

// ------------------------------------------------------------ query params

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const parse = (query) => pipe.transform(query, { type: 'query', metatype: ListVendorReviewsDto });

test('page and pageSize: defaults, numbers from the query string, and limits', async () => {
  const defaults = await parse({});
  assert.deepEqual([defaults.page, defaults.pageSize], [1, 10]);
  const custom = await parse({ page: '3', pageSize: '25' });
  assert.deepEqual([custom.page, custom.pageSize], [3, 25]);
  for (const bad of [{ page: '0' }, { page: '-1' }, { page: '1.5' }, { page: 'abc' }, { pageSize: '0' }, { pageSize: '51' }, { sort: 'oldest' }]) {
    await assert.rejects(parse(bad), (e) => status(e) === 400, JSON.stringify(bad));
  }
});

// ---------------------------------------------------------------- listing

// 23 reviews; several share a timestamp, so the id tie-break matters.
const REVIEWS = Array.from({ length: 23 }, (_, i) => ({
  id: `review-${String(i).padStart(2, '0')}`,
  vendorId: 'vendor',
  rating: (i % 5) + 1,
  comment: i % 3 ? `Comment ${i}` : null,
  createdAt: new Date(Date.UTC(2026, 9, 1 + Math.floor(i / 3))),
  reviewer: { fullName: `Student Number${i}`, email: `s${i}@example.com`, id: `user-${i}` },
}));

function harness({ visible = true } = {}) {
  const calls = {};
  const prisma = {
    vendor: { findFirst: async (args) => { calls.vendor = args; return visible ? { id: 'vendor' } : null; } },
    orderReview: {
      groupBy: async () => {
        const counts = {};
        for (const r of REVIEWS) counts[r.rating] = (counts[r.rating] ?? 0) + 1;
        return groups(counts);
      },
      findMany: async (args) => {
        calls.findMany = args;
        const sorted = [...REVIEWS].sort((a, b) =>
          b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
        return sorted.slice(args.skip, args.skip + args.take).map((r) => ({
          id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt,
          reviewer: { fullName: r.reviewer.fullName },
        }));
      },
    },
  };
  return { service: new ReviewsService(prisma), calls };
}

test('list: summary, page info and items; newest first with a stable tie-break', async () => {
  const h = harness();
  const result = await h.service.listVendorReviews('vendor', 'student', { page: 1, pageSize: 10 });
  assert.deepEqual(h.calls.findMany.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.deepEqual([h.calls.findMany.skip, h.calls.findMany.take], [0, 10]);
  assert.deepEqual(h.calls.findMany.where, { vendorId: 'vendor', hiddenAt: null }, 'US-066: hidden excluded');
  assert.deepEqual([result.page, result.pageSize, result.total, result.totalPages], [1, 10, 23, 3]);
  assert.equal(result.summary.totalReviews, 23);
  assert.equal(result.summary.averageRating, 2.9);
  assert.deepEqual(result.items[0], {
    id: 'review-22', rating: 3, comment: 'Comment 22', createdAt: REVIEWS[22].createdAt,
    reviewer: { displayName: 'Student N.' },
  });
  for (let i = 1; i < result.items.length; i += 1) {
    assert.ok(result.items[i - 1].createdAt >= result.items[i].createdAt, 'newest first');
  }
});

test('paging through every page returns each review exactly once', async () => {
  const h = harness();
  const seen = [];
  for (let page = 1; page <= 5; page += 1) {
    const { items } = await h.service.listVendorReviews('vendor', 'student', { page, pageSize: 5 });
    seen.push(...items.map((item) => item.id));
  }
  assert.equal(seen.length, 23);
  assert.equal(new Set(seen).size, 23);
});

test('a page past the end is empty but still carries the summary', async () => {
  const result = await harness().service.listVendorReviews('vendor', 'student', { page: 9, pageSize: 10 });
  assert.deepEqual([result.items, result.total, result.totalPages], [[], 23, 3]);
  assert.equal(result.summary.totalReviews, 23);
});

test('reviews never expose the reviewer\'s full name, email, user id or order', async () => {
  const { items } = await harness().service.listVendorReviews('vendor', 'student', { page: 1, pageSize: 50 });
  const json = JSON.stringify(items);
  for (const leak of ['Number', '@example.com', 'user-', 'orderId', 'reviewerUserId']) {
    assert.ok(!json.includes(leak), `leaked ${leak}`);
  }
});

test('only active vendors (or the owner\'s own store) are listed; otherwise 404', async () => {
  const h = harness();
  await h.service.listVendorReviews('vendor', 'student', { page: 1, pageSize: 10 });
  assert.deepEqual(h.calls.vendor.where, { id: 'vendor', OR: [{ status: 'ACTIVE' }, { ownerUserId: 'student' }] });
  await assert.rejects(harness({ visible: false }).service.listVendorReviews('vendor', 'student', { page: 1, pageSize: 10 }),
    (e) => status(e) === 404);
});
