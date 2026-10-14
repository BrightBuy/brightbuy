import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import mysql from 'mysql2/promise';
import {applyMigrations} from '../src/database/migrate.js';
import {up} from '../db/018-account-recovery.mjs';
import {createApp} from '../src/app.js';
import {makeAccountRecovery} from '../src/services/account-recovery.js';
import {hashPassword} from '../src/password.js';
test('account verification and password recovery on isolated MySQL', {skip:!process.env.M3_TEST_MYSQL_URL}, async t=>{
  const admin=await mysql.createConnection(process.env.M3_TEST_MYSQL_URL);
  const database='brightbuy_auth_test_'+randomBytes(6).toString('hex');
  let pool,server;
  try {
    await admin.query('CREATE DATABASE '+database);
    const url=new URL(process.env.M3_TEST_MYSQL_URL);url.pathname='/'+database;
    pool=mysql.createPool({uri:url.href,timezone:'Z',connectionLimit:5});
    const connection=await pool.getConnection();
    try {await applyMigrations(connection);await up(connection);} finally {connection.release();}
    const messages=[];
    const options={appUrl:'https://brightbuy.example',send:async message=>messages.push(message)};
    const recovery=makeAccountRecovery(pool,options);
    server=createApp(pool,'auth-test-secret-at-least-thirty-two-characters',{accountEmail:options}).listen(0);
    await new Promise(resolve=>server.once('listening',resolve));
    const request=async(path,body,token)=>{
      const response=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
      return {status:response.status,body:await response.json()};
    };
    const email='new@example.test'; const password='Original123!';
    const latestToken=()=>new URLSearchParams(new URL(messages.at(-1).text.match(/https:\/\/\S+/)[0]).hash.slice(1)).get('token');
    const cooldown=()=>pool.query('UPDATE account_tokens SET created_at=UTC_TIMESTAMP()-INTERVAL 2 MINUTE');
    let session;
    await t.test('new registration is unverified and receives a verification link',async()=>{
      const [city]=await pool.query("INSERT INTO cities(name,is_main_city,is_active) VALUES ('Auth Test City',1,1)");
      const result=await request('/auth/register',{firstName:'New',lastName:'Customer',email,password,phoneNumber:'7135550100',address:{recipient:'New Customer',line1:'12 Sample Lane',cityId:city.insertId,postalCode:'77001'}});
      assert.equal(result.status,201);
      for(let i=0;i<100&&!messages.length;i++) await new Promise(r=>setTimeout(r,10));
      assert.equal(messages.length,1);
      assert.equal((await request('/auth/login',{email,password})).status,403);
      const [[row]]=await pool.query('SELECT token_hash FROM account_tokens');assert.notEqual(row.token_hash,latestToken());
    });
    await t.test('verification is purpose-bound and single-use',async()=>{
      const token=latestToken();
      assert.equal((await request('/auth/reset-password',{token,password:'Changed123!'})).status,400);
      assert.equal((await request('/auth/verify-email',{token})).status,200);
      assert.equal((await request('/auth/verify-email',{token})).status,400);
      const login=await request('/auth/login',{email,password});assert.equal(login.status,200);session=login.body.data.accessToken;
    });
    await t.test('unknown accounts send nothing; requests are throttled and replacements expire old links',async()=>{
      const count=messages.length;await recovery.request('missing@example.test','reset');assert.equal(messages.length,count);
      await recovery.request(email,'reset');const token=latestToken();
      await recovery.request(email,'reset');assert.equal(latestToken(),token);
      await cooldown();await recovery.request(email,'reset');assert.notEqual(latestToken(),token);
      await assert.rejects(recovery.consume(token,'reset','Changed123!'),{code:'INVALID_ACCOUNT_LINK'});
      await pool.query('UPDATE account_tokens SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 SECOND');
      await assert.rejects(recovery.consume(latestToken(),'reset','Changed123!'),{code:'INVALID_ACCOUNT_LINK'});
    });
    await t.test('concurrent password resets succeed only once and invalidate old sessions',async()=>{
      await cooldown();await recovery.request(email,'reset');const token=latestToken();
      const results=await Promise.allSettled([recovery.consume(token,'reset','Changed123!'),recovery.consume(token,'reset','Changed123!')]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal((await request('/auth/me',null,session)).status,401);
      assert.equal((await request('/auth/login',{email,password})).status,401);
      assert.equal((await request('/auth/login',{email,password:'Changed123!'})).status,200);
    });
    await t.test('mail failures remove undelivered tokens so immediate retry works',async()=>{
      const failed=makeAccountRecovery(pool,{...options,send:async()=>{throw new Error('SMTP unavailable');}});
      await assert.rejects(failed.request(email,'reset'));
      const [[row]]=await pool.query('SELECT COUNT(*) AS count FROM account_tokens');assert.equal(row.count,0);
      await recovery.request(email,'reset');assert.ok(latestToken());
    });
    await t.test('existing accounts remain usable after migration',async()=>{
      await pool.execute("INSERT INTO customers(name,email,password_hash,role) VALUES ('Existing','existing@example.test',?,'customer')",[await hashPassword(password)]);
      assert.equal((await request('/auth/login',{email:'existing@example.test',password})).status,200);
    });
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    if(pool) await pool.end();
    await admin.query('DROP DATABASE '+database);await admin.end();
  }
});
