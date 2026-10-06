// Explicit opt-in: this creates dedicated demo accounts and changes demo stock.
if (process.env.SEED_CHECKOUT !== 'true') {
  throw new Error('Set SEED_CHECKOUT=true to create the checkout demos on a demo database.');
}
const { db } = await import('../server/src/db.js');
try {
  const { seedCheckoutScenarios } = await import('../server/src/database/seedCheckout.js');
  console.table(await seedCheckoutScenarios(db));
} finally {
  await db.end();
}
