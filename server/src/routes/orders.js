import { Router } from 'express';
import { ApiError, positiveId } from '../errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { nextStatuses } from '@brightbuy/contracts';

const ORDER_SELECT = `
  SELECT id, customer_id AS customerId, status, fulfillment,
         address_snapshot AS addressSnapshot, currency, total, created_at AS createdAt
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
  router.get('/orders', requireAuthentication, async (req, res) => {
    const [orders] = await db.execute(`${ORDER_SELECT} WHERE customer_id = ? ORDER BY id`, [
      req.user.id,
    ]);
    res.json({ data: orders.map(presentOrder) });
  });
  router.get('/admin/orders', requireAuthentication, requireAdmin, async (req, res) => {
    const [orders] = await db.query(`${ORDER_SELECT} ORDER BY id`);
    res.json({ data: orders.map(presentOrder) });
  });
  router.get('/orders/:id', requireAuthentication, async (req, res) => {
    const id = positiveId(req.params.id);
    // Return 404 for other customers' orders instead of disclosing their existence.
    const [orders] = await db.execute(
      `${ORDER_SELECT} WHERE id = ? AND (customer_id = ? OR ? = 'admin')`,
      [id, req.user.id, req.user.role],
    );
    if (!orders[0]) throw orderNotFound();
    const [items] = await db.execute(
      `SELECT id, variant_id AS variantId, product_name AS productName,
              variant_name AS variantName, quantity, unit_price AS unitPrice
       FROM order_items WHERE order_id = ? ORDER BY id`,
      [id],
    );
    res.json({ data: { ...presentOrder(orders[0]), items } });
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
