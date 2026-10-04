import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deliveryDays } from '../src/services/locations.js';
import { ApiError } from '../src/errors.js';
import { apply } from '../db/009-delivery-days.mjs';
import { applyMigrations } from '../src/database/migrate.js';

const cases = [
  [1, 0, 5],
  [0, 0, 7],
  [1, 1, 8],
  [0, 1, 10],
];

test('deliveryDays accepts boolean and database flags without managing the transaction', async () => {
  for (const [main, shortage, days] of cases) {
    for (const inputs of [
      [main, shortage],
      [Boolean(main), Boolean(shortage)],
    ]) {
      const connection = {
        async execute(sql, parameters) {
          assert.equal(sql, 'SELECT fn_delivery_days(?, ?) AS days');
          assert.deepEqual(parameters, [main, shortage]);
          return [[{ days }]];
        },
        commit() {
          assert.fail('The helper must not commit.');
        },
        rollback() {
          assert.fail('The helper must not roll back.');
        },
        release() {
          assert.fail('The helper must not release.');
        },
      };
      assert.equal(await deliveryDays(connection, ...inputs), days);
    }
  }
});

test('deliveryDays rejects missing, string and invalid flags before querying MySQL', async () => {
  const connection = {
    execute() {
      assert.fail('Invalid flags must not reach MySQL.');
    },
  };
  for (const invalid of [null, undefined, '', '0', 'false', -1, 2, NaN, {}, []]) {
    for (const inputs of [
      [invalid, false],
      [true, invalid],
    ]) {
      await assert.rejects(
        deliveryDays(connection, ...inputs),
        (error) =>
          error instanceof ApiError && error.status === 400 && error.code === 'VALIDATION_ERROR',
      );
    }
  }
});

test('deliveryDays rejects invalid, missing and contradictory database results', async () => {
  for (const rows of [
    [],
    undefined,
    [{ days: null }],
    [{ days: '5' }],
    [{ days: 5.5 }],
    [{ days: 7 }],
    [{ days: 5 }, { days: 5 }],
  ]) {
    const connection = {
      async execute() {
        return [rows];
      },
    };
    await assert.rejects(
      deliveryDays(connection, true, false),
      (error) =>
        error instanceof ApiError && error.status === 500 && error.code === 'INTERNAL_ERROR',
    );
  }
});

test('deliveryDays propagates database failures without inventing an estimate', async () => {
  const failure = new Error('Database unavailable');
  const connection = {
    async execute() {
      throw failure;
    },
  };
  await assert.rejects(deliveryDays(connection, true, false), (error) => error === failure);
});

// Run only against a fresh disposable database, never the development database.
// Set DELIVERY_DAYS_TEST_MYSQL=1 and MYSQL_TEST_HOST/PORT/USER/PASSWORD/DATABASE.
test(
  'delivery-days migration and helper work through the migration runner on MySQL',
  {
    skip: process.env.DELIVERY_DAYS_TEST_MYSQL !== '1',
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
      await applyMigrations(connection);
      await t.test(
        'all four location and shortage cases return the specified duration',
        async () => {
          for (const [main, shortage, days] of cases) {
            assert.equal(await deliveryDays(connection, main, shortage), days);
          }
        },
      );
      await t.test('invalid SQL inputs return null rather than a plausible duration', async () => {
        for (const inputs of [
          [null, 0],
          [1, null],
          [2, 0],
          [0, -1],
        ]) {
          const [[row]] = await connection.execute('SELECT fn_delivery_days(?, ?) AS days', inputs);
          assert.equal(row.days, null);
        }
      });
      await t.test('function declares deterministic, no-SQL semantics', async () => {
        const [[routine]] = await connection.execute(
          `SELECT IS_DETERMINISTIC, SQL_DATA_ACCESS FROM information_schema.ROUTINES
         WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_NAME = ?`,
          ['fn_delivery_days'],
        );
        assert.equal(routine.IS_DETERMINISTIC, 'YES');
        assert.equal(routine.SQL_DATA_ACCESS, 'NO SQL');
      });
      await t.test('migration retries retain location data and one version marker', async () => {
        await connection.execute('INSERT INTO cities (name) VALUES (?)', ['Retry Test City']);
        await apply(connection);
        await applyMigrations(connection);
        const [[city]] = await connection.execute('SELECT name FROM cities WHERE name = ?', [
          'Retry Test City',
        ]);
        assert.equal(city.name, 'Retry Test City');
        const [[marker]] = await connection.execute(
          'SELECT COUNT(*) AS count FROM schema_migrations WHERE version = ?',
          ['009-delivery-days'],
        );
        assert.equal(marker.count, 1);
        assert.equal(await deliveryDays(connection, false, true), 10);
      });
    } finally {
      await connection.end();
    }
  },
);
