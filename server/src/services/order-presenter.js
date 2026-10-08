import { ApiError } from '../errors.js';
import { sumLines } from '../utils/money.js';
import { nextStatuses } from '@brightbuy/contracts';
const jsonValue = (value) => typeof value === 'string' ? JSON.parse(value) : value;
const iso = (value) => value == null ? null : new Date(value).toISOString();

// Internal service. The caller must establish ownership before calling it.
// All reads use one connection and a coherent transaction snapshot.
export async function presentOrder(connection, id) {
  const [orders] = await connection.execute(
    `SELECT id,customer_id AS customerId,status,fulfillment,
       address_snapshot AS addressSnapshot,currency,total,created_at AS createdAt,
       stock_state AS stockState,was_out_of_stock AS wasOutOfStock
     FROM orders WHERE id=?`, [id]);
  const order = orders[0];
  if (!order) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
  const [project] = await connection.execute(
    'SELECT order_id FROM checkout_requests WHERE order_id=?', [id]);
  const isLegacy = project.length === 0 && order.stockState == null &&
    order.wasOutOfStock == null;
  const incomplete = () => new ApiError(409, 'ORDER_DATA_INCOMPLETE', 'Order records need review.');
  if (!isLegacy && (!project.length || order.stockState == null || order.wasOutOfStock == null)) {
    throw incomplete();
  }
  const [items] = await connection.execute(
    `SELECT id,variant_id AS variantId,product_name AS productName,
       variant_name AS variantName,quantity,unit_price AS unitPrice
     FROM order_items WHERE order_id=? ORDER BY id`, [id]);
  let payment = null;
  let delivery = null;
  let history = [];
  if (!isLegacy) {
    const [payments] = await connection.execute(
      `SELECT id,method,status,amount,currency,reference,
         paid_at AS paidAt,refunded_at AS refundedAt FROM payments WHERE order_id=?`, [id]);
    const [deliveries] = await connection.execute(
      `SELECT mode,destination_snapshot AS destinationSnapshot,
         DATE_FORMAT(estimated_date,'%Y-%m-%d') AS estimatedDate,
         DATE_FORMAT(actual_date,'%Y-%m-%d') AS actualDate
       FROM deliveries WHERE order_id=?`, [id]);
    const [events] = await connection.execute(
      `SELECT from_status AS fromStatus,to_status AS toStatus,created_at AS createdAt
       FROM order_status_history WHERE order_id=? ORDER BY id`, [id]);
    if (!payments[0] || !deliveries[0] || !items.length ||
        order.stockState == null || order.wasOutOfStock == null || !events.length) {
      throw incomplete();
    }
    const record = payments[0];
    const destination = deliveries[0];
    let itemTotal;
    try { itemTotal = sumLines(items); } catch { throw incomplete(); }
    const states = {
      backordered: ['none'], confirmed: ['allocated'], processing: ['allocated'],
      shipped: ['allocated'], ready_for_pickup: ['allocated'],
      delivered: ['consumed'], collected: ['consumed'], cancelled: ['none', 'released'],
    };
    if (order.currency !== 'USD' || itemTotal !== order.total || record.amount !== order.total ||
        record.currency !== order.currency || destination.mode !== order.fulfillment ||
        !states[order.status]?.includes(order.stockState) ||
        ![0, 1].includes(Number(order.wasOutOfStock)) ||
        (order.status === 'backordered' && !Number(order.wasOutOfStock))) throw incomplete();
    const terminal = ['delivered', 'collected'].includes(order.status);
    const cancelled = order.status === 'cancelled';
    const validPayment = record.method === 'card'
      ? record.status === (cancelled ? 'refunded' : 'paid')
      : record.method === 'cod' && record.status === (cancelled ? 'void' : terminal ? 'paid' : 'pending');
    if (!validPayment || (terminal ? !destination.actualDate : destination.actualDate !== null) ||
        (order.fulfillment === 'delivery' && !destination.estimatedDate) || !jsonValue(destination.destinationSnapshot) ||
        events.at(-1).toStatus !== order.status) throw incomplete();
    payment = { ...payments[0], paidAt: iso(payments[0].paidAt),
      refundedAt: iso(payments[0].refundedAt) };
    delivery = { ...deliveries[0], destinationSnapshot: jsonValue(deliveries[0].destinationSnapshot) };
    history = events.map((event) => ({ ...event, createdAt: iso(event.createdAt) }));
  }
  return { ...order, createdAt: iso(order.createdAt),
    addressSnapshot: jsonValue(order.addressSnapshot), items, isLegacy,
    stockState: isLegacy ? null : order.stockState,
    wasOutOfStock: isLegacy ? null : Boolean(order.wasOutOfStock),
    nextStatuses: isLegacy ? [] : nextStatuses(order.status, order.fulfillment),
    payment, delivery, history };
}