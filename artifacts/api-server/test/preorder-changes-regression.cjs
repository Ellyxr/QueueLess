// US-060: a student views, reschedules or cancels their own preorder before
// the cutoff (when it enters the vendor's live queue); cancelling a paid
// preorder uses the existing automatic refund rules (US-029).
// Run after `pnpm build`:  node --test test/preorder-changes-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { PreorderChangesService, CUSTOMER_PREORDER_REFUND_CATEGORY } = require('../dist/orders/preorder-changes.service');
const { changeCutoffAt } = require('../dist/orders/preorder-slot.policy');

const status = (error) => error.getStatus?.();
const manila = (local) => new Date(`${local}+08:00`);
const MON = (time) => manila(`2026-10-12T${time}:00`);
const TUE = (time) => manila(`2026-10-13T${time}:00`);
const win = (dayOfWeek, openTime, closeTime) => ({ dayOfWeek, isEnabled: true, openTime, closeTime });

function harness(overrides = {}, { now = MON('23:00'), paidAtPaymongo = false } = {}) {
  let state = {
    order: {
      id: 'order-1', customerId: 'student', vendorId: 'vendor', status: 'SCHEDULED', isPreorder: true,
      scheduledPickupAt: TUE('08:00'), queueReleaseAt: TUE('07:00'), reservationExpiresAt: MON('23:15'),
      estimatedReadyAt: TUE('08:00'), updatedAt: MON('22:00'), cancellationReason: null, cancellationNote: null,
      items: [{ product: { preparationTimeMinutes: 10 } }],
      vendor: { preorderSameAsStoreHours: false, availability: [],
        preorderAvailability: [win('TUESDAY', '07:00', '10:00'), win('TUESDAY', '13:00', '16:00')] },
      paymentShares: [{ payment: { id: 'payment-1', status: 'SUCCEEDED', provider: 'PAYMONGO', providerPaymentId: 'cs_1' } }],
      ...overrides,
    },
    history: [], audits: [], events: [], refundCalls: [], expiredSessions: [],
  };
  const find = async ({ where }) =>
    (state.order.id === where.id && state.order.customerId === where.customerId ? structuredClone(state.order) : null);
  const tx = {
    $queryRaw: async () => [],
    order: {
      findFirst: find,
      update: async ({ data }) => { Object.assign(state.order, data); },
      updateMany: async ({ where, data }) => {
        if (state.order.status !== where.status) return { count: 0 };
        Object.assign(state.order, data);
        return { count: 1 };
      },
    },
    payment: {
      updateMany: async ({ where, data }) => {
        for (const share of state.order.paymentShares) {
          if (share.payment && where.id.in.includes(share.payment.id) && share.payment.status === where.status) {
            Object.assign(share.payment, data);
          }
        }
      },
    },
    orderStatusHistory: { create: async ({ data }) => state.history.push(data) },
    auditRecord: { create: async ({ data }) => state.audits.push(data) },
  };
  const prisma = {
    order: { findFirst: find },
    $transaction: async (work) => {
      const snapshot = structuredClone(state);
      try {
        return await work(tx);
      } catch (error) {
        state = snapshot;
        throw error;
      }
    },
  };
  const refunds = { autoRefundOrderPayments: async (orderId, category, note) => {
    state.refundCalls.push({ orderId, category, note, orderStatusAtRefund: state.order.status });
    return [{ id: 'refund-1', status: 'PROCESSED' }];
  } };
  const paymongo = { expireCheckoutSession: async (id) => { state.expiredSessions.push(id); return !paidAtPaymongo; } };
  const realtime = { emitOrderStatusUpdated: async (userId, payload) => state.events.push([userId, payload.status]) };
  const service = new PreorderChangesService(prisma, refunds, paymongo, realtime);
  service.clock = () => now;
  return { service, state: () => state };
}

// ------------------------------------------------------------------- view

test('view: pickup time, cutoff, what can be changed, and windows to move to', async () => {
  const h = harness();
  const view = await h.service.view('student', 'order-1');
  assert.equal(view.status, 'SCHEDULED');
  assert.deepEqual(view.changeCutoffAt, TUE('07:00'));
  assert.deepEqual([view.canReschedule, view.canCancel, view.refundOnCancel], [true, true, true]);
  // Next Tuesday's windows are beyond the 7-day booking limit, so not offered.
  assert.deepEqual(view.rescheduleWindows.map((w) => w.label), [
    'Tomorrow, 7:00 AM - 10:00 AM', 'Tomorrow, 1:00 PM - 4:00 PM',
  ]);
});

test('view after the cutoff: nothing can be changed', async () => {
  const view = await harness({}, { now: TUE('07:00') }).service.view('student', 'order-1');
  assert.deepEqual([view.canReschedule, view.canCancel, view.refundOnCancel, view.rescheduleWindows], [false, false, false, []]);
});

test('cutoff is the queue release time (older preorders: pickup minus lead time)', () => {
  assert.deepEqual(changeCutoffAt({ queueReleaseAt: TUE('07:00'), scheduledPickupAt: TUE('08:00') }), TUE('07:00'));
  assert.deepEqual(changeCutoffAt({ queueReleaseAt: null, scheduledPickupAt: TUE('08:00') }), TUE('07:30'));
});

test('authorization: another student gets 404; a regular order is not a preorder (400)', async () => {
  const h = harness();
  for (const call of [
    () => h.service.view('intruder', 'order-1'),
    () => h.service.reschedule('intruder', 'order-1', { scheduledPickupAt: '2026-10-13T09:00:00+08:00' }),
    () => h.service.cancel('intruder', 'order-1', {}),
  ]) {
    await assert.rejects(call(), (e) => status(e) === 404);
  }
  assert.equal(h.state().order.status, 'SCHEDULED');
  await assert.rejects(harness({ isPreorder: false }).service.view('student', 'order-1'), (e) => status(e) === 400);
});

// ------------------------------------------------------------- reschedule

test('reschedule: new pickup, ready time and queue release; history and audit recorded; student notified', async () => {
  const h = harness();
  const result = await h.service.reschedule('student', 'order-1', { scheduledPickupAt: '2026-10-13T13:30:00+08:00' });
  const order = h.state().order;
  assert.equal(result.rescheduled, true);
  assert.deepEqual([order.scheduledPickupAt, order.estimatedReadyAt, order.queueReleaseAt], [TUE('13:30'), TUE('13:30'), TUE('13:00')]);
  assert.equal(order.status, 'SCHEDULED');
  assert.deepEqual(h.state().history, [{ orderId: 'order-1', status: 'SCHEDULED', changedByUserId: 'student',
    note: 'Pickup rescheduled by the student from 2026-10-13T00:00:00.000Z to 2026-10-13T05:30:00.000Z' }]);
  assert.equal(h.state().audits[0].actionType, 'ORDER_PICKUP_RESCHEDULED');
  assert.deepEqual(h.state().events, [['student', 'SCHEDULED']]);
});

test('reschedule to the same time (any offset) is a no-op', async () => {
  const h = harness();
  const result = await h.service.reschedule('student', 'order-1', { scheduledPickupAt: '2026-10-13T00:00:00Z' });
  assert.equal(result.rescheduled, false);
  assert.deepEqual([h.state().history.length, h.state().events.length], [0, 0]);
});

test('reschedule to an invalid slot is rejected (400) and nothing changes', async () => {
  for (const slot of ['2026-10-13T11:30:00+08:00', '2026-10-12T23:10:00+08:00', '2026-10-12T20:00:00+08:00']) {
    const h = harness();
    await assert.rejects(h.service.reschedule('student', 'order-1', { scheduledPickupAt: slot }), (e) => status(e) === 400, slot);
    assert.deepEqual(h.state().order.scheduledPickupAt, TUE('08:00'));
    assert.equal(h.state().history.length, 0);
  }
});

test('an unpaid reservation keeps its payment deadline when rescheduled', async () => {
  const h = harness({ status: 'PENDING', paymentShares: [] });
  await h.service.reschedule('student', 'order-1', { scheduledPickupAt: '2026-10-13T09:00:00+08:00' });
  assert.deepEqual(h.state().order.reservationExpiresAt, MON('23:15'));
  assert.deepEqual(h.state().order.queueReleaseAt, TUE('07:00'));
});

test('no changes after the cutoff, once live/cancelled, or after the reservation expired (409)', async () => {
  const cases = [
    [{}, TUE('07:00'), /cutoff passed/],
    [{ status: 'PAID' }, MON('23:00'), /can no longer be changed/],
    [{ status: 'COOKING' }, MON('23:00'), /can no longer be changed/],
    [{ status: 'CANCELLED' }, MON('23:00'), /can no longer be changed/],
    [{ status: 'PENDING', reservationExpiresAt: MON('22:59') }, MON('23:00'), /expired/],
  ];
  for (const [overrides, now, message] of cases) {
    const h = harness(overrides, { now });
    await assert.rejects(h.service.reschedule('student', 'order-1', { scheduledPickupAt: '2026-10-13T09:00:00+08:00' }),
      (e) => status(e) === 409 && message.test(e.message), JSON.stringify(overrides));
    await assert.rejects(h.service.cancel('student', 'order-1', {}), (e) => status(e) === 409);
    assert.equal(h.state().order.status, overrides.status ?? 'SCHEDULED');
    assert.deepEqual([h.state().history.length, h.state().refundCalls.length], [0, 0]);
  }
});

// ----------------------------------------------------------------- cancel

test('a paid preorder is still changeable after its (moot) payment deadline', async () => {
  // reservationExpiresAt 23:15 has passed, but the order is paid (SCHEDULED).
  const h = harness({}, { now: TUE('06:00') });
  const view = await h.service.view('student', 'order-1');
  assert.deepEqual([view.canReschedule, view.canCancel], [true, true]);
});

test('cancel a paid preorder: CANCELLED, history, then refunded through the existing refund rules', async () => {
  const h = harness();
  const result = await h.service.cancel('student', 'order-1', { reason: 'Class moved' });
  const order = h.state().order;
  assert.deepEqual([order.status, order.cancellationReason], ['CANCELLED', 'CUSTOMER_REQUEST']);
  assert.equal(h.state().history[0].note, 'Preorder cancelled by the student: Class moved');
  assert.deepEqual(h.state().refundCalls, [{ orderId: 'order-1', category: CUSTOMER_PREORDER_REFUND_CATEGORY,
    note: 'Class moved', orderStatusAtRefund: 'CANCELLED' }], 'refund runs after the cancellation committed');
  assert.deepEqual(result, { orderId: 'order-1', status: 'CANCELLED', refunded: true,
    refunds: [{ id: 'refund-1', status: 'PROCESSED' }] });
  assert.deepEqual(h.state().expiredSessions, [], 'a paid checkout is not expired');
  assert.deepEqual(h.state().events, [['student', 'CANCELLED']]);
});

test('cancel an unpaid reservation: checkout closed, payment failed, nothing to refund', async () => {
  const h = harness({ status: 'PENDING', paymentShares: [{ payment: { id: 'payment-1', status: 'PENDING',
    provider: 'PAYMONGO', providerPaymentId: 'cs_1' } }] });
  const result = await h.service.cancel('student', 'order-1', {});
  assert.equal(h.state().order.status, 'CANCELLED');
  assert.deepEqual(h.state().expiredSessions, ['cs_1']);
  assert.equal(h.state().order.paymentShares[0].payment.status, 'FAILED');
  assert.deepEqual([result.refunded, h.state().refundCalls.length], [false, 0]);
});

test('cancel while PayMongo is confirming a payment is refused (409) and nothing changes', async () => {
  const h = harness({ status: 'PENDING', paymentShares: [{ payment: { id: 'payment-1', status: 'PENDING',
    provider: 'PAYMONGO', providerPaymentId: 'cs_1' } }] }, { paidAtPaymongo: true });
  await assert.rejects(h.service.cancel('student', 'order-1', {}), (e) => status(e) === 409 && /being confirmed/.test(e.message));
  assert.equal(h.state().order.status, 'PENDING');
  assert.equal(h.state().order.paymentShares[0].payment.status, 'PENDING');
});
