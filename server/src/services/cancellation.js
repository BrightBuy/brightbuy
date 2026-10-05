import { ApiError } from '../errors.js';
import { validateCancellation } from '../utils/checkout-input.js';
import { inTransaction } from '../utils/transaction.js';
import { cancelPayment } from './payments.js';
import { presentOrder } from './order-presenter.js';

export function makeCancellation({ applyStockChange }) {
  return async function cancelOrder(pool, actor, id, body) {
    const input = validateCancellation(body);
    if (!['customer', 'admin'].includes(actor.role)) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied.');
    }
    try {
      return await inTransaction(pool, async (connection) => {
        // Existing-order actions lock order first and never customer afterward.
        const [orders] = await connection.execute(
          `SELECT id,customer_id AS customerId,status,currency,total,
             stock_state AS stockState,was_out_of_stock AS wasOutOfStock
           FROM orders WHERE id=? FOR UPDATE`, [id]);
        const order = orders[0];
        if (!order || (actor.role !== 'admin' && order.customerId !== actor.id)) {
          throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
        }
        const [actions] = await connection.execute(
          `SELECT request_key AS requestKey,actor_id AS actorId,reason
           FROM order_cancellations WHERE order_id=?`, [id]);
        if (actions[0]) {
          const action = actions[0];
          if (action.requestKey === input.requestKey && action.actorId === actor.id &&
              action.reason === input.reason) return await presentOrder(connection, id);
          throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'A different cancellation already exists.');
        }
        // Validate the complete record before restoring stock or changing payment.
        const detail = await presentOrder(connection, id);
        if (detail.isLegacy) {
          throw new ApiError(409, 'LEGACY_ORDER_REQUIRES_MIGRATION',
            'This legacy order has no verified checkout history.');
        }
        if (order.currency !== 'USD' || !['backordered','confirmed'].includes(order.status) ||
            (order.status === 'backordered' && order.stockState !== 'none') ||
            (order.status === 'confirmed' && order.stockState !== 'allocated')) {
          throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'This order cannot be cancelled.');
        }
        if (order.stockState === 'allocated') {
          const [items] = await connection.execute(
            `SELECT variant_id AS variantId,SUM(quantity) AS quantity
             FROM order_items WHERE order_id=? GROUP BY variant_id ORDER BY variant_id`, [id]);
          if (!items.length) throw new ApiError(409, 'ORDER_DATA_INCOMPLETE', 'Order has no items.');
          for (const item of items) {
            const [variants] = await connection.execute(
              'SELECT id FROM variants WHERE id=? FOR UPDATE', [item.variantId]);
            if (!variants.length) throw new Error('Missing historical variant.');
          }
          for (const item of items) {
            const quantity = Number(item.quantity);
            if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
              throw new ApiError(409, 'ORDER_DATA_INCOMPLETE', 'Invalid order quantity.');
            }
            await applyStockChange(connection, {
              variantId: item.variantId, quantityDelta: quantity,
              movementType: 'cancel', orderId: id,
              adminId: actor.role === 'admin' ? actor.id : null,
              referenceKey: `cancel:${id}:${item.variantId}`, reason: input.reason,
            });
          }
        }
        await cancelPayment(connection, order, actor.id, input.requestKey);
        await connection.execute(
          "UPDATE orders SET status='cancelled',stock_state=? WHERE id=?",
          [order.stockState === 'allocated' ? 'released' : 'none', id]);
        await connection.execute(
          `INSERT INTO order_status_history (order_id,from_status,to_status,actor_id)
           VALUES (?,?,'cancelled',?)`, [id, order.status, actor.id]);
        await connection.execute(
          'INSERT INTO order_cancellations (order_id,request_key,actor_id,reason) VALUES (?,?,?,?)',
          [id, input.requestKey, actor.id, input.reason]);
        return await presentOrder(connection, id);
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw new ApiError(409,
        'IDEMPOTENCY_CONFLICT', 'This operation key is already in use.');
      throw error;
    }
  };
}