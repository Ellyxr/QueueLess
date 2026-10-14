// US-062: a ready preorder not collected by the end of its pickup window plus
// a grace period is flagged UNCOLLECTED (terminal), with status history, an
// audit entry and notifications. Run after `pnpm build`:
//   node --test test/preorder-uncollected-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const {
  pickupWindowEndsAt, preorderPickupGraceMinutes, uncollectedAfter,
} = require('../dist/orders/preorder-slot.policy');
const { PreorderReservationsService } = require('../dist/orders/preorder-reservations.service');
const { OrdersService } = require('../dist/orders/orders.service');
const { RealtimeGateway } = require('../dist/realtime/realtime.gateway');

const status = (error) => error.getStatus?.();
const manila = (local) => new Date(`${local}+08:00`);
const TUE = (time) => manila(`2026-10-13T${time}:00`);
const win = (dayOfWeek, openTime, closeTime) => ({ dayOfWeek, isEnabled: true, openTime, closeTime });
const WINDOWS = [win('TUESDAY', '07:00', '10:00'), win('TUESDAY', '13:00', '16:00')];

// ------------------------------------------------------------- deadline

test('the grace period runs from the close of the pickup window the order was booked into', () => {
  assert.deepEqual(pickupWindowEndsAt(TUE('08:00'), WINDOWS), TUE('10:00'));
  assert.deepEqual(pickupWindowEndsAt(TUE('15:59'), WINDOWS), TUE('16:00'));
  assert.deepEqual(pickupWindowEndsAt(TUE('11:00'), WINDOWS), TUE('11:00'), 'no window: the slot itself');
  // Manila, not UTC: 23:30 UTC Monday is 07:30 Tuesday in Manila.
  assert.equal(pickupWindowEndsAt(new Date('2026-10-12T23:30:00Z'), WINDOWS).toISOString(), '2026-10-13T02:00:00.000Z');
});

test('grace defaults to 30 minutes and is configurable', () => {
  assert.equal(preorderPickupGraceMinutes({}), 30);
  assert.equal(preorderPickupGraceMinutes({ PREORDER_PICKUP_GRACE_MINUTES: '45' }), 45);
  assert.equal(preorderPickupGraceMinutes({ PREORDER_PICKUP_GRACE_MINUTES: '-5' }), 30);
  assert.deepEqual(uncollectedAfter({ pickupWindowEndsAt: TUE('10:00'), scheduledPickupAt: TUE('08:00') }, 30), TUE('10:30'));
  assert.deepEqual(uncollectedAfter({ pickupWindowEndsAt: null, scheduledPickupAt: TUE('08:00') }, 30), TUE('08:30'),
    'older preorders: grace from the pickup time');
});

// --------------------------------------------------------------- job

function jobHarness(orders, { now = TUE('10:30'), failFor = [] } = {}) {
  const state = { orders: structuredClone(orders), history: [], audits: [], events: [] };
  let query;
  const tx = {
    order: {
      updateMany: async ({ where, data }) => {
        if (failFor.includes(where.id)) throw new Error('database hiccup');
        const order = state.orders.find((o) => o.id === where.id);
        if (!order || order.status !== where.status || order.pickupConfirmedAt !== where.pickupConfirmedAt) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }) => ({ ...state.orders.find((o) => o.id === where.id), customerId: 'student', updatedAt: now }),
    },
    orderStatusHistory: { create: async ({ data }) => { state.history.push(data); return { id: `history-${data.orderId}` }; } },
    auditRecord: { create: async ({ data }) => state.audits.push(data) },
  };
  const prisma = {
    order: { findMany: async (args) => {
      query = args;
      const cutoff = args.where.OR[0].pickupWindowEndsAt.lte;
      return state.orders.filter((o) => o.status === 'READY_FOR_PICKUP' && o.pickupConfirmedAt === null &&
        ((o.pickupWindowEndsAt && o.pickupWindowEndsAt <= cutoff) ||
          (!o.pickupWindowEndsAt && o.scheduledPickupAt <= cutoff)));
    } },
    $transaction: async (work) => work(tx),
  };
  const realtime = {
    emitOrderStatusUpdated: async (user, payload) => state.events.push(['order.status.updated', user, payload.status]),
    emitPreorderEvent: async (event, orderId, eventId) => state.events.push([event, orderId, eventId]),
  };
  const service = new PreorderReservationsService(prisma, {}, realtime);
  service.logger.warn = () => {};
  service.clock = () => now;
  return { service, state, query: () => query };
}

const ready = (id, extra = {}) => ({
  id, status: 'READY_FOR_PICKUP', isPreorder: true, pickupConfirmedAt: null,
  scheduledPickupAt: TUE('08:00'), pickupWindowEndsAt: TUE('10:00'), ...extra,
});

test('a ready preorder past window + grace is flagged UNCOLLECTED with history, audit and notifications', async () => {
  const h = jobHarness([ready('late'), ready('still-in-grace', { pickupWindowEndsAt: TUE('10:01') })]);
  assert.deepEqual(await h.service.flagUncollectedPreorders(), ['late']);

  assert.deepEqual(h.query().where, {
    isPreorder: true, status: 'READY_FOR_PICKUP', pickupConfirmedAt: null,
    OR: [
      { pickupWindowEndsAt: { lte: TUE('10:00') } },
      { pickupWindowEndsAt: null, scheduledPickupAt: { lte: TUE('10:00') } },
    ],
  });
  assert.deepEqual(h.state.orders.map((o) => [o.id, o.status]), [['late', 'UNCOLLECTED'], ['still-in-grace', 'READY_FOR_PICKUP']]);
  assert.deepEqual(h.state.history, [{ orderId: 'late', status: 'UNCOLLECTED', changedByUserId: null,
    note: 'Not collected within the grace period after the pickup window' }]);
  assert.deepEqual(h.state.audits, [{
    actorUserId: null, actionType: 'ORDER_STATUS_UPDATED', entityType: 'Order', entityId: 'late',
    beforeState: { status: 'READY_FOR_PICKUP' },
    afterState: { status: 'UNCOLLECTED', source: 'PICKUP_GRACE_EXPIRED', scheduledPickupAt: TUE('08:00').toISOString(),
      pickupWindowEndsAt: TUE('10:00').toISOString(), graceEndedAt: TUE('10:30').toISOString() },
  }]);
  assert.deepEqual(h.state.events, [
    ['order.status.updated', 'student', 'UNCOLLECTED'],
    ['preorder.uncollected', 'late', 'history-late'],
  ]);
});

test('older preorders without a stored window end use the pickup time', async () => {
  const h = jobHarness([ready('legacy', { pickupWindowEndsAt: null, scheduledPickupAt: TUE('09:00') })]);
  assert.deepEqual(await h.service.flagUncollectedPreorders(), ['legacy']);
});

test('collected in the meantime (or no longer ready) -> not flagged', async () => {
  const h = jobHarness([ready('collected')]);
  const findMany = h.service.prisma.order.findMany;
  h.service.prisma.order.findMany = async (args) => {
    const rows = await findMany(args);
    Object.assign(h.state.orders[0], { status: 'COMPLETED', pickupConfirmedAt: TUE('10:29') });
    return rows;
  };
  assert.deepEqual(await h.service.flagUncollectedPreorders(), []);
  assert.deepEqual([h.state.history.length, h.state.audits.length, h.state.events.length], [0, 0, 0]);
});

test('one failing order does not stop the others', async () => {
  const h = jobHarness([ready('broken'), ready('fine')], { failFor: ['broken'] });
  assert.deepEqual(await h.service.flagUncollectedPreorders(), ['fine']);
});

// ------------------------------------------------------- terminal status

test('an UNCOLLECTED order cannot be picked up any more', async () => {
  const tx = {
    order: { findFirst: async () => ({ id: 'o', status: 'UNCOLLECTED', customerId: 'student', pickupConfirmedAt: null,
      isPasabuyRequest: false, groupOrder: null }) },
  };
  const service = new OrdersService({ $transaction: async (work) => work(tx) }, {}, {}, {}, {});
  await assert.rejects(service.confirmPickup('student', 'o'), (e) => status(e) === 400 && /not ready for pickup/.test(e.message));
});

test('preorder.uncollected is published to the student and the vendor', async () => {
  const gateway = new RealtimeGateway({ order: { findUnique: async () => ({
    id: 'o', status: 'UNCOLLECTED', isPreorder: true, customerId: 'student', scheduledPickupAt: TUE('08:00'),
    queueReleaseAt: TUE('07:00'), totalAmount: new Prisma.Decimal('120'),
    vendor: { id: 'v', name: 'V', pickupLocation: null, ownerUserId: 'owner' },
  }) } });
  const sent = [];
  gateway.server = { to: (room) => ({ emit: (event, payload) => sent.push([room, event, payload.status]) }) };
  await gateway.emitPreorderEvent('preorder.uncollected', 'o', 'h');
  assert.deepEqual(sent, [['user:student', 'preorder.uncollected', 'UNCOLLECTED'], ['user:owner', 'preorder.uncollected', 'UNCOLLECTED']]);
});

test('vendor lists their uncollected preorders', async () => {
  let args;
  const prisma = {
    vendor: { findUnique: async () => ({ id: 'vendor' }) },
    order: { findMany: async (a) => { args = a; return [{
      id: 'a1b2c3d4-0000', status: 'UNCOLLECTED', scheduledPickupAt: TUE('08:00'), pickupWindowEndsAt: TUE('10:00'),
      totalAmount: new Prisma.Decimal('120'), updatedAt: TUE('10:30'), customer: { fullName: 'Cardo' },
      items: [{ quantity: 2, product: { name: 'Silog' } }],
    }]; } },
  };
  const result = await new OrdersService(prisma, {}, {}, {}, {}).getVendorUncollectedOrders('owner');
  assert.deepEqual(args.where, { vendorId: 'vendor', status: 'UNCOLLECTED' });
  assert.deepEqual(result.orders[0], {
    id: 'a1b2c3d4-0000', orderReference: 'A1B2C3D4', status: 'UNCOLLECTED', scheduledPickupAt: TUE('08:00'),
    pickupWindowEndsAt: TUE('10:00'), flaggedAt: TUE('10:30'), customerName: 'Cardo', total: '120.00',
    items: [{ name: 'Silog', quantity: 2 }],
  });
});
