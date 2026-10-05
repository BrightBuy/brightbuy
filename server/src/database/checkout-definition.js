// Canonical M3 DDL. Apply through the guarded 007 migration.
// Freeze this definition after applying 007; make future changes in a new migration.
export const checkoutSchemaStatements = [
  `ALTER TABLE orders MODIFY COLUMN status ENUM(
  'pending','confirmed','processing','shipped','ready_for_pickup',
  'delivered','collected','cancelled','backordered'
) NOT NULL DEFAULT 'pending'`,
  `ALTER TABLE orders ADD COLUMN stock_state
  ENUM('none','allocated','released','consumed') NULL DEFAULT NULL`,
  `ALTER TABLE orders ADD COLUMN was_out_of_stock BOOLEAN NULL DEFAULT NULL`,
  `ALTER TABLE order_items ADD CONSTRAINT uq_order_variant
  UNIQUE (order_id, variant_id)`,
  `CREATE TABLE checkout_requests (
  customer_id INT UNSIGNED NOT NULL,
  request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payment_result ENUM('approved','declined','not_required') NOT NULL,
  order_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id, request_key),
  UNIQUE KEY uq_checkout_order (order_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT ck_checkout_result CHECK (
    (payment_result = 'declined' AND order_id IS NULL) OR
    (payment_result IN ('approved','not_required') AND order_id IS NOT NULL)
  )
) ENGINE=InnoDB`,
  `CREATE TABLE payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  method ENUM('cod','card') NOT NULL,
  status ENUM('pending','paid','refunded','void') NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL,
  reference VARCHAR(100) NULL,
  paid_at TIMESTAMP NULL DEFAULT NULL,
  refunded_at TIMESTAMP NULL DEFAULT NULL,
  refund_reference VARCHAR(100) NULL,
  collection_request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  refund_request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  collected_by INT UNSIGNED NULL,
  refunded_by INT UNSIGNED NULL,
  UNIQUE KEY uq_payment_order (order_id),
  UNIQUE KEY uq_collection_request (collection_request_key),
  UNIQUE KEY uq_refund_request (refund_request_key),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (collected_by) REFERENCES customers(id),
  FOREIGN KEY (refunded_by) REFERENCES customers(id),
  CONSTRAINT ck_payment_lifecycle CHECK (
    (method='cod' AND status IN ('pending','paid','void')) OR
    (method='card' AND status IN ('paid','refunded'))
  ),
  CONSTRAINT ck_payment_times CHECK (
    (status IN ('pending','void') AND paid_at IS NULL AND refunded_at IS NULL) OR
    (status='paid' AND paid_at IS NOT NULL AND refunded_at IS NULL) OR
    (status='refunded' AND paid_at IS NOT NULL AND refunded_at IS NOT NULL)
  )
) ENGINE=InnoDB`,
  `CREATE TABLE deliveries (
  order_id INT UNSIGNED PRIMARY KEY,
  mode ENUM('delivery','pickup') NOT NULL,
  address_id INT UNSIGNED NULL,
  store_id INT UNSIGNED NULL,
  destination_snapshot JSON NOT NULL,
  estimated_date DATE NOT NULL,
  actual_date DATE NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  CONSTRAINT ck_delivery_destination CHECK (
    (mode='delivery' AND store_id IS NULL) OR
    (mode='pickup' AND store_id IS NOT NULL)
  )
) ENGINE=InnoDB`,
  `CREATE TABLE order_status_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  actor_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_history_order (order_id, id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (actor_id) REFERENCES customers(id)
) ENGINE=InnoDB`,
  `CREATE TABLE order_item_categories (
  order_item_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (order_item_id, category_id),
  FOREIGN KEY (order_item_id) REFERENCES order_items(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB`,
  `CREATE TABLE order_cancellations (
  order_id INT UNSIGNED PRIMARY KEY,
  request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_id INT UNSIGNED NOT NULL,
  reason VARCHAR(200) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cancellation_request (request_key),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (actor_id) REFERENCES customers(id)
) ENGINE=InnoDB`,
  `CREATE TABLE order_operations (
  order_id INT UNSIGNED NOT NULL,
  kind ENUM('allocate','complete') NOT NULL,
  request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_id INT UNSIGNED NOT NULL,
  fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (order_id, kind),
  UNIQUE KEY uq_operation_request (kind, request_key),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (actor_id) REFERENCES customers(id)
) ENGINE=InnoDB`,
  `ALTER TABLE orders ADD CONSTRAINT ck_project_order_state CHECK (
  (stock_state IS NULL AND was_out_of_stock IS NULL) OR
  (stock_state IS NOT NULL AND was_out_of_stock IS NOT NULL AND
   was_out_of_stock IN (0,1) AND currency='USD' AND (
     (status='backordered' AND stock_state='none' AND was_out_of_stock=1) OR
     (status IN ('confirmed','processing','shipped','ready_for_pickup')
       AND stock_state='allocated') OR
     (status IN ('delivered','collected') AND stock_state='consumed') OR
     (status='cancelled' AND stock_state IN ('none','released'))
   ))
)`,
  `CREATE TRIGGER trg_delivery_address_insert BEFORE INSERT ON deliveries
FOR EACH ROW
BEGIN
  IF NEW.mode='pickup' AND NEW.address_id IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Pickup cannot reference a delivery address';
  END IF;
END`,
  `CREATE TRIGGER trg_delivery_address_update BEFORE UPDATE ON deliveries
FOR EACH ROW
BEGIN
  IF NEW.mode='pickup' AND NEW.address_id IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Pickup cannot reference a delivery address';
  END IF;
END`
];
