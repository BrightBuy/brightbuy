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
    await connection.query(`INSERT INTO products (id,name,description)
    VALUES
      (1,'Wireless Headphones','Comfortable wireless headphones for music and calls.'),
      (2,'Bluetooth Speaker','Portable Bluetooth speaker with rechargeable battery.'),
      (3,'Robot Building Kit','A hands-on robot construction toy for curious builders.')`);
    await connection.query(`INSERT INTO variants (id,product_id,sku,name,price,stock)
    VALUES
      (1,1,'DEMO-HEADPHONES-NAVY','Navy',25.00,25),
      (2,1,'DEMO-HEADPHONES-WHITE','White',25.00,18),
      (3,2,'DEMO-SPEAKER-GREEN','Sage',42.00,12),
      (4,2,'DEMO-SPEAKER-BLACK','Black',42.00,0),
      (5,3,'DEMO-ROBOT-STARTER','Starter set',68.00,8)`);
    await connection.query(`INSERT INTO addresses (id,customer_id,recipient,line1,city,postal_code,country)
    VALUES
      (1,1,'Nimal Perera','12 Sample Lane','Houston','77001','US'),
      (2,1,'Nimal Perera','8 Demo Road','Dallas','75201','US'),
      (3,2,'Asha Silva','24 Example Street','Austin','78701','US')`);
    const snapshot = JSON.stringify({
      recipient: 'Nimal Perera',
      line1: '12 Sample Lane',
      city: 'Houston',
      postalCode: '77001',
      country: 'US',
    });
    await connection.execute(
      `INSERT INTO orders (id,customer_id,status,fulfillment,address_snapshot,currency,total)
       VALUES (1,1,'pending','delivery',?,'USD',92.00),
              (2,2,'ready_for_pickup','pickup',NULL,'USD',68.00),
              (3,1,'delivered','delivery',?,'USD',25.00)`,
      [snapshot, snapshot],
    );
    await connection.query(`INSERT INTO order_items (id,order_id,variant_id,product_name,variant_name,quantity,unit_price)
    VALUES
      (1,1,1,'Wireless Headphones','Navy',2,25.00),
      (2,1,3,'Bluetooth Speaker','Sage',1,42.00),
      (3,2,5,'Robot Building Kit','Starter set',1,68.00),
      (4,3,2,'Wireless Headphones','White',1,25.00)`);
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
