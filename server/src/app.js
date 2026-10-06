import express from 'express';
import { randomUUID } from 'node:crypto';
import { ApiError, errorHandler } from './errors.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createAuthRoutes } from './routes/auth.js';
import { createCatalogueRoutes } from './routes/catalogue.js';
import { createCatalogueAdminRoutes } from './routes/catalogue-admin.js';
import { createAccountRoutes } from './routes/account.js';
import { createOrderRoutes } from './routes/orders.js';
import { createLocationRoutes } from './routes/locations.js';
import { createInventoryRoutes } from './routes/inventory.js';
import { createReportRoutes } from './routes/reports.js';
import { createCartRoutes } from './routes/cart.js';
import { createCheckoutRoutes } from './routes/checkout.js';
import { createFulfilmentRoutes } from './routes/fulfilment.js';
import { makeCheckout } from './services/checkout.js';
import { makeCancellation } from './services/cancellation.js';
import { readCartForCheckout as readCart } from './services/cart.js';
import { getDestination, deliveryDays } from './services/locations.js';
import { applyStockChange } from './services/inventory.js';

// App creation is separate from listen(): tests can use an isolated database.
export function createApp(db, secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters.');
  }
  const app = express();
  const auth = createAuthMiddleware(db, secret);
  const checkout = makeCheckout({ readCart, getDestination, deliveryDays, applyStockChange });
  const cancelOrder = makeCancellation({
    applyStockChange: (connection, change) => applyStockChange(connection, {
      ...change,
      movementType: change.movementType === 'cancel' ? 'cancellation' : change.movementType,
    }),
  });

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.set('X-Request-Id', req.id);
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
    } catch {
      throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable.');
    }
    res.json({ data: { status: 'ok', database: 'connected' } });
  });
  app.use('/api', createAuthRoutes(db, secret, auth));
  app.use('/api', createCatalogueRoutes(db));
  app.use('/api', createCatalogueAdminRoutes(db, auth));
  app.use('/api', createAccountRoutes(db, auth));
  app.use('/api', createCartRoutes(db, auth));
  app.use('/api', createOrderRoutes(db, auth));
  app.use('/api', createFulfilmentRoutes(db, auth));
  app.use('/api', createLocationRoutes(db, auth));
  app.use('/api', createInventoryRoutes(db, auth));
  app.use('/api', createReportRoutes(db, auth));
  app.use('/api', createCheckoutRoutes(db, auth, { checkout, cancelOrder }));

  // Error middleware must be last so every route uses the same error format.
  app.use((req, res, next) => next(new ApiError(404, 'NOT_FOUND', 'Resource not found.')));
  app.use(errorHandler);
  return app;
}
