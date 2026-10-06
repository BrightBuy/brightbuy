import { createHash } from 'node:crypto';
import { hashPassword } from '../password.js';
import { inTransaction } from '../utils/transaction.js';
import { putCartItem, readCartForCheckout } from '../services/cart.js';
import { createAddress } from '../services/addresses.js';
import { getDestination, deliveryDays } from '../services/locations.js';
import { applyStockChange } from '../services/inventory.js';
import { makeCheckout } from '../services/checkout.js';
import { makeCancellation } from '../services/cancellation.js';

// Version names are durable identities. Never edit a saved payload to reset a demo.
export const CHECKOUT_SCENARIOS = Object.freeze([
  { name: 'cod', payment: 'cod', mode: 'delivery', main: 1 },
  { name: 'card', payment: 'card', mode: 'pickup', main: 0 },
  { name: 'backorder', payment: 'card', mode: 'pickup', main: 1, shortage: true },
  { name: 'decline', payment: 'card', mode: 'delivery', main: 0, decline: true },
  { name: 'cancel-card', payment: 'card', mode: 'delivery', main: 1, cancel: true },
  { name: 'cancel-cod', payment: 'cod', mode: 'pickup', main: 0, cancel: true },
  { name: 'cancel-backorder-card', payment: 'card', mode: 'delivery', main: 0, shortage: true, cancel: true },
  { name: 'cancel-backorder-cod', payment: 'cod', mode: 'pickup', main: 1, shortage: true, cancel: true },
].map((scenario) => Object.freeze({ ...scenario, key: `m3-v1-${scenario.name}` })));

export function demoRequestKey(label) {
  const hex = createHash('sha256').update(`brightbuy-demo:${label}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const json = (value) => typeof value === 'string' ? JSON.parse(value) : value;
const checkout = makeCheckout({ readCart: readCartForCheckout, getDestination, deliveryDays, applyStockChange });
const cancel = makeCancellation({
  applyStockChange: (connection, change) => applyStockChange(connection, {
    ...change, movementType: change.movementType === 'cancel' ? 'cancellation' : change.movementType,
  }),
});

async function initialize(pool, scenario, adminId, categoryId) {
  return inTransaction(pool, async (connection) => {
    const [[existing]] = await connection.execute(
      'SELECT * FROM checkout_demo_scenarios WHERE scenario_key=? FOR UPDATE', [scenario.key]);
    if (existing) return existing;
    // Dedicated identities: duplicate email/SKU means a conflict, not permission to overwrite.
    const [customer] = await connection.execute(
      'INSERT INTO customers(name,email,password_hash,role) VALUES (?,?,?,\'customer\')',
      [`Checkout demo ${scenario.name}`, `${scenario.key}@example.test`, await hashPassword('BrightBuy123!')]);
    const variants = [];
    for (let index = 0; index < (scenario.shortage ? 2 : 1); index++) {
      const sku = `${scenario.key}-${index}`;
      const [product] = await connection.execute(
        `INSERT INTO products(sku,name,description,brand,currency,is_active,is_legacy)
         VALUES (?,?,?,'BrightBuy demo','USD',1,0)`,
        [sku, `Checkout demo ${scenario.name} ${index + 1}`, 'Dedicated opt-in checkout scenario']);
      await connection.execute('INSERT INTO product_categories(product_id,category_id) VALUES (?,?)',
        [product.insertId, categoryId]);
      const [variant] = await connection.execute(
        `INSERT INTO variants(product_id,sku,name,price,stock,is_active,is_default)
         VALUES (?,?,'Demo variant','10.00',0,1,1)`, [product.insertId, sku]);
      variants.push(variant.insertId);
      // A shortage cart also contains a stocked line, proving whole-order backordering.
      if (index === 0) await applyStockChange(connection, {
        variantId: variant.insertId, quantityDelta: 5, movementType: 'adjustment',
        adminId, referenceKey: `demo:${sku}`, reason: 'Initial checkout demo stock',
      });
    }
    await connection.execute(
      'INSERT INTO checkout_demo_scenarios(scenario_key,customer_id,variant_ids) VALUES (?,?,?)',
      [scenario.key, customer.insertId, JSON.stringify(variants)]);
    return { scenario_key: scenario.key, customer_id: customer.insertId, variant_ids: variants, checkout_payload: null };
  });
}

async function prepare(pool, row, scenario) {
  if (row.checkout_payload) return json(row.checkout_payload);
  const [[city]] = await pool.execute(
    'SELECT id FROM cities WHERE is_active=1 AND is_main_city=? ORDER BY id LIMIT 1', [scenario.main]);
  if (!city) throw new Error(`Missing active city for ${scenario.key}; run project setup.`);
  let destination;
  if (scenario.mode === 'delivery') {
    const [[existing]] = await pool.execute('SELECT id FROM addresses WHERE customer_id=? ORDER BY id LIMIT 1', [row.customer_id]);
    const address = existing || await createAddress(pool, row.customer_id, {
      recipient: `Checkout demo ${scenario.name}`, line1: '1 Demo Street',
      cityId: city.id, postalCode: '75001', isDefault: true,
    });
    destination = { addressId: address.id };
  } else {
    const [[store]] = await pool.execute(
      'SELECT id FROM stores WHERE city_id=? AND is_active=1 ORDER BY id LIMIT 1', [city.id]);
    if (!store) throw new Error(`Missing active pickup store for ${scenario.key}.`);
    destination = { storeId: store.id };
  }
  for (const variantId of json(row.variant_ids)) await putCartItem(pool, row.customer_id, variantId, 1);
  // Save the exact cart version and payload before making a request. Checkout owns its transaction.
  return inTransaction(pool, async (connection) => {
    await connection.execute('SELECT id FROM customers WHERE id=? FOR UPDATE', [row.customer_id]);
    const cart = await readCartForCheckout(connection, row.customer_id);
    const expected = json(row.variant_ids);
    if (cart.items.length !== expected.length || cart.items.some((item) =>
      !expected.includes(item.variantId) || item.quantity !== 1)) throw new Error('Demo cart was modified before preparation finished.');
    const payload = {
      fulfillment: scenario.mode, ...destination, paymentMethod: scenario.payment,
      cartVersion: cart.version, requestKey: demoRequestKey(scenario.key),
      ...(scenario.payment === 'card' ? { simulationToken: scenario.decline ? 'demo-declined' : 'demo-approved' } : {}),
    };
    await connection.execute('UPDATE checkout_demo_scenarios SET checkout_payload=? WHERE scenario_key=?',
      [JSON.stringify(payload), scenario.key]);
    return payload;
  });
}

export async function seedCheckoutScenarios(pool) {
  const lock = await pool.getConnection();
  let acquired = false;
  try {
    const [[result]] = await lock.query("SELECT GET_LOCK('brightbuy_checkout_demo',30) AS acquired");
    if (result.acquired !== 1) throw new Error('Could not acquire checkout demo lock.');
    acquired = true;
    const [[admin]] = await pool.query("SELECT id FROM customers WHERE role='admin' ORDER BY id LIMIT 1");
    const [[category]] = await pool.query('SELECT id FROM categories ORDER BY id LIMIT 1');
    if (!admin || !category) throw new Error('Run setup with SEED_DEMO=true and SEED_PROJECT=true first.');
    const outcomes = [];
    for (const scenario of CHECKOUT_SCENARIOS) {
      const row = await initialize(pool, scenario, admin.id, category.id);
      const payload = await prepare(pool, row, scenario);
      const actor = { id: row.customer_id, role: 'customer' };
      let response;
      try { response = await checkout(pool, actor, payload); }
      catch (error) {
        if (!scenario.decline || error.code !== 'PAYMENT_DECLINED') throw error;
        const [[audit]] = await pool.execute(
          'SELECT payment_result,order_id FROM checkout_requests WHERE customer_id=? AND request_key=?',
          [actor.id, payload.requestKey]);
        if (audit?.payment_result !== 'declined' || audit.order_id !== null) throw new Error('Missing declined checkout audit.');
        outcomes.push({ scenario: scenario.key, customerId: actor.id, requestKey: payload.requestKey, outcome: 'declined', orderId: null });
        continue;
      }
      if (scenario.decline) throw new Error('Declined demo unexpectedly created an order.');
      let order = response.data;
      if (scenario.cancel) order = await cancel(pool, actor, order.id, {
        requestKey: demoRequestKey(`${scenario.key}:cancel`), reason: 'Checkout demo cancellation',
      });
      outcomes.push({ scenario: scenario.key, customerId: actor.id, requestKey: payload.requestKey,
        orderId: order.id, outcome: order.status, payment: order.payment.status });
    }
    return outcomes;
  } finally {
    try { if (acquired) await lock.query("SELECT RELEASE_LOCK('brightbuy_checkout_demo')"); }
    finally { lock.release(); }
  }
}
