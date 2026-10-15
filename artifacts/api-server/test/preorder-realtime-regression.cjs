// US-061: realtime preorder notifications for the student and the vendor:
// preorder.confirmed when payment confirms a reservation, preorder.released
// when it moves into the vendor's live queue. Published after commit, only to
// the two parties. Run after `pnpm build`:
//   node --test test/preorder-realtime-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { RealtimeGateway } = require('../dist/realtime/realtime.gateway');
const { PaymentsService } = require('../dist/payments/payments.service');
const { WalletService } = require('../dist/wallet/wallet.service');
const { PreorderReservationsService } = require('../dist/orders/preorder-reservations.service');

const D = (value) => new Prisma.Decimal(value);
const ORDER_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const PICKUP = new Date('2026-10-13T00:00:00Z');
const RELEASE = new Date('2026-10-12T23:00:00Z');

// ---------------------------------------------------------------- gateway

function gateway(order) {
  const g = new RealtimeGateway({ order: { findUnique: async () => {
    if (order instanceof Error) throw order;
    return order;
  } } });
  const sent = [];
  g.server = { to: (room) => ({ emit: (event, payload) => sent.push({ room, event, payload }) }) };
  g.logger.warn = () => {};
  return { g, sent };
}

const preorder = (extra = {}) => ({
  id: ORDER_ID, status: 'SCHEDULED', isPreorder: true, customerId: 'student',
  scheduledPickupAt: PICKUP, queueReleaseAt: RELEASE, totalAmount: D('120'),
  vendor: { id: 'vendor', name: 'Kuya Grill', pickupLocation: 'Canteen B', ownerUserId: 'owner' },
  ...extra,
});

test('preorder events go to the student and the vendor owner only, with a dedupe id', async () => {
  const { g, sent } = gateway(preorder());
  await g.emitPreorderEvent('preorder.confirmed', ORDER_ID, 'history-1');
  const expected = {
    eventId: 'history-1', orderId: ORDER_ID, orderReference: 'A1B2C3D4', status: 'SCHEDULED',
    scheduledPickupAt: PICKUP, queueReleaseAt: RELEASE, total: '120.00',
    vendor: { id: 'vendor', name: 'Kuya Grill', pickupLocation: 'Canteen B' },
  };
  assert.deepEqual(sent, [
    { room: 'user:student', event: 'preorder.confirmed', payload: expected },
    { room: 'user:owner', event: 'preorder.confirmed', payload: expected },
  ]);
  assert.ok(!('ownerUserId' in sent[0].payload.vendor), 'owner id is not leaked to the student');
});

test('nothing is published for non-preorders, cancelled or unpaid orders, or missing orders', async () => {
  for (const order of [
    preorder({ isPreorder: false }), preorder({ status: 'CANCELLED' }), preorder({ status: 'PENDING' }), null,
  ]) {
    const { g, sent } = gateway(order);
    await g.emitPreorderEvent('preorder.released', ORDER_ID, 'h');
    assert.deepEqual(sent, [], JSON.stringify(order?.status ?? null));
  }
});

test('a vendor who preordered from their own store gets one event, not two', async () => {
  const { g, sent } = gateway(preorder({ customerId: 'owner' }));
  await g.emitPreorderEvent('preorder.confirmed', ORDER_ID, 'h');
  assert.deepEqual(sent.map((s) => s.room), ['user:owner']);
});

test('a publishing failure is logged, never thrown into the payment or job', async () => {
  const { g, sent } = gateway(new Error('database unavailable'));
  await g.emitPreorderEvent('preorder.released', ORDER_ID, 'h');
  assert.deepEqual(sent, []);
});

// ------------------------------------------------------- confirmed (webhook)

function webhook({ isPreorder, queueReleaseAt, orderStatus = 'PENDING' }) {
  const state = { status: orderStatus, events: [] };
  const tx = {
    $queryRaw: async () => [],
    paymentShare: { count: async ({ where }) => (where.paymentId ? 1 : 0), updateMany: async () => {} },
    payment: { updateMany: async () => ({ count: 1 }) },
    auditRecord: { create: async () => {} },
    order: {
      findUnique: async () => ({ id: ORDER_ID, customerId: 'student', vendorId: 'vendor', updatedAt: new Date(),
        totalAmount: D('120'), marketplaceFee: D('0'), status: state.status, isPreorder, queueReleaseAt }),
      updateMany: async ({ where, data }) => (state.status === where.status ? (state.status = data.status, { count: 1 }) : { count: 0 }),
    },
    orderStatusHistory: { create: async () => ({ id: 'history-paid' }) },
    vendorLedgerEntry: { create: async () => {} },
  };
  const prisma = {
    payment: { findFirst: async () => ({ id: 'payment-1', status: 'PENDING', purpose: 'ORDER_SHARE', providerPaymentId: 'cs_1',
      providerPaymentResourceId: null, paymentShares: [{ orderId: ORDER_ID, paymentId: 'payment-1', status: 'PENDING' }] }) },
    $transaction: async (work) => work(tx),
  };
  const realtime = {
    emitOrderStatusUpdated: async (u, p) => state.events.push(['order.status.updated', p.status]),
    emitPreorderEvent: async (event, orderId, eventId) => state.events.push([event, state.status, eventId]),
  };
  const refunds = {
    retryPendingAutoRefunds: async () => ({}),
    autoRefundPayment: async () => { state.events.push(['refund']); return null; },
  };
  const service = new PaymentsService({}, prisma, {}, refunds, realtime, {});
  const event = { data: { attributes: { type: 'checkout_session.payment.paid', data: {
    id: 'cs_1', type: 'checkout_session',
    attributes: { reference_number: 'payment-1', payments: [{ id: 'pay_1', type: 'payment', attributes: { status: 'paid' } }] },
  } } } };
  return { run: () => service.handleWebhookEvent(event), state };
}

test('PayMongo payment of a preorder publishes preorder.confirmed after the order is SCHEDULED', async () => {
  const h = webhook({ isPreorder: true, queueReleaseAt: new Date(Date.now() + 3600_000) });
  await h.run();
  assert.deepEqual(h.state.events, [
    ['order.status.updated', 'SCHEDULED'],
    ['preorder.confirmed', 'SCHEDULED', 'history-paid'],
  ]);
});

test('a regular order payment publishes no preorder event', async () => {
  const regular = webhook({ isPreorder: false, queueReleaseAt: null });
  await regular.run();
  assert.deepEqual(regular.state.events, [['order.status.updated', 'PAID']]);
});

test('a second payment for an already-confirmed preorder is refunded and not re-announced', async () => {
  const duplicate = webhook({ isPreorder: true, queueReleaseAt: new Date(Date.now() + 3600_000), orderStatus: 'SCHEDULED' });
  await duplicate.run();
  assert.deepEqual(duplicate.state.events, [['refund']]);
});

// -------------------------------------------------------- confirmed (wallet)

test('wallet payment of a preorder publishes preorder.confirmed; a regular order does not', async () => {
  for (const isPreorder of [true, false]) {
    const order = { id: ORDER_ID, status: 'PENDING', isPreorder, reservationExpiresAt: isPreorder ? new Date(Date.now() + 600_000) : null,
      queueReleaseAt: isPreorder ? new Date(Date.now() + 3600_000) : null, customerId: 'student', vendorId: 'vendor',
      totalAmount: D('120'), marketplaceFee: D('0') };
    const events = [];
    const tx = {
      payment: { findUnique: async () => null, create: async ({ data }) => ({ id: 'payment-1', ...data }) },
      paymentShare: {
        findFirst: async () => ({ id: 'share-1', orderId: ORDER_ID, status: 'PENDING', amountDue: D('120'), payment: null, order }),
        update: async () => {}, updateMany: async () => {}, count: async () => 0,
      },
      $queryRaw: async () => [],
      wallet: { updateMany: async () => ({ count: 1 }), findUniqueOrThrow: async () => ({ balance: D('0') }) },
      walletEntry: { create: async () => {} },
      auditRecord: { create: async () => {} },
      order: { update: async ({ data }) => ({ ...order, ...data, updatedAt: new Date() }) },
      orderStatusHistory: { create: async () => ({ id: 'history-wallet' }) },
      vendorLedgerEntry: { create: async () => {} },
    };
    const realtime = {
      emitOrderStatusUpdated: async () => {},
      emitPreorderEvent: async (event, orderId, eventId) => events.push([event, orderId, eventId]),
    };
    await new WalletService({ $transaction: async (work) => work(tx) }, {}, realtime).pay('student', 'share-1', 'k');
    assert.deepEqual(events, isPreorder ? [['preorder.confirmed', ORDER_ID, 'history-wallet']] : []);
  }
});

// ------------------------------------------------------------- released

test('release job publishes preorder.released with the release history id; nothing when not released', async () => {
  for (const released of [true, false]) {
    const events = [];
    const tx = {
      order: {
        updateMany: async () => ({ count: released ? 1 : 0 }),
        findUniqueOrThrow: async () => ({ id: ORDER_ID, vendorId: 'vendor', customerId: 'student', status: 'PAID',
          totalAmount: D('120'), createdAt: new Date(), updatedAt: new Date(), vendor: { ownerUserId: 'owner' } }),
      },
      orderStatusHistory: { create: async () => ({ id: 'history-release' }) },
      auditRecord: { create: async () => {} },
    };
    const prisma = { order: { findMany: async () => [{ id: ORDER_ID }] }, $transaction: async (work) => work(tx) };
    const realtime = {
      emitNewOrder: () => events.push(['order.created']),
      emitOrderStatusUpdated: async () => events.push(['order.status.updated']),
      emitPreorderEvent: async (event, orderId, eventId) => events.push([event, eventId]),
    };
    const service = new PreorderReservationsService(prisma, {}, realtime);
    await service.releaseScheduledPreorders();
    assert.deepEqual(events, released
      ? [['order.created'], ['order.status.updated'], ['preorder.released', 'history-release']]
      : []);
  }
});
