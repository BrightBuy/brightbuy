import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, statusLabel } from '../src/utils/format.js';

test('formatMoney formats amounts with currency symbol and 2 decimals', () => {
  const usdFormatted = formatMoney('40.00', 'USD');
  assert.ok(usdFormatted.includes('40.00'));

  assert.equal(formatMoney('2500.00'), '$2,500.00');
  assert.equal(formatMoney('29.99'), '$29.99');
});

test('formatMoney does not coerce invalid numbers silently', () => {
  const zeroFormatted = formatMoney(0, 'USD');
  assert.ok(zeroFormatted.includes('0.00'));
});

test('statusLabel replaces underscores with spaces', () => {
  assert.equal(statusLabel('ready_for_pickup'), 'ready for pickup');
  assert.equal(statusLabel('in_transit'), 'in transit');
  assert.equal(statusLabel('delivered'), 'delivered');
});
