import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guestCart, addGuestItem } from '../src/utils/guest-cart.js';
import { toCsv } from '../src/utils/csv.js';
const storage = () => { const map = new Map(); return { getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k) }; };
test('guest cart adds quantities and uses refreshed public prices', async () => {
 const store=storage(); addGuestItem({id:1},{id:2},2,store); addGuestItem({id:1},{id:2},1,store);
 const cart=await guestCart(store).load(async()=>({name:'Gadget',currency:'USD',variants:[{id:2,name:'Blue',price:'12.34',stock:2}]}));
 assert.equal(cart.total,'37.02'); assert.equal(cart.items[0].quantity,3); assert.equal(cart.hasShortage,true);
 assert.throws(()=>addGuestItem({id:1},{id:2},99,store));
});
test('uncertain guest merge retains its key and account and blocks edits until resolved', async () => {
 const store=storage(); addGuestItem({id:1},{id:2},1,store); const cart=guestCart(store); let original;
 await assert.rejects(cart.merge(async(path,options)=>{original=JSON.parse(options.body);throw Error('Disconnected');},3));
 assert.throws(()=>cart.set({id:1},{id:2},2));
 await assert.rejects(cart.merge(async()=>{},4),/account/);
 await cart.merge(async(path,options)=>{assert.deepEqual(JSON.parse(options.body),original);return {};},3);
 assert.deepEqual(cart.read().items,[]);
});
test('CSV quotes delimiters and neutralizes spreadsheet formulas',()=>{
 assert.equal(toCsv([["=1+1","a,b",'a"b']]), `\ufeff"'=1+1","a,b","a""b"`);
});
