import { Router } from 'express';
import { ApiError, positiveId } from '../errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { nextStatuses } from '@brightbuy/contracts';
import { presentOrder as presentTracking } from '../services/order-presenter.js';
import { inTransaction } from '../utils/transaction.js';
import { makeCancellation } from '../services/cancellation.js';
import { applyStockChange } from '../services/inventory.js';

const ORDER_SELECT = `
  SELECT id, customer_id AS customerId, status, fulfillment,
         address_snapshot AS addressSnapshot, currency, total, created_at AS createdAt,
         stock_state AS stockState, was_out_of_stock AS wasOutOfStock
  FROM orders`;

function presentOrder(order) {
  return {
    ...order,
    addressSnapshot:
      typeof order.addressSnapshot === 'string'
        ? JSON.parse(order.addressSnapshot)
        : order.addressSnapshot,
    nextStatuses: nextStatuses(order.status, order.fulfillment),
  };
}
function orderNotFound() {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found.');
}

export function createOrderRoutes(db, requireAuthentication) {
  const router = Router();
  const cancelOrder = makeCancellation({
    // M3 names the action "cancel"; M4's stored movement enum is "cancellation".
    applyStockChange: (connection, change) =>
      applyStockChange(connection, {
        ...change,
        movementType: change.movementType === 'cancel' ? 'cancellation' : change.movementType,
      }),
  });
  async function trackingList(admin, customerId) {
    return inTransaction(db, async (connection) => {
      const [rows] = await connection.execute(
        `SELECT id FROM orders ${admin ? '' : 'WHERE customer_id = ?'} ORDER BY id`,
        admin ? [] : [customerId],
      );
      const results = [];
      for (const row of rows) {
        const { items, history, ...summary } = await presentTracking(connection, row.id);
        results.push(summary);
      }
      return results;
    });
  }
  router.get('/orders', requireAuthentication, async (req, res) => {
    res.json({ data: await trackingList(false, req.user.id) });
  });
  router.get('/admin/orders', requireAuthentication, requireAdmin, async (req, res) => {
    res.json({ data: await trackingList(true) });
  });
  router.get('/orders/:id', requireAuthentication, async (req, res) => {
    const id = positiveId(req.params.id);
    const data = await inTransaction(db, async (connection) => {
      // Check ownership before reading payment, delivery or history records.
      const [orders] = await connection.execute(
        "SELECT id FROM orders WHERE id = ? AND (customer_id = ? OR ? = 'admin')",
        [id, req.user.id, req.user.role],
      );
      if (!orders[0]) throw orderNotFound();
      return presentTracking(connection, id);
    });
    res.json({ data });
  });
  router.post('/orders/:id/cancel', requireAuthentication, async (req, res) => {
    if (req.user.role !== 'customer')
      throw new ApiError(403, 'FORBIDDEN', 'Customer access required.');
    res.json({ data: await cancelOrder(db, req.user, positiveId(req.params.id), req.body) });
  });
  router.post('/admin/orders/:id/cancel', requireAuthentication, requireAdmin, async (req, res) => {
    res.json({ data: await cancelOrder(db, req.user, positiveId(req.params.id), req.body) });
  });
  router.patch(
    '/admin/orders/:id/status',
    requireAuthentication,
    requireAdmin,
    async (req, res) => {
      const id = positiveId(req.params.id);
      const body = req.body;
      if (
        !body ||
        Array.isArray(body) ||
        Object.keys(body).length !== 1 ||
        typeof body.status !== 'string'
      ) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Provide only a status string.');
      }
      const [orders] = await db.execute(`${ORDER_SELECT} WHERE id = ?`, [id]);
      const order = orders[0];
      if (!order) throw orderNotFound();
      // Project transitions must also update history/payment/inventory atomically.
      // M4's fulfilment integration replaces this foundation-only status writer.
      if (order.stockState != null || order.wasOutOfStock != null) {
        throw new ApiError(
          409,
          'PROJECT_ORDER_ACTION_REQUIRED',
          'Use the project fulfilment or cancellation action.',
        );
      }
      const allowed = nextStatuses(order.status, order.fulfillment);
      if (!allowed.includes(body.status)) {
        throw new ApiError(
          409,
          'INVALID_STATUS_TRANSITION',
          'This order cannot move to that status.',
          [{ allowed }],
        );
      }
      // Compare-and-set protects the validation above from another admin's update.
      const [result] = await db.execute(
        'UPDATE orders SET status = ? WHERE id = ? AND status = ?',
        [body.status, id, order.status],
      );
      if (!result.affectedRows)
        throw new ApiError(409, 'ORDER_CHANGED', 'Order changed. Refresh and try again.');
      res.json({ data: presentOrder({ ...order, status: body.status }) });
    },
  );
  return router;
}
