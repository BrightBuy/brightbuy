import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCartItem, quantity, returnPath, pendingAttempt } from '../src/utils/interactions.js';

test('sign-in returns only to internal permitted destinations', () => {
  assert.equal(returnPath('/checkout', 'customer'), '/checkout');
  for (const path of ['//evil.test', '/\\evil.test', 'https://evil.test', '/admin/orders', '/login']) {
    assert.equal(returnPath(path, 'customer'), '/account/orders');
  }
  assert.equal(returnPath('/admin/inventory', 'admin'), '/admin/inventory');
});

test('quantities reject partial numbers and decimals', () => {
  for (const value of ['', '1.5', '1e1', '2abc', 0, 100, NaN]) assert.equal(quantity(value), null);
  assert.equal(quantity('12'), 12);
});

test('concurrent adds preserve existing quantities instead of replacing them', async () => {
  let count = 3;
  const api = async (path, options) => {
    if (!options) return { items: [{ variantId: 4, quantity: count }] };
    count = JSON.parse(options.body).quantity;
    return { items: [{ variantId: 4, quantity: count }] };
  };
  await Promise.all([addCartItem(api, 4, 2), addCartItem(api, 4, 1)]);
  assert.equal(count, 6);
  await assert.rejects(addCartItem(api, 4, 99), /at most 99/);
  assert.equal(count, 6);
  await addCartItem(api, 4, 1);
  assert.equal(count, 7);
});

test('pending actions survive remount and remain scoped to their account and order', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  const payload = { requestKey: 'same-key', reason: 'Keep exact reason' };
  pendingAttempt(storage, 'user1:order1').save(payload);
  assert.deepEqual(pendingAttempt(storage, 'user1:order1').read(), payload);
  assert.equal(pendingAttempt(storage, 'user2:order1').read(), null);
  pendingAttempt(storage, 'user1:order1').clear();
  assert.equal(pendingAttempt(storage, 'user1:order1').read(), null);
  assert.throws(() => pendingAttempt({ setItem() { throw Error('quota'); } }, 'x').save(payload), /cannot save/);
});
