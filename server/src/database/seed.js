import { hashPassword } from '../password.js';

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
      (1,'Everyday T-shirt','Comfortable cotton essentials.'),
      (2,'Travel Bottle','An insulated bottle for everyday trips.'),
      (3,'Canvas Backpack','A practical bag for work and study.')`);
    await connection.query(`INSERT INTO variants (id,product_id,sku,name,price,stock)
    VALUES
      (1,1,'TEE-NAVY-M','Navy / Medium',2500,25),
      (2,1,'TEE-WHITE-L','White / Large',2500,18),
      (3,2,'BOTTLE-GREEN','Sage / 750 ml',4200,12),
      (4,2,'BOTTLE-BLACK','Black / 750 ml',4200,0),
      (5,3,'BAG-SAND','Sand / 20 L',6800,8)`);
    await connection.query(`INSERT INTO addresses (id,customer_id,recipient,line1,city,postal_code,country)
    VALUES
      (1,1,'Nimal Perera','12 Sample Lane','Colombo','00100','LK'),
      (2,1,'Nimal Perera','8 Demo Road','Kandy','20000','LK'),
      (3,2,'Asha Silva','24 Example Street','Galle','80000','LK')`);
    const snapshot = JSON.stringify({
      recipient: 'Nimal Perera',
      line1: '12 Sample Lane',
      city: 'Colombo',
      postalCode: '00100',
      country: 'LK',
    });
    await connection.execute(
      `INSERT INTO orders (id,customer_id,status,fulfillment,address_snapshot,total)
       VALUES (1,1,'pending','delivery',?,9200),
              (2,2,'ready_for_pickup','pickup',NULL,6800),
              (3,1,'delivered','delivery',?,2500)`,
      [snapshot, snapshot],
    );
    await connection.query(`INSERT INTO order_items (id,order_id,variant_id,product_name,variant_name,quantity,unit_price)
    VALUES
      (1,1,1,'Everyday T-shirt','Navy / Medium',2,2500),
      (2,1,3,'Travel Bottle','Sage / 750 ml',1,4200),
      (3,2,5,'Canvas Backpack','Sand / 20 L',1,6800),
      (4,3,2,'Everyday T-shirt','White / Large',1,2500)`);
    await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', ['demo-v1']);
  }
}
