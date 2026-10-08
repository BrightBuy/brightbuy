import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readCart,
  putCartItem,
  removeCartItem,
  clearCart,
} from '../src/services/cart.js';
import {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from '../src/services/addresses.js';

// Double / Mock database implementation for unit/integration testing services
function createTestDb() {
  const customers = [
    {
      id: 1,
      name: 'Nimal Perera',
      first_name: null,
      last_name: null,
      email: 'nimal@example.test',
      password_hash: '$2b$10$abcdef...',
      role: 'customer',
      phone_number: null,
      registered_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 2,
      name: 'Asha Silva',
      first_name: null,
      last_name: null,
      email: 'asha@example.test',
      password_hash: '$2b$10$abcdef...',
      role: 'customer',
      phone_number: null,
      registered_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 3,
      name: 'Demo Admin',
      first_name: null,
      last_name: null,
      email: 'admin@example.test',
      password_hash: '$2b$10$abcdef...',
      role: 'admin',
      phone_number: null,
      registered_at: '2026-01-01T00:00:00.000Z',
    },
  ];

  const cities = [
    { id: 1, name: 'Austin', is_active: 1 },
    { id: 2, name: 'Dallas', is_active: 1 },
    { id: 3, name: 'Houston', is_active: 0 }, // Inactive city
  ];

  const addresses = [
    {
      id: 1,
      customer_id: 1,
      recipient: 'Nimal Perera',
      line1: '12 Sample Lane',
      line2: '',
      line3: '',
      city: 'Austin',
      city_id: 1,
      postal_code: '78701',
      country: 'US',
      is_default: 1,
    },
  ];

  const products = [
    { id: 10, name: 'Texas Robot Toy', is_active: 1, currency: 'USD' },
    { id: 11, name: 'Legacy LKR Item', is_active: 0, currency: 'LKR' },
  ];

  const variants = [
    { id: 101, product_id: 10, sku: 'TX-TEE-M', name: 'Medium', price: '25.00', stock: 10, is_active: 1 },
    { id: 102, product_id: 10, sku: 'TX-TEE-L', name: 'Large', price: '25.00', stock: 2, is_active: 1 },
    { id: 103, product_id: 11, sku: 'LEGACY-VAR', name: 'Legacy', price: '1000.00', stock: 50, is_active: 0 },
  ];

  const carts = [];
  const cartItems = [];

  let nextAddressId = 10;
  let nextCartId = 1;

  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},

    async execute(sql, params = []) {
      const cleanSql = sql.trim().replace(/\s+/g, ' ');

      // Customer lookup / lock
      if (cleanSql.startsWith('SELECT id FROM customers WHERE id = ?')) {
        const found = customers.filter((c) => c.id === Number(params[0]));
        return [found];
      }

      // Customer full query
      if (cleanSql.includes('FROM customers WHERE id = ?')) {
        const found = customers.filter((c) => c.id === Number(params[0]));
        return [found];
      }

      // Cities lookup
      if (cleanSql.includes('FROM cities WHERE id = ?')) {
        const found = cities.filter((c) => c.id === Number(params[0]));
        return [found];
      }

      // Remaining usable address for auto-default re-assignment
      if (cleanSql.includes('ORDER BY a.id ASC LIMIT 1')) {
        const custId = Number(params[0]);
        const usable = addresses.find((a) => {
          if (a.customer_id !== custId) return false;
          const c = cities.find((ct) => ct.id === a.city_id);
          return c && c.is_active === 1;
        });
        return [usable ? [{ id: usable.id }] : []];
      }

      // Addresses list
      if (cleanSql.includes('FROM addresses a') && cleanSql.includes('WHERE a.customer_id = ?')) {
        const custId = Number(params[0]);
        const rows = addresses
          .filter((a) => a.customer_id === custId)
          .map((a) => {
            const cityObj = cities.find((c) => c.id === a.city_id);
            return {
              ...a,
              customerId: a.customer_id,
              cityName: cityObj ? cityObj.name : a.city,
              legacyCity: a.city,
              postalCode: a.postal_code,
              isDefault: a.is_default,
              isCityActive: cityObj ? cityObj.is_active : 0,
            };
          });
        return [rows];
      }

      // Address single lookup
      if (cleanSql.includes('FROM addresses') && cleanSql.includes('WHERE a.id = ?')) {
        const addrId = Number(params[0]);
        const custId = params[1] ? Number(params[1]) : null;
        const rows = addresses
          .filter((a) => a.id === addrId && (custId === null || a.customer_id === custId))
          .map((a) => {
            const cityObj = cities.find((c) => c.id === a.city_id);
            return {
              ...a,
              customerId: a.customer_id,
              cityName: cityObj ? cityObj.name : a.city,
              legacyCity: a.city,
              postalCode: a.postal_code,
              isDefault: a.is_default,
              isCityActive: cityObj ? cityObj.is_active : 0,
            };
          });
        return [rows];
      }

      // Simple address lookup by ID and customer_id
      if (cleanSql.startsWith('SELECT id, is_default FROM addresses WHERE id = ? AND customer_id = ?')) {
        const [addrId, custId] = params.map(Number);
        const found = addresses.filter((a) => a.id === addrId && a.customer_id === custId);
        return [found];
      }

      if (cleanSql.startsWith('SELECT id, is_default FROM addresses WHERE customer_id = ?')) {
        const custId = Number(params[0]);
        const found = addresses.filter((a) => a.customer_id === custId);
        return [found];
      }

      // Address default update
      if (cleanSql.startsWith('UPDATE addresses SET is_default = 0 WHERE customer_id = ?')) {
        const custId = Number(params[0]);
        addresses.forEach((a) => {
          if (a.customer_id === custId) a.is_default = 0;
        });
        return [{ affectedRows: 1 }];
      }

      if (cleanSql.startsWith('UPDATE addresses SET is_default = 1 WHERE id = ?')) {
        const id = Number(params[0]);
        addresses.forEach((a) => {
          if (a.id === id) a.is_default = 1;
        });
        return [{ affectedRows: 1 }];
      }

      // Insert address
      if (cleanSql.startsWith('INSERT INTO addresses')) {
        const newId = ++nextAddressId;
        const [customer_id, recipient, line1, line2, line3, city, city_id, postal_code, country, is_default] = params;
        addresses.push({
          id: newId,
          customer_id,
          recipient,
          line1,
          line2,
          line3,
          city,
          city_id,
          postal_code,
          country,
          is_default,
        });
        return [{ insertId: newId }];
      }

      // Delete address
      if (cleanSql.startsWith('DELETE FROM addresses')) {
        const id = Number(params[0]);
        const index = addresses.findIndex((a) => a.id === id);
        if (index !== -1) addresses.splice(index, 1);
        return [{ affectedRows: 1 }];
      }

      // Cart header read
      if (cleanSql.includes('FROM carts WHERE customer_id = ?')) {
        const custId = Number(params[0]);
        const found = carts.filter((c) => c.customer_id === custId);
        return [found];
      }

      // Cart header insert
      if (cleanSql.startsWith('INSERT INTO carts')) {
        const newId = nextCartId++;
        const custId = Number(params[0]);
        const newCart = { id: newId, customer_id: custId, version: 0 };
        carts.push(newCart);
        return [{ insertId: newId }];
      }

      // Cart header version update
      if (cleanSql.startsWith('UPDATE carts SET version = ? WHERE id = ?')) {
        const [version, id] = params;
        const c = carts.find((x) => x.id === Number(id));
        if (c) c.version = Number(version);
        return [{ affectedRows: 1 }];
      }

      // Cart items read
      if (cleanSql.includes('FROM cart_items ci')) {
        const cartId = Number(params[0]);
        const items = cartItems
          .filter((ci) => ci.cart_id === cartId)
          .map((ci) => {
            const v = variants.find((x) => x.id === ci.variant_id);
            const p = products.find((x) => x.id === v.product_id);
            return {
              variantId: v.id,
              quantity: ci.quantity,
              variantName: v.name,
              sku: v.sku,
              price: v.price,
              stock: v.stock,
              isVariantActive: v.is_active,
              productId: p.id,
              productName: p.name,
              isProductActive: p.is_active,
              productCurrency: p.currency,
            };
          });
        return [items];
      }

      // Cart items simple read
      if (cleanSql.startsWith('SELECT variant_id, quantity FROM cart_items WHERE cart_id = ?')) {
        const cartId = Number(params[0]);
        const items = cartItems.filter((ci) => ci.cart_id === cartId);
        return [items];
      }

      // Variant lookup
      if (cleanSql.includes('FROM variants v')) {
        const vId = Number(params[0]);
        const v = variants.find((x) => x.id === vId);
        if (!v) return [[]];
        const p = products.find((x) => x.id === v.product_id);
        return [
          [
            {
              id: v.id,
              price: v.price,
              stock: v.stock,
              isVariantActive: v.is_active,
              productId: p.id,
              isProductActive: p.is_active,
              productCurrency: p.currency,
            },
          ],
        ];
      }

      // Cart item insert / update
      if (cleanSql.startsWith('INSERT INTO cart_items')) {
        const [cart_id, variant_id, quantity] = params;
        const existing = cartItems.find((ci) => ci.cart_id === cart_id && ci.variant_id === variant_id);
        if (existing) {
          existing.quantity = quantity;
        } else {
          cartItems.push({ cart_id, variant_id, quantity });
        }
        return [{ affectedRows: 1 }];
      }

      // Cart item delete
      if (cleanSql.startsWith('DELETE FROM cart_items WHERE cart_id = ? AND variant_id = ?')) {
        const [cart_id, variant_id] = params;
        const idx = cartItems.findIndex((ci) => ci.cart_id === cart_id && ci.variant_id === variant_id);
        if (idx !== -1) cartItems.splice(idx, 1);
        return [{ affectedRows: 1 }];
      }

      // Delete all cart items
      if (cleanSql.startsWith('DELETE FROM cart_items WHERE cart_id = ?')) {
        const cartId = Number(params[0]);
        for (let i = cartItems.length - 1; i >= 0; i--) {
          if (cartItems[i].cart_id === cartId) cartItems.splice(i, 1);
        }
        return [{ affectedRows: 1 }];
      }

      return [[]];
    },
  };

  const db = {
    async getConnection() {
      return connection;
    },
    async execute(sql, params) {
      return connection.execute(sql, params);
    },
  };

  return db;
}

test('GET cart without existing cart returns version 0 and empty items without inserting', async () => {
  const db = createTestDb();
  const cart = await readCart(db, 1);
  assert.equal(cart.version, 0);
  assert.equal(cart.items.length, 0);
  assert.equal(cart.id, null);
  assert.equal(cart.total, '0.00');
});

test('PUT cart item lazily creates cart, sets version 1, and handles shortage correctly', async () => {
  const db = createTestDb();
  // Variant 102 has stock = 2. Putting quantity = 5 tests shortage permission
  const cart = await putCartItem(db, 1, 102, 5);
  assert.equal(cart.version, 1);
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].variantId, 102);
  assert.equal(cart.items[0].quantity, 5);
  assert.equal(cart.items[0].shortage, true);
  assert.equal(cart.hasShortage, true);
  assert.equal(cart.total, '125.00');
});

test('Same PUT twice does not increment cart content version', async () => {
  const db = createTestDb();
  const cart1 = await putCartItem(db, 1, 101, 2);
  assert.equal(cart1.version, 1);

  const cart2 = await putCartItem(db, 1, 101, 2);
  assert.equal(cart2.version, 1); // Unchanged version
});

test('PUT inactive or non-USD variant is rejected with 409 VARIANT_UNAVAILABLE', async () => {
  const db = createTestDb();
  await assert.rejects(
    putCartItem(db, 1, 103, 1),
    (err) => err.status === 409 && err.code === 'VARIANT_UNAVAILABLE',
  );
});

test('Address book operations: create, set default, and delete auto re-assign default', async () => {
  const db = createTestDb();

  // Create address for Asha (customer 2)
  const addr1 = await createAddress(db, 2, {
    recipient: 'Asha Silva',
    line1: '100 Main St',
    cityId: 1,
    postalCode: '78701',
    isDefault: true,
  });
  assert.equal(addr1.isDefault, true);

  // Create second address
  const addr2 = await createAddress(db, 2, {
    recipient: 'Asha Work',
    line1: '200 Business Rd',
    cityId: 2,
    postalCode: '75201',
    isDefault: false,
  });
  assert.equal(addr2.isDefault, false);

  // Set second address as default
  const updatedDefault = await setDefaultAddress(db, 2, addr2.id);
  assert.equal(updatedDefault.isDefault, true);

  // Delete current default address -> lower ID address becomes default
  const deleteResult = await deleteAddress(db, 2, addr2.id);
  assert.equal(deleteResult.deleted, true);

  const addresses = await getAddresses(db, 2);
  assert.equal(addresses.length, 1);
  assert.equal(addresses[0].id, addr1.id);
  assert.equal(addresses[0].isDefault, true);
});
