import { CURRENCY } from '@brightbuy/contracts';

export function formatMoney(value, currency = CURRENCY) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency }).format(Number(value));
}
export function statusLabel(value) {
  return value.replaceAll('_', ' ');
}
