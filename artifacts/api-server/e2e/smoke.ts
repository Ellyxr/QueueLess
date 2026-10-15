// US-053: end-to-end smoke test of the core demo path, backend + payment +
// realtime, against a running API (local or staging):
//
//   health/readiness -> logins -> sockets (buyer, outsider, vendor)
//   -> cart -> order (idempotent) -> vendor gets order.created
//   -> PayMongo checkout (idempotent) -> payment webhook -> PAID
//   -> vendor COOKING -> READY (order.ready to the buyer only)
//   -> recovery endpoints agree on eventId -> buyer confirms pickup -> COMPLETED
//   -> reviews (US-071): before pickup refused, duplicate refused, listed
//   -> preorder (US-071): out-of-window/too-soon slots refused, pay -> SCHEDULED,
//      early start refused, released once, buzzer, pickup (about 2-3 minutes;
//      skip with --skip-preorder). Vendor preorder hours are restored after.
//
// It creates real orders and a review for the test accounts. Use test accounts only.
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

  // US-071: reviewing is only possible after pickup.
  const earlyReview = await api('POST', `/orders/${orderId}/review`, { token: buyerToken, body: { rating: 5 } });
  check('review before pickup is refused (400)', earlyReview.status === 400, describe(earlyReview));

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

  section('8. Reviews');
  const outsiderReview = await api('POST', `/orders/${orderId}/review`, { token: outsiderToken, body: { rating: 1 } });
  check('another student cannot review this order (404)', outsiderReview.status === 404, describe(outsiderReview));
  const badRating = await api('POST', `/orders/${orderId}/review`, { token: buyerToken, body: { rating: 6 } });
  check('rating outside 1-5 is rejected (400)', badRating.status === 400, describe(badRating));
  const review = await api('POST', `/orders/${orderId}/review`, {
    token: buyerToken, body: { rating: 5, comment: '  Smoke test: hot and on time  ' },
  });
  check('buyer reviews the picked-up order (201, comment trimmed)',
    review.status === 201 && review.body?.comment === 'Smoke test: hot and on time', describe(review));
  const duplicateReview = await api('POST', `/orders/${orderId}/review`, { token: buyerToken, body: { rating: 4 } });
  check('a second review of the same order is refused (409)', duplicateReview.status === 409, describe(duplicateReview));
  const reviewsTab = await api('GET', `/vendors/${vendor.body.id}/reviews?pageSize=50`, { token: outsiderToken });
  const listedReview = (reviewsTab.body?.items as any[])?.find((r) => r.id === review.body.id);
  check('the review appears on the storefront Reviews tab, reviewer shown by first name + initial',
    reviewsTab.status === 200 && listedReview?.rating === 5 && !JSON.stringify(listedReview).includes('@'),
    describe(reviewsTab));

  if (args.includes('--skip-preorder')) {
    console.log('\n9. Preorder  (skipped: --skip-preorder)');
  } else if (PAYMENT_MODE !== 'simulate') {
    console.log('\n9. Preorder  (skipped: needs --payment simulate)');
  } else {
    await preorderFlow({ buyer, vendorSocket, buyerToken, vendorToken, vendorId: vendor.body.id, product });
  }
}

// ------------------------------------------------------------ preorder flow

const MANILA_OFFSET_MS = 8 * 60 * 60_000;
const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const RELEASE_TIMEOUT_MS = 4 * 60_000;

// Manila wall clock for an instant (UTC+8, no DST).
function manila(at: Date) {
  const local = new Date(at.getTime() + MANILA_OFFSET_MS);
  const hhmm = local.toISOString().slice(11, 16);
  return { day: WEEKDAYS[local.getUTCDay()], date: local.toISOString().slice(0, 10), hhmm,
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}
const isoManila = (at: Date) => `${manila(at).date}T${manila(at).hhmm}:00+08:00`;
const ceilMinute = (ms: number) => new Date(Math.ceil(ms / 60_000) * 60_000);

// US-071: reserve -> out-of-window / too-soon slots rejected -> pay -> SCHEDULED
// (preorder.confirmed to both) -> early start refused -> released exactly once
// (preorder.released) -> ready (order.ready) -> pickup. The vendor's preorder
// hours are set to a window opening in ~1 minute and restored afterwards.
async function preorderFlow(ctx: {
  buyer: RealtimeProbe; vendorSocket: RealtimeProbe; buyerToken: string; vendorToken: string;
  vendorId: string; product: any;
}) {
  section('9. Preorder (scheduled pickup, payment, release, buzzer)');
  const { buyer, vendorSocket, buyerToken, vendorToken, vendorId, product } = ctx;
  const now = Date.now();
  const open = ceilMinute(now + 60_000);
  const close = new Date(open.getTime() + 120 * 60_000);
  const leadMinutes = Math.max(30, Number(product.preparationTimeMinutes ?? 0));
  const slot = ceilMinute(now + (leadMinutes + 5) * 60_000);
  if (manila(open).day === 'SUNDAY' || manila(close).minutes <= manila(open).minutes) {
    console.log('        skipped: needs a 2-hour window on a Manila weekday that does not cross midnight');
    return;
  }

  const original = await api('GET', `/vendors/${vendorId}/preorder-availability`, { token: vendorToken });
  check('vendor can read their preorder hours', original.status === 200, describe(original));
  const setHours = (body: unknown) =>
    api('PATCH', `/vendors/${vendorId}/preorder-availability`, { token: vendorToken, body });

  try {
    const hours = await setHours({ preorderEnabled: true, sameAsStoreHours: false, days: [
      { dayOfWeek: manila(open).day, isEnabled: true, openTime: manila(open).hhmm, closeTime: manila(close).hhmm },
    ] });
    check(`test pickup window ${manila(open).hhmm}-${manila(close).hhmm} (Manila) set`, hours.status === 200, describe(hours));

    const cart = await api('POST', '/carts/items', { token: buyerToken, body: { productId: product.id, quantity: 1 } });
    check('add item to cart for the preorder', cart.status < 300 && cart.body?.id, describe(cart));
    const reserve = (scheduledPickupAt: string) => api('POST', '/orders', {
      token: buyerToken, headers: { 'Idempotency-Key': `smoke-preorder-${randomUUID()}` },
      body: { cartId: cart.body.id, isPreorder: true, scheduledPickupAt },
    });

    const outside = await reserve(isoManila(new Date(close.getTime() + 30 * 60_000)));
    check('pickup time outside the vendor\'s window is rejected (400)',
      outside.status === 400 && /outside the vendor's pickup hours/.test(outside.body?.message), describe(outside));
    const tooSoon = await reserve(isoManila(new Date(open.getTime() + 60_000)));
    check('pickup time inside the lead time is rejected (400)',
      tooSoon.status === 400 && /at least \d+ minutes/.test(tooSoon.body?.message), describe(tooSoon));

    const preorder = await reserve(isoManila(slot));
    check('valid slot reserved -> PENDING with a payment deadline',
      preorder.status === 201 && preorder.body?.isPreorder && preorder.body?.reservationExpiresAt, describe(preorder));
    const preorderId: string = preorder.body.id;
    console.log(`        preorder ${preorder.body.orderReference}, pickup ${manila(slot).hhmm} Manila`);

    const hiddenUnpaid = await api('GET', '/orders/vendor/queue', { token: vendorToken });
    check('the unpaid reservation is not in the vendor\'s queue',
      !(hiddenUnpaid.body?.orders as any[])?.some((o) => o.id === preorderId), describe(hiddenUnpaid));

    const share = (await api('GET', `/payments/orders/${preorderId}/status`, { token: buyerToken })).body.paymentShare;
    const checkout = await api('POST', '/payments/checkout', {
      token: buyerToken, body: { paymentShareId: share.id }, headers: { 'Idempotency-Key': `smoke-precheckout-${randomUUID()}` },
    });
    check('preorder checkout created', checkout.status === 201, describe(checkout));
    const webhook = signedPaidWebhook(checkout.body.checkoutSessionId, checkout.body.paymentId, Math.round(Number(share.amountDue) * 100));
    const paid = await api('POST', '/payments/webhook', { raw: webhook.body, headers: { 'Paymongo-Signature': webhook.header } });
    check('preorder payment webhook processed', paid.status === 200 && paid.body?.processed === true, describe(paid));

    const confirmed = await buyer.waitFor('preorder.confirmed', (d) => d.orderId === preorderId);
    await vendorSocket.waitFor('preorder.confirmed', (d) => d.orderId === preorderId);
    check('paid preorder is held as SCHEDULED; student and vendor got preorder.confirmed',
      confirmed.status === 'SCHEDULED' && confirmed.eventId, JSON.stringify(confirmed));

    const scheduled = await api('GET', '/orders/vendor/scheduled', { token: vendorToken });
    check('vendor sees it under scheduled orders',
      (scheduled.body?.orders as any[])?.some((o) => o.id === preorderId), describe(scheduled));
    const early = await api('PATCH', `/orders/vendor/${preorderId}/status`, { token: vendorToken, body: { status: 'COOKING' } });
    check('vendor cannot start a scheduled preorder early (400)', early.status === 400, describe(early));

    console.log(`        waiting for the release job (window opens ${manila(open).hhmm})...`);
    const released = await buyer.waitFor('preorder.released', (d) => d.orderId === preorderId, RELEASE_TIMEOUT_MS);
    await vendorSocket.waitFor('order.created', (d) => d.orderId === preorderId);
    check('released into the live queue (PAID); vendor got order.created', released.status === 'PAID', JSON.stringify(released));
    await sleep(35_000); // let at least one more release tick run
    check('released exactly once (no duplicate release events)',
      buyer.find('preorder.released', (d) => d.orderId === preorderId).length === 1,
      `received ${buyer.find('preorder.released', (d) => d.orderId === preorderId).length}`);

    for (const status of ['COOKING', 'READY_FOR_PICKUP']) {
      const step = await api('PATCH', `/orders/vendor/${preorderId}/status`, { token: vendorToken, body: { status } });
      check(`vendor: preorder -> ${status}`, step.status === 200, describe(step));
    }
    const preorderBuzz = await buyer.waitFor('order.ready', (d) => d.orderId === preorderId);
    check('student got the buzzer (order.ready) for the preorder', preorderBuzz.eventId, JSON.stringify(preorderBuzz));
    const collected = await api('PATCH', `/orders/${preorderId}/pickup`, { token: buyerToken });
    check('student picks up the preorder -> COMPLETED', collected.body?.status === 'COMPLETED', describe(collected));
  } finally {
    const before = original.body;
    const days = (before?.preorderAvailability ?? []).map((w: any) =>
      ({ dayOfWeek: w.dayOfWeek, isEnabled: w.isEnabled, ...(w.isEnabled ? { openTime: w.openTime, closeTime: w.closeTime } : {}) }));
    const restored = await setHours({
      preorderEnabled: before?.preorderEnabled ?? false,
      sameAsStoreHours: before?.preorderSameAsStoreHours ?? true,
      // The API needs at least one entry when not using store hours.
      days: days.length ? days : [{ dayOfWeek: 'MONDAY', isEnabled: false }],
    });
    check('vendor\'s original preorder hours restored', restored.status === 200, describe(restored));
  }
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
