// US-058: a preorder is paid at reservation using the existing payment,
// webhook and idempotency rules; an unpaid reservation expires after its
// window and releases the slot. Run after `pnpm build`:
//   node --test test/preorder-payment-expiry-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const {
  reservationExpiresAt, isReservationExpired, preorderPaymentWindowMinutes,
} = require('../dist/orders/preorder-slot.policy');
const { PreorderReservationsService } = require('../dist/orders/preorder-reservations.service');
const { PaymentsService } = require('../dist/payments/payments.service');
const { WalletService } = require('../dist/wallet/wallet.service');
const { OrdersService } = require('../dist/orders/orders.service');

const status = (error) => error.getStatus?.();
const manila = (local) => new Date(`${local}+08:00`);
const MON = (time) => manila(`2026-10-12T${time}:00`);
const D = (value) => new Prisma.Decimal(value);

// ---------------------------------------------------------------- window

test('reservation is held for the payment window, or until the pickup time if sooner', () => {
  assert.deepEqual(reservationExpiresAt(MON('23:00'), manila('2026-10-13T08:00:00')), MON('23:15'));
  assert.deepEqual(reservationExpiresAt(MON('07:00'), MON('07:10')), MON('07:10'));
  assert.equal(preorderPaymentWindowMinutes({}), 15);
  assert.equal(preorderPaymentWindowMinutes({ PREORDER_PAYMENT_WINDOW_MINUTES: '10' }), 10);
  assert.equal(preorderPaymentWindowMinutes({ PREORDER_PAYMENT_WINDOW_MINUTES: '0' }), 15);
});

test('only preorders expire; the expiry instant itself counts as expired', () => {
  assert.equal(isReservationExpired({ isPreorder: true, reservationExpiresAt: MON('23:15') }, MON('23:14')), false);
  assert.equal(isReservationExpired({ isPreorder: true, reservationExpiresAt: MON('23:15') }, MON('23:15')), true);
  assert.equal(isReservationExpired({ isPreorder: false, reservationExpiresAt: MON('23:15') }, MON('23:59')), false);
  assert.equal(isReservationExpired({ isPreorder: true, reservationExpiresAt: null }, MON('23:59')), false);
});

// ------------------------------------------------------- paying at reservation

const EXPIRED = new Date(Date.now() - 60_000);
const OPEN = new Date(Date.now() + 10 * 60_000);

function checkout(reservation) {
  let providerCalls = 0;
  const order = { id: 'order-1', status: 'PENDING', isPreorder: true, reservationExpiresAt: reservation };
  const share = { id: 'share-1', orderId: 'order-1', payerUserId: 'student', amountDue: D('120'), status: 'PENDING', paymentId: null };
  const prisma = {
    paymentShare: { findFirst: async () => ({ ...share, order, payment: null }) },
    paymentIdempotencyKey: {
      findUnique: async () => null,
      create: async ({ data }) => ({ id: 'key', ...data, payment: null }),
    },
    $transaction: async () => { throw new Error('reached payment transaction'); },
  };
  const paymongo = { createCheckoutSession: async () => { providerCalls += 1; } };
  return { service: new PaymentsService({}, prisma, paymongo, {}, {}, {}), calls: () => providerCalls };
}

test('PayMongo checkout: an expired reservation is refused (409) before contacting PayMongo', async () => {
  const expired = checkout(EXPIRED);
  await assert.rejects(expired.service.createCheckout('student', 'share-1', 'k'),
    (e) => status(e) === 409 && /reservation expired/.test(e.message));
  assert.equal(expired.calls(), 0);

  const open = checkout(OPEN);
  await assert.rejects(open.service.createCheckout('student', 'share-1', 'k'), /reached payment transaction/,
    'an open reservation goes through the normal checkout flow');
});

test('wallet payment: an expired reservation is refused (409) and the wallet is not debited', async () => {
  let debited = 0;
  const tx = {
    payment: { findUnique: async () => null },
    paymentShare: { findFirst: async () => ({
      id: 'share-1', orderId: 'order-1', status: 'PENDING', amountDue: D('120'), payment: null,
      order: { id: 'order-1', status: 'PENDING', isPreorder: true, reservationExpiresAt: EXPIRED },
    }) },
    $queryRaw: async () => [],
    wallet: { updateMany: async () => { debited += 1; return { count: 1 }; } },
  };
  const prisma = { $transaction: async (work) => work(tx) };
  const wallet = new WalletService(prisma, {}, {});
  await assert.rejects(wallet.pay('student', 'share-1', 'wallet-key'),
    (e) => status(e) === 409 && /reservation expired/.test(e.message));
  assert.equal(debited, 0);
});

test('vendor queue hides unpaid preorders (they are not reservations yet)', async () => {
  let where;
  const prisma = {
    vendor: { findUnique: async () => ({ id: 'vendor', name: 'V', status: 'ACTIVE' }) },
    order: { findMany: async (args) => { where = args.where; return []; } },
  };
  await new OrdersService(prisma, {}, {}, {}, {}).getVendorOrderQueue('owner');
  assert.deepEqual(where.NOT, { isPreorder: true, status: 'PENDING' });
  assert.deepEqual(where.status, { in: ['PENDING', 'PAID', 'COOKING', 'READY_FOR_PICKUP'] });
});

// ------------------------------------------------------------ expiry job

function expiryHarness(orders, { paidAtPaymongo = [], failFor = [] } = {}) {
  const state = { orders: structuredClone(orders), history: [], audits: [], events: [], expiredSessions: [] };
  const byId = (id) => state.orders.find((o) => o.id === id);
  let query;
  const tx = {
    $queryRaw: async () => [],
    order: {
      updateMany: async ({ where, data }) => {
        const order = byId(where.id);
        if (failFor.includes(where.id)) throw new Error('database hiccup');
        if (!order || order.status !== where.status || !order.isPreorder) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }) => ({ ...byId(where.id), updatedAt: MON('23:20') }),
    },
    payment: {
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const order of state.orders) for (const share of order.paymentShares) {
          if (share.payment && where.id.in.includes(share.payment.id) && share.payment.status === where.status) {
            Object.assign(share.payment, data); count += 1;
          }
        }
        return { count };
      },
    },
    orderStatusHistory: { create: async ({ data }) => state.history.push(data) },
    auditRecord: { create: async ({ data }) => state.audits.push(data) },
  };
  const prisma = {
    order: { findMany: async (args) => { query = args; return structuredClone(state.orders.filter((o) => o.status === 'PENDING' && o.isPreorder)); } },
    $transaction: async (work) => work(tx),
  };
  const paymongo = { expireCheckoutSession: async (id) => { state.expiredSessions.push(id); return !paidAtPaymongo.includes(id); } };
  const realtime = { emitOrderStatusUpdated: async (userId, payload) => state.events.push([userId, payload.status]) };
  const service = new PreorderReservationsService(prisma, paymongo, realtime);
  service.logger.warn = () => {};
  service.clock = () => MON('23:20');
  return { service, state, query: () => query };
}

const reservation = (id, payment) => ({
  id, customerId: 'student', isPreorder: true, status: 'PENDING',
  paymentShares: [{ payment }],
});
const pendingPaymongo = (id) => ({ id, status: 'PENDING', provider: 'PAYMONGO', providerPaymentId: `cs_${id}` });

test('expiry job: an unpaid reservation is cancelled, its checkout closed, payment failed, student notified', async () => {
  const h = expiryHarness([reservation('order-1', pendingPaymongo('p1'))]);
  const expired = await h.service.expireUnpaidReservations();

  assert.deepEqual(h.query().where, { isPreorder: true, status: 'PENDING', reservationExpiresAt: { lte: MON('23:20') } });
  assert.deepEqual(expired, ['order-1']);
  const [order] = h.state.orders;
  assert.equal(order.status, 'CANCELLED');
  assert.equal(order.cancellationReason, 'RESERVATION_EXPIRED');
  assert.equal(order.paymentShares[0].payment.status, 'FAILED');
  assert.deepEqual(h.state.expiredSessions, ['cs_p1']);
  assert.equal(h.state.history[0].status, 'CANCELLED');
  assert.deepEqual(h.state.audits.map((a) => a.actionType).sort(), ['ORDER_STATUS_UPDATED', 'PAYMENT_STATUS_UPDATED']);
  assert.deepEqual(h.state.events, [['student', 'CANCELLED']]);
});

test('expiry job: a reservation never sent to checkout is still released', async () => {
  const h = expiryHarness([reservation('order-1', null)]);
  assert.deepEqual(await h.service.expireUnpaidReservations(), ['order-1']);
  assert.deepEqual(h.state.expiredSessions, []);
});

test('expiry job: paid at PayMongo or payment already succeeded -> left for the webhook', async () => {
  const h = expiryHarness([
    reservation('paid-at-provider', pendingPaymongo('p1')),
    reservation('succeeded', { id: 'p2', status: 'SUCCEEDED', provider: 'PAYMONGO', providerPaymentId: 'cs_p2' }),
  ], { paidAtPaymongo: ['cs_p1'] });
  assert.deepEqual(await h.service.expireUnpaidReservations(), []);
  assert.deepEqual(h.state.orders.map((o) => o.status), ['PENDING', 'PENDING']);
  assert.deepEqual(h.state.expiredSessions, ['cs_p1'], 'a succeeded payment is not even sent to PayMongo');
  assert.deepEqual(h.state.events, []);
});

test('expiry job: if the webhook marked it PAID first, nothing is cancelled or failed', async () => {
  const h = expiryHarness([reservation('order-1', pendingPaymongo('p1'))]);
  // The webhook commits PAID between the job's query and its transaction.
  const realExpire = h.service.paymongo.expireCheckoutSession;
  h.service.paymongo.expireCheckoutSession = async (id) => { h.state.orders[0].status = 'PAID'; return realExpire(id); };
  assert.deepEqual(await h.service.expireUnpaidReservations(), []);
  assert.equal(h.state.orders[0].status, 'PAID');
  assert.equal(h.state.orders[0].paymentShares[0].payment.status, 'PENDING');
  assert.deepEqual([h.state.history.length, h.state.events.length], [0, 0]);
});

test('expiry job: one failing reservation does not stop the others', async () => {
  const h = expiryHarness(
    [reservation('broken', pendingPaymongo('p1')), reservation('fine', pendingPaymongo('p2'))],
    { failFor: ['broken'] },
  );
  assert.deepEqual(await h.service.expireUnpaidReservations(), ['fine']);
});

// ---------------------------------------- late payment after expiry -> refund

test('a payment that lands after the reservation expired is refunded, order stays cancelled', async () => {
  const state = { order: { id: 'order-1', status: 'CANCELLED' }, payment: { id: 'payment-1', status: 'PENDING' },
    shares: [{ paymentId: 'payment-1', orderId: 'order-1', status: 'PENDING' }], refunds: [], ledger: 0 };
  const tx = {
    $queryRaw: async () => [],
    paymentShare: { count: async () => 1, updateMany: async () => {} },
    payment: { updateMany: async ({ data }) => { Object.assign(state.payment, data); return { count: 1 }; } },
    auditRecord: { create: async () => {} },
    order: { findUnique: async () => ({ status: state.order.status }), updateMany: async () => ({ count: 0 }) },
    vendorLedgerEntry: { create: async () => { state.ledger += 1; } },
  };
  const prisma = {
    payment: { findFirst: async () => ({ ...state.payment, purpose: 'ORDER_SHARE', providerPaymentId: 'cs_1',
      providerPaymentResourceId: null, paymentShares: state.shares }) },
    $transaction: async (work) => work(tx),
  };
  const refunds = {
    retryPendingAutoRefunds: async () => ({ requiresReview: false }),
    autoRefundPayment: async (paymentId, category) => { state.refunds.push(category); return { status: 'PROCESSED' }; },
  };
  const service = new PaymentsService({}, prisma, {}, refunds, { emitOrderStatusUpdated: async () => {} }, {});
  const result = await service.handleWebhookEvent({ data: { attributes: { type: 'checkout_session.payment.paid', data: {
    id: 'cs_1', type: 'checkout_session',
    attributes: { reference_number: 'payment-1', payments: [{ id: 'pay_1', type: 'payment', attributes: { status: 'paid' } }] },
  } } } });
  assert.equal(result.orderMarkedPaid, false);
  assert.equal(result.autoRefunded, true);
  assert.deepEqual(state.refunds, ['DUPLICATE_PAYMENT']);
  assert.equal(state.order.status, 'CANCELLED');
  assert.equal(state.ledger, 0);
});
