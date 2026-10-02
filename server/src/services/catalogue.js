import { ApiError } from '../errors.js';
import { parseMoney, formatMoneyUnits } from '../utils/money.js';

/**
 * Run operations within a database transaction, handling commit, rollback and release.
 */
export async function withTransaction(db, fn) {
  const conn = typeof db.getConnection === 'function' ? await db.getConnection() : db;
  const hasTx = typeof conn.beginTransaction === 'function';
  if (hasTx) await conn.beginTransaction();
  try {
    const result = await fn(conn);
    if (hasTx) await conn.commit();
    return result;
  } catch (err) {
    if (hasTx) await conn.rollback();
    throw err;
  } finally {
    if (conn !== db && typeof conn.release === 'function') {
      conn.release();
    }
  }
}

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

/**
 * Verifies that a product satisfies all readiness requirements before activation:
 * 1. Has at least 1 category
 * 2. Has at least 1 active variant
 * 3. Has exactly 1 active default variant
 */
export async function verifyProductReadiness(connection, productId) {
  // Check categories
  const [categories] = await connection.execute(
    'SELECT category_id FROM product_categories WHERE product_id = ?',
    [productId],
  );
  if (!categories || categories.length === 0) {
    throw new ApiError(
      409,
      'CATEGORY_REQUIRED',
      'An active product must belong to at least one category.',
    );
  }

  // Lock and fetch variants in ascending ID order
  const [variants] = await connection.execute(
    'SELECT id, is_active AS isActive, is_default AS isDefault FROM variants WHERE product_id = ? ORDER BY id ASC FOR UPDATE',
    [productId],
  );

  const activeVariants = (variants || []).filter((v) => Number(v.isActive) === 1);
  if (activeVariants.length === 0) {
    throw new ApiError(
      409,
      'PRODUCT_NOT_READY',
      'An active product must have at least one active variant.',
    );
  }

  const activeDefaultVariants = activeVariants.filter((v) => Number(v.isDefault) === 1);
  if (activeDefaultVariants.length !== 1) {
    throw new ApiError(
      409,
      'DEFAULT_VARIANT_REQUIRED',
      'An active product requires an active default variant.',
    );
  }

  return true;
}

/**
 * Atomically sets the default variant for a product.
 * Locks the product row first, then locks all variants in ascending order.
 * Verifies target variant belongs to product and is active.
 */
export async function setDefaultVariant(connection, productId, variantId) {
  // 1. Lock product row first
  const [products] = await connection.execute(
    'SELECT id, is_active AS isActive FROM products WHERE id = ? FOR UPDATE',
    [productId],
  );
  if (!products || !products[0]) {
    throw new ApiError(404, 'NOT_FOUND', 'Product not found.');
  }

  // 2. Lock variants in ascending ID order
  const [variants] = await connection.execute(
    'SELECT id, product_id, is_active AS isActive, is_default AS isDefault FROM variants WHERE product_id = ? ORDER BY id ASC FOR UPDATE',
    [productId],
  );

  const targetVariant = (variants || []).find((v) => v.id === Number(variantId));
  if (!targetVariant) {
    throw new ApiError(404, 'NOT_FOUND', 'Variant not found for this product.');
  }

  if (Number(targetVariant.isActive) !== 1) {
    throw new ApiError(
      409,
      'DEFAULT_VARIANT_REQUIRED',
      'Default variant must be active.',
    );
  }

  // 3. Clear prior default
  await connection.execute(
    'UPDATE variants SET is_default = 0 WHERE product_id = ? AND is_default = 1',
    [productId],
  );

  // 4. Set new default
  await connection.execute('UPDATE variants SET is_default = 1 WHERE id = ?', [variantId]);

  return true;
}

/**
 * Sets product active state after verifying readiness requirements.
 */
export async function setProductActive(connection, productId, isActive) {
  // 1. Lock product row first
  const [products] = await connection.execute(
    'SELECT id, is_active AS isActive FROM products WHERE id = ? FOR UPDATE',
    [productId],
  );
  if (!products || !products[0]) {
    throw new ApiError(404, 'NOT_FOUND', 'Product not found.');
  }

  if (isActive) {
    await verifyProductReadiness(connection, productId);
    await connection.execute('UPDATE products SET is_active = 1 WHERE id = ?', [productId]);
  } else {
    await connection.execute('UPDATE products SET is_active = 0 WHERE id = ?', [productId]);
  }

  return true;
}

/**
 * Sets variant active state, ensuring an active product never loses its active default or all active variants.
 */
export async function setVariantActive(connection, variantId, isActive) {
  // 1. Fetch variant to get productId
  const [variants] = await connection.execute(
    'SELECT id, product_id AS productId, is_active AS isActive, is_default AS isDefault FROM variants WHERE id = ?',
    [variantId],
  );
  if (!variants || !variants[0]) {
    throw new ApiError(404, 'NOT_FOUND', 'Variant not found.');
  }
  const currentVariant = variants[0];
  const productId = currentVariant.productId;

  // 2. Lock product row first
  const [products] = await connection.execute(
    'SELECT id, is_active AS isActive FROM products WHERE id = ? FOR UPDATE',
    [productId],
  );
  if (!products || !products[0]) {
    throw new ApiError(404, 'NOT_FOUND', 'Product not found.');
  }
  const product = products[0];

  // 3. Lock all variants in ascending ID order
  const [allVariants] = await connection.execute(
    'SELECT id, is_active AS isActive, is_default AS isDefault FROM variants WHERE product_id = ? ORDER BY id ASC FOR UPDATE',
    [productId],
  );

  if (!isActive && Number(product.isActive) === 1) {
    // If product is active, cannot deactivate default variant without replacement
    if (Number(currentVariant.isDefault) === 1) {
      throw new ApiError(
        409,
        'DEFAULT_VARIANT_REQUIRED',
        'Cannot deactivate the default variant of an active product. Set a new default variant first.',
      );
    }
    // Cannot deactivate if it's the only active variant
    const otherActive = (allVariants || []).filter(
      (v) => v.id !== Number(variantId) && Number(v.isActive) === 1,
    );
    if (otherActive.length === 0) {
      throw new ApiError(
        409,
        'PRODUCT_NOT_READY',
        'Cannot deactivate the only active variant of an active product.',
      );
    }
  }

  await connection.execute('UPDATE variants SET is_active = ? WHERE id = ?', [
    isActive ? 1 : 0,
    variantId,
  ]);

  return true;
}
