import { createHash } from 'node:crypto';
import { checkoutSchemaStatements } from '../src/database/checkout-definition.js';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const quote = (name) => {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('Unsafe migration identifier');
  return `\`${name}\``;
};
async function inspect(connection, sql) {
  let match;
  if ((match = /^CREATE TABLE (\w+)/.exec(sql))) {
    const name = match[1];
    const [tables] = await connection.execute(
      'SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[name]);
    if (!tables.length) return null;
    const [[definition]] = await connection.query(`SHOW CREATE TABLE ${quote(name)}`);
    return JSON.stringify(Object.values(definition)[1].replace(/ AUTO_INCREMENT=\d+/g,''));
  }
  if ((match = /^CREATE TRIGGER (\w+)/.exec(sql))) {
    const [rows] = await connection.execute(
      `SELECT EVENT_MANIPULATION,ACTION_TIMING,EVENT_OBJECT_TABLE,ACTION_STATEMENT,SQL_MODE
       FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?`,[match[1]]);
    return rows.length ? JSON.stringify(rows) : null;
  }
  if ((match = /^(?:ALTER TABLE orders (?:MODIFY|ADD) COLUMN) (\w+)/.exec(sql))) {
    const [rows] = await connection.execute(
      `SELECT COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME=?`,[match[1]]);
    return rows.length ? JSON.stringify(rows) : null;
  }
  if (sql.startsWith('ALTER TABLE order_items ADD CONSTRAINT uq_order_variant')) {
    const [rows]=await connection.query(`SELECT NON_UNIQUE,COLUMN_NAME,SEQ_IN_INDEX
      FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
      AND TABLE_NAME='order_items' AND INDEX_NAME='uq_order_variant' ORDER BY SEQ_IN_INDEX`);
    return rows.length ? JSON.stringify(rows) : null;
  }
  if (sql.startsWith('ALTER TABLE orders ADD CONSTRAINT ck_project_order_state')) {
    const [rows]=await connection.query(`SELECT cc.CHECK_CLAUSE,tc.ENFORCED
      FROM information_schema.CHECK_CONSTRAINTS cc JOIN information_schema.TABLE_CONSTRAINTS tc
      ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME
      WHERE tc.CONSTRAINT_SCHEMA=DATABASE() AND tc.TABLE_NAME='orders'
      AND tc.CONSTRAINT_NAME='ck_project_order_state'`);
    return rows.length ? JSON.stringify(rows) : null;
  }
  throw new Error('Migration statement has no inspection rule.');
}
export async function up(connection) {
  // M4's runner owns the existing brightbuy_setup lock and version marker.
  // This migration never commits, rolls back, releases or edits the old seed.
  const [duplicates]=await connection.query(`SELECT order_id,variant_id,COUNT(*) AS copies
    FROM order_items GROUP BY order_id,variant_id HAVING COUNT(*)>1 LIMIT 1`);
  if (duplicates.length) throw new Error('Duplicate order lines require historical-data review.');
  for(const table of ['customers','orders','order_items','addresses','products','variants',
    'categories','product_categories','admin_profiles','cities','stores','carts','cart_items']) {
    const [rows]=await connection.execute(`SELECT ENGINE FROM information_schema.TABLES
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,[table]);
    if(rows[0]?.ENGINE!=='InnoDB') throw new Error(`Missing InnoDB prerequisite: ${table}`);
  }
  await connection.query(`CREATE TABLE IF NOT EXISTS m3_ddl_checks (
    step_key VARCHAR(100) PRIMARY KEY,source_hash CHAR(64) NOT NULL,
    definition_hash CHAR(64) NOT NULL
  ) ENGINE=InnoDB`);
  const [ledger]=await connection.query(`SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_KEY
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='m3_ddl_checks'
    ORDER BY ORDINAL_POSITION`);
  const expected=[['step_key','varchar(100)','NO','PRI'],['source_hash','char(64)','NO',''],['definition_hash','char(64)','NO','']];
  if(JSON.stringify(ledger.map(r=>[r.COLUMN_NAME,r.COLUMN_TYPE,r.IS_NULLABLE,r.COLUMN_KEY]))!==JSON.stringify(expected)) {
    throw new Error('Unexpected migration checkpoint definition.');
  }
  for(let index=0;index<checkoutSchemaStatements.length;index++) {
    const sql=checkoutSchemaStatements[index];
    const key=`007-checkout:${index}`;
    const sourceHash=hash(sql);
    const current=await inspect(connection,sql);
    const [[record]]=await connection.execute('SELECT source_hash,definition_hash FROM m3_ddl_checks WHERE step_key=?',[key]);
    if(record) {
      if(record.source_hash!==sourceHash || current===null || hash(current)!==record.definition_hash) {
        throw new Error(`Migration definition mismatch at ${key}; review instead of overwriting.`);
      }
      continue;
    }
    // The first operation legitimately changes the existing foundation enum.
    if(index===0) {
      const [columns]=await connection.query(`SELECT COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT
        FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='status'`);
      const oldType="enum('pending','confirmed','processing','shipped','ready_for_pickup','delivered','collected','cancelled')";
      const newType=oldType.slice(0,-1)+",'backordered')";
      if(!columns[0] || ![oldType,newType].includes(columns[0].COLUMN_TYPE) ||
          columns[0].IS_NULLABLE!=='NO' || columns[0].COLUMN_DEFAULT!=='pending') {
        throw new Error('Unexpected order status definition.');
      }
      if(columns[0].COLUMN_TYPE===oldType) await connection.query(sql);
    } else {
      if(current!==null) throw new Error(`Unverified existing object at ${key}. Review its definition; do not delete business data.`);
      await connection.query(sql);
    }
    const installed=await inspect(connection,sql);
    if(installed===null) throw new Error(`Missing installed object at ${key}.`);
    await connection.execute('INSERT INTO m3_ddl_checks(step_key,source_hash,definition_hash) VALUES(?,?,?)',
      [key,sourceHash,hash(installed)]);
  }
}
