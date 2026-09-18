import { Router } from 'express';
import { requireAdmin, USER_FIELDS } from '../middleware/auth.js';

export function createAccountRoutes(db, requireAuthentication) {
  const router = Router();
  router.get('/addresses', requireAuthentication, async (req, res) => {
    // Ownership comes from the verified account, never a query parameter.
    const [addresses] = await db.execute(
      `SELECT id, customer_id AS customerId, recipient, line1, city,
              postal_code AS postalCode, country
       FROM addresses WHERE customer_id = ? ORDER BY id`,
      [req.user.id],
    );
    res.json({ data: addresses });
  });
  router.get('/admin/customers', requireAuthentication, requireAdmin, async (req, res) => {
    const [customers] = await db.query(
      `SELECT ${USER_FIELDS} FROM customers WHERE role = 'customer' ORDER BY id`,
    );
    res.json({ data: customers });
  });
  return router;
}
