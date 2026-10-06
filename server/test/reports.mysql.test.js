import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { runSetup } from '../src/database/setup.js';
import { makeCheckout } from '../src/services/checkout.js';
import { makeCancellation } from '../src/services/cancellation.js';
import { applyStockChange } from '../src/services/inventory.js';
import { getDestination, deliveryDays } from '../src/services/locations.js';
import { readReport, REPORT_QUERIES } from '../src/services/reports.js';
import { reportInput } from '../src/routes/reports.js';
import { apply as applyReportIndexes } from '../db/008-report-indexes.mjs';

test(
  'five reports have hand-calculated MySQL totals and immutable historical grouping',
  { skip: process.env.REPORTS_TEST_MYSQL !== '1' },
  async (t) => {
    const database = process.env.MYSQL_TEST_DATABASE;
    assert.match(database || '', /^brightbuy_reports_test(?:_[a-z0-9]+)?$/);
    const mysql = createRequire(import.meta.url)('mysql2/promise');
    const config = {
      host: process.env.MYSQL_TEST_HOST,
      user: process.env.MYSQL_TEST_USER,
      password: process.env.MYSQL_TEST_PASSWORD,
      database,
      timezone: 'Z',
      connectionLimit: 5,
    };
    let pool = mysql.createPool(config);
    try {
      assert.equal(
        (await pool.query('SHOW TABLES'))[0].length,
        0,
        'Use a fresh disposable database.',
      );
      await runSetup(pool, { seedDemo: true, seedProject: true });
      pool = mysql.createPool(config);
      const [users] = await pool.query(
        "SELECT id FROM customers WHERE role='customer' ORDER BY id",
      );
      const [[admin]] = await pool.query("SELECT id FROM customers WHERE role='admin' LIMIT 1");
      const [products] = await pool.query(
        'SELECT id FROM products WHERE is_legacy=0 ORDER BY id LIMIT 2',
      );
      const [speakerVariants] = await pool.query(
        'SELECT id FROM variants WHERE product_id=? ORDER BY id LIMIT 2',
        [products[0].id],
      );
      const [[toy]] = await pool.query(
        'SELECT id FROM variants WHERE product_id=? ORDER BY id LIMIT 1',
        [products[1].id],
      );
      const [categories] = await pool.query('SELECT id FROM categories ORDER BY id LIMIT 2');
      const audioId = categories[0].id,
        toysId = categories[1].id;
      await pool.query("UPDATE products SET name='Report Speaker' WHERE id=?", [products[0].id]);
      await pool.query("UPDATE products SET name='Report Toy' WHERE id=?", [products[1].id]);
      await pool.query('UPDATE variants SET price=40.00 WHERE product_id=?', [products[0].id]);
      await pool.query('UPDATE variants SET price=20.00 WHERE product_id=?', [products[1].id]);
      await pool.query(
        'DELETE FROM product_categories WHERE product_id IN (?,?)',
        products.map((row) => row.id),
      );
      await pool.execute(
        'INSERT INTO product_categories(product_id,category_id) VALUES (?,?),(?,?)',
        [products[0].id, audioId, products[1].id, toysId],
      );
      const [[store]] = await pool.query(
        'SELECT id FROM stores WHERE is_active=1 ORDER BY id LIMIT 1',
      );
      const [[city]] = await pool.query("SELECT id FROM cities WHERE name='Dallas'");
      const [address] = await pool.execute(
        "INSERT INTO addresses(customer_id,recipient,line1,city,city_id,postal_code,country) VALUES (?,'Report Customer','1 Fictional Road','Dallas',?,'75001','US')",
        [users[0].id, city.id],
      );
      for (const user of users)
        await pool.execute('INSERT INTO carts(customer_id) VALUES (?)', [user.id]);
      async function stock(variantId, quantity) {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          await applyStockChange(connection, {
            variantId,
            quantityDelta: quantity,
            movementType: 'adjustment',
            adminId: admin.id,
            referenceKey: `adjust:${randomUUID()}`,
            reason: 'Disposable report fixtures',
          });
          await connection.commit();
        } finally {
          connection.release();
        }
      }
      const checkout = makeCheckout({
        getDestination,
        deliveryDays,
        applyStockChange,
        async readCart(connection, customerId) {
          const [[cart]] = await connection.execute(
            'SELECT id,version FROM carts WHERE customer_id=? FOR UPDATE',
            [customerId],
          );
          const [items] = await connection.execute(
            'SELECT variant_id AS variantId,quantity FROM cart_items WHERE cart_id=?',
            [cart.id],
          );
          return { version: cart.version, items };
        },
      });
      async function place(customerId, lines, created, method = 'cod', delivery = false) {
        const [[cart]] = await pool.execute('SELECT id,version FROM carts WHERE customer_id=?', [
          customerId,
        ]);
        for (const [variant, quantity] of lines)
          await pool.execute('INSERT INTO cart_items VALUES (?,?,?)', [cart.id, variant, quantity]);
        const result = await checkout(
          pool,
          { id: customerId, role: 'customer' },
          {
            fulfillment: delivery ? 'delivery' : 'pickup',
            ...(delivery ? { addressId: address.insertId } : { storeId: store.id }),
            paymentMethod: method,
            ...(method === 'card' ? { simulationToken: 'demo-approved' } : {}),
            cartVersion: cart.version,
            requestKey: randomUUID(),
          },
        );
        await pool.execute('UPDATE orders SET created_at=? WHERE id=?', [
          `${created} 00:00:00`,
          result.data.id,
        ]);
        await pool.execute(
          'UPDATE deliveries SET estimated_date=DATE_ADD(?,INTERVAL 5 DAY) WHERE order_id=?',
          [created, result.data.id],
        );
        return result.data.id;
      }
      await stock(speakerVariants[0].id, 5);
      const a = await place(users[0].id, [[speakerVariants[0].id, 2]], '2026-01-10', 'card', true);
      const b = await place(
        users[0].id,
        [
          [speakerVariants[0].id, 1],
          [toy.id, 1],
        ],
        '2026-01-11',
      );
      await stock(toy.id, 5);
      const c = await place(users[1].id, [[toy.id, 1]], '2026-04-01');
      const d = await place(users[1].id, [[toy.id, 1]], '2026-01-12', 'card');
      const cancel = makeCancellation({
        applyStockChange: (connection, change) =>
          applyStockChange(connection, {
            ...change,
            movementType: change.movementType === 'cancel' ? 'cancellation' : change.movementType,
          }),
      });
      await cancel(pool, { id: users[1].id, role: 'customer' }, d, {
        requestKey: randomUUID(),
        reason: 'Report refund fixture',
      });
      const report = (name, query) => readReport(pool, name, reportInput(name, query));
      const january = '?from=2026-01-01&to=2026-01-31';
      await t.test(
        'quarterly returns four quarters and excludes cancelled/legacy orders',
        async () => {
          assert.deepEqual((await report('quarterly-sales', '?year=2026')).quarters, [
            { quarter: 1, orderCount: 2, salesAmount: '140.00' },
            { quarter: 2, orderCount: 1, salesAmount: '20.00' },
            { quarter: 3, orderCount: 0, salesAmount: '0.00' },
            { quarter: 4, orderCount: 0, salesAmount: '0.00' },
          ]);
          assert.ok(
            (await report('quarterly-sales', '?year=2025')).quarters.every(
              (row) => row.salesAmount === '0.00',
            ),
          );
        },
      );
      await t.test('products aggregate snapshot prices and rank quantities', async () => {
        const result = await report('top-products', january);
        assert.deepEqual(
          result.items.map(({ quantity, salesAmount }) => ({ quantity, salesAmount })),
          [
            { quantity: 3, salesAmount: '120.00' },
            { quantity: 1, salesAmount: '20.00' },
          ],
        );
        await pool.query('UPDATE variants SET price=99.00 WHERE id=?', [speakerVariants[0].id]);
        assert.equal((await report('top-products', january)).items[0].salesAmount, '120.00');
      });
      await t.test(
        'categories use DISTINCT checkout snapshots and retain zero categories',
        async () => {
          await pool.query('DELETE FROM product_categories WHERE product_id=?', [products[0].id]);
          await pool.execute('INSERT INTO product_categories VALUES (?,?)', [
            products[0].id,
            toysId,
          ]);
          const items = (await report('category-orders', january)).items;
          assert.equal(items.find((row) => row.categoryId === audioId).orderCount, 2);
          assert.equal(items.find((row) => row.categoryId === toysId).orderCount, 1);
          assert.ok(items.some((row) => row.orderCount === 0));
        },
      );
      await t.test('upcoming uses stored estimates and typed flags for both modes', async () => {
        const rows = (await report('upcoming-deliveries', january)).items;
        assert.deepEqual(
          rows.map((row) => row.orderId),
          [a, b],
        );
        assert.deepEqual(
          rows.map((row) => row.fulfillment),
          ['delivery', 'pickup'],
        );
        assert.deepEqual(
          rows.map((row) => row.wasOutOfStock),
          [false, true],
        );
        assert.ok(
          rows.every((row) => typeof row.isOverdue === 'boolean' && row.actualDate === null),
        );
      });
      await t.test(
        'customer sums do not multiply item/payment joins and include refunds',
        async () => {
          const rows = (await report('customer-orders', january)).items;
          assert.deepEqual(
            rows.map(({ orderCount, orderedAmount, paidAmount, refundedAmount }) => ({
              orderCount,
              orderedAmount,
              paidAmount,
              refundedAmount,
            })),
            [
              {
                orderCount: 2,
                orderedAmount: '140.00',
                paidAmount: '80.00',
                refundedAmount: '0.00',
              },
              { orderCount: 1, orderedAmount: '0.00', paidAmount: '0.00', refundedAmount: '20.00' },
            ],
          );
          assert.equal(rows[0].orders.length, 2);
          assert.equal(rows[1].orders[0].paymentStatus, 'refunded');
          assert.deepEqual(
            (await report('customer-orders', january + '&customerId=4294967295')).items,
            [],
          );
        },
      );
      await t.test(
        'inclusive single-day and quarter boundary filters preserve exact dates',
        async () => {
          assert.equal(
            (await report('customer-orders', '?from=2026-04-01&to=2026-04-01')).items[0].orders[0]
              .id,
            c,
          );
          assert.deepEqual(
            (await report('top-products', '?from=2026-03-31&to=2026-03-31')).items,
            [],
          );
        },
      );
      await t.test(
        'multiple variants, quantity ties and repeated multi-category lines',
        async () => {
          await pool.query('UPDATE variants SET price=40.00 WHERE product_id=?', [products[0].id]);
          await pool.query(
            'DELETE FROM product_categories WHERE product_id IN (?,?)',
            products.map((row) => row.id),
          );
          await pool.execute('INSERT INTO product_categories VALUES (?,?),(?,?),(?,?)', [
            products[0].id,
            audioId,
            products[0].id,
            toysId,
            products[1].id,
            audioId,
          ]);
          await place(
            users[0].id,
            [
              [speakerVariants[0].id, 1],
              [speakerVariants[1].id, 1],
              [toy.id, 2],
            ],
            '2027-01-02',
          );
          const range = '?from=2027-01-01&to=2027-01-31';
          const top = (await report('top-products', range)).items;
          assert.deepEqual(
            top.map((row) => [row.productId, row.quantity, row.salesAmount]),
            [
              [products[0].id, 2, '80.00'],
              [products[1].id, 2, '40.00'],
            ],
          );
          const categories = (await report('category-orders', range)).items;
          assert.equal(categories.find((row) => row.categoryId === audioId).orderCount, 1);
          assert.equal(categories.find((row) => row.categoryId === toysId).orderCount, 1);
        },
      );
      await t.test('report index migration safely tolerates repeated application', async () => {
        const connection = await pool.getConnection();
        try {
          await applyReportIndexes(connection);
          await applyReportIndexes(connection);
        } finally {
          connection.release();
        }
        const [indexes] = await pool.query(
          "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND INDEX_NAME IN ('idx_report_orders_currency_created','idx_report_delivery_estimated') AND SEQ_IN_INDEX=1",
        );
        assert.equal(indexes.length, 2);
      });
      // Actual plans are printed as evidence; indexes are assessed separately before migration.
      for (const [key, sql] of Object.entries(REPORT_QUERIES)) {
        const params =
          key === 'top'
            ? ['2026-01-01', '2026-02-01', 10]
            : key === 'customers'
              ? ['2026-01-01', '2026-02-01', null, null]
              : ['2026-01-01', '2026-02-01'];
        const [plan] = await pool.query('EXPLAIN ' + sql, params);
        console.log(JSON.stringify({ report: key, plan }));
      }
    } finally {
      await pool.end();
    }
  },
);
