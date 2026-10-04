/**
 * Migration 004: Catalogue, Categories, Attributes, and Variants.
 *
 * Implements:
 * - categories table with unique normalized name
 * - product_categories junction table (many-to-many)
 * - attributes table with unique normalized name
 * - variant_attribute_values junction table
 * - products extensions: sku (unique), brand, currency, is_active, is_legacy
 * - variants extensions: is_active, is_default, default_key (virtual), combination_key
 *
 * Uses information_schema inspection for retry-safe idempotency.
 */
export async function apply(connection) {
  // 1. Categories
  await connection.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL UNIQUE,
      description VARCHAR(500) NOT NULL DEFAULT ''
    )
  `);

  // 2. Product-Categories Many-to-Many junction
  await connection.query(`
    CREATE TABLE IF NOT EXISTS product_categories (
      product_id INT UNSIGNED NOT NULL,
      category_id INT UNSIGNED NOT NULL,
      PRIMARY KEY (product_id, category_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
      INDEX idx_product_categories_category (category_id)
    )
  `);

  // 3. Attributes
  await connection.query(`
    CREATE TABLE IF NOT EXISTS attributes (
      id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(50) NOT NULL UNIQUE
    )
  `);

  // 4. Variant-Attribute Values junction
  await connection.query(`
    CREATE TABLE IF NOT EXISTS variant_attribute_values (
      variant_id INT UNSIGNED NOT NULL,
      attribute_id INT UNSIGNED NOT NULL,
      value VARCHAR(100) NOT NULL,
      PRIMARY KEY (variant_id, attribute_id),
      FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE,
      FOREIGN KEY (attribute_id) REFERENCES attributes(id) ON DELETE RESTRICT,
      INDEX idx_variant_attributes_attribute (attribute_id)
    )
  `);

  // 5. Inspect products table for existing columns
  const [productCols] = await connection.query(`
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
  `);
  const existingProductCols = new Set((productCols || []).map((c) => c.COLUMN_NAME));

  if (!existingProductCols.has('sku')) {
    await connection.query(`ALTER TABLE products ADD COLUMN sku VARCHAR(60) NULL UNIQUE`);
  }
  if (!existingProductCols.has('brand')) {
    await connection.query(
      `ALTER TABLE products ADD COLUMN brand VARCHAR(100) NOT NULL DEFAULT ''`,
    );
  }
  if (!existingProductCols.has('currency')) {
    await connection.query(
      `ALTER TABLE products ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'USD'`,
    );
  }
  if (!existingProductCols.has('is_active')) {
    await connection.query(
      `ALTER TABLE products ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 0`,
    );
  }
  if (!existingProductCols.has('is_legacy')) {
    await connection.query(
      `ALTER TABLE products ADD COLUMN is_legacy TINYINT(1) NOT NULL DEFAULT 0`,
    );
  }

  // 6. Inspect variants table for existing columns and constraints
  const [variantCols] = await connection.query(`
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'variants'
  `);
  const existingVariantCols = new Set((variantCols || []).map((c) => c.COLUMN_NAME));

  if (!existingVariantCols.has('is_active')) {
    await connection.query(
      `ALTER TABLE variants ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`,
    );
  }
  if (!existingVariantCols.has('is_default')) {
    await connection.query(
      `ALTER TABLE variants ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0`,
    );
  }
  if (!existingVariantCols.has('default_key')) {
    await connection.query(`
      ALTER TABLE variants
      ADD COLUMN default_key INT GENERATED ALWAYS AS (CASE WHEN is_default = 1 THEN 1 ELSE NULL END) VIRTUAL
    `);
    await connection.query(`
      ALTER TABLE variants
      ADD CONSTRAINT uq_variant_product_default UNIQUE (product_id, default_key)
    `);
  }
  if (!existingVariantCols.has('combination_key')) {
    await connection.query(`ALTER TABLE variants ADD COLUMN combination_key VARCHAR(255) NULL`);
    await connection.query(`
      ALTER TABLE variants
      ADD CONSTRAINT uq_variant_product_combination UNIQUE (product_id, combination_key)
    `);
  }
}
