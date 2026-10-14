import {test} from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import {buildOrderEmail} from '../src/services/order-email.js';

const order = {
  id:42,status:'confirmed',currency:'USD',fulfillment:'delivery',total:'95.00',
  items:[{productName:'Aura NC700',variantName:'Black',quantity:2,unitPrice:'40.00'},
    {productName:'Explorer Robot Kit',variantName:'Standard',quantity:1,unitPrice:'15.00'}],
  payment:{method:'cod',status:'pending'},
  delivery:{estimatedDate:'2026-10-21',destinationSnapshot:{recipient:'Sample Customer',line1:'12 Sample Lane',city:'Houston',postalCode:'77001',country:'US'}},
};
test('order email escapes customer content and formats exact totals',()=>{
  const message=buildOrderEmail({customerName:'<img onerror="bad">',order:{...order,items:[{...order.items[0],productName:'<script>bad</script>',unitPrice:'0.10',quantity:3}]},appUrl:'https://brightbuy.example'});
  assert.ok(!message.html.includes('<script>bad'));
  assert.ok(message.html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(message.html.includes('&lt;img onerror='));
  assert.ok(message.html.includes('$0.30'));
  assert.ok(message.text.includes('Order total: $95.00 USD'));
  assert.ok(message.html.includes('https://brightbuy.example/account/orders/42'));
  assert.ok(message.html.includes('not proof of payment'));
});
test('backorders and pickup do not falsely promise confirmation, allocation or delivery',()=>{
  const message=buildOrderEmail({order:{...order,status:'backordered',fulfillment:'pickup',payment:{method:'card',status:'paid'},delivery:{destinationSnapshot:{storeName:'BrightBuy Dallas',addressLine:'100 Example Avenue',city:'Dallas',country:'US'}}},appUrl:'javascript:alert(1)'});
  assert.match(message.subject,/backordered/);
  assert.ok(!message.subject.includes('confirmed'));
  assert.ok(message.html.includes('No stock has been allocated'));
  assert.ok(message.html.includes('Ready for pickup'));
  assert.ok(!message.html.includes('Estimated delivery:'));
  assert.ok(!message.html.includes('javascript:'));
  assert.ok(message.text.includes('No real card was charged'));
});
test('email MIME contains HTML, plain text and an inline PNG without sending mail',async()=>{
  const message=buildOrderEmail({order,appUrl:''});
  assert.equal(message.attachments[0].content.subarray(1,4).toString(),'PNG');
  const transport=nodemailer.createTransport({streamTransport:true,buffer:true});
  const result=await transport.sendMail({from:'BrightBuy <sender@example.test>',to:'recipient@example.test',...message});
  const mime=result.message.toString();
  assert.match(mime,/multipart\/alternative/);
  assert.match(mime,/Content-Type: text\/plain/);
  assert.match(mime,/Content-Type: text\/html/);
  assert.match(mime,/Content-ID: <brightbuy-logo@brightbuy>/);
  assert.match(mime,/Content-Type: image\/png/);
});
