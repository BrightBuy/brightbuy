CREATE TABLE IF NOT EXISTS checkout_demo_scenarios (
 scenario_key VARCHAR(80) PRIMARY KEY,
 customer_id INT UNSIGNED NOT NULL UNIQUE,
 variant_ids JSON NOT NULL,
 checkout_payload JSON NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB;
