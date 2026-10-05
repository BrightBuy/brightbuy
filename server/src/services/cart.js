import { ApiError } from '../errors.js';
import { parseMoney, formatMoneyUnits, multiplyMoney, addMoney, MAX_ORDER_UNITS } from '../utils/money.js';

/**
 * Persistent Cart Service for Member 2.
 * Versioned cart backend supporting shortages, inactive line preservation,
 * cart item limits, and version isolation.
 */

export async function readCart(executor, customerId) {
  const numCustId = Number(customerId);
  const [carts] = await executor.execute(
    'SELECT id, version FROM carts WHERE customer_id = ?',
    [numCustId],
  );

  if (!carts.length) {
    return {
      id: null,
      customerId: numCustId,
      version: 0,
      currency: 'USD',
      items: [],
      total: '0.00',
      hasShortage: false,
    };
  }

  const cart = carts[0];
  const [items] = await executor.execute(
    `SELECT ci.variant_id AS variantId, ci.quantity,
            v.name AS variantName, v.sku, v.price, v.stock, v.is_active AS isVariantActive,
            p.id AS productId, p.name AS productName, p.is_active AS isProductActive, p.currency AS productCurrency
     FROM cart_items ci
     JOIN variants v ON ci.variant_id = v.id
     JOIN products p ON v.product_id = p.id
     WHERE ci.cart_id = ?
     ORDER BY ci.variant_id ASC`,
    [cart.id],
  );

  let totalUnits = 0n;
  let hasShortage = false;

  const mappedItems = items.map((item) => {
    const isVariantActive = item.isVariantActive === 1 || item.isVariantActive === true;
    const isProductActive = item.isProductActive === 1 || item.isProductActive === true;
    const available = isVariantActive && isProductActive && item.productCurrency === 'USD';
    const unavailableReason = available
      ? null
      : !isVariantActive || !isProductActive
        ? 'Variant is inactive or unavailable.'
        : 'Product currency is incompatible.';

    const priceStr = typeof item.price === 'number' ? item.price.toFixed(2) : String(item.price);
    const unitPriceUnits = parseMoney(priceStr, { max: null });
    const lineTotalUnits = multiplyMoney(unitPriceUnits, item.quantity);
    const lineTotalStr = formatMoneyUnits(lineTotalUnits);

    if (available) {
      totalUnits = addMoney(totalUnits, lineTotalUnits);
    }

    const shortage = item.quantity > item.stock;
    if (shortage) {
      hasShortage = true;
    }

    return {
      variantId: item.variantId,
      productId: item.productId,
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      unitPrice: priceStr,
      quantity: item.quantity,
      lineTotal: lineTotalStr,
      stock: item.stock,
      available,
      unavailableReason,
      shortage,
    };
  });

  return {
    id: cart.id,
    customerId: numCustId,
    version: cart.version,
    currency: 'USD',
    items: mappedItems,
    total: formatMoneyUnits(totalUnits),
    hasShortage,
  };
}

export async function putCartItem(db, customerId, variantId, quantity) {
  const numCustId = Number(customerId);
  const numVariantId = Number(variantId);
  const numQty = Number(quantity);

  if (!Number.isInteger(numVariantId) || numVariantId <= 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Variant not found.');
  }
  if (!Number.isInteger(numQty) || numQty < 1 || numQty > 99) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Quantity must be an integer between 1 and 99.');
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Lock customer row
    const [custLocks] = await connection.execute(
      'SELECT id FROM customers WHERE id = ? FOR UPDATE',
      [numCustId],
    );
    if (!custLocks.length) {
      throw new ApiError(404, 'NOT_FOUND', 'Customer account not found.');
    }

    // Verify variant and product
    const [variants] = await connection.execute(
      `SELECT v.id, v.price, v.stock, v.is_active AS isVariantActive,
              p.id AS productId, p.is_active AS isProductActive, p.currency AS productCurrency
       FROM variants v
       JOIN products p ON v.product_id = p.id
       WHERE v.id = ?`,
      [numVariantId],
    );

    if (!variants.length) {
      throw new ApiError(404, 'NOT_FOUND', 'Variant not found.');
    }

    const v = variants[0];
    const isVariantActive = v.isVariantActive === 1 || v.isVariantActive === true;
    const isProductActive = v.isProductActive === 1 || v.isProductActive === true;
    if (!isVariantActive || !isProductActive || v.productCurrency !== 'USD') {
      throw new ApiError(
        409,
        'VARIANT_UNAVAILABLE',
        'Variant is inactive or unavailable for purchase.',
      );
    }

    // Get or lazily create cart header
    let [carts] = await connection.execute(
      'SELECT id, version FROM carts WHERE customer_id = ? FOR UPDATE',
      [numCustId],
    );

    let cartId;
    let currentVersion = 0;

    if (!carts.length) {
      const [insertRes] = await connection.execute(
        'INSERT INTO carts (customer_id, version) VALUES (?, 0)',
        [numCustId],
      );
      cartId = insertRes.insertId;
      currentVersion = 0;
    } else {
      cartId = carts[0].id;
      currentVersion = carts[0].version;
    }

    // Check current items
    const [existingItems] = await connection.execute(
      'SELECT variant_id, quantity FROM cart_items WHERE cart_id = ?',
      [cartId],
    );

    const existingItem = existingItems.find((i) => i.variant_id === numVariantId);

    if (!existingItem && existingItems.length >= 100) {
      throw new ApiError(409, 'CART_LIMIT_EXCEEDED', 'Cart cannot exceed 100 distinct items.');
    }

    const contentChanged = !existingItem || existingItem.quantity !== numQty;

    if (contentChanged) {
      const nextVersion = currentVersion + 1;
      if (nextVersion > 2147483647) {
        throw new ApiError(409, 'CART_VERSION_EXHAUSTED', 'Cart version limit exceeded.');
      }

      await connection.execute(
        `INSERT INTO cart_items (cart_id, variant_id, quantity)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = ?`,
        [cartId, numVariantId, numQty, numQty],
      );

      await connection.execute('UPDATE carts SET version = ? WHERE id = ?', [nextVersion, cartId]);
    }

    // Compute updated cart representation inside transaction to check total limit
    const cartResult = await readCart(connection, numCustId);
    const totalUnits = parseMoney(cartResult.total, { max: null });
    if (totalUnits > MAX_ORDER_UNITS) {
      throw new ApiError(409, 'CART_TOTAL_EXCEEDED', 'Cart total exceeds maximum allowed limit.');
    }

    await connection.commit();
    return cartResult;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function removeCartItem(db, customerId, variantId) {
  const numCustId = Number(customerId);
  const numVariantId = Number(variantId);

  if (!Number.isInteger(numVariantId) || numVariantId <= 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Variant not found.');
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute('SELECT id FROM customers WHERE id = ? FOR UPDATE', [numCustId]);

    const [carts] = await connection.execute(
      'SELECT id, version FROM carts WHERE customer_id = ? FOR UPDATE',
      [numCustId],
    );

    if (!carts.length) {
      await connection.commit();
      return {
        id: null,
        customerId: numCustId,
        version: 0,
        currency: 'USD',
        items: [],
        total: '0.00',
        hasShortage: false,
      };
    }

    const cart = carts[0];
    const [existingItems] = await connection.execute(
      'SELECT variant_id FROM cart_items WHERE cart_id = ? AND variant_id = ?',
      [cart.id, numVariantId],
    );

    if (existingItems.length > 0) {
      const nextVersion = cart.version + 1;
      if (nextVersion > 2147483647) {
        throw new ApiError(409, 'CART_VERSION_EXHAUSTED', 'Cart version limit exceeded.');
      }

      await connection.execute('DELETE FROM cart_items WHERE cart_id = ? AND variant_id = ?', [
        cart.id,
        numVariantId,
      ]);
      await connection.execute('UPDATE carts SET version = ? WHERE id = ?', [nextVersion, cart.id]);
    }

    const result = await readCart(connection, numCustId);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function clearCart(db, customerId) {
  const numCustId = Number(customerId);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute('SELECT id FROM customers WHERE id = ? FOR UPDATE', [numCustId]);

    const [carts] = await connection.execute(
      'SELECT id, version FROM carts WHERE customer_id = ? FOR UPDATE',
      [numCustId],
    );

    if (carts.length) {
      const cart = carts[0];
      const [existingItems] = await connection.execute(
        'SELECT variant_id FROM cart_items WHERE cart_id = ?',
        [cart.id],
      );

      if (existingItems.length > 0) {
        await connection.execute('DELETE FROM cart_items WHERE cart_id = ?', [cart.id]);
        await connection.execute('UPDATE carts SET version = version + 1 WHERE id = ?', [cart.id]);
      }
    }

    const result = await readCart(connection, numCustId);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const isId = (value) => Number.isInteger(value) && value > 0 && value <= 4294967295;
const invalidData = () => new ApiError(409, 'CHECKOUT_DATA_INVALID', 'Cart data needs review.');

// The caller must hold the customer's row lock in the same transaction.
// All cart writers must use that lock too, including when creating a cart.
// This helper never starts, commits, rolls back or releases a transaction.
export async function readCartForCheckout(connection, customerId) {
  if (!isId(customerId)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid customer ID.');
  }

  const [carts] = await connection.execute(
    'SELECT id, version FROM carts WHERE customer_id = ? FOR UPDATE',
    [customerId],
  );
  if (!Array.isArray(carts) || carts.length > 1) throw invalidData();
  if (carts.length === 0) return { version: 0, items: [] };

  const cart = carts[0];
  if (!isId(cart.id) || !Number.isInteger(cart.version) || cart.version < 0 ||
      cart.version > 4294967295) throw invalidData();

  const [rows] = await connection.execute(
    `SELECT variant_id AS variantId, quantity FROM cart_items
     WHERE cart_id = ? ORDER BY variant_id FOR UPDATE`,
    [cart.id],
  );
  if (!Array.isArray(rows)) throw invalidData();
  const seen = new Set();
  const items = rows.map((row) => {
    if (!isId(row.variantId) || !Number.isInteger(row.quantity) ||
        row.quantity < 1 || row.quantity > 99 || seen.has(row.variantId)) {
      throw invalidData();
    }
    seen.add(row.variantId);
    return { variantId: row.variantId, quantity: row.quantity };
  });
  return { version: cart.version, items };
}
