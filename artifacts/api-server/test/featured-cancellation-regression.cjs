const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { FeaturedListingsService } = require('../dist/featured-listings/featured-listings.service');
const { FeaturedListingsController } = require('../dist/featured-listings/featured-listings.controller');
function harness(status='PENDING', options={}) {
  let state={status,audits:[],claim:true}; const calls=[];
  const tx={
    $queryRaw:async()=>{calls.push('lock');},
    featuredListing:{
      findFirst:async({where})=>where.id==='listing'&&where.vendorId==='vendor'?{id:'listing',vendorId:'vendor',status:state.status,payments:[{provider:'PAYMONGO',providerPaymentId:'cs_test',checkoutUrl:options.creating?'CREATING':'https://checkout.example'}]}:null,
      updateMany:async({where,data})=>{if(state.status!==where.status)return{count:0};state.status=data.status;return{count:1};},
      count:async()=>options.remaining?1:0,
    },
    featuredIntroClaim:{deleteMany:async({where})=>{assert.equal(where.consumedAt,null);state.claim=false;}},
    auditRecord:{create:async({data})=>{if(options.auditFailure)throw Error('audit failed');state.audits.push(data);}},
  };
  const prisma={vendor:{findUnique:async()=>({id:'vendor',status:'SUSPENDED'})},$transaction:async work=>{
    const old=structuredClone(state);try{return await work(tx);}catch(e){state=old;throw e;}
  }};
  const provider={expireCheckoutSession:async()=>{calls.push('expire');assert.equal(state.status,'CANCELLED');if(options.providerFailure)throw Error('outage');return !options.alreadyPaid;}};
  return {service:new FeaturedListingsService(prisma,provider),state:()=>state,calls};
}
test('pending cancellation audits once; replay creates no additional audit',async()=>{
  const h=harness();assert.deepEqual(await h.service.cancel('owner','listing'),{listingId:'listing',status:'CANCELLED',idempotentReplay:false,automaticRefund:false});
  assert.equal(h.state().claim,false);assert.equal(h.state().audits[0].actorUserId,'owner');assert.deepEqual(h.calls,['lock','expire']);
  assert.equal((await h.service.cancel('owner','listing')).idempotentReplay,true);assert.equal(h.state().audits.length,1);
});
test('active cancellation does not mutate payment or wallet and preserves other live claims',async()=>{
  const h=harness('ACTIVE',{remaining:true});await h.service.cancel('owner','listing');
  assert.equal(h.state().status,'CANCELLED');assert.equal(h.state().claim,true);assert.deepEqual(h.calls,['lock']);
  // No payment mutation, refund or wallet APIs exist in this harness: any such call fails.
});
test('foreign listing is hidden and expired listing cannot be cancelled',async()=>{
  const h=harness();await assert.rejects(h.service.cancel('owner','foreign'),e=>e.getStatus()===404);assert.equal(h.state().status,'PENDING');
  const expired=harness('EXPIRED');await assert.rejects(expired.service.cancel('owner','listing'),e=>e.getStatus()===409);
});
test('unresolved checkout creation blocks cancellation without releasing claim',async()=>{
  const h=harness('PENDING',{creating:true});await assert.rejects(h.service.cancel('owner','listing'),e=>e.getStatus()===409);
  assert.equal(h.state().status,'PENDING');assert.equal(h.state().claim,true);assert.equal(h.state().audits.length,0);
});
test('audit failure rolls back cancellation and claim release before provider call',async()=>{
  const h=harness('PENDING',{auditFailure:true});await assert.rejects(h.service.cancel('owner','listing'),/audit failed/);
  assert.equal(h.state().status,'PENDING');assert.equal(h.state().claim,true);assert.equal(h.state().audits.length,0);assert.deepEqual(h.calls,['lock']);
});
test('provider expiry failure or already-paid checkout preserves cancellation',async()=>{
  for(const options of [{providerFailure:true},{alreadyPaid:true}]){
    const h=harness('PENDING',options);await h.service.cancel('owner','listing');assert.equal(h.state().status,'CANCELLED');assert.equal(h.state().audits.length,1);
  }
});
test('cancellation route requires vendor role and UUID parsing',()=>{
  const fn=FeaturedListingsController.prototype.cancel;
  assert.equal(Reflect.getMetadata('path',fn),':id/cancel');assert.deepEqual(Reflect.getMetadata('roles',fn),['VENDOR_OWNER']);
  assert.equal(Reflect.getMetadata('__guards__',fn).length,2);
  const args=Reflect.getMetadata('__routeArguments__',FeaturedListingsController,'cancel');
  assert(Object.values(args).some(arg=>arg.data==='id'&&arg.pipes.some(pipe=>pipe.name==='ParseUUIDPipe')));
});
