import { ApiError } from '../errors.js';

/**
 * Address management service for Member 2.
 * Enforces customer ownership, Texas-city validation, and default selection rules.
 */

export function mapAddressRecord(addr) {
  const isCityActive = addr.isCityActive === 1 || addr.isCityActive === true;
  const isEligible = Boolean(addr.cityId && isCityActive);
  return {
    id: addr.id,
    customerId: addr.customerId,
    recipient: addr.recipient,
    line1: addr.line1,
    line2: addr.line2 || '',
    line3: addr.line3 || '',
    cityId: addr.cityId ? Number(addr.cityId) : null,
    cityName: addr.cityName || addr.legacyCity || '',
    city: addr.cityName || addr.legacyCity || '',
    postalCode: addr.postalCode,
    country: addr.country || 'US',
    isDefault: Boolean(addr.isDefault),
    isEligible,
  };
}

export async function getAddresses(db, customerId) {
  const [rows] = await db.execute(
    `SELECT a.id, a.customer_id AS customerId, a.recipient, a.line1, a.line2, a.line3,
            a.city_id AS cityId, c.name AS cityName, a.city AS legacyCity,
            a.postal_code AS postalCode, a.country, a.is_default AS isDefault,
            c.is_active AS isCityActive
     FROM addresses a
     LEFT JOIN cities c ON a.city_id = c.id
     WHERE a.customer_id = ?
     ORDER BY a.id ASC`,
    [customerId],
  );
  return rows.map(mapAddressRecord);
}

export async function validateAddressInput(db, data) {
  const { recipient, line1, line2, line3, cityId, postalCode } = data || {};
  if (data?.isDefault !== undefined && typeof data.isDefault !== 'boolean') throw new ApiError(400, 'VALIDATION_ERROR', 'isDefault must be a boolean.');
  if (data?.country !== undefined && data.country !== 'US') throw new ApiError(400, 'VALIDATION_ERROR', 'Only US delivery addresses are supported.');

  if (typeof recipient !== 'string' || !recipient.trim() || recipient.length > 100) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Recipient is required (maximum 100 characters).');
  }
  if (typeof line1 !== 'string' || !line1.trim() || line1.length > 200) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Address line 1 is required (maximum 200 characters).');
  }
  if (line2 !== undefined && line2 !== null && (typeof line2 !== 'string' || line2.length > 200)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Address line 2 must be a string (maximum 200 characters).');
  }
  if (line3 !== undefined && line3 !== null && (typeof line3 !== 'string' || line3.length > 200)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Address line 3 must be a string (maximum 200 characters).');
  }
  if (typeof postalCode !== 'string' || !postalCode.trim() || postalCode.length > 20) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Postal code is required (maximum 20 characters).');
  }

  // Postal code format basic validation (US / general alphanumeric)
  if (!/^[a-zA-Z0-9\s-]{3,20}$/.test(postalCode.trim())) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Postal code format is invalid.');
  }

  if (cityId === undefined || cityId === null) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'City selection is required.');
  }

  const numericCityId = Number(cityId);
  if (!Number.isInteger(numericCityId) || numericCityId <= 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid city ID.');
  }

  const [cities] = await db.execute(
    'SELECT id, name, is_active FROM cities WHERE id = ?',
    [numericCityId],
  );
  if (!cities.length) {
    throw new ApiError(400, 'INVALID_CITY', 'Selected city does not exist.');
  }
  if (cities[0].is_active !== 1 && cities[0].is_active !== true) {
    throw new ApiError(400, 'INVALID_CITY', 'Selected city is currently inactive for delivery.');
  }

  return {
    recipient: recipient.trim(),
    line1: line1.trim(),
    line2: line2 ? line2.trim() : '',
    line3: line3 ? line3.trim() : '',
    cityId: numericCityId,
    cityName: cities[0].name,
    postalCode: postalCode.trim(),
    country: 'US',
  };
}

export async function createAddress(db, customerId, data) {
  const validated = await validateAddressInput(db, data);
  const requestedDefault = Boolean(data.isDefault);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Lock customer row
    const [custLocks] = await connection.execute(
      'SELECT id FROM customers WHERE id = ? FOR UPDATE',
      [customerId],
    );
    if (!custLocks.length) {
      throw new ApiError(404, 'NOT_FOUND', 'Customer account not found.');
    }

    // Check existing addresses
    const [existing] = await connection.execute(
      'SELECT id, is_default FROM addresses WHERE customer_id = ?',
      [customerId],
    );

    // If first usable address or explicitly requested default:
    const isFirstAddress = existing.length === 0;
    const shouldBeDefault = requestedDefault || isFirstAddress;

    if (shouldBeDefault && existing.length > 0) {
      await connection.execute(
        'UPDATE addresses SET is_default = 0 WHERE customer_id = ?',
        [customerId],
      );
    }

    const [result] = await connection.execute(
      `INSERT INTO addresses
         (customer_id, recipient, line1, line2, line3, city, city_id, postal_code, country, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerId,
        validated.recipient,
        validated.line1,
        validated.line2,
        validated.line3,
        validated.cityName,
        validated.cityId,
        validated.postalCode,
        validated.country,
        shouldBeDefault ? 1 : 0,
      ],
    );

    await connection.commit();

    return mapAddressRecord({
      id: result.insertId,
      customerId,
      recipient: validated.recipient,
      line1: validated.line1,
      line2: validated.line2,
      line3: validated.line3,
      cityId: validated.cityId,
      cityName: validated.cityName,
      postalCode: validated.postalCode,
      country: validated.country,
      isDefault: shouldBeDefault,
      isCityActive: 1,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateAddress(db, customerId, addressId, data) {
  const numAddressId = Number(addressId);
  if (!Number.isInteger(numAddressId) || numAddressId <= 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Address not found.');
  }

  const validated = await validateAddressInput(db, data);
  const requestedDefault = data.isDefault !== undefined ? Boolean(data.isDefault) : null;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Lock customer row
    await connection.execute('SELECT id FROM customers WHERE id = ? FOR UPDATE', [customerId]);

    const [existing] = await connection.execute(
      `SELECT a.id, a.is_default, a.city_id, c.is_active AS isCityActive
       FROM addresses a
       LEFT JOIN cities c ON a.city_id = c.id
       WHERE a.id = ? AND a.customer_id = ?`,
      [numAddressId, customerId],
    );
    if (!existing.length) {
      throw new ApiError(404, 'NOT_FOUND', 'Address not found.');
    }

    const currentAddr = existing[0];

    // Read all addresses for customer
    const [allAddr] = await connection.execute(
      `SELECT a.id, a.is_default, a.city_id, c.is_active AS isCityActive
       FROM addresses a
       LEFT JOIN cities c ON a.city_id = c.id
       WHERE a.customer_id = ?`,
      [customerId],
    );

    let nextIsDefault = currentAddr.is_default === 1;

    if (requestedDefault === true) {
      nextIsDefault = true;
      await connection.execute(
        'UPDATE addresses SET is_default = 0 WHERE customer_id = ?',
        [customerId],
      );
    } else if (requestedDefault === false && currentAddr.is_default === 1) {
      // Trying to un-default a default address.
      // Rule: Reject attempt to leave usable addresses without a default!
      const usableOthers = allAddr.filter(
        (a) => a.id !== numAddressId && a.city_id && (a.isCityActive === 1 || a.isCityActive === true),
      );
      if (usableOthers.length > 0) {
        throw new ApiError(
          400,
          'DEFAULT_ADDRESS_REQUIRED',
          'Cannot un-set default address without selecting another default address.',
        );
      }
      nextIsDefault = false;
    }

    await connection.execute(
      `UPDATE addresses
       SET recipient = ?, line1 = ?, line2 = ?, line3 = ?,
           city = ?, city_id = ?, postal_code = ?, country = ?, is_default = ?
       WHERE id = ? AND customer_id = ?`,
      [
        validated.recipient,
        validated.line1,
        validated.line2,
        validated.line3,
        validated.cityName,
        validated.cityId,
        validated.postalCode,
        validated.country,
        nextIsDefault ? 1 : 0,
        numAddressId,
        customerId,
      ],
    );

    await connection.commit();

    return mapAddressRecord({
      id: numAddressId,
      customerId,
      recipient: validated.recipient,
      line1: validated.line1,
      line2: validated.line2,
      line3: validated.line3,
      cityId: validated.cityId,
      cityName: validated.cityName,
      postalCode: validated.postalCode,
      country: validated.country,
      isDefault: nextIsDefault,
      isCityActive: 1,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteAddress(db, customerId, addressId) {
  const numAddressId = Number(addressId);
  if (!Number.isInteger(numAddressId) || numAddressId <= 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Address not found.');
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute('SELECT id FROM customers WHERE id = ? FOR UPDATE', [customerId]);

    const [existing] = await connection.execute(
      'SELECT id, is_default FROM addresses WHERE id = ? AND customer_id = ?',
      [numAddressId, customerId],
    );
    if (!existing.length) {
      throw new ApiError(404, 'NOT_FOUND', 'Address not found.');
    }

    const wasDefault = existing[0].is_default === 1;

    await connection.execute('DELETE FROM addresses WHERE id = ? AND customer_id = ?', [
      numAddressId,
      customerId,
    ]);

    if (wasDefault) {
      // Re-assign default to lowest-ID remaining usable address
      const [remainingUsable] = await connection.execute(
        `SELECT a.id
         FROM addresses a
         JOIN cities c ON a.city_id = c.id
         WHERE a.customer_id = ? AND c.is_active = 1
         ORDER BY a.id ASC
         LIMIT 1`,
        [customerId],
      );

      if (remainingUsable.length) {
        await connection.execute('UPDATE addresses SET is_default = 1 WHERE id = ?', [
          remainingUsable[0].id,
        ]);
      }
    }

    await connection.commit();
    return { deleted: true, id: numAddressId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function setDefaultAddress(db, customerId, addressId) {
  const numAddressId = Number(addressId);
  if (!Number.isInteger(numAddressId) || numAddressId <= 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Address not found.');
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute('SELECT id FROM customers WHERE id = ? FOR UPDATE', [customerId]);

    const [target] = await connection.execute(
      `SELECT a.id, a.city_id, c.is_active AS isCityActive
       FROM addresses a
       LEFT JOIN cities c ON a.city_id = c.id
       WHERE a.id = ? AND a.customer_id = ?`,
      [numAddressId, customerId],
    );

    if (!target.length) {
      throw new ApiError(404, 'NOT_FOUND', 'Address not found.');
    }

    if (!target[0].city_id || (target[0].isCityActive !== 1 && target[0].isCityActive !== true)) {
      throw new ApiError(
        400,
        'INELIGIBLE_ADDRESS',
        'Cannot set address with inactive or unsupported city as default.',
      );
    }

    await connection.execute('UPDATE addresses SET is_default = 0 WHERE customer_id = ?', [
      customerId,
    ]);
    await connection.execute('UPDATE addresses SET is_default = 1 WHERE id = ?', [numAddressId]);

    await connection.commit();

    const [updated] = await db.execute(
      `SELECT a.id, a.customer_id AS customerId, a.recipient, a.line1, a.line2, a.line3,
              a.city_id AS cityId, c.name AS cityName, a.city AS legacyCity,
              a.postal_code AS postalCode, a.country, a.is_default AS isDefault,
              c.is_active AS isCityActive
       FROM addresses a
       LEFT JOIN cities c ON a.city_id = c.id
       WHERE a.id = ?`,
      [numAddressId],
    );

    return mapAddressRecord(updated[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
