// Old addresses remain unclassified until their owner selects a supported city.
export async function apply(connection) {
  const [columns] = await connection.execute(
    `SELECT DATA_TYPE, COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'city_id'`,
  );
  if (!columns.length) {
    await connection.query('ALTER TABLE addresses ADD COLUMN city_id INT UNSIGNED NULL');
  } else if (columns[0].DATA_TYPE !== 'int' || !columns[0].COLUMN_TYPE.includes('unsigned')) {
    throw new Error(
      'addresses.city_id must be an unsigned integer; review the shared address schema.',
    );
  }
  const [indexes] = await connection.execute(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'addresses'
       AND COLUMN_NAME = 'city_id' AND SEQ_IN_INDEX = 1`,
  );
  if (!indexes.length)
    await connection.query('ALTER TABLE addresses ADD INDEX idx_addresses_city (city_id)');
  const [keys] = await connection.execute(
    `SELECT REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'city_id'
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
  );
  if (
    keys.length &&
    keys.some(
      (key) => key.REFERENCED_TABLE_NAME !== 'cities' || key.REFERENCED_COLUMN_NAME !== 'id',
    )
  ) {
    throw new Error('addresses.city_id has an incompatible foreign key.');
  }
  if (!keys.length)
    await connection.query(`ALTER TABLE addresses
    ADD CONSTRAINT fk_addresses_city FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE RESTRICT`);
}
