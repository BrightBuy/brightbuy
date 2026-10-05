import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStatuses, ORDER_TRANSITIONS } from '@brightbuy/contracts';

test('backorders allow allocation or cancellation in both fulfilment modes', () => {
  for (const mode of ['delivery', 'pickup']) {
    assert.deepEqual(nextStatuses('backordered', mode), ['confirmed', 'cancelled']);
  }
  assert.deepEqual(nextStatuses('backordered', 'unknown'), []);
});

test('backorder rules resist direct mutation and returned-list mutation', () => {
  assert.throws(() => ORDER_TRANSITIONS.backordered.push('processing'), TypeError);
  const offered = nextStatuses('backordered', 'delivery');
  offered.push('processing');
  assert.deepEqual(nextStatuses('backordered', 'delivery'), ['confirmed', 'cancelled']);
});
