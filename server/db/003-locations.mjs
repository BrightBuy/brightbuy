// Member 5: supported cities and pickup stores. No location fixtures are seeded here.
export async function apply(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS cities (
      id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      normalized_name VARCHAR(100)
        GENERATED ALWAYS AS (LOWER(TRIM(name))) STORED,
      is_main_city TINYINT(1) NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      UNIQUE KEY uq_cities_name (normalized_name),
      CHECK (CHAR_LENGTH(TRIM(name)) > 0),
      CHECK (is_main_city IN (0, 1)),
      CHECK (is_active IN (0, 1))
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS stores (
      id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      normalized_name VARCHAR(100)
        GENERATED ALWAYS AS (LOWER(TRIM(name))) STORED,
      city_id INT UNSIGNED NOT NULL,
      address_line VARCHAR(250) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      UNIQUE KEY uq_stores_city_name (city_id, normalized_name),
      FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE RESTRICT,
      CHECK (CHAR_LENGTH(TRIM(name)) > 0),
      CHECK (CHAR_LENGTH(TRIM(address_line)) > 0),
      CHECK (is_active IN (0, 1))
    )
  `);
}
