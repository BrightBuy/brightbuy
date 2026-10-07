import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { computeCombinationKey } from '../src/services/catalogue.js';

let server, base;
const secret = 'test-only-secret-that-is-at-least-32-characters';

let categories = [];
let attributes = [];
let products = [];
let variants = [];
let productCategories = [];
let variantAttributeValues = [];

const db = {
  async query(sql) {
    if (sql.includes('FROM categories')) {
      return [[...categories].sort((a, b) => a.name.localeCompare(b.name))];
    }
    if (sql.includes('FROM attributes')) {
      return [[...attributes].sort((a, b) => a.name.localeCompare(b.name))];
    }
    if (sql.includes('FROM products WHERE is_active = 1')) {
      return [products.filter((p) => p.is_active === 1).sort((a, b) => a.id - b.id)];
    }
    if (sql.includes('FROM variants WHERE is_active = 1')) {
      return [
        variants
          .filter((v) => v.is_active === 1)
          .map((v) => ({ ...v, productId: v.product_id, isDefault: v.is_default }))
          .sort((a, b) => a.id - b.id),
      ];
    }
    return [[]];
  },

  async execute(sql, params = []) {
    // Auth lookup placeholder
    if (sql.includes('customers WHERE')) {
      return [[]];
    }

    // Public Catalogue: Count query
    if (sql.includes('COUNT(DISTINCT p.id)')) {
      let filtered = products.filter((p) => p.is_active === 1);
      if (sql.includes('pc.category_id = ?')) {
        const catId = Number(params[0]);
        filtered = filtered.filter((p) =>
          productCategories.some((pc) => pc.productId === p.id && pc.categoryId === catId),
        );
      }
      if (sql.includes('p.name LIKE ?')) {
        const qParam = params[params.length - 1]; // '%term%'
        const rawTerm = qParam.slice(1, -1).toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(rawTerm) ||
            (p.brand && p.brand.toLowerCase().includes(rawTerm)),
        );
      }
      return [[{ total: filtered.length }]];
    }

    // Public Catalogue: Select paged product IDs
    if (sql.includes('SELECT DISTINCT p.id')) {
      let filtered = products.filter((p) => p.is_active === 1);
      let paramIdx = 0;
      if (sql.includes('pc.category_id = ?')) {
        const catId = Number(params[paramIdx++]);
        filtered = filtered.filter((p) =>
          productCategories.some((pc) => pc.productId === p.id && pc.categoryId === catId),
        );
      }
      if (sql.includes('p.name LIKE ?')) {
        const qParam = params[paramIdx++]; // first '%term%'
        paramIdx++; // second '%term%'
        const rawTerm = qParam.slice(1, -1).toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(rawTerm) ||
            (p.brand && p.brand.toLowerCase().includes(rawTerm)),
        );
      }
      const limit = Number(params[paramIdx++]);
      const offset = Number(params[paramIdx++]);

      filtered.sort((a, b) => a.id - b.id);
      const sliced = filtered.slice(offset, offset + limit);
      return [sliced.map((p) => ({ id: p.id }))];
    }

    // Public Product Detail
    if (sql.includes('FROM products') && sql.includes('id = ?') && sql.includes('is_active = 1')) {
      const [id] = params;
      const found = products.find((p) => p.id === Number(id) && p.is_active === 1);
      return [found ? [found] : []];
    }

    // Product Categories join
    if (sql.includes('JOIN product_categories') || sql.includes('FROM categories c')) {
      const [productId] = params;
      const linked = productCategories
        .filter((pc) => pc.productId === Number(productId))
        .map((pc) => categories.find((c) => c.id === pc.categoryId))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
      return [linked];
    }

    // Active Variants of a product
    if (sql.includes('FROM variants') && sql.includes('product_id = ?') && sql.includes('is_active = 1')) {
      const [productId] = params;
      const list = variants
        .filter((v) => v.product_id === Number(productId) && v.is_active === 1)
        .map((v) => ({
          ...v,
          productId: v.product_id,
          isDefault: v.is_default,
        }))
        .sort((a, b) => b.is_default - a.is_default || a.id - b.id);
      return [list];
    }

    // Variant Attribute Values
    if (sql.includes('variant_attribute_values') && sql.includes('attributes')) {
      const [variantId] = params;
      const linked = variantAttributeValues
        .filter((vav) => vav.variantId === Number(variantId))
        .map((vav) => {
          const attr = attributes.find((a) => a.id === vav.attributeId);
          return { attributeId: vav.attributeId, name: attr?.name || '', value: vav.value };
        })
        .sort((a, b) => a.attributeId - b.attributeId);
      return [linked];
    }

    throw new Error(`Unexpected SQL execution in catalogue test: ${sql}`);
  },
};

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
}

before(async () => {
  server = createApp(db, secret).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  categories = [
    { id: 1, name: 'Audio', description: 'Headphones and speakers' },
    { id: 2, name: 'Smart Home', description: 'Connected home tech' },
  ];

  attributes = [
    { id: 1, name: 'Color' },
    { id: 2, name: 'Storage' },
  ];

  products = [
    {
      id: 1,
      sku: 'PROD-HEADPHONES',
      name: 'Wireless Studio Headphones',
      description: 'Noise cancelling over-ear headphones',
      brand: 'SoundMaster',
      currency: 'USD',
      is_active: 1,
    },
    {
      id: 2,
      sku: 'PROD-SPEAKER',
      name: 'Portable Bluetooth Speaker',
      description: 'Waterproof outdoor speaker',
      brand: 'SoundMaster',
      currency: 'USD',
      is_active: 1,
    },
    {
      id: 3,
      sku: 'PROD-LAMP',
      name: 'Smart Ambient Lamp',
      description: 'RGB customizable bedside lamp',
      brand: 'Lumina',
      currency: 'USD',
      is_active: 1,
    },
    {
      id: 4,
      sku: 'DRAFT-CAMERA',
      name: '4K Action Camera',
      description: 'Compact action camera',
      brand: 'VisionPro',
      currency: 'USD',
      is_active: 0, // Inactive draft product
    },
  ];

  productCategories = [
    { productId: 1, categoryId: 1 },
    { productId: 2, categoryId: 1 },
    { productId: 3, categoryId: 2 },
    { productId: 4, categoryId: 1 },
  ];

  variants = [
    {
      id: 1,
      product_id: 1,
      sku: 'PROD-HEADPHONES-BLK',
      name: 'Midnight Black',
      price: '199.99',
      stock: 15,
      is_active: 1,
      is_default: 1,
    },
    {
      id: 2,
      product_id: 1,
      sku: 'PROD-HEADPHONES-SLV',
      name: 'Silver Frost',
      price: '219.99',
      stock: 0,
      is_active: 1,
      is_default: 0,
    },
    {
      id: 3,
      product_id: 1,
      sku: 'PROD-HEADPHONES-RED',
      name: 'Crimson Red (Archived)',
      price: '199.99',
      stock: 0,
      is_active: 0, // Inactive variant
      is_default: 0,
    },
    {
      id: 4,
      product_id: 2,
      sku: 'PROD-SPEAKER-STD',
      name: 'Standard Speaker',
      price: '79.99',
      stock: 8,
      is_active: 1,
      is_default: 1,
    },
    {
      id: 5,
      product_id: 3,
      sku: 'PROD-LAMP-STD',
      name: 'Standard Lamp',
      price: '49.99',
      stock: 20,
      is_active: 1,
      is_default: 1,
    },
    {
      id: 6,
      product_id: 4,
      sku: 'DRAFT-CAM-STD',
      name: 'Draft Variant',
      price: '99.99',
      stock: 0,
      is_active: 1,
      is_default: 1,
    },
  ];

  variantAttributeValues = [
    { variantId: 1, attributeId: 1, value: 'Midnight Black' },
    { variantId: 2, attributeId: 1, value: 'Silver Frost' },
    { variantId: 3, attributeId: 1, value: 'Crimson Red' },
  ];
});

after(async () => {
  await new Promise((r) => server.close(r));
});

// -----------------------------------------------------------------------------
// Public Catalogue Browsing (GET /api/catalogue)
// -----------------------------------------------------------------------------

test('GET /api/catalogue returns paginated active products only', async () => {
  const res = await request('/api/catalogue');
  assert.equal(res.status, 200);

  const { items, total, page, pageSize, totalPages } = res.body.data;
  assert.equal(total, 3); // 3 active products (skips draft product 4)
  assert.equal(page, 1);
  assert.equal(pageSize, 12);
  assert.equal(totalPages, 1);
  assert.equal(items.length, 3);

  // Check product 1 details
  const prod1 = items.find((p) => p.id === 1);
  assert.ok(prod1);
  assert.equal(prod1.name, 'Wireless Studio Headphones');
  assert.equal(prod1.categories.length, 1);
  assert.equal(prod1.categories[0].name, 'Audio');

  // Verify default variant is populated
  assert.ok(prod1.defaultVariant);
  assert.equal(prod1.defaultVariant.id, 1);
  assert.equal(prod1.defaultVariant.name, 'Midnight Black');
  assert.equal(prod1.defaultVariant.price, '199.99');
  assert.equal(prod1.defaultVariant.stock, 15);

  // Inactive variants must be excluded from public variants list
  assert.equal(prod1.variants.length, 2);
  assert.ok(prod1.variants.every((v) => v.id !== 3)); // variant 3 is inactive
});

test('GET /api/catalogue supports pagination params and validates inputs', async () => {
  // Page size 2, page 1
  const resPage1 = await request('/api/catalogue?page=1&pageSize=2');
  assert.equal(resPage1.status, 200);
  assert.equal(resPage1.body.data.items.length, 2);
  assert.equal(resPage1.body.data.page, 1);
  assert.equal(resPage1.body.data.pageSize, 2);
  assert.equal(resPage1.body.data.total, 3);
  assert.equal(resPage1.body.data.totalPages, 2);
  assert.equal(resPage1.body.data.items[0].id, 1);
  assert.equal(resPage1.body.data.items[1].id, 2);

  // Page 2
  const resPage2 = await request('/api/catalogue?page=2&pageSize=2');
  assert.equal(resPage2.status, 200);
  assert.equal(resPage2.body.data.items.length, 1);
  assert.equal(resPage2.body.data.items[0].id, 3);

  // Validation: negative page
  const badPage = await request('/api/catalogue?page=0');
  assert.equal(badPage.status, 400);
  assert.equal(badPage.body.error.code, 'VALIDATION_ERROR');

  // Validation: non-numeric page
  const textPage = await request('/api/catalogue?page=abc');
  assert.equal(textPage.status, 400);

  // Validation: pageSize > 50
  const largePageSize = await request('/api/catalogue?pageSize=100');
  assert.equal(largePageSize.status, 400);
  assert.equal(largePageSize.body.error.code, 'VALIDATION_ERROR');
});

test('GET /api/catalogue filters by categoryId', async () => {
  // Filter for Smart Home (categoryId 2)
  const res = await request('/api/catalogue?categoryId=2');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.total, 1);
  assert.equal(res.body.data.items.length, 1);
  assert.equal(res.body.data.items[0].id, 3);
  assert.equal(res.body.data.items[0].name, 'Smart Ambient Lamp');

  // Invalid categoryId parameter
  const badCat = await request('/api/catalogue?categoryId=invalid');
  assert.equal(badCat.status, 400);
  assert.equal(badCat.body.error.code, 'VALIDATION_ERROR');
});

test('GET /api/catalogue searches by name or brand substring', async () => {
  // Search by brand SoundMaster
  const resBrand = await request('/api/catalogue?q=soundmaster');
  assert.equal(resBrand.status, 200);
  assert.equal(resBrand.body.data.total, 2);
  assert.equal(resBrand.body.data.items.length, 2);

  // Search by product name "speaker"
  const resName = await request('/api/catalogue?q=Speaker');
  assert.equal(resName.status, 200);
  assert.equal(resName.body.data.total, 1);
  assert.equal(resName.body.data.items[0].id, 2);

  // Search with no matches
  const resEmpty = await request('/api/catalogue?q=NonExistent');
  assert.equal(resEmpty.status, 200);
  assert.equal(resEmpty.body.data.total, 0);
  assert.equal(resEmpty.body.data.items.length, 0);
});

// -----------------------------------------------------------------------------
// Public Product Detail (GET /api/products/:id)
// -----------------------------------------------------------------------------

test('GET /api/products/:id returns active product with active variants and categories', async () => {
  const res = await request('/api/products/1');
  assert.equal(res.status, 200);

  const product = res.body.data;
  assert.equal(product.id, 1);
  assert.equal(product.sku, 'PROD-HEADPHONES');
  assert.equal(product.name, 'Wireless Studio Headphones');
  assert.equal(product.brand, 'SoundMaster');
  assert.equal(product.currency, 'USD');

  // Categories
  assert.equal(product.categories.length, 1);
  assert.equal(product.categories[0].id, 1);
  assert.equal(product.categories[0].name, 'Audio');

  // Active variants only (excludes inactive variant 3)
  assert.equal(product.variants.length, 2);
  assert.ok(product.variants.every((v) => v.id !== 3));

  // Default variant
  assert.ok(product.defaultVariant);
  assert.equal(product.defaultVariant.id, 1);
  assert.equal(product.defaultVariant.isDefault, 1);

  // Attribute values attached to variant
  const v1 = product.variants.find((v) => v.id === 1);
  assert.equal(v1.attributeValues.length, 1);
  assert.equal(v1.attributeValues[0].name, 'Color');
  assert.equal(v1.attributeValues[0].value, 'Midnight Black');
});

test('GET /api/products/:id returns 404 for missing or inactive products', async () => {
  // Non-existent product
  const notFound = await request('/api/products/999');
  assert.equal(notFound.status, 404);
  assert.equal(notFound.body.error.code, 'NOT_FOUND');

  // Inactive draft product (id 4)
  const inactive = await request('/api/products/4');
  assert.equal(inactive.status, 404);
  assert.equal(inactive.body.error.code, 'NOT_FOUND');

  // Invalid ID format
  const badId = await request('/api/products/xyz');
  assert.equal(badId.status, 400);
  assert.equal(badId.body.error.code, 'VALIDATION_ERROR');
});

// -----------------------------------------------------------------------------
// Backwards Compatibility (GET /api/products)
// -----------------------------------------------------------------------------

test('GET /api/products maintains array backward compatibility', async () => {
  const res = await request('/api/products');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 3);
  assert.equal(res.body.data[0].id, 1);
  assert.ok(Array.isArray(res.body.data[0].variants));
});

// -----------------------------------------------------------------------------
// Edge Cases & Invariants
// -----------------------------------------------------------------------------

test('computeCombinationKey normalizes attribute values and orders by attributeId', () => {
  // Empty attribute values produce empty string (single variant without attributes)
  assert.equal(computeCombinationKey([]), '');
  assert.throws(() => computeCombinationKey(null), { code: 'VALIDATION_ERROR' });

  // Out of order attributeIds must sort ascending
  const key1 = computeCombinationKey([
    { attributeId: 2, value: '  128 GB ' },
    { attributeId: 1, value: ' Midnight BLUE' },
  ]);
  assert.equal(key1, 'attr:1=midnight blue|attr:2=128 gb');

  // Identical attributes in different case and spacing yield identical canonical key
  const key2 = computeCombinationKey([
    { attributeId: 1, value: 'midnight blue' },
    { attributeId: 2, value: '128 gb' },
  ]);
  assert.equal(key1, key2);
});

test('GET /api/catalogue boundary checks: reject negative page, zero page, and oversize pageSize', async () => {
  const resZeroPage = await request('/api/catalogue?page=0');
  assert.equal(resZeroPage.status, 400);
  assert.equal(resZeroPage.body.error.code, 'VALIDATION_ERROR');

  const resNegPage = await request('/api/catalogue?page=-1');
  assert.equal(resNegPage.status, 400);

  const resOversize = await request('/api/catalogue?pageSize=100');
  assert.equal(resOversize.status, 400);
  assert.equal(resOversize.body.error.code, 'VALIDATION_ERROR');
});

test('GET /api/categories returns alphabetically sorted categories', async () => {
  const res = await request('/api/categories');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 2);
  assert.equal(res.body.data[0].name, 'Audio');
  assert.equal(res.body.data[1].name, 'Smart Home');
});

