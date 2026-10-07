import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessDate, addCalendarDays, startOfBusinessDayUtc } from '../../shared/time.js';

test('business dates follow Central Time instead of UTC midnight', () => {
  assert.equal(businessDate('2026-01-01T02:00:00Z'), '2025-12-31');
  assert.equal(businessDate('2026-01-01T06:00:00Z'), '2026-01-01');
  assert.equal(businessDate('2026-07-01T04:59:59Z'), '2026-06-30');
  assert.equal(businessDate('2026-07-01T05:00:00Z'), '2026-07-01');
});

test('report day boundaries follow daylight saving without fixed offsets', () => {
  assert.equal(startOfBusinessDayUtc('2026-01-01'), '2026-01-01T06:00:00.000Z');
  assert.equal(startOfBusinessDayUtc('2026-07-01'), '2026-07-01T05:00:00.000Z');
  for (const [day, expectedHours] of [
    ['2026-03-08', 23],
    ['2026-11-01', 25],
  ]) {
    const start = new Date(startOfBusinessDayUtc(day));
    const end = new Date(startOfBusinessDayUtc(addCalendarDays(day, 1)));
    assert.equal((end - start) / 3600000, expectedHours);
  }
});

test('calendar-day estimates keep their promised day across leap years and daylight saving', () => {
  assert.equal(addCalendarDays('2028-02-27', 5), '2028-03-03');
  assert.equal(addCalendarDays('2026-03-06', 5), '2026-03-11');
  assert.equal(addCalendarDays('2025-12-31', 10), '2026-01-10');
  assert.throws(() => startOfBusinessDayUtc('2026-02-29'), RangeError);
  assert.throws(() => businessDate(null), RangeError);
});
