import { Router } from 'express';
import { ApiError, positiveId } from '../errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { sendOrderInvoiceEmail } from '../services/email.js';

export function requireCustomer(req, res, next) {
  if (req.user.role !== 'customer') throw new ApiError(403, 'FORBIDDEN', 'Customer access required.');
  next();
}
export function createCheckoutRoutes(db, auth, { checkout, cancelOrder }) {
  const router = Router();
  router.post('/orders', auth, requireCustomer, async (req, res) => {
    const result = await checkout(db, req.user, req.body);

    if (result.status === 201 && result.data) {
      // Send email using the account's registered email
      await sendOrderInvoiceEmail({
        customerEmail: req.user.email,
        customerName: req.user.name,
        order: result.data,
      }).catch(console.error);
    }

    res.status(result.status).json({ data: result.data });
  });
  router.post('/orders/:id/cancel', auth, requireCustomer, async (req, res) => {
    const order = await cancelOrder(db, req.user, positiveId(req.params.id), req.body);
    res.json({ data: order });
  });
  router.post('/admin/orders/:id/cancel', auth, requireAdmin, async (req, res) => {
    const order = await cancelOrder(db, req.user, positiveId(req.params.id), req.body);
    res.json({ data: order });
  });
  return router;
}
