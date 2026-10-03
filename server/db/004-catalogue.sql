CREATE TABLE IF NOT EXISTS categories (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(500) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS product_categories (
  product_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (product_id, category_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  INDEX idx_product_categories_category (category_id)
);

CREATE TABLE IF NOT EXISTS attributes (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS variant_attribute_values (
  variant_id INT UNSIGNED NOT NULL,
  attribute_id INT UNSIGNED NOT NULL,
  value VARCHAR(100) NOT NULL,
  PRIMARY KEY (variant_id, attribute_id),
  FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE,
  FOREIGN KEY (attribute_id) REFERENCES attributes(id) ON DELETE RESTRICT,
  INDEX idx_variant_attributes_attribute (attribute_id)
);

ALTER TABLE products
  ADD COLUMN sku VARCHAR(60) NULL UNIQUE,
  ADD COLUMN brand VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN is_legacy TINYINT(1) NOT NULL DEFAULT 0,
  ADD INDEX idx_products_active (is_active);

UPDATE products
  SET currency = 'LKR', is_legacy = 1, sku = CONCAT('LEGACY-PRD-', id)
  WHERE sku IS NULL;

ALTER TABLE variants
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN default_key INT GENERATED ALWAYS AS (CASE WHEN is_default = 1 THEN 1 ELSE NULL END) VIRTUAL,
  ADD COLUMN combination_key VARCHAR(255) NULL,
  ADD CONSTRAINT uq_variant_product_default UNIQUE (product_id, default_key),
  ADD CONSTRAINT uq_variant_product_combination UNIQUE (product_id, combination_key),
  ADD INDEX idx_variants_product_active (product_id, is_active);

UPDATE variants
  SET is_default = 1
  WHERE id IN (1, 3, 5);
