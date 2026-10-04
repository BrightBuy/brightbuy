// Follow-up to the published location schema; existing migrations remain unchanged.
export async function apply(connection) {
  const [existing] = await connection.execute(
    `SELECT ROUTINE_NAME FROM information_schema.ROUTINES
     WHERE ROUTINE_SCHEMA = DATABASE()
       AND ROUTINE_TYPE = 'FUNCTION' AND ROUTINE_NAME = ?`,
    ['fn_delivery_days'],
  );
  if (existing.length) return;

  // The function returns a duration only. Checkout decides how to add it to a date.
  await connection.query(`
    CREATE FUNCTION fn_delivery_days(is_main_city TINYINT, was_out_of_stock TINYINT)
    RETURNS INT
    DETERMINISTIC
    NO SQL
    RETURN CASE
      WHEN is_main_city IS NULL OR was_out_of_stock IS NULL
        OR is_main_city NOT IN (0, 1) OR was_out_of_stock NOT IN (0, 1)
        THEN NULL
      ELSE (CASE WHEN is_main_city = 1 THEN 5 ELSE 7 END)
        + (CASE WHEN was_out_of_stock = 1 THEN 3 ELSE 0 END)
    END
  `);
}
