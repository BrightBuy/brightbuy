import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertCart, assertDestination, assertDeliveryDays } from '../src/services/checkout-dependencies.js';
import { paymentDecision, collectCod, cancelPayment } from '../src/services/payments.js';
import { presentOrder } from '../src/services/order-presenter.js';
import { attemptPolicy } from '../../client/src/utils/attempt-policy.js';

const destination={addressId:1,storeId:null,isMainCity:true,
  snapshot:{recipient:'A',line1:'Road',cityId:1,city:'Main',country:'US',isMainCity:true}};
const input={fulfillment:'delivery',addressId:1,storeId:null};
test('malformed cart adapter data fails explicitly',()=>{
  for(const cart of [null,{version:'3',items:[]},{version:3,items:null},{version:4294967296,items:[]}]) {
    assert.throws(()=>assertCart(cart),{code:'CHECKOUT_DATA_INVALID'});
  }
  assert.doesNotThrow(()=>assertCart({version:0,items:[]}));
});
test('destination validates selected ID, exclusivity, classification and snapshot',()=>{
  assert.doesNotThrow(()=>assertDestination(destination,input));
  for(const bad of [{...destination,addressId:2},{...destination,storeId:1},
    {...destination,isMainCity:1},{...destination,snapshot:{...destination.snapshot,country:'LK'}},
    {...destination,snapshot:{...destination.snapshot,isMainCity:false}}]) {
    assert.throws(()=>assertDestination(bad,input),{code:'CHECKOUT_DATA_INVALID'});
  }
});
test('estimate checks exact case, not just membership in 5/7/8/10',()=>{
  for(const main of [true,false])for(const shortage of [true,false]) {
    assert.doesNotThrow(()=>assertDeliveryDays((main?5:7)+(shortage?3:0),main,shortage));
  }
  assert.throws(()=>assertDeliveryDays(10,true,false),{code:'CHECKOUT_DATA_INVALID'});
});
test('unsupported payment method cannot borrow an approval token',()=>{
  assert.throws(()=>paymentDecision({paymentMethod:'bank',simulationToken:'demo-approved'}),{code:'VALIDATION_ERROR'});
});
for(const code of ['NETWORK_ERROR','INVALID_RESPONSE','TRANSACTION_OUTCOME_UNKNOWN','TRANSACTION_RETRY']) {
  test(`${code} retains identical attempt for retry`,()=>assert.equal(attemptPolicy({code}),'retry'));
}
for(const code of ['IDEMPOTENCY_CONFLICT','UNAUTHENTICATED','FORBIDDEN','CHECKOUT_DATA_INVALID']) {
  test(`${code} requires resolution rather than a fresh key`,()=>assert.equal(attemptPolicy({code}),'resolve'));
}
test('decline/stale cart permit explicit new reviewed attempt',()=>{
  for(const code of ['PAYMENT_DECLINED','CART_CHANGED']) assert.equal(attemptPolicy({code}),'review');
});
function fixture(overrides={}) {
  const order={id:1,customerId:1,status:'confirmed',fulfillment:'delivery',addressSnapshot:{city:'Main'},
    currency:'USD',total:'10.00',createdAt:new Date('2026-09-29T12:00:00Z'),stockState:'allocated',wasOutOfStock:0,
    ...overrides.order};
  const payment={id:1,method:'cod',status:'pending',amount:'10.00',currency:'USD',reference:null,paidAt:null,refundedAt:null,
    ...overrides.payment};
  const delivery={mode:'delivery',destinationSnapshot:{city:'Main'},estimatedDate:'2026-10-04',actualDate:null,
    ...overrides.delivery};
  const rows={order,payment,delivery,items:[{id:1,variantId:1,productName:'P',variantName:'V',quantity:1,unitPrice:'10.00'}],
    events:[{fromStatus:null,toStatus:'confirmed',createdAt:new Date('2026-09-29T12:00:00Z')}],project:[{order_id:1}],...overrides};
  rows.order=order;rows.payment=payment;rows.delivery=delivery;
  const connection={async execute(sql){
    if(sql.includes('FROM checkout_requests'))return [rows.project];
    if(sql.includes('FROM order_items'))return [rows.items];
    if(sql.includes('FROM payments'))return [rows.payment?[rows.payment]:[]];
    if(sql.includes('FROM deliveries'))return [rows.delivery?[rows.delivery]:[]];
    if(sql.includes('FROM order_status_history'))return [rows.events];
    if(sql.includes('FROM orders'))return [[rows.order]];
    throw new Error(`Unexpected query: ${sql}`);
  }};
  return {connection,rows};
}
test('valid presenter preserves money, dates and public fields',async()=>{
  const {connection}=fixture();const order=await presentOrder(connection,1);
  assert.equal(order.total,'10.00');assert.equal(order.delivery.estimatedDate,'2026-10-04');
  assert.equal(order.isLegacy,false);assert.equal(order.wasOutOfStock,false);
  assert.equal(order.requestKey,undefined);assert.equal(order.payment.refundRequestKey,undefined);
});
test('missing request metadata on a project order is corruption, not legacy',async()=>{
  const {connection}=fixture({project:[]});
  await assert.rejects(presentOrder(connection,1),{code:'ORDER_DATA_INCOMPLETE'});
});
test('genuine legacy order retains currency and has no actions',async()=>{
  const {connection}=fixture({project:[],order:{stockState:null,wasOutOfStock:null,currency:'LKR'}});
  const order=await presentOrder(connection,1);assert.equal(order.isLegacy,true);
  assert.equal(order.currency,'LKR');assert.deepEqual(order.nextStatuses,[]);assert.equal(order.payment,null);
});
for(const [label,override] of [
  ['item total',{order:{total:'11.00'}}],['payment amount',{payment:{amount:'11.00'}}],
  ['payment currency',{payment:{currency:'LKR'}}],['delivery mode',{delivery:{mode:'pickup'}}],
  ['stock state',{order:{stockState:'none'}}],['premature COD payment',{payment:{status:'paid'}}],
  ['missing history',{events:[]}],['empty items',{items:[]}],
  ['premature actual date',{delivery:{actualDate:'2026-10-04'}}],
])test(`presenter rejects inconsistent ${label}`,async()=>{
  const {connection}=fixture(override);await assert.rejects(presentOrder(connection,1),{code:'ORDER_DATA_INCOMPLETE'});
});
test('COD helper rejects wrong fulfilment/status pair before querying',async()=>{
  await assert.rejects(collectCod({execute(){throw new Error('must not query');}},
    {id:1,fulfillment:'pickup',status:'shipped',stockState:'allocated',currency:'USD'},3,'key'),
    {code:'PAYMENT_STATE_CONFLICT'});
});
test('refund keeps original amount and paid timestamp',async()=>{
  const writes=[];const connection={async execute(sql,params){
    if(sql.startsWith('SELECT')) return [[{id:1,method:'card',status:'paid',amount:'10.00',currency:'USD'}]];
    writes.push({sql,params});return [{affectedRows:1}];
  }};
  await cancelPayment(connection,{id:1,total:'10.00',currency:'USD'},1,'key');
  assert.match(writes[0].sql,/status='refunded'/);
  assert.doesNotMatch(writes[0].sql,/\bamount\s*=|\bpaid_at\s*=/);
});
