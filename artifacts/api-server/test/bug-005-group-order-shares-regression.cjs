// BUG-005 / TC-091: each participant's share is tracked separately.
//  - Finalizing a group order creates a payable share per participant right
//    away (item-based), so members are never stuck with nothing to pay.
//  - Members who ordered nothing get no PHP 0 share (it could never be paid
//    and would keep the order PENDING forever).
//  - The owner's split choice (Equal / Custom) is applied when the order is
//    placed; Custom waits for the owner's amounts. It can change until anyone pays.
//  - Once placed, the group stops accepting items; a student's own cart is
//    unaffected. Run after `pnpm build`:
//   node --test test/bug-005-group-order-shares-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { GroupOrdersService } = require('../dist/group-orders/group-orders.service');
const { CartsService } = require('../dist/carts/carts.service');

const D = (value) => new Prisma.Decimal(value);
const status = (error) => error.getStatus?.();
const VENDOR = { id: 'v', name: 'Chiksilog', status: 'ACTIVE', ownerUserId: 'vendor-owner' };
const PARTICIPANTS = [
  { id: 'p-owner', userId: 'owner', status: 'JOINED' },
  { id: 'p-mia', userId: 'mia', status: 'JOINED' },
  { id: 'p-ben', userId: 'ben', status: 'JOINED' }, // ordered nothing
];
const product = (id, price) => ({ id, name: id, price: D(price), vendorId: 'v', isAvailable: true, preparationTimeMinutes: 10 });

function finalizeHarness() {
  const state = { shares: [], groupUpdate: null, audits: [] };
  const tx = {
    $queryRaw: async () => [],
    groupOrder: {
      findUnique: async () => ({ id: 'g', initiatorUserId: 'owner', status: 'LOCKED', vendorId: 'v',
        vendor: VENDOR, participants: PARTICIPANTS, order: null }),
      updateMany: async ({ data }) => { state.groupUpdate = data; return { count: 1 }; },
    },
    cart: {
      findMany: async () => [
        { userId: 'owner', vendorId: 'v', items: [{ productId: 'silog', quantity: 2, product: product('silog', '50') }] },
        { userId: 'mia', vendorId: 'v', items: [{ productId: 'tapa', quantity: 1, product: product('tapa', '50') }] },
      ],
      updateMany: async () => ({ count: 2 }),
    },
    order: {
      create: async ({ data }) => ({
        id: 'order-1', customerId: data.customerId, vendorId: data.vendorId, status: data.status,
        orderType: data.orderType, subtotal: data.subtotal, marketplaceFee: data.marketplaceFee,
        totalAmount: data.totalAmount, estimatedReadyAt: data.estimatedReadyAt, createdAt: new Date(), vendor: VENDOR,
        items: data.items.create.map((item, i) => ({ id: `item-${i}`, ...item, product: { name: item.productId },
          participant: { id: item.participantId, user: { id: item.participantId } } })),
      }),
    },
    paymentShare: {
      createMany: async ({ data }) => { state.shares.push(...data); },
      findMany: async () => state.shares.map((share, i) => ({ id: `share-${i}`, ...share, payer: { id: share.payerUserId } })),
    },
    auditRecord: { create: async ({ data }) => state.audits.push(data) },
  };
  const prisma = { $transaction: async (work) => work(tx) };
  // 10% marketplace fee, so shares are proportional to each member's items.
  const pricing = { calculateOrderTotals: (subtotal) => ({
    subtotal, marketplaceFee: subtotal.mul('0.1'), totalAmount: subtotal.mul('1.1'),
    marketplaceFeeRate: D(10), ruleVersion: 't' }) };
  const service = new GroupOrdersService(prisma, {}, pricing, { emitNewOrder: () => {} });
  return { service, state };
}

test('placing the group order gives every member who ordered a payable share right away', async () => {
  const h = finalizeHarness();
  const result = await h.service.finalizeGroupOrder('owner', 'g');

  assert.equal(h.state.groupUpdate.paymentSplitMode, 'ITEM_BASED');
  const byUser = Object.fromEntries(h.state.shares.map((s) => [s.payerUserId, s.amountDue.toFixed(2)]));
  // Owner ordered PHP 100, Mia PHP 50; +10% fee -> 110 + 55 = 165.
  assert.deepEqual(byUser, { owner: '110.00', mia: '55.00' });
  assert.equal(result.authoritativeOrder.totalAmount, '165.00');
  assert.deepEqual(result.authoritativeOrder.paymentShares.map((s) => [s.payer.id, s.amountDue, s.status]).sort(),
    [['mia', '55.00', 'PENDING'], ['owner', '110.00', 'PENDING']]);
  assert.equal(result.authoritativeOrder.paymentSplitMode, 'ITEM_BASED');
});

test('a member who ordered nothing gets no PHP 0 share (it could never be paid)', async () => {
  const h = finalizeHarness();
  await h.service.finalizeGroupOrder('owner', 'g');
  assert.ok(!h.state.shares.some((s) => s.payerUserId === 'ben'));
  assert.ok(h.state.shares.every((s) => s.amountDue.greaterThan(0)));
});

test('Equal split chosen at placing: every member pays an even part of the total, in the same step', async () => {
  const h = finalizeHarness();
  const result = await h.service.finalizeGroupOrder('owner', 'g', 'EQUAL');

  assert.equal(h.state.groupUpdate.paymentSplitMode, 'EQUAL');
  // PHP 165 across owner, Mia and Ben (who ordered nothing): 55 each.
  const byUser = Object.fromEntries(h.state.shares.map((s) => [s.payerUserId, s.amountDue.toFixed(2)]));
  assert.deepEqual(byUser, { owner: '55.00', mia: '55.00', ben: '55.00' });
  assert.equal(result.authoritativeOrder.paymentSplitMode, 'EQUAL');
  assert.equal(result.authoritativeOrder.paymentShares.length, 3);
  assert.equal(h.state.audits[0].afterState.paymentSplitMode, 'EQUAL');
});

test('Equal split never loses a centavo: shares add up to the order total exactly', async () => {
  const h = finalizeHarness();
  // 2 x 50 + 1 x 50 = 150, +10% = 165.00 split 3 ways is exact; force an uneven total.
  h.service.pricingService = { calculateOrderTotals: (subtotal) => ({
    subtotal, marketplaceFee: D('0.01'), totalAmount: subtotal.add('0.01'), marketplaceFeeRate: D(0), ruleVersion: 't' }) };
  const result = await h.service.finalizeGroupOrder('owner', 'g', 'EQUAL');
  const sum = h.state.shares.reduce((total, s) => total.add(s.amountDue), D(0));
  assert.equal(sum.toFixed(2), result.authoritativeOrder.totalAmount);
});

test('Custom split chosen at placing: no shares until the owner enters the amounts', async () => {
  const h = finalizeHarness();
  const result = await h.service.finalizeGroupOrder('owner', 'g', 'CUSTOM');

  assert.equal(h.state.groupUpdate.paymentSplitMode, 'CUSTOM');
  assert.deepEqual(h.state.shares, []);
  assert.deepEqual(result.authoritativeOrder.paymentShares, []);
  assert.equal(result.authoritativeOrder.paymentSplitMode, 'CUSTOM');

  // The group order tells the owner's app to show the amount screen (also after a reload).
  const waiting = response('FINALIZED', [], 'CUSTOM');
  assert.equal(waiting.paymentSplit.awaitingCustomAmounts, true);
  assert.equal(waiting.paymentSplit.sharesReady, false);
  const set = response('FINALIZED', [{ id: 's1', status: 'PENDING', paymentId: null }], 'CUSTOM');
  assert.equal(set.paymentSplit.awaitingCustomAmounts, false);
});

test('finalize takes the split from the request body; an unknown mode is rejected', async () => {
  const { FinalizeGroupOrderDto } = require('../dist/group-orders/dto/finalize-group-order.dto');
  const { GroupOrdersController } = require('../dist/group-orders/group-orders.controller');
  const { plainToInstance } = require('class-transformer');
  const { validate } = require('class-validator');

  const calls = [];
  const controller = new GroupOrdersController({ finalizeGroupOrder: async (...args) => calls.push(args) });
  await controller.finalizeGroupOrder({ sub: 'owner' }, 'g', { mode: 'EQUAL' });
  await controller.finalizeGroupOrder({ sub: 'owner' }, 'g', {});
  assert.deepEqual(calls, [['owner', 'g', 'EQUAL'], ['owner', 'g', undefined]]);

  assert.equal((await validate(plainToInstance(FinalizeGroupOrderDto, { mode: 'EQUAL' }))).length, 0);
  assert.equal((await validate(plainToInstance(FinalizeGroupOrderDto, {}))).length, 0);
  assert.equal((await validate(plainToInstance(FinalizeGroupOrderDto, { mode: 'HALF' }))).length, 1);
});

// ------------------------------------------------------------ custom split

function splitHarness({ paidShare = false } = {}) {
  const state = {
    shares: [
      { id: 's1', payerUserId: 'owner', amountDue: D('110'), status: paidShare ? 'PAID' : 'PENDING', paymentId: paidShare ? 'pay' : null },
      { id: 's2', payerUserId: 'mia', amountDue: D('55'), status: 'PENDING', paymentId: null },
    ],
    mode: 'ITEM_BASED',
  };
  const tx = {
    groupOrder: {
      findUnique: async () => ({ id: 'g', initiatorUserId: 'owner', status: 'FINALIZED', participants: PARTICIPANTS,
        order: { id: 'order-1', totalAmount: D('165'), items: [], paymentShares: state.shares } }),
      update: async ({ data }) => { state.mode = data.paymentSplitMode; },
    },
    paymentShare: {
      deleteMany: async () => { state.shares = []; },
      createMany: async ({ data }) => { state.shares = data.map((s, i) => ({ id: `c${i}`, ...s, paymentId: null })); },
      findMany: async () => state.shares.map((s) => ({ ...s, payer: { id: s.payerUserId } })),
    },
    auditRecord: { create: async () => {} },
  };
  const service = new GroupOrdersService({ $transaction: async (work) => work(tx) }, {}, {}, {});
  return { service, state: () => state };
}

const CUSTOM = { mode: 'CUSTOM', customShares: [
  { participantId: 'p-owner', amount: 65 }, { participantId: 'p-mia', amount: 50 }, { participantId: 'p-ben', amount: 50 },
] };

test('the owner can still switch to a Custom split before anyone pays; it replaces the default shares', async () => {
  const h = splitHarness();
  await h.service.setPaymentSplit('owner', 'g', CUSTOM);
  assert.equal(h.state().mode, 'CUSTOM');
  assert.deepEqual(h.state().shares.map((s) => [s.payerUserId, s.amountDue.toFixed(2)]),
    [['owner', '65.00'], ['mia', '50.00'], ['ben', '50.00']]);
});

test('once someone has paid, the split can no longer change (409)', async () => {
  const h = splitHarness({ paidShare: true });
  await assert.rejects(h.service.setPaymentSplit('owner', 'g', CUSTOM), (e) => status(e) === 409);
  assert.equal(h.state().mode, 'ITEM_BASED');
});

test('Custom amounts must add up to the order total', async () => {
  const h = splitHarness();
  const short = { mode: 'CUSTOM', customShares: CUSTOM.customShares.map((s) => ({ ...s, amount: 10 })) };
  await assert.rejects(h.service.setPaymentSplit('owner', 'g', short), (e) => status(e) === 400);
});

// ---------------------------------------- response flags and adding items

const response = (groupStatus, shares, mode = 'ITEM_BASED') => new GroupOrdersService({}, {}, {}, {})['buildGroupOrderResponse']({
  id: 'g', code: 'MSBD8X', status: groupStatus, initiatorUserId: 'owner', initiator: { id: 'owner' },
  vendor: VENDOR, paymentSplitMode: shares ? mode : null, carts: [],
  participants: PARTICIPANTS.map((p) => ({ ...p, user: { id: p.userId }, joinedAt: new Date() })),
  order: shares ? { id: 'order-1', status: 'PENDING', orderType: 'GROUP', totalAmount: D('165'),
    paymentShares: shares.map((s) => ({ amountDue: D('1'), payer: {}, ...s })) } : null,
  createdAt: new Date(), updatedAt: new Date(),
});

test('the group order tells the app whether it still accepts items and whether shares are ready', () => {
  assert.equal(response('OPEN', null).acceptingItems, true);
  assert.equal(response('OPEN', null).paymentSplit, null);
  const placed = response('FINALIZED', [{ id: 's1', status: 'PENDING', paymentId: null }]);
  assert.equal(placed.acceptingItems, false);
  assert.deepEqual(placed.paymentSplit, { mode: 'ITEM_BASED', sharesReady: true, awaitingCustomAmounts: false, canChange: true });
  const paying = response('FINALIZED', [{ id: 's1', status: 'PENDING', paymentId: 'pay' }]);
  assert.equal(paying.paymentSplit.canChange, false);
  assert.equal(response('CANCELLED', null).acceptingItems, false);
});

test('adding to a placed or cancelled group says so and points to ordering alone', async () => {
  for (const [groupStatus, word] of [['FINALIZED', 'placed'], ['CANCELLED', 'cancelled']]) {
    const tx = { $queryRaw: async () => [], groupOrder: { findUnique: async () => ({ id: 'g', status: groupStatus, participants: [] }) } };
    const service = new GroupOrdersService({ $transaction: async (work) => work(tx) }, {}, {}, {});
    await assert.rejects(service.addGroupOrderItem('mia', 'g', { productId: 'tapa', quantity: 1 }),
      (e) => status(e) === 400 && e.message.includes(`already ${word}`) && /order on your own/.test(e.message));
  }
});

test('a student\'s own cart is never tied to a group order (no "not open" error when ordering alone)', async () => {
  let cartWhere;
  const prisma = {
    product: { findUnique: async () => ({ ...product('tapa', '50'), vendor: VENDOR }) },
    cart: { findFirst: async ({ where }) => { cartWhere = where; throw new Error('stop'); } },
  };
  await assert.rejects(new CartsService(prisma).addItem('mia', { productId: 'tapa', quantity: 1 }), /stop/);
  assert.equal(cartWhere.groupOrderId, null);
  assert.equal(cartWhere.status, 'ACTIVE');
});
