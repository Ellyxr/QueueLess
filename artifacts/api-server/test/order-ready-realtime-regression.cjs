// US-067: the READY_FOR_PICKUP buzzer event (order.ready) is published over
// Socket.IO to the right student only, and only after the status change has
// committed. Runs against the compiled service (pnpm build first):
//   node --test test/order-ready-realtime-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { OrdersService } = require('../dist/orders/orders.service');
const { RealtimeGateway } = require('../dist/realtime/realtime.gateway');

const ORDER_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const VENDOR = { id: 'vendor', name: 'Kuya Grill', pickupLocation: 'Canteen B', status: 'ACTIVE' };

function socketServer() {
  const sent = [];
  return { sent, to: (room) => ({ emit: (event, payload) => sent.push({ room, event, payload }) }) };
}

// ---------------------------------------------------------------- gateway

function gatewayFor(order, { fail = false } = {}) {
  const prisma = {
    order: {
      findUnique: async () => {
        if (fail) throw new Error('database unavailable');
        return order;
      },
    },
  };
  const gateway = new RealtimeGateway(prisma);
  gateway.server = socketServer();
  return gateway;
}

const readyOrder = (extra = {}) => ({
  id: ORDER_ID, status: 'READY_FOR_PICKUP', customerId: 'student', isPasabuyRequest: false,
  vendor: { id: VENDOR.id, name: VENDOR.name, pickupLocation: VENDOR.pickupLocation },
  groupOrder: null, pasabuyRequests: [], ...extra,
});
const event = { eventId: 'history-1', readyAt: new Date('2026-10-15T08:00:00Z') };

test('order.ready goes only to the ordering student, with the buzzer payload', async () => {
  const gateway = gatewayFor(readyOrder());
  await gateway.emitOrderReady(ORDER_ID, event);
  assert.deepEqual(gateway.server.sent, [{
    room: 'user:student',
    event: 'order.ready',
    payload: {
      eventId: 'history-1', orderId: ORDER_ID, orderReference: 'A1B2C3D4',
      status: 'READY_FOR_PICKUP', readyAt: event.readyAt,
      vendor: { id: 'vendor', name: 'Kuya Grill', pickupLocation: 'Canteen B' },
    },
  }]);
});

test('group order: customer and JOINED participants each get it once', async () => {
  const gateway = gatewayFor(readyOrder({
    groupOrder: { participants: [{ userId: 'student' }, { userId: 'friend' }] },
  }));
  await gateway.emitOrderReady(ORDER_ID, event);
  assert.deepEqual(gateway.server.sent.map((s) => s.room).sort(), ['user:friend', 'user:student']);
});

test('Pasabuy order: only the assigned fulfiller is buzzed, not the requester', async () => {
  const gateway = gatewayFor(readyOrder({
    customerId: 'requester', isPasabuyRequest: true,
    pasabuyRequests: [{ fulfillerUserId: 'fulfiller' }],
  }));
  await gateway.emitOrderReady(ORDER_ID, event);
  assert.deepEqual(gateway.server.sent.map((s) => s.room), ['user:fulfiller']);
});

test('nothing is published if the order is no longer ready (completed, cancelled, missing)', async () => {
  for (const order of [readyOrder({ status: 'COMPLETED' }), readyOrder({ status: 'CANCELLED' }), null]) {
    const gateway = gatewayFor(order);
    await gateway.emitOrderReady(ORDER_ID, event);
    assert.deepEqual(gateway.server.sent, []);
  }
});

test('a publish failure is logged, not thrown', async () => {
  const gateway = gatewayFor(null, { fail: true });
  await gateway.emitOrderReady(ORDER_ID, event);
  await gateway.emitOrderStatusUpdated('student', { orderId: ORDER_ID, status: 'READY_FOR_PICKUP', updatedAt: new Date() });
  assert.deepEqual(gateway.server.sent, []);
});

// ---------------------------------------------------------------- service

function serviceHarness(status = 'COOKING', { failAudit = false } = {}) {
  let state = { status, history: [], committed: false };
  const log = [];
  const order = () => ({
    id: ORDER_ID, customerId: 'student', vendorId: 'vendor', status: state.status,
    isPasabuyRequest: false, isPreorder: false, eventId: null, orderType: 'PICKUP',
    cancellationReason: null, cancellationNote: null, estimatedReadyAt: null,
    pickupConfirmedAt: null, subtotal: new Prisma.Decimal('100.00'), updatedAt: new Date(),
    vendor: VENDOR, items: [{ productId: 'p1' }],
  });
  const tx = {
    order: {
      findUnique: async () => order(),
      // Another request may change the row between the read and the write.
      updateMany: async ({ where, data }) => {
        if (state.racedTo) state.status = state.racedTo;
        if (state.status !== where.status) return { count: 0 };
        state.status = data.status;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => order(),
    },
    orderStatusHistory: {
      create: async ({ data }) => {
        const row = { id: `history-${state.history.length + 1}`, changedAt: new Date(), ...data };
        state.history.push(row);
        return { id: row.id, changedAt: row.changedAt };
      },
    },
    auditRecord: { create: async () => { if (failAudit) throw new Error('audit failed'); } },
    product: { updateMany: async () => ({ count: 1 }) },
  };
  const prisma = {
    vendor: { findUnique: async () => ({ id: 'vendor' }) },
    $transaction: async (work) => {
      const before = structuredClone(state);
      try {
        const result = await work(tx);
        state.committed = true;
        log.push('commit');
        return result;
      } catch (error) {
        state = before;
        log.push('rollback');
        throw error;
      }
    },
  };
  const realtime = {
    emitOrderStatusUpdated: async (userId, payload) => log.push(`status:${payload.status}`),
    emitOrderReady: async (orderId, ev) => {
      // Must observe the committed READY state.
      assert.equal(state.committed, true);
      assert.equal(state.status, 'READY_FOR_PICKUP');
      log.push(`ready:${ev.eventId}`);
    },
  };
  const refunds = { autoRefundOrderPayments: async () => log.push('refund') };
  const service = new OrdersService(prisma, refunds, {}, {}, realtime);
  return { service, log, state: () => state, race: (to) => { state.racedTo = to; } };
}

test('vendor marks ready: order.ready published once, after commit, with the history id', async () => {
  const h = serviceHarness('COOKING');
  const response = await h.service.updateVendorOrderStatus('owner', ORDER_ID, { status: 'READY_FOR_PICKUP' });
  assert.equal(response.status, 'READY_FOR_PICKUP');
  assert.deepEqual(h.log, ['commit', 'status:READY_FOR_PICKUP', 'ready:history-1']);
});

test('other transitions do not buzz', async () => {
  const h = serviceHarness('PAID');
  await h.service.updateVendorOrderStatus('owner', ORDER_ID, { status: 'COOKING' });
  assert.deepEqual(h.log, ['commit', 'status:COOKING']);
});

test('repeating READY on an already-ready order does not buzz again', async () => {
  const h = serviceHarness('READY_FOR_PICKUP');
  await h.service.updateVendorOrderStatus('owner', ORDER_ID, { status: 'READY_FOR_PICKUP' });
  assert.deepEqual(h.log, ['commit']);
});

test('a concurrent cancel wins: READY is rejected (409) and nothing is published', async () => {
  const h = serviceHarness('COOKING');
  h.race('CANCELLED');
  await assert.rejects(
    h.service.updateVendorOrderStatus('owner', ORDER_ID, { status: 'READY_FOR_PICKUP' }),
    (error) => error.getStatus() === 409,
  );
  assert.deepEqual(h.log, ['rollback']);
  assert.equal(h.state().history.length, 0);
});

test('a rolled-back READY transaction publishes nothing', async () => {
  const h = serviceHarness('COOKING', { failAudit: true });
  await assert.rejects(h.service.updateVendorOrderStatus('owner', ORDER_ID, { status: 'READY_FOR_PICKUP' }));
  assert.deepEqual(h.log, ['rollback']);
  assert.equal(h.state().status, 'COOKING');
});
