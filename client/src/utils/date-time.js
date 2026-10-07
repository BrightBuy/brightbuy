import { BUSINESS_TIME_ZONE } from '../../../shared/time.js';

function timestamp(value) {
  // API timestamps include an offset; calendar-only dates are handled separately.
  if (typeof value !== 'string' || !/T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export function formatCentralTime(value) {
  const date = timestamp(value);
  return date ? timeFormatter.format(date) : 'Unavailable';
}

export function formatCentralDate(value) {
  const date = timestamp(value);
  return date ? dateFormatter.format(date) : 'Unavailable';
}
