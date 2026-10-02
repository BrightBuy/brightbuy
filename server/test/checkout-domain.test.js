import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCheckout, checkoutFingerprint, validateCancellation } from '../src/utils/checkout-input.js';
import { parseMoney, formatMoneyUnits, sumLines } from '../src/utils/money.js';
import { paymentDecision } from '../src/services/payments.js';
import { inTransaction } from '../src/utils/transaction.js';

const base = {
  fulfillment: 'delivery', addressId: 11, paymentMethod: 'cod', cartVersion: 3,
  requestKey: '11111111-1111-4111-8111-111111111111',
};
test('exact cents avoid floating point addition', () => {
  assert.equal(formatMoneyUnits(parseMoney('0.10') + parseMoney('0.20')), '0.30');
  assert.equal(sumLines([{ unitPrice: '40.00', quantity: 2 },
    { unitPrice: '15.00', quantity: 1 }]), '95.00');
});
test('money syntax is strict', () => {
  for (const value of [40, '1.2', '1e2', '-1.00', '1.001', '1,000.00']) {
    assert.throws(() => parseMoney(value), TypeError);
  }
});
test('maximum total accepted, overflowing total rejected', () => {
  assert.equal(sumLines([{ unitPrice: '9999999999.99', quantity: 1 }]), '9999999999.99');
  assert.throws(() => sumLines([{ unitPrice: '9999999999.99', quantity: 2 }]), RangeError);
});
test('quantity limits reject fractional, zero and excessive values', () => {
  for (const quantity of [0, 1.5, 100, '2']) {
    assert.throws(() => sumLines([{ unitPrice: '1.00', quantity }]), RangeError);
  }
});
test('delivery COD normalizes unused fields', () => {
  const input = validateCheckout(base);
  assert.equal(input.storeId, null);
  assert.equal(input.simulationToken, null);
});
test('pickup card accepts the correct mode-specific fields', () => {
  const { addressId, ...rest } = base;
  const input = validateCheckout({ ...rest, fulfillment: 'pickup', storeId: 2,
    paymentMethod: 'card', simulationToken: 'demo-approved' });
  assert.equal(input.addressId, null);
  assert.equal(paymentDecision(input), 'approved');
});
test('rejects injected fields and wrong types', () => {
  for (const body of [null, [], { ...base, total: '0.01' }, { ...base, customerId: 2 },
    { ...base, addressId: '11' }, { ...base, cartVersion: -1 },
    { ...base, storeId: 2 }, { ...base, simulationToken: 'demo-approved' }]) {
    assert.throws(() => validateCheckout(body), { code: 'VALIDATION_ERROR' });
  }
});
test('fingerprint is canonical and detects changed input', () => {
  const original = checkoutFingerprint(validateCheckout(base));
  const reversed = Object.fromEntries(Object.entries(base).reverse());
  assert.equal(checkoutFingerprint(validateCheckout(reversed)), original);
  assert.notEqual(checkoutFingerprint(validateCheckout({ ...base, addressId: 12 })), original);
});
test('request key identifies action independently of fingerprint', () => {
  const other = { ...base, requestKey: '22222222-2222-4222-8222-222222222222' };
  assert.equal(checkoutFingerprint(validateCheckout(base)), checkoutFingerprint(validateCheckout(other)));
});
test('payment decisions are deterministic', () => {
  assert.equal(paymentDecision(validateCheckout(base)), 'not_required');
  assert.equal(paymentDecision(validateCheckout({ ...base, paymentMethod: 'card',
    simulationToken: 'demo-declined' })), 'declined');
});
test('cancellation trims reason and rejects blank reason', () => {
  assert.equal(validateCancellation({ requestKey: base.requestKey, reason: ' changed plans ' }).reason, 'changed plans');
  assert.throws(() => validateCancellation({ requestKey: base.requestKey, reason: ' ' }),
    { code: 'VALIDATION_ERROR' });
});
function transactionDouble({ failCommit = false, failRollback = false } = {}) {
  const calls = [];
  const connection = {
    async query() {},
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); if (failCommit) throw new Error('Lost acknowledgement'); },
    async rollback() { calls.push('rollback'); if (failRollback) throw new Error('Disconnected'); },
    release() { calls.push('release'); },
    destroy() { calls.push('destroy'); },
  };
  return { calls, pool: { async getConnection() { return connection; } } };
}
test('successful work commits before returning', async () => {
  const { calls, pool } = transactionDouble();
  assert.equal(await inTransaction(pool, async () => 42), 42);
  assert.deepEqual(calls, ['begin', 'commit', 'release']);
});
test('failed work rolls back and releases', async () => {
  const { calls, pool } = transactionDouble();
  await assert.rejects(inTransaction(pool, async () => { throw new Error('Forced'); }), /Forced/);
  assert.deepEqual(calls, ['begin', 'rollback', 'release']);
});
test('rollback failure destroys the connection', async () => {
  const { calls, pool } = transactionDouble({ failRollback: true });
  await assert.rejects(inTransaction(pool, async () => { throw new Error('Forced'); }), /Forced/);
  assert.deepEqual(calls, ['begin', 'rollback', 'destroy']);
});
test('lost commit acknowledgement is uncertain, never reported as clean rollback', async () => {
  const { calls, pool } = transactionDouble({ failCommit: true });
  await assert.rejects(inTransaction(pool, async () => 42), { code: 'TRANSACTION_OUTCOME_UNKNOWN' });
  assert.deepEqual(calls, ['begin', 'commit', 'destroy']);
});
test('deadlock becomes same-action retry after rollback', async () => {
  const { calls, pool } = transactionDouble();
  await assert.rejects(inTransaction(pool, async () => {
    throw Object.assign(new Error('Deadlock'), { code: 'ER_LOCK_DEADLOCK' });
  }), { code: 'TRANSACTION_RETRY' });
  assert.deepEqual(calls, ['begin', 'rollback', 'release']);
});
