import { ApiError } from '../errors.js';
const unavailable = () => new ApiError(409, 'VARIANT_UNAVAILABLE',
  'Remove unavailable items or reload your cart.');

export async function lockCheckoutLines(connection, cartItems) {
  if (!Array.isArray(cartItems) || !cartItems.length) {
    throw new ApiError(409, 'EMPTY_CART', 'Your cart is empty.');
  }
  if (cartItems.length > 100) {
    throw new ApiError(409, 'CART_LIMIT_EXCEEDED', 'Maximum 100 distinct lines.');
  }
  const ids = new Set();
  for (const item of cartItems) {
    if (!Number.isInteger(item.variantId) || item.variantId < 1 ||
        item.variantId > 4294967295 || ids.has(item.variantId) ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      throw new ApiError(409, 'CART_CHANGED', 'Cart data is invalid; reload it.');
    }
    ids.add(item.variantId);
  }
  const sorted = [...cartItems].sort((a, b) => a.variantId - b.variantId);
  const identities = new Map();
  // product_id is immutable in this project; no reparent/delete API is allowed.
  // This preliminary read is only for IDs, never for current price/stock.
  for (const item of sorted) {
    const [rows] = await connection.execute(
      'SELECT product_id AS productId FROM variants WHERE id=?', [item.variantId]);
    if (!rows[0]) throw unavailable();
    identities.set(item.variantId, rows[0].productId);
  }
  const products = new Map();
  const categoryIds = new Map();
  const productIds = [...new Set(identities.values())].sort((a, b) => a - b);
  for (const id of productIds) {
    const [rows] = await connection.execute(
      `SELECT id,name,currency,is_active AS isActive,is_legacy AS isLegacy
       FROM products WHERE id=? FOR UPDATE`, [id]);
    const product = rows[0];
    if (!product || !product.isActive || product.isLegacy || product.currency !== 'USD') {
      throw unavailable();
    }
    products.set(id, product);
  }
  const lines = [];
  for (const item of sorted) {
    const [rows] = await connection.execute(
      `SELECT id,product_id AS productId,name,price,stock,is_active AS isActive
       FROM variants WHERE id=? FOR UPDATE`, [item.variantId]);
    const variant = rows[0];
    if (!variant || !variant.isActive ||
        variant.productId !== identities.get(item.variantId)) throw unavailable();
    const product = products.get(variant.productId);
    lines.push({ variantId: variant.id, productId: product.id,
      productName: product.name, variantName: variant.name,
      unitPrice: variant.price, stock: variant.stock, quantity: item.quantity });
  }
  // Current locking reads avoid an earlier repeatable-read snapshot's categories.
  // M1's category reassignment must lock the product parent first too.
  for (const id of productIds) {
    const [rows] = await connection.execute(
      `SELECT category_id AS id FROM product_categories
       WHERE product_id=? ORDER BY category_id FOR SHARE`, [id]);
    if (!rows.length) throw unavailable();
    categoryIds.set(id, rows.map((row) => row.id));
  }
  return lines.map((line) => ({ ...line, categoryIds: categoryIds.get(line.productId) }));
}
