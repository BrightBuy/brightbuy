CREATE TABLE IF NOT EXISTS customers (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
 name VARCHAR(100) NOT NULL,
 email VARCHAR(254) NOT NULL UNIQUE,
 password_hash VARCHAR(200) NOT NULL,
 role ENUM('customer','admin') NOT NULL DEFAULT 'customer'
);
CREATE TABLE IF NOT EXISTS products (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
 name VARCHAR(150) NOT NULL,
 description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS variants (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
 product_id INT UNSIGNED NOT NULL,
 sku VARCHAR(60) NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL,
 price DECIMAL(12,2) NOT NULL CHECK (price >= 0),
 stock INT UNSIGNED NOT NULL DEFAULT 0,
 FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS addresses (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
 customer_id INT UNSIGNED NOT NULL,
 recipient VARCHAR(100) NOT NULL,
 line1 VARCHAR(200) NOT NULL,
 city VARCHAR(100) NOT NULL,
 postal_code VARCHAR(20) NOT NULL,
 country CHAR(2) NOT NULL,
 FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE TABLE IF NOT EXISTS orders (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
 customer_id INT UNSIGNED NOT NULL,
 status ENUM('pending','confirmed','processing','shipped','ready_for_pickup','delivered','collected','cancelled') NOT NULL DEFAULT 'pending',
 fulfillment ENUM('delivery','pickup') NOT NULL,
 address_snapshot JSON NULL,
 currency CHAR(3) NOT NULL DEFAULT 'LKR',
 total DECIMAL(12,2) NOT NULL CHECK (total >= 0),
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (customer_id) REFERENCES customers(id),
 CHECK ((fulfillment = 'delivery' AND address_snapshot IS NOT NULL) OR (fulfillment = 'pickup' AND address_snapshot IS NULL)),
 CHECK (status NOT IN ('shipped','delivered') OR fulfillment = 'delivery'),
 CHECK (status NOT IN ('ready_for_pickup','collected') OR fulfillment = 'pickup')
);
CREATE TABLE IF NOT EXISTS order_items (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
 order_id INT UNSIGNED NOT NULL,
 variant_id INT UNSIGNED NOT NULL,
 product_name VARCHAR(150) NOT NULL,
 variant_name VARCHAR(100) NOT NULL,
 quantity INT UNSIGNED NOT NULL CHECK (quantity > 0),
 unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
 FOREIGN KEY (order_id) REFERENCES orders(id),
 FOREIGN KEY (variant_id) REFERENCES variants(id)
);
