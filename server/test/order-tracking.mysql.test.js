import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { runSetup } from '../src/database/setup.js';
import { createApp } from '../src/app.js';
import { makeCheckout } from '../src/services/checkout.js';
import { getDestination, deliveryDays } from '../src/services/locations.js';
import { applyStockChange } from '../src/services/inventory.js';

test(
  'shared seed and tracking/cancellation API on disposable MySQL',
  { skip: process.env.TRACKING_TEST_MYSQL !== '1' },
  async (t) => {
    const database = process.env.MYSQL_TEST_DATABASE;
    assert.match(database || '', /^brightbuy_tracking_test(?:_[a-z0-9]+)?$/);
    const mysql = createRequire(import.meta.url)('mysql2/promise');
    const config = {
      host: process.env.MYSQL_TEST_HOST,
      user: process.env.MYSQL_TEST_USER,
      password: process.env.MYSQL_TEST_PASSWORD,
      database,
      timezone: 'Z',
      connectionLimit: 5,
    };
    let pool = mysql.createPool(config),
      server;
    const secret = 'tracking-test-only-secret-at-least-32-characters';
    try {
      const [tables] = await pool.query('SHOW TABLES');
      assert.equal(tables.length, 0, 'Use a new empty test database.');
      await runSetup(pool, { seedDemo: true, seedProject: true });
      pool = mysql.createPool(config);
      await t.test('fresh shared project setup loads locations', async () => {
        const [[counts]] = await pool.query(
          'SELECT (SELECT COUNT(*) FROM cities) AS cities, (SELECT COUNT(*) FROM stores) AS stores',
        );
        assert.deepEqual(counts, { cities: 6, stores: 8 });
      });
      await t.test('an existing catalogue seed still receives missing locations', async () => {
        // All rows here belong exclusively to this disposable test database.
        await pool.query('DELETE FROM stores');
        await pool.query('DELETE FROM cities');
        await pool.execute('DELETE FROM schema_migrations WHERE version=?', ['locations-demo-v1']);
        await runSetup(pool, { seedProject: true });
        pool = mysql.createPool(config);
        const [[counts]] = await pool.query(
          'SELECT (SELECT COUNT(*) FROM cities) AS cities, (SELECT COUNT(*) FROM stores) AS stores',
        );
        assert.deepEqual(counts, { cities: 6, stores: 8 });
        await pool.query("UPDATE cities SET is_main_city=0 WHERE name='Dallas'");
        await runSetup(pool, { seedProject: true });
        pool = mysql.createPool(config);
        const [[city]] = await pool.query("SELECT is_main_city FROM cities WHERE name='Dallas'");
        assert.equal(city.is_main_city, 0, 'Repeated shared seed preserves admin edits.');
      });
      const [[owner]] = await pool.query(
        "SELECT id FROM customers WHERE role='customer' ORDER BY id LIMIT 1",
      );
      const [[other]] = await pool.query(
        "SELECT id FROM customers WHERE role='customer' AND id<>? LIMIT 1",
        [owner.id],
      );
      const [[admin]] = await pool.query("SELECT id FROM customers WHERE role='admin' LIMIT 1");
      const [[store]] = await pool.query(
        'SELECT s.id FROM stores s JOIN cities c ON c.id=s.city_id WHERE s.is_active=1 AND c.is_active=1 LIMIT 1',
      );
      const [[variant]] = await pool.query(
        'SELECT v.id FROM variants v JOIN products p ON p.id=v.product_id WHERE p.is_legacy=0 ORDER BY v.price LIMIT 1',
      );
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await applyStockChange(connection, {
          variantId: variant.id,
          quantityDelta: 5,
          movementType: 'adjustment',
          adminId: admin.id,
          referenceKey: `adjust:${randomUUID()}`,
          reason: 'Tracking test stock',
        });
        await connection.commit();
      } finally {
        connection.release();
      }
      await pool.execute('INSERT INTO carts(customer_id) VALUES (?)', [owner.id]);
      const [[cart]] = await pool.execute('SELECT id FROM carts WHERE customer_id=?', [owner.id]);
      await pool.execute('INSERT INTO cart_items(cart_id,variant_id,quantity) VALUES (?,?,1)', [
        cart.id,
        variant.id,
      ]);
      const checkout = makeCheckout({
        getDestination,
        deliveryDays,
        applyStockChange,
        async readCart(conn, id) {
          const [[entry]] = await conn.execute(
            'SELECT id,version FROM carts WHERE customer_id=? FOR UPDATE',
            [id],
          );
          const [items] = await conn.execute(
            'SELECT variant_id AS variantId,quantity FROM cart_items WHERE cart_id=?',
            [entry.id],
          );
          return { version: entry.version, items };
        },
      });
      const result = await checkout(
        pool,
        { id: owner.id, role: 'customer' },
        {
          fulfillment: 'pickup',
          storeId: store.id,
          paymentMethod: 'card',
          simulationToken: 'demo-approved',
          cartVersion: 0,
          requestKey: randomUUID(),
        },
      );
      const orderId = result.data.id;
      assert.equal(result.data.status, 'confirmed');
      server = createApp(pool, secret).listen(0, '127.0.0.1');
      await new Promise((resolve) => server.once('listening', resolve));
      const base = `http://127.0.0.1:${server.address().port}/api`;
      const token = (id) =>
        jwt.sign({}, secret, {
          subject: String(id),
          issuer: 'brightbuy',
          audience: 'brightbuy-web',
          expiresIn: '1h',
        });
      async function request(path, id, body, method = body ? 'POST' : 'GET') {
        const response = await fetch(base + path, {
          method,
          headers: {
            ...(id ? { Authorization: `Bearer ${token(id)}` } : {}),
            'Content-Type': 'application/json',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: response.status, body: await response.json() };
      }
      await t.test(
        'owner reads coherent snapshots/payment/history; private records stay hidden',
        async () => {
          assert.equal((await request(`/orders/${orderId}`)).status, 401);
          assert.equal((await request(`/orders/${orderId}`, other.id)).status, 404);
          const response = await request(`/orders/${orderId}`, owner.id);
          assert.equal(response.status, 200);
          const detail = response.body.data;
          assert.equal(detail.isLegacy, false);
          assert.equal(detail.payment.status, 'paid');
          assert.equal(detail.delivery.destinationSnapshot.storeId, store.id);
          assert.match(detail.delivery.estimatedDate, /^\d{4}-\d{2}-\d{2}$/);
          assert.equal(detail.history.at(-1).toStatus, 'confirmed');
          assert.equal('requestKey' in detail, false);
          const list = await request('/orders', owner.id);
          assert.equal(list.body.data.find((row) => row.id === orderId).payment.status, 'paid');
          const [[legacy]] = await pool.query(
            'SELECT id FROM orders WHERE customer_id=? AND stock_state IS NULL LIMIT 1',
            [owner.id],
          );
          const old = await request(`/orders/${legacy.id}`, owner.id);
          assert.equal(old.body.data.isLegacy, true);
          assert.equal(old.body.data.payment, null);
          assert.deepEqual(old.body.data.nextStatuses, []);
          assert.equal(
            (
              await request(
                `/admin/orders/${orderId}/status`,
                admin.id,
                { status: 'processing' },
                'PATCH',
              )
            ).status,
            409,
          );
        },
      );
      await t.test(
        'cancellation uses M3 transaction and M4 stock routine and replays once',
        async () => {
          const payload = { requestKey: randomUUID(), reason: 'Test cancellation' };
          assert.equal((await request(`/orders/${orderId}/cancel`, other.id, payload)).status, 404);
          assert.equal(
            (await request(`/admin/orders/${orderId}/cancel`, owner.id, payload)).status,
            403,
          );
          const first = await request(`/orders/${orderId}/cancel`, owner.id, payload);
          assert.equal(first.status, 200);
          assert.equal(first.body.data.status, 'cancelled');
          assert.equal(first.body.data.payment.status, 'refunded');
          assert.equal((await request(`/orders/${orderId}/cancel`, owner.id, payload)).status, 200);
          assert.equal(
            (
              await request(`/orders/${orderId}/cancel`, owner.id, {
                ...payload,
                requestKey: randomUUID(),
              })
            ).status,
            409,
          );
          const [[counts]] = await pool.query(
            "SELECT COUNT(*) AS count FROM inventory_movements WHERE order_id=? AND movement_type='cancellation'",
            [orderId],
          );
          assert.equal(counts.count, 1);
          const detail = (await request(`/orders/${orderId}`, owner.id)).body.data;
          assert.equal(detail.history.at(-1).toStatus, 'cancelled');
          assert.equal(detail.delivery.estimatedDate, result.data.delivery.estimatedDate);
        },
      );
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await pool.end();
    }
  },
);
