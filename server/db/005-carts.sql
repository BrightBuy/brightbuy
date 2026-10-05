CREATE TABLE IF NOT EXISTS carts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,

  PRIMARY KEY (id),
  UNIQUE KEY uq_carts_customer (customer_id),

  CONSTRAINT fk_carts_customer
    FOREIGN KEY (customer_id)
    REFERENCES customers(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cart_items (
  cart_id INT UNSIGNED NOT NULL,
  variant_id INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,

  PRIMARY KEY (cart_id, variant_id),

  CONSTRAINT fk_cart_items_cart
    FOREIGN KEY (cart_id)
    REFERENCES carts(id),

  CONSTRAINT fk_cart_items_variant
    FOREIGN KEY (variant_id)
    REFERENCES variants(id),

  CONSTRAINT ck_cart_items_quantity
    CHECK (quantity BETWEEN 1 AND 99)
) ENGINE=InnoDB;