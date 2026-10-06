/**
 * Migration 005: Customer Accounts, Addresses, Admin Profiles, and Persistent Cart.
 *
 * Implements:
 * - customers extensions: first_name, last_name, phone_number, registered_at
 * - admin_profiles table: ID PK/FK to customers.id, staff_role
 * - addresses extensions: city_id (FK to cities.id), line2, line3, is_default
 * - carts table: persistent versioned cart per customer
 * - cart_items table: cart items with quantity check 1-99 and cascade deletion from cart
 *
 * Safe for repeated execution via information_schema checks.
 */
export async function apply(connection) {
  // 1. Customers extensions
  const [customerCols] = await connection.query(`
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers'
  `);
  const existingCustCols = new Set((customerCols || []).map((c) => c.COLUMN_NAME));

  if (!existingCustCols.has('first_name')) {
    await connection.query(`ALTER TABLE customers ADD COLUMN first_name VARCHAR(50) NULL`);
  }
  if (!existingCustCols.has('last_name')) {
    await connection.query(`ALTER TABLE customers ADD COLUMN last_name VARCHAR(50) NULL`);
  }
  if (!existingCustCols.has('phone_number')) {
    await connection.query(`ALTER TABLE customers ADD COLUMN phone_number VARCHAR(30) NULL`);
  }
  if (!existingCustCols.has('registered_at')) {
    await connection.query(
      `ALTER TABLE customers ADD COLUMN registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
  }

  // 2. Admin profiles entity
  await connection.query(`
    CREATE TABLE IF NOT EXISTS admin_profiles (
      id INT UNSIGNED PRIMARY KEY,
      staff_role VARCHAR(50) NOT NULL DEFAULT 'administrator',
      FOREIGN KEY (id) REFERENCES customers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // Backfill admin_profiles for existing admin accounts
  await connection.query(`
    INSERT IGNORE INTO admin_profiles (id, staff_role)
    SELECT id, 'administrator' FROM customers WHERE role = 'admin'
  `);

  // 3. Addresses extensions
  const [addressCols] = await connection.query(`
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'addresses'
  `);
  const existingAddrCols = new Set((addressCols || []).map((c) => c.COLUMN_NAME));

  if (!existingAddrCols.has('city_id')) {
    await connection.query(`ALTER TABLE addresses ADD COLUMN city_id INT UNSIGNED NULL`);
  }
  if (!existingAddrCols.has('line2')) {
    await connection.query(`ALTER TABLE addresses ADD COLUMN line2 VARCHAR(200) NULL`);
  }
  if (!existingAddrCols.has('line3')) {
    await connection.query(`ALTER TABLE addresses ADD COLUMN line3 VARCHAR(200) NULL`);
  }
  if (!existingAddrCols.has('is_default')) {
    await connection.query(
      `ALTER TABLE addresses ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0`,
    );
  }

  // Check if FK on addresses.city_id exists
  const [addressFks] = await connection.query(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'addresses'
      AND COLUMN_NAME = 'city_id'
      AND REFERENCED_TABLE_NAME = 'cities'
  `);
  if (!addressFks.length) {
    // Add foreign key only if cities table exists
    const [citiesTable] = await connection.query(`
      SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cities'
    `);
    if (citiesTable.length) {
      await connection.query(`
        ALTER TABLE addresses
        ADD CONSTRAINT fk_addresses_city
        FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE RESTRICT
      `);
    }
  }

  // 4. Persistent Cart Header
  await connection.query(`
    CREATE TABLE IF NOT EXISTS carts (
      id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      customer_id INT UNSIGNED NOT NULL UNIQUE,
      version INT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_carts_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB;
  `);

  // 5. Persistent Cart Items
  await connection.query(`
    CREATE TABLE IF NOT EXISTS cart_items (
      cart_id INT UNSIGNED NOT NULL,
      variant_id INT UNSIGNED NOT NULL,
      quantity INT UNSIGNED NOT NULL CHECK (quantity BETWEEN 1 AND 99),
      PRIMARY KEY (cart_id, variant_id),
      CONSTRAINT fk_cart_items_cart FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
      CONSTRAINT fk_cart_items_variant FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB;
  `);
}

export async function up(connection) {
  return apply(connection);
}
