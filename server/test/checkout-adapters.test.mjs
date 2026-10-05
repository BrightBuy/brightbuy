import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCart } from '../src/services/cart.js';
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
const city = { id: 7, name: 'Austin', isMainCity: 1, isActive: 1, countryCode: 'US', stateCode: 'TX' };
const address = { id: 4, cityId: 7, recipient: 'A', line1: '100 Test Road', postalCode: '78701', country: 'US' };
const store = { id: 5, cityId: 7, storeName: 'Pickup', addressLine: '200 Test Road', isActive: 1 };

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
test('delivery lookup enforces ownership and creates a US/Texas snapshot', async () => {
  const db = connection([address], [city]);
  const result = await getDestination(db, 'delivery', 4, 1);
  assert.deepEqual(result, { addressId: 4, storeId: null, isMainCity: true,
    snapshot: { cityId: 7, city: 'Austin', country: 'US', state: 'TX', isMainCity: true,
      recipient: 'A', line1: '100 Test Road', postalCode: '78701' } });
  assert.match(db.calls[0].sql, /customer_id = \? FOR UPDATE/);
  assert.deepEqual(db.calls[0].params, [4, 1]);
  assert.match(db.calls[1].sql, /FOR SHARE/);
});
test('unknown or unowned address returns not found', async () => {
  await assert.rejects(getDestination(connection([]), 'delivery', 4, 1), { code: 'NOT_FOUND' });
});
test('pickup snapshot contains store information without a delivery address', async () => {
  const result = await getDestination(connection([store], [{ ...city, isMainCity: 0 }]), 'pickup', 5, 1);
  assert.equal(result.addressId, null);
  assert.equal(result.storeId, 5);
  assert.equal(result.isMainCity, false);
  assert.equal(result.snapshot.storeName, 'Pickup');
  assert.equal(result.snapshot.addressLine, '200 Test Road');
  assert.equal(result.snapshot.recipient, undefined);
});
test('inactive store is rejected before reading its city', async () => {
  await assert.rejects(getDestination(connection([{ ...store, isActive: 0 }]), 'pickup', 5, 1), { code: 'DESTINATION_UNSUPPORTED' });
});
test('unmapped and non-US addresses are rejected', async () => {
  for (const row of [{ ...address, cityId: null }, { ...address, country: 'LK' }]) {
    await assert.rejects(getDestination(connection([row]), 'delivery', 4, 1), { code: 'DESTINATION_UNSUPPORTED' });
  }
});
test('inactive, unclassified and outside-Texas cities are rejected', async () => {
  for (const row of [{ ...city, isActive: 0 }, { ...city, stateCode: null },
    { ...city, stateCode: 'CA' }, { ...city, countryCode: 'CA' }]) {
    await assert.rejects(getDestination(connection([address], [row]), 'delivery', 4, 1), { code: 'DESTINATION_UNSUPPORTED' });
  }
});
test('invalid destination inputs cannot issue SQL', async () => {
  await assert.rejects(getDestination(connection(), 'unknown', 4, 1), { code: 'VALIDATION_ERROR' });
  await assert.rejects(getDestination(connection(), 'delivery', '4', 1), { code: 'VALIDATION_ERROR' });
});
test('malformed destination data is rejected rather than guessed', async () => {
  await assert.rejects(getDestination(connection([{ ...address, recipient: '' }], [city]), 'delivery', 4, 1), { code: 'CHECKOUT_DATA_INVALID' });
  await assert.rejects(getDestination(connection([address], [{ ...city, isMainCity: 2 }]), 'delivery', 4, 1), { code: 'CHECKOUT_DATA_INVALID' });
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
