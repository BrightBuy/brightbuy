import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { inTransaction } from '../utils/transaction.js';
import { businessDate, businessDaySql, addCalendarDays } from '../../../shared/time.js';
export function createDashboardRoutes(db, auth) {
  const router = Router();
  router.get('/admin/dashboard', auth, requireAdmin, async (req, res) => {
    const today = businessDate();
    const data = await inTransaction(db, async connection => {
      const [[sales]] = await connection.execute(
        "SELECT COUNT(*) AS orderCount, COALESCE(SUM(o.total),0.00) AS orderedValue FROM orders o JOIN checkout_requests cr ON cr.order_id=o.id WHERE o.currency='USD' AND o.status<>'cancelled' AND o.created_at>=? AND o.created_at<?",
        [businessDaySql(today), businessDaySql(addCalendarDays(today, 1))]);
      const [lowStock] = await connection.execute(
        'SELECT v.id, v.sku, v.name, p.name AS productName, v.stock FROM variants v JOIN products p ON p.id=v.product_id WHERE v.is_active=1 AND p.is_active=1 AND v.stock<=5 ORDER BY v.stock,v.id LIMIT 20');
      const [recentOrders] = await connection.execute(
        "SELECT o.id,o.status,o.total,o.created_at AS createdAt FROM orders o JOIN checkout_requests cr ON cr.order_id=o.id WHERE o.currency='USD' ORDER BY o.created_at DESC,o.id DESC LIMIT 10");
      return { today, currency: 'USD', sales, lowStock, recentOrders };
    });
    res.json({ data });
  });
  return router;
}
