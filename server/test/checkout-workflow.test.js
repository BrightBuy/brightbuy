import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCheckout } from '../src/services/checkout.js';
import { validateCheckout, checkoutFingerprint } from '../src/utils/checkout-input.js';
import { inTransaction } from '../src/utils/transaction.js';
import { postAttempt } from '../../client/src/utils/post-attempt.js';
import { attemptPolicy } from '../../client/src/utils/attempt-policy.js';

const actor={id:1,role:'customer'};
const input={fulfillment:'delivery',addressId:1,paymentMethod:'cod',cartVersion:3,
  requestKey:'11111111-1111-4111-8111-111111111111'};
// A strict query double for service control flow, NOT an SQL engine.
// It proves replay precedence / auditing / transaction decisions; use MySQL for SQL semantics.
function environment({previous=null,version=3,items=[{variantId:1,quantity:1}],
  role='customer',estimate=5,failAudit=false}={}) {
  const calls=[];
  const connection={
    async query(){},
    async beginTransaction(){calls.push('begin');},
    async commit(){calls.push('commit');},
    async rollback(){calls.push('rollback');},
    release(){calls.push('release');},destroy(){calls.push('destroy');},
    async execute(sql,params){
      if(sql.includes('FROM customers')) return [[{id:1,role}]];
      if(sql.includes('FROM checkout_requests') && sql.includes('request_key')) return [previous?[previous]:[]];
      if(sql.includes('SELECT product_id AS productId FROM variants'))return [[{productId:1}]];
      if(sql.includes('FROM products'))return [[{id:1,name:'P',currency:'USD',isActive:1,isLegacy:0}]];
      if(sql.includes('FROM variants'))return [[{id:1,productId:1,name:'V',price:'10.00',stock:5,isActive:1}]];
      if(sql.includes('FROM product_categories'))return [[{id:1}]];
      if(sql.includes('INSERT INTO checkout_requests')){
        calls.push('audit');
        if(failAudit)throw new Error('Audit failed');
        assert.match(sql,/'declined',NULL/);return [{affectedRows:1}];
      }
      // Historical replay data for the actual presenter.
      if(sql.includes('FROM orders'))return [[{id:7,customerId:1,status:'confirmed',fulfillment:'delivery',
        addressSnapshot:{city:'Main'},currency:'USD',total:'10.00',createdAt:new Date('2026-09-29T12:00:00Z'),
        stockState:'allocated',wasOutOfStock:0}]];
      if(sql.includes('FROM checkout_requests'))return [[{order_id:7}]];
      if(sql.includes('FROM order_items'))return [[{id:1,variantId:1,quantity:1,unitPrice:'10.00',productName:'P',variantName:'V'}]];
      if(sql.includes('FROM payments'))return [[{id:1,method:'cod',status:'pending',amount:'10.00',currency:'USD',reference:null,paidAt:null,refundedAt:null}]];
      if(sql.includes('FROM deliveries'))return [[{mode:'delivery',destinationSnapshot:{city:'Main'},estimatedDate:'2026-10-04',actualDate:null}]];
      if(sql.includes('FROM order_status_history'))return [[{fromStatus:null,toStatus:'confirmed',createdAt:new Date('2026-09-29T12:00:00Z')}]];
      throw new Error(`Unexpected SQL in service test: ${sql}`);
    },
  };
  const pool={async getConnection(){return connection;}};
  const dependencies={
    async readCart(c,id){assert.equal(c,connection);assert.equal(id,1);calls.push('cart');return {version,items};},
    async getDestination(c){assert.equal(c,connection);calls.push('destination');return {
      addressId:1,storeId:null,isMainCity:true,
      snapshot:{cityId:1,city:'Main',country:'US',isMainCity:true,recipient:'A',line1:'Road'},
    };},
    async deliveryDays(){return estimate;},
    async applyStockChange(){throw new Error('Unexpected stock change in replay/decline test');},
  };
  return {pool,calls,checkout:makeCheckout(dependencies)};
}
test('successful replay precedes stale/empty cart access',async()=>{
  const previous={fingerprint:checkoutFingerprint(validateCheckout(input)),paymentResult:'not_required',orderId:7};
  const {pool,calls,checkout}=environment({previous,version:4,items:[]});
  const result=await checkout(pool,actor,input);
  assert.equal(result.status,200);assert.equal(result.data.id,7);
  assert.deepEqual(calls,['begin','commit','release']);
});
test('declined replay is committed cleanly without looking at current cart',async()=>{
  const body={...input,paymentMethod:'card',simulationToken:'demo-declined'};
  const previous={fingerprint:checkoutFingerprint(validateCheckout(body)),paymentResult:'declined',orderId:null};
  const {pool,calls,checkout}=environment({previous,items:[]});
  await assert.rejects(checkout(pool,actor,body),{code:'PAYMENT_DECLINED'});
  assert.deepEqual(calls,['begin','commit','release']);
});
test('changed payload with a reused key rolls back before cart access',async()=>{
  const {pool,calls,checkout}=environment({previous:{fingerprint:'different',paymentResult:'not_required',orderId:7}});
  await assert.rejects(checkout(pool,actor,input),{code:'IDEMPOTENCY_CONFLICT'});
  assert.deepEqual(calls,['begin','rollback','release']);
});
test('new decline commits its audit before exposing PAYMENT_DECLINED',async()=>{
  const {pool,calls,checkout}=environment();
  await assert.rejects(checkout(pool,actor,{...input,paymentMethod:'card',simulationToken:'demo-declined'}),{code:'PAYMENT_DECLINED'});
  assert.deepEqual(calls,['begin','cart','destination','audit','commit','release']);
});
test('failed decline audit rolls back instead of reporting a persisted decline',async()=>{
  const {pool,calls,checkout}=environment({failAudit:true});
  await assert.rejects(checkout(pool,actor,{...input,paymentMethod:'card',simulationToken:'demo-declined'}),/Audit failed/);
  assert.deepEqual(calls,['begin','cart','destination','audit','rollback','release']);
});
test('stale cart fails before locking a destination',async()=>{
  const {pool,calls,checkout}=environment({version:4});
  await assert.rejects(checkout(pool,actor,input),{code:'CART_CHANGED'});
  assert.deepEqual(calls,['begin','cart','rollback','release']);
});
test('empty cart fails before destination and payment work',async()=>{
  const {pool,calls,checkout}=environment({items:[]});
  await assert.rejects(checkout(pool,actor,input),{code:'EMPTY_CART'});
  assert.deepEqual(calls,['begin','cart','rollback','release']);
});
test('checkout rechecks database role under the customer lock',async()=>{
  const {pool,calls,checkout}=environment({role:'admin'});
  await assert.rejects(checkout(pool,actor,input),{code:'FORBIDDEN'});
  assert.deepEqual(calls,['begin','rollback','release']);
});
test('lost begin acknowledgement destroys the session without running work',async()=>{
  const calls=[];const connection={async query(){},async beginTransaction(){calls.push('begin');throw new Error('Lost begin');},
    destroy(){calls.push('destroy');},release(){calls.push('release');}};
  await assert.rejects(inTransaction({async getConnection(){return connection;}},async()=>{calls.push('work');}),/Lost begin/);
  assert.deepEqual(calls,['begin','destroy']);
});
test('connection setup failure releases a session with no transaction started',async()=>{
  const calls=[];const connection={async query(){throw new Error('Setup failed');},release(){calls.push('release');}};
  await assert.rejects(inTransaction({async getConnection(){return connection;}},async()=>{}),/Setup failed/);
  assert.deepEqual(calls,['release']);
});
test('pool acquisition failure never invokes work',async()=>{
  let called=false;
  await assert.rejects(inTransaction({async getConnection(){throw new Error('Pool unavailable');}},async()=>{called=true;}),/Pool unavailable/);
  assert.equal(called,false);
});
test('HTTP deadline preserves the payload and is classified as same-key retry',async()=>{
  const payload=Object.freeze({...input});let sent;
  const api=async(path,options)=>{
    sent={path,...options};
    return new Promise((resolve,reject)=>{
      const abort=()=>reject(Object.assign(new Error('Aborted'),{name:'AbortError'}));
      if(options.signal.aborted)abort();else options.signal.addEventListener('abort',abort,{once:true});
    });
  };
  await assert.rejects(postAttempt(api,'/orders',payload,{timeoutMs:5}),(error)=>
    error.code==='REQUEST_TIMEOUT'&&attemptPolicy(error)==='retry');
  assert.deepEqual(JSON.parse(sent.body),input);assert.equal(sent.signal.aborted,true);
});
test('HTTP retries serialize the exact same frozen action',async()=>{
  const bodies=[];const payload=Object.freeze({...input});
  const api=async(path,options)=>{bodies.push(options.body);return {id:7};};
  await postAttempt(api,'/orders',payload);await postAttempt(api,'/orders',payload);
  assert.equal(bodies[0],bodies[1]);assert.equal(JSON.parse(bodies[1]).requestKey,input.requestKey);
});
test('definitive HTTP errors retain their original code',async()=>{
  const api=async()=>{throw Object.assign(new Error('Declined'),{code:'PAYMENT_DECLINED',status:402});};
  await assert.rejects(postAttempt(api,'/orders',input),{code:'PAYMENT_DECLINED',status:402});
});
