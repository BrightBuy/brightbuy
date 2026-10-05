import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { hashPassword, verifyPassword } from '../src/password.js';
import { nextStatuses, ORDER_TRANSITIONS } from '@brightbuy/contracts';
const secret = 'test-only-secret-that-is-at-least-32-characters';
let server, base, passwordHash;
let failDb = false,
  concurrent = false;
let authLookups = 0;
let statusHistory = [];
const users = [
  { id: 1, name: 'Customer', email: 'customer@example.test', role: 'customer' },
  { id: 2, name: 'Admin', email: 'admin@example.test', role: 'admin' },
  { id: 3, name: 'Other', email: 'other@example.test', role: 'customer' },
];
let order = {
  id: 1,
  customerId: 1,
  status: 'pending',
  fulfillment: 'delivery',
  total: '10.00',
  currency: 'LKR',
  addressSnapshot: { city: 'Colombo' },
};
const db = {
  async getConnection() {
    return {
      execute: (...args) => db.execute(...args),
      query: (...args) => db.query(...args),
      async beginTransaction() {},
      async commit() {},
      async rollback() {},
      release() {},
      destroy() {},
    };
  },
  async query(sql) {
    if (failDb) throw new Error('private database information');
    return [[]];
  },
  async execute(sql, params) {
    if (sql.includes('customers WHERE email'))
      return [
        users
          .filter((u) => u.email === params[0])
          .map((u) => ({ ...u, password_hash: passwordHash })),
      ];
    if (sql.includes('customers WHERE id')) {
      authLookups += 1;
      return [users.filter((u) => String(u.id) === params[0])];
    }
    if (sql.includes('FROM addresses')) return [[{ id: params[0], customerId: params[0] }]];
    if (sql.includes('FROM orders')) {
      if (sql.includes('AND (customer_id'))
        return [
          [
            ...(params[0] === order.id && (params[1] === order.customerId || params[2] === 'admin')
              ? [{ ...order }]
              : []),
          ],
        ];
      return [[...(params[0] === order.id ? [{ ...order }] : [])]];
    }
    if (sql.includes('UPDATE orders')) {
      if (concurrent) return [{ affectedRows: 0 }];
      order.status = params[0];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO order_status_history')) {
      statusHistory.push({ orderId: params[0], fromStatus: params[1], toStatus: params[2], actorId: params[3] });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('order_items')) return [[]];
    if (sql.includes('checkout_requests')) return [[]];
    throw new Error(`Unexpected SQL in test: ${sql}`);
  },
};
const token = (id = 1, opts = {}) =>
  jwt.sign({ role: users.find((u) => u.id === id)?.role || 'customer' }, secret, {
    subject: String(id),
    issuer: 'brightbuy',
    audience: 'brightbuy-web',
    expiresIn: '1h',
    ...opts,
  });
async function request(path, { id, authorization, ...options } = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(id ? { Authorization: `Bearer ${token(id)}` } : {}),
      ...(authorization ? { Authorization: authorization } : {}),
    },
  });
  return {
    status: response.status,
    body: await response.json(),
    requestId: response.headers.get('x-request-id'),
  };
}
before(async () => {
  passwordHash = await hashPassword('Correct123!');
  server = createApp(db, secret).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  authLookups = 0;
  failDb = false;
  concurrent = false;
  order.status = 'pending';
  statusHistory = [];
});
after(async () => {
  await new Promise((r) => server.close(r));
});
test('password hashes use distinct salts and verify correctly', async () => {
  assert.notEqual(passwordHash, await hashPassword('Correct123!'));
  assert.equal(await verifyPassword('Correct123!', passwordHash), true);
  assert.equal(await verifyPassword('wrong', passwordHash), false);
});
test('login returns documented token and excludes password hash', async () => {
  const r = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: ' CUSTOMER@example.test ', password: 'Correct123!' }),
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.tokenType, 'Bearer');
  assert.equal(r.body.data.expiresIn, 3600);
  assert.equal(r.body.data.user.password_hash, undefined);
  assert.equal(jwt.verify(r.body.data.accessToken, secret).sub, '1');
});
test('wrong credentials and missing fields are rejected', async () => {
  assert.equal((await request('/api/auth/login', { method: 'POST', body: '{}' })).status, 400);
  assert.equal(
    (
      await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: users[0].email, password: 'wrong' }),
      })
    ).status,
    401,
  );
});
test('missing, malformed, expired and deleted-user tokens are rejected', async () => {
  for (const authorization of [
    undefined,
    'Bearer broken',
    `Bearer ${token(1, { expiresIn: -1 })}`,
    `Bearer ${token(99)}`,
  ])
    assert.equal((await request('/api/auth/me', { authorization })).status, 401);
});
test('customers cannot call admin routes', async () => {
  assert.equal((await request('/api/admin/customers', { id: 1 })).status, 403);
  assert.equal(
    (
      await request('/api/admin/orders/1/status', {
        id: 1,
        method: 'PATCH',
        body: '{"status":"confirmed"}',
      })
    ).status,
    403,
  );
});
test('customer cannot read another customer order; admin can', async () => {
  assert.equal((await request('/api/orders/1', { id: 3 })).status, 404);
  assert.equal((await request('/api/orders/1', { id: 1 })).status, 200);
  assert.equal((await request('/api/orders/1', { id: 2 })).status, 200);
});
test('addresses are scoped to authenticated user', async () => {
  const r = await request('/api/addresses', { id: 3 });
  assert.equal(r.body.data[0].customerId, 3);
});
test('invalid IDs, malformed JSON and unknown routes share error envelope', async () => {
  for (const [path, options, status] of [
    ['/api/orders/1abc', { id: 1 }, 400],
    ['/api/auth/login', { method: 'POST', body: '{' }, 400],
    ['/api/unknown', {}, 404],
  ]) {
    const r = await request(path, options);
    assert.equal(r.status, status);
    assert.equal(r.body.error.requestId, r.requestId);
    assert.ok(Array.isArray(r.body.error.details));
    assert.ok(r.body.error.code);
  }
});
test('health reports database unavailability without leaking details', async () => {
  failDb = true;
  try {
    const r = await request('/api/health');
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'DATABASE_UNAVAILABLE');
    assert.ok(!JSON.stringify(r.body).includes('private'));
  } finally {
    failDb = false;
  }
});
test('status transitions reject skipping, extra input and concurrent writes', async () => {
  const update = (body) =>
    request('/api/admin/orders/1/status', { id: 2, method: 'PATCH', body: JSON.stringify(body) });
  assert.equal((await update({ status: 'delivered' })).status, 409);
  assert.equal((await update({ status: 'confirmed', total: 1 })).status, 400);
  concurrent = true;
  assert.equal((await update({ status: 'confirmed' })).body.error.code, 'ORDER_CHANGED');
  assert.equal(statusHistory.length, 0);
  concurrent = false;
  const r = await update({ status: 'confirmed' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'confirmed');
  assert.deepEqual(statusHistory, [{ orderId: 1, fromStatus: 'pending', toStatus: 'confirmed', actorId: 2 }]);
  assert.equal((await update({ status: 'pending' })).status, 409);
});
test('delivery and pickup paths are exclusive and terminal states cannot change', () => {
  assert.deepEqual(nextStatuses('processing', 'delivery'), ['shipped']);
  assert.deepEqual(nextStatuses('processing', 'pickup'), ['ready_for_pickup']);
  for (const status of ['cancelled', 'delivered', 'collected'])
    assert.deepEqual(nextStatuses(status, 'delivery'), []);
  assert.deepEqual(nextStatuses('pending', 'pickup'), ['confirmed', 'cancelled']);
});

test('signed tokens missing subject or expiry are rejected before database access', async () => {
  for (const claims of [
    {},
    { sub: 'not-an-id' },
    { sub: '0' },
    { sub: '9007199254740993' },
    { sub: '1', noExpiry: true },
  ]) {
    const { noExpiry, ...payload } = claims;
    const signed = jwt.sign(payload, secret, {
      issuer: 'brightbuy',
      audience: 'brightbuy-web',
      ...(noExpiry ? {} : { expiresIn: '1h' }),
    });
    const result = await request('/api/auth/me', { authorization: `Bearer ${signed}` });
    assert.equal(result.status, 401);
  }
  assert.equal(authLookups, 0);
});

test('bearer scheme is case-insensitive and private responses are not cached', async () => {
  const response = await fetch(base + '/api/auth/me', {
    headers: { Authorization: `bearer ${token()}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('database role overrides a stale administrator claim', async () => {
  const signed = jwt.sign({ role: 'admin' }, secret, {
    subject: '1',
    issuer: 'brightbuy',
    audience: 'brightbuy-web',
    expiresIn: '1h',
  });
  assert.equal(
    (await request('/api/admin/customers', { authorization: `Bearer ${signed}` })).status,
    403,
  );
});

test('malformed stored password hashes fail without throwing', async () => {
  for (const encoded of [
    null,
    undefined,
    '',
    'missing-separator',
    'salt:zz',
    'a'.repeat(32) + ':xx',
  ]) {
    assert.equal(await verifyPassword('password', encoded), false);
  }
});

test('lifecycle handles invalid values and protects its shared rules from mutation', () => {
  for (const status of ['toString', 'constructor', 'unknown', null, undefined]) {
    assert.deepEqual(nextStatuses(status, 'delivery'), []);
  }
  assert.deepEqual(nextStatuses('pending', 'unknown'), []);
  assert.deepEqual(nextStatuses('shipped', 'pickup'), []);
  assert.deepEqual(nextStatuses('ready_for_pickup', 'delivery'), []);
  assert.throws(() => ORDER_TRANSITIONS.pending.push('delivered'), TypeError);
});

test('unsupported encodings and corrupt compressed JSON return client errors', async () => {
  for (const [headers, expectedStatus, expectedCode] of [
    [{ 'Content-Type': 'application/json; charset=made-up' }, 415, 'UNSUPPORTED_ENCODING'],
    [
      { 'Content-Type': 'application/json', 'Content-Encoding': 'made-up' },
      415,
      'UNSUPPORTED_ENCODING',
    ],
    [{ 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, 400, 'INVALID_JSON'],
  ]) {
    const response = await fetch(base + '/api/auth/login', { method: 'POST', headers, body: '{}' });
    const payload = await response.json();
    assert.equal(response.status, expectedStatus);
    assert.equal(payload.error.code, expectedCode);
    assert.equal(payload.error.requestId, response.headers.get('x-request-id'));
    assert.deepEqual(payload.error.details, []);
  }
});

test('oversized JSON uses the shared 413 error response', async () => {
  const result = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'x'.repeat(33000), password: 'test' }),
  });
  assert.equal(result.status, 413);
  assert.equal(result.body.error.code, 'PAYLOAD_TOO_LARGE');
  assert.equal(result.body.error.requestId, result.requestId);
});

test('inventory routes remain restricted to administrators after route integration', async () => {
  for (const [path, method] of [
    ['/api/admin/inventory', 'GET'],
    ['/api/admin/variants/1/stock-adjustments', 'POST'],
    ['/api/admin/variants/1/stock-movements', 'GET'],
  ]) {
    const options = { method, ...(method === 'POST' ? { body: '{}' } : {}) };
    assert.equal((await request(path, options)).status, 401);
    assert.equal((await request(path, { ...options, id: 1 })).status, 403);
  }
});

test('backorders allow allocation or cancellation in both fulfilment modes', () => {
  for (const mode of ['delivery', 'pickup']) {
    assert.deepEqual(nextStatuses('backordered', mode), ['confirmed', 'cancelled']);
  }
  assert.deepEqual(nextStatuses('backordered', 'unknown'), []);
});

test('backorder rules resist direct mutation and returned-list mutation', () => {
  assert.throws(() => ORDER_TRANSITIONS.backordered.push('processing'), TypeError);
  const offered = nextStatuses('backordered', 'delivery');
  offered.push('processing');
  assert.deepEqual(nextStatuses('backordered', 'delivery'), ['confirmed', 'cancelled']);
});
