import { Router } from 'express';
import { ApiError } from '../errors.js';
import { readCart, putCartItem, removeCartItem, clearCart } from '../services/cart.js';

function requireCustomer(req, res, next) {
  if (req.user?.role !== 'customer') {
    throw new ApiError(403, 'FORBIDDEN', 'Cart operations are for customer accounts only.');
  }
  next();
}

export function createCartRoutes(db, requireAuthentication) {
  const router = Router();

  router.use('/cart', requireAuthentication, requireCustomer);

  router.get('/cart', async (req, res) => {
    const cart = await readCart(db, req.user.id);
    res.json({ data: cart });
  });

  router.put('/cart/items/:variantId', async (req, res) => {
    const { variantId } = req.params;
    const { quantity } = req.body || {};

    if (req.body === null || typeof req.body !== 'object') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
    }

    const cart = await putCartItem(db, req.user.id, variantId, quantity);
    res.json({ data: cart });
  });

  router.delete('/cart/items/:variantId', async (req, res) => {
    const { variantId } = req.params;
    const cart = await removeCartItem(db, req.user.id, variantId);
    res.json({ data: cart });
  });

  router.delete('/cart', async (req, res) => {
    const cart = await clearCart(db, req.user.id);
    res.json({ data: cart });
  });

  return router;
}
