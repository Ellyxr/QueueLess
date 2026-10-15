// US-054: duplicate order / payment requests must not create extra rows or
// partially commit. Uses an in-memory store whose $transaction rolls back on
// error, like Postgres. Run after `pnpm build`:
//   node --test test/failure-duplicates-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { OrdersService } = require('../dist/orders/orders.service');
const { PaymentsService } = require('../dist/payments/payments.service');

const D = (value) => new Prisma.Decimal(value);
const p2002 = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
  code: 'P2002', clientVersion: 'test',
});
const status = (error) => error.getStatus?.();

// Clone that keeps Decimal and Date instances usable after rollback snapshots.
const clone = (value) => value instanceof Prisma.Decimal ? D(value) : value instanceof Date ? new Date(value)
  : Array.isArray(value) ? value.map(clone)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) : value;

// Transactions run one at a time (like rows locked with FOR UPDATE) and roll
// back on error.
function transactional(getState, setState, tx) {
  let queue = Promise.resolve();
  return (work) => {
    if (Array.isArray(work)) return Promise.all(work);
    const run = queue.then(async () => {
      const snapshot = clone(getState());
      try {
        return await work(tx);
      } catch (error) {
        setState(snapshot);
        throw error;
      }
    });
    queue = run.catch(() => undefined);
    return run;
  };
}

// ------------------------------------------------------------------ orders

const VENDOR = { id: 'vendor', ownerUserId: 'owner', name: 'Kuya Grill', status: 'ACTIVE', preorderEnabled: false };

function orderHarness() {
  let state = {
    keys: {},
    carts: {
      'cart-1': { id: 'cart-1', userId: 'student', vendorId: 'vendor', status: 'ACTIVE', groupOrderId: null },
      'cart-2': { id: 'cart-2', userId: 'student', vendorId: 'vendor', status: 'ACTIVE', groupOrderId: null },
    },
    orders: [], audits: [], emitted: [],
  };
  let raceKey = null; // simulates another request inserting the key first
  const items = [{ productId: 'p1', quantity: 2, product: {
    id: 'p1', vendorId: 'vendor', name: 'Silog', isAvailable: true, price: D('60.00'), preparationTimeMinutes: 10,
  } }];
  const withOrder = (record) => record && {
    ...record, order: record.orderId ? state.orders.find((o) => o.id === record.orderId) : null,
  };
  const tx = {
    orderIdempotencyKey: {
      create: async ({ data }) => {
        const id = `${data.userId}:${data.key}`;
        if (state.keys[id] || raceKey === data.key) throw p2002();
        state.keys[id] = { ...data, orderId: null };
      },
      update: async ({ where, data }) => Object.assign(state.keys[`${where.userId_key.userId}:${where.userId_key.key}`], data),
    },
    cart: {
      findFirst: async ({ where }) => {
        const cart = state.carts[where.id];
        return cart && cart.userId === where.userId && cart.status === where.status
          ? { ...cart, vendor: VENDOR, items } : null;
      },
      updateMany: async ({ where, data }) => {
        const cart = state.carts[where.id];
        if (!cart || cart.status !== where.status) return { count: 0 };
        Object.assign(cart, data);
        return { count: 1 };
      },
    },
    order: {
      create: async ({ data }) => {
        const order = {
          id: `order-${state.orders.length + 1}-0000-0000`, customerId: data.customerId, vendorId: data.vendorId,
          eventId: data.eventId, orderType: data.orderType, status: data.status, isPasabuyRequest: false,
          isPreorder: data.isPreorder, cancellationReason: null, cancellationNote: null,
          estimatedReadyAt: data.estimatedReadyAt, pickupConfirmedAt: null, subtotal: data.subtotal,
          totalAmount: data.totalAmount, createdAt: new Date(), vendor: VENDOR, items: [],
        };
        state.orders.push(order);
        return order;
      },
    },
    auditRecord: { create: async ({ data }) => state.audits.push(data) },
  };
  const prisma = {
    orderIdempotencyKey: {
      findUnique: async ({ where }) => withOrder(state.keys[`${where.userId_key.userId}:${where.userId_key.key}`]),
    },
    $transaction: transactional(() => state, (s) => { state = s; }, tx),
  };
  const pricing = { calculateOrderTotals: (subtotal) => ({
    subtotal, marketplaceFee: D(0), totalAmount: subtotal, marketplaceFeeRate: D(0), ruleVersion: 'test',
  }) };
  const realtime = { emitNewOrder: (owner, payload) => state.emitted.push(payload.orderId) };
  const service = new OrdersService(prisma, {}, {}, pricing, realtime);
  return {
    service, state: () => state,
    raceWith: (key, orderId) => {
      raceKey = key;
      state.keys[`student:${key}`] = { userId: 'student', key, cartId: 'cart-1', eventId: null, orderId };
    },
  };
}

test('duplicate order: retry with the same Idempotency-Key returns the same order, no second order', async () => {
  const h = orderHarness();
  const first = await h.service.createOrder('student', { cartId: 'cart-1' }, 'key-1');
  const retry = await h.service.createOrder('student', { cartId: 'cart-1' }, 'key-1');
  assert.equal(retry.id, first.id);
  assert.equal(h.state().orders.length, 1);
  assert.deepEqual(h.state().emitted, [first.id]);
  assert.equal(h.state().carts['cart-1'].status, 'CHECKED_OUT');
});

test('duplicate order: same key reused for a different cart is rejected (409), nothing created', async () => {
  const h = orderHarness();
  await h.service.createOrder('student', { cartId: 'cart-1' }, 'key-1');
  await assert.rejects(h.service.createOrder('student', { cartId: 'cart-2' }, 'key-1'), (e) => status(e) === 409);
  assert.equal(h.state().orders.length, 1);
  assert.equal(h.state().carts['cart-2'].status, 'ACTIVE');
});

test('duplicate order: a checked-out cart cannot be ordered again with a new key; the key is rolled back', async () => {
  const h = orderHarness();
  await h.service.createOrder('student', { cartId: 'cart-1' }, 'key-1');
  await assert.rejects(h.service.createOrder('student', { cartId: 'cart-1' }, 'key-2'), (e) => status(e) === 404);
  assert.equal(h.state().orders.length, 1);
  assert.equal(h.state().keys['student:key-2'], undefined, 'failed request must not leave a stuck key');
});

test('duplicate order: concurrent request with the same key returns the winner\'s order', async () => {
  const h = orderHarness();
  const winner = await h.service.createOrder('student', { cartId: 'cart-1' }, 'key-1');
  h.raceWith('key-race', winner.id);
  const loser = await h.service.createOrder('student', { cartId: 'cart-1' }, 'key-race');
  assert.equal(loser.id, winner.id);
  assert.equal(h.state().orders.length, 1);
});

test('duplicate order: missing or oversized Idempotency-Key is rejected (400)', async () => {
  const h = orderHarness();
  await assert.rejects(h.service.createOrder('student', { cartId: 'cart-1' }, ''), (e) => status(e) === 400);
  await assert.rejects(h.service.createOrder('student', { cartId: 'cart-1' }, 'x'.repeat(256)), (e) => status(e) === 400);
  assert.equal(h.state().orders.length, 0);
});

// ---------------------------------------------------------------- checkout

function checkoutHarness({ shareStatus = 'PENDING', orderStatus = 'PENDING', priorPayment = null, failProvider = 0 } = {}) {
  let state = {
    share: { id: 'share-1', orderId: 'order-1', payerUserId: 'student', amountDue: D('120.00'),
      status: shareStatus, paymentId: priorPayment?.id ?? null },
    order: { id: 'order-1', status: orderStatus },
    payments: priorPayment ? { [priorPayment.id]: { currency: 'PHP', provider: 'PAYMONGO', ...priorPayment } } : {},
    keys: {}, audits: [],
  };
  let providerCalls = 0;
  let failures = failProvider;
  const tx = {
    $queryRaw: async () => [],
    paymentShare: {
      findUniqueOrThrow: async () => ({ ...state.share, order: state.order }),
      update: async ({ data }) => Object.assign(state.share, data),
    },
    payment: {
      create: async ({ data }) => {
        const payment = { id: `payment-${Object.keys(state.payments).length + 1}`, provider: 'PAYMONGO', ...data };
        state.payments[payment.id] = payment;
        return payment;
      },
      findUniqueOrThrow: async ({ where }) => state.payments[where.id],
      update: async ({ where, data }) => Object.assign(state.payments[where.id], data),
    },
    paymentIdempotencyKey: {
      update: async ({ where, data }) => Object.assign(Object.values(state.keys).find((k) => k.id === where.id), data),
    },
    auditRecord: { create: async ({ data }) => state.audits.push(data) },
  };
  const prisma = {
    paymentShare: {
      findFirst: async ({ where }) => where.id === state.share.id && where.payerUserId === state.share.payerUserId
        ? { ...state.share, order: state.order, payment: state.share.paymentId ? state.payments[state.share.paymentId] : null }
        : null,
    },
    paymentIdempotencyKey: {
      findUnique: async ({ where }) => {
        const key = state.keys[where.userId_key.key];
        return key && { ...key, payment: key.paymentId ? state.payments[key.paymentId] : null };
      },
      create: async ({ data }) => {
        if (state.keys[data.key]) throw p2002();
        state.keys[data.key] = { id: `key-${data.key}`, ...data, paymentId: null, checkoutSessionId: null, checkoutUrl: null };
        return { ...state.keys[data.key], payment: null };
      },
      update: tx.paymentIdempotencyKey.update,
      deleteMany: async ({ where }) => {
        for (const [name, key] of Object.entries(state.keys)) {
          if (key.id === where.id && key.checkoutSessionId === where.checkoutSessionId) delete state.keys[name];
        }
      },
    },
    payment: {
      update: tx.payment.update,
      updateMany: async ({ where, data }) => {
        const payment = state.payments[where.id];
        if (!payment || payment.status !== where.status) return { count: 0 };
        Object.assign(payment, data);
        return { count: 1 };
      },
    },
    auditRecord: tx.auditRecord,
    $transaction: null,
  };
  prisma.$transaction = transactional(() => state, (s) => { state = s; }, { ...tx, payment: { ...tx.payment, updateMany: prisma.payment.updateMany } });
  const paymongo = {
    createCheckoutSession: async () => {
      providerCalls += 1;
      if (failures > 0) {
        failures -= 1;
        throw new Error('PayMongo unavailable');
      }
      return { checkoutSessionId: `cs_${providerCalls}`, checkoutUrl: `https://checkout.test/${providerCalls}`, status: 'active' };
    },
  };
  const service = new PaymentsService({}, prisma, paymongo, {}, {}, {});
  return { service, state: () => state, providerCalls: () => providerCalls };
}

test('duplicate checkout: retry with the same key replays the session; PayMongo called once', async () => {
  const h = checkoutHarness();
  const first = await h.service.createCheckout('student', 'share-1', 'pay-key');
  const retry = await h.service.createCheckout('student', 'share-1', 'pay-key');
  assert.equal(retry.idempotentReplay, true);
  assert.equal(retry.checkoutSessionId, first.checkoutSessionId);
  assert.equal(h.providerCalls(), 1);
  assert.equal(Object.keys(h.state().payments).length, 1);
});

test('duplicate checkout: a key reused for another payment share is rejected (409)', async () => {
  const h = checkoutHarness();
  await h.service.createCheckout('student', 'share-1', 'pay-key');
  h.state().keys['pay-key'].paymentShareId = 'share-other';
  await assert.rejects(h.service.createCheckout('student', 'share-1', 'pay-key'), (e) => status(e) === 409);
  assert.equal(h.providerCalls(), 1);
});

test('duplicate payment: paid share, non-PENDING order or succeeded payment cannot start a checkout', async () => {
  for (const options of [
    { shareStatus: 'PAID' },
    { orderStatus: 'PAID' },
    { orderStatus: 'CANCELLED' },
    { priorPayment: { id: 'payment-old', status: 'SUCCEEDED', amount: D('120.00') } },
  ]) {
    const h = checkoutHarness(options);
    await assert.rejects(h.service.createCheckout('student', 'share-1', 'pay-key'), (e) => status(e) === 409, JSON.stringify(options));
    assert.equal(h.providerCalls(), 0);
    assert.equal(h.state().share.status, options.shareStatus ?? 'PENDING');
  }
});

test('checkout failure at PayMongo: payment marked FAILED, key released, same key can retry', async () => {
  const h = checkoutHarness({ failProvider: 1 });
  await assert.rejects(h.service.createCheckout('student', 'share-1', 'pay-key'), /PayMongo unavailable/);
  const [payment] = Object.values(h.state().payments);
  assert.equal(payment.status, 'FAILED');
  assert.equal(h.state().keys['pay-key'], undefined);

  const retry = await h.service.createCheckout('student', 'share-1', 'pay-key');
  assert.equal(retry.idempotentReplay, false);
  assert.equal(Object.keys(h.state().payments).length, 1, 'retry reuses the share\'s payment row');
  assert.equal(h.state().payments[retry.paymentId].status, 'PENDING');
});

test('checkout for someone else\'s payment share is 404 and touches nothing', async () => {
  const h = checkoutHarness();
  await assert.rejects(h.service.createCheckout('intruder', 'share-1', 'pay-key'), (e) => status(e) === 404);
  assert.deepEqual(h.state().keys, {});
  assert.equal(h.providerCalls(), 0);
});

// ----------------------------------------------------------------- webhook

function webhookHarness({ orderStatus = 'PENDING', paymentStatus = 'PENDING' } = {}) {
  let state = {
    payment: { id: 'payment-1', status: paymentStatus, providerPaymentId: 'cs_1', providerPaymentResourceId: null, purpose: 'ORDER_SHARE' },
    shares: [{ id: 'share-1', orderId: 'order-1', paymentId: 'payment-1', status: 'PENDING' }],
    order: { id: 'order-1', customerId: 'student', vendorId: 'vendor', status: orderStatus,
      totalAmount: D('120.00'), marketplaceFee: D('0'), updatedAt: new Date() },
    history: [], ledger: [], audits: [], emitted: [], refunds: [],
  };
  const tx = {
    $queryRaw: async () => [],
    paymentShare: {
      count: async ({ where }) => state.shares.filter((s) =>
        (!where.paymentId || s.paymentId === where.paymentId) && (!where.orderId || s.orderId === where.orderId) &&
        s.status === where.status).length,
      updateMany: async ({ where, data }) => {
        for (const s of state.shares) if (s.paymentId === where.paymentId && s.status === where.status) Object.assign(s, data);
      },
    },
    payment: {
      updateMany: async ({ where, data }) => {
        if (state.payment.id !== where.id || state.payment.status === where.status.not) return { count: 0 };
        Object.assign(state.payment, data);
        return { count: 1 };
      },
    },
    order: {
      findUnique: async () => ({ ...state.order }),
      updateMany: async ({ where, data }) => {
        if (state.order.status !== where.status) return { count: 0 };
        Object.assign(state.order, data);
        return { count: 1 };
      },
    },
    orderStatusHistory: { create: async ({ data }) => state.history.push(data) },
    vendorLedgerEntry: { create: async ({ data }) => state.ledger.push(data) },
    auditRecord: { create: async ({ data }) => state.audits.push(data) },
  };
  const prisma = {
    payment: {
      findFirst: async ({ where }) => where.providerPaymentId === state.payment.providerPaymentId
        ? { ...state.payment, paymentShares: state.shares.filter((s) => s.paymentId === state.payment.id) } : null,
      update: async ({ data }) => Object.assign(state.payment, data),
    },
    $transaction: transactional(() => state, (s) => { state = s; }, tx),
  };
  const refunds = {
    retryPendingAutoRefunds: async () => ({ requiresReview: false }),
    autoRefundPayment: async (paymentId, category) => {
      state.refunds.push({ paymentId, category });
      return { status: 'PROCESSED' };
    },
  };
  const realtime = { emitOrderStatusUpdated: async (userId, payload) => state.emitted.push(payload.status) };
  const service = new PaymentsService({}, prisma, {}, refunds, realtime, {});
  const event = {
    data: { attributes: { type: 'checkout_session.payment.paid', data: {
      id: 'cs_1', type: 'checkout_session',
      attributes: { reference_number: 'payment-1', payments: [
        { id: 'pay_1', type: 'payment', attributes: { status: 'paid', amount: 12000, currency: 'PHP' } },
      ] },
    } } },
  };
  return { service, event, state: () => state };
}

test('duplicate webhook delivery: order PAID once, one ledger credit, one history row, one event', async () => {
  const h = webhookHarness();
  const first = await h.service.handleWebhookEvent(h.event);
  const second = await h.service.handleWebhookEvent(h.event);
  assert.equal(first.orderMarkedPaid, true);
  assert.equal(second.duplicate, true);
  assert.equal(h.state().order.status, 'PAID');
  assert.equal(h.state().ledger.length, 1);
  assert.equal(h.state().history.length, 1);
  assert.deepEqual(h.state().emitted, ['PAID']);
});

test('concurrent duplicate webhook deliveries: exactly one marks the order PAID', async () => {
  const h = webhookHarness();
  // Both deliveries read the payment as PENDING before either transaction runs.
  const results = await Promise.all([h.service.handleWebhookEvent(h.event), h.service.handleWebhookEvent(h.event)]);
  assert.deepEqual(results.map((r) => r.duplicate).sort(), [false, true]);
  assert.equal(h.state().ledger.length, 1);
  assert.equal(h.state().history.length, 1);
  assert.deepEqual(h.state().emitted, ['PAID']);
});

test('second payment for an already-paid order is auto-refunded, order untouched', async () => {
  const h = webhookHarness({ orderStatus: 'PAID' });
  const result = await h.service.handleWebhookEvent(h.event);
  assert.equal(result.orderMarkedPaid, false);
  assert.equal(result.autoRefunded, true);
  assert.deepEqual(h.state().refunds, [{ paymentId: 'payment-1', category: 'DUPLICATE_PAYMENT' }]);
  assert.equal(h.state().ledger.length, 0);
  assert.equal(h.state().history.length, 0);
  assert.deepEqual(h.state().emitted, []);
});
