// US-053: end-to-end smoke test of the core demo path, backend + payment +
// realtime, against a running API (local or staging):
//
//   health/readiness -> logins -> sockets (buyer, outsider, vendor)
//   -> cart -> order (idempotent) -> vendor gets order.created
//   -> PayMongo checkout (idempotent) -> payment webhook -> PAID
//   -> vendor COOKING -> READY (order.ready to the buyer only)
//   -> recovery endpoints agree on eventId -> buyer confirms pickup -> COMPLETED
//
// It creates one real order for the test accounts. Use test accounts only.
//
// Usage (from artifacts/api-server):
//   pnpm smoke                                    local API, simulated webhook
//   pnpm smoke -- --base-url https://queueless-bg1x.onrender.com
//   pnpm smoke -- --payment real                  pay the printed checkout URL
//                                                 yourself (staging, real webhook)
// Accounts (env): SMOKE_BUYER_EMAIL, SMOKE_OUTSIDER_EMAIL, SMOKE_VENDOR_EMAIL,
//   SMOKE_PASSWORD (or SMOKE_<ROLE>_PASSWORD). Optional SMOKE_PRODUCT_ID.
// --payment simulate signs a checkout_session.payment.paid webhook with
//   PAYMONGO_WEBHOOK_SECRET (read from --env-file, default .env), so the real
//   signature check and payment code run without opening the checkout page.
/* eslint-disable @typescript-eslint/no-explicit-any -- asserts on untyped JSON API responses */
import { createHmac, randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { RealtimeProbe } from './realtime-probe';

// ------------------------------------------------------------------ config

const args = process.argv.slice(2);
const arg = (name: string, fallback?: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

dotenv.config({ path: path.resolve(__dirname, '..', arg('env-file', '.env')!), quiet: true });

const BASE_URL = (arg('base-url') ?? process.env.SMOKE_BASE_URL ?? 'http://localhost:5000').replace(/\/+$/, '');
const API = `${BASE_URL}/api/v1`;
const PAYMENT_MODE = arg('payment', 'simulate') as 'simulate' | 'real';
const REAL_PAYMENT_TIMEOUT_MS = 10 * 60_000;

function account(role: 'BUYER' | 'OUTSIDER' | 'VENDOR') {
  const email = process.env[`SMOKE_${role}_EMAIL`];
  const password = process.env[`SMOKE_${role}_PASSWORD`] ?? process.env.SMOKE_PASSWORD;
  if (!email || !password) {
    throw new Error(`Set SMOKE_${role}_EMAIL and SMOKE_PASSWORD (or SMOKE_${role}_PASSWORD)`);
  }
  return { email, password };
}

// ----------------------------------------------------------------- reporting

const results: { name: string; ok: boolean; detail: string }[] = [];
const started = Date.now();

function pass(name: string, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`  PASS  ${name}${detail ? `  (${detail})` : ''}`);
}

class SmokeFailure extends Error {}

function check(name: string, condition: unknown, detail: string): asserts condition {
  if (!condition) {
    results.push({ name, ok: false, detail });
    console.log(`  FAIL  ${name}  (${detail})`);
    throw new SmokeFailure(name);
  }
  pass(name);
}

function section(title: string) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------- http

interface Response<T = any> {
  status: number;
  body: T;
}

async function api<T = any>(
  method: string,
  route: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string } = {},
): Promise<Response<T>> {
  const response = await fetch(`${API}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    body: options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  }).catch((error: Error) => {
    throw new Error(`cannot reach ${API}${route} (is the API running?): ${String(error.cause ?? error.message)}`);
  });
  const text = await response.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }
  return { status: response.status, body };
}

const describe = (response: Response) =>
  `HTTP ${response.status}: ${JSON.stringify(response.body)?.slice(0, 300)}`;

async function login(role: 'BUYER' | 'OUTSIDER' | 'VENDOR') {
  const { email, password } = account(role);
  const response = await api('POST', '/auth/login', { body: { email, password } });
  check(`login ${role.toLowerCase()} (${email})`, response.status < 300 && response.body?.accessToken, describe(response));
  return response.body.accessToken as string;
}

// ------------------------------------------------------------------ webhook

function signedPaidWebhook(checkoutSessionId: string, paymentId: string, amountCentavos: number) {
  const body = JSON.stringify({
    data: {
      id: `evt_smoke_${randomUUID().replace(/-/g, '')}`,
      type: 'event',
      attributes: {
        type: 'checkout_session.payment.paid',
        livemode: false,
        data: {
          id: checkoutSessionId,
          type: 'checkout_session',
          attributes: {
            reference_number: paymentId,
            status: 'active',
            payments: [{
              // Synthetic, recognisable provider payment id for smoke data.
              id: `pay_smoke_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
              type: 'payment',
              attributes: { status: 'paid', amount: amountCentavos, currency: 'PHP' },
            }],
          },
        },
      },
    },
  });
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) throw new Error('PAYMONGO_WEBHOOK_SECRET is required for --payment simulate');
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return { body, header: `t=${timestamp},te=${signature},li=` };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --------------------------------------------------------------------- flow

const probes: RealtimeProbe[] = [];

async function run() {
  console.log(`QueueLess smoke test -> ${BASE_URL} (payment: ${PAYMENT_MODE})`);

  section('1. Health');
  const health = await api('GET', '/health');
  check('GET /health is ok', health.status === 200 && health.body?.status === 'ok', describe(health));
  const ready = await api('GET', '/health/ready');
  check(
    'GET /health/ready: database ok, no pending/failed migrations',
    ready.status === 200 && ready.body?.database?.status === 'ok',
    describe(ready),
  );
  console.log(`        environment=${health.body.environment}, migrations=${ready.body.database.migrations?.applied}/${ready.body.database.migrations?.total}`);

  section('2. Auth and realtime connections');
  const buyerToken = await login('BUYER');
  const outsiderToken = await login('OUTSIDER');
  const vendorToken = await login('VENDOR');

  const buyer = new RealtimeProbe(BASE_URL, buyerToken, 'buyer');
  const outsider = new RealtimeProbe(BASE_URL, outsiderToken, 'outsider');
  const vendorSocket = new RealtimeProbe(BASE_URL, vendorToken, 'vendor');
  const intruder = new RealtimeProbe(BASE_URL, 'not-a-valid-token', 'invalid token');
  probes.push(buyer, outsider, vendorSocket, intruder);
  await Promise.all([buyer.connect(), outsider.connect(), vendorSocket.connect()]);
  pass('buyer, outsider and vendor sockets authenticated (realtime.ready)');
  await intruder.connect(5_000).catch(() => undefined);
  check(
    'socket with an invalid token is rejected',
    !intruder.has('realtime.ready') && intruder.isDisconnected(),
    `reason=${intruder.disconnectReason()}`,
  );

  section('3. Order');
  const vendor = await api('GET', '/vendors/mine', { token: vendorToken });
  check('vendor profile is ACTIVE', vendor.status === 200 && vendor.body?.status === 'ACTIVE', describe(vendor));

  const products = await api('GET', `/products?vendorId=${vendor.body.id}`, { token: buyerToken });
  const product = process.env.SMOKE_PRODUCT_ID
    ? (products.body as any[]).find((p) => p.id === process.env.SMOKE_PRODUCT_ID)
    : (products.body as any[])?.find((p) => p.isAvailable);
  check(`vendor "${vendor.body.name}" has an available product`, product, describe(products));

  const cart = await api('POST', '/carts/items', { token: buyerToken, body: { productId: product.id, quantity: 1 } });
  check(`add "${product.name}" to cart`, cart.status < 300 && cart.body?.id, describe(cart));
  if (cart.body.items?.length > 1) {
    console.log(`        note: buyer's cart already had items; ${cart.body.items.length} products will be ordered`);
  }

  const orderKey = `smoke-order-${randomUUID()}`;
  const order = await api('POST', '/orders', {
    token: buyerToken, body: { cartId: cart.body.id }, headers: { 'Idempotency-Key': orderKey },
  });
  check('create order -> PENDING', order.status === 201 && order.body?.status === 'PENDING', describe(order));
  const orderId: string = order.body.id;
  console.log(`        order ${order.body.orderReference} (${orderId})`);

  const replay = await api('POST', '/orders', {
    token: buyerToken, body: { cartId: cart.body.id }, headers: { 'Idempotency-Key': orderKey },
  });
  check('order retry with same Idempotency-Key returns the same order', replay.body?.id === orderId, describe(replay));

  await vendorSocket.waitFor('order.created', (d) => d.orderId === orderId);
  pass('vendor received order.created');
  check('outsider cannot read the order (404)',
    (await api('GET', `/orders/${orderId}/status`, { token: outsiderToken })).status === 404, 'expected 404');

  section('4. Payment');
  const paymentStatus = await api('GET', `/payments/orders/${orderId}/status`, { token: buyerToken });
  check('payment share exists for the buyer', paymentStatus.status === 200 && paymentStatus.body?.paymentShare?.id, describe(paymentStatus));
  const share = paymentStatus.body.paymentShare;

  const checkoutKey = `smoke-checkout-${randomUUID()}`;
  const checkout = await api('POST', '/payments/checkout', {
    token: buyerToken, body: { paymentShareId: share.id }, headers: { 'Idempotency-Key': checkoutKey },
  });
  check('PayMongo checkout session created', checkout.status === 201 && checkout.body?.checkoutUrl, describe(checkout));
  const checkoutReplay = await api('POST', '/payments/checkout', {
    token: buyerToken, body: { paymentShareId: share.id }, headers: { 'Idempotency-Key': checkoutKey },
  });
  check('checkout retry is an idempotent replay (same session)',
    checkoutReplay.body?.checkoutSessionId === checkout.body.checkoutSessionId && checkoutReplay.body?.idempotentReplay,
    describe(checkoutReplay));

  if (PAYMENT_MODE === 'real') {
    console.log(`\n        Pay with a PayMongo test method now:\n        ${checkout.body.checkoutUrl}\n        waiting up to 10 minutes for PayMongo's webhook...`);
    await buyer.waitFor('order.status.updated', (d) => d.orderId === orderId && d.status === 'PAID', REAL_PAYMENT_TIMEOUT_MS);
  } else {
    const amountCentavos = Math.round(Number(share.amountDue) * 100);
    const unsigned = await api('POST', '/payments/webhook', {
      raw: signedPaidWebhook(checkout.body.checkoutSessionId, checkout.body.paymentId, amountCentavos).body,
    });
    check('webhook without signature is rejected (401)', unsigned.status === 401, describe(unsigned));

    const forged = signedPaidWebhook(checkout.body.checkoutSessionId, checkout.body.paymentId, amountCentavos);
    const tampered = await api('POST', '/payments/webhook', {
      raw: forged.body.replace('"status":"paid"', '"status":"paid" '), headers: { 'Paymongo-Signature': forged.header },
    });
    check('webhook with a signature that does not match the body is rejected (401)', tampered.status === 401, describe(tampered));

    const webhook = signedPaidWebhook(checkout.body.checkoutSessionId, checkout.body.paymentId, amountCentavos);
    const paid = await api('POST', '/payments/webhook', { raw: webhook.body, headers: { 'Paymongo-Signature': webhook.header } });
    check('signed payment webhook processed', paid.status === 200 && paid.body?.processed === true, describe(paid));
    const duplicate = await api('POST', '/payments/webhook', { raw: webhook.body, headers: { 'Paymongo-Signature': webhook.header } });
    check('duplicate webhook delivery is idempotent', duplicate.status === 200 && duplicate.body?.duplicate === true, describe(duplicate));
  }

  await buyer.waitFor('order.status.updated', (d) => d.orderId === orderId && d.status === 'PAID');
  pass('buyer received order.status.updated PAID');
  const afterPay = await api('GET', `/orders/${orderId}/status`, { token: buyerToken });
  check('order is PAID', afterPay.body?.status === 'PAID', describe(afterPay));

  section('5. Vendor workflow and buzzer');
  const setStatus = (status: string) =>
    api('PATCH', `/orders/vendor/${orderId}/status`, { token: vendorToken, body: { status } });

  const forbidden = await api('PATCH', `/orders/vendor/${orderId}/status`, { token: buyerToken, body: { status: 'COOKING' } });
  check('buyer cannot change order status (403)', forbidden.status === 403, describe(forbidden));

  const cooking = await setStatus('COOKING');
  check('vendor: PAID -> COOKING', cooking.status === 200 && cooking.body?.status === 'COOKING', describe(cooking));
  await buyer.waitFor('order.status.updated', (d) => d.orderId === orderId && d.status === 'COOKING');
  pass('buyer received order.status.updated COOKING');

  const readyStatus = await setStatus('READY_FOR_PICKUP');
  check('vendor: COOKING -> READY_FOR_PICKUP', readyStatus.status === 200 && readyStatus.body?.status === 'READY_FOR_PICKUP', describe(readyStatus));
  const buzz = await buyer.waitFor('order.ready', (d) => d.orderId === orderId);
  check('buyer received order.ready with eventId and readyAt', buzz.eventId && buzz.readyAt, JSON.stringify(buzz));
  console.log(`        buzzer: order ${buzz.orderReference} at ${buzz.vendor?.name} (${buzz.vendor?.pickupLocation ?? 'no pickup location'})`);

  const repeat = await setStatus('READY_FOR_PICKUP');
  check('repeating READY is accepted without a state change', repeat.status === 200, describe(repeat));
  await sleep(2_000);
  check('order.ready delivered exactly once to the buyer',
    buyer.find('order.ready', (d) => d.orderId === orderId).length === 1,
    `received ${buyer.find('order.ready', (d) => d.orderId === orderId).length}`);
  check('outsider received no events for this order',
    !outsider.events.some((e) => (e.data as any)?.orderId === orderId), JSON.stringify(outsider.events));
  check('vendor received no order.ready', !vendorSocket.has('order.ready', (d) => d.orderId === orderId), 'vendor got order.ready');

  section('6. Recovery endpoints (reconnect path)');
  const readyList = await api('GET', '/orders/ready-for-pickup', { token: buyerToken });
  const listed = (readyList.body?.orders as any[])?.find((o) => o.orderId === orderId);
  check('GET /orders/ready-for-pickup lists the order with the same eventId',
    listed?.eventId === buzz.eventId && listed?.pickupRole === 'CUSTOMER', describe(readyList));
  const mine = await api('GET', '/orders/mine', { token: buyerToken });
  const mineOrder = (mine.body as any[])?.find((o) => o.id === orderId);
  check('GET /orders/mine readyEventId matches', mineOrder?.readyEventId === buzz.eventId, JSON.stringify(mineOrder));
  const outsiderList = await api('GET', '/orders/ready-for-pickup', { token: outsiderToken });
  check('outsider\'s ready list does not include the order',
    !(outsiderList.body?.orders as any[])?.some((o) => o.orderId === orderId), describe(outsiderList));

  section('7. Pickup');
  const pickup = await api('PATCH', `/orders/${orderId}/pickup`, { token: buyerToken });
  check('buyer confirms pickup -> COMPLETED', pickup.status === 200 && pickup.body?.status === 'COMPLETED', describe(pickup));
  await buyer.waitFor('order.status.updated', (d) => d.orderId === orderId && d.status === 'COMPLETED');
  pass('buyer received order.status.updated COMPLETED');
  const afterPickup = await api('GET', '/orders/ready-for-pickup', { token: buyerToken });
  check('completed order left the ready list',
    !(afterPickup.body?.orders as any[])?.some((o) => o.orderId === orderId), describe(afterPickup));
  const final = await api('GET', `/orders/${orderId}/status`, { token: buyerToken });
  check('final status COMPLETED, readyEventId kept',
    final.body?.status === 'COMPLETED' && final.body?.readyEventId === buzz.eventId, describe(final));
}

run()
  .catch((error) => {
    if (!(error instanceof SmokeFailure)) {
      results.push({ name: 'unexpected error', ok: false, detail: String(error) });
      console.log(`  FAIL  ${String(error)}`);
    }
  })
  .finally(() => {
    for (const probe of probes) probe.close();
    const failed = results.filter((r) => !r.ok);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `\n${failed.length ? 'SMOKE TEST FAILED' : 'SMOKE TEST PASSED'}: ` +
        `${results.length - failed.length} passed, ${failed.length} failed in ${seconds}s`,
    );
    process.exit(failed.length ? 1 : 0);
  });
