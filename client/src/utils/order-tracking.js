import { businessDate } from '../../../shared/time.js';

export function trackingStatus(status) {
  return status === 'shipped' ? 'Dispatched' : status.replaceAll('_', ' ');
}

// Date-only promises stay on their recorded day in every browser timezone.
export function calendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'Unavailable';
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    return 'Unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function isOverdue(order, today = businessDate()) {
  return (
    !order.isLegacy &&
    !['cancelled', 'delivered', 'collected'].includes(order.status) &&
    calendarDate(order.delivery?.estimatedDate) !== 'Unavailable' &&
    order.delivery.estimatedDate < today
  );
}

export function canCancel(order) {
  return (
    order.isLegacy === false &&
    ['confirmed', 'backordered'].includes(order.status) &&
    order.nextStatuses?.includes('cancelled')
  );
}
