// BUG-009 / TC-174: once a paid pre-order is released into the vendor's live
// queue, the queue still says it is a pre-order and when it is picked up, so
// the vendor dashboard can show it. Run after `pnpm build`:
//   node --test test/bug-009-vendor-queue-preorder-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { OrdersService } = require('../dist/orders/orders.service');

const PICKUP = new Date('2026-10-18T01:00:00Z'); // tomorrow 9:00 AM Asia/Manila

const row = (overrides) => ({
  customerId: 'student',
  orderType: 'INDIVIDUAL',
  isPasabuyRequest: false,
  isPreorder: false,
  scheduledPickupAt: null,
  subtotal: { toFixed: () => '100.00' },
  marketplaceFee: { toFixed: () => '5.00' },
  totalAmount: { toFixed: () => '105.00' },
  eventId: null,
  createdAt: new Date('2026-10-17T02:00:00Z'),
  updatedAt: new Date('2026-10-17T02:00:00Z'),
  customer: { fullName: 'Nichole', email: 'nichole@example.com' },
  items: [],
  ...overrides,
});

function queue(rows) {
  const calls = [];
  const prisma = {
    vendor: { findUnique: async () => ({ id: 'vendor', name: 'V', status: 'ACTIVE' }) },
    order: { findMany: async (args) => { calls.push(args); return rows; } },
  };
  return { service: new OrdersService(prisma, {}, {}, {}, {}), calls };
}

test('the live queue selects the pre-order flag and pickup slot', async () => {
  const { service, calls } = queue([]);
  await service.getVendorOrderQueue('owner');
  assert.equal(calls[0].select.isPreorder, true);
  assert.equal(calls[0].select.scheduledPickupAt, true);
});

test('a released pre-order is flagged with its pickup time; an order-now order is not', async () => {
  const { service } = queue([
    row({ id: 'preorder-1', status: 'PAID', isPreorder: true, scheduledPickupAt: PICKUP }),
    row({ id: 'now-1', status: 'PAID' }),
  ]);
  const result = await service.getVendorOrderQueue('owner');
  const [preorder, now] = result.orders;

  assert.equal(preorder.isPreorder, true);
  assert.equal(preorder.scheduledPickupAt.toISOString(), PICKUP.toISOString());
  assert.equal(preorder.paymentStatus, 'PAID');
  assert.equal(JSON.parse(JSON.stringify(preorder)).scheduledPickupAt, '2026-10-18T01:00:00.000Z');

  assert.equal(now.isPreorder, false);
  assert.equal(now.scheduledPickupAt, null);
});
