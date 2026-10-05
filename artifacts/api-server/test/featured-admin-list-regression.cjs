const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { FeaturedListingsService } = require('../dist/featured-listings/featured-listings.service');
const { ListAdminFeaturedListingsDto } = require('../dist/featured-listings/dto/featured-listing.dto');
const vendorId = '00000000-0000-4000-8000-000000000001';
const planId = '00000000-0000-4000-8000-000000000002';
function harness() {
  const calls = [];
  const prisma = {
    featuredListing: {
      findMany: args => { calls.push(['list', args]); return Promise.resolve([]); },
      count: args => { calls.push(['count', args]); return Promise.resolve(0); },
    },
    $transaction: async (queries, options) => { calls.push(['transaction', options]); return Promise.all(queries); },
  };
  return { calls, service: new FeaturedListingsService(prisma, {}) };
}
test('admin list includes every lifecycle state by default and excludes payment secrets', async () => {
  const h = harness();
  assert.deepEqual(await h.service.adminListings(new ListAdminFeaturedListingsDto()), {items:[],total:0,page:1,limit:20});
  const query = h.calls[0][1];
  assert.deepEqual(query.where, {}); assert.equal(query.take,20);assert.equal(query.skip,0);
  assert.deepEqual(query.orderBy,[{createdAt:'desc'},{id:'desc'}]);
  assert.deepEqual(Object.keys(query.select.payments.select).sort(),['amount','createdAt','currency','id','provider','status']);
  assert(!query.select.purchaseKey && !query.select.purchaseFingerprint);
  assert(!query.select.vendor.select.ownerUserId);
  assert(query.select.durationMonthsSnapshot && query.select.pricePaid);
  assert.deepEqual(h.calls[1][1].where,query.where);
  assert.equal(h.calls[2][1].isolationLevel,'RepeatableRead');
});
test('filters apply equally to rows and total; huge page offsets fail before database access',async()=>{
  const h=harness();
  const query=plainToInstance(ListAdminFeaturedListingsDto,{page:'3',limit:'10',vendorId,planId,status:'PENDING',placement:'MARKETPLACE_HOME'});
  assert.equal((await validate(query)).length,0);
  await h.service.adminListings(query);
  assert.equal(h.calls[0][1].skip,20);assert.equal(h.calls[0][1].take,10);
  assert.deepEqual(h.calls[0][1].where,{vendorId,planId,status:'PENDING',placement:'MARKETPLACE_HOME'});
  assert.deepEqual(h.calls[1][1].where,h.calls[0][1].where);
  const overflow=harness();
  await assert.rejects(overflow.service.adminListings({page:Number.MAX_SAFE_INTEGER,limit:100}),e=>e.getStatus()===400);
  assert.equal(overflow.calls.length,0);
});
test('invalid filters, nulls, fractional or excessive pagination are rejected',async()=>{
  for(const invalid of [{page:0},{page:1.5},{limit:101},{limit:0},{status:'PAID'},{placement:'BAD'},{vendorId:'bad'},{planId:'bad'},{vendorId:null},{status:null},{page:null}]) {
    assert((await validate(plainToInstance(ListAdminFeaturedListingsDto,invalid))).length,JSON.stringify(invalid));
  }
});
test('HTTP admin list blocks unauthenticated, buyer and vendor access and validates admin queries',async()=>{
  const {Module,ValidationPipe}=require('@nestjs/common');
  const {NestFactory}=require('@nestjs/core');
  const {JwtAuthGuard}=require('../dist/auth/jwt-auth.guard');
  const {RolesGuard}=require('../dist/auth/roles.guard');
  const {FeaturedListingsController}=require('../dist/featured-listings/featured-listings.controller');
  const {HttpExceptionFilter}=require('../dist/common/filters/http-exception.filter');
  const {JwtStrategy}=require('../dist/auth/jwt.strategy');
  const jwt=require('jsonwebtoken');
  const secret='qa136-admin-list-test-secret';process.env.JWT_SECRET=secret;
  new JwtStrategy({user:{findUnique:async({where})=>({id:where.id,email:'qa@example.invalid',isActive:true,archivedAt:null,roleAssignments:[{role:where.id}]})}});
  const h=harness();
  class TestModule {}
  Module({controllers:[FeaturedListingsController],providers:[{provide:FeaturedListingsService,useValue:h.service},JwtAuthGuard,RolesGuard]})(TestModule);
  const app=await NestFactory.create(TestModule,{logger:false});
  app.setGlobalPrefix('api/v1');app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));app.useGlobalFilters(new HttpExceptionFilter());
  try {
    await app.listen(0,'127.0.0.1');const url=`http://127.0.0.1:${app.getHttpServer().address().port}/api/v1/featured-listings/all`;
    const call=(role,query='')=>fetch(url+query,{headers:role?{Authorization:'Bearer '+jwt.sign({sub:role,roles:['ADMIN']},secret,{expiresIn:'5m'})}:{}});
    assert.equal((await call()).status,401);
    assert.equal((await call('BUYER')).status,403);
    assert.equal((await call('VENDOR_OWNER')).status,403);
    assert.equal(h.calls.length,0);
    for(const query of ['?page=0','?limit=101','?status=BAD','?vendorId=bad','?unknown=yes']) assert.equal((await call('ADMIN',query)).status,400);
    assert.equal(h.calls.length,0);
    const response=await call('ADMIN','?page=2&limit=5&status=PENDING');
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{items:[],total:0,page:2,limit:5});assert.equal(h.calls[0][1].skip,5);
  }finally{await app.close();}
});
