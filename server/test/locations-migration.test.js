import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { apply } from '../db/003-locations.mjs';

// Opt in using a disposable database; the ordinary test suite needs no live MySQL.
// Set LOCATIONS_TEST_MYSQL=1 and MYSQL_TEST_HOST/PORT/USER/PASSWORD/DATABASE.
test(
  'location migration constraints and retry safety on MySQL',
  {
    skip: process.env.LOCATIONS_TEST_MYSQL !== '1',
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
      const [existing] = await connection.query('SHOW TABLES');
      assert.equal(existing.length, 0, 'Use a fresh, empty test database.');
      await apply(connection);
      const insertCity = async (name, main = 0, active = 1) => {
        const [result] = await connection.execute(
          'INSERT INTO cities (name, is_main_city, is_active) VALUES (?, ?, ?)',
          [name, main, active],
        );
        return result.insertId;
      };
      const insertStore = (name, cityId, address = '100 Test Road', active = 1) =>
        connection.execute(
          'INSERT INTO stores (name, city_id, address_line, is_active) VALUES (?, ?, ?, ?)',
          [name, cityId, address, active],
        );
      const cityId = await insertCity('Test City', 1);
      const otherCityId = await insertCity('Other Test City');

      await t.test('city names are unique after trimming and ignoring case', async () => {
        await assert.rejects(insertCity('  TEST CITY  '), { code: 'ER_DUP_ENTRY' });
      });
      await t.test(
        'cities reject blank names, invalid flags, nulls and oversized names',
        async () => {
          for (const args of [['   '], ['Invalid Main', 2], ['Invalid Active', 0, -1]]) {
            await assert.rejects(insertCity(...args), { code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
          }
          await assert.rejects(insertCity(null), { code: 'ER_BAD_NULL_ERROR' });
          await assert.rejects(insertCity('x'.repeat(101)), { code: 'ER_DATA_TOO_LONG' });
        },
      );
      await t.test(
        'store names are unique within a city; one city can have many stores',
        async () => {
          await insertStore('Central Pickup', cityId);
          await insertStore('North Pickup', cityId);
          await insertStore('Central Pickup', otherCityId);
          await assert.rejects(insertStore(' central PICKUP ', cityId), { code: 'ER_DUP_ENTRY' });
        },
      );
      await t.test(
        'stores reject missing cities, blank fields and invalid active flags',
        async () => {
          await assert.rejects(insertStore('Missing City', 4294967295), {
            code: 'ER_NO_REFERENCED_ROW_2',
          });
          for (const args of [
            [' ', cityId],
            ['Blank Address', cityId, ' '],
            ['Bad Flag', cityId, 'Road', 2],
          ]) {
            await assert.rejects(insertStore(...args), { code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
          }
          await assert.rejects(insertStore('Long Address', cityId, 'x'.repeat(251)), {
            code: 'ER_DATA_TOO_LONG',
          });
        },
      );
      await t.test(
        'deactivation preserves stores and deleting a referenced city is rejected',
        async () => {
          await connection.execute('UPDATE cities SET is_active = 0 WHERE id = ?', [cityId]);
          const [[city]] = await connection.execute('SELECT is_active FROM cities WHERE id = ?', [
            cityId,
          ]);
          assert.equal(city.is_active, 0);
          const [[stores]] = await connection.execute(
            'SELECT COUNT(*) AS count FROM stores WHERE city_id = ?',
            [cityId],
          );
          assert.equal(stores.count, 2);
          await assert.rejects(connection.execute('DELETE FROM cities WHERE id = ?', [cityId]), {
            code: 'ER_ROW_IS_REFERENCED_2',
          });
        },
      );
      await t.test('retrying the migration preserves existing records and edits', async () => {
        await connection.execute('UPDATE stores SET address_line = ? WHERE city_id = ?', [
          'Updated Test Road',
          cityId,
        ]);
        await apply(connection);
        const [cities] = await connection.query('SELECT name, is_active FROM cities ORDER BY id');
        assert.deepEqual(cities, [
          { name: 'Test City', is_active: 0 },
          { name: 'Other Test City', is_active: 1 },
        ]);
        const [stores] = await connection.execute(
          'SELECT address_line FROM stores WHERE city_id = ?',
          [cityId],
        );
        assert.equal(stores.length, 2);
        assert.ok(stores.every((store) => store.address_line === 'Updated Test Road'));
      });
    } finally {
      await connection.end();
    }
  },
);
