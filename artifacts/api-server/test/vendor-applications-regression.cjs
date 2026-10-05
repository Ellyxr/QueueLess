const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const policy = require('../dist/vendor-applications/vendor-application.policy');
const { VendorApplicationsService } = require('../dist/vendor-applications/vendor-applications.service');
const { activateStudentApplication } = require('../dist/vendor-applications/activate-student-application');
process.env.VENDOR_APPLICATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
function harness(status = 'PENDING_REVIEW') {
  let app = { id: 'app', studentUserId: 'student', status, contractDueAt: new Date(Date.now()+100000),
    signedContractDocumentId: null, contractVerifiedAt: null, subscriptionId: null, vendorId: null,
    planId: 'plan', quotedPrice: new Prisma.Decimal(40), quotedDurationDays: 30, quotedDurationMonths: 1 };
  let vendor = null, subs = [], payments = [], audits = [], grants = [], failAudit = false, eligible = true, checkoutCalls = 0;
  const docs = [{ id:'contract', ownerUserId:'student', kind:'SIGNED_CONTRACT' }];
  const tx = {
    $queryRaw: async () => [],
    user: { findFirst: async () => eligible ? { id:'student' } : null, count: async () => eligible ? 1 : 0 },
    vendorApplication: {
      findFirst: async ({where}) => where.id===app.id && (!where.studentUserId || where.studentUserId===app.studentUserId) ? {...app} : null,
      findUnique: async ({where}) => (!where.subscriptionId || app.subscriptionId===where.subscriptionId) ? {...app} : null,
      count: async () => 0,
      update: async ({data}) => (app={...app,...data}),
    },
    vendorApplicationDocument: { findFirst: async ({where}) => docs.find(x=> x.id===where.id && x.ownerUserId===where.ownerUserId && x.kind===where.kind) },
    vendor: {
      findUnique: async () => vendor,
      create: async ({data}) => (vendor={id:'vendor',...data}),
      updateMany: async ({where,data}) => {
        if (!vendor || vendor.status!==where.status || (where.ownerUserId && vendor.ownerUserId!==where.ownerUserId) || (where.vendorType && vendor.vendorType!==where.vendorType)) return {count:0};
        vendor={...vendor,...data};return {count:1};
      },
    },
    vendorSubscription: {
      create: async ({data}) => { const s={id:`sub-${subs.length}`,status:'PENDING',payments:[],...data};subs.push(s);return s; },
      findUnique: async ({where}) => subs.find(x=> x.id===where.id),
    },
    payment: { create: async ({data}) => {const p={id:`pay-${payments.length}`,...data};payments.push(p);subs.at(-1).payments.push(p);return p;} },
    roleAssignment: { count: async () => grants.length, create: async ({data}) => {grants.push(data);return data;} },
    auditRecord: { create: async ({data}) => {if(failAudit) throw Error('audit failure');audits.push(data);return data;} },
  };
  const prisma = {...tx, $transaction: async work => {
    const snapshot={app:{...app},vendor:vendor&&{...vendor},subs:[...subs],payments:[...payments],audits:[...audits],grants:[...grants]};
    try {return await work(tx);} catch(e){({app,vendor,subs,payments,audits,grants}=snapshot);throw e;}
  }};
  const checkout={checkout: async () => {checkoutCalls++;return {status:'PENDING',checkoutUrl:'https://checkout.example/reserved'};}};
  const service = new VendorApplicationsService(prisma, {}, checkout);
  return {service, tx, atomic: work=>prisma.$transaction(work), get app(){return app;},set app(v){app=v;},
    get vendor(){return vendor;},set vendor(v){vendor=v;},get audits(){return audits;},get grants(){return grants;},
    get subs(){return subs;},get payments(){return payments;}, get checkoutCalls(){return checkoutCalls;},
    set failAudit(v){failAudit=v;},set eligible(v){eligible=v;}};
}

test('bank ciphertext authenticates the application ID and does not expose account details',()=>{
  const encrypted=policy.encryptBankDetails('app','123456789','Student Name');
  assert.ok(!encrypted.includes('123456789'));
  assert.deepEqual(policy.decryptBankDetails('app',encrypted),{accountNumber:'123456789',holderName:'Student Name'});
  assert.throws(()=>policy.decryptBankDetails('other',encrypted));
  const old=process.env.VENDOR_APPLICATION_ENCRYPTION_KEY;delete process.env.VENDOR_APPLICATION_ENCRYPTION_KEY;
  assert.throws(()=>policy.encryptBankDetails('app','123456789','Student'));process.env.VENDOR_APPLICATION_ENCRYPTION_KEY=old;
});
test('file validation rejects spoofed MIME, oversized data and SVG',()=>{
  assert.throws(()=>policy.documentExtension({buffer:Buffer.from('fake'),size:4,mimetype:'image/png'}));
  assert.throws(()=>policy.documentExtension({buffer:Buffer.alloc(6*1024*1024),size:6*1024*1024,mimetype:'image/png'}));
  assert.throws(()=>policy.documentExtension({buffer:Buffer.from('<svg>'),size:5,mimetype:'image/svg+xml'}));
  assert.equal(policy.documentExtension({buffer:Buffer.from([255,216,255]),size:3,mimetype:'image/jpeg'}),'jpg');
});
test('contract deadline is exclusive and calendar-month expiry clamps month ends',()=>{
  const due=new Date('2026-10-12T00:00:00Z');
  assert.equal(policy.contractIsOverdue('AWAITING_CONTRACT',due,new Date(due-1)),false);
  assert.equal(policy.contractIsOverdue('AWAITING_CONTRACT',due,due),true);
  assert.equal(policy.contractIsOverdue('CONTRACT_SUBMITTED',due,due),false);
  assert.equal(policy.subscriptionEnd(new Date('2028-01-31T12:00:00Z'),30,1).toISOString(),'2028-02-29T12:00:00.000Z');
});
test('approval starts seven-day window without a charge; rejection needs reason',async()=>{
  const h=harness();const before=Date.now();await h.service.review('app','admin',{action:'APPROVE'});
  assert.equal(h.app.status,'AWAITING_CONTRACT');assert.ok(h.app.contractDueAt>=before+policy.CONTRACT_WINDOW_MS);
  assert.equal(h.payments.length,0);assert.equal(h.checkoutCalls,0);
  await assert.rejects(h.service.review('app','admin',{action:'APPROVE'}));
  const rejected=harness();await assert.rejects(rejected.service.review('app','admin',{action:'REJECT',reason:' '}));
  await rejected.service.review('app','admin',{action:'REJECT',reason:'Invalid documents'});assert.equal(rejected.app.status,'REJECTED');
});
test('another student cannot submit a contract; expired window persists expiry without submission',async()=>{
  const h=harness('AWAITING_CONTRACT');await assert.rejects(h.service.contract('app','other','contract'));
  assert.equal(h.app.status,'AWAITING_CONTRACT');h.app={...h.app,contractDueAt:new Date(0)};
  await assert.rejects(h.service.contract('app','student','contract'));
  assert.equal(h.app.status,'CONTRACT_EXPIRED');assert.equal(h.app.signedContractDocumentId,null);
});
test('contract rejection retains reason and opens a fresh window',async()=>{
  const h=harness('AWAITING_CONTRACT');await h.service.contract('app','student','contract');
  assert.equal(h.app.status,'CONTRACT_SUBMITTED');await h.service.rejectContract('app','admin','Illegible scan');
  assert.equal(h.app.status,'CONTRACT_REJECTED');assert.equal(h.app.contractRejectionReason,'Illegible scan');
  assert.ok(h.app.contractDueAt>Date.now()+6*86400000);
});
test('contract verification reserves quoted payment once and never activates before payment',async()=>{
  const h=harness('CONTRACT_SUBMITTED');h.app={...h.app,signedContractDocumentId:'contract'};
  await h.service.verify('app','admin');await h.service.verify('app','admin');
  assert.equal(h.app.status,'PAYMENT_PROCESSING');assert.equal(h.vendor.status,'PENDING_APPROVAL');
  assert.equal(h.payments.length,1);assert.equal(h.subs.length,1);assert.equal(h.payments[0].amount.toFixed(2),'40.00');
  assert.equal(h.grants.length,0);
});
test('failed payment retry reuses pending subscription and does not create another payment',async()=>{
  const h=harness('CONTRACT_SUBMITTED');h.app={...h.app,signedContractDocumentId:'contract'};
  await h.service.verify('app','admin');h.app={...h.app,status:'PAYMENT_FAILED'};
  await assert.rejects(h.service.retry('app','other'));await h.service.retry('app','student');
  assert.equal(h.payments.length,1);assert.equal(h.app.status,'PAYMENT_PROCESSING');
});
test('audit failure rolls back contract verification reservation',async()=>{
  const h=harness('CONTRACT_SUBMITTED');h.app={...h.app,signedContractDocumentId:'contract'};h.failAudit=true;
  await assert.rejects(h.service.verify('app','admin'));assert.equal(h.app.status,'CONTRACT_SUBMITTED');
  assert.equal(h.vendor,null);assert.equal(h.payments.length,0);assert.equal(h.subs.length,0);
});
async function ready(){const h=harness('CONTRACT_SUBMITTED');h.app={...h.app,signedContractDocumentId:'contract'};await h.service.verify('app','admin');return h;}
function current(h){return {...h.subs[0],vendorId:h.vendor.id,application:{...h.app}};}
test('verified webhook activation grants role once; duplicate activation does not repeat',async()=>{
  const h=await ready();assert.equal(await h.atomic(tx=>activateStudentApplication(tx,current(h),'pay-0')),true);
  assert.equal(h.app.status,'ACTIVE');assert.equal(h.vendor.status,'ACTIVE');assert.equal(h.grants.length,1);
  assert.equal(await h.atomic(tx=>activateStudentApplication(tx,current(h),'pay-0')),false);
  assert.equal(h.grants.length,1);
});
test('suspended vendor or inactive owner cannot activate through webhook',async()=>{
  const h=await ready();h.vendor={...h.vendor,status:'SUSPENDED'};
  assert.equal(await h.atomic(tx=>activateStudentApplication(tx,current(h),'pay-0')),false);
  assert.equal(h.app.status,'PAYMENT_PROCESSING');const inactive=await ready();inactive.eligible=false;
  assert.equal(await inactive.atomic(tx=>activateStudentApplication(tx,current(inactive),'pay-0')),false);
});
test('unverified, cancelled, and superseded subscription cannot activate',async()=>{
  for(const mode of ['unverified','cancelled','superseded']){
    const h=await ready();let c=current(h);
    if(mode==='unverified') h.app={...h.app,contractVerifiedAt:null};
    if(mode==='cancelled') c.status='CANCELLED';
    if(mode==='superseded') h.app={...h.app,subscriptionId:'new-sub'};
    assert.equal(await h.atomic(tx=>activateStudentApplication(tx,c,'pay-0')),false,mode);
    assert.equal(h.vendor.status,'PENDING_APPROVAL');
  }
});
test('activation audit failure rolls back vendor, application and role',async()=>{
  const h=await ready();h.failAudit=true;
  await assert.rejects(h.atomic(tx=>activateStudentApplication(tx,current(h),'pay-0')));
  assert.equal(h.vendor.status,'PENDING_APPROVAL');assert.equal(h.app.status,'PAYMENT_PROCESSING');assert.equal(h.grants.length,0);
});

test('controller role guards separate buyer application actions from administrator review',()=>{
  const { VendorApplicationsController, AdminVendorApplicationsController }=require('../dist/vendor-applications/vendor-applications.controller');
  const { RolesGuard }=require('../dist/auth/roles.guard');const { Reflector }=require('@nestjs/core');
  const guard=new RolesGuard(new Reflector());
  function context(cls,roles){return {getClass:()=>cls,getHandler:()=>cls.prototype.list || cls.prototype.mine,
    switchToHttp:()=>({getRequest:()=>({user:{roles}})})};}
  assert.equal(guard.canActivate(context(VendorApplicationsController,['BUYER'])),true);
  assert.throws(()=>guard.canActivate(context(AdminVendorApplicationsController,['BUYER'])));
  assert.equal(guard.canActivate(context(AdminVendorApplicationsController,['ADMIN'])),true);
  assert.throws(()=>guard.canActivate(context(VendorApplicationsController,['ADMIN'])));
});
test('uncertain provider session creation remains reserved and repeated checkout cannot create a second session',async()=>{
  const { SubscriptionsService }=require('../dist/subscriptions/subscriptions.service');
  let calls=0;let p={id:'payment',status:'PENDING',amount:new Prisma.Decimal(40),checkoutUrl:null,providerPaymentId:null};
  const prisma={vendor:{findUnique:async()=>({id:'vendor',status:'PENDING_APPROVAL'})},
    vendorApplication:{findUnique:async()=>({studentUserId:'student',contractVerifiedAt:new Date(),status:'PAYMENT_PROCESSING'})},
    vendorSubscription:{findFirst:async()=>({id:'sub',status:'PENDING',plan:{name:'Monthly'},payments:[{...p}]})},
    payment:{updateMany:async({where,data})=>{if(p.checkoutUrl!==where.checkoutUrl)return {count:0};p={...p,...data};return {count:1};}}};
  const service=new SubscriptionsService(prisma,{createCheckoutSession:async()=>{calls++;throw Error('uncertain timeout');}});
  await assert.rejects(service.checkout('student','sub'));assert.equal(p.checkoutUrl,'CREATING');
  await assert.rejects(service.checkout('student','sub'));assert.equal(calls,1);
});
test('bank details are decrypted only by audited detail action; no plaintext enters audit',async()=>{
  const h=harness();h.app={...h.app,bankDetailsEncrypted:policy.encryptBankDetails('app','123456789','Student Name')};
  const result=await h.service.bankDetails('app','admin');assert.equal(result.accountNumber,'123456789');
  assert.ok(!JSON.stringify(h.audits).includes('123456789'));h.failAudit=true;
  await assert.rejects(h.service.bankDetails('app','admin'));
});
