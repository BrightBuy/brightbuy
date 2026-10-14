export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS order_item_images (
    order_item_id INT UNSIGNED PRIMARY KEY,
    mime_type VARCHAR(30) NOT NULL,
    image_data MEDIUMBLOB NOT NULL,
    FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}
