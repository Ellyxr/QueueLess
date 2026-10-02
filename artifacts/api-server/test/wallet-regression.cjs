// Behavioral tests against the compiled service. In-memory transactions support
// rollback and serialization; database locking must also be verified on staging.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Prisma } = require('@prisma/client');
const { WalletService } = require('../dist/wallet/wallet.service');
const D = value => new Prisma.Decimal(value);
const clone = value => value instanceof Prisma.Decimal ? D(value) : value instanceof Date ? new Date(value) : Array.isArray(value) ? value.map(clone) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,clone(v)])) : value;
function fixture(balance = '100.00', amounts = ['85.00']) {
  const userId = randomUUID();
  let state = { wallets: { [userId]: { userId, balance: D(balance) } }, payments: {}, shares: {}, orders: {}, refunds: {}, entries: [], audits: [], history: [], vendorLedger: [] };
  let queue = Promise.resolve();
  let failAudit = false;
  const tx = {
    $queryRaw: async () => [],
    wallet: {
      findUnique: async ({where}) => clone(state.wallets[where.userId] ?? null),
      findUniqueOrThrow: async ({where}) => clone(state.wallets[where.userId]),
      updateMany: async ({where,data}) => {
        const w = state.wallets[where.userId];
        if (!w || w.balance.lt(where.balance.gte)) return { count: 0 };
        w.balance = w.balance.sub(data.balance.decrement); return { count: 1 };
      },
      upsert: async ({where,create,update}) => {
        const w = state.wallets[where.userId];
        if (w) w.balance = w.balance.add(update.balance.increment);
        else state.wallets[where.userId] = clone(create);
        return clone(state.wallets[where.userId]);
      },
    },
    payment: {
      findUnique: async ({where,include}) => {
        const p = where.id ? state.payments[where.id] : Object.values(state.payments).find(p => p.payerUserId === where.payerUserId_walletKey.payerUserId && p.walletKey === where.payerUserId_walletKey.walletKey);
        return p ? clone({ ...p, ...(include?.paymentShares ? { paymentShares: Object.values(state.shares).filter(s => s.paymentId === p.id) } : {}) }) : null;
      },
      findUniqueOrThrow: async ({where}) => clone(state.payments[where.id]),
      create: async ({data}) => {
        const p = { id: randomUUID(), status: 'PENDING', provider: 'PAYMONGO', currency: 'PHP', ...clone(data) };
        state.payments[p.id] = p; return clone(p);
      },
      update: async ({where,data}) => { Object.assign(state.payments[where.id], clone(data)); return clone(state.payments[where.id]); },
    },
    paymentShare: {
      findFirst: async ({where}) => {
        const s = state.shares[where.id];
        return s && s.payerUserId === where.payerUserId ? clone({ ...s, order: state.orders[s.orderId], payment: state.payments[s.paymentId] ?? null }) : null;
      },
      update: async ({where,data}) => { Object.assign(state.shares[where.id], data); return clone(state.shares[where.id]); },
      count: async ({where}) => Object.values(state.shares).filter(s => s.orderId === where.orderId && s.status === where.status).length,
    },
    order: { update: async ({where,data}) => { Object.assign(state.orders[where.id], data, { updatedAt: new Date() }); return clone(state.orders[where.id]); } },
    walletEntry: { create: async ({data}) => {
      if (state.entries.some(e => data.paymentId && e.paymentId === data.paymentId || data.refundId && e.refundId === data.refundId)) throw new Error('Duplicate ledger reference');
      state.entries.push(clone(data)); return clone(data);
    } },
    auditRecord: { create: async ({data}) => { if (failAudit) throw new Error('Audit unavailable'); state.audits.push(clone(data)); return data; } },
    orderStatusHistory: { create: async ({data}) => { state.history.push(data); return data; } },
    vendorLedgerEntry: { create: async ({data}) => { state.vendorLedger.push(data); return data; } },
    refund: {
      findUniqueOrThrow: async ({where}) => { const r = state.refunds[where.id]; return clone({ ...r, payment: state.payments[r.paymentId] }); },
      aggregate: async ({where}) => ({ _sum: { amount: Object.values(state.refunds).filter(r => r.paymentId === where.paymentId && r.id !== where.id.not && where.status.in.includes(r.status)).reduce((sum,r) => sum.add(r.amount),D(0)) } }),
      update: async ({where,data}) => { Object.assign(state.refunds[where.id],data); return clone(state.refunds[where.id]); },
    },
  };
  const prisma = { ...tx, $transaction: async fn => {
    const previous = queue; let release; queue = new Promise(resolve => { release = resolve; }); await previous;
    const snapshot = clone(state);
    try { return await fn(tx); } catch (error) { state = snapshot; throw error; } finally { release(); }
  } };
  const provider = { amount: 2000, currency: 'PHP', status: 'paid', fail: false,
    createCheckoutSession: async ({referenceNumber}) => { if (provider.fail) throw new Error('Provider unavailable'); provider.reference = referenceNumber; return { checkoutSessionId: 'cs_sandbox', checkoutUrl: 'https://checkout.paymongo.com/test' }; },
    retrieveCheckoutPaymentIds: async () => ({ referenceNumber: provider.reference, paymentIds: ['pay_test'] }),
    retrievePayment: async () => ({ amount: provider.amount, currency: provider.currency, status: provider.status }),
  };
  const notifications = [];
  const service = new WalletService(prisma, provider, { emitOrderStatusUpdated: async (...args) => { notifications.push(args); } });
  const shares = amounts.map(amount => {
    const orderId = randomUUID(), shareId = randomUUID();
    state.orders[orderId] = { id: orderId, status: 'PENDING', customerId: userId, vendorId: randomUUID(), totalAmount: D(amount), marketplaceFee: D(0), updatedAt: new Date() };
    state.shares[shareId] = { id: shareId, orderId, payerUserId: userId, amountDue: D(amount), status: 'PENDING', paymentId: null };
    return shareId;
  });
  return { service, provider, userId, shares, notifications, state: () => state, failAudit: () => { failAudit = true; }, approveRefund: (paymentId,amount) => {
    const id = randomUUID(); state.refunds[id] = { id, paymentId, amount: D(amount), status: 'APPROVED' }; return id;
  } };
}

test('authoritative share amount debits exactly once and activates order', async () => {
  const f = fixture(); const paid = await f.service.pay(f.userId,f.shares[0],'buy');
  assert.equal(f.state().wallets[f.userId].balance.toFixed(2),'15.00');
  assert.equal(f.state().payments[paid.paymentId].amount.toFixed(2),'85.00');
  assert.equal(f.state().orders[paid.orderId].status,'PAID');
  assert.equal(f.state().vendorLedger.length,1); assert.equal(f.notifications.length,1);
  await f.service.pay(f.userId,f.shares[0],'buy');
  assert.equal(f.state().entries.length,1);
});
test('concurrent duplicate purchase has one debit', async () => {
  const f = fixture(); const results = await Promise.all([f.service.pay(f.userId,f.shares[0],'same'),f.service.pay(f.userId,f.shares[0],'same')]);
  assert.equal(results[0].paymentId,results[1].paymentId); assert.equal(f.state().entries.length,1);
});
test('two purchases cannot overdraw one balance', async () => {
  const f = fixture('100',['85','85']); const result = await Promise.allSettled(f.shares.map((id,i) => f.service.pay(f.userId,id,`buy${i}`)));
  assert.equal(result.filter(r => r.status === 'fulfilled').length,1);
  assert.equal(f.state().wallets[f.userId].balance.toFixed(2),'15.00');
});
test('insufficient funds rolls back payment and ledger', async () => {
  const f = fixture('10'); await assert.rejects(f.service.pay(f.userId,f.shares[0],'buy'),/Insufficient/);
  assert.equal(f.state().entries.length,0); assert.equal(Object.keys(f.state().payments).length,0);
});
test('another buyer cannot spend the share', async () => {
  const f = fixture(); await assert.rejects(f.service.pay(randomUUID(),f.shares[0],'buy'),/not found/);
  assert.equal(f.state().wallets[f.userId].balance.toFixed(2),'100.00');
});
test('cancelled orders and already paid shares cannot debit funds', async () => {
  const f = fixture(); f.state().orders[f.state().shares[f.shares[0]].orderId].status = 'CANCELLED';
  await assert.rejects(f.service.pay(f.userId,f.shares[0],'buy'),/cannot be paid/); assert.equal(f.state().entries.length,0);
});
test('idempotency key cannot be reused for another share', async () => {
  const f = fixture('300',['85','85']); await f.service.pay(f.userId,f.shares[0],'key');
  await assert.rejects(f.service.pay(f.userId,f.shares[1],'key'),/another purchase/); assert.equal(f.state().entries.length,1);
});
test('audit failure rolls back balance, order, and payment', async () => {
  const f = fixture(); f.failAudit(); await assert.rejects(f.service.pay(f.userId,f.shares[0],'buy'),/Audit unavailable/);
  assert.equal(f.state().wallets[f.userId].balance.toFixed(2),'100.00'); assert.equal(f.state().entries.length,0);
  assert.equal(Object.values(f.state().orders)[0].status,'PENDING');
});
test('cash-in creates no credit before verified provider payment', async () => {
  const f = fixture('0'); const topup = await f.service.topup(f.userId,'20.00','cash');
  assert.equal(f.state().wallets[f.userId].balance.toFixed(2),'0.00'); assert.equal(f.state().entries.length,0);
  const replay = await f.service.topup(f.userId,'20.00','cash'); assert.equal(replay.paymentId,topup.paymentId);
  await assert.rejects(f.service.topup(f.userId,'30.00','cash'),/another amount/);
});
test('cash-in notification retries credit once', async () => {
  const f = fixture('0'); const topup = await f.service.topup(f.userId,'20.00','cash');
  const results = await Promise.all([f.service.confirmTopup(topup.paymentId,'cs_sandbox'),f.service.confirmTopup(topup.paymentId,'cs_sandbox')]);
  assert.equal(results.filter(r => r.duplicate).length,1); assert.equal(f.state().wallets[f.userId].balance.toFixed(2),'20.00'); assert.equal(f.state().entries.length,1);
});
test('wrong amount, currency, status, session, or reference cannot credit', async () => {
  for (const variant of ['amount','currency','status','session','reference']) {
    const f = fixture('0'); const topup = await f.service.topup(f.userId,'20.00','cash');
    if (variant === 'amount') f.provider.amount = 1900;
    if (variant === 'currency') f.provider.currency = 'USD';
    if (variant === 'status') f.provider.status = 'pending';
    if (variant === 'reference') f.provider.reference = randomUUID();
    await assert.rejects(f.service.confirmTopup(topup.paymentId,variant === 'session' ? 'cs_wrong' : 'cs_sandbox'));
    assert.equal(f.state().wallets[f.userId].balance.toFixed(2),'0.00');
  }
});
test('invalid cash-in amounts rejected before contacting provider', async () => {
  const f = fixture('0'); for (const amount of ['-20','0','19.99','10000.01','20.001','NaN','1e2']) await assert.rejects(f.service.topup(f.userId,amount,'cash'));
  assert.equal(Object.keys(f.state().payments).length,0);
});
test('provider outage never credits wallet', async () => {
  const f = fixture('0'); f.provider.fail = true; await assert.rejects(f.service.topup(f.userId,'20.00','cash'),/Provider unavailable/);
  assert.equal(f.state().wallets[f.userId].balance.toFixed(2),'0.00'); assert.equal(f.state().entries.length,0);
});
test('wallet refund credits once and keeps auditable purchase debit', async () => {
  const f = fixture(); const paid = await f.service.pay(f.userId,f.shares[0],'buy'); const refundId = f.approveRefund(paid.paymentId,'85');
  await Promise.all([f.service.refund(refundId,null),f.service.refund(refundId,null)]);
  assert.equal(f.state().wallets[f.userId].balance.toFixed(2),'100.00'); assert.equal(f.state().entries.length,2); assert.equal(f.state().refunds[refundId].status,'PROCESSED');
});
test('refund total cannot exceed purchase amount', async () => {
  const f = fixture(); const paid = await f.service.pay(f.userId,f.shares[0],'buy');
  const refundId = f.approveRefund(paid.paymentId,'86'); await assert.rejects(f.service.refund(refundId,null),/exceeds/);
  assert.equal(f.state().wallets[f.userId].balance.toFixed(2),'15.00');
});
test('group order activates only after every share is paid', async () => {
  const f = fixture('100',['85','85']); const state = f.state(); const first = state.shares[f.shares[0]], second = state.shares[f.shares[1]];
  delete state.orders[second.orderId]; second.orderId = first.orderId; const memberId = randomUUID(); second.payerUserId = memberId;
  state.wallets[memberId] = { userId: memberId, balance: D(100) }; state.orders[first.orderId].totalAmount = D(170);
  await f.service.pay(f.userId,first.id,'owner'); assert.equal(state.orders[first.orderId].status,'PENDING'); assert.equal(state.vendorLedger.length,0);
  await f.service.pay(memberId,second.id,'member'); assert.equal(state.orders[first.orderId].status,'PAID'); assert.equal(state.vendorLedger.length,1); assert.equal(state.vendorLedger[0].amount.toFixed(2),'170.00');
});
test('refund audit failure rolls back credit and refund state', async () => {
  const f = fixture(); const paid = await f.service.pay(f.userId,f.shares[0],'buy'); const id = f.approveRefund(paid.paymentId,'85'); f.failAudit();
  await assert.rejects(f.service.refund(id,null),/Audit unavailable/); assert.equal(f.state().wallets[f.userId].balance.toFixed(2),'15.00'); assert.equal(f.state().refunds[id].status,'APPROVED'); assert.equal(f.state().entries.length,1);
});
