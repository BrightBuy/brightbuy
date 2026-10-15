import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { accountLink, buildAccountEmail } from '../src/services/account-email.js';
import { makeAccountRecovery, tokenHash } from '../src/services/account-recovery.js';
import { createRecoveryRoutes } from '../src/routes/account-recovery.js';
import { errorHandler } from '../src/errors.js';
import { createAuthRoutes } from '../src/routes/auth.js';
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
test('request endpoint keeps generic responses and limits repeated requests', async t => {
  let calls=0;
  const app=express(); app.use(express.json());
  app.use(createRecoveryRoutes({async request(){calls++;}})); app.use(errorHandler);
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

for (const path of ['forgot-password', 'resend-verification']) {
  for (const fail of [false, true]) {
    test(`${path} waits for email ${fail ? 'failure' : 'completion'} before responding`, async t => {
      let finish;
      const pending = new Promise((resolve, reject) => {
        finish = () => fail ? reject(new Error('SMTP unavailable')) : resolve(true);
      });
      const router = createRecoveryRoutes({request: () => pending});
      const handler = router.stack.find(layer => layer.route?.path === '/auth/' + path).route.stack[0].handle;
      let status;
      let response;
      const res = {
        status(value) { status = value; return this; },
        json(value) { response = value; return this; },
      };
      t.mock.method(console, 'error', () => {});
      const handling = handler({body: {email: 'customer@example.test'}}, res);
      await Promise.resolve();
      assert.equal(response, undefined, 'must not end the request while email is pending');
      finish();
      await handling;
      assert.equal(status, 202);
      assert.match(response.data.message, /If this account is eligible/);
      assert.ok(!JSON.stringify(response).includes('SMTP unavailable'));
    });
  }
}

for (const fail of [false, true]) {
  test(`registration waits for verification and reports ${fail ? 'failed' : 'successful'} sending`, async t => {
    let accountCreated = false;
    let tokenDeleted = false;
    const db = {
      async getConnection() { return this; },
      async query() { return [[]]; },
      async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
      async execute(sql) {
        if (sql.includes('FROM cities')) return [[{id: 1, name: 'Austin', is_active: 1}]];
        if (sql.startsWith('SELECT id FROM customers')) return [[]];
        if (sql.includes('INSERT INTO customers')) { accountCreated = true; return [{insertId: 7}]; }
        if (sql.includes('SELECT registered_at')) return [[{registered_at: '2026-10-15T00:00:00Z'}]];
        if (sql.includes('SELECT id, name, email, email_verified')) return [[{id: 7, name: 'Test Customer', email: 'customer@example.test', email_verified: 0}]];
        if (sql.includes('SELECT customer_id FROM account_tokens')) return [[]];
        if (sql.includes('DELETE FROM account_tokens WHERE token_hash')) tokenDeleted = true;
        if (/^(INSERT INTO addresses|INSERT INTO account_tokens|DELETE FROM account_tokens)/.test(sql)) return [{affectedRows: 1}];
        throw new Error('Unexpected query: ' + sql);
      },
    };
    let finish;
    let started;
    const sendingStarted = new Promise(resolve => { started = resolve; });
    const router = createAuthRoutes(db, 'test-secret', () => {}, {
      appUrl: 'https://brightbuy.example',
      send() {
        started();
        return new Promise((resolve, reject) => {
          finish = () => fail ? reject(new Error('SMTP unavailable')) : resolve();
        });
      },
    });
    const handler = router.stack.find(layer => layer.route?.path === '/auth/register').route.stack[0].handle;
    let response;
    let status;
    t.mock.method(console, 'error', () => {});
    const handling = handler({body: {
      firstName: 'Test', lastName: 'Customer', email: 'customer@example.test',
      password: 'Password123!', phoneNumber: '7135550100',
      address: {recipient: 'Test Customer', line1: '12 Main Street', cityId: 1, postalCode: '78701'},
    }}, {
      status(value) { status = value; return this; },
      json(value) { response = value; return this; },
    });
    await sendingStarted;
    assert.equal(accountCreated, true);
    assert.equal(response, undefined, 'registration must wait for verification sending');
    finish();
    await handling;
    assert.equal(status, 201);
    assert.equal(response.data.id, 7);
    assert.equal(response.data.verificationEmailSent, !fail);
    assert.equal(tokenDeleted, fail, 'failed sending must remove the unusable token');
  });
}
