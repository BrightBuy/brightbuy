import { db } from './db.js';
import { createApp } from './app.js';
const server = createApp(db, process.env.JWT_SECRET).listen(
  Number(process.env.PORT || 3000),
  '0.0.0.0',
  () => console.log('BrightBuy API listening on port 3000'),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(async () => {
      await db.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
