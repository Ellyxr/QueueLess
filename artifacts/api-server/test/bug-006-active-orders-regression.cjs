// BUG-006 / TC-117: after a reconnect, reload or new login the student's
// order-status widgets must come back. GET /orders/active lists the orders
// still in progress that the student placed or joined as a group member.
// Run after `pnpm build`:  node --test test/bug-006-active-orders-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { OrdersService, ACTIVE_ORDER_STATUSES } = require('../dist/orders/orders.service');
const { OrdersController } = require('../dist/orders/orders.controller');
const { RolesGuard } = require('../dist/auth/roles.guard');

const NOW = new Date('2026-10-17T06:00:00Z');
const minutesAgo = (n) => new Date(NOW.getTime() - n * 60_000);

// In-memory orders, filtered the way the query asks.
const ORDERS = [
  { id: 'aaaaaaaa-cooking', customerId: 'cardo', status: 'COOKING', createdAt: minutesAgo(30) },
  { id: 'bbbbbbbb-group', customerId: 'owner', status: 'PAID', createdAt: minutesAgo(20), members: ['cardo'] },
  { id: 'cccccccc-pending-new', customerId: 'cardo', status: 'PENDING', createdAt: minutesAgo(10) },
  { id: 'dddddddd-pending-old', customerId: 'cardo', status: 'PENDING', createdAt: minutesAgo(600) },
  { id: 'eeeeeeee-done', customerId: 'cardo', status: 'COMPLETED', createdAt: minutesAgo(5) },
  { id: 'ffffffff-cancelled', customerId: 'cardo', status: 'CANCELLED', createdAt: minutesAgo(5) },
  { id: 'gggggggg-uncollected', customerId: 'cardo', status: 'UNCOLLECTED', createdAt: minutesAgo(5) },
  { id: 'hhhhhhhh-scheduled', customerId: 'cardo', status: 'SCHEDULED', createdAt: minutesAgo(40), isPreorder: true },
  { id: 'iiiiiiii-someone-else', customerId: 'other', status: 'COOKING', createdAt: minutesAgo(1) },
  { id: 'jjjjjjjj-left-group', customerId: 'owner', status: 'PAID', createdAt: minutesAgo(1), members: [] },
];

function matchesOwner(order, clause, userId) {
  if (clause.customerId) return order.customerId === clause.customerId;
  return (order.members ?? []).includes(userId);
}
function matchesStatus(order, clause) {
  if (clause.status?.in) return clause.status.in.includes(order.status);
  return order.status === clause.status && order.createdAt >= clause.createdAt.gte;
}

function harness(userId = 'cardo') {
  let args;
  const prisma = { order: { findMany: async (a) => {
    args = a;
    const [owners, statuses] = a.where.AND;
    return ORDERS
      .filter((o) => owners.OR.some((c) => matchesOwner(o, c, userId)) && statuses.OR.some((c) => matchesStatus(o, c)))
      .sort((x, y) => y.createdAt - x.createdAt)
      .map((o) => ({ orderType: o.members ? 'GROUP' : 'INDIVIDUAL', isPreorder: false, scheduledPickupAt: null,
        updatedAt: o.createdAt, vendor: { id: 'v', name: 'Chiksilog' }, ...o }));
  } } };
  return { service: new OrdersService(prisma, {}, {}, {}, {}), args: () => args };
}

test('in-progress orders come back: placed by me and group orders I joined', async () => {
  const h = harness();
  const { orders } = await h.service.getActiveOrders('cardo', NOW);
  assert.deepEqual(orders.map((o) => [o.id, o.role]), [
    ['cccccccc-pending-new', 'CUSTOMER'],
    ['bbbbbbbb-group', 'GROUP_MEMBER'],
    ['aaaaaaaa-cooking', 'CUSTOMER'],
    ['hhhhhhhh-scheduled', 'CUSTOMER'],
  ]);
  assert.equal(orders[0].orderReference, 'CCCCCCCC');
});

test('finished, cancelled and uncollected orders do not come back', async () => {
  const ids = (await harness().service.getActiveOrders('cardo', NOW)).orders.map((o) => o.id);
  for (const gone of ['eeeeeeee-done', 'ffffffff-cancelled', 'gggggggg-uncollected']) assert.ok(!ids.includes(gone), gone);
  assert.deepEqual(ACTIVE_ORDER_STATUSES, ['SCHEDULED', 'PAID', 'COOKING', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP']);
});

test('old unpaid checkouts do not come back; recent ones do (2-hour window)', async () => {
  const h = harness();
  const ids = (await h.service.getActiveOrders('cardo', NOW)).orders.map((o) => o.id);
  assert.ok(ids.includes('cccccccc-pending-new'));
  assert.ok(!ids.includes('dddddddd-pending-old'));
  assert.deepEqual(h.args().where.AND[1].OR[1], { status: 'PENDING', createdAt: { gte: minutesAgo(120) } });
});

test('never another student\'s order, or a group I am no longer in', async () => {
  const h = harness();
  const ids = (await h.service.getActiveOrders('cardo', NOW)).orders.map((o) => o.id);
  assert.ok(!ids.includes('iiiiiiii-someone-else'));
  assert.ok(!ids.includes('jjjjjjjj-left-group'));
  assert.deepEqual(h.args().where.AND[0].OR, [
    { customerId: 'cardo' },
    { groupOrder: { participants: { some: { userId: 'cardo', status: 'JOINED' } } } },
  ]);
});

test('the route is students-only and registered before /orders/:id', () => {
  const proto = OrdersController.prototype;
  assert.equal(Reflect.getMetadata('path', proto.getActiveOrders), 'active');
  assert.deepEqual(Reflect.getMetadata('roles', proto.getActiveOrders), ['BUYER']);
  assert.ok(Reflect.getMetadata('__guards__', proto.getActiveOrders).includes(RolesGuard));
  const names = Object.getOwnPropertyNames(proto);
  assert.ok(names.indexOf('getActiveOrders') < names.indexOf('getOrder'), 'must come before :id');
});
