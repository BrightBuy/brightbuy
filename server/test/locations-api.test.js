import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { applyMigrations } from '../src/database/migrate.js';

const secret = 'locations-test-secret-at-least-32-characters';
const users = [
  { id: 1, name: 'Test Admin', email: 'admin@locations.test', role: 'admin' },
  { id: 2, name: 'Test Customer', email: 'customer@locations.test', role: 'customer' },
];
const token = (id) =>
  jwt.sign({}, secret, {
    subject: String(id),
    issuer: 'brightbuy',
    audience: 'brightbuy-web',
    expiresIn: '1h',
  });

async function serve(db, work) {
  const server = createApp(db, secret).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const request = async (path, { user, method = 'GET', body } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(user ? { Authorization: `Bearer ${token(user)}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    await work(request);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('location admin routes reject visitors and customers before accessing location data', async () => {
  const db = {
    async execute(sql, [id]) {
      assert.ok(sql.includes('customers WHERE id'));
      return [users.filter((user) => String(user.id) === id)];
    },
  };
  await serve(db, async (request) => {
    const operations = [
      ['/admin/cities', 'GET'],
      ['/admin/stores', 'GET'],
      ['/admin/cities', 'POST'],
      ['/admin/stores', 'POST'],
      ['/admin/cities/1', 'PATCH'],
      ['/admin/stores/1', 'PATCH'],
    ];
    for (const [path, method] of operations) {
      const visitor = await request(path, { method, body: method === 'GET' ? undefined : {} });
      assert.equal(visitor.status, 401);
      assert.equal(visitor.body.error.code, 'UNAUTHENTICATED');
      const customer = await request(path, {
        method,
        user: 2,
        body: method === 'GET' ? undefined : {},
      });
      assert.equal(customer.status, 403);
      assert.equal(customer.body.error.code, 'FORBIDDEN');
    }
  });
});

test('location routes reject malformed fields and filters before database mutations', async () => {
  const db = {
    async execute(sql, [id]) {
      assert.ok(sql.includes('customers WHERE id'));
      return [users.filter((user) => String(user.id) === id)];
    },
  };
  await serve(db, async (request) => {
    const validCity = { name: 'Test City', isMainCity: true, isActive: true };
    const validStore = { name: 'Test Store', cityId: 1, addressLine: 'Test Road', isActive: true };
    const checks = [
      ['/admin/cities', 'POST', null],
      ['/admin/cities', 'POST', []],
      ['/admin/cities', 'POST', { name: 'Missing flags' }],
      ['/admin/cities', 'POST', { ...validCity, extra: true }],
      ['/admin/cities', 'POST', { ...validCity, name: ' ' }],
      ['/admin/cities', 'POST', { ...validCity, isMainCity: 1 }],
      ['/admin/cities', 'POST', { ...validCity, isActive: 'true' }],
      ['/admin/cities/1', 'PATCH', {}],
      ['/admin/cities/0', 'PATCH', { isActive: false }],
      ['/admin/stores', 'POST', { ...validStore, cityId: '1' }],
      ['/admin/stores', 'POST', { ...validStore, cityId: 4294967296 }],
      ['/admin/stores', 'POST', { ...validStore, addressLine: 'x'.repeat(251) }],
      ['/admin/stores/1', 'PATCH', { isActive: null }],
    ];
    for (const [path, method, body] of checks) {
      const result = await request(path, { method, body, user: 1 });
      assert.equal(result.status, 400, `${method} ${path}: ${JSON.stringify(body)}`);
      assert.equal(result.body.error.code, body === null ? 'INVALID_JSON' : 'VALIDATION_ERROR');
    }
    for (const path of [
      '/cities?isActive=0',
      '/stores?cityId=1&cityId=2',
      '/stores?cityId=',
      '/stores?cityId=1.5',
      '/stores?cityId[]=1',
      '/stores?cityId=4294967296',
    ]) {
      assert.equal((await request(path)).status, 400, path);
    }
  });
});

// Opt in with LOCATIONS_API_TEST_MYSQL=1 and a fresh MYSQL_TEST_DATABASE.
test(
  'location API lifecycle and filtering against real MySQL',
  {
    skip: process.env.LOCATIONS_API_TEST_MYSQL !== '1',
  },
  async (t) => {
    const database = process.env.MYSQL_TEST_DATABASE;
    assert.match(database || '', /^brightbuy_locations_test(?:_[a-z0-9]+)?$/);
    const require = createRequire(process.env.MYSQL_TEST_PACKAGE || import.meta.url);
    const mysql = require('mysql2/promise');
    const db = mysql.createPool({
      host: process.env.MYSQL_TEST_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_TEST_PORT || 3306),
      user: process.env.MYSQL_TEST_USER,
      password: process.env.MYSQL_TEST_PASSWORD,
      database,
      connectionLimit: 4,
    });
    try {
      const [tables] = await db.query('SHOW TABLES');
      assert.equal(tables.length, 0, 'Use a fresh, empty test database.');
      const connection = await db.getConnection();
      try {
        await applyMigrations(connection);
        // This suite exercises creation from empty lists in its disposable database.
        await connection.query('DELETE FROM cities');
      } finally {
        connection.release();
      }
      for (const user of users) {
        await db.execute(
          'INSERT INTO customers (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
          [user.id, user.name, user.email, 'unused-test-hash', user.role],
        );
      }
      await serve(db, async (request) => {
        let mainId, otherId, inactiveId, storeId;
        const admin = (path, method, body) => request(path, { user: 1, method, body });
        await t.test('empty public lists and typed admin creation responses', async () => {
          assert.deepEqual((await request('/cities')).body.data, []);
          assert.deepEqual((await request('/stores')).body.data, []);
          for (const [name, main, active] of [
            [' Main Test City ', true, true],
            ['Other Test City', false, true],
            ['Inactive Test City', false, false],
          ]) {
            const result = await admin('/admin/cities', 'POST', {
              name,
              isMainCity: main,
              isActive: active,
            });
            assert.equal(result.status, 201);
            assert.equal(result.body.data.name, name.trim());
            assert.equal(result.body.data.isMainCity, main);
            assert.equal(result.body.data.isActive, active);
            if (main) mainId = result.body.data.id;
            else if (active) otherId = result.body.data.id;
            else inactiveId = result.body.data.id;
          }
          const result = await admin('/admin/stores', 'POST', {
            name: ' Central Pickup ',
            cityId: mainId,
            addressLine: ' 100 Test Road ',
            isActive: true,
          });
          assert.equal(result.status, 201);
          assert.equal(result.body.data.name, 'Central Pickup');
          assert.equal(result.body.data.addressLine, '100 Test Road');
          assert.equal(result.body.data.cityName, 'Main Test City');
          storeId = result.body.data.id;
        });
        await t.test('duplicate names, missing rows and inactive destination errors', async () => {
          assert.equal(
            (
              await admin('/admin/cities', 'POST', {
                name: 'MAIN TEST CITY',
                isMainCity: false,
                isActive: true,
              })
            ).status,
            409,
          );
          const body = {
            name: 'central pickup',
            cityId: mainId,
            addressLine: 'Road',
            isActive: true,
          };
          assert.equal((await admin('/admin/stores', 'POST', body)).status, 409);
          assert.equal(
            (await admin('/admin/stores', 'POST', { ...body, cityId: inactiveId })).status,
            409,
          );
          assert.equal(
            (await admin('/admin/stores', 'POST', { ...body, cityId: 999999 })).status,
            404,
          );
          assert.equal(
            (await admin('/admin/cities/999999', 'PATCH', { name: 'Missing' })).status,
            404,
          );
          assert.equal(
            (await admin('/admin/stores/999999', 'PATCH', { name: 'Missing' })).status,
            404,
          );
          assert.equal(
            (await admin(`/admin/cities/${otherId}`, 'PATCH', { name: 'main test city' })).status,
            409,
          );
        });
        await t.test(
          'public filters omit inactive records while admins can retrieve them',
          async () => {
            const inactiveStore = await admin('/admin/stores', 'POST', {
              name: 'Inactive Pickup',
              cityId: mainId,
              addressLine: 'Other Road',
              isActive: false,
            });
            assert.equal(inactiveStore.status, 201);
            assert.equal((await request('/cities')).body.data.length, 2);
            assert.equal((await admin('/admin/cities', 'GET')).body.data.length, 3);
            assert.equal((await request(`/stores?cityId=${mainId}`)).body.data.length, 1);
            assert.deepEqual((await request(`/stores?cityId=${otherId}`)).body.data, []);
            assert.equal(
              (await admin(`/admin/stores?cityId=${mainId}`, 'GET')).body.data.length,
              2,
            );
            assert.equal(
              (await admin(`/admin/cities/${mainId}`, 'PATCH', { isActive: false })).status,
              200,
            );
            assert.deepEqual((await request('/stores')).body.data, []);
            assert.equal((await admin('/admin/stores', 'GET')).body.data.length, 2);
          },
        );
        await t.test(
          'stores under inactive cities can be disabled but not activated or moved there',
          async () => {
            assert.equal(
              (await admin(`/admin/stores/${storeId}`, 'PATCH', { isActive: false })).status,
              200,
            );
            assert.equal(
              (
                await admin(`/admin/stores/${storeId}`, 'PATCH', {
                  addressLine: 'Updated Test Road',
                })
              ).status,
              200,
            );
            assert.equal(
              (await admin(`/admin/stores/${storeId}`, 'PATCH', { isActive: true })).status,
              409,
            );
            assert.equal(
              (await admin(`/admin/stores/${storeId}`, 'PATCH', { cityId: inactiveId })).status,
              409,
            );
            const result = await admin(`/admin/stores/${storeId}`, 'PATCH', {
              cityId: otherId,
              isActive: true,
            });
            assert.equal(result.status, 200);
            assert.equal(result.body.data.addressLine, 'Updated Test Road');
            assert.equal((await request('/stores')).body.data[0].cityId, otherId);
          },
        );
        await t.test('concurrent partial city edits retain both changes', async () => {
          const results = await Promise.all([
            admin(`/admin/cities/${otherId}`, 'PATCH', { name: 'Renamed Test City' }),
            admin(`/admin/cities/${otherId}`, 'PATCH', { isMainCity: true }),
          ]);
          assert.ok(results.every((result) => result.status === 200));
          const city = (await admin('/admin/cities', 'GET')).body.data.find(
            (row) => row.id === otherId,
          );
          assert.equal(city.name, 'Renamed Test City');
          assert.equal(city.isMainCity, true);
        });
        await t.test(
          'failed store move rolls back and reactivation restores eligible stores',
          async () => {
            const failed = await admin(`/admin/stores/${storeId}`, 'PATCH', {
              cityId: 999999,
              name: 'Must Not Persist',
            });
            assert.equal(failed.status, 404);
            const store = (await admin('/admin/stores', 'GET')).body.data.find(
              (row) => row.id === storeId,
            );
            assert.equal(store.name, 'Central Pickup');
            assert.equal(store.cityId, otherId);
            await admin(`/admin/cities/${mainId}`, 'PATCH', { isActive: true });
            const cities = (await request('/cities')).body.data;
            assert.equal(cities.length, 2);
          },
        );
      });
    } finally {
      await db.end();
    }
  },
);
