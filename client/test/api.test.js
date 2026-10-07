import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api.js';

test('client sends the captured bearer token and unwraps the response', async () => {
  const client = createApiClient({
    fetchImpl: async (url, options) => {
      assert.equal(url, '/api/orders');
      assert.equal(options.headers.get('Authorization'), 'Bearer test-token');
      return Response.json({ data: [{ id: 1 }] });
    },
  });
  client.setToken('test-token');
  assert.deepEqual(await client.api('/orders'), [{ id: 1 }]);
});

test('an old request cannot expire a newly established session', async () => {
  let respond;
  let expirations = 0;
  const client = createApiClient({
    fetchImpl: () =>
      new Promise((resolve) => {
        respond = resolve;
      }),
    onUnauthorized: () => {
      expirations += 1;
    },
  });
  client.setToken('old-token');
  const oldRequest = client.api('/orders');
  client.setToken('new-token');
  respond(Response.json({ error: { message: 'Expired' } }, { status: 401 }));
  await assert.rejects(oldRequest, { status: 401 });
  assert.equal(expirations, 0);
});

test('concurrent 401 responses expire the current session only once', async () => {
  let expirations = 0;
  const client = createApiClient({
    fetchImpl: async () => Response.json({ error: { message: 'Expired' } }, { status: 401 }),
    onUnauthorized: () => {
      expirations += 1;
    },
  });
  client.setToken('current-token');
  const results = await Promise.allSettled([client.api('/orders'), client.api('/addresses')]);
  assert.ok(results.every((result) => result.status === 'rejected'));
  assert.equal(expirations, 1);
});

test('failed login does not expire an existing session', async () => {
  let expirations = 0;
  const client = createApiClient({
    fetchImpl: async () => Response.json({ error: { message: 'Wrong password' } }, { status: 401 }),
    onUnauthorized: () => {
      expirations += 1;
    },
  });
  client.setToken('existing-token');
  await assert.rejects(client.api('/auth/login'), { status: 401 });
  assert.equal(expirations, 0);
});

test('proxy HTML, invalid success envelopes and network failures are readable errors', async () => {
  for (const [fetchImpl, code] of [
    [async () => new Response('<html>Bad gateway</html>', { status: 502 }), 'INVALID_RESPONSE'],
    [async () => Response.json({ unexpected: true }), 'INVALID_RESPONSE'],
    [
      async () => {
        throw new TypeError('Failed to fetch');
      },
      'NETWORK_ERROR',
    ],
  ]) {
    const client = createApiClient({ fetchImpl });
    await assert.rejects(
      client.api('/products'),
      (error) => error.code === code && error.message.includes('try again'),
    );
  }
});

test('aborted requests remain aborts instead of becoming network errors', async () => {
  const client = createApiClient({
    fetchImpl: async () => {
      throw new DOMException('Aborted', 'AbortError');
    },
  });
  await assert.rejects(client.api('/orders'), { name: 'AbortError' });
});

test('cancellation while reading response JSON remains an AbortError', async () => {
  const client = createApiClient({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new DOMException('Aborted while reading response', 'AbortError');
      },
    }),
  });
  await assert.rejects(client.api('/products'), { name: 'AbortError' });
});


test('successful old-session responses cannot continue work in a different session', async () => {
  for (const replacement of [null, 'new-token', 'old-token']) {
    let respond;
    const client = createApiClient({ fetchImpl: () => new Promise(resolve => { respond = resolve; }) });
    client.setToken('old-token');
    const request = client.api('/cart');
    client.setToken(replacement);
    respond(Response.json({ data: { items: [{ variantId: 1, quantity: 8 }] } }));
    await assert.rejects(request, { code: 'UNAUTHENTICATED' });
  }
});

test('a previous login cannot expire a new session even when the server reuses its token', async () => {
  let respond;
  let expirations = 0;
  const client = createApiClient({
    fetchImpl: () => new Promise(resolve => { respond = resolve; }),
    onUnauthorized: () => { expirations++; },
  });
  client.setToken('same-token');
  const request = client.api('/orders');
  client.setToken('same-token');
  respond(Response.json({ error: { message: 'Expired' } }, { status: 401 }));
  await assert.rejects(request, { status: 401 });
  assert.equal(expirations, 0);
});


test('session changes while reading the response body discard the old account data', async () => {
  let finishBody;
  let bodyStarted;
  const reading = new Promise(resolve => { bodyStarted = resolve; });
  let expirations = 0;
  const client = createApiClient({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: () => new Promise(resolve => { finishBody = resolve; bodyStarted(); }),
    }),
    onUnauthorized: () => { expirations++; },
  });
  client.setToken('first-account');
  const request = client.api('/account/profile');
  const rejected = assert.rejects(request, { code: 'UNAUTHENTICATED' });
  await reading;
  client.setToken('second-account');
  finishBody({ data: { id: 1, name: 'Old account' } });
  await rejected;
  assert.equal(expirations, 0, 'Discarding an old response must not sign out the new account');
});

test('an account switch during add-to-cart never writes the old quantity to the new cart', async () => {
  const { addCartItem } = await import('../src/utils/interactions.js');
  let respond;
  let started;
  const requested = new Promise(resolve => { started = resolve; });
  const calls = [];
  const client = createApiClient({
    fetchImpl: (url, options) => {
      calls.push({ url, method: options.method || 'GET' });
      return new Promise(resolve => { respond = resolve; started(); });
    },
  });
  client.setToken('first-account');
  const adding = addCartItem(client.api, 7, 1);
  const rejected = assert.rejects(adding, { code: 'UNAUTHENTICATED' });
  await requested;
  client.setToken('second-account');
  respond(Response.json({ data: { items: [{ variantId: 7, quantity: 8 }] } }));
  await rejected;
  assert.deepEqual(calls, [{ url: '/api/cart', method: 'GET' }]);
});
