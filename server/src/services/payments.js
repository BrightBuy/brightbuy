import { ApiError } from '../errors.js';
const inconsistent = () => new ApiError(409, 'PAYMENT_STATE_CONFLICT',
  'Payment state is inconsistent with this operation.');

export function paymentDecision(input) {
  if (input.paymentMethod === 'cod') return 'not_required';
  if (input.paymentMethod === 'card' && input.simulationToken === 'demo-approved') return 'approved';
  if (input.paymentMethod === 'card' && input.simulationToken === 'demo-declined') return 'declined';
  throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid payment simulation.');
}
export async function createPayment(connection, orderId, input, total) {
  const paid = input.paymentMethod === 'card';
  if (paymentDecision(input) === 'declined') throw inconsistent();
  await connection.execute(
    `INSERT INTO payments
       (order_id,method,status,amount,currency,reference,paid_at)
     VALUES (?,?,?,?,'USD',?,IF(?=1,CURRENT_TIMESTAMP,NULL))`,
    [orderId, input.paymentMethod, paid ? 'paid' : 'pending', total,
      paid ? `sim-pay:${orderId}` : null, paid ? 1 : 0]);
}
async function lockedPayment(connection, order) {
  const [rows] = await connection.execute(
    `SELECT id,method,status,amount,currency,
       collection_request_key AS collectionKey, collected_by AS collectedBy
     FROM payments WHERE order_id=? FOR UPDATE`, [order.id]);
  const payment = rows[0];
  if (!payment || payment.amount !== order.total || payment.currency !== order.currency) {
    throw inconsistent();
  }
  return payment;
}
export async function cancelPayment(connection, order, actorId, key) {
  const payment = await lockedPayment(connection, order);
  if (payment.method === 'card' && payment.status === 'paid') {
    await connection.execute(
      `UPDATE payments SET status='refunded',refunded_at=CURRENT_TIMESTAMP,
         refund_reference=?,refund_request_key=?,refunded_by=? WHERE id=?`,
      [`sim-refund:${order.id}`, key, actorId, payment.id]);
  } else if (payment.method === 'cod' && payment.status === 'pending') {
    await connection.execute("UPDATE payments SET status='void' WHERE id=?", [payment.id]);
  } else throw inconsistent();
}
export async function collectCod(connection, order, adminId, key) {
  // M4 has already locked order, verified admin/cashReceived and operation replay.
  if (!((order.fulfillment === 'delivery' && order.status === 'shipped') ||
        (order.fulfillment === 'pickup' && order.status === 'ready_for_pickup')) ||
      order.stockState !== 'allocated' || order.currency !== 'USD') throw inconsistent();
  const payment = await lockedPayment(connection, order);
  if (payment.method !== 'cod') throw inconsistent();
  if (payment.status === 'paid' && payment.collectionKey === key &&
      payment.collectedBy === adminId) return;
  if (payment.status !== 'pending') throw inconsistent();
  await connection.execute(
    `UPDATE payments SET status='paid',paid_at=CURRENT_TIMESTAMP,
       reference=?,collection_request_key=?,collected_by=? WHERE id=?`,
    [`cod-receipt:${order.id}`, key, adminId, payment.id]);
}
