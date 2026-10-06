// EXPLAIN evidence is recorded in docs/report-index-evidence.json.
export async function apply(connection) {
  for (const [table, name, columns] of [
    ['orders', 'idx_report_orders_currency_created', ['currency', 'created_at']],
    ['deliveries', 'idx_report_delivery_estimated', ['estimated_date']],
  ]) {
    const [indexes] = await connection.execute(
      `SELECT INDEX_NAME AS name,
      GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnsList,
      SUM(SUB_PART IS NOT NULL) AS prefixCount
      FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? GROUP BY INDEX_NAME`,
      [table],
    );
    const named = indexes.find((index) => index.name === name);
    if (named && (named.columnsList !== columns.join(',') || Number(named.prefixCount) !== 0))
      throw new Error(`Index ${name} has an incompatible definition.`);
    if (
      indexes.some(
        (index) =>
          Number(index.prefixCount) === 0 &&
          (index.columnsList === columns.join(',') ||
            index.columnsList.startsWith(columns.join(',') + ',')),
      )
    )
      continue;
    await connection.query(`CREATE INDEX ${name} ON ${table} (${columns.join(',')})`);
  }
}
