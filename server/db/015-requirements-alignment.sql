ALTER TABLE customers MODIFY role ENUM('customer','admin','warehouse') NOT NULL DEFAULT 'customer';
ALTER TABLE deliveries MODIFY estimated_date DATE NULL;
INSERT INTO cities (name, is_main_city, is_active) VALUES ('San Antonio', 1, 1), ('Fort Worth', 1, 1), ('El Paso', 1, 1) ON DUPLICATE KEY UPDATE is_main_city = 1;
