import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportCsv } from '../src/utils/report-csv.js';

const period = {
  scope: 'project-orders-usd',
  timezone: 'America/Chicago',
  currency: 'USD',
  from: '2026-10-01',
  to: '2026-10-08',
};
const options = {
  title: 'Test report',
  description: 'Original stored values.',
  query: 'from=2026-10-01&to=2026-10-08&limit=10',
};

test('quarterly export preserves exact large money values and zero quarters', () => {
  const csv = reportCsv(
    'quarterly-sales',
    {
      ...period,
      year: 2026,
      quarters: [
        { quarter: 1, orderCount: 2, salesAmount: '9007199254740993.01' },
        { quarter: 2, orderCount: 0, salesAmount: '0.00' },
      ],
    },
    { ...options, query: 'year=2026' },
  );
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Q1","2","9007199254740993.01"\r\n'));
  assert.ok(csv.includes('"Q2","0","0.00"'));
  assert.ok(csv.includes('"Timezone","America/Chicago"'));
  assert.ok(csv.includes('"Filter: year","2026"'));
});

test('product and category exports escape names and neutralize spreadsheet formulas', () => {
  const csv = reportCsv(
    'top-products',
    {
      ...period,
      items: [
        { productId: 1, name: 'Speaker, "Large"\nEdition', quantity: 3, salesAmount: '120.00' },
        { productId: 2, name: ' =HYPERLINK("example")', quantity: 1, salesAmount: '20.00' },
      ],
    },
    options,
  );
  assert.ok(csv.includes('"Speaker, ""Large""\nEdition"'));
  assert.ok(csv.includes('"\' =HYPERLINK(""example"")"'));
  assert.ok(csv.includes('"Filter: limit","10"'));
  const categories = reportCsv(
    'category-orders',
    {
      ...period,
      items: [{ categoryId: 5, name: '@SUM(1)', orderCount: 0 }],
    },
    options,
  );
  assert.ok(categories.includes('"5","\'@SUM(1)","0"'));
});

test('upcoming export keeps calendar dates and does not claim a backordered pickup is ready', () => {
  const csv = reportCsv(
    'upcoming-deliveries',
    {
      ...period,
      items: [
        {
          orderId: 9,
          fulfillment: 'pickup',
          status: 'backordered',
          estimatedDate: '2026-10-08',
          actualDate: null,
          wasOutOfStock: true,
          isOverdue: false,
        },
      ],
    },
    options,
  );
  assert.ok(csv.includes('"9","Pickup","backordered","2026-10-08","","Yes","No"'));
  assert.ok(!csv.includes('Pickup ready'));
});

test('customer export separates totals from individual orders and preserves refunds', () => {
  const csv = reportCsv(
    'customer-orders',
    {
      ...period,
      items: [
        {
          customerId: 3,
          name: 'Customer',
          orderCount: 2,
          orderedAmount: '80.00',
          paidAmount: '80.00',
          refundedAmount: '20.00',
          orders: [
            { id: 1, total: '80.00', status: 'shipped', paymentStatus: 'paid' },
            { id: 2, total: '20.00', status: 'cancelled', paymentStatus: 'refunded' },
          ],
        },
      ],
    },
    options,
  );
  assert.ok(csv.includes('"3","Customer","2","80.00","80.00","20.00"'));
  assert.ok(csv.includes('"3","Customer","1","80.00","Dispatched","paid"'));
  assert.ok(csv.includes('"3","Customer","2","20.00","cancelled","refunded"'));
  assert.equal(csv.split('"80.00","80.00","20.00"').length - 1, 1);
});

test('empty reports still export metadata and column headings', () => {
  for (const name of [
    'top-products',
    'category-orders',
    'upcoming-deliveries',
    'customer-orders',
  ]) {
    const csv = reportCsv(name, { ...period, items: [] }, options);
    assert.ok(csv.includes('"Scope","project-orders-usd"'));
    assert.ok(csv.includes('"Filter: from","2026-10-01"'));
    assert.ok(!csv.includes('undefined'));
  }
});
