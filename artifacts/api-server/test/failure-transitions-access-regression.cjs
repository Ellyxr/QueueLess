// US-054: invalid order transitions and unauthorized access are rejected with
// no state change, no history/audit row and no realtime event. Run after
// `pnpm build`:  node --test test/failure-transitions-access-regression.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { OrdersService } = require('../dist/orders/orders.service');
const { JwtAuthGuard } = require('../dist/auth/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/roles.guard');

const STATUSES = ['PENDING', 'SCHEDULED', 'PAID', 'COOKING', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED', 'UNCOLLECTED'];
// The vendor-facing state machine. PAID is never settable by a vendor (only
// the payment webhook or the US-059 release job sets it).
const ALLOWED = {
  PENDING: ['CANCELLED'],
  SCHEDULED: ['CANCELLED'],
  PAID: ['COOKING', 'CANCELLED'],
  COOKING: ['READY_FOR_PICKUP', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['COMPLETED'],
  READY_FOR_PICKUP: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  UNCOLLECTED: [], // US-062: terminal
};
const status = (error) => error.getStatus?.();

function vendorHarness(orderStatus, { orderVendor = 'vendor' } = {}) {
  const state = { status: orderStatus, history: 0, audits: 0, events: [], refunds: 0 };
  const order = () => ({
    id: 'order-1', customerId: 'student', vendorId: orderVendor, status: state.status, isPasabuyRequest: false,
    isPreorder: false, eventId: null, orderType: 'INDIVIDUAL', cancellationReason: null, cancellationNote: null,
    estimatedReadyAt: null, pickupConfirmedAt: null, subtotal: new Prisma.Decimal('100'), updatedAt: new Date(),
    vendor: { id: orderVendor, name: 'Vendor', status: 'ACTIVE' }, items: [{ productId: 'p1' }],
  });
  const tx = {
    order: {
      findUnique: async () => order(),
      updateMany: async ({ where, data }) => {
        if (state.status !== where.status) return { count: 0 };
        state.status = data.status;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => order(),
    },
    product: { updateMany: async () => ({ count: 1 }) },
    orderStatusHistory: { create: async () => { state.history += 1; return { id: 'h', changedAt: new Date() }; } },
    auditRecord: { create: async () => { state.audits += 1; } },
  };
  const prisma = {
    vendor: { findUnique: async ({ where }) => (where.ownerUserId === 'owner' ? { id: 'vendor' } : null) },
    $transaction: async (work) => {
      const before = { ...state, events: [...state.events] };
      try {
        return await work(tx);
      } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    },
  };
  const realtime = {
    emitOrderStatusUpdated: async (u, p) => state.events.push(p.status),
    emitOrderReady: async () => state.events.push('order.ready'),
  };
  const refunds = { autoRefundOrderPayments: async () => { state.refunds += 1; } };
  return { service: new OrdersService(prisma, refunds, {}, {}, realtime), state };
}

test('order state machine: every (from, to) pair is allowed or rejected exactly as specified', async () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const h = vendorHarness(from);
      const dto = { status: to, ...(to === 'CANCELLED' ? { cancellationReason: 'CUSTOMER_REQUEST' } : {}) };
      const run = h.service.updateVendorOrderStatus('owner', 'order-1', dto);
      if (from === to) {
        await run; // idempotent no-op
        assert.deepEqual([h.state.status, h.state.history, h.state.events.length], [from, 0, 0], `${from}->${to}`);
      } else if (ALLOWED[from].includes(to)) {
        await run;
        assert.equal(h.state.status, to, `${from}->${to}`);
        assert.equal(h.state.history, 1);
      } else {
        await assert.rejects(run, (e) => status(e) === 400, `${from}->${to} should be 400`);
        assert.deepEqual(
          [h.state.status, h.state.history, h.state.audits, h.state.events.length, h.state.refunds],
          [from, 0, 0, 0, 0], `${from}->${to} left state behind`,
        );
      }
    }
  }
});

test('vendor cannot update another vendor\'s order (403) or act without a vendor profile (404)', async () => {
  const foreign = vendorHarness('PAID', { orderVendor: 'other-vendor' });
  await assert.rejects(foreign.service.updateVendorOrderStatus('owner', 'order-1', { status: 'COOKING' }), (e) => status(e) === 403);
  assert.deepEqual([foreign.state.status, foreign.state.history, foreign.state.events.length], ['PAID', 0, 0]);

  const noVendor = vendorHarness('PAID');
  await assert.rejects(noVendor.service.updateVendorOrderStatus('student', 'order-1', { status: 'COOKING' }), (e) => status(e) === 404);
  assert.equal(noVendor.state.status, 'PAID');
});

function pickupHarness({ orderStatus = 'READY_FOR_PICKUP', pickupConfirmedAt = null, isPasabuyRequest = false,
  visible = true, groupOwnerOnly = false, raceLost = false } = {}) {
  const state = { status: orderStatus, history: 0, events: 0 };
  const tx = {
    order: {
      findFirst: async ({ where }) => {
        // The query must scope the order to the caller (customer or joined member).
        assert.ok(where.OR.some((c) => c.customerId), 'pickup must filter by caller');
        return visible ? {
          id: 'order-1', status: state.status, customerId: 'student', pickupConfirmedAt, isPasabuyRequest,
          groupOrder: groupOwnerOnly ? { initiator: { allowParticipantOrderCompletion: false } } : null,
        } : null;
      },
      updateMany: async ({ where, data }) => {
        if (raceLost || state.status !== where.status) return { count: 0 };
        state.status = data.status;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ id: 'order-1', customerId: 'student', status: state.status, updatedAt: new Date(),
        vendor: { id: 'v', name: 'V', status: 'ACTIVE' }, items: [], subtotal: new Prisma.Decimal(1) }),
    },
    orderStatusHistory: { create: async () => { state.history += 1; } },
    auditRecord: { create: async () => {} },
  };
  const prisma = { $transaction: async (work) => work(tx) };
  const realtime = { emitOrderStatusUpdated: async () => { state.events += 1; } };
  return { service: new OrdersService(prisma, {}, {}, {}, realtime), state };
}

test('pickup failure paths: not ready, already confirmed, Pasabuy, foreign order, group non-owner, lost race', async () => {
  const cases = [
    [{ orderStatus: 'COOKING' }, 400, 'student'],
    [{ pickupConfirmedAt: new Date() }, 409, 'student'],
    [{ isPasabuyRequest: true }, 400, 'student'],
    [{ visible: false }, 404, 'intruder'],
    [{ groupOwnerOnly: true }, 403, 'member'],
    [{ raceLost: true }, 409, 'student'],
  ];
  for (const [options, expected, user] of cases) {
    const h = pickupHarness(options);
    await assert.rejects(h.service.confirmPickup(user, 'order-1'), (e) => status(e) === expected, JSON.stringify(options));
    assert.equal(h.state.history, 0, `history written for ${JSON.stringify(options)}`);
    assert.equal(h.state.events, 0, `event emitted for ${JSON.stringify(options)}`);
  }
});

test('buyer reads are scoped to the caller (no access to other students\' orders)', async () => {
  const where = [];
  const prisma = { order: {
    findFirst: async (args) => { where.push(args.where); return null; },
  } };
  const service = new OrdersService(prisma, {}, {}, {}, {});
  await assert.rejects(service.getOrder('intruder', 'order-1'), (e) => status(e) === 404);
  await assert.rejects(service.getOrderStatus('intruder', 'order-1'), (e) => status(e) === 404);
  assert.deepEqual(where[0], { id: 'order-1', customerId: 'intruder' });
  assert.deepEqual(where[1].OR, [
    { customerId: 'intruder' },
    { groupOrder: { participants: { some: { userId: 'intruder', status: 'JOINED' } } } },
  ]);
});

// ------------------------------------------------------------ route guards

// Routes that are intentionally reachable without a login. Adding a public
// route must be a deliberate change to this list.
const PUBLIC_ROUTES = new Set([
  'POST auth/register', 'POST auth/login', 'POST auth/switch-profile',
  'GET health', 'GET health/ready',
  'POST payments/webhook', // authenticated by the PayMongo signature instead
  'GET deals/active', 'GET featured-listings', 'GET featured-listings/plans', 'GET subscriptions/plans',
]);
const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

function routes() {
  const found = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.controller.js')) {
        for (const Controller of Object.values(require(full))) {
          if (typeof Controller !== 'function' || Reflect.getMetadata('path', Controller) === undefined) continue;
          const classGuards = Reflect.getMetadata('__guards__', Controller) ?? [];
          for (const key of Object.getOwnPropertyNames(Controller.prototype)) {
            const handler = Controller.prototype[key];
            if (key === 'constructor' || Reflect.getMetadata('path', handler) === undefined) continue;
            const route = [Reflect.getMetadata('path', Controller), Reflect.getMetadata('path', handler)]
              .join('/').replace(/\/+/g, '/').replace(/\/$/, '');
            found.push({
              id: `${METHODS[Reflect.getMetadata('method', handler)]} ${route}`,
              guards: [...classGuards, ...(Reflect.getMetadata('__guards__', handler) ?? [])],
              roles: Reflect.getMetadata('roles', handler) ?? Reflect.getMetadata('roles', Controller),
            });
          }
        }
      }
    }
  };
  walk(path.join(__dirname, '../dist'));
  return found;
}

test('every route requires a JWT unless it is on the public allow-list', () => {
  const all = routes();
  assert.ok(all.length > 100, `expected the full API, found ${all.length} routes`);
  const unguarded = all.filter((r) => !r.guards.includes(JwtAuthGuard) && !PUBLIC_ROUTES.has(r.id)).map((r) => r.id);
  assert.deepEqual(unguarded, [], 'routes without JwtAuthGuard');
  const stale = [...PUBLIC_ROUTES].filter((id) => !all.some((r) => r.id === id));
  assert.deepEqual(stale, [], 'allow-list entries that no longer exist');
});

test('every route that declares @Roles also runs RolesGuard (roles are enforced, not decorative)', () => {
  const missing = routes().filter((r) => r.roles?.length && !r.guards.includes(RolesGuard)).map((r) => r.id);
  assert.deepEqual(missing, []);
});

test('RolesGuard: no user or wrong role is 403; matching role passes', () => {
  const guard = new RolesGuard({ getAllAndOverride: () => ['VENDOR_OWNER'] });
  const ctx = (user) => ({ getHandler: () => null, getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }) });
  assert.throws(() => guard.canActivate(ctx(undefined)), (e) => status(e) === 403);
  assert.throws(() => guard.canActivate(ctx({ sub: 's', roles: ['BUYER'] })), (e) => status(e) === 403);
  assert.equal(guard.canActivate(ctx({ sub: 'v', roles: ['BUYER', 'VENDOR_OWNER'] })), true);
});
