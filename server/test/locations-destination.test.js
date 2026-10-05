import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { getDestination, deliveryDays } from '../src/services/locations.js';
import { ApiError } from '../src/errors.js';
import { applyMigrations } from '../src/database/migrate.js';
import { apply as applyDestinationMigration } from '../db/010-checkout-destinations.mjs';
import { seedLocations } from '../src/database/seedLocations.js';
import { listCities, listStores } from '../src/services/location-management.js';

const destinationError = (status) => (error) =>
  error instanceof ApiError && error.status === status;
const row = () => ({
  id: 8,
  customer_id: 2,
  country: 'US',
  recipient: 'Test Customer',
  line1: '100 Test Road',
  postal_code: '75001',
  destination_city_id: 1,
  destination_city: 'Dallas',
  is_main_city: 1,
  city_active: 1,
});

test('destination inputs are validated before querying the database', async () => {
  const connection = {
    execute() {
      assert.fail('Invalid inputs must not query the database.');
    },
  };
  for (const args of [
    ['invalid', 1, 1],
    ['delivery', null, 1],
    ['pickup', '1', 1],
    ['delivery', 1, null],
    ['pickup', 1, 0],
    ['pickup', 4294967296, 1],
  ]) {
    await assert.rejects(getDestination(connection, ...args), destinationError(400));
  }
});
test('delivery lookup scopes ownership, locks rows and returns only snapshot fields', async () => {
  const address = row();
  const connection = {
    async execute(sql, params) {
      assert.match(sql, /a\.customer_id = \?/);
      assert.match(sql, /FOR SHARE/);
      assert.deepEqual(params, [8, 2]);
      return [[address]];
    },
    commit() {
      assert.fail('Caller owns commit.');
    },
    release() {
      assert.fail('Caller owns release.');
    },
  };
  const destination = await getDestination(connection, 'delivery', 8, 2);
  assert.deepEqual(destination, {
    addressId: 8,
    storeId: null,
    isMainCity: true,
    snapshot: {
      cityId: 1,
      city: 'Dallas',
      isMainCity: true,
      country: 'US',
      recipient: 'Test Customer',
      line1: '100 Test Road',
      line2: '',
      line3: '',
      postalCode: '75001',
    },
  });
  address.destination_city = 'Changed';
  assert.equal(destination.snapshot.city, 'Dallas');
  assert.ok(!Object.hasOwn(destination.snapshot, 'customer_id'));
});
test('missing/private and inactive destinations produce explicit errors', async () => {
  await assert.rejects(
    getDestination(
      {
        async execute() {
          return [[]];
        },
      },
      'delivery',
      8,
      3,
    ),
    destinationError(404),
  );
  for (const entry of [
    { ...row(), city_active: 0 },
    { ...row(), country: 'LK' },
    { ...row(), is_main_city: null },
  ]) {
    await assert.rejects(
      getDestination(
        {
          async execute() {
            return [[entry]];
          },
        },
        'delivery',
        8,
        2,
      ),
      destinationError(409),
    );
  }
  const store = {
    id: 5,
    name: 'Demo Pickup',
    address_line: 'Fictional Road',
    store_active: 0,
    destination_city_id: 1,
    destination_city: 'Dallas',
    is_main_city: 1,
    city_active: 1,
  };
  await assert.rejects(
    getDestination(
      {
        async execute() {
          return [[store]];
        },
      },
      'pickup',
      5,
      2,
    ),
    destinationError(409),
  );
});

// Enable only for a new disposable database, never the working development database.
test(
  'location fixtures and destination contract against real MySQL',
  {
    skip: process.env.LOCATIONS_DESTINATION_TEST_MYSQL !== '1',
  },
  async (t) => {
    const database = process.env.MYSQL_TEST_DATABASE;
    assert.match(database || '', /^brightbuy_locations_test(?:_[a-z0-9]+)?$/);
    const require = createRequire(process.env.MYSQL_TEST_PACKAGE || import.meta.url);
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_TEST_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_TEST_PORT || 3306),
      user: process.env.MYSQL_TEST_USER,
      password: process.env.MYSQL_TEST_PASSWORD,
      database,
    });
    try {
      const [tables] = await connection.query('SHOW TABLES');
      assert.equal(tables.length, 0, 'Use an empty test database.');
      const foundation = await readFile(
        new URL('../db/001-foundation.sql', import.meta.url),
        'utf8',
      );
      for (const sql of foundation
        .split(';')
        .map((value) => value.trim())
        .filter(Boolean))
        await connection.query(sql);
      await connection.execute(`INSERT INTO customers (id,name,email,password_hash) VALUES
      (1,'Test Owner','owner@destinations.test','unused'),(2,'Test Other','other@destinations.test','unused')`);
      await connection.execute(`INSERT INTO addresses (customer_id,recipient,line1,city,postal_code,country)
      VALUES (1,'Legacy Customer','Original Road','Colombo','00100','LK')`);
      await applyMigrations(connection);
      await t.test('address migration preserves old data and tolerates retries', async () => {
        await applyDestinationMigration(connection);
        const [[legacy]] = await connection.query(
          'SELECT city, country, city_id FROM addresses WHERE id = 1',
        );
        assert.deepEqual(legacy, { city: 'Colombo', country: 'LK', city_id: null });
        await assert.rejects(getDestination(connection, 'delivery', 1, 1), destinationError(404));
        await assert.rejects(
          connection.query('UPDATE addresses SET city_id = 999999 WHERE id = 1'),
          { code: 'ER_NO_REFERENCED_ROW_2' },
        );
      });
      let fixtures;
      await t.test(
        'fixtures provide stable city/store IDs and public eligibility filters',
        async () => {
          await connection.beginTransaction();
          fixtures = await seedLocations(connection);
          await connection.commit();
          assert.equal(fixtures.cities.length, 6);
          assert.equal(fixtures.stores.length, 8);
          assert.equal((await listCities(connection)).length, 5);
          assert.equal((await listStores(connection)).length, 6);
        },
      );
      const dallas = fixtures.cities.find((city) => city.name === 'Dallas');
      const inactiveCity = fixtures.cities.find((city) => !city.isActive);
      const pickup = fixtures.stores.find((store) => store.name === 'Demo Dallas Central');
      const inactiveStore = fixtures.stores.find((store) => !store.isActive);
      const [inserted] = await connection.execute(
        `INSERT INTO addresses (customer_id,recipient,line1,city,city_id,postal_code,country)
       VALUES (1,'Project Customer','100 Customer Road','Dallas',?,'75001','US')`,
        [dallas.id],
      );
      const addressId = inserted.insertId;
      await t.test(
        'checkout receives an owned delivery address and a copied pickup destination',
        async () => {
          await connection.beginTransaction();
          const delivery = await getDestination(connection, 'delivery', addressId, 1);
          assert.equal(delivery.addressId, addressId);
          assert.equal(delivery.storeId, null);
          assert.equal(delivery.snapshot.country, 'US');
          assert.equal(delivery.snapshot.cityId, dallas.id);
          assert.equal(delivery.snapshot.line1, '100 Customer Road');
          const store = await getDestination(connection, 'pickup', pickup.id, 1);
          assert.equal(store.snapshot.storeId, pickup.id);
          assert.equal(store.addressId, null);
          assert.equal(await deliveryDays(connection, store.isMainCity, false), 5);
          await connection.commit();
          await assert.rejects(
            getDestination(connection, 'delivery', addressId, 2),
            destinationError(404),
          );
          await assert.rejects(
            getDestination(connection, 'pickup', inactiveStore.id, 1),
            destinationError(409),
          );
          const hiddenPickup = fixtures.stores.find((store) => store.cityId === inactiveCity.id);
          await assert.rejects(
            getDestination(connection, 'pickup', hiddenPickup.id, 1),
            destinationError(409),
          );
        },
      );
      await t.test(
        'shared destination lock prevents city deactivation during checkout',
        async () => {
          const other = await mysql.createConnection({
            host: process.env.MYSQL_TEST_HOST || '127.0.0.1',
            port: Number(process.env.MYSQL_TEST_PORT || 3306),
            user: process.env.MYSQL_TEST_USER,
            password: process.env.MYSQL_TEST_PASSWORD,
            database,
          });
          try {
            await other.query('SET SESSION innodb_lock_wait_timeout = 1');
            await connection.beginTransaction();
            await getDestination(connection, 'pickup', pickup.id, 1);
            await assert.rejects(
              other.execute('UPDATE cities SET is_active = 0 WHERE id = ?', [dallas.id]),
              { code: 'ER_LOCK_WAIT_TIMEOUT' },
            );
          } finally {
            await connection.rollback();
            await other.end();
          }
        },
      );
      await t.test(
        'snapshots and original classification stay unchanged after location edits',
        async () => {
          const before = await getDestination(connection, 'pickup', pickup.id, 1);
          await connection.execute('UPDATE cities SET name = ?, is_main_city = 0 WHERE id = ?', [
            'Edited Dallas',
            dallas.id,
          ]);
          await connection.execute('UPDATE stores SET address_line = ? WHERE id = ?', [
            'Changed Pickup Address',
            pickup.id,
          ]);
          assert.equal(before.snapshot.city, 'Dallas');
          assert.equal(before.isMainCity, true);
          assert.equal(before.snapshot.addressLine, pickup.addressLine);
          assert.equal(await deliveryDays(connection, before.isMainCity, false), 5);
          const after = await getDestination(connection, 'pickup', pickup.id, 1);
          assert.equal(after.snapshot.city, 'Edited Dallas');
          assert.equal(after.isMainCity, false);
        },
      );
      await t.test('repeated seeding preserves IDs and administrator edits', async () => {
        await connection.beginTransaction();
        const repeated = await seedLocations(connection);
        await connection.commit();
        assert.equal(repeated.cities.length, 6);
        assert.equal(repeated.stores.length, 8);
        const city = repeated.cities.find((item) => item.id === dallas.id);
        const store = repeated.stores.find((item) => item.id === pickup.id);
        assert.equal(city.name, 'Edited Dallas');
        assert.equal(city.isMainCity, false);
        assert.equal(store.addressLine, 'Changed Pickup Address');
      });
    } finally {
      await connection.end();
    }
  },
);
