export const BUSINESS_TIME_ZONE = 'America/Chicago';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const clockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
function parts(formatter, value) {
  const date = value instanceof Date ? value : new Date(value);
  if (value == null || !Number.isFinite(date.getTime())) throw new RangeError('Invalid timestamp.');
  return Object.fromEntries(
    formatter.formatToParts(date).map(({ type, value: part }) => [type, part]),
  );
}
export function businessDate(value = new Date()) {
  const { year, month, day } = parts(dateFormatter, value);
  return `${year}-${month}-${day}`;
}
function calendar(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new RangeError('Use a real calendar date.');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new RangeError('Use a real calendar date.');
  return date;
}
export function addCalendarDays(value, days) {
  if (!Number.isSafeInteger(days)) throw new RangeError('Days must be an integer.');
  const date = calendar(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function startOfBusinessDayUtc(value) {
  const target = calendar(value).getTime();
  let candidate = target;
  // Resolve local midnight through IANA rules, including 23/25-hour business days.
  for (let attempt = 0; attempt < 4; attempt++) {
    const p = parts(clockFormatter, new Date(candidate));
    const localAsUtc = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second),
    );
    const adjustment = target - localAsUtc;
    if (adjustment === 0) return new Date(candidate).toISOString();
    candidate += adjustment;
  }
  throw new RangeError('Cannot resolve business day.');
}
export function businessDaySql(value) {
  return startOfBusinessDayUtc(value).slice(0, 19).replace('T', ' ');
}
