import { Router } from 'express';
import { ApiError, positiveId } from '../errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { presentOrder as presentTracking } from '../services/order-presenter.js';
import { inTransaction } from '../utils/transaction.js';

const ORDER_SELECT = `
  SELECT id, customer_id AS customerId, status, fulfillment,
         address_snapshot AS addressSnapshot, currency, total, created_at AS createdAt,
         stock_state AS stockState, was_out_of_stock AS wasOutOfStock
  FROM orders`;

function orderNotFound() {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found.');
}

export function createOrderRoutes(db, requireAuthentication) {
  const router = Router();
  async function trackingList(admin, customerId) {
    return inTransaction(db, async (connection) => {
      const [rows] = await connection.execute(
        `SELECT id FROM orders ${admin ? '' : 'WHERE customer_id = ?'} ORDER BY created_at DESC, id DESC`,
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
  router.get('/orders/:id/items/:itemId/image', requireAuthentication, async (req, res) => {
    const orderId = positiveId(req.params.id);
    const itemId = positiveId(req.params.itemId);
    const [items] = await db.execute(
      "SELECT oi.id,i.mime_type AS mimeType,i.image_data AS imageData FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN order_item_images i ON i.order_item_id=oi.id WHERE oi.id=? AND o.id=? AND (o.customer_id=? OR ?='admin')",
      [itemId, orderId, req.user.id, req.user.role]);
    if (!items.length) throw orderNotFound();
    const item = items[0];
    res.set('Cache-Control', 'no-store');
    res.json({data:item.imageData ? {src:'data:'+item.mimeType+';base64,'+item.imageData.toString('base64')} : null});
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
  router.patch(
    '/admin/orders/:id/status',
    requireAuthentication,
    requireAdmin,
    async (req, res, next) => {
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
      await inTransaction(db, async (connection) => {
        const [orders] = await connection.execute(
          `${ORDER_SELECT} WHERE id = ? FOR UPDATE`,
          [id],
        );
        const order = orders[0];
        if (!order) throw orderNotFound();

        if (order.stockState == null && order.wasOutOfStock == null) {
          throw new ApiError(409, 'LEGACY_ORDER_REQUIRES_MIGRATION', 'Legacy orders are read-only.');
        }
        // The following fulfilment router owns project status transitions.
        return order;
      });
      next();
    },
  );
  return router;
}