import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { accountLink, buildAccountEmail } from '../src/services/account-email.js';
import { makeAccountRecovery, tokenHash } from '../src/services/account-recovery.js';
import { createRecoveryRoutes } from '../src/routes/account-recovery.js';
import { errorHandler } from '../src/errors.js';
test('account emails use a trusted origin, fragment tokens, escaped names and embedded branding', () => {
  const link = accountLink('reset','a'.repeat(64),'https://shop.example/path');
  assert.equal(new URL(link).pathname,'/reset-password');
  assert.equal(new URL(link).search,'');
  assert.match(new URL(link).hash,/token=/);
  for (const url of ['http://evil.example','javascript:alert(1)','https://user:pass@shop.example']) assert.throws(()=>accountLink('verify','token',url));
  assert.match(accountLink('verify','token','http://localhost:5173'),/verify-email/);
  const email=buildAccountEmail({purpose:'reset',name:'<script>bad</script>',link});
  assert.ok(!email.html.includes('<script>'));
  assert.match(email.html,/cid:brightbuy-logo@brightbuy/);
  assert.match(email.text,/30 minutes/);
  assert.ok(email.attachments[0].content.length > 100);
  assert.notEqual(tokenHash('a'.repeat(64)),'a'.repeat(64));
});
test('malformed tokens and weak passwords fail before database access', async () => {
  const recovery=makeAccountRecovery({execute(){throw new Error('Unexpected query');}});
  for (const token of [null,'short','z'.repeat(64)]) await assert.rejects(recovery.consume(token,'verify'), {code:'INVALID_ACCOUNT_LINK'});
  for (const password of ['short','onlyletters','12345678']) await assert.rejects(recovery.consume('a'.repeat(64),'reset',password),{code:'VALIDATION_ERROR'});
});
test('request endpoint does not await account lookup and limits repeated requests', async t => {
  let calls=0;
  const app=express(); app.use(express.json());
  app.use(createRecoveryRoutes({request(){calls++;return new Promise(()=>{});}})); app.use(errorHandler);
  const server=app.listen(0); await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url='http://127.0.0.1:'+server.address().port+'/auth/forgot-password';
  for(let i=0;i<20;i++) {
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:i%2?'unknown@example.test':'known@example.test'})});
    assert.equal(response.status,202); assert.match((await response.json()).data.message,/If this account is eligible/);
  }
  const limited=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'known@example.test'})});
  assert.equal(limited.status,429); assert.equal(calls,20);
});
