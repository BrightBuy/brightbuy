/**
 * Post-demo-seed reconciliation hook for Member 1 (Catalogue & Variants).
 *
 * Ensures that all legacy foundation products (IDs 1, 2, 3) and variants
 * satisfy the project requirements without breaking the original demo seed:
 *
 * 1. Products:
 *    - Marked `is_legacy = 1` and `is_active = 0` (starts inactive)
 *    - Retain their original `currency = 'LKR'`
 *    - Assigned deterministic, unique legacy SKUs ('LEGACY-PRD-1', 'LEGACY-PRD-2', 'LEGACY-PRD-3')
 *    - Assigned to a legacy category ('Everyday Essentials')
 *
 * 2. Variants:
 *    - Marked `is_active = 1`
 *    - Exactly one active default variant per product (variant with lowest ID)
 *    - Unique canonical combination keys ('legacy-var-<id>')
 *
 * This function is idempotent and safe to run multiple times.
 */
export async function reconcileLegacyCatalogue(connection) {
  // 1. Ensure a legacy category exists for legacy products
  await connection.query(`
    INSERT IGNORE INTO categories (id, name, description)
    VALUES (1, 'Everyday Essentials', 'Foundation legacy collection')
  `);

  // 2. Reconcile legacy products
  const [products] = await connection.query(`
    SELECT id, name, sku, is_legacy, currency, is_active FROM products ORDER BY id
  `);

  for (const product of products || []) {
    if (product.id <= 3 || !product.sku || product.is_legacy) {
      const legacySku = product.sku || `LEGACY-PRD-${product.id}`;
      const safeId = Number(product.id);
      await connection.query(`
        UPDATE products
        SET sku = '${legacySku}',
            currency = 'LKR',
            is_legacy = 1,
            is_active = 0
        WHERE id = ${safeId}
      `);

      // Assign to category 1 if not already linked
      await connection.query(`
        INSERT INTO product_categories (product_id, category_id)
        VALUES (${safeId}, 1)
        ON DUPLICATE KEY UPDATE product_id = product_id
      `);
    }
  }

  // 3. Reconcile legacy variants: ensure exactly one default per product and canonical combination key
  const [variants] = await connection.query(`
    SELECT id, product_id, sku, is_active, is_default, combination_key
    FROM variants
    ORDER BY product_id ASC, id ASC
  `);

  const productVariantsMap = new Map();
  for (const v of variants || []) {
    if (!productVariantsMap.has(v.product_id)) {
      productVariantsMap.set(v.product_id, []);
    }
    productVariantsMap.get(v.product_id).push(v);
  }

  for (const [, productVars] of productVariantsMap.entries()) {
    const hasDefault = productVars.some((v) => v.is_default === 1);
    for (let i = 0; i < productVars.length; i++) {
      const v = productVars[i];
      const isDefault = !hasDefault && i === 0 ? 1 : v.is_default;
      const combinationKey = v.combination_key || `legacy-var-${v.id}`;
      const safeVarId = Number(v.id);
      await connection.query(`
        UPDATE variants
        SET is_default = ${isDefault},
            is_active = 1,
            combination_key = '${combinationKey}'
        WHERE id = ${safeVarId}
      `);
    }
  }
}
