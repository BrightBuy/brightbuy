import { hashPassword } from '../password.js';
import { reconcileLegacyCatalogue } from './reconcile.js';

// Called inside a transaction. The marker prevents repeat runs from resetting
// passwords, status changes or other records the team has already edited.
export async function seedDemoData(connection) {
  const [seeded] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ?',
    ['demo-v1'],
  );
  if (!seeded.length) {
    const [[{ count }]] = await connection.query('SELECT COUNT(*) AS count FROM customers');
    if (count)
      throw new Error(
        'Demo seed requires an empty customer table; no existing data was overwritten.',
      );
    for (const [id, name, email, role] of [
      [1, 'Nimal Perera', 'nimal@example.test', 'customer'],
      [2, 'Asha Silva', 'asha@example.test', 'customer'],
      [3, 'Demo Admin', 'admin@example.test', 'admin'],
    ]) {
      await connection.execute(
        'INSERT INTO customers (id,name,email,password_hash,role) VALUES (?,?,?,?,?)',
        [id, name, email, await hashPassword('BrightBuy123!'), role],
      );
    }
    await connection.query(`INSERT INTO addresses (id,customer_id,recipient,line1,city,postal_code,country)
    VALUES
      (1,1,'Nimal Perera','12 Sample Lane','Houston','77001','US'),
      (2,1,'Nimal Perera','8 Demo Road','Dallas','75201','US'),
      (3,2,'Asha Silva','24 Example Street','Austin','78701','US')`);
    await reconcileLegacyCatalogue(connection);
    await connection.query(`
      INSERT IGNORE INTO admin_profiles (id, staff_role)
      SELECT id, 'administrator' FROM customers WHERE role = 'admin'
    `);
    await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', ['demo-v1']);
  } else {
    // Run reconciliation even when demo-v1 is already seeded to reconcile legacy products/variants
    await reconcileLegacyCatalogue(connection);
    await connection.query(`
      INSERT IGNORE INTO admin_profiles (id, staff_role)
      SELECT id, 'administrator' FROM customers WHERE role = 'admin'
    `);
  }
}
