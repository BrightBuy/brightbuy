import { ApiError } from '../errors.js';

function booleanFlag(value, name) {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  throw new ApiError(400, 'VALIDATION_ERROR', `${name} must be a boolean or numeric 0/1.`);
}

// Use the checkout transaction's connection without committing or releasing it.
export async function deliveryDays(connection, isMainCity, wasOutOfStock) {
  const main = booleanFlag(isMainCity, 'isMainCity');
  const shortage = booleanFlag(wasOutOfStock, 'wasOutOfStock');
  const [rows] = await connection.execute('SELECT fn_delivery_days(?, ?) AS days', [
    main,
    shortage,
  ]);
  const days = rows?.[0]?.days;
  const expected = (main === 1 ? 5 : 7) + (shortage === 1 ? 3 : 0);
  if (!Array.isArray(rows) || rows.length !== 1 || !Number.isInteger(days) || days !== expected) {
    throw new ApiError(
      500,
      'INTERNAL_ERROR',
      'The delivery estimate function returned an invalid result.',
    );
  }
  return days;
}
