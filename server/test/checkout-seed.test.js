import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKOUT_SCENARIOS, demoRequestKey, seedCheckoutScenarios } from '../src/database/seedCheckout.js';
import { requestKey } from '../src/utils/checkout-input.js';

test('demo identities are stable valid keys with distinct cancellation identities', () => {
  const keys = CHECKOUT_SCENARIOS.flatMap((scenario) => [
    demoRequestKey(scenario.key), demoRequestKey(`${scenario.key}:cancel`),
  ]);
  assert.equal(new Set(keys).size, 16);
  for (const key of keys) assert.equal(requestKey(key), key);
  assert.equal(demoRequestKey('m3-v1-cod'), demoRequestKey('m3-v1-cod'));
  assert.notEqual(demoRequestKey('m3-v1-cod'), demoRequestKey('m3-v2-cod'));
});

test('a denied demo lock releases its connection without unlocking another session', async () => {
  const calls = [];
  const pool = { async getConnection() { return {
    async query(sql) { calls.push(sql); return [[{ acquired: 0 }]]; },
    release() { calls.push('release'); },
  }; } };
  await assert.rejects(seedCheckoutScenarios(pool), /Could not acquire/);
  assert.equal(calls.length, 2);
  assert.equal(calls[1], 'release');
});

test('a failed prerequisite check releases the demo lock and connection', async () => {
  const calls = [];
  const pool = {
    async getConnection() { return {
      async query(sql) { calls.push(sql); return [[{ acquired: 1 }]]; },
      release() { calls.push('release'); },
    }; },
    async query() { throw new Error('Unavailable database'); },
  };
  await assert.rejects(seedCheckoutScenarios(pool), /Unavailable database/);
  assert.match(calls[1], /RELEASE_LOCK/);
  assert.equal(calls[2], 'release');
});
