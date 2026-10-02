import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';

const secret = 'test-only-secret-that-is-at-least-32-characters';
let server, base;

const users = [
  { id: 1, name: 'Customer', email: 'customer@example.test', role: 'customer' },
  { id: 2, name: 'Admin', email: 'admin@example.test', role: 'admin' },
];

let categories = [];
let attributes = [];
let products = [];
let variants = [];
let productCategories = [];
let variantAttributeValues = [];

let nextCategoryId = 2;
let nextAttributeId = 2;
let nextProductId = 1;
let nextVariantId = 1;

const db = {
  async query(sql) {
    if (sql.includes('FROM categories')) {
      return [[...categories].sort((a, b) => a.name.localeCompare(b.name))];
    }
    if (sql.includes('FROM attributes')) {
      return [[...attributes].sort((a, b) => a.name.localeCompare(b.name))];
    }
    if (sql.includes('FROM products ORDER BY id DESC')) {
      return [[...products].sort((a, b) => b.id - a.id)];
    }
    return [[]];
  },
  async execute(sql, params = []) {
    // Auth lookup
    if (sql.includes('customers WHERE id')) {
      const user = users.find((u) => String(u.id) === String(params[0]));
      return [user ? [user] : []];
    }

    // Categories
    if (sql.includes('SELECT id FROM categories WHERE name = ? AND id != ?')) {
      const [name, id] = params;
      const found = categories.find(
        (c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== Number(id),
      );
      return [found ? [{ id: found.id }] : []];
    }
    if (sql.includes('SELECT id FROM categories WHERE name = ?')) {
      const [name] = params;
      const found = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
      return [found ? [{ id: found.id }] : []];
    }
    if (sql.includes('SELECT id, name, description FROM categories WHERE id = ?')) {
      const [id] = params;
      const found = categories.find((c) => c.id === Number(id));
      return [found ? [found] : []];
    }
    if (sql.includes('SELECT id FROM categories WHERE id = ?')) {
      const [id] = params;
      const found = categories.find((c) => c.id === Number(id));
      return [found ? [{ id: found.id }] : []];
    }
    if (sql.includes('INSERT INTO categories')) {
      const [name, description] = params;
      const id = nextCategoryId++;
      const item = { id, name, description };
      categories.push(item);
      return [{ insertId: id }];
    }
    if (sql.includes('UPDATE categories SET')) {
      const [name, description, id] = params;
      const found = categories.find((c) => c.id === Number(id));
      if (found) {
        found.name = name;
        found.description = description;
      }
      return [{ affectedRows: found ? 1 : 0 }];
    }

    // Attributes
    if (sql.includes('SELECT id FROM attributes WHERE name = ? AND id != ?')) {
      const [name, id] = params;
      const found = attributes.find(
        (a) => a.name.toLowerCase() === name.toLowerCase() && a.id !== Number(id),
      );
      return [found ? [{ id: found.id }] : []];
    }
    if (sql.includes('SELECT id FROM attributes WHERE name = ?')) {
      const [name] = params;
      const found = attributes.find((a) => a.name.toLowerCase() === name.toLowerCase());
      return [found ? [{ id: found.id }] : []];
    }
    if (sql.includes('SELECT id, name FROM attributes WHERE id = ?')) {
      const [id] = params;
      const found = attributes.find((a) => a.id === Number(id));
      return [found ? [found] : []];
    }
    if (sql.includes('SELECT id FROM attributes WHERE id = ?')) {
      const [id] = params;
      const found = attributes.find((a) => a.id === Number(id));
      return [found ? [{ id: found.id }] : []];
    }
    if (sql.includes('INSERT INTO attributes')) {
      const [name] = params;
      const id = nextAttributeId++;
      const item = { id, name };
      attributes.push(item);
      return [{ insertId: id }];
    }
    if (sql.includes('UPDATE attributes SET')) {
      const [name, id] = params;
      const found = attributes.find((a) => a.id === Number(id));
      if (found) {
        found.name = name;
      }
      return [{ affectedRows: found ? 1 : 0 }];
    }

    // Product Categories queries
    if (sql.includes('INSERT INTO product_categories')) {
      const [productId, categoryId] = params;
      productCategories.push({ productId: Number(productId), categoryId: Number(categoryId) });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('DELETE FROM product_categories')) {
      const [productId] = params;
      productCategories = productCategories.filter((pc) => pc.productId !== Number(productId));
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('JOIN product_categories') || sql.includes('FROM categories c')) {
      const [productId] = params;
      const linked = productCategories
        .filter((pc) => pc.productId === Number(productId))
        .map((pc) => categories.find((c) => c.id === pc.categoryId))
        .filter(Boolean);
      return [linked];
    }

    // Products
    if (sql.includes('SELECT id FROM products WHERE sku = ? AND id != ?')) {
      const [sku, id] = params;
      const found = products.find((p) => p.sku === sku && p.id !== Number(id));
      return [found ? [{ id: found.id }] : []];
    }
    if (sql.includes('SELECT id FROM products WHERE sku = ?')) {
      const [sku] = params;
      const found = products.find((p) => p.sku === sku);
      return [found ? [{ id: found.id }] : []];
    }
    if (sql.includes('FROM products WHERE id = ?')) {
      const [id] = params;
      const found = products.find((p) => p.id === Number(id));
      return [found ? [{ ...found, isActive: found.is_active, isLegacy: found.is_legacy }] : []];
    }
    if (sql.includes('INSERT INTO products')) {
      const [sku, name, description, brand] = params;
      const id = nextProductId++;
      const item = {
        id,
        sku,
        name,
        description,
        brand,
        currency: 'USD',
        is_active: 0,
        is_legacy: 0,
      };
      products.push(item);
      return [{ insertId: id }];
    }
    if (sql.includes('UPDATE products SET')) {
      const [sku, name, description, brand, id] = params;
      const found = products.find((p) => p.id === Number(id));
      if (found) {
        found.sku = sku;
        found.name = name;
        found.description = description;
        found.brand = brand;
      }
      return [{ affectedRows: found ? 1 : 0 }];
    }

    // Variants full list
    if (sql.includes('FROM variants') && sql.includes('ORDER BY id ASC')) {
      const [productId] = params;
      const list = variants.filter((v) => v.product_id === Number(productId));
      return [
        list.map((v) => ({
          ...v,
          productId: v.product_id,
          isActive: v.is_active,
          isDefault: v.is_default,
        })),
      ];
    }
    if (sql.includes('SELECT COUNT(*) AS count FROM variants WHERE product_id = ?')) {
      const [productId] = params;
      const count = variants.filter((v) => v.product_id === Number(productId)).length;
      return [[{ count }]];
    }
    if (sql.includes('SELECT id FROM variants WHERE sku = ? AND id != ?')) {
      const [sku, id] = params;
      const found = variants.find((v) => v.sku === sku && v.id !== Number(id));
      return [found ? [{ id: found.id }] : []];
    }
    if (sql.includes('SELECT id FROM variants WHERE sku = ?')) {
      const [sku] = params;
      const found = variants.find((v) => v.sku === sku);
      return [found ? [{ id: found.id }] : []];
    }
    if (
      sql.includes(
        'SELECT id FROM variants WHERE product_id = ? AND combination_key = ? AND id != ?',
      )
    ) {
      const [productId, combKey, id] = params;
      const found = variants.find(
        (v) =>
          v.product_id === Number(productId) &&
          v.combination_key === combKey &&
          v.id !== Number(id),
      );
      return [found ? [{ id: found.id }] : []];
    }
    if (sql.includes('SELECT id FROM variants WHERE product_id = ? AND combination_key = ?')) {
      const [productId, combKey] = params;
      const found = variants.find(
        (v) => v.product_id === Number(productId) && v.combination_key === combKey,
      );
      return [found ? [{ id: found.id }] : []];
    }
    if (sql.includes('FROM variants WHERE id = ?')) {
      const [id] = params;
      const found = variants.find((v) => v.id === Number(id));
      return [
        found
          ? [{ ...found, productId: found.product_id, combinationKey: found.combination_key }]
          : [],
      ];
    }
    if (sql.includes('INSERT INTO variants')) {
      const [productId, sku, name, price, isDefault, combKey] = params;
      const id = nextVariantId++;
      const item = {
        id,
        product_id: Number(productId),
        sku,
        name,
        price,
        stock: 0,
        is_active: 1,
        is_default: Number(isDefault),
        combination_key: combKey,
      };
      variants.push(item);
      return [{ insertId: id }];
    }
    if (sql.includes('UPDATE variants SET sku = ?')) {
      const [sku, name, price, combKey, id] = params;
      const found = variants.find((v) => v.id === Number(id));
      if (found) {
        found.sku = sku;
        found.name = name;
        found.price = price;
        found.combination_key = combKey;
      }
      return [{ affectedRows: found ? 1 : 0 }];
    }

    // Variant Attribute Values
    if (sql.includes('variant_attribute_values') && sql.includes('attributes')) {
      const [variantId] = params;
      const linked = variantAttributeValues
        .filter((vav) => vav.variantId === Number(variantId))
        .map((vav) => {
          const attr = attributes.find((a) => a.id === vav.attributeId);
          return { attributeId: vav.attributeId, name: attr?.name || '', value: vav.value };
        });
      return [linked];
    }
    if (sql.includes('DELETE FROM variant_attribute_values WHERE variant_id = ?')) {
      const [variantId] = params;
      variantAttributeValues = variantAttributeValues.filter(
        (vav) => vav.variantId !== Number(variantId),
      );
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO variant_attribute_values')) {
      const [variantId, attributeId, value] = params;
      variantAttributeValues.push({
        variantId: Number(variantId),
        attributeId: Number(attributeId),
        value,
      });
      return [{ affectedRows: 1 }];
    }

    throw new Error(`Unexpected SQL execution in catalogue-admin test: ${sql}`);
  },
};

const token = (id = 1, opts = {}) =>
  jwt.sign({ role: users.find((u) => u.id === id)?.role || 'customer' }, secret, {
    subject: String(id),
    issuer: 'brightbuy',
    audience: 'brightbuy-web',
    expiresIn: '1h',
    ...opts,
  });

async function request(path, { id, authorization, ...options } = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(id ? { Authorization: `Bearer ${token(id)}` } : {}),
      ...(authorization ? { Authorization: authorization } : {}),
    },
  });
  return {
    status: response.status,
    body: await response.json(),
    requestId: response.headers.get('x-request-id'),
  };
}

before(async () => {
  server = createApp(db, secret).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  categories = [{ id: 1, name: 'Everyday Essentials', description: 'Legacy collection' }];
  attributes = [{ id: 1, name: 'Color' }];
  products = [];
  variants = [];
  productCategories = [];
  variantAttributeValues = [];

  nextCategoryId = 2;
  nextAttributeId = 2;
  nextProductId = 1;
  nextVariantId = 1;
});

after(async () => {
  await new Promise((r) => server.close(r));
});

// -----------------------------------------------------------------------------
// Public Endpoints
// -----------------------------------------------------------------------------

test('public GET /api/categories returns array of categories', async () => {
  const res = await request('/api/categories');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].name, 'Everyday Essentials');
});

test('public GET /api/attributes returns array of attributes', async () => {
  const res = await request('/api/attributes');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].name, 'Color');
});

// -----------------------------------------------------------------------------
// Authentication and Authorization Guards
// -----------------------------------------------------------------------------

test('anonymous users cannot mutate categories or attributes (401)', async () => {
  const catPost = await request('/api/admin/categories', {
    method: 'POST',
    body: JSON.stringify({ name: 'Audio' }),
  });
  assert.equal(catPost.status, 401);
  assert.equal(catPost.body.error.code, 'UNAUTHENTICATED');

  const attrPost = await request('/api/admin/attributes', {
    method: 'POST',
    body: JSON.stringify({ name: 'Storage' }),
  });
  assert.equal(attrPost.status, 401);
  assert.equal(attrPost.body.error.code, 'UNAUTHENTICATED');
});

test('customers cannot mutate categories or attributes (403)', async () => {
  const catPost = await request('/api/admin/categories', {
    id: 1, // customer
    method: 'POST',
    body: JSON.stringify({ name: 'Audio' }),
  });
  assert.equal(catPost.status, 403);
  assert.equal(catPost.body.error.code, 'FORBIDDEN');

  const catPatch = await request('/api/admin/categories/1', {
    id: 1,
    method: 'PATCH',
    body: JSON.stringify({ name: 'Updated Essentials' }),
  });
  assert.equal(catPatch.status, 403);
  assert.equal(catPatch.body.error.code, 'FORBIDDEN');

  const attrPost = await request('/api/admin/attributes', {
    id: 1,
    method: 'POST',
    body: JSON.stringify({ name: 'Storage' }),
  });
  assert.equal(attrPost.status, 403);
  assert.equal(attrPost.body.error.code, 'FORBIDDEN');

  const attrPatch = await request('/api/admin/attributes/1', {
    id: 1,
    method: 'PATCH',
    body: JSON.stringify({ name: 'Material' }),
  });
  assert.equal(attrPatch.status, 403);
  assert.equal(attrPatch.body.error.code, 'FORBIDDEN');
});

// -----------------------------------------------------------------------------
// Category Management
// -----------------------------------------------------------------------------

test('admin can create a category (201)', async () => {
  const res = await request('/api/admin/categories', {
    id: 2, // admin
    method: 'POST',
    body: JSON.stringify({ name: 'Headphones', description: 'Over-ear and in-ear audio' }),
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.id, 2);
  assert.equal(res.body.data.name, 'Headphones');
  assert.equal(res.body.data.description, 'Over-ear and in-ear audio');
});

test('category creation rejects invalid payloads and unknown keys (400)', async () => {
  const emptyName = await request('/api/admin/categories', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: '   ' }),
  });
  assert.equal(emptyName.status, 400);
  assert.equal(emptyName.body.error.code, 'VALIDATION_ERROR');

  const longName = await request('/api/admin/categories', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'A'.repeat(101) }),
  });
  assert.equal(longName.status, 400);

  const longDesc = await request('/api/admin/categories', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'Valid', description: 'D'.repeat(501) }),
  });
  assert.equal(longDesc.status, 400);

  const unknownKey = await request('/api/admin/categories', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'Valid', stock: 10 }),
  });
  assert.equal(unknownKey.status, 400);
  assert.equal(unknownKey.body.error.code, 'VALIDATION_ERROR');
});

test('category creation rejects duplicate names (409)', async () => {
  const duplicate = await request('/api/admin/categories', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'Everyday Essentials' }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'CATEGORY_NAME_EXISTS');
});

test('admin can update a category (200) and handles 404/409', async () => {
  const updated = await request('/api/admin/categories/1', {
    id: 2,
    method: 'PATCH',
    body: JSON.stringify({ name: 'Updated Essentials', description: 'Updated desc' }),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, 'Updated Essentials');
  assert.equal(updated.body.data.description, 'Updated desc');

  const notFound = await request('/api/admin/categories/999', {
    id: 2,
    method: 'PATCH',
    body: JSON.stringify({ name: 'New Name' }),
  });
  assert.equal(notFound.status, 404);
  assert.equal(notFound.body.error.code, 'NOT_FOUND');

  const badId = await request('/api/admin/categories/invalid', {
    id: 2,
    method: 'PATCH',
    body: JSON.stringify({ name: 'New Name' }),
  });
  assert.equal(badId.status, 400);
  assert.equal(badId.body.error.code, 'VALIDATION_ERROR');
});

// -----------------------------------------------------------------------------
// Attribute Management
// -----------------------------------------------------------------------------

test('admin can create an attribute (201)', async () => {
  const res = await request('/api/admin/attributes', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'Storage' }),
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.id, 2);
  assert.equal(res.body.data.name, 'Storage');
});

test('attribute creation rejects empty names, long names, and unknown keys (400)', async () => {
  const emptyName = await request('/api/admin/attributes', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: '' }),
  });
  assert.equal(emptyName.status, 400);

  const longName = await request('/api/admin/attributes', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'A'.repeat(51) }),
  });
  assert.equal(longName.status, 400);

  const unknown = await request('/api/admin/attributes', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'Valid', extra: true }),
  });
  assert.equal(unknown.status, 400);
});

test('attribute creation and rename reject duplicate names (409)', async () => {
  const dupCreate = await request('/api/admin/attributes', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'Color' }),
  });
  assert.equal(dupCreate.status, 409);
  assert.equal(dupCreate.body.error.code, 'ATTRIBUTE_NAME_EXISTS');

  await request('/api/admin/attributes', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'Size' }),
  });

  const dupRename = await request('/api/admin/attributes/2', {
    id: 2,
    method: 'PATCH',
    body: JSON.stringify({ name: 'Color' }),
  });
  assert.equal(dupRename.status, 409);
  assert.equal(dupRename.body.error.code, 'ATTRIBUTE_NAME_EXISTS');
});

test('admin can update attribute (200) and handles 404', async () => {
  const updated = await request('/api/admin/attributes/1', {
    id: 2,
    method: 'PATCH',
    body: JSON.stringify({ name: 'Colour' }),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, 'Colour');

  const notFound = await request('/api/admin/attributes/999', {
    id: 2,
    method: 'PATCH',
    body: JSON.stringify({ name: 'Size' }),
  });
  assert.equal(notFound.status, 404);
  assert.equal(notFound.body.error.code, 'NOT_FOUND');
});

// -----------------------------------------------------------------------------
// Products and Variants Drafting (Commit 7)
// -----------------------------------------------------------------------------

test('admin can create draft product (201)', async () => {
  const res = await request('/api/admin/products', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({
      sku: 'DEMO-SPEAKER',
      name: 'Demo Speaker',
      description: 'Classroom speaker',
      brand: 'DemoTech',
      categoryIds: [1],
    }),
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.id, 1);
  assert.equal(res.body.data.sku, 'DEMO-SPEAKER');
  assert.equal(res.body.data.isActive, false);
  assert.equal(res.body.data.currency, 'USD');
  assert.equal(res.body.data.categories.length, 1);
  assert.equal(res.body.data.variants.length, 0);
});

test('product creation rejects duplicate SKU (409)', async () => {
  await request('/api/admin/products', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({
      sku: 'SPEAKER-1',
      name: 'Speaker One',
      categoryIds: [1],
    }),
  });

  const dup = await request('/api/admin/products', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({
      sku: 'SPEAKER-1',
      name: 'Another Speaker',
      categoryIds: [1],
    }),
  });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'SKU_EXISTS');
});

test('admin can add variants with canonical attribute combinations', async () => {
  const prod = await request('/api/admin/products', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({
      sku: 'HEADPHONE-X',
      name: 'Headphone X',
      categoryIds: [1],
    }),
  });
  const prodId = prod.body.data.id;

  // First variant: should automatically become default (isDefault = 1)
  const var1 = await request(`/api/admin/products/${prodId}/variants`, {
    id: 2,
    method: 'POST',
    body: JSON.stringify({
      sku: 'HEADPHONE-X-BLACK',
      name: 'Black',
      price: '49.99',
      attributeValues: [{ attributeId: 1, value: 'Black' }],
    }),
  });
  assert.equal(var1.status, 201);
  assert.equal(var1.body.data.isDefault, 1);
  assert.equal(var1.body.data.stock, 0);
  assert.equal(var1.body.data.price, '49.99');

  // Second variant with same attribute combination should fail with 409 VARIANT_COMBINATION_EXISTS
  const dupComb = await request(`/api/admin/products/${prodId}/variants`, {
    id: 2,
    method: 'POST',
    body: JSON.stringify({
      sku: 'HEADPHONE-X-BLACK-2',
      name: 'Black Duplicate',
      price: '49.99',
      attributeValues: [{ attributeId: 1, value: 'black ' }], // same normalized value
    }),
  });
  assert.equal(dupComb.status, 409);
  assert.equal(dupComb.body.error.code, 'VARIANT_COMBINATION_EXISTS');

  // Second distinct variant: should not be default
  const var2 = await request(`/api/admin/products/${prodId}/variants`, {
    id: 2,
    method: 'POST',
    body: JSON.stringify({
      sku: 'HEADPHONE-X-SILVER',
      name: 'Silver',
      price: '54.99',
      attributeValues: [{ attributeId: 1, value: 'Silver' }],
    }),
  });
  assert.equal(var2.status, 201);
  assert.equal(var2.body.data.isDefault, 0);
});

test('admin can update variant metadata and cannot edit stock (200)', async () => {
  const prod = await request('/api/admin/products', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ sku: 'TOY-CAR', name: 'Toy Car', categoryIds: [1] }),
  });
  const v = await request(`/api/admin/products/${prod.body.data.id}/variants`, {
    id: 2,
    method: 'POST',
    body: JSON.stringify({
      sku: 'TOY-RED',
      name: 'Red',
      price: '19.99',
      attributeValues: [{ attributeId: 1, value: 'Red' }],
    }),
  });

  // Updating metadata
  const updated = await request(`/api/admin/variants/${v.body.data.id}`, {
    id: 2,
    method: 'PATCH',
    body: JSON.stringify({ price: '24.99', name: 'Cherry Red' }),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.price, '24.99');
  assert.equal(updated.body.data.name, 'Cherry Red');

  // Attempting to inject stock field must fail
  const stockEdit = await request(`/api/admin/variants/${v.body.data.id}`, {
    id: 2,
    method: 'PATCH',
    body: JSON.stringify({ stock: 50 }),
  });
  assert.equal(stockEdit.status, 400);
  assert.equal(stockEdit.body.error.code, 'VALIDATION_ERROR');
});

test('admin reads include inactive draft products and detail', async () => {
  await request('/api/admin/products', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ sku: 'DRAFT-1', name: 'Draft 1', categoryIds: [1] }),
  });

  const list = await request('/api/admin/products', { id: 2 });
  assert.equal(list.status, 200);
  assert.ok(list.body.data.length >= 1);
  assert.equal(list.body.data[0].isActive, false);

  const detail = await request(`/api/admin/products/${list.body.data[0].id}`, { id: 2 });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.name, 'Draft 1');
});
