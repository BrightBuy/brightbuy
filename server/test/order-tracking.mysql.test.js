import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { runSetup } from '../src/database/setup.js';
import { createApp } from '../src/app.js';
import { makeCheckout } from '../src/services/checkout.js';
import { putCartItem, readCartForCheckout } from '../src/services/cart.js';
import { getDestination, deliveryDays } from '../src/services/locations.js';
import { applyStockChange } from '../src/services/inventory.js';
import { inTransaction } from '../src/utils/transaction.js';
import { seedCheckoutScenarios, CHECKOUT_SCENARIOS } from '../src/database/seedCheckout.js';

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
      const preparedCart = await putCartItem(pool, owner.id, variant.id, 1);
      const checkout = makeCheckout({
        readCart: readCartForCheckout, getDestination, deliveryDays, applyStockChange,
      });
      const result = await checkout(
        pool,
        { id: owner.id, role: 'customer' },
        {
          fulfillment: 'pickup',
          storeId: store.id,
          paymentMethod: 'card',
          simulationToken: 'demo-approved',
          cartVersion: preparedCart.version,
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
      async function snapshot() {
        const data = {};
        for (const table of ['orders', 'payments', 'inventory_movements', 'order_status_history', 'carts', 'variants']) {
          [data[table]] = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
        }
        [data.items] = await pool.query('SELECT * FROM cart_items ORDER BY cart_id,variant_id');
        [data.attempts] = await pool.query('SELECT * FROM checkout_requests ORDER BY customer_id,request_key');
        return data;
      }
      await t.test('mounted checkout route uses the real cart and replays without duplicate effects', async () => {
        const cart = await putCartItem(pool, owner.id, variant.id, 1);
        const payload = { fulfillment: 'pickup', storeId: store.id, paymentMethod: 'cod',
          cartVersion: cart.version, requestKey: randomUUID() };
        assert.equal((await request('/orders', admin.id, payload)).status, 403);
        const first = await request('/orders', owner.id, payload);
        assert.equal(first.status, 201);
        assert.equal(first.body.data.payment.status, 'pending');
        const saved = await snapshot();
        const repeat = await request('/orders', owner.id, payload);
        assert.equal(repeat.status, 200);
        assert.equal(repeat.body.data.id, first.body.data.id);
        assert.deepEqual(await snapshot(), saved);
        assert.equal((await request('/orders', owner.id, { ...payload, cartVersion: cart.version + 1 })).body.error.code,
          'IDEMPOTENCY_CONFLICT');
        const cancelled = await request(`/admin/orders/${first.body.data.id}/cancel`, admin.id,
          { requestKey: randomUUID(), reason: 'Admin integration cancellation' });
        assert.equal(cancelled.status, 200);
        assert.equal(cancelled.body.data.payment.status, 'void');
      });
      await t.test('failure after real inventory movement rolls back the complete checkout', async () => {
        const cart = await putCartItem(pool, owner.id, variant.id, 1);
        const saved = await snapshot();
        const failingCheckout = makeCheckout({ readCart: readCartForCheckout, getDestination, deliveryDays,
          async applyStockChange(conn, movement) {
            await applyStockChange(conn, movement);
            throw new Error('Injected after real movement');
          },
        });
        await assert.rejects(failingCheckout(pool, { id: owner.id, role: 'customer' }, {
          fulfillment: 'pickup', storeId: store.id, paymentMethod: 'cod',
          cartVersion: cart.version, requestKey: randomUUID(),
        }), /Injected after real movement/);
        assert.deepEqual(await snapshot(), saved);
      });
      await t.test('two real carts competing for the final unit cannot oversell', async () => {
        await inTransaction(pool, async (conn) => {
          const [[current]] = await conn.execute('SELECT stock FROM variants WHERE id=? FOR UPDATE', [variant.id]);
          const delta = 1 - current.stock;
          if (delta) await applyStockChange(conn, { variantId: variant.id, quantityDelta: delta,
            movementType: 'adjustment', adminId: admin.id, referenceKey: randomUUID(), reason: 'Last unit test' });
        });
        const carts = await Promise.all([owner, other].map((actor) => putCartItem(pool, actor.id, variant.id, 1)));
        const bodies = carts.map((cart) => ({ fulfillment: 'pickup', storeId: store.id,
          paymentMethod: 'cod', cartVersion: cart.version, requestKey: randomUUID() }));
        async function attempt(actor, body) {
          for (let retry = 0; retry < 3; retry++) {
            try { return await checkout(pool, { id: actor.id, role: 'customer' }, body); }
            catch (error) { if (error.code !== 'TRANSACTION_RETRY' || retry === 2) throw error; }
          }
        }
        const results = await Promise.all([attempt(owner, bodies[0]), attempt(other, bodies[1])]);
        assert.deepEqual(results.map((result) => result.data.status).sort(), ['backordered', 'confirmed']);
        const [[remaining]] = await pool.execute('SELECT stock FROM variants WHERE id=?', [variant.id]);
        assert.equal(remaining.stock, 0);
      });
      await t.test('opt-in scenarios use real services and reruns preserve all effects', async () => {
        // Crash after the durable payload is saved, before checkout commits.
        let injected = false;
        const interruptedPool = new Proxy(pool, {
          get(target, property) {
            if (property === 'getConnection') return async () => {
              const connection = await target.getConnection();
              return new Proxy(connection, {
                get(conn, name) {
                  if (name === 'execute') return async (sql, params) => {
                    if (!injected && sql.includes('INSERT INTO orders')) {
                      injected = true;
                      throw new Error('Interrupted demo checkout');
                    }
                    return conn.execute(sql, params);
                  };
                  const value = conn[name];
                  return typeof value === 'function' ? value.bind(conn) : value;
                },
              });
            };
            const value = target[property];
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        await assert.rejects(seedCheckoutScenarios(interruptedPool), /Interrupted demo checkout/);
        const [[prepared]] = await pool.query("SELECT checkout_payload FROM checkout_demo_scenarios WHERE scenario_key='m3-v1-cod'");
        assert.ok(prepared.checkout_payload);
        const first = await seedCheckoutScenarios(pool);
        assert.equal(first.length, 8);
        for (const scenario of CHECKOUT_SCENARIOS) {
          const outcome = first.find((item) => item.scenario === scenario.key);
          const [[manifest]] = await pool.execute('SELECT * FROM checkout_demo_scenarios WHERE scenario_key=?', [scenario.key]);
          const variants = typeof manifest.variant_ids === 'string' ? JSON.parse(manifest.variant_ids) : manifest.variant_ids;
          for (const [index, id] of variants.entries()) {
            const [[stock]] = await pool.execute('SELECT stock FROM variants WHERE id=?', [id]);
            assert.equal(stock.stock, index === 1 ? 0 : scenario.shortage || scenario.cancel || scenario.decline ? 5 : 4);
          }
          if (scenario.decline) {
            assert.equal(outcome.orderId, null);
            const [[orders]] = await pool.execute('SELECT COUNT(*) AS count FROM orders WHERE customer_id=?', [outcome.customerId]);
            assert.equal(orders.count, 0);
            const [[cart]] = await pool.execute('SELECT COUNT(*) AS count FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE c.customer_id=?', [outcome.customerId]);
            assert.equal(cart.count, 1);
          } else {
            const detail = await request(`/orders/${outcome.orderId}`, outcome.customerId);
            assert.equal(detail.status, 200);
            assert.equal(detail.body.data.status, scenario.cancel ? 'cancelled' : scenario.shortage ? 'backordered' : 'confirmed');
            assert.equal(detail.body.data.payment.status, scenario.payment === 'card'
              ? scenario.cancel ? 'refunded' : 'paid' : scenario.cancel ? 'void' : 'pending');
            const [[dates]] = await pool.execute('SELECT DATEDIFF(d.estimated_date,DATE(o.created_at)) AS days FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE o.id=?', [outcome.orderId]);
            assert.equal(dates.days, (scenario.main ? 5 : 7) + (scenario.shortage ? 3 : 0));
            const [[movements]] = await pool.execute("SELECT COUNT(*) AS count FROM inventory_movements WHERE order_id=? AND movement_type='cancellation'", [outcome.orderId]);
            assert.equal(movements.count, scenario.cancel && !scenario.shortage ? 1 : 0);
          }
        }
        const saved = await snapshot();
        assert.deepEqual(await seedCheckoutScenarios(pool), first);
        assert.deepEqual(await snapshot(), saved);
        // Explicit new cancellation after the initial seed must not be undone by reseeding.
        const demo = first.find((item) => item.scenario === 'm3-v1-cod');
        assert.equal((await request(`/orders/${demo.orderId}/cancel`, demo.customerId,
          { requestKey: randomUUID(), reason: 'Changed after demonstration' })).status, 200);
        const progressed = await snapshot();
        const again = await seedCheckoutScenarios(pool);
        assert.equal(again.find((item) => item.scenario === demo.scenario).outcome, 'cancelled');
        assert.deepEqual(await snapshot(), progressed);
      });
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await pool.end();
    }
  },
);
