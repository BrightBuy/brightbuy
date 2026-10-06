import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportInput, createReportRoutes } from '../src/routes/reports.js';
import express from 'express';
import { errorHandler } from '../src/errors.js';
import { readReport } from '../src/services/reports.js';

test('customer monetary aggregates remain exact beyond floating point integer precision', async () => {
  const rows = Array.from({ length: 10000 }, (_, index) => ({
    customerId: 1,
    name: 'Aggregate',
    id: index + 1,
    total: '9999999999.99',
    status: 'confirmed',
    paymentStatus: 'paid',
    paymentAmount: '9999999999.99',
    paymentCurrency: 'USD',
  }));
  const connection = {
    async query() {
      return [[]];
    },
    async execute() {
      return [rows];
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
  };
  const result = await readReport(
    {
      async getConnection() {
        return connection;
      },
    },
    'customer-orders',
    { from: '2026-01-01', to: '2026-01-31', end: '2026-02-01' },
  );
  assert.equal(result.items[0].orderedAmount, '99999999999900.00');
  assert.equal(result.items[0].paidAmount, '99999999999900.00');
});

test('report periods reject malformed, repeated, impossible, reversed and oversized inputs', () => {
  for (const url of [
    '?from=2026-02-29&to=2026-03-01',
    '?from=2026-01-01&to=2027-01-02',
    '?from=2026-01-02&to=2026-01-01',
    '?from=2026-01-01&from=2026-01-01&to=2026-01-02',
    '?from=2026-01-01&to=2026-01-02&x=1',
    '?to=2026-01-01',
  ])
    assert.throws(() => reportInput('category-orders', url), { status: 400 });
  assert.equal(reportInput('top-products', '?from=2028-02-29&to=2028-02-29').end, '2028-03-01');
  assert.equal(reportInput('category-orders', '?from=2028-01-01&to=2028-12-31').end, '2029-01-01');
  for (const year of ['1999', '2101', '2026.5', '+2026', ''])
    assert.throws(() => reportInput('quarterly-sales', `?year=${year}`), { status: 400 });
  for (const limit of ['0', '51', '1.5', ''])
    assert.throws(
      () => reportInput('top-products', `?from=2026-01-01&to=2026-01-01&limit=${limit}`),
      { status: 400 },
    );
  assert.throws(
    () => reportInput('customer-orders', '?from=2026-01-01&to=2026-01-01&customerId=4294967296'),
    { status: 400 },
  );
});
test('all five reports protect visitors and customers before querying the database', async () => {
  const app = express();
  app.use(
    createReportRoutes({}, (req, res, next) => {
      if (!req.headers.authorization) return res.status(401).json({ error: {} });
      req.user = { role: 'customer' };
      next();
    }),
  );
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    for (const name of [
      'quarterly-sales',
      'top-products',
      'category-orders',
      'upcoming-deliveries',
      'customer-orders',
    ]) {
      const url = `http://127.0.0.1:${server.address().port}/admin/reports/${name}`;
      assert.equal((await fetch(url)).status, 401);
      assert.equal((await fetch(url, { headers: { Authorization: 'customer' } })).status, 403);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
