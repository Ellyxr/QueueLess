// BUG-007 / TC-121: the Pasabuy modal shows the fee AND the expiry, and the
// values shown before posting match what is saved. Run after `pnpm build`:
//   node --test test/bug-007-pasabuy-fee-expiry-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { PasabuyCreationService, REQUEST_WINDOW_MINUTES } = require('../dist/pasabuy/pasabuy-creation.service');

const D = (value) => new Prisma.Decimal(value);
const NOW = new Date('2026-10-17T03:00:00Z');
const BOUNDS = '-0.01,-0.01,0.01,0.01';
const order = {
  id: 'order', customerId: 'buyer', status: 'PAID', orderType: 'INDIVIDUAL', totalAmount: D('120'),
  items: [{ quantity: 1, product: { name: 'Silog' } }],
  vendor: { pickupLocation: 'Canteen B', pickupLatitude: 0, pickupLongitude: 0 },
};
const fee = { calculatePasabuyFee: () => ({ amount: D(30), feeTier: 'IN_CAMPUS', ruleVersion: 't' }) };
const DTO = { orderId: 'order', dropoffLatitude: 0.001, dropoffLongitude: 0 };

function service(now = NOW) {
  const tx = {
    order: { findFirst: async () => order, update: async () => {} },
    pasabuyRequest: {
      findMany: async () => [], findFirst: async () => null,
      create: async ({ data }) => ({ id: 'request', ...data }),
    },
    auditRecord: { create: async () => {} },
  };
  const prisma = { order: { findFirst: async () => order }, $transaction: (work) => work(tx) };
  const s = new PasabuyCreationService(prisma, { emitPasabuyStatusUpdated: async () => {} }, fee);
  s.clock = () => now;
  return s;
}

test('the preview (what the modal shows) includes the expiry, not just the fee', async () => {
  process.env.PASABUY_CAMPUS_BOUNDS = BOUNDS;
  const preview = await service().preview('buyer', DTO);
  assert.equal(preview.convenienceFee, '30.00');
  assert.equal(preview.requestWindowMinutes, 15);
  assert.deepEqual(preview.estimatedExpiresAt, new Date(NOW.getTime() + 15 * 60_000));
  assert.deepEqual(preview.serverTime, NOW);
});

test('the saved request has the same fee format and the expiry the modal promised', async () => {
  process.env.PASABUY_CAMPUS_BOUNDS = BOUNDS;
  const s = service();
  const preview = await s.preview('buyer', DTO);
  const saved = await s.create('buyer', { ...DTO, termsAccepted: true });
  assert.equal(saved.convenienceFee, preview.convenienceFee, 'fee shown == fee saved');
  assert.deepEqual(saved.expiresAt, preview.estimatedExpiresAt, 'posted at the same moment: expiry shown == expiry saved');
  assert.equal(saved.requestWindowMinutes, preview.requestWindowMinutes);
  assert.equal(saved.totalAmount, '150.00');
  assert.equal(saved.currency, 'PHP');
});

test('posting later moves the saved expiry with it (always 15 minutes after posting)', async () => {
  process.env.PASABUY_CAMPUS_BOUNDS = BOUNDS;
  const postedAt = new Date(NOW.getTime() + 4 * 60_000);
  const saved = await service(postedAt).create('buyer', { ...DTO, termsAccepted: true });
  assert.deepEqual(saved.expiresAt, new Date(postedAt.getTime() + REQUEST_WINDOW_MINUTES * 60_000));
});
