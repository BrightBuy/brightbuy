export async function up(connection) {
  await connection.query('DROP PROCEDURE IF EXISTS sp_apply_stock_change');
  await connection.query(`CREATE PROCEDURE sp_apply_stock_change(
    IN p_variant INT UNSIGNED, IN p_delta INT, IN p_kind VARCHAR(30),
    IN p_order INT UNSIGNED, IN p_actor INT UNSIGNED, IN p_key VARCHAR(100), IN p_reason VARCHAR(200))
  operation: BEGIN
    DECLARE balance BIGINT DEFAULT NULL;
    DECLARE prior_id INT UNSIGNED DEFAULT NULL;
    SELECT stock INTO balance FROM variants WHERE id=p_variant FOR UPDATE;
    IF balance IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VARIANT_NOT_FOUND'; END IF;
    SELECT id INTO prior_id FROM inventory_movements WHERE reference_key=p_key LIMIT 1;
    IF prior_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM inventory_movements WHERE id=prior_id AND variant_id=p_variant
        AND change_qty=p_delta AND movement_type=p_kind AND (order_id <=> p_order)
        AND (admin_id <=> p_actor) AND BINARY reason=BINARY p_reason) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IDEMPOTENCY_CONFLICT';
      END IF;
      SELECT * FROM inventory_movements WHERE id=prior_id;
      LEAVE operation;
    END IF;
    IF p_delta=0 OR p_delta IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INVALID_DELTA'; END IF;
    IF balance+p_delta<0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INSUFFICIENT_STOCK'; END IF;
    IF balance+p_delta>2147483647 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOCK_OVERFLOW'; END IF;
    INSERT INTO inventory_movements (variant_id,order_id,admin_id,change_qty,stock_after,movement_type,reason,reference_key)
      VALUES(p_variant,p_order,p_actor,p_delta,balance+p_delta,p_kind,p_reason,p_key);
    SELECT * FROM inventory_movements WHERE id=LAST_INSERT_ID();
  END`);
}
