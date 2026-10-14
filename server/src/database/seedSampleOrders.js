import { completeSampleOrders } from './completeSampleOrders.js';
import { sumLines } from '../utils/money.js';
import { snapshotOrderImage } from '../services/order-images.js';

const marker = 'sample-orders-current-catalogue-v2';
// Historical demonstration records, deliberately separate from live checkout and stock.
const samples = [
  {
    id: 1,
    email: 'nimal@example.test',
    status: 'pending',
    mode: 'delivery',
    total: '92.00',
    old: [
      ['Wireless Headphones', 'Navy', 2, '25.00'],
      ['Bluetooth Speaker', 'Sage', 1, '42.00'],
    ],
    lines: [
      ['AURA-NC700-BLK', 2],
      ['BOOM-CHARGE5-BLU', 1],
    ],
  },
  {
    id: 2,
    email: 'asha@example.test',
    status: 'ready_for_pickup',
    mode: 'pickup',
    total: '68.00',
    old: [['Robot Building Kit', 'Starter set', 1, '68.00']],
    lines: [['BB-TOY-ROBOT-STD', 1]],
  },
  {
    id: 3,
    email: 'nimal@example.test',
    status: 'delivered',
    mode: 'delivery',
    total: '25.00',
    old: [['Wireless Headphones', 'White', 1, '25.00']],
    lines: [['SONIX-WH-1000-WHT', 1]],
  },
];

// Called inside the project seed transaction, after catalogue and locations exist.
// Only recognisable, untouched historical fixtures may be repaired. A marker prevents
// later builds from resetting snapshots or edits made by the administrator.
export async function seedSampleOrders(connection) {
  const [done] = await connection.execute('SELECT version FROM schema_migrations WHERE version=?', [
    marker,
  ]);
  if (done.length) {
    await completeSampleOrders(connection, samples);
    return;
  }
  const [demo] = await connection.execute('SELECT version FROM schema_migrations WHERE version=?', [
    'demo-v1',
  ]);
  if (!demo.length) return;
  for (const sample of samples) {
    const [users] = await connection.execute(
      "SELECT id,name FROM customers WHERE email=? AND role='customer'",
      [sample.email],
    );
    if (!users.length) continue;
    const user = users[0];
    const [orders] = await connection.execute(
      'SELECT id,customer_id,status,fulfillment,currency,total,stock_state,was_out_of_stock FROM orders WHERE id=? FOR UPDATE',
      [sample.id],
    );
    const order = orders[0];
    if (order) {
      const [audit] = await connection.execute(
        'SELECT order_id FROM checkout_requests WHERE order_id=?',
        [sample.id],
      );
      if (
        audit.length ||
        order.customer_id !== user.id ||
        order.status !== sample.status ||
        order.fulfillment !== sample.mode ||
        order.currency !== 'USD' ||
        order.total !== sample.total ||
        order.stock_state !== null ||
        order.was_out_of_stock !== null
      )
        continue;
      const [old] = await connection.execute(
        'SELECT product_name,variant_name,quantity,unit_price FROM order_items WHERE order_id=? ORDER BY id',
        [sample.id],
      );
      if (
        JSON.stringify(
          old.map((i) => [i.product_name, i.variant_name, i.quantity, i.unit_price]),
        ) !== JSON.stringify(sample.old)
      )
        continue;
    }
    const lines = [];
    for (const [sku, quantity] of sample.lines) {
      const [variants] = await connection.execute(
        "SELECT v.id AS variantId,v.name AS variantName,v.price AS unitPrice,p.name AS productName FROM variants v JOIN products p ON p.id=v.product_id WHERE v.sku=? AND v.is_active=1 AND p.is_active=1 AND p.is_legacy=0 AND p.currency='USD' AND v.stock>=?",
        [sku, quantity],
      );
      if (!variants.length)
        throw new Error('Sample order needs an active, stocked variant: ' + sku);
      lines.push({ ...variants[0], quantity });
    }
    const total = sumLines(lines);
    if (order) {
      await connection.execute('DELETE FROM order_items WHERE order_id=?', [sample.id]);
      await connection.execute('UPDATE orders SET total=? WHERE id=?', [total, sample.id]);
    } else {
      const [addresses] = await connection.execute(
        'SELECT recipient,line1,line2,line3,city,postal_code AS postalCode,country FROM addresses WHERE customer_id=? ORDER BY is_default DESC,id LIMIT 1',
        [user.id],
      );
      if (sample.mode === 'delivery' && !addresses.length)
        throw new Error('Sample order needs a delivery address.');
      await connection.execute(
        "INSERT INTO orders(id,customer_id,status,fulfillment,address_snapshot,currency,total) VALUES (?,?,?,?,?,'USD',?)",
        [
          sample.id,
          user.id,
          sample.status,
          sample.mode,
          sample.mode === 'delivery' ? JSON.stringify(addresses[0]) : null,
          total,
        ],
      );
    }
    for (const line of lines) {
      const [item] = await connection.execute(
        'INSERT INTO order_items(order_id,variant_id,product_name,variant_name,quantity,unit_price) VALUES (?,?,?,?,?,?)',
        [
          sample.id,
          line.variantId,
          line.productName,
          line.variantName,
          line.quantity,
          line.unitPrice,
        ],
      );
      await snapshotOrderImage(connection, item.insertId, line.variantId);
    }
  }
  // Retired fixtures are removed only if no order, cart or inventory history needs them.
  const retired = [
    'DEMO-HEADPHONES-NAVY',
    'DEMO-HEADPHONES-WHITE',
    'DEMO-SPEAKER-GREEN',
    'DEMO-SPEAKER-BLACK',
    'DEMO-ROBOT-STARTER',
  ];
  for (const sku of retired) {
    await connection.execute(
      `DELETE v FROM variants v JOIN products p ON p.id=v.product_id
      WHERE v.sku=? AND p.is_legacy=1 AND p.sku IN ('LEGACY-PRD-1','LEGACY-PRD-2','LEGACY-PRD-3')
      AND NOT EXISTS(SELECT 1 FROM order_items oi WHERE oi.variant_id=v.id)
      AND NOT EXISTS(SELECT 1 FROM cart_items ci WHERE ci.variant_id=v.id)
      AND NOT EXISTS(SELECT 1 FROM inventory_movements im WHERE im.variant_id=v.id)`,
      [sku],
    );
  }
  for (const sku of ['LEGACY-PRD-1', 'LEGACY-PRD-2', 'LEGACY-PRD-3']) {
    const [products] = await connection.execute(
      'SELECT id FROM products WHERE sku=? AND is_legacy=1 AND NOT EXISTS(SELECT 1 FROM variants WHERE product_id=products.id)',
      [sku],
    );
    for (const product of products) {
      await connection.execute('DELETE FROM product_categories WHERE product_id=?', [product.id]);
      await connection.execute('DELETE FROM products WHERE id=?', [product.id]);
    }
  }
  await connection.execute(
    "DELETE FROM categories WHERE name='Demo Electronics & Toys' AND NOT EXISTS(SELECT 1 FROM product_categories WHERE category_id=categories.id) AND NOT EXISTS(SELECT 1 FROM order_item_categories WHERE category_id=categories.id)",
  );
  await connection.execute('INSERT INTO schema_migrations(version) VALUES (?)', [marker]);
  await completeSampleOrders(connection, samples);
}
