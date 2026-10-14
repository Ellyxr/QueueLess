// US-066: reviews can be reported; an admin hides/restores them with audit
// logging; hidden reviews are left out of listings and rating aggregates.
// Run after `pnpm build`:  node --test test/review-moderation-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { ValidationPipe } = require('@nestjs/common');
const { ReportsService } = require('../dist/reports/reports.service');
const { ListReportsDto } = require('../dist/reports/dto/list-reports.dto');
const { ReviewsService } = require('../dist/reviews/reviews.service');
const { HideReviewDto } = require('../dist/reviews/dto/moderate-review.dto');
const { AdminReviewsController } = require('../dist/reviews/admin-reviews.controller');
const { RolesGuard } = require('../dist/auth/roles.guard');
const { VISIBLE_REVIEW } = require('../dist/reviews/review-summary');

const status = (error) => error.getStatus?.();
const REVIEW_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const REPORT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const NOW = new Date('2026-10-15T00:00:00Z');
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

// ------------------------------------------------------------- reporting

function reportsHarness(review) {
  const created = [];
  const tx = {
    report: { create: async ({ data }) => { created.push(data); return { ...data, attachmentName: null } } },
    auditRecord: { create: async () => {} },
  };
  const prisma = {
    orderReview: { findUnique: async () => review },
    $transaction: async (work) => work(tx),
  };
  return { service: new ReportsService(prisma, {}), created };
}

test('any user can report someone else\'s review; it is linked as the report target', async () => {
  const h = reportsHarness({ id: REVIEW_ID, reviewerUserId: 'author' });
  await h.service.create('another-student', { targetType: 'REVIEW', targetId: REVIEW_ID, category: 'ABUSIVE', description: 'Insults the staff' });
  assert.equal(h.created[0].reportedReviewId, REVIEW_ID);
  assert.equal(h.created[0].targetType, 'REVIEW');
});

test('you cannot report your own review, or a review that does not exist (404)', async () => {
  for (const [user, review] of [['author', { id: REVIEW_ID, reviewerUserId: 'author' }], ['someone', null]]) {
    const h = reportsHarness(review);
    await assert.rejects(h.service.create(user, { targetType: 'REVIEW', targetId: REVIEW_ID, category: 'X', description: 'Y' }),
      (e) => status(e) === 404);
    assert.equal(h.created.length, 0);
  }
});

test('admins can filter the report list to review reports', async () => {
  const parsed = await pipe.transform({ targetType: 'REVIEW' }, { type: 'query', metatype: ListReportsDto });
  let where;
  const prisma = {
    report: { findMany: (args) => { where = args.where; return []; }, count: () => 0 },
    $transaction: async (queries) => Promise.all(queries),
  };
  await new ReportsService(prisma, {}).list(parsed);
  assert.deepEqual(where, { reportedReviewId: { not: null } });
});

// -------------------------------------------------------------- hide/restore

function moderationHarness({ review = { id: REVIEW_ID, hiddenAt: null, hiddenReason: null, vendorId: 'vendor' }, report = null } = {}) {
  let state = { review: review && { ...review }, report: report && { ...report }, history: [], audits: [] };
  const tx = {
    $queryRaw: async () => [],
    orderReview: {
      findUnique: async () => state.review && { ...state.review },
      update: async ({ data }) => { Object.assign(state.review, data); return { ...state.review }; },
    },
    report: {
      findUnique: async () => state.report && { ...state.report },
      update: async ({ data }) => Object.assign(state.report, data),
    },
    reportStatusHistory: { create: async ({ data }) => state.history.push(data) },
    auditRecord: { create: async ({ data }) => state.audits.push(data) },
  };
  const prisma = {
    $transaction: async (work) => {
      const snapshot = structuredClone(state);
      try { return await work(tx); } catch (error) { state = snapshot; throw error; }
    },
  };
  return { service: new ReviewsService(prisma), state: () => state };
}

test('hide: the review is hidden with the reason and admin, and the action is audited', async () => {
  const h = moderationHarness();
  const result = await h.service.hideReview('admin', REVIEW_ID, { reason: 'Abusive language' }, NOW);
  assert.deepEqual([result.hiddenAt, result.hiddenByUserId, result.hiddenReason, result.resolvedReportId],
    [NOW, 'admin', 'Abusive language', null]);
  assert.deepEqual(h.state().audits, [{
    actorUserId: 'admin', actionType: 'REVIEW_HIDDEN', entityType: 'OrderReview', entityId: REVIEW_ID,
    beforeState: { hiddenAt: null },
    afterState: { hiddenAt: NOW.toISOString(), reason: 'Abusive language', reportId: null, vendorId: 'vendor' },
  }]);
});

test('hide with the report that prompted it: the open report is resolved with a note', async () => {
  const h = moderationHarness({ report: { id: REPORT_ID, status: 'OPEN', reportedReviewId: REVIEW_ID } });
  const result = await h.service.hideReview('admin', REVIEW_ID, { reason: 'Abusive language', reportId: REPORT_ID }, NOW);
  assert.equal(result.resolvedReportId, REPORT_ID);
  assert.equal(h.state().report.status, 'RESOLVED');
  assert.deepEqual(h.state().history, [{ reportId: REPORT_ID, status: 'RESOLVED', adminUserId: 'admin', note: 'Review hidden: Abusive language' }]);
  assert.deepEqual(h.state().audits.map((a) => a.actionType), ['REPORT_STATUS_UPDATED', 'REVIEW_HIDDEN']);
});

test('a report that was already closed is left as it is', async () => {
  const h = moderationHarness({ report: { id: REPORT_ID, status: 'DISMISSED', reportedReviewId: REVIEW_ID } });
  const result = await h.service.hideReview('admin', REVIEW_ID, { reason: 'On second look', reportId: REPORT_ID }, NOW);
  assert.equal(result.resolvedReportId, null);
  assert.equal(h.state().report.status, 'DISMISSED');
  assert.ok(h.state().review.hiddenAt);
});

test('hide is refused for a missing review, an already-hidden one, or a report about another review', async () => {
  await assert.rejects(moderationHarness({ review: null }).service.hideReview('admin', REVIEW_ID, { reason: 'abc' }, NOW), (e) => status(e) === 404);
  const hidden = moderationHarness({ review: { id: REVIEW_ID, hiddenAt: NOW, vendorId: 'vendor' } });
  await assert.rejects(hidden.service.hideReview('admin', REVIEW_ID, { reason: 'abc' }, NOW), (e) => status(e) === 409);
  assert.equal(hidden.state().audits.length, 0);

  const wrong = moderationHarness({ report: { id: REPORT_ID, status: 'OPEN', reportedReviewId: 'another-review' } });
  await assert.rejects(wrong.service.hideReview('admin', REVIEW_ID, { reason: 'abc', reportId: REPORT_ID }, NOW), (e) => status(e) === 400);
  assert.deepEqual([wrong.state().review.hiddenAt, wrong.state().report.status, wrong.state().audits.length], [null, 'OPEN', 0]);
});

test('restore: the review is visible again and the action is audited with the old reason', async () => {
  const h = moderationHarness({ review: { id: REVIEW_ID, hiddenAt: NOW, hiddenReason: 'Abusive language', vendorId: 'vendor' } });
  const result = await h.service.restoreReview('admin', REVIEW_ID, { reason: 'Appeal accepted' });
  assert.deepEqual([result.hiddenAt, result.hiddenByUserId, result.hiddenReason], [null, null, null]);
  assert.deepEqual(h.state().audits[0], {
    actorUserId: 'admin', actionType: 'REVIEW_RESTORED', entityType: 'OrderReview', entityId: REVIEW_ID,
    beforeState: { hiddenAt: NOW.toISOString(), reason: 'Abusive language' },
    afterState: { hiddenAt: null, reason: 'Appeal accepted', vendorId: 'vendor' },
  });
  await assert.rejects(moderationHarness().service.restoreReview('admin', REVIEW_ID, {}), (e) => status(e) === 409);
});

test('a reason is required to hide (at least 3 characters after trimming)', async () => {
  const parse = (body) => pipe.transform(body, { type: 'body', metatype: HideReviewDto });
  assert.equal((await parse({ reason: '  Spam  ' })).reason, 'Spam');
  for (const body of [{}, { reason: '  a ' }, { reason: 'x'.repeat(501) }, { reason: 'Spam', reportId: 'nope' }]) {
    await assert.rejects(parse(body), (e) => status(e) === 400, JSON.stringify(body));
  }
});

test('hide/restore are admin-only', () => {
  assert.deepEqual(Reflect.getMetadata('roles', AdminReviewsController), ['ADMIN']);
  assert.ok(Reflect.getMetadata('__guards__', AdminReviewsController).includes(RolesGuard));
});

// --------------------------------------------- hidden reviews are excluded

test('hidden reviews are left out of the storefront list and its rating summary', async () => {
  const reviews = [
    { id: 'r1', rating: 5, hiddenAt: null, createdAt: new Date('2026-10-03'), comment: 'Great', reviewer: { fullName: 'A B' } },
    { id: 'r2', rating: 1, hiddenAt: NOW, createdAt: new Date('2026-10-02'), comment: 'Abusive', reviewer: { fullName: 'C D' } },
    { id: 'r3', rating: 4, hiddenAt: null, createdAt: new Date('2026-10-01'), comment: null, reviewer: { fullName: 'E F' } },
  ];
  const visible = (where) => reviews.filter((r) => !('hiddenAt' in where) || r.hiddenAt === where.hiddenAt);
  const prisma = {
    vendor: { findFirst: async () => ({ id: 'vendor' }) },
    orderReview: {
      groupBy: async ({ where }) => {
        const counts = {};
        for (const r of visible(where)) counts[r.rating] = (counts[r.rating] ?? 0) + 1;
        return Object.entries(counts).map(([rating, n]) => ({ rating: Number(rating), _count: { _all: n } }));
      },
      findMany: async ({ where }) => visible(where),
    },
  };
  const result = await new ReviewsService(prisma).listVendorReviews('vendor', 'student', { page: 1, pageSize: 10 });
  assert.deepEqual(result.items.map((r) => r.id), ['r1', 'r3']);
  assert.deepEqual([result.summary.totalReviews, result.summary.averageRating, result.summary.distribution['1']], [2, 4.5, 0]);
  assert.deepEqual(VISIBLE_REVIEW, { hiddenAt: null });
});
