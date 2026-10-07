CREATE TABLE IF NOT EXISTS variant_images (
 variant_id INT UNSIGNED PRIMARY KEY,
 mime_type VARCHAR(30) NOT NULL,
 image_data MEDIUMBLOB NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE
) ENGINE=InnoDB;
INSERT IGNORE INTO variant_images (variant_id,mime_type,image_data)
SELECT v.id,i.mime_type,i.image_data FROM product_images i
JOIN variants v ON v.id=(SELECT candidate.id FROM variants candidate WHERE candidate.product_id=i.product_id ORDER BY candidate.is_default DESC,candidate.is_active DESC,candidate.id ASC LIMIT 1);
