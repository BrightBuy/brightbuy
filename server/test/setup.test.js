import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSetup } from '../src/database/setup.js';

function setupDouble({
  acquisitionFailure = false,
  releaseFailure = false,
  seedFailure = false,
  lockAvailable = true,
} = {}) {
  const calls = [];
  const connection = {
    async query(sql) {
      if (sql.includes('GET_LOCK')) return [[{ acquired: lockAvailable ? 1 : 0 }]];
      if (sql.includes('RELEASE_LOCK')) {
        calls.push('unlock');
        if (releaseFailure) throw new Error('Unlock failed');
      }
      if (sql.includes('COUNT(*)')) return [[{ count: 1 }]];
      return [[]];
    },
    async execute(sql, [version]) {
      // The schema already exists. A missing seed marker plus existing users
      // must fail safely and roll back rather than overwrite anyone's data.
      if (version === 'demo-v1' && seedFailure) return [[]];
      return [[{ version }]];
    },
    async beginTransaction() {
      calls.push('begin');
    },
    async commit() {
      calls.push('commit');
    },
    async rollback() {
      calls.push('rollback');
    },
    release() {
      calls.push('release');
    },
  };
  const pool = {
    async getConnection() {
      if (acquisitionFailure) throw new Error('Connection failed');
      return connection;
    },
    async end() {
      calls.push('end');
    },
  };
  return { calls, pool };
}

test('setup closes the pool when connection acquisition fails', async () => {
  const { calls, pool } = setupDouble({ acquisitionFailure: true });
  await assert.rejects(runSetup(pool), /Connection failed/);
  assert.deepEqual(calls, ['end']);
});

test('setup releases connection and pool even if lock release fails', async () => {
  const { calls, pool } = setupDouble({ releaseFailure: true });
  await assert.rejects(runSetup(pool), /Unlock failed/);
  assert.deepEqual(calls, ['unlock', 'release', 'end']);
});

test('setup does not release a lock it never acquired', async () => {
  const { calls, pool } = setupDouble({ lockAvailable: false });
  await assert.rejects(runSetup(pool), /Could not acquire/);
  assert.deepEqual(calls, ['release', 'end']);
});

test('seed failure rolls back and closes all resources', async () => {
  const { calls, pool } = setupDouble({ seedFailure: true });
  await assert.rejects(runSetup(pool, { seedDemo: true }), /empty customer table/);
  assert.deepEqual(calls, ['begin', 'rollback', 'unlock', 'release', 'end']);
});

test('a repeated seed run commits without resetting existing data', async () => {
  const { calls, pool } = setupDouble();
  await runSetup(pool, { seedDemo: true });
  assert.deepEqual(calls, ['begin', 'commit', 'unlock', 'release', 'end']);
});
