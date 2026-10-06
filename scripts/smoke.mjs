import assert from 'node:assert/strict';
const base = process.env.SMOKE_BASE_URL || 'http://api:3000';
async function call(path, options = {}) {
  const response = await fetch(`${base}/api${path}`, options);
  return {
    status: response.status,
    body: await response.json(),
    requestId: response.headers.get('x-request-id'),
  };
}
async function login(email) {
  const r = await call('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'BrightBuy123!' }),
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.tokenType, 'Bearer');
  assert.equal(r.body.data.expiresIn, 3600);
  assert.equal(typeof r.body.data.accessToken, 'string');
  assert.equal(r.body.data.user.email, email);
  assert.ok(!Object.hasOwn(r.body.data.user, 'password_hash'));
  const headers = { Authorization: `Bearer ${r.body.data.accessToken}` };
  const currentUser = await call('/auth/me', { headers });
  assert.equal(currentUser.status, 200);
  assert.deepEqual(currentUser.body.data, r.body.data.user);
  return headers;
}
assert.equal((await call('/health')).status, 200);
const catalogue = await call('/products');
assert.equal(catalogue.status, 200);
assert.ok(Array.isArray(catalogue.body.data));
assert.ok(
  catalogue.body.data.length >= 40,
  'Expected the project catalogue seed (40+ active products). Run setup with SEED_PROJECT=true.',
);
for (const sku of ['NOVA-X1-PRO', 'PIXEL-8A', 'NOVA-MAGSAFE-STAND']) {
  assert.ok(
    catalogue.body.data.some((product) => product.sku === sku),
    `Missing seeded product: ${sku}`,
  );
}
assert.ok(catalogue.body.data.every((product) => product.currency === 'USD'));
assert.ok(catalogue.body.data.every((product) => !product.sku.startsWith('LEGACY-PRD-')));
assert.ok(catalogue.body.data.every((product) => product.variants.length > 0));
assert.ok(catalogue.body.data.some((p) => p.variants.some((v) => v.stock === 0)));
const customer = await login('nimal@example.test');
const other = await login('asha@example.test');
const admin = await login('admin@example.test');
assert.equal((await call('/orders')).status, 401);
assert.equal((await call('/admin/customers', { headers: customer })).status, 403);
assert.equal((await call('/orders/1', { headers: other })).status, 404);
const addresses = await call('/addresses', { headers: customer });
assert.equal(addresses.status, 200);
assert.ok([1, 2].every((id) => addresses.body.data.some((address) => address.id === id)));
const order = await call('/orders/1', { headers: customer });
assert.equal(order.status, 200);
assert.equal(order.body.data.items.length, 2);
assert.equal(
  Number(order.body.data.total),
  order.body.data.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0),
);
assert.deepEqual((await call('/admin/orders', { headers: admin })).body.data.filter((order) => order.isLegacy).map((order) => order.id).sort((a, b) => a - b), [1, 2, 3]);
const customers = (await call('/admin/customers', { headers: admin })).body.data;
for (const email of ['nimal@example.test', 'asha@example.test']) assert.ok(customers.some((customer) => customer.email === email));
// Verify the sample records and their published response types, not just HTTP 200.
// Project catalogue products are active; legacy order fixtures remain unchanged.
const variants = catalogue.body.data.flatMap((product) => product.variants);
assert.ok(variants.length >= catalogue.body.data.length);
for (const variant of variants) {
  assert.match(variant.price, /^\d+\.\d{2}$/);
  assert.ok(Number.isInteger(variant.stock) && variant.stock >= 0);
  assert.ok(catalogue.body.data.some((product) => product.id === variant.productId));
}
const otherAddresses = await call('/addresses', { headers: other });
assert.ok(otherAddresses.body.data.some((address) => address.id === 3));
assert.ok(addresses.body.data.every((address) => address.customerId === 1));
assert.ok(otherAddresses.body.data.every((address) => address.customerId === 2));
for (const [headers, customerId, expectedCount] of [
  [customer, 1, 2],
  [other, 2, 1],
]) {
  const list = await call('/orders', { headers });
  assert.equal(list.status, 200);
  const legacy = list.body.data.filter((order) => order.isLegacy);
  assert.equal(legacy.length, expectedCount);
  assert.ok(list.body.data.every((order) => order.customerId === customerId));
  for (const summary of legacy) {
    const detail = await call(`/orders/${summary.id}`, { headers });
    assert.equal(detail.status, 200);
    assert.match(detail.body.data.total, /^\d+\.\d{2}$/);
    assert.equal(detail.body.data.currency, 'LKR');
    assert.equal(new Date(summary.createdAt).toISOString(), summary.createdAt);
    // Foundation samples have no verified checkout/payment/fulfilment metadata.
    // They stay readable, but must not advertise project lifecycle actions.
    for (const record of [summary, detail.body.data]) {
      assert.equal(record.isLegacy, true);
      assert.deepEqual(record.nextStatuses, []);
      assert.equal(record.payment, null);
      assert.equal(record.delivery, null);
      assert.equal(record.stockState, null);
      assert.equal(record.wasOutOfStock, null);
    }
    assert.deepEqual(detail.body.data.history, []);
    assert.ok(detail.body.data.items.length > 0);
    if (summary.fulfillment === 'pickup') assert.equal(summary.addressSnapshot, null);
    else assert.equal(typeof summary.addressSnapshot.recipient, 'string');
  }
}

// Exercise the status endpoint with rejected requests only, preserving fixtures.
const rejected = await call('/admin/orders/1/status', {
  method: 'PATCH',
  headers: { ...admin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ status: 'not-a-status' }),
});
assert.equal(rejected.status, 409);
assert.equal(rejected.body.error.code, 'LEGACY_ORDER_REQUIRES_MIGRATION');
assert.equal(rejected.body.error.requestId, rejected.requestId);

console.log(
  'Application API contracts, project catalogue and legacy-order smoke checks passed. No records changed.',
);

// Optional fresh-demo verification; ordinary smoke also works without checkout demos.
if (process.env.SMOKE_CHECKOUT_DEMOS === 'true') {
  const { CHECKOUT_SCENARIOS } = await import('../server/src/database/seedCheckout.js');
  for (const scenario of CHECKOUT_SCENARIOS) {
    const headers = await login(`${scenario.key}@example.test`);
    const list = await call('/orders', { headers });
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, scenario.decline ? 0 : 1);
    if (scenario.decline) continue;
    const detail = await call(`/orders/${list.body.data[0].id}`, { headers });
    assert.equal(detail.status, 200);
    const order = detail.body.data;
    assert.equal(order.isLegacy, false);
    assert.equal(order.currency, 'USD');
    assert.equal(order.total, scenario.shortage ? '20.00' : '10.00');
    assert.equal(order.status, scenario.cancel ? 'cancelled' : scenario.shortage ? 'backordered' : 'confirmed');
    assert.equal(order.payment.status, scenario.payment === 'card'
      ? scenario.cancel ? 'refunded' : 'paid' : scenario.cancel ? 'void' : 'pending');
    assert.equal(order.history.at(-1).toStatus, order.status);
    assert.equal(order.delivery.mode, scenario.mode);
    assert.match(order.delivery.estimatedDate, /^\d{4}-\d{2}-\d{2}$/);
  }
  console.log('Checkout demo API scenarios passed.');
}
