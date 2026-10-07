import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarDate, isOverdue, canCancel, trackingStatus } from '../src/utils/order-tracking.js';

test('recorded dates retain leap days and reject impossible dates', () => {
  assert.equal(calendarDate('2028-02-29'), '29 Feb 2028');
  for (const value of ['2026-02-29', '2026-13-01', null, '2026-01-01T00:00:00Z']) {
    assert.equal(calendarDate(value), 'Unavailable');
  }
});
test('overdue means an unfinished project promise before today in Central Time', () => {
  const order = {
    isLegacy: false,
    status: 'backordered',
    delivery: { estimatedDate: '2026-01-31' },
  };
  assert.equal(isOverdue(order, '2026-02-01'), true);
  assert.equal(isOverdue(order, '2026-01-31'), false);
  for (const status of ['cancelled', 'collected', 'delivered'])
    assert.equal(isOverdue({ ...order, status }, '2026-02-01'), false);
  assert.equal(isOverdue({ ...order, isLegacy: true }, '2026-02-01'), false);
});
test('only cancellable project orders offer cancellation, and shipped reads Dispatched', () => {
  const order = { isLegacy: false, status: 'confirmed', nextStatuses: ['processing', 'cancelled'] };
  assert.equal(canCancel(order), true);
  assert.equal(canCancel({ ...order, isLegacy: true }), false);
  assert.equal(canCancel({ ...order, status: 'processing' }), false);
  assert.equal(canCancel({ ...order, nextStatuses: [] }), false);
  assert.equal(trackingStatus('shipped'), 'Dispatched');
  assert.equal(trackingStatus('ready_for_pickup'), 'ready for pickup');
});
