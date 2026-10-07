import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCentralTime, formatCentralDate } from '../src/utils/date-time.js';

test('Central timestamps use standard and daylight time instead of the computer timezone', () => {
  assert.match(formatCentralTime('2026-01-15T12:00:00Z'), /6:00:00 AM CST$/);
  assert.match(formatCentralTime('2026-07-15T12:00:00Z'), /7:00:00 AM CDT$/);
  assert.equal(
    formatCentralTime('2026-07-15T17:30:00+05:30'),
    formatCentralTime('2026-07-15T12:00:00Z'),
  );
});

test('Central dates reflect the previous day when a timestamp is near UTC midnight', () => {
  assert.equal(formatCentralDate('2026-01-01T02:00:00Z'), 'Dec 31, 2025');
  assert.equal(formatCentralDate('2026-07-01T02:00:00Z'), 'Jun 30, 2026');
});

test('Central timestamps handle both daylight-saving transitions', () => {
  assert.match(formatCentralTime('2026-03-08T07:59:59Z'), /1:59:59 AM CST$/);
  assert.match(formatCentralTime('2026-03-08T08:00:00Z'), /3:00:00 AM CDT$/);
  assert.match(formatCentralTime('2026-11-01T06:59:59Z'), /1:59:59 AM CDT$/);
  assert.match(formatCentralTime('2026-11-01T07:00:00Z'), /1:00:00 AM CST$/);
});

test('missing, invalid, ambiguous and calendar-only values are not rendered as timestamps', () => {
  for (const value of [
    null,
    undefined,
    '',
    'invalid',
    '2026-01-01',
    '2026-01-01T12:00:00',
    '2026-01-01T99:00:00Z',
  ]) {
    assert.equal(formatCentralTime(value), 'Unavailable');
    assert.equal(formatCentralDate(value), 'Unavailable');
  }
});
