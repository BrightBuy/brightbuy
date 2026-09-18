import { db } from './db.js';
import { runSetup } from './database/setup.js';

try {
  await runSetup(db, { seedDemo: process.env.SEED_DEMO === 'true' });
  console.log('BrightBuy database setup complete.');
} catch (error) {
  console.error('Database setup failed:', error.message);
  process.exitCode = 1;
}
