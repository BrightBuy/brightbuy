import { ApiError } from '../errors.js';

export const MAX_MONEY_UNITS = 999999999999n; // $9,999,999,999.99 in cents
export const MAX_MONEY_STRING = '9999999999.99';

/**
 * Validates and converts a strict two-decimal currency string (e.g. '40.00')
 * into BigInt integer minor units (cents, e.g. 4000n).
 *
 * Rejects negative numbers, commas, exponents, fractional cents, and non-strings.
 */
export function parseMoney(value, { max = MAX_MONEY_UNITS } = {}) {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'INVALID_PRICE', 'Price must be a string with two decimal places.');
  }

  // Exactly nonnegative integer followed by a dot and two decimal digits.
  // No negative signs, no exponents, no commas, no extra decimals, no leading zeros on whole part except "0".
  if (!/^(?:0|[1-9]\d*)\.\d{2}$/.test(value)) {
    throw new ApiError(
      400,
      'INVALID_PRICE',
      'Price must be a valid amount formatted with exactly two decimal places (e.g. "40.00").',
    );
  }

  const [wholePart, fractionalPart] = value.split('.');
  const units = BigInt(wholePart) * 100n + BigInt(fractionalPart);

  if (units < 0n) {
    throw new ApiError(400, 'INVALID_PRICE', 'Price cannot be negative.');
  }

  if (max !== null && max !== undefined && units > max) {
    throw new ApiError(
      400,
      'PRICE_LIMIT_EXCEEDED',
      `Amount exceeds the maximum allowed limit of ${formatMoneyUnits(max)}.`,
    );
  }

  return units;
}

/**
 * Formats BigInt minor units (e.g. 4000n) back to a two-decimal string ('40.00').
 * Suitable for reports and aggregated amounts larger than a single order.
 */
export function formatMoneyUnits(units) {
  if (typeof units !== 'bigint') {
    throw new TypeError('Money units must be a BigInt.');
  }
  if (units < 0n) {
    throw new RangeError('Money units cannot be negative.');
  }

  const whole = units / 100n;
  const fraction = units % 100n;
  const fractionStr = String(fraction).padStart(2, '0');

  return `${whole}.${fractionStr}`;
}

/**
 * Multiplies BigInt price units by an integer quantity.
 */
export function multiplyMoney(priceUnits, quantity) {
  if (typeof priceUnits !== 'bigint') {
    throw new TypeError('Price units must be a BigInt.');
  }
  if (priceUnits < 0n) {
    throw new RangeError('Price units cannot be negative.');
  }

  let qty;
  if (typeof quantity === 'bigint') {
    qty = quantity;
  } else if (typeof quantity === 'number') {
    if (!Number.isInteger(quantity)) {
      throw new TypeError('Quantity must be an integer.');
    }
    qty = BigInt(quantity);
  } else if (typeof quantity === 'string' && /^(?:0|[1-9]\d*)$/.test(quantity)) {
    qty = BigInt(quantity);
  } else {
    throw new TypeError('Quantity must be a valid integer.');
  }

  if (qty < 0n) {
    throw new RangeError('Quantity cannot be negative.');
  }
  return priceUnits * qty;
}

/**
 * Adds multiple BigInt money units together.
 */
export function addMoney(...unitsList) {
  return unitsList.reduce((acc, curr) => {
    if (typeof curr !== 'bigint') {
      throw new TypeError('All amounts must be BigInt.');
    }
    if (curr < 0n) {
      throw new RangeError('Money units cannot be negative.');
    }
    return acc + curr;
  }, 0n);
}

export const MAX_ORDER_UNITS = 999999999999n;

export function sumLines(lines) {
  let total = 0n;
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new RangeError('Quantity must be 1–99.');
    }
    const price = parseMoney(line.unitPrice, {max: null});
    if (price > MAX_ORDER_UNITS) throw new RangeError('Price exceeds the order limit.');
    total += price * BigInt(line.quantity);
    if (total > MAX_ORDER_UNITS) throw new RangeError('Order total exceeds the limit.');
  }
  return formatMoneyUnits(total);
}