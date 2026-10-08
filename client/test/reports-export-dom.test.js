import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

register('../testing/jsx-loader.mjs', import.meta.url);
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'sessionStorage', 'FormData', 'CustomEvent'])
  globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');
const { AuthProvider, useAuth } = await import('../src/auth/AuthProvider.jsx');
const { AdminReportsPage } = await import('../src/pages/AdminReportsPage.jsx');
const h = React.createElement;
let root, downloaded, filename;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const originalClick = window.HTMLAnchorElement.prototype.click;
const flush = () => React.act(() => new Promise((resolve) => setTimeout(resolve, 20)));
const period = { scope: 'project-orders-usd', timezone: 'America/Chicago', currency: 'USD' };
function Session() {
  const { user, login } = useAuth();
  React.useEffect(() => {
    login('admin@test', 'password');
  }, []);
  return user ? h(AdminReportsPage) : null;
}
async function mount(handler) {
  downloaded = null;
  URL.createObjectURL = (blob) => {
    downloaded = blob;
    return 'blob:report-test';
  };
  URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () {
    filename = this.download;
  };
  globalThis.fetch = async (path) => {
    if (path === '/api/auth/login')
      return Response.json({ data: { accessToken: 'test', user: { id: 1, role: 'admin' } } });
    if (path === '/api/admin/customers') return Response.json({ data: [] });
    return Response.json({ data: await handler(path) });
  };
  root = createRoot(document.getElementById('root'));
  await React.act(async () =>
    root.render(h(MemoryRouter, null, h(AuthProvider, null, h(Session)))),
  );
  await flush();
}
const exportButton = () =>
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Export CSV');
async function changeReport(value) {
  await React.act(async () => {
    const select = document.querySelector('select');
    select.value = value;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
async function run() {
  await React.act(async () =>
    document
      .querySelector('form')
      .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })),
  );
  await flush();
}
afterEach(async () => {
  if (root) await React.act(async () => root.unmount());
  root = null;
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  window.HTMLAnchorElement.prototype.click = originalClick;
  sessionStorage.clear();
});

test('download uses the displayed report and applied filters until a new report runs', async () => {
  await mount(async (path) => {
    const params = new URLSearchParams(path.split('?')[1]);
    return path.includes('quarterly-sales')
      ? {
          ...period,
          year: Number(params.get('year')),
          quarters: [{ quarter: 1, orderCount: 1, salesAmount: '40.00' }],
        }
      : { ...period, from: params.get('from'), to: params.get('to'), items: [] };
  });
  await changeReport('top-products');
  await React.act(async () => exportButton().click());
  assert.match(await downloaded.text(), /"Report","Quarterly sales"/);
  assert.match(filename, /^brightbuy-quarterly-sales-\d{4}\.csv$/);
  await run();
  await React.act(async () => exportButton().click());
  const csv = await downloaded.text();
  assert.match(csv, /"Report","Top-selling products"/);
  assert.match(csv, /"Filter: limit","10"/);
  assert.match(csv, /"Product ID","Product","Units","Ordered value \(USD\)"/);
  assert.match(filename, /^brightbuy-top-products-\d{4}-\d{2}-\d{2}-to-/);
  assert.equal(document.querySelector('a[download]'), null);
});

test('export is unavailable during loading and after a report request fails', async () => {
  let reject;
  await mount(async (path) => {
    if (path.includes('quarterly-sales')) return { ...period, year: 2026, quarters: [] };
    return new Promise((_, fail) => {
      reject = fail;
    });
  });
  assert.ok(exportButton());
  await changeReport('upcoming-deliveries');
  await run();
  assert.equal(exportButton(), undefined);
  await React.act(async () => reject(new Error('Report unavailable')));
  await flush();
  assert.match(document.body.textContent, /Cannot reach the server/);
  assert.equal(exportButton(), undefined);
});
