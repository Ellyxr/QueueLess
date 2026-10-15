// US-059: paid preorders are held as SCHEDULED and moved to the vendor's live
// queue (PAID) by a job when their pickup window opens or the prep lead time
// requires it, with status history recorded (US-018). Run after `pnpm build`:
//   node --test test/preorder-scheduled-queue-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { queueReleaseAt, statusAfterPayment } = require('../dist/orders/preorder-slot.policy');
const { PreorderReservationsService } = require('../dist/orders/preorder-reservations.service');
const { PaymentsService } = require('../dist/payments/payments.service');
const { WalletService } = require('../dist/wallet/wallet.service');
const { OrdersService } = require('../dist/orders/orders.service');

const status = (error) => error.getStatus?.();
const manila = (local) => new Date(`${local}+08:00`);
const TUE = (time) => manila(`2026-10-13T${time}:00`);
const D = (value) => new Prisma.Decimal(value);
const win = (dayOfWeek, openTime, closeTime) => ({ dayOfWeek, isEnabled: true, openTime, closeTime });
const WINDOWS = [win('TUESDAY', '07:00', '10:00'), win('TUESDAY', '13:00', '16:00')];

// ------------------------------------------------------------ release time

test('release time: window opening, or earlier when the prep lead time needs it', () => {
  assert.deepEqual(queueReleaseAt(TUE('08:00'), WINDOWS, 30), TUE('07:00'), 'window opens first');
  assert.deepEqual(queueReleaseAt(TUE('09:45'), WINDOWS, 30), TUE('07:00'));
  assert.deepEqual(queueReleaseAt(TUE('07:15'), WINDOWS, 30), TUE('06:45'), 'lead time needs it earlier');
  assert.deepEqual(queueReleaseAt(TUE('14:00'), WINDOWS, 90), TUE('12:30'), 'second window, long prep');
  assert.deepEqual(queueReleaseAt(TUE('14:00'), WINDOWS, 30), TUE('13:00'));
});

test('release time is computed in Manila time', () => {
  // 23:30 UTC Monday = 07:30 Tuesday Manila, inside the 07:00 window.
  assert.equal(queueReleaseAt(new Date('2026-10-12T23:30:00Z'), WINDOWS, 30).toISOString(), '2026-10-12T23:00:00.000Z');
});

test('paid status: preorder before its release is SCHEDULED; otherwise PAID', () => {
  const now = TUE('06:00');
  assert.equal(statusAfterPayment({ isPreorder: true, queueReleaseAt: TUE('07:00') }, now), 'SCHEDULED');
  assert.equal(statusAfterPayment({ isPreorder: true, queueReleaseAt: TUE('06:00') }, now), 'PAID', 'release time reached');
  assert.equal(statusAfterPayment({ isPreorder: false, queueReleaseAt: null }, now), 'PAID');
  assert.equal(statusAfterPayment({ isPreorder: true, queueReleaseAt: null }, now), 'PAID', 'older preorders');
});

// ------------------------------------------------------- payment -> SCHEDULED

function webhook(order) {
  const state = { order: { status: 'PENDING', ...order }, history: [], audits: [], ledger: 0, events: [] };
  const tx = {
    $queryRaw: async () => [],
    paymentShare: {
      count: async ({ where }) => (where.paymentId ? 1 : 0),
      updateMany: async () => {},
    },
    payment: { updateMany: async () => ({ count: 1 }) },
    auditRecord: { create: async ({ data }) => state.audits.push(data) },
    order: {
      findUnique: async () => ({ id: 'order-1', customerId: 'student', vendorId: 'vendor', updatedAt: new Date(),
        totalAmount: D('120'), marketplaceFee: D('0'), ...state.order }),
      updateMany: async ({ where, data }) => {
        if (state.order.status !== where.status) return { count: 0 };
        Object.assign(state.order, data);
        return { count: 1 };
      },
    },
    orderStatusHistory: { create: async ({ data }) => state.history.push(data) },
    vendorLedgerEntry: { create: async () => { state.ledger += 1; } },
  };
  const prisma = {
    payment: { findFirst: async () => ({ id: 'payment-1', status: 'PENDING', purpose: 'ORDER_SHARE', providerPaymentId: 'cs_1',
      providerPaymentResourceId: null, paymentShares: [{ orderId: 'order-1', paymentId: 'payment-1', status: 'PENDING' }] }) },
    $transaction: async (work) => work(tx),
  };
  const realtime = { emitOrderStatusUpdated: async (userId, payload) => state.events.push(payload.status) };
  const service = new PaymentsService({}, prisma, {}, { retryPendingAutoRefunds: async () => ({}) }, realtime, {});
  const event = { data: { attributes: { type: 'checkout_session.payment.paid', data: {
    id: 'cs_1', type: 'checkout_session',
    attributes: { reference_number: 'payment-1', payments: [{ id: 'pay_1', type: 'payment', attributes: { status: 'paid' } }] },
  } } } };
  return { run: () => service.handleWebhookEvent(event), state };
}

test('PayMongo payment of a preorder holds it as SCHEDULED, with history, ledger credit and event', async () => {
  const h = webhook({ isPreorder: true, queueReleaseAt: new Date(Date.now() + 8 * 3600_000) });
  const result = await h.run();
  assert.equal(result.orderMarkedPaid, true);
  assert.equal(h.state.order.status, 'SCHEDULED');
  assert.ok(h.state.order.paidAt instanceof Date);
  assert.deepEqual(h.state.history.map((r) => r.status), ['SCHEDULED']);
  assert.match(h.state.history[0].note, /held until the pickup window opens/);
  assert.equal(h.state.ledger, 1, 'the vendor is credited when paid, not when released');
  assert.deepEqual(h.state.events, ['SCHEDULED']);
});

test('a preorder paid after its release time, or a regular order, goes straight to PAID', async () => {
  for (const order of [
    { isPreorder: true, queueReleaseAt: new Date(Date.now() - 60_000) },
    { isPreorder: false, queueReleaseAt: null },
  ]) {
    const h = webhook(order);
    await h.run();
    assert.equal(h.state.order.status, 'PAID', JSON.stringify(order));
    assert.deepEqual(h.state.events, ['PAID']);
  }
});

test('wallet payment of a preorder also holds it as SCHEDULED', async () => {
  const order = { id: 'order-1', status: 'PENDING', isPreorder: true, reservationExpiresAt: new Date(Date.now() + 600_000),
    queueReleaseAt: new Date(Date.now() + 8 * 3600_000), customerId: 'student', vendorId: 'vendor',
    totalAmount: D('120'), marketplaceFee: D('0') };
  const written = { history: [], events: [] };
  const tx = {
    payment: { findUnique: async () => null, create: async ({ data }) => ({ id: 'payment-1', ...data }) },
    paymentShare: {
      findFirst: async () => ({ id: 'share-1', orderId: 'order-1', status: 'PENDING', amountDue: D('120'), payment: null, order }),
      update: async () => {}, updateMany: async () => {}, count: async () => 0,
    },
    $queryRaw: async () => [],
    wallet: { updateMany: async () => ({ count: 1 }), findUniqueOrThrow: async () => ({ balance: D('0') }) },
    walletEntry: { create: async () => {} },
    auditRecord: { create: async () => {} },
    order: { update: async ({ data }) => ({ ...order, ...data, updatedAt: new Date() }) },
    orderStatusHistory: { create: async ({ data }) => written.history.push(data.status) },
    vendorLedgerEntry: { create: async () => {} },
  };
  const realtime = { emitOrderStatusUpdated: async (userId, payload) => written.events.push(payload.status) };
  const wallet = new WalletService({ $transaction: async (work) => work(tx) }, {}, realtime);
  await wallet.pay('student', 'share-1', 'wallet-key');
  assert.deepEqual(written, { history: ['SCHEDULED'], events: ['SCHEDULED'] });
});

// ----------------------------------------------------------- state machine

function vendorUpdate(from, to) {
  const state = { status: from, history: 0 };
  const order = () => ({ id: 'order-1', customerId: 'student', vendorId: 'vendor', status: state.status,
    isPasabuyRequest: false, isPreorder: true, items: [], vendor: { id: 'vendor', name: 'V', status: 'ACTIVE' },
    subtotal: D(1), updatedAt: new Date() });
  const tx = {
    order: {
      findUnique: async () => order(),
      updateMany: async ({ where, data }) => (state.status === where.status ? (state.status = data.status, { count: 1 }) : { count: 0 }),
      findUniqueOrThrow: async () => order(),
    },
    vendor: { findUniqueOrThrow: async () => ({ preorderSameAsStoreHours: false, preorderAvailability: [], availability: [] }) },
    product: { updateMany: async () => {} },
    orderStatusHistory: { create: async () => { state.history += 1; return { id: 'h', changedAt: new Date() }; } },
    auditRecord: { create: async () => {} },
  };
  const prisma = { vendor: { findUnique: async () => ({ id: 'vendor' }) }, $transaction: async (work) => work(tx) };
  const service = new OrdersService(prisma, { autoRefundOrderPayments: async () => {} }, {}, {},
    { emitOrderStatusUpdated: async () => {}, emitOrderReady: async () => {} });
  return { run: () => service.updateVendorOrderStatus('owner', 'order-1', { status: to, cancellationReason: 'CLOSING_EARLY' }), state };
}

test('state machine: a vendor can cancel a SCHEDULED preorder but cannot start it early', async () => {
  const cancel = vendorUpdate('SCHEDULED', 'CANCELLED');
  await cancel.run();
  assert.deepEqual(cancel.state, { status: 'CANCELLED', history: 1 });

  for (const to of ['PAID', 'COOKING', 'READY_FOR_PICKUP', 'COMPLETED']) {
    const h = vendorUpdate('SCHEDULED', to);
    await assert.rejects(h.run(), (e) => status(e) === 400, `SCHEDULED -> ${to}`);
    assert.deepEqual(h.state, { status: 'SCHEDULED', history: 0 });
  }
  const back = vendorUpdate('PAID', 'SCHEDULED');
  await assert.rejects(back.run(), (e) => status(e) === 400, 'nothing moves back to SCHEDULED');
});

// ----------------------------------------------------------- release job

function releaseHarness(orders, { failFor = [] } = {}) {
  const state = { orders: structuredClone(orders), history: [], audits: [], vendorEvents: [], studentEvents: [] };
  let query;
  const tx = {
    order: {
      updateMany: async ({ where, data }) => {
        if (failFor.includes(where.id)) throw new Error('database hiccup');
        const order = state.orders.find((o) => o.id === where.id);
        if (!order || order.status !== where.status || order.queueReleaseAt > where.queueReleaseAt.lte) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }) => {
        const order = state.orders.find((o) => o.id === where.id);
        return { ...order, vendorId: 'vendor', customerId: 'student', totalAmount: D('120'), createdAt: new Date(),
          updatedAt: new Date(), vendor: { ownerUserId: 'owner' } };
      },
    },
    orderStatusHistory: { create: async ({ data }) => state.history.push(data) },
    auditRecord: { create: async ({ data }) => state.audits.push(data) },
  };
  const prisma = {
    order: { findMany: async (args) => {
      query = args;
      return state.orders.filter((o) => o.status === 'SCHEDULED' && o.queueReleaseAt <= args.where.queueReleaseAt.lte)
        .map(({ id }) => ({ id }));
    } },
    $transaction: async (work) => work(tx),
  };
  const realtime = {
    emitNewOrder: (owner, payload) => state.vendorEvents.push([owner, payload.orderId, payload.status]),
    emitOrderStatusUpdated: async (user, payload) => state.studentEvents.push([user, payload.status]),
    emitPreorderEvent: async () => {}, // US-061, asserted in preorder-realtime-regression.cjs
  };
  const service = new PreorderReservationsService(prisma, {}, realtime);
  service.logger.warn = () => {};
  service.clock = () => TUE('07:00');
  return { service, state, query: () => query };
}

test('release job: due preorders move to the live queue with history; vendor and student notified', async () => {
  const h = releaseHarness([
    { id: 'due', status: 'SCHEDULED', queueReleaseAt: TUE('07:00') },
    { id: 'later', status: 'SCHEDULED', queueReleaseAt: TUE('13:00') },
  ]);
  assert.deepEqual(await h.service.releaseScheduledPreorders(), ['due']);
  assert.deepEqual(h.query().where, { status: 'SCHEDULED', queueReleaseAt: { lte: TUE('07:00') } });
  assert.deepEqual(h.state.orders.map((o) => [o.id, o.status]), [['due', 'PAID'], ['later', 'SCHEDULED']]);
  assert.deepEqual(h.state.history, [{ orderId: 'due', status: 'PAID', changedByUserId: null,
    note: 'Scheduled preorder released to the live queue' }]);
  assert.deepEqual(h.state.audits[0].beforeState, { status: 'SCHEDULED' });
  assert.deepEqual(h.state.vendorEvents, [['owner', 'due', 'PAID']]);
  assert.deepEqual(h.state.studentEvents, [['student', 'PAID']]);
});

test('release job: a preorder cancelled in the meantime is not released', async () => {
  const h = releaseHarness([{ id: 'due', status: 'SCHEDULED', queueReleaseAt: TUE('06:30') }]);
  const findMany = h.service.prisma.order.findMany;
  h.service.prisma.order.findMany = async (args) => {
    const rows = await findMany(args);
    h.state.orders[0].status = 'CANCELLED'; // vendor cancels between query and transaction
    return rows;
  };
  assert.deepEqual(await h.service.releaseScheduledPreorders(), []);
  assert.deepEqual([h.state.history.length, h.state.vendorEvents.length, h.state.studentEvents.length], [0, 0, 0]);
});

test('release job: one failing preorder does not block the others', async () => {
  const h = releaseHarness([
    { id: 'broken', status: 'SCHEDULED', queueReleaseAt: TUE('06:00') },
    { id: 'fine', status: 'SCHEDULED', queueReleaseAt: TUE('06:30') },
  ], { failFor: ['broken'] });
  assert.deepEqual(await h.service.releaseScheduledPreorders(), ['fine']);
});

// ------------------------------------------------------------ vendor views

test('vendor sees held preorders separately; the live queue does not include them', async () => {
  const calls = [];
  const prisma = {
    vendor: { findUnique: async () => ({ id: 'vendor', name: 'V', status: 'ACTIVE' }) },
    order: { findMany: async (args) => { calls.push(args); return []; } },
  };
  const service = new OrdersService(prisma, {}, {}, {}, {});
  await service.getVendorScheduledOrders('owner');
  await service.getVendorOrderQueue('owner');
  assert.deepEqual(calls[0].where, { vendorId: 'vendor', status: 'SCHEDULED' });
  assert.deepEqual(calls[0].orderBy, { scheduledPickupAt: 'asc' });
  assert.ok(!calls[1].where.status.in.includes('SCHEDULED'));
});
