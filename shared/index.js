export const CURRENCY = 'USD';

// Freeze the arrays too: importing this module must not let a consumer change
// the order rules for every other request in the same process.
export const ORDER_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['confirmed', 'cancelled']),
  confirmed: Object.freeze(['processing', 'cancelled']),
  processing: Object.freeze(['shipped', 'ready_for_pickup']),
  shipped: Object.freeze(['delivered']),
  ready_for_pickup: Object.freeze(['collected']),
  delivered: Object.freeze([]),
  collected: Object.freeze([]),
  cancelled: Object.freeze([]),
  backordered: Object.freeze(['confirmed', 'cancelled']),
});

export function nextStatuses(status, fulfillment) {
  if (!Object.hasOwn(ORDER_TRANSITIONS, status)) return [];
  if (!['delivery', 'pickup'].includes(fulfillment)) return [];
  const deliveryOnly = ['shipped', 'delivered'];
  const pickupOnly = ['ready_for_pickup', 'collected'];
  if (deliveryOnly.includes(status) && fulfillment !== 'delivery') return [];
  if (pickupOnly.includes(status) && fulfillment !== 'pickup') return [];
  return ORDER_TRANSITIONS[status].filter((next) => {
    if (deliveryOnly.includes(next)) return fulfillment === 'delivery';
    if (pickupOnly.includes(next)) return fulfillment === 'pickup';
    return true;
  });
}

export {
  BUSINESS_TIME_ZONE,
  businessDate,
  addCalendarDays,
  startOfBusinessDayUtc,
  businessDaySql,
} from './time.js';
