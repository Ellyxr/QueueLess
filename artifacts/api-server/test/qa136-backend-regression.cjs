const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { FeaturedListingsService } = require('../dist/featured-listings/featured-listings.service');
const { listingEndDate, discountedPrice } = require('../dist/featured-listings/featured-pricing.policy');
const { assessDropoff } = require('../dist/pasabuy/pasabuy-location.policy');
const { PreviewPasabuyRequestDto, CreatePasabuyRequestDto } = require('../dist/pasabuy/dto/create-pasabuy-request.dto');
const { UpdateFeaturedSettingsDto, UpdateFeaturedPlanDto, CreateFeaturedListingDto } = require('../dist/featured-listings/dto/featured-listing.dto');
const { PasabuyCreationService } = require('../dist/pasabuy/pasabuy-creation.service');
const { GroupOrdersService } = require('../dist/group-orders/group-orders.service');
const { VendorReportsService } = require('../dist/reports/vendor-reports.service');
const { VendorsService } = require('../dist/vendors/vendors.service');
const D = value => new Prisma.Decimal(value);
const unique = () => new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6.19.3' });
const reject = (promise, status) => assert.rejects(promise, error => error.getStatus?.() === status);
function featuredHarness() {
  let state = { settings: { id: 1, monthlyPrice: '100', firstVendorDiscount: 30, secondVendorDiscount: 20, thirdVendorDiscount: 10, discountOnRenewals: true, version: 1 },
    plans: [{ id: 'month', price: '100', name: 'Monthly', durationDays: 30, durationMonths: 1, managedMonthly: true, placement: 'MARKETPLACE_HOME', isActive: true },
      { id: 'spot', price: '100', name: 'Spot', durationDays: 30, durationMonths: null, managedMonthly: false, placement: 'PRODUCT_SPOTLIGHT', isActive: true }],
    vendors: ['v1','v2','v3','v4'].map(id => ({id, status: 'ACTIVE'})), claims: [], listings: [], payments: [], entries: [], payouts: [], audits: [] };
  let failAudit = false, checkoutFailure = false, checkoutCalls = 0, tail = Promise.resolve();
  const locks = [];
  const hydrate = row => row && ({...row, ...(row.price !== undefined ? {price:D(row.price)} : {}), ...(row.amount !== undefined ? {amount:D(row.amount)} : {})});
  const listingMatch = (row,w) => (!w.id || row.id===w.id) && (!w.vendorId || row.vendorId===w.vendorId) && (!w.placement || row.placement===w.placement) &&
    (!w.status || (typeof w.status==='string' ? row.status===w.status : w.status.in?.includes(row.status)));
  const tx = {
    $queryRaw: async (strings,...values) => {locks.push({sql:strings.join('?'),values});return [];},
    vendor: {findUnique: async ({where}) => state.vendors.find(v=>v.id===(where.id||where.ownerUserId))},
    featuredListingSettings: {
      findUniqueOrThrow: async () => ({...state.settings, monthlyPrice:D(state.settings.monthlyPrice)}),
      update: async ({data}) => {state.settings={...state.settings,...data,monthlyPrice:String(data.monthlyPrice),version:state.settings.version+1};return {...state.settings,monthlyPrice:D(state.settings.monthlyPrice)};},
    },
    featuredListingPlan: {findUnique: async ({where})=>hydrate(state.plans.find(p=>p.id===where.id)),
      findMany: async ({where={}}={})=>state.plans.filter(p=>!where.managedMonthly||p.managedMonthly).map(hydrate),
      update: async ({where,data})=>{const p=state.plans.find(p=>p.id===where.id);Object.assign(p,data);if(data.price!==undefined)p.price=String(data.price);return hydrate(p);}},
    product: {findFirst: async ({where})=>where.id==='product' ? {imageUrl:'https://images.example/food.png'} : null},
    featuredIntroClaim: {findUnique: async ({where})=>state.claims.find(c=>c.vendorId===where.vendorId),
      findMany: async ()=>state.claims,
      create: async ({data})=>{if(state.claims.some(c=>c.rank===data.rank||c.vendorId===data.vendorId))throw unique();const c={...data,consumedAt:null};state.claims.push(c);return c;},
      updateMany: async ({where,data})=>{const rows=state.claims.filter(c=>c.vendorId===where.vendorId&&!c.consumedAt);rows.forEach(c=>Object.assign(c,data));return {count:rows.length};},
      deleteMany: async ({where})=>{state.claims=state.claims.filter(c=>c.vendorId!==where.vendorId||c.consumedAt);return {count:1};}},
    vendorLedgerEntry: {aggregate: async ({where})=>({_sum:{amount:state.entries.filter(e=>e.vendorId===where.vendorId).reduce((a,e)=>a.add(e.amount),D(0))}}),
      create: async ({data})=>{const e={...data,amount:String(data.amount)};state.entries.push(e);return e;}},
    featuredListing: {
      findMany: async ({where,select}) => state.listings.filter(row=>listingMatch(row,where)&&(!where.endDate || row.endDate<=where.endDate.lte)).map(row=>select?.payments?{...row,payments:state.payments.filter(p=>p.featuredListingId===row.id)}:row),
      count: async ({where}) => state.listings.filter(row=>listingMatch(row,where)).length,
      findUnique: async ({where})=>{const k=where.vendorId_purchaseKey;const row=state.listings.find(row=>k?row.vendorId===k.vendorId&&row.purchaseKey===k.purchaseKey:row.id===where.id);return row&&{...row,payments:state.payments.filter(p=>p.featuredListingId===row.id).map(hydrate)};},
      findFirst: async ({where})=>{const row=state.listings.find(row=>listingMatch(row,where));return row&&{...row,plan:hydrate(state.plans.find(p=>p.id===row.planId)),payments:state.payments.filter(p=>p.featuredListingId===row.id).map(hydrate)};},
      create: async ({data})=>{if(state.listings.some(l=>l.vendorId===data.vendorId&&l.placement===data.placement&&['PENDING','ACTIVE'].includes(l.status)))throw unique();const row={id:'listing-'+state.listings.length,...data,...(data.pricePaid!==undefined?{pricePaid:String(data.pricePaid)}:{}),createdAt:new Date()};state.listings.push(row);return row;},
      updateMany: async ({where,data})=>{const rows=state.listings.filter(row=>listingMatch(row,where));rows.forEach(row=>Object.assign(row,data));return {count:rows.length};},
    },
    payment: {
      count: async ({where})=>state.payments.filter(p=>p.status===where.status&&state.listings.some(l=>l.id===p.featuredListingId&&listingMatch(l,where.featuredListing))).length,
      create: async ({data})=>{const p={id:'payment-'+state.payments.length,providerPaymentId:null,checkoutUrl:null,...data,amount:String(data.amount)};state.payments.push(p);return hydrate(p);},
      findMany: async ({where})=>state.payments.filter(p=>p.featuredListingId===where.featuredListingId&&p.status===where.status),
      updateMany: async ({where,data})=>{const rows=state.payments.filter(p=>p.id===where.id&&Object.entries(where).every(([k,v])=>k==='id'||p[k]===v));rows.forEach(p=>Object.assign(p,data));return {count:rows.length};},
      update: async ({where,data})=>{const p=state.payments.find(p=>p.id===where.id);Object.assign(p,data);return hydrate(p);},
    },
    payout: {findUnique: async ({where})=>hydrate(state.payouts.find(p=>p.idempotencyKey===where.idempotencyKey)),
      create: async ({data})=>{const p={id:'payout-'+state.payouts.length,...data,amount:String(data.amount)};state.payouts.push(p);return hydrate(p);}},
    auditRecord: {create: async ({data})=>{if(failAudit)throw Error('audit failure');state.audits.push(data);return data;}},
  };
  // Serial transaction harness checks decisions/rollback, not PostgreSQL's lock implementation.
  const prisma = {...tx,$transaction: work=>{const run=tail.then(async()=>{const previous=structuredClone(state);try{return await work(tx);}catch(e){state=previous;throw e;}});tail=run.catch(()=>{});return run;}};
  const provider={createCheckoutSession: async ()=>{checkoutCalls++;if(checkoutFailure)throw Error('provider uncertain');return {checkoutSessionId:'session',checkoutUrl:'https://checkout.example/session'};},expireCheckoutSession:async()=>true};
  return { service:new FeaturedListingsService(prisma,provider), payout:new VendorsService(prisma,{},{}), prisma, locks,
    state:()=>state, fund:(id,amount)=>state.entries.push({vendorId:id,amount:String(amount)}),
    expire:id=>{state.listings.filter(l=>l.vendorId===id).forEach(l=>{l.status='EXPIRED';l.endDate=new Date(0);});},
    failAudit:value=>{failAudit=value;}, failCheckout:()=>{checkoutFailure=true;}, calls:()=>checkoutCalls };
}
const intent = {planId:'month',paymentMethod:'WALLET'};
test('monthly pricing uses Decimal rounding and calendar months clamp month ends',()=>{
  assert.equal(discountedPrice(D('100.05'),30).toFixed(2),'70.04');
  assert.equal(listingEndDate(new Date('2028-01-31T12:00:00Z'),30,1).toISOString(),'2028-02-29T12:00:00.000Z');
  assert.equal(listingEndDate(new Date('2026-01-31T12:00:00Z'),360,12).toISOString(),'2027-01-31T12:00:00.000Z');
});
test('quote shows authoritative vendor funds and does not consume introductory slot',async()=>{
  const h=featuredHarness();h.fund('v1',100);
  const quote=await h.service.quote('v1',intent);
  assert.equal(quote.amount,'70.00');assert.equal(quote.walletBalance,'100.00');assert.equal(quote.canPayWithWallet,true);assert.equal(h.state().claims.length,0);
});
test('four distinct vendors reserve distinct ranks with configurable first three discounts',async()=>{
  const h=featuredHarness();['v1','v2','v3','v4'].forEach(v=>h.fund(v,100));
  const results=await Promise.all(['v1','v2','v3','v4'].map(v=>h.service.create(v,intent,v)));
  assert.deepEqual(results.map(r=>r.amount),['70.00','80.00','90.00','100.00']);
  assert.deepEqual(h.state().claims.map(c=>c.rank),[1,2,3]);
  assert(h.locks.some(l=>l.sql.includes('pg_advisory_xact_lock')));assert(h.locks.some(l=>l.sql.includes('vendors')&&l.sql.includes('FOR UPDATE')));
});
test('wallet replay reuses payment, ledger link and frozen amount after admin edits',async()=>{
  const h=featuredHarness();h.fund('v1',100);
  const first=await h.service.create('v1',intent,'same');
  await h.service.updateSettings({monthlyPrice:200,firstVendorDiscount:40,secondVendorDiscount:20,thirdVendorDiscount:10,discountOnRenewals:true,version:1},'admin');
  const replay=await h.service.create('v1',intent,'same');
  assert.equal(first.paymentId,replay.paymentId);assert.equal(replay.amount,'70.00');assert.equal(replay.idempotentReplay,true);assert.equal(replay.walletBalance,'30.00');
  assert.equal(h.state().entries.filter(e=>e.featuredListingId===first.listingId).length,1);
  await reject(h.service.create('v1',{...intent,planId:'spot',productId:'product'},'same'),409);
});
test('renewal eligibility is explicit, tiers remain stable and editing does not reset claims',async()=>{
  const h=featuredHarness();h.fund('v1',1000);await h.service.create('v1',intent,'first');h.expire('v1');
  assert.equal((await h.service.create('v1',intent,'renewal')).amount,'70.00');h.expire('v1');
  await h.service.updateSettings({monthlyPrice:100,firstVendorDiscount:25,secondVendorDiscount:20,thirdVendorDiscount:10,discountOnRenewals:false,version:1},'admin');
  assert.equal((await h.service.create('v1',intent,'regular')).amount,'100.00');assert.equal(h.state().claims.length,1);assert.equal(h.state().claims[0].rank,1);
});
test('stale settings and stale confirmed quote are rejected without reserving or debiting',async()=>{
  const h=featuredHarness();h.fund('v1',100);
  await reject(h.service.updateSettings({version:99},'admin'),409);
  await reject(h.service.create('v1',{...intent,expectedAmount:'60.00'},'stale'),409);
  assert.equal(h.state().claims.length,0);assert.equal(h.state().payments.length,0);
});
test('insufficient funds and audit failure roll back payment, claim and ledger',async()=>{
  const h=featuredHarness();await reject(h.service.create('v1',intent,'poor'),409);
  assert.equal(h.state().claims.length,0);h.fund('v1',100);h.failAudit(true);
  await assert.rejects(h.service.create('v1',intent,'audit'),/audit failure/);
  assert.equal(h.state().claims.length,0);assert.equal(h.state().payments.length,0);assert.equal(h.state().entries.length,1);
});
test('duplicate wallet submissions create one debit',async()=>{
  const h=featuredHarness();h.fund('v1',100);
  const rows=await Promise.all([h.service.create('v1',intent,'duplicate'),h.service.create('v1',intent,'duplicate')]);
  assert.equal(rows[0].paymentId,rows[1].paymentId);assert.equal(h.state().payments.length,1);assert.equal(h.state().entries.length,2);
});
test('payout and listing use same vendor lock and cannot both spend the starting balance',async()=>{
  const h=featuredHarness();h.fund('v1',100);
  const results=await Promise.allSettled([h.service.create('v1',intent,'listing'),h.payout.payoutVendorBalance('v1','payout')]);
  assert.equal(results[1].status,'fulfilled');
  if(results[0].status==='rejected')assert.equal(results[0].reason.getStatus(),409);
  assert.equal((await h.prisma.vendorLedgerEntry.aggregate({where:{vendorId:'v1'}}))._sum.amount.toFixed(2),'0.00');
  assert.equal(h.state().payouts[0].amount,results[0].status==='fulfilled'?'30':'100');
});
test('provider checkout preserves amount/duration snapshot and an uncertain session is not recreated',async()=>{
  const h=featuredHarness();h.failCheckout();
  await assert.rejects(h.service.create('v1',{planId:'month'},'checkout'),/provider uncertain/);
  const listing=h.state().listings[0];assert.equal(listing.durationMonthsSnapshot,1);assert.equal(h.state().payments[0].amount,'70');
  await reject(h.service.create('v1',{planId:'month'},'checkout'),409);assert.equal(h.calls(),1);
  assert.equal(h.state().payments[0].checkoutUrl,'CREATING');
});
test('disabled plans and inactive vendors cannot create payments',async()=>{
  const h=featuredHarness();h.state().plans[0].isActive=false;await reject(h.service.quote('v1',intent),409);
  h.state().plans[0].isActive=true;h.state().vendors[0].status='SUSPENDED';await reject(h.service.quote('v1',intent),409);assert.equal(h.state().claims.length,0);
});
test('settings cannot bypass numeric limits, renewal boolean or version validation',async()=>{
  const errors=await validate(plainToInstance(UpdateFeaturedSettingsDto,{monthlyPrice:-1,firstVendorDiscount:100,secondVendorDiscount:-1,thirdVendorDiscount:0.5,discountOnRenewals:'yes',version:0}));
  assert.equal(errors.length,6);
});
const bounds='-1,-1,1,1';
test('Pasabuy raw distance classifies inside, exactly 270m and beyond with caution',()=>{
  const lat=meters=>meters/6371000*180/Math.PI;
  assert.equal(assessDropoff(lat(269),0,0,0,bounds).withinRecommendedRadius,true);
  assert.equal(assessDropoff(lat(270),0,0,0,bounds).withinRecommendedRadius,true);
  const outside=assessDropoff(lat(271),0,0,0,bounds);assert.equal(outside.requiresConfirmation,true);assert(outside.warning);assert(outside.inCampus);
});
test('Pasabuy validates campus bounds and invalid coordinates, including nonfinite values',()=>{
  for(const bad of [NaN,Infinity,91])assert.throws(()=>assessDropoff(bad,0,0,0,bounds));
  assert.throws(()=>assessDropoff(0,0,0,0,'-1,,1,1'));
  assert.throws(()=>assessDropoff(0,0,0,0,'-91,-1,1,1'));
});
test('coordinate strings normalize while empty, boolean and out-of-range input fails DTO validation',async()=>{
  const base={orderId:'00000000-0000-4000-8000-000000000001',dropoffLatitude:'14.6',dropoffLongitude:'120.99'};
  const dto=plainToInstance(PreviewPasabuyRequestDto,base);assert.equal((await validate(dto)).length,0);assert.equal(dto.dropoffLatitude,14.6);
  for(const bad of ['',true,null,'91','Infinity'])assert((await validate(plainToInstance(PreviewPasabuyRequestDto,{...base,dropoffLatitude:bad}))).length);
  assert((await validate(plainToInstance(CreatePasabuyRequestDto,{...base,termsAccepted:true,outsideRadiusConfirmed:'true'}))).length);
});
test('owned-order preview returns displayable coordinates and authoritative fee without creating request',async()=>{
  process.env.PASABUY_CAMPUS_BOUNDS=bounds;
  const prisma={order:{findFirst:async({where})=>where.customerId==='buyer'?{status:'PAID',orderType:'INDIVIDUAL',items:[{}],vendor:{pickupLocation:'stall',pickupLatitude:0,pickupLongitude:0}}:null}};
  const service=new PasabuyCreationService(prisma,{}, {calculatePasabuyFee:()=>({amount:D(30),feeTier:'IN_CAMPUS'})});
  const dto={orderId:'order',dropoffLatitude:0.003,dropoffLongitude:0};
  const preview=await service.preview('buyer',dto);assert(preview.requiresConfirmation);assert.equal(preview.dropoffLocation,'0.003000, 0.000000');assert.equal(preview.convenienceFee,'30.00');
  await reject(service.preview('other',dto),404);
});
function groupHarness(status='OPEN') {
  let state={group:{id:'g',initiatorUserId:'owner',status},member:{id:'m',userId:'member',status:'JOINED'},carts:[{userId:'member'},{userId:'owner'}],audits:[]};let fail=false;
  const tx={$queryRaw:async()=>[],groupOrder:{findUnique:async()=>state.group},groupOrderParticipant:{findUnique:async({where})=>where.groupOrderId_userId.userId===state.member.userId?state.member:null,update:async({data})=>Object.assign(state.member,data)},
    cart:{deleteMany:async({where})=>{state.carts=state.carts.filter(c=>c.userId!==where.userId);}},auditRecord:{create:async({data})=>{if(fail)throw Error('audit');state.audits.push(data);}}};
  const prisma={$transaction:async work=>{const old=structuredClone(state);try{return await work(tx);}catch(e){state=old;throw e;}}};
  return {service:new GroupOrdersService(prisma,{},{}),state:()=>state,fail:()=>{fail=true;}};
}
test('owner kick and member leave remove only that members cart and audit the change',async()=>{
  for(const kick of [true,false]){const h=groupHarness();const row=await h.service.removeMember(kick?'owner':'member','g','member',kick);
    assert.equal(row.status,'LEFT');assert.deepEqual(h.state().carts,[{userId:'owner'}]);assert.equal(h.state().audits.length,1);}
});
test('group membership rejects nonowner kick, owner leave and changes after locking',async()=>{
  const h=groupHarness();await reject(h.service.removeMember('stranger','g','member',true),403);await reject(h.service.removeMember('owner','g','owner',false),409);
  const locked=groupHarness('LOCKED');await reject(locked.service.removeMember('member','g','member',false),409);assert.equal(locked.state().member.status,'JOINED');
});
test('group removal audit failure preserves cart and membership',async()=>{
  const h=groupHarness();h.fail();await assert.rejects(h.service.removeMember('owner','g','member',true),/audit/);assert.equal(h.state().member.status,'JOINED');assert.equal(h.state().carts.length,2);
});
function reportsHarness(status='OPEN') {
  let state={report:{id:'r',status,vendorNotice:'Please address the delayed order',category:'Delay',reporterUserId:'private',description:'private evidence'},responses:[],audits:[],history:[]};let fail=false;
  const tx={$queryRaw:async()=>[],vendor:{findUnique:async({where})=>({id:where.ownerUserId==='other'?'other-vendor':'v'})},report:{
    findUnique:async()=>state.report,
    findFirst:async({where,select})=>{if(where.id!=='r'||!state.report.vendorNotice||where.AND[0].OR[0].reportedVendorId!=='v')return null;return select?Object.fromEntries(Object.keys(select).map(k=>[k,k==='vendorResponses'?state.responses:state.report[k]])):state.report;},
    update:async({data})=>Object.assign(state.report,data),
  },reportVendorResponse:{create:async({data})=>{if(state.responses.some(r=>r.kind===data.kind))throw unique();const row={id:'response',status:'PENDING',...data};state.responses.push(row);return row;},
    findFirst:async()=>state.responses[0],update:async({data})=>Object.assign(state.responses[0],data)},
    reportStatusHistory:{create:async({data})=>state.history.push(data)},auditRecord:{create:async({data})=>{if(fail)throw Error('audit');state.audits.push(data);}}};
  const prisma={...tx,$transaction:async work=>{const old=structuredClone(state);try{return await work(tx);}catch(e){state=old;throw e;}}};
  return {service:new VendorReportsService(prisma),state:()=>state,fail:()=>{fail=true;},tx};
}
test('vendor view includes notice but excludes reporter identity, original evidence and attachments',async()=>{
  const h=reportsHarness();const detail=await h.service.detail('vendor','r');assert.equal(detail.vendorNotice,h.state().report.vendorNotice);
  assert(!('reporterUserId' in detail));assert(!('description' in detail));assert(!('attachmentPath' in detail));
  await reject(h.service.detail('vendor','unrelated'),404);await reject(h.service.detail('other','r'),404);
  await reject(h.service.respond('other','r',{kind:'RESPONSE',body:'unrelated'}),404);
});
test('vendor responds once to published open report; cannot resolve it or appeal an open case',async()=>{
  const h=reportsHarness();await h.service.respond('vendor','r',{kind:'RESPONSE',body:'We contacted the buyer'});
  assert.equal(h.state().report.status,'OPEN');await reject(h.service.respond('vendor','r',{kind:'RESPONSE',body:'again'}),409);
  await reject(h.service.respond('vendor','r',{kind:'APPEAL',body:'appeal'}),409);
});
test('admin accepts appeal by reopening report with history and audit; repeated review fails',async()=>{
  const h=reportsHarness('RESOLVED');await h.service.respond('vendor','r',{kind:'APPEAL',body:'Please review our explanation'});
  await h.service.review('admin','r','response',{decision:'ACCEPTED',note:'Review the additional facts'});
  assert.equal(h.state().report.status,'IN_REVIEW');assert.equal(h.state().history.length,1);assert.equal(h.state().responses[0].status,'ACCEPTED');
  await reject(h.service.review('admin','r','response',{decision:'ACCEPTED',note:'again'}),409);
});
test('report response audit failure rolls back response and appeal decision',async()=>{
  const h=reportsHarness();h.fail();await assert.rejects(h.service.respond('vendor','r',{kind:'RESPONSE',body:'answer'}),/audit/);assert.equal(h.state().responses.length,0);
  const appeal=reportsHarness('RESOLVED');await appeal.service.respond('vendor','r',{kind:'APPEAL',body:'appeal'});appeal.fail();
  await assert.rejects(appeal.service.review('admin','r','response',{decision:'ACCEPTED',note:'review'}),/audit/);assert.equal(appeal.state().report.status,'RESOLVED');assert.equal(appeal.state().responses[0].status,'PENDING');
});
test('role guards protect settings and admin report review while separating vendor response routes',()=>{
  const {FeaturedListingsController}=require('../dist/featured-listings/featured-listings.controller');
  const {ReportsController}=require('../dist/reports/reports.controller');
  for(const method of ['settings','updateSettings','allPlans','createPlan','updatePlan'])assert.deepEqual(Reflect.getMetadata('roles',FeaturedListingsController.prototype[method]),['ADMIN']);
  for(const method of ['quote','create'])assert.deepEqual(Reflect.getMetadata('roles',FeaturedListingsController.prototype[method]),['VENDOR_OWNER']);
  for(const method of ['publishVendorNotice','reviewVendorResponse'])assert.deepEqual(Reflect.getMetadata('roles',ReportsController.prototype[method]),['ADMIN']);
  for(const method of ['vendorMine','vendorDetail','vendorRespond'])assert.deepEqual(Reflect.getMetadata('roles',ReportsController.prototype[method]),['VENDOR_OWNER']);
});

test('confirmed cancelled unpaid reservation frees slot, but uncertain checkout keeps it reserved',async()=>{
  const h=featuredHarness();await h.service.create('v1',{planId:'month'},'pending');h.state().listings[0].createdAt=new Date(Date.now()-3600000);
  await h.service.expireListings();assert.equal(h.state().claims.length,0);assert.equal(h.state().listings[0].status,'CANCELLED');
  assert.equal((await h.service.quote('v2',intent)).introductoryRank,1);
  const uncertain=featuredHarness();uncertain.failCheckout();await assert.rejects(uncertain.service.create('v1',{planId:'month'},'uncertain'));
  await uncertain.service.expireListings();assert.equal(uncertain.state().claims.length,1);assert.equal(uncertain.state().listings[0].status,'PENDING');
});
test('a product spotlight purchase cannot consume a pending marketplace introductory claim',async()=>{
  const h=featuredHarness();h.fund('v1',1000);await h.service.create('v1',{planId:'month'},'home-pending');
  await h.service.create('v1',{planId:'spot',productId:'product',paymentMethod:'WALLET'},'spot');
  assert.equal(h.state().claims[0].consumedAt,null);
});
test('settings audit failure rolls back plan prices, configuration version and percentages',async()=>{
  const h=featuredHarness();h.failAudit(true);
  await assert.rejects(h.service.updateSettings({monthlyPrice:200,firstVendorDiscount:50,secondVendorDiscount:30,thirdVendorDiscount:20,discountOnRenewals:false,version:1},'admin'),/audit failure/);
  assert.equal(h.state().settings.version,1);assert.equal(h.state().settings.monthlyPrice,'100');assert.equal(h.state().plans[0].price,'100');
});
test('two different wallet placements cannot overdraw one vendor',async()=>{
  const h=featuredHarness();h.fund('v1',150);
  const rows=await Promise.allSettled([h.service.create('v1',intent,'home'),h.service.create('v1',{planId:'spot',productId:'product',paymentMethod:'WALLET'},'spot')]);
  assert.equal(rows.filter(row=>row.status==='fulfilled').length,1);
  assert.equal(rows.find(row=>row.status==='rejected').reason.getStatus(),409);
  assert((await h.prisma.vendorLedgerEntry.aggregate({where:{vendorId:'v1'}}))._sum.amount.greaterThanOrEqualTo(0));
});
test('Pasabuy outside radius requires confirmation; valid confirmation persists authoritative coordinates and distance',async()=>{
  process.env.PASABUY_CAMPUS_BOUNDS=bounds;let requests=[],audits=[],marked=false;
  const order={id:'order',customerId:'buyer',status:'PAID',orderType:'INDIVIDUAL',isPreorder:false,totalAmount:D(10),items:[{quantity:1,product:{name:'Food'}}],vendor:{pickupLocation:'stall',pickupLatitude:0,pickupLongitude:0}};
  const tx={order:{findFirst:async()=>order,update:async()=>{marked=true;}},pasabuyRequest:{findMany:async()=>[],findFirst:async()=>null,create:async({data})=>{const row={id:'request',...data};requests.push(row);return row;}},
    auditRecord:{create:async({data})=>{audits.push(data);}}};
  const prisma={$transaction:work=>work(tx)};
  const service=new PasabuyCreationService(prisma,{emitPasabuyStatusUpdated:async()=>{}},{calculatePasabuyFee:()=>({amount:D(30),feeTier:'IN_CAMPUS',ruleVersion:'test'})});
  const dto={orderId:'order',dropoffLatitude:0.003,dropoffLongitude:0,termsAccepted:true};
  await reject(service.create('buyer',dto),400);assert.equal(requests.length,0);assert.equal(marked,false);
  const request=await service.create('buyer',{...dto,outsideRadiusConfirmed:true});
  assert(request.deliveryDistanceMeters>270);assert.equal(request.dropoffLocation,'0.003000, 0.000000');assert.equal(request.dropoffLatitude,0.003);assert.equal(request.convenienceFee.toFixed(2),'30.00');
  assert.equal(audits.find(a=>a.actionType==='PASABUY_CREATED').afterState.outsideRadiusConfirmed,true);
});
test('HTTP routes enforce authentication, admin settings validation and vendor report privacy',async()=>{
  const { Module, ValidationPipe } = require('@nestjs/common');
  const { NestFactory } = require('@nestjs/core');
  const { JwtAuthGuard } = require('../dist/auth/jwt-auth.guard');
  const { RolesGuard } = require('../dist/auth/roles.guard');
  const { FeaturedListingsController } = require('../dist/featured-listings/featured-listings.controller');
  const { ReportsController } = require('../dist/reports/reports.controller');
  const { ReportsService } = require('../dist/reports/reports.service');
  const { HttpExceptionFilter } = require('../dist/common/filters/http-exception.filter');
  const { JwtStrategy } = require('../dist/auth/jwt.strategy');
  const jwt=require('jsonwebtoken');
  const secret='qa136-http-test-secret';process.env.JWT_SECRET=secret;
  const identities={ADMIN:['admin','ADMIN'],BUYER:['buyer','BUYER'],VENDOR_OWNER:['vendor','VENDOR_OWNER'],other:['other','VENDOR_OWNER']};
  new JwtStrategy({user:{findUnique:async({where})=>{
    const identity=Object.values(identities).find(([id])=>id===where.id);
    return identity?{id:identity[0],email:'qa@example.invalid',isActive:true,archivedAt:null,roleAssignments:[{role:identity[1]}]}:null;
  }}});
  const f=featuredHarness(), r=reportsHarness();
  const id='00000000-0000-4000-8000-000000000001';f.state().plans[0].id=id;
  class TestModule {}
  Module({controllers:[FeaturedListingsController,ReportsController],providers:[
    {provide:FeaturedListingsService,useValue:f.service},{provide:ReportsService,useValue:{}},
    {provide:VendorReportsService,useValue:{detail:(user,reportId)=>r.service.detail(user,reportId===id?'r':reportId)}},
    JwtAuthGuard,RolesGuard,
  ]})(TestModule);
  const app=await NestFactory.create(TestModule,{logger:false});
  app.setGlobalPrefix('api/v1');app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));app.useGlobalFilters(new HttpExceptionFilter());
  try {
    await app.listen(0,'127.0.0.1');const url=`http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
    const call=(path,role,body)=>fetch(url+path,{method:body?'PATCH':'GET',headers:{...(role?{Authorization:'Bearer '+jwt.sign({sub:identities[role][0],roles:['ADMIN']},secret,{expiresIn:'5m'})}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    assert.equal((await call('/featured-listings/settings')).status,401);
    assert.equal((await fetch(url+'/featured-listings/settings',{headers:{Authorization:'Bearer invalid'}})).status,401);
    assert.equal((await call('/featured-listings/settings','BUYER')).status,403);
    assert.equal((await call('/featured-listings/settings','ADMIN')).status,200);
    assert.equal((await call('/featured-listings/settings','ADMIN',{monthlyPrice:-1})).status,400);
    assert.equal((await call('/reports/vendor/'+id,'BUYER')).status,403);
    assert.equal((await call('/reports/vendor/'+id,'other')).status,404);
    const report=await (await call('/reports/vendor/'+id,'VENDOR_OWNER')).json();assert.equal(report.vendorNotice,'Please address the delayed order');assert(!('reporterUserId' in report));assert(!('description' in report));
    assert.equal((await call('/reports/vendor/bad-id','VENDOR_OWNER')).status,400);
  } finally {await app.close();}
});

test('optional admin plan fields and confirmed amount reject null instead of failing inside Prisma',async()=>{
  assert((await validate(plainToInstance(UpdateFeaturedPlanDto,{price:null,isActive:null}))).length >= 2);
  assert((await validate(plainToInstance(CreateFeaturedListingDto,{planId:'00000000-0000-4000-8000-000000000001',expectedAmount:null}))).length);
  const h=featuredHarness();await reject(h.service.updatePlan('month',{},'admin'),400);
});
