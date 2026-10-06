import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCartForCheckout as readCart } from '../src/services/cart.js';
import { getDestination, deliveryDays } from '../src/services/locations.js';

function connection(...responses) {
  const calls = [];
  return {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params });
      assert.ok(responses.length, 'Unexpected database call');
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return [response];
    },
  };
}
// Rows returned by Member 5's joined, shared-lock destination query.
const city = { destination_city_id: 7, destination_city: 'Austin', is_main_city: 1, city_active: 1 };
const address = { ...city, id: 4, recipient: 'A', line1: '100 Test Road', postal_code: '78701', country: 'US' };
const store = { ...city, id: 5, name: 'Pickup', address_line: '200 Test Road', store_active: 1 };

test('missing cart is empty and does not create database records', async () => {
  const db = connection([]);
  assert.deepEqual(await readCart(db, 1), { version: 0, items: [] });
  assert.equal(db.calls.length, 1);
});
test('cart preserves version and quantities using the supplied connection', async () => {
  const db = connection([{ id: 2, version: 9 }], [{ variantId: 3, quantity: 2 }]);
  assert.deepEqual(await readCart(db, 1), { version: 9, items: [{ variantId: 3, quantity: 2 }] });
  assert.deepEqual(db.calls.map((c) => c.params), [[1], [2]]);
  assert.ok(db.calls.every((c) => /FOR UPDATE/.test(c.sql)));
});
test('cart rejects malformed IDs before querying', async () => {
  for (const id of [0, -1, '1', 1.5, 4294967296]) {
    await assert.rejects(readCart(connection(), id), { code: 'VALIDATION_ERROR' });
  }
});
test('cart rejects invalid quantities and duplicate variants', async () => {
  for (const items of [[{ variantId: 3, quantity: 0 }], [{ variantId: 3, quantity: 100 }],
    [{ variantId: 3, quantity: 1.5 }], [{ variantId: 3, quantity: 1 }, { variantId: 3, quantity: 2 }]]) {
    await assert.rejects(readCart(connection([{ id: 2, version: 0 }], items), 1), { code: 'CHECKOUT_DATA_INVALID' });
  }
});
test('cart rejects a version outside the checkout contract', async () => {
  await assert.rejects(readCart(connection([{ id: 2, version: 4294967296 }]), 1), { code: 'CHECKOUT_DATA_INVALID' });
});
test('delivery lookup scopes ownership, locks the joined destination and returns the agreed snapshot', async () => {
  const db = connection([address]);
  const result = await getDestination(db, 'delivery', 4, 1);
  assert.deepEqual(result, { addressId: 4, storeId: null, isMainCity: true,
    snapshot: { cityId: 7, city: 'Austin', country: 'US', isMainCity: true,
      recipient: 'A', line1: '100 Test Road', line2: '', line3: '', postalCode: '78701' } });
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /a\.customer_id = \?/);
  assert.match(db.calls[0].sql, /JOIN cities/);
  assert.match(db.calls[0].sql, /FOR SHARE/);
  assert.deepEqual(db.calls[0].params, [4, 1]);
});
test('unknown or unowned address returns DESTINATION_NOT_FOUND', async () => {
  await assert.rejects(getDestination(connection([]), 'delivery', 4, 1), { code: 'DESTINATION_NOT_FOUND' });
});
test('pickup snapshot contains store information without a delivery address', async () => {
  const result = await getDestination(connection([{ ...store, is_main_city: 0 }]), 'pickup', 5, 1);
  assert.deepEqual(result, { addressId: null, storeId: 5, isMainCity: false,
    snapshot: { cityId: 7, city: 'Austin', country: 'US', isMainCity: false,
      storeId: 5, storeName: 'Pickup', addressLine: '200 Test Road' } });
});
test('inactive store is rejected', async () => {
  await assert.rejects(getDestination(connection([{ ...store, store_active: 0 }]), 'pickup', 5, 1), { code: 'DESTINATION_INACTIVE' });
});
test('unmapped address is absent from the join and non-US address is invalid', async () => {
  await assert.rejects(getDestination(connection([]), 'delivery', 4, 1), { code: 'DESTINATION_NOT_FOUND' });
  await assert.rejects(getDestination(connection([{ ...address, country: 'LK' }]), 'delivery', 4, 1), { code: 'DESTINATION_INVALID' });
});
test('inactive cities and invalid city classification are rejected', async () => {
  await assert.rejects(getDestination(connection([{ ...address, city_active: 0 }]), 'delivery', 4, 1), { code: 'DESTINATION_INACTIVE' });
  for (const patch of [{ is_main_city: null }, { is_main_city: 2 }, { destination_city: '' }, { destination_city_id: 0 }]) {
    await assert.rejects(getDestination(connection([{ ...address, ...patch }]), 'delivery', 4, 1), { code: 'DESTINATION_INVALID' });
  }
});
test('invalid destination inputs cannot issue SQL', async () => {
  await assert.rejects(getDestination(connection(), 'unknown', 4, 1), { code: 'VALIDATION_ERROR' });
  await assert.rejects(getDestination(connection(), 'delivery', '4', 1), { code: 'VALIDATION_ERROR' });
});
test('malformed destination text is rejected', async () => {
  for (const patch of [{ recipient: '' }, { line1: '' }, { postal_code: '' }]) {
    await assert.rejects(getDestination(connection([{ ...address, ...patch }]), 'delivery', 4, 1), { code: 'DESTINATION_INVALID' });
  }
});
test('database errors propagate for transaction-level handling', async () => {
  const failure = new Error('database unavailable');
  await assert.rejects(readCart(connection(failure), 1), (error) => error === failure);
  await assert.rejects(getDestination(connection(failure), 'delivery', 4, 1), (error) => error === failure);
});
test('delivery-days helper retains all four duration cases', async () => {
  for (const [main, shortage, expected] of [[true, false, 5], [false, false, 7], [true, true, 8], [false, true, 10]]) {
    assert.equal(await deliveryDays(connection([{ days: expected }]), main, shortage), expected);
  }
});
