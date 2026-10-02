import { ApiError } from '../errors.js';
import { parseMoney, formatMoneyUnits } from '../utils/money.js';

/**
 * Computes a collision-resistant canonical combination key from variant attribute values.
 * Empty attribute array produces an empty string "", allowing exactly one default-only variant.
 */
export function computeCombinationKey(attributeValues = []) {
  if (!Array.isArray(attributeValues)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'attributeValues must be an array.');
  }

  const seenAttrIds = new Set();
  const normalizedPairs = [];

  for (const item of attributeValues) {
    if (!item || typeof item !== 'object') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Each attribute value must be an object.');
    }
    const attrId = Number(item.attributeId);
    if (!Number.isSafeInteger(attrId) || attrId <= 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'attributeId must be a positive integer.');
    }
    if (seenAttrIds.has(attrId)) {
      throw new ApiError(400, 'VALIDATION_ERROR', `Duplicate attributeId in variant: ${attrId}`);
    }
    seenAttrIds.add(attrId);

    const val = typeof item.value === 'string' ? item.value.trim() : '';
    if (!val || val.length > 100) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Attribute value must be a string between 1 and 100 characters.',
      );
    }

    normalizedPairs.push({
      attributeId: attrId,
      rawVal: val,
      normVal: val.toLowerCase(),
    });
  }

  if (normalizedPairs.length === 0) {
    return '';
  }

  // Sort by attributeId ascending for canonical ordering
  normalizedPairs.sort((a, b) => a.attributeId - b.attributeId);
  return normalizedPairs.map((p) => `attr:${p.attributeId}=${p.normVal}`).join('|');
}

/**
 * Helper to fetch a complete product object with categories and variants.
 */
export async function fetchFullProduct(connection, productId) {
  const [products] = await connection.execute(
    `SELECT id, name, description, sku, brand, currency, is_active AS isActive, is_legacy AS isLegacy
     FROM products WHERE id = ?`,
    [productId],
  );
  if (!products || !products[0]) return null;

  const product = products[0];

  // Fetch categories
  const [categories] = await connection.execute(
    `SELECT c.id, c.name, c.description
     FROM categories c
     JOIN product_categories pc ON pc.category_id = c.id
     WHERE pc.product_id = ?
     ORDER BY c.name ASC`,
    [productId],
  );

  // Fetch variants
  const [variants] = await connection.execute(
    `SELECT id, product_id AS productId, sku, name, price, stock,
            is_active AS isActive, is_default AS isDefault
     FROM variants
     WHERE product_id = ?
     ORDER BY id ASC`,
    [productId],
  );

  // Fetch attribute values for all variants of this product
  for (const variant of variants) {
    const [attrValues] = await connection.execute(
      `SELECT a.id AS attributeId, a.name, vav.value
       FROM variant_attribute_values vav
       JOIN attributes a ON a.id = vav.attribute_id
       WHERE vav.variant_id = ?
       ORDER BY a.id ASC`,
      [variant.id],
    );
    variant.attributeValues = attrValues || [];
    variant.price = formatMoneyUnits(parseMoney(String(variant.price)));
  }

  return {
    ...product,
    isActive: Boolean(product.isActive),
    isLegacy: Boolean(product.isLegacy),
    categories: categories || [],
    variants: variants || [],
  };
}
