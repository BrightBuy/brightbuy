export async function up(connection) {
  const [columns] = await connection.query('SHOW COLUMNS FROM customers');
  const names = new Set(columns.map(c => c.Field));
  // Existing accounts remain usable; registration explicitly opts into verification.
  if (!names.has('email_verified')) await connection.query('ALTER TABLE customers ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT TRUE');
  if (!names.has('auth_version')) await connection.query('ALTER TABLE customers ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 0');
  await connection.query(`CREATE TABLE IF NOT EXISTS account_tokens (
    customer_id INT UNSIGNED NOT NULL,
    purpose ENUM('verify','reset') NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (customer_id, purpose), UNIQUE KEY uq_account_token (token_hash),
    CONSTRAINT fk_account_token_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}
