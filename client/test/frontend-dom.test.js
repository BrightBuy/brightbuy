import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

register('../testing/jsx-loader.mjs', import.meta.url);
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
for (const name of ['window', 'document', 'sessionStorage', 'FormData', 'CustomEvent']) globalThis[name] = dom.window[name];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');
const { AuthProvider, useAuth } = await import('../src/auth/AuthProvider.jsx');
const { CartPage } = await import('../src/pages/CartPage.jsx');
const { CheckoutPage } = await import('../src/pages/CheckoutPage.jsx');
const { AdminInventoryPage } = await import('../src/pages/AdminInventoryPage.jsx');
const { QuantityInput } = await import('../src/components/QuantityInput.jsx');
const { CancelOrderForm } = await import('../src/components/CancelOrderForm.jsx');
const { AdminFulfilmentPage } = await import('../src/pages/AdminFulfilmentPage.jsx');
const { AddressesPage } = await import('../src/pages/AddressesPage.jsx');
const { AdminCataloguePage } = await import('../src/pages/AdminCataloguePage.jsx');
let root;
const h = React.createElement;
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));
async function flush() { await React.act(tick); }
function Session({ component, role }) {
  const { user, login } = useAuth();
  React.useEffect(() => { login(role + '@test', 'password'); }, []);
  return user ? h(component) : null;
}
async function mount(component, handler, role = 'customer') {
  globalThis.fetch = async (path, options = {}) => {
    if (path === '/api/auth/login') return Response.json({ data: { accessToken: 'test', user: { id: 1, role, name: 'Test' } } });
    return Response.json({ data: await handler(path.replace('/api', ''), options) });
  };
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(h(MemoryRouter, null, h(AuthProvider, null, h(Session, { component, role })))));
  await flush();
}
async function click(text) {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes(text));
  assert.ok(button, 'Missing button: ' + text);
  await React.act(async () => button.click());
  await flush();
}
afterEach(async () => {
  if (root) await React.act(async () => root.unmount());
  root = null;
  sessionStorage.clear();
});

test('inventory displays the unwrapped movement records', async () => {
  await mount(AdminInventoryPage, async (path) => path.includes('stock-movements')
    ? [{ id: 1, changeQty: 5, stockAfter: 5, movementType: 'adjustment', reason: 'Restock proof', createdAt: '2026-10-07T10:00:00Z' }]
    : [{ id: 9, productTitle: 'Product', title: 'Variant', sku: 'TEST', stock: 5, active: true }], 'admin');
  await click('History');
  assert.match(document.body.textContent, /Restock proof/);
});

test('checkout restores the original request even when the cart is now empty', async () => {
  const payload = { requestKey: 'saved-key', cartVersion: 7, fulfillment: 'pickup', storeId: 4, paymentMethod: 'cod' };
  sessionStorage.setItem('brightbuy:checkout:1', JSON.stringify(payload));
  let submitted;
  await mount(CheckoutPage, async (path, options) => {
    if (path === '/cart') return { items: [], total: '0.00', currency: 'USD', version: 8 };
    if (path === '/orders') { submitted = JSON.parse(options.body); throw new Error('Offline'); }
    return [];
  });
  await click('Retry same attempt');
  assert.deepEqual(submitted, payload);
  assert.deepEqual(JSON.parse(sessionStorage.getItem('brightbuy:checkout:1')), payload);
});

test('clearing a cart releases its mutation lock even when the request fails', async () => {
  let attempts = 0;
  window.confirm = () => true;
  const cart = { items: [{ variantId: 2, productName: 'Example', variantName: 'One', quantity: 1, available: true, unitPrice: '10.00', lineTotal: '10.00' }], total: '10.00', version: 1 };
  await mount(CartPage, async (path, options) => {
    if (options.method === 'DELETE') { attempts++; throw new Error('Offline'); }
    return cart;
  });
  await click('Clear Cart');
  await click('Clear Cart');
  assert.equal(attempts, 2);
});

test('quantity editing does not send partial input before blur', async () => {
  const commits = [];
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(h(QuantityInput, { value: 2, onCommit: (value) => commits.push(value) })));
  const input = document.querySelector('input');
  input.focus();
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '12');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.deepEqual(commits, []);
  await React.act(async () => input.blur());
  assert.deepEqual(commits, [12]);
});

test('cancellation restores and retries the exact reason and key', async () => {
  const payload = { requestKey: 'original-key', reason: 'Original reason' };
  sessionStorage.setItem('brightbuy:cancel:1:5', JSON.stringify(payload));
  const attempts = [];
  await mount(() => h(CancelOrderForm, { orderId: 5, onSuccess() {} }), async (path, options) => {
    attempts.push(JSON.parse(options.body));
    throw new Error('Disconnected');
  });
  assert.equal(document.querySelector('input').value, payload.reason);
  assert.equal(document.querySelector('input').disabled, true);
  await click('Retry cancellation');
  await click('Retry cancellation');
  assert.deepEqual(attempts, [payload, payload]);
});

test('allocation retries keep the same key and legacy orders offer no lifecycle actions', async () => {
  const attempts = [];
  await mount(AdminFulfilmentPage, async (path, options) => {
    if (options.method === 'POST') { attempts.push(JSON.parse(options.body)); throw Error('Disconnected'); }
    return [
      { id: 3, status: 'backordered', isLegacy: false, fulfillment: 'pickup', total: '10.00', currency: 'USD' },
      { id: 4, status: 'confirmed', isLegacy: true, fulfillment: 'delivery', total: '10.00', currency: 'USD' },
    ];
  }, 'admin');
  assert.ok(!document.body.textContent.includes('Start Processing'));
  await click('Allocate Stock');
  await click('Retry allocation');
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0], attempts[1]);
});

test('city-load errors are visible and the address form can recover', async () => {
  let failed = true;
  await mount(AddressesPage, async (path) => {
    if (path === '/cities' && failed) throw Error('Disconnected');
    return path === '/cities' ? [{ id: 1, name: 'Austin', isActive: true }] : [];
  });
  assert.ok(document.querySelector('[role="alert"]'));
  failed = false;
  await click('Retry');
  await click('Add New Address');
  assert.ok(document.querySelector('form'));
});

test('stock adjustment retries lock and preserve the submitted quantity and reason', async () => {
  const payload = { requestKey: 'stock-key', quantityDelta: 5, reason: 'Restock' };
  sessionStorage.setItem('brightbuy:stock:1:9', JSON.stringify(payload));
  const attempts = [];
  await mount(AdminInventoryPage, async (path, options) => {
    if (options.method === 'POST') { attempts.push(JSON.parse(options.body)); throw Error('Offline'); }
    return [{ id: 9, productTitle: 'Product', title: 'Variant', sku: 'TEST', stock: 5, active: true }];
  }, 'admin');
  await click('Adjust');
  assert.ok([...document.querySelectorAll('form input')].every((input) => input.disabled));
  await click('Retry same adjustment');
  await click('Retry same adjustment');
  assert.deepEqual(attempts, [payload, payload]);
});

test('catalogue category-loading failures appear in the product form', async () => {
  await mount(AdminCataloguePage, async (path) => {
    if (path === '/categories') throw Error('Offline');
    return [];
  }, 'admin');
  await click('New product');
  assert.match(document.body.textContent, /Cannot reach the server/);
});


test('late profile updates cannot restore a signed-out user or overwrite another account', async () => {
  let auth;
  function Probe() { auth = useAuth(); return null; }
  globalThis.fetch = async () => Response.json({ data: { accessToken: 'test', user: { id: 1, name: 'Test' } } });
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(h(AuthProvider, null, h(Probe))));
  await React.act(async () => auth.login('test@example.com', 'password'));
  await React.act(async () => auth.updateUser({ id: 2, name: 'Other account' }));
  assert.equal(auth.user.name, 'Test');
  await React.act(async () => auth.logout());
  await React.act(async () => auth.updateUser({ id: 1, name: 'Late profile' }));
  assert.equal(auth.user, null);
});

test('late login responses cannot undo logout or replace a newer login', async () => {
  let auth;
  function Probe() { auth = useAuth(); return null; }
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(h(AuthProvider, null, h(Probe))));
  const responses = [];
  globalThis.fetch = () => new Promise(resolve => responses.push(resolve));
  const result = (id) => Response.json({ data: { accessToken: 'token-' + id, user: { id } } });
  let oldLogin;
  await React.act(async () => { oldLogin = auth.login('old@test', 'password'); });
  const rejectedOld = assert.rejects(oldLogin, /no longer current/);
  await React.act(async () => auth.logout());
  await React.act(async () => { responses.shift()(result(1)); await rejectedOld; });
  assert.equal(auth.user, null);
  let first;
  let second;
  await React.act(async () => {
    first = auth.login('first@test', 'password');
    second = auth.login('second@test', 'password');
  });
  const rejectedFirst = assert.rejects(first, /no longer current/);
  await React.act(async () => { responses[1](result(2)); await second; });
  await React.act(async () => { responses[0](result(1)); await rejectedFirst; });
  assert.equal(auth.user.id, 2);
});


test('valid profile edits preserve authentication and logout removes the bearer token', async () => {
  const { api } = await import('../src/api.js');
  let auth;
  let authorization;
  function Probe() { auth = useAuth(); return null; }
  globalThis.fetch = async (path, options) => {
    if (path === '/api/auth/login') return Response.json({ data: {
      accessToken: 'profile-token', user: { id: 4, name: 'Before', role: 'customer', email: 'user@test' },
    } });
    authorization = options.headers.get('Authorization');
    return Response.json({ data: [] });
  };
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(h(AuthProvider, null, h(Probe))));
  await React.act(async () => auth.login('user@test', 'password'));
  await React.act(async () => auth.updateUser({ id: 4, name: 'After' }));
  assert.deepEqual(auth.user, { id: 4, name: 'After', role: 'customer', email: 'user@test' });
  await api('/orders');
  assert.equal(authorization, 'Bearer profile-token');
  await React.act(async () => auth.logout());
  await api('/products');
  assert.equal(authorization, null);
  assert.equal(auth.user, null);
});

test('a failed replacement login preserves the current account and bearer token', async () => {
  const { api } = await import('../src/api.js');
  let auth;
  let rejectLogin = false;
  let authorization;
  function Probe() { auth = useAuth(); return null; }
  globalThis.fetch = async (path, options) => {
    if (path === '/api/auth/login') {
      if (rejectLogin) return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Wrong password' } }, { status: 401 });
      return Response.json({ data: { accessToken: 'current-token', user: { id: 5, name: 'Current' } } });
    }
    authorization = options.headers.get('Authorization');
    return Response.json({ data: [] });
  };
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(h(AuthProvider, null, h(Probe))));
  await React.act(async () => auth.login('current@test', 'password'));
  rejectLogin = true;
  await React.act(async () => {
    await assert.rejects(auth.login('other@test', 'wrong'), { status: 401 });
  });
  assert.equal(auth.user.id, 5);
  await api('/orders');
  assert.equal(authorization, 'Bearer current-token');
});
