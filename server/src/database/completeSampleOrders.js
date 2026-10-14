import { randomUUID } from 'node:crypto';
import { businessDate, addCalendarDays } from '../../../shared/time.js';
import { getDestination, deliveryDays } from '../services/locations.js';
import { applyStockChange } from '../services/inventory.js';
import { createPayment, paymentDecision } from '../services/payments.js';
import { presentOrder } from '../services/order-presenter.js';
import { checkoutFingerprint } from '../utils/checkout-input.js';
import { sumLines } from '../utils/money.js';

// Upgrade only the three recognised demo fixtures, inside setup's transaction.
// This is seeded demonstration history, never a migration of real customer orders.
export async function completeSampleOrders(connection, samples) {
  const marker = 'sample-orders-complete-v3';
  const [done] = await connection.execute('SELECT version FROM schema_migrations WHERE version=?', [
    marker,
  ]);
  if (done.length) return;
  const [[admin]] = await connection.execute(
    "SELECT id FROM customers WHERE email='admin@example.test' AND role='admin'",
  );
  if (!admin) throw new Error('Sample fulfilment needs the demo administrator.');
  for (const sample of samples) {
    const [[order]] = await connection.execute(
      `SELECT o.*,DATE_FORMAT(o.created_at,'%Y-%m-%dT%H:%i:%sZ') AS placedAt
      FROM orders o JOIN customers c ON c.id=o.customer_id
      WHERE o.id=? AND c.email=? AND c.role='customer' FOR UPDATE`,
      [sample.id, sample.email],
    );
    if (
      !order ||
      order.status !== sample.status ||
      order.fulfillment !== sample.mode ||
      order.currency !== 'USD' ||
      order.stock_state !== null ||
      order.was_out_of_stock !== null
    )
      continue;
    const [[related]] = await connection.execute(
      `SELECT
      (SELECT COUNT(*) FROM checkout_requests WHERE order_id=?) +
      (SELECT COUNT(*) FROM payments WHERE order_id=?) +
      (SELECT COUNT(*) FROM deliveries WHERE order_id=?) +
      (SELECT COUNT(*) FROM order_status_history WHERE order_id=?) +
      (SELECT COUNT(*) FROM inventory_movements WHERE order_id=?) AS count`,
      Array(5).fill(order.id),
    );
    if (related.count) continue;
    const [items] = await connection.execute(
      `SELECT oi.*,v.sku,v.stock,v.product_id
      FROM order_items oi JOIN variants v ON v.id=oi.variant_id WHERE order_id=? ORDER BY oi.id FOR UPDATE`,
      [order.id],
    );
    if (JSON.stringify(items.map((i) => [i.sku, i.quantity])) !== JSON.stringify(sample.lines))
      continue;
    if (
      sumLines(items.map((i) => ({ quantity: i.quantity, unitPrice: i.unit_price }))) !==
      order.total
    )
      continue;
    if (items.some((i) => i.stock < i.quantity))
      throw new Error('Not enough stock to complete sample order ' + order.id);
    let destinationId;
    if (sample.mode === 'delivery') {
      const [[address]] = await connection.execute(
        `SELECT a.id FROM addresses a JOIN cities c ON c.id=a.city_id
        WHERE a.customer_id=? AND c.is_active=1 AND a.country='US' ORDER BY a.is_default DESC,a.id LIMIT 1`,
        [order.customer_id],
      );
      destinationId = address?.id;
    } else {
      const [[store]] =
        await connection.execute(`SELECT s.id FROM stores s JOIN cities c ON c.id=s.city_id
        WHERE s.is_active=1 AND c.is_active=1 ORDER BY s.id LIMIT 1`);
      destinationId = store?.id;
    }
    if (!destinationId) throw new Error('Sample order needs an active destination: ' + order.id);
    const destination = await getDestination(
      connection,
      sample.mode,
      destinationId,
      order.customer_id,
    );
    const input = {
      fulfillment: sample.mode,
      addressId: destination.addressId,
      storeId: destination.storeId,
      paymentMethod: sample.id === 1 ? 'cod' : 'card',
      simulationToken: sample.id === 1 ? null : 'demo-approved',
      cartVersion: 0,
    };
    const statuses =
      sample.id === 1
        ? ['confirmed']
        : sample.id === 2
          ? ['confirmed', 'processing', 'ready_for_pickup']
          : ['confirmed', 'processing', 'shipped', 'delivered'];
    const status = statuses.at(-1);
    const placedDate = businessDate(order.placedAt);
    const estimate =
      sample.mode === 'delivery'
        ? addCalendarDays(placedDate, await deliveryDays(connection, destination.isMainCity, false))
        : null;
    await connection.execute(
      `UPDATE orders SET status=?,stock_state=?,was_out_of_stock=0,address_snapshot=? WHERE id=?`,
      [
        status,
        status === 'delivered' ? 'consumed' : 'allocated',
        sample.mode === 'delivery' ? JSON.stringify(destination.snapshot) : null,
        order.id,
      ],
    );
    for (const item of items) {
      await connection.execute(
        `INSERT IGNORE INTO order_item_categories(order_item_id,category_id)
        SELECT ?,category_id FROM product_categories WHERE product_id=?`,
        [item.id, item.product_id],
      );
      await applyStockChange(connection, {
        variantId: item.variant_id,
        quantityDelta: -item.quantity,
        movementType: 'sale',
        orderId: order.id,
        adminId: null,
        referenceKey: `sale:${order.id}:${item.variant_id}`,
        reason: 'Sample order allocation',
      });
    }
    await createPayment(connection, order.id, input, order.total);
    await connection.execute("UPDATE payments SET paid_at=? WHERE order_id=? AND method='card'", [
      order.created_at,
      order.id,
    ]);
    await connection.execute(
      `INSERT INTO deliveries(order_id,mode,address_id,store_id,destination_snapshot,estimated_date,actual_date)
      VALUES (?,?,?,?,?,?,?)`,
      [
        order.id,
        sample.mode,
        destination.addressId,
        destination.storeId,
        JSON.stringify(destination.snapshot),
        estimate,
        status === 'delivered' ? placedDate : null,
      ],
    );
    for (let index = 0; index < statuses.length; index++) {
      await connection.execute(
        `INSERT INTO order_status_history(order_id,from_status,to_status,actor_id,created_at) VALUES(?,?,?,?,?)`,
        [
          order.id,
          index ? statuses[index - 1] : null,
          statuses[index],
          index ? admin.id : order.customer_id,
          order.created_at,
        ],
      );
    }
    await connection.execute(
      `INSERT INTO checkout_requests(customer_id,request_key,fingerprint,payment_result,order_id) VALUES(?,?,?,?,?)`,
      [
        order.customer_id,
        randomUUID(),
        checkoutFingerprint(input),
        paymentDecision(input),
        order.id,
      ],
    );
    if (status === 'delivered')
      await connection.execute(
        `INSERT INTO order_operations(order_id,kind,request_key,actor_id,fingerprint) VALUES(?,'complete',?,?,?)`,
        [order.id, randomUUID(), admin.id, 'delivered:card'],
      );
    await presentOrder(connection, order.id);
  }
  await connection.execute('INSERT INTO schema_migrations(version) VALUES (?)', [marker]);
}
