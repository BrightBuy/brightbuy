import { demoPriceUpdates } from '../src/database/demo-price-updates.js';

// Replace only the recognisable foundation fixtures. Never relabel arbitrary
// historical amounts as USD or change user-created products/order snapshots.
export async function up(connection) {
  await connection.query("ALTER TABLE orders ALTER COLUMN currency SET DEFAULT 'USD'");
  await connection.beginTransaction();
  try {
    const samples = [
      [1, 'Everyday T-shirt', 'Wireless Headphones', 'Comfortable wireless headphones for music and calls.'],
      [2, 'Travel Bottle', 'Bluetooth Speaker', 'Portable Bluetooth speaker with rechargeable battery.'],
      [3, 'Canvas Backpack', 'Robot Building Kit', 'A hands-on robot construction toy for curious builders.'],
    ];
    const variants = [
      [1, 'TEE-NAVY-M', 'DEMO-HEADPHONES-NAVY', 'Navy', '2500.00', '25.00'],
      [2, 'TEE-WHITE-L', 'DEMO-HEADPHONES-WHITE', 'White', '2500.00', '25.00'],
      [3, 'BOTTLE-GREEN', 'DEMO-SPEAKER-GREEN', 'Sage', '4200.00', '42.00'],
      [4, 'BOTTLE-BLACK', 'DEMO-SPEAKER-BLACK', 'Black', '4200.00', '42.00'],
      [5, 'BAG-SAND', 'DEMO-ROBOT-STARTER', 'Starter set', '6800.00', '68.00'],
    ];
    for (const [id, oldName, name, description] of samples) {
      await connection.execute(
        "UPDATE products SET name=?,description=?,currency='USD',is_active=0 WHERE id=? AND name=? AND (sku IS NULL OR sku=CONCAT('LEGACY-PRD-',id))",
        [name, description, id, oldName]);
    }
    for (const [id, oldSku, sku, name, oldPrice, price] of variants) {
      await connection.execute(
        "UPDATE variants v JOIN products p ON p.id=v.product_id SET v.sku=?,v.name=?,v.price=IF(v.price=?, ?, v.price) WHERE v.id=? AND v.sku=? AND p.currency='USD' AND p.is_legacy=1",
        [sku, name, oldPrice, price, id, oldSku]);
    }
    // These exact three foundation orders have no checkout/payment records.
    for (const [id, customerId, total, newTotal, expectedItems] of [
      [1, 1, '9200.00', '92.00', [[1,'Everyday T-shirt','Navy / Medium',2,'2500.00'],[3,'Travel Bottle','Sage / 750 ml',1,'4200.00']]],
      [2, 2, '6800.00', '68.00', [[5,'Canvas Backpack','Sand / 20 L',1,'6800.00']]],
      [3, 1, '2500.00', '25.00', [[2,'Everyday T-shirt','White / Large',1,'2500.00']]],
    ]) {
      const [orders] = await connection.execute(
        "SELECT id FROM orders WHERE id=? AND customer_id=? AND currency='LKR' AND total=? AND stock_state IS NULL AND NOT EXISTS (SELECT 1 FROM checkout_requests WHERE order_id=orders.id)", [id, customerId, total]);
      if (!orders.length) continue;
      const [items] = await connection.execute('SELECT variant_id,product_name,variant_name,quantity,unit_price FROM order_items WHERE order_id=? ORDER BY variant_id', [id]);
      if (JSON.stringify(items.map(i=>[i.variant_id,i.product_name,i.variant_name,i.quantity,String(i.unit_price)])) !== JSON.stringify(expectedItems)) continue;
      for (const [variantId, oldName] of expectedItems) {
        const sample = samples.find(s=>s[1]===oldName);
        const variant = variants.find(v=>v[0]===variantId);
        await connection.execute('UPDATE order_items SET product_name=?,variant_name=?,unit_price=? WHERE order_id=? AND variant_id=?', [sample[2], variant[3], variant[5], id, variantId]);
      }
      await connection.execute("UPDATE orders SET currency='USD',total=?,address_snapshot=IF(fulfillment='delivery',JSON_SET(address_snapshot,'$.city','Houston','$.postalCode','77001','$.country','US'),address_snapshot) WHERE id=?", [newTotal,id]);
    }
    await connection.query("UPDATE categories SET name='Demo Electronics & Toys',description='Archived electronics and toys used for order-history tests' WHERE id=1 AND name='Everyday Essentials' AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM categories WHERE name='Demo Electronics & Toys') existing)");
    // Update untouched project seed prices only. Preserve admin price edits.
    for (const {sku, old, price} of demoPriceUpdates) {
      await connection.execute("UPDATE variants v JOIN products p ON p.id=v.product_id SET v.price=? WHERE v.sku=? AND v.price=? AND p.currency='USD' AND p.is_legacy=0", [price, sku, old]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
