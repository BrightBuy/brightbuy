import { ApiError } from '../errors.js';
import { parseMoney, formatMoneyUnits } from '../utils/money.js';

/**
 * =============================================================================
 * BrightBuy Catalogue Service — Architecture & Design Invariants
 * =============================================================================
 *
 * 1. TRANSACTIONAL LOCKING HIERARCHY (Deadlock Prevention):
 *    - Always lock parent `products` row first (`SELECT id FROM products WHERE id = ? FOR UPDATE`).
 *    - Then lock child `variants` rows strictly in ascending primary key order
 *      (`SELECT id, ... FROM variants WHERE product_id = ? ORDER BY id ASC FOR UPDATE`).
 *    - Never acquire customer, cart, or order locks during catalogue mutations to prevent
 *      cross-domain deadlocks.
 *
 * 2. CANONICAL COMBINATION KEYS:
 *    - To enforce that no two variants of the same product have identical attribute configurations,
 *      variant attribute values are normalized: trimmed, lowercased, sorted by ascending attribute ID,
 *      and formatted as `attr:<id>=<normalized_value>|...`.
 *    - Variants without attributes receive combination_key = "" (allowing at most one default-only
 *      variant per product).
 *    - Uniqueness is enforced by MySQL constraint:
 *      `CONSTRAINT uq_variant_product_combination UNIQUE (product_id, combination_key)`
 *
 * 3. DEFAULT VARIANT AT-MOST-ONE CONSTRAINT:
 *    - MySQL enforces that a product has at most one default variant via a virtual generated column:
 *      `default_key INT GENERATED ALWAYS AS (CASE WHEN is_default=1 THEN 1 ELSE NULL END) VIRTUAL`
 *      `CONSTRAINT uq_variant_product_default UNIQUE (product_id, default_key)`
 *    - Since NULL values do not collide in MySQL UNIQUE indexes, multiple non-default variants
 *      (where default_key IS NULL) can coexist, while two default variants (default_key = 1) collide.
 *
 * 4. FINANCIAL EXACTNESS & CURRENCY BOUNDARY:
 *    - All price conversions use BigInt minor units via parseMoney() and formatMoneyUnits().
 *    - Floating point math is strictly avoided. New project products default to 'USD'.
 * =============================================================================
 */

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
 * Fetches a single public product by ID, including its categories and active variants.
 * Returns null if the product is not found or is inactive.
 */
export async function fetchPublicProduct(connection, productId) {
  const [products] = await connection.execute(
    `SELECT id, sku, name, description, brand, currency
     FROM products WHERE id = ? AND is_active = 1`,
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

  // Fetch active variants
  const [variants] = await connection.execute(
    `SELECT id, product_id AS productId, sku, name, price, stock,
            is_default AS isDefault
     FROM variants
     WHERE product_id = ? AND is_active = 1
     ORDER BY is_default DESC, id ASC`,
    [productId],
  );

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
    variant.isDefault = Number(variant.isDefault);
  }

  const defaultVariant = variants.find((v) => v.isDefault === 1) || variants[0] || null;

  return {
    ...product,
    categories: categories || [],
    defaultVariant,
    variants: variants || [],
  };
}

/**
 * Fetches a paginated list of active products with optional search and category filters.
 */
export async function fetchPublicCatalogue(
  connection,
  { q, categoryId, minPrice, maxPrice, availability, page = 1, pageSize = 12 } = {},
) {
  const conditions = ['p.is_active = 1'];
  const params = [];

  let joinClause = '';
  if (categoryId) {
    joinClause = 'JOIN product_categories pc ON pc.product_id = p.id';
    conditions.push('pc.category_id = ?');
    params.push(categoryId);
  }

  if (q) {
    conditions.push('(p.name LIKE ? OR p.brand LIKE ? OR p.description LIKE ? OR p.sku LIKE ?)');
    const searchTerm = `%${q}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  // Price and stock conditions must describe the same active variant.
  const variantConditions = ['v.product_id = p.id', 'v.is_active = 1'];
  if (minPrice !== undefined) { variantConditions.push('v.price >= ?'); params.push(minPrice); }
  if (maxPrice !== undefined) { variantConditions.push('v.price <= ?'); params.push(maxPrice); }
  if (availability === 'in-stock') variantConditions.push('v.stock > 0');
  if (availability === 'backorder') variantConditions.push('v.stock = 0');
  conditions.push('EXISTS (SELECT 1 FROM variants v WHERE ' + variantConditions.join(' AND ') + ')');

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total matching products
  const countSql = `SELECT COUNT(DISTINCT p.id) AS total FROM products p ${joinClause} ${whereClause}`;
  const [countResult] = await connection.execute(countSql, params);
  const total = countResult[0]?.total || 0;

  // Fetch matching product IDs with stable ordering
  const offset = (page - 1) * pageSize;
  const selectSql = `
    SELECT DISTINCT p.id
    FROM products p
    ${joinClause}
    ${whereClause}
    ORDER BY p.id ASC
    LIMIT ? OFFSET ?
  `;
  const [pagedProducts] = await connection.execute(selectSql, [...params, pageSize, offset]);

  const items = [];
  for (const p of pagedProducts || []) {
    const full = await fetchPublicProduct(connection, p.id);
    if (full) {
      // Show a variant that actually satisfies the selected price/stock filters.
      const matching = full.variants.filter(v =>
        (minPrice === undefined || parseMoney(v.price) >= parseMoney(minPrice)) &&
        (maxPrice === undefined || parseMoney(v.price) <= parseMoney(maxPrice)) &&
        (availability !== 'in-stock' || v.stock > 0) &&
        (availability !== 'backorder' || v.stock === 0));
      full.defaultVariant = matching.find(v => v.isDefault === 1) || matching[0] || full.defaultVariant;
      items.push(full);
    }
  }

  const totalPages = Math.ceil(total / pageSize) || 1;

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
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
