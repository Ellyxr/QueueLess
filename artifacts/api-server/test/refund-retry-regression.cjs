// Behavioral tests against compiled services; no network or database mutations.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { RefundsService } = require('../dist/refunds/refunds.service');
const { PaymentsService } = require('../dist/payments/payments.service');
const D = x => new Prisma.Decimal(x);

function fixture() {
  const payment = { id: 'payment', payerUserId: 'buyer', amount: D(60),
    currency: 'PHP', purpose: 'ORDER_SHARE', provider: 'PAYMONGO',
    status: 'SUCCEEDED', providerPaymentId: 'checkout',
    providerPaymentResourceId: 'provider-payment', paymentShares: [] };
  const rows = [], audits = [], calls = [];
  let behavior = 'pending';
  let queue = Promise.resolve();
  const prisma = {
    $queryRaw: async () => [],
    payment: { findUnique: async () => payment, findFirst: async () => payment },
    refund: {
      findFirst: async ({ where }) => rows.find(r => r.paymentId === where.paymentId &&
        r.status === where.status && r.initiatedBy === where.initiatedBy) ?? null,
      findMany: async ({ where }) => rows.filter(r => r.paymentId === where.paymentId &&
        r.status === where.status && r.initiatedBy === where.initiatedBy &&
        r.providerRefundId === where.providerRefundId),
      findUnique: async ({ where }) => {
        const row = rows.find(r => r.id === where.id);
        return row ? { ...row, payment } : null;
      },
      aggregate: async () => ({ _sum: { amount: rows.filter(r =>
        ['REQUESTED','APPROVED','PROCESSED'].includes(r.status))
        .reduce((sum,r) => sum.add(r.amount), D(0)) } }),
      create: async ({ data }) => {
        const row = { id: 'refund-' + (rows.length + 1), providerRefundId: null, ...data };
        rows.push(row); return row;
      },
      update: async ({ where, data }) => {
        const row = rows.find(r => r.id === where.id);
        Object.assign(row, data); return row;
      },
      updateMany: async ({ where, data }) => {
        const row = rows.find(r => r.id === where.id && r.status === where.status &&
          r.providerRefundId === where.providerRefundId);
        if (!row) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }) => rows.find(r => r.id === where.id),
    },
    auditRecord: {
      create: async ({ data }) => { audits.push(data); return data; },
      findFirst: async ({ where }) => [...audits].reverse().find(a =>
        a.entityId === where.entityId && a.actionType === where.actionType) ?? null,
    },
    $transaction: async fn => {
      const previous = queue;
      let release;
      queue = new Promise(resolve => { release = resolve; });
      await previous;
      try { return await fn(prisma); } finally { release(); }
    },
  };
  const provider = { createRefund: async params => {
    calls.push(params);
    if (behavior === 'qrph') throw new Error('PayMongo refund failed: Refunds are not allowed for payments with source type qrph.');
    if (behavior === 'outage') throw new Error('Provider temporarily unavailable');
    return { refundId: 'provider-refund', status: behavior };
  } };
  const service = new RefundsService(null, prisma, provider, null);
  const payments = new PaymentsService(null, prisma, null, service, null, null);
  const event = { data: { attributes: { type: 'checkout_session.payment.paid', data: {
    id: 'checkout', type: 'checkout_session', attributes: { reference_number: 'payment',
      payments: [{ id: 'provider-payment', type: 'payment', attributes: { status: 'paid' } }] }
  } } } };
  return { payment, rows, audits, calls, service, payments, event,
    behavior: value => { behavior = value; } };
}

test('failed orphan refund retries through the actual duplicate webhook with the same reservation/key', async () => {
  const f = fixture(); f.behavior('outage');
  await assert.rejects(f.payments.handleWebhookEvent(f.event), /temporarily unavailable/);
  assert.equal(f.rows.length, 1); assert.equal(f.rows[0].status, 'APPROVED');
  assert.equal(f.rows[0].providerRefundId, null);
  f.behavior('pending');
  const result = await f.payments.handleWebhookEvent(f.event);
  assert.equal(result.duplicate, true);
  assert.equal(f.rows.length, 1);
  assert.equal(f.calls[0].idempotencyKey, f.calls[1].idempotencyKey);
  assert.equal(f.rows[0].providerRefundId, 'provider-refund');
  await f.payments.handleWebhookEvent(f.event);
  assert.equal(f.calls.length, 2, 'submitted refund must not be resubmitted');
  assert.equal(f.audits.filter(a => a.actionType === 'REFUND_REQUESTED').length, 1);
  assert.equal(f.audits.filter(a => a.actionType === 'REFUND_PROCESSING_FAILED').length, 1);
});

test('QR Ph rejection stays approved, audited for review, and cannot masquerade as refund success', async () => {
  const f = fixture(); f.behavior('qrph');
  const first = await f.payments.handleWebhookEvent(f.event);
  const second = await f.payments.handleWebhookEvent(f.event);
  assert.equal(first.refundRequiresReview, true);
  assert.equal(second.refundRequiresReview, true);
  assert.equal(f.calls.length, 1, 'automatic redelivery must not resubmit permanent rejection');
  assert.equal(f.rows.length, 1); assert.equal(f.rows[0].status, 'APPROVED');
  assert.equal(f.rows[0].providerRefundId, null);
  const failure = f.audits.find(a => a.actionType === 'REFUND_PROCESSING_FAILED');
  assert.equal(failure.afterState.failureCode, 'REFUND_METHOD_REJECTED');
  assert.equal(failure.afterState.requiresReview, true);
  assert.equal(f.audits.some(a => a.actionType === 'REFUND_PROCESSED'), false);
});

test('successful retry completes one refund and later webhook delivery does not process it again', async () => {
  const f = fixture(); f.behavior('outage');
  await assert.rejects(f.payments.handleWebhookEvent(f.event));
  f.behavior('succeeded');
  await f.payments.handleWebhookEvent(f.event);
  assert.equal(f.rows[0].status, 'PROCESSED');
  await f.payments.handleWebhookEvent(f.event);
  assert.equal(f.calls.length, 2);
  assert.equal(f.rows.length, 1);
  assert.equal(f.audits.filter(a => a.actionType === 'REFUND_PROCESSED').length, 1);
});

test('linked duplicate payment resumes its pending automatic refund', async () => {
  const f = fixture();
  await f.service.autoRefundPayment('payment', 'DUPLICATE_PAYMENT', 'late payment');
  f.rows[0].providerRefundId = null; f.payment.paymentShares = [{ id: 'share' }];
  const previous = f.calls.length;
  await f.payments.handleWebhookEvent(f.event);
  assert.equal(f.calls.length, previous + 1);
  assert.equal(f.rows.length, 1);
});

test('concurrent automatic refund reservations create one row and reuse one provider key', async () => {
  const f = fixture();
  await Promise.all([
    f.service.autoRefundPayment('payment', 'ORPHANED_PAYMENT', 'late payment'),
    f.service.autoRefundPayment('payment', 'ORPHANED_PAYMENT', 'late payment')
  ]);
  assert.equal(f.rows.length, 1);
  assert.equal(new Set(f.calls.map(c => c.idempotencyKey)).size, 1);
  assert.equal(f.audits.filter(a => a.actionType === 'REFUND_REQUESTED').length, 1);
});

test('manual approvals are excluded from automatic webhook retries', async () => {
  const f = fixture();
  f.rows.push({ id: 'manual', paymentId: 'payment', initiatedBy: 'ADMIN',
    status: 'APPROVED', amount: D(60), providerRefundId: null });
  f.payment.paymentShares = [{ id: 'share' }];
  await f.payments.handleWebhookEvent(f.event);
  assert.equal(f.calls.length, 0);
});


test('administrator can explicitly retry a refund held for review', async () => {
  const f = fixture(); f.behavior('qrph');
  await f.payments.handleWebhookEvent(f.event);
  await assert.rejects(f.service.processRefund(f.rows[0].id, 'admin'), /source type qrph/);
  assert.equal(f.calls.length, 2);
  f.behavior('succeeded');
  const result = await f.service.processRefund(f.rows[0].id, 'admin');
  assert.equal(result.status, 'PROCESSED');
  assert.equal(f.rows.length, 1);
});

test('failure audit must persist before a permanent rejection can be acknowledged', async () => {
  const f = fixture(); f.behavior('qrph');
  f.service.prisma.auditRecord.create = async ({ data }) => {
    if (data.actionType === 'REFUND_PROCESSING_FAILED') throw new Error('Audit unavailable');
    f.audits.push(data); return data;
  };
  await assert.rejects(f.payments.handleWebhookEvent(f.event), /Audit unavailable/);
  assert.equal(f.rows[0].status, 'APPROVED');
  assert.equal(f.rows[0].providerRefundId, null);
});
