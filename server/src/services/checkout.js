import { businessDate, addCalendarDays } from '../../../shared/time.js';
import { ApiError } from '../errors.js';
import { validateCheckout, checkoutFingerprint, MAX_VERSION } from '../utils/checkout-input.js';
import { sumLines } from '../utils/money.js';
import { inTransaction } from '../utils/transaction.js';
import { lockCheckoutLines } from './checkout-catalogue.js';
import { paymentDecision, createPayment } from './payments.js';
import { assertCart, assertDestination, assertDeliveryDays } from './checkout-dependencies.js';
import { presentOrder } from './order-presenter.js';

export function makeCheckout({ readCart, getDestination, deliveryDays, applyStockChange }) {
  return async function checkout(pool, actor, body) {
    if (actor.role !== 'customer') throw new ApiError(403, 'FORBIDDEN', 'Customer access required.');
    const input = validateCheckout(body);
    const fingerprint = checkoutFingerprint(input);
    const result = await inTransaction(pool, async (connection) => {
      const [customers] = await connection.execute(
        'SELECT id,role FROM customers WHERE id=? FOR UPDATE', [actor.id]);
      if (!customers[0]) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in again.');
      if (customers[0].role !== 'customer') throw new ApiError(403, 'FORBIDDEN', 'Customer access required.');

      // Replay MUST precede reading the cart, which a successful attempt cleared.
      const [attempts] = await connection.execute(
        `SELECT fingerprint,payment_result AS paymentResult,order_id AS orderId
         FROM checkout_requests WHERE customer_id=? AND request_key=? FOR UPDATE`,
        [actor.id, input.requestKey]);
      const previous = attempts[0];
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new ApiError(409,
          'IDEMPOTENCY_CONFLICT', 'This key belongs to different checkout input.');
        if (previous.paymentResult === 'declined') return { declined: true };
        return { status: 200, data: await presentOrder(connection, previous.orderId) };
      }

      const cart = await readCart(connection, actor.id);
      assertCart(cart);
      if (cart.version !== input.cartVersion) {
        throw new ApiError(409, 'CART_CHANGED', 'Your cart changed; reload and review it.');
      }
      if (!cart.items.length) throw new ApiError(409, 'EMPTY_CART', 'Your cart is empty.');
      const destination = await getDestination(connection, input.fulfillment,
        input.addressId ?? input.storeId, actor.id);
      assertDestination(destination, input);
      const lines = await lockCheckoutLines(connection, cart.items);
      let total;
      try { total = sumLines(lines); }
      catch (error) {
        if (!(error instanceof RangeError)) throw error;
        throw new ApiError(409, 'CART_TOTAL_EXCEEDED', 'Cart total is outside supported limits.');
      }
      const shortage = lines.some((line) => line.quantity > line.stock);
      const decision = paymentDecision(input);
      if (decision === 'declined') {
        await connection.execute(
          `INSERT INTO checkout_requests
           (customer_id,request_key,fingerprint,payment_result,order_id)
           VALUES (?,?,?,'declined',NULL)`, [actor.id, input.requestKey, fingerprint]);
        // Return a result, not an exception, so this audit row commits.
        return { declined: true };
      }
      if (cart.version >= MAX_VERSION) throw new ApiError(409,
        'CART_VERSION_EXHAUSTED', 'Cart version needs administrator review.');
      const status = shortage ? 'backordered' : 'confirmed';
      const snapshot = JSON.stringify(destination.snapshot);
      const [inserted] = await connection.execute(
        `INSERT INTO orders
         (customer_id,status,fulfillment,address_snapshot,currency,total,
          stock_state,was_out_of_stock)
         VALUES (?,?,?,?,'USD',?,?,?)`,
        [actor.id, status, input.fulfillment,
          input.fulfillment === 'delivery' ? snapshot : null,
          total, shortage ? 'none' : 'allocated', shortage ? 1 : 0]);
      const orderId = inserted.insertId;
      for (const line of lines) {
        const [item] = await connection.execute(
          `INSERT INTO order_items
           (order_id,variant_id,product_name,variant_name,quantity,unit_price)
           VALUES (?,?,?,?,?,?)`,
          [orderId, line.variantId, line.productName, line.variantName, line.quantity, line.unitPrice]);
        for (const categoryId of line.categoryIds) {
          await connection.execute(
            'INSERT INTO order_item_categories (order_item_id,category_id) VALUES (?,?)',
            [item.insertId, categoryId]);
        }
      }
      if (!shortage) {
        for (const line of lines) {
          await applyStockChange(connection, {
            variantId: line.variantId, quantityDelta: -line.quantity,
            movementType: 'sale', orderId, adminId: null,
            referenceKey: `sale:${orderId}:${line.variantId}`, reason: 'Checkout allocation',
          });
        }
      }
      const days = await deliveryDays(connection, destination.isMainCity, shortage);
      assertDeliveryDays(days, destination.isMainCity, shortage);
      const [[placed]] = await connection.execute(
        "SELECT DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS placedAt FROM orders WHERE id=?",
        [orderId]);
      const estimatedDate = addCalendarDays(businessDate(placed.placedAt), days);
      await connection.execute(
        `INSERT INTO deliveries
         (order_id,mode,address_id,store_id,destination_snapshot,estimated_date,actual_date)
         VALUES (?,?,?,?,?,?,NULL)`,
        [orderId, input.fulfillment, destination.addressId, destination.storeId, snapshot, estimatedDate]);
      await createPayment(connection, orderId, input, total);
      await connection.execute(
        `INSERT INTO order_status_history (order_id,from_status,to_status,actor_id)
         VALUES (?,NULL,?,?)`, [orderId, status, actor.id]);
      await connection.execute(
        `INSERT INTO checkout_requests
         (customer_id,request_key,fingerprint,payment_result,order_id) VALUES (?,?,?,?,?)`,
        [actor.id, input.requestKey, fingerprint, decision, orderId]);
      await connection.execute(
        `DELETE ci FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE c.customer_id=?`,
        [actor.id]);
      const [changed] = await connection.execute(
        `UPDATE carts SET version=version+1 WHERE customer_id=? AND version=?`,
        [actor.id, input.cartVersion]);
      if (changed.affectedRows !== 1) throw new ApiError(409, 'CART_CHANGED', 'Reload your cart.');
      return { status: 201, data: await presentOrder(connection, orderId) };
    });
    if (result.declined) throw new ApiError(402, 'PAYMENT_DECLINED',
      'Simulated card declined. Your cart is unchanged; no order was placed.');
    return result;
  };
}
