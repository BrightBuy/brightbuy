// Coordinate this shared module with M1; do not maintain competing helpers.
export const MAX_ORDER_UNITS = 999999999999n;
export function parseMoney(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.\d{2}$/.test(value)) {
    throw new TypeError('Money must be a nonnegative two-decimal string.');
  }
  return BigInt(value.replace('.', ''));
}
export function formatMoneyUnits(units) {
  if (typeof units !== 'bigint' || units < 0n) throw new TypeError('Invalid money units.');
  return `${units / 100n}.${String(units % 100n).padStart(2, '0')}`;
}
export function sumLines(lines) {
  let total = 0n;
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new RangeError('Quantity must be 1–99.');
    }
    const price = parseMoney(line.unitPrice);
    if (price > MAX_ORDER_UNITS) throw new RangeError('Price exceeds the order limit.');
    total += price * BigInt(line.quantity);
    if (total > MAX_ORDER_UNITS) throw new RangeError('Order total exceeds the limit.');
  }
  return formatMoneyUnits(total);
}