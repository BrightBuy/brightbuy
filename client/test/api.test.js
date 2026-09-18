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
