// US-054: invalid PayMongo webhooks are rejected before any state change, and
// realtime connections recover safely (auth on every connect, realtime.ready
// only after joining the user's room, publish failures never break requests).
// Run after `pnpm build`:  node --test test/failure-webhook-realtime-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
require('reflect-metadata');
const jwt = require('jsonwebtoken');
const { PaymongoService } = require('../dist/payments/paymongo.service');
const { PaymentsService } = require('../dist/payments/payments.service');
const { PaymentsController } = require('../dist/payments/payments.controller');
const { RealtimeGateway } = require('../dist/realtime/realtime.gateway');

const SECRET = 'whsk_test_secret';
const status = (error) => error.getStatus?.();
const BODY = Buffer.from('{"data":{"attributes":{"type":"checkout_session.payment.paid"}}}');
const now = () => Math.floor(Date.now() / 1000);
const sign = (body, timestamp, secret = SECRET) =>
  createHmac('sha256', secret).update(`${timestamp}.${body.toString('utf8')}`).digest('hex');
const paymongo = (secret = SECRET) => new PaymongoService({ get: (key) => (key === 'PAYMONGO_WEBHOOK_SECRET' ? secret : undefined) });

// ------------------------------------------------------- webhook signature

test('valid sandbox signature is accepted', () => {
  const t = now();
  assert.doesNotThrow(() => paymongo().verifyWebhookSignature(BODY, `t=${t},te=${sign(BODY, t)},li=`));
});

test('invalid webhook signatures are rejected with 401', () => {
  const t = now();
  const cases = {
    'missing header': undefined,
    'no timestamp': `te=${sign(BODY, t)}`,
    'non-numeric timestamp': `t=abc,te=${sign(BODY, t)}`,
    'expired (6 minutes old)': `t=${t - 360},te=${sign(BODY, t - 360)}`,
    'from the future (6 minutes)': `t=${t + 360},te=${sign(BODY, t + 360)}`,
    'live-mode signature only': `t=${t},li=${sign(BODY, t)}`,
    'wrong secret': `t=${t},te=${sign(BODY, t, 'other-secret')}`,
    'truncated signature': `t=${t},te=${sign(BODY, t).slice(0, 20)}`,
    'signature for a different body': `t=${t},te=${sign(Buffer.from('{"data":{}}'), t)}`,
    'timestamp swapped after signing': `t=${t - 1},te=${sign(BODY, t)}`,
  };
  for (const [name, header] of Object.entries(cases)) {
    assert.throws(() => paymongo().verifyWebhookSignature(BODY, header), (e) => status(e) === 401, name);
  }
});

test('missing webhook secret on the server fails closed (500), never accepts', () => {
  const t = now();
  assert.throws(() => paymongo('').verifyWebhookSignature(BODY, `t=${t},te=${sign(BODY, t)}`), (e) => status(e) === 500);
});

test('controller: bad signature or missing raw body never reaches event processing', async () => {
  let processed = 0;
  const payments = new PaymentsService({}, {}, paymongo(), {}, {}, {});
  payments.handleWebhookEvent = async () => { processed += 1; };
  const controller = new PaymentsController(payments);
  await assert.rejects(controller.handleWebhook({ rawBody: BODY, body: {} }, 't=1,te=bad'), (e) => status(e) === 401);
  await assert.rejects(controller.handleWebhook({ body: {} }, undefined), (e) => status(e) === 500);
  assert.equal(processed, 0);
});

// ------------------------------------------------------- webhook payloads

function payloadHarness(payment) {
  const writes = [];
  const prisma = {
    payment: { findFirst: async () => payment },
    $transaction: async () => { writes.push('transaction'); },
  };
  return { service: new PaymentsService({}, prisma, {}, {}, {}, {}), writes };
}

const paidEvent = (overrides = {}) => ({ data: { attributes: { type: 'checkout_session.payment.paid', data: {
  id: 'cs_1', type: 'checkout_session',
  attributes: { reference_number: 'payment-1', payments: [{ id: 'pay_1', type: 'payment', attributes: { status: 'paid' } }] },
  ...overrides,
} } } });
const KNOWN_PAYMENT = { id: 'payment-1', status: 'PENDING', purpose: 'ORDER_SHARE', providerPaymentId: 'cs_1', paymentShares: [{ orderId: 'o' }] };

test('malformed or unverifiable webhook payloads are rejected with no writes', async () => {
  const cases = [
    ['not an object', null, 400, KNOWN_PAYMENT],
    ['no data', {}, 400, KNOWN_PAYMENT],
    ['no event type', { data: { attributes: {} } }, 400, KNOWN_PAYMENT],
    ['missing checkout id', paidEvent({ id: '' }), 400, KNOWN_PAYMENT],
    ['wrong resource type', paidEvent({ type: 'payment' }), 400, KNOWN_PAYMENT],
    ['unknown checkout session', paidEvent(), 404, null],
    ['reference does not match the payment', paidEvent({ attributes: { reference_number: 'payment-2',
      payments: [{ id: 'pay_1', type: 'payment', attributes: { status: 'paid' } }] } }), 400, KNOWN_PAYMENT],
    ['no paid payment inside the session', paidEvent({ attributes: { reference_number: 'payment-1',
      payments: [{ id: 'pay_1', type: 'payment', attributes: { status: 'failed' } }] } }), 400, KNOWN_PAYMENT],
  ];
  for (const [name, event, expected, payment] of cases) {
    const h = payloadHarness(payment);
    await assert.rejects(h.service.handleWebhookEvent(event), (e) => status(e) === expected, name);
    assert.deepEqual(h.writes, [], `${name} wrote state`);
  }
});

test('unrelated PayMongo event types are acknowledged and ignored', async () => {
  const h = payloadHarness(KNOWN_PAYMENT);
  const result = await h.service.handleWebhookEvent({ data: { attributes: { type: 'source.chargeable', data: {} } } });
  assert.deepEqual(result, { received: true, processed: false, eventType: 'source.chargeable' });
  assert.deepEqual(h.writes, []);
});

// ------------------------------------------------------- realtime recovery

process.env.JWT_SECRET = 'test-jwt-secret';

function gatewayWith(user) {
  const gateway = new RealtimeGateway({ user: { findUnique: async () => user } });
  return gateway;
}

function socket({ token, header } = {}) {
  const log = [];
  return {
    log,
    handshake: { auth: token === undefined ? {} : { token }, headers: header ? { authorization: header } : {} },
    join: async (room) => log.push(`join:${room}`),
    emit: (event) => log.push(`emit:${event}`),
    disconnect: () => log.push('disconnect'),
  };
}

const ACTIVE = { id: 'student', isActive: true, archivedAt: null, roleAssignments: [{ role: 'BUYER' }] };
const token = (payload = { sub: 'student', roles: ['BUYER'] }, options = {}) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m', ...options });

test('socket auth: valid token joins the user room, then gets realtime.ready (in that order)', async () => {
  for (const client of [socket({ token: token() }), socket({ token: `Bearer ${token()}` }), socket({ header: `Bearer ${token()}` })]) {
    await gatewayWith(ACTIVE).handleConnection(client);
    assert.deepEqual(client.log, ['join:user:student', 'emit:realtime.ready']);
  }
});

test('socket auth: every invalid connection is disconnected without joining a room', async () => {
  const cases = {
    'no token': [socket(), ACTIVE],
    'garbage token': [socket({ token: 'not-a-jwt' }), ACTIVE],
    'wrong signing secret': [socket({ token: jwt.sign({ sub: 'student' }, 'other') }), ACTIVE],
    'expired token': [socket({ token: token(undefined, { expiresIn: -10 }) }), ACTIVE],
    'deleted user': [socket({ token: token() }), null],
    'deactivated user': [socket({ token: token() }), { ...ACTIVE, isActive: false }],
    'archived user': [socket({ token: token() }), { ...ACTIVE, archivedAt: new Date() }],
    'all roles revoked': [socket({ token: token() }), { ...ACTIVE, roleAssignments: [] }],
  };
  for (const [name, [client, user]] of Object.entries(cases)) {
    await gatewayWith(user).handleConnection(client);
    assert.deepEqual(client.log, ['disconnect'], name);
  }
});

test('reconnect: each new connection is re-authenticated and gets realtime.ready again', async () => {
  let lookups = 0;
  const gateway = new RealtimeGateway({ user: { findUnique: async () => { lookups += 1; return ACTIVE; } } });
  const first = socket({ token: token() });
  const second = socket({ token: token() });
  await gateway.handleConnection(first);
  await gateway.handleConnection(second);
  assert.equal(lookups, 2, 'user is re-checked on reconnect');
  assert.deepEqual(second.log, ['join:user:student', 'emit:realtime.ready']);

  const revoked = new RealtimeGateway({ user: { findUnique: async () => ({ ...ACTIVE, isActive: false }) } });
  const third = socket({ token: token() });
  await revoked.handleConnection(third);
  assert.deepEqual(third.log, ['disconnect'], 'a user deactivated while offline cannot reconnect');
});

test('publishing never throws into the caller, even when the database is down', async () => {
  const sent = [];
  const gateway = new RealtimeGateway({
    order: { findUnique: async () => { throw new Error('database unavailable'); } },
    pasabuyRequest: { findUnique: async () => { throw new Error('database unavailable'); } },
  });
  gateway.server = { to: () => ({ emit: (...args) => sent.push(args) }) };
  gateway.logger.warn = () => {}; // keep test output quiet
  await gateway.emitOrderStatusUpdated('student', { orderId: 'o', status: 'PAID', updatedAt: new Date() });
  await gateway.emitOrderReady('o', { eventId: 'h', readyAt: new Date() });
  await gateway.emitPasabuyStatusUpdated('r');
  assert.deepEqual(sent, []);
});
