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

function destinationId(value, name) {
  if (!Number.isInteger(value) || value < 1 || value > 4294967295) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${name} must be a positive integer.`);
  }
  return value;
}

// Shared locks last for the caller's transaction; this helper never ends it.
export async function getDestination(connection, mode, id, customerId) {
  if (mode !== 'delivery' && mode !== 'pickup') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Choose delivery or pickup.');
  }
  destinationId(id, 'Destination ID');
  destinationId(customerId, 'Customer ID');
  let rows;
  if (mode === 'delivery') {
    [rows] = await connection.execute(
      `SELECT a.*, c.id AS destination_city_id, c.name AS destination_city,
              c.is_main_city, c.is_active AS city_active
       FROM addresses a JOIN cities c ON c.id = a.city_id
       WHERE a.id = ? AND a.customer_id = ? FOR SHARE`,
      [id, customerId],
    );
  } else {
    [rows] = await connection.execute(
      `SELECT s.id, s.name, s.address_line, s.is_active AS store_active,
              c.id AS destination_city_id, c.name AS destination_city,
              c.is_main_city, c.is_active AS city_active
       FROM stores s JOIN cities c ON c.id = s.city_id
       WHERE s.id = ? FOR SHARE`,
      [id],
    );
  }
  const row = rows[0];
  if (!row) throw new ApiError(404, 'DESTINATION_NOT_FOUND', 'Destination not found.');
  if (row.city_active !== 1 || (mode === 'pickup' && row.store_active !== 1)) {
    throw new ApiError(409, 'DESTINATION_INACTIVE', 'Choose an active destination.');
  }
  const validText = (value) => typeof value === 'string' && value.trim().length > 0;
  if (
    ![0, 1].includes(row.is_main_city) ||
    !validText(row.destination_city) ||
    !Number.isInteger(row.destination_city_id) ||
    row.destination_city_id < 1 ||
    (mode === 'delivery' &&
      (row.country !== 'US' ||
        !validText(row.recipient) ||
        !validText(row.line1) ||
        !validText(row.postal_code))) ||
    (mode === 'pickup' && (!validText(row.name) || !validText(row.address_line)))
  ) {
    throw new ApiError(409, 'DESTINATION_INVALID', 'Destination details need review.');
  }
  const isMainCity = row.is_main_city === 1;
  const city = {
    cityId: row.destination_city_id,
    city: row.destination_city,
    isMainCity,
    country: 'US',
  };
  const snapshot =
    mode === 'delivery'
      ? {
          ...city,
          recipient: row.recipient,
          line1: row.line1,
          line2: row.line2 ?? '',
          line3: row.line3 ?? '',
          postalCode: row.postal_code,
        }
      : { ...city, storeId: row.id, storeName: row.name, addressLine: row.address_line };
  return {
    addressId: mode === 'delivery' ? row.id : null,
    storeId: mode === 'pickup' ? row.id : null,
    isMainCity,
    snapshot,
  };
}
