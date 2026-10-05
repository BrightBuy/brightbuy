import { ApiError } from '../errors.js';

const isId = (value) => Number.isInteger(value) && value > 0 && value <= 4294967295;
const invalidData = () => new ApiError(409, 'CHECKOUT_DATA_INVALID', 'Cart data needs review.');

// The caller must hold the customer's row lock in the same transaction.
// All cart writers must use that lock too, including when creating a cart.
// This helper never starts, commits, rolls back or releases a transaction.
export async function readCart(connection, customerId) {
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
