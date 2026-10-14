// US-063: a student reviews their own order after pickup (COMPLETED); one
// review per order; rating 1-5; comment up to 1000 characters.
// Run after `pnpm build`:  node --test test/order-review-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('reflect-metadata');
const { ValidationPipe, ParseUUIDPipe } = require('@nestjs/common');
const { Prisma } = require('@prisma/client');
const { CreateReviewDto } = require('../dist/reviews/dto/create-review.dto');
const { ReviewsService } = require('../dist/reviews/reviews.service');

const status = (error) => error.getStatus?.();
const ORDER_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

// ------------------------------------------------------------ validation

// Same settings as the global pipe in main.ts.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validate = (body) => pipe.transform(body, { type: 'body', metatype: CreateReviewDto });

test('rating must be a whole number from 1 to 5', async () => {
  for (const rating of [1, 3, 5]) assert.equal((await validate({ rating })).rating, rating);
  for (const rating of [0, 6, -1, 3.5, '5', null, undefined, 'five']) {
    await assert.rejects(validate({ rating }), (e) => status(e) === 400, `rating ${JSON.stringify(rating)}`);
  }
});

test('comment is optional, trimmed, and at most 1000 characters', async () => {
  assert.equal((await validate({ rating: 4 })).comment, undefined);
  assert.equal((await validate({ rating: 4, comment: '  Great silog!  ' })).comment, 'Great silog!');
  assert.equal((await validate({ rating: 4, comment: 'x'.repeat(1000) })).comment.length, 1000);
  assert.equal((await validate({ rating: 4, comment: `  ${'x'.repeat(1000)}  ` })).comment.length, 1000, 'spaces do not count');
  await assert.rejects(validate({ rating: 4, comment: 'x'.repeat(1001) }), (e) => status(e) === 400);
  await assert.rejects(validate({ rating: 4, comment: 42 }), (e) => status(e) === 400);
});

test('unknown fields (e.g. trying to set the reviewer or vendor) are rejected', async () => {
  await assert.rejects(validate({ rating: 5, vendorId: 'x' }), (e) => status(e) === 400);
  await assert.rejects(validate({ rating: 5, reviewerUserId: 'x' }), (e) => status(e) === 400);
});

test('order id in the URL must be a UUID', async () => {
  await assert.rejects(new ParseUUIDPipe().transform('not-a-uuid', { type: 'param' }), (e) => status(e) === 400);
});

test('the database also enforces the 1-5 rating and one review per order', () => {
  const dir = path.join(__dirname, '../prisma/migrations/20261015200000_us063_order_reviews/migration.sql');
  const sql = fs.readFileSync(dir, 'utf8');
  assert.match(sql, /CHECK \("rating" BETWEEN 1 AND 5\)/);
  assert.match(sql, /CREATE UNIQUE INDEX "order_reviews_orderId_key" ON "order_reviews"\("orderId"\)/);
});

// --------------------------------------------------------------- service

function harness({ status: orderStatus = 'COMPLETED', customerId = 'student', review = null, exists = true, raceLost = false } = {}) {
  const state = { reviews: review ? [review] : [], audits: [] };
  const tx = {
    orderReview: { create: async ({ data, select }) => {
      if (raceLost) throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 't' });
      const created = { id: 'review-1', createdAt: new Date('2026-10-15T00:00:00Z'), ...data };
      state.reviews.push(created);
      return Object.fromEntries(Object.keys(select).map((k) => [k, created[k]]));
    } },
    auditRecord: { create: async ({ data }) => state.audits.push(data) },
  };
  const prisma = {
    order: { findUnique: async () => (exists ? { id: ORDER_ID, customerId, vendorId: 'vendor', status: orderStatus,
      review: state.reviews[0] ?? null } : null) },
    $transaction: async (work) => work(tx),
  };
  return { service: new ReviewsService(prisma), state };
}

test('a student reviews their picked-up order; reviewer and vendor come from the order', async () => {
  const h = harness();
  const review = await h.service.createReview('student', ORDER_ID, { rating: 5, comment: 'Hot and on time' });
  assert.deepEqual(review, { id: 'review-1', orderId: ORDER_ID, vendorId: 'vendor', rating: 5,
    comment: 'Hot and on time', createdAt: new Date('2026-10-15T00:00:00Z') });
  assert.equal(h.state.reviews[0].reviewerUserId, 'student');
  assert.deepEqual(h.state.audits[0], { actorUserId: 'student', actionType: 'REVIEW_CREATED', entityType: 'OrderReview',
    entityId: 'review-1', afterState: { orderId: ORDER_ID, vendorId: 'vendor', rating: 5, hasComment: true } });
});

test('a blank comment is stored as no comment', async () => {
  const h = harness();
  await h.service.createReview('student', ORDER_ID, { rating: 3, comment: '   ' });
  assert.equal(h.state.reviews[0].comment, null);
});

test('only the student who placed the order can review it (404 otherwise)', async () => {
  for (const options of [{ customerId: 'someone-else' }, { exists: false }]) {
    const h = harness(options);
    await assert.rejects(h.service.createReview('student', ORDER_ID, { rating: 5 }), (e) => status(e) === 404);
    await assert.rejects(h.service.getMyReview('student', ORDER_ID), (e) => status(e) === 404);
    assert.equal(h.state.reviews.length, 0);
  }
});

test('only picked-up (COMPLETED) orders can be reviewed', async () => {
  for (const orderStatus of ['PENDING', 'SCHEDULED', 'PAID', 'COOKING', 'READY_FOR_PICKUP', 'CANCELLED', 'UNCOLLECTED']) {
    const h = harness({ status: orderStatus });
    await assert.rejects(h.service.createReview('student', ORDER_ID, { rating: 5 }),
      (e) => status(e) === 400 && /after you have picked it up/.test(e.message), orderStatus);
    assert.equal(h.state.reviews.length, 0);
  }
});

test('one review per order: a second review is 409, including two submitted at once', async () => {
  const existing = harness({ review: { id: 'review-0', orderId: ORDER_ID, rating: 4 } });
  await assert.rejects(existing.service.createReview('student', ORDER_ID, { rating: 1 }), (e) => status(e) === 409);
  assert.equal(existing.state.reviews.length, 1);

  const race = harness({ raceLost: true });
  await assert.rejects(race.service.createReview('student', ORDER_ID, { rating: 1 }), (e) => status(e) === 409);
  assert.equal(race.state.audits.length, 0);
});

test('a student can read back their own review', async () => {
  const h = harness();
  await h.service.createReview('student', ORDER_ID, { rating: 4 });
  assert.equal((await h.service.getMyReview('student', ORDER_ID)).rating, 4);
  await assert.rejects(harness().service.getMyReview('student', ORDER_ID), (e) => status(e) === 404 && /not been reviewed/.test(e.message));
});
