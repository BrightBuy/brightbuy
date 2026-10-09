import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileLegacyCatalogue } from '../src/database/reconcile.js';

function createMockDb() {
  const categories = [];
  const products = [
    { id: 1, name: 'Wireless Headphones', sku: null, is_legacy: 0, currency: 'USD', is_active: 1 },
    { id: 2, name: 'Bluetooth Speaker', sku: null, is_legacy: 0, currency: 'USD', is_active: 1 },
    { id: 3, name: 'Robot Building Kit', sku: null, is_legacy: 0, currency: 'USD', is_active: 1 },
  ];
  const variants = [
    { id: 1, product_id: 1, sku: 'DEMO-HEADPHONES-NAVY', is_active: 1, is_default: 0, combination_key: null },
    {
      id: 2,
      product_id: 1,
      sku: 'DEMO-HEADPHONES-WHITE',
      is_active: 1,
      is_default: 0,
      combination_key: null,
    },
    {
      id: 3,
      product_id: 2,
      sku: 'DEMO-SPEAKER-GREEN',
      is_active: 1,
      is_default: 0,
      combination_key: null,
    },
    {
      id: 4,
      product_id: 2,
      sku: 'DEMO-SPEAKER-BLACK',
      is_active: 1,
      is_default: 0,
      combination_key: null,
    },
    { id: 5, product_id: 3, sku: 'DEMO-ROBOT-STARTER', is_active: 1, is_default: 0, combination_key: null },
  ];
  const productCategories = [];

  const connection = {
    async query(sql) {
      if (sql.includes('INSERT INTO categories') || sql.includes('INSERT IGNORE INTO categories')) {
        if (!categories.some((c) => c.id === 1)) {
          categories.push({ id: 1, name: 'Demo Electronics & Toys' });
        }
        return [[]];
      }
      if (sql.includes('FROM products')) {
        return [products.map((p) => ({ ...p }))];
      }
      if (sql.includes('UPDATE products')) {
        const idMatch = sql.match(/WHERE id = (\d+)/);
        const skuMatch = sql.match(/SET sku = '([^']+)'/);
        if (idMatch && skuMatch) {
          const id = Number(idMatch[1]);
          const product = products.find((p) => p.id === id);
          if (product) {
            product.sku = skuMatch[1];
            product.is_legacy = 1;
            product.is_active = 0;
          }
        }
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('INSERT INTO product_categories')) {
        const match = sql.match(/VALUES \((\d+), 1\)/);
        if (match) {
          const prodId = Number(match[1]);
          if (!productCategories.some((pc) => pc.productId === prodId && pc.categoryId === 1)) {
            productCategories.push({ productId: prodId, categoryId: 1 });
          }
        }
        return [[]];
      }
      if (sql.includes('FROM variants')) {
        return [variants.map((v) => ({ ...v }))];
      }
      if (sql.includes('UPDATE variants')) {
        const idMatch = sql.match(/WHERE id = (\d+)/);
        const defaultMatch = sql.match(/is_default\s*=\s*(\d+)/);
        const keyMatch = sql.match(/combination_key\s*=\s*'([^']+)'/);
        if (idMatch) {
          const id = Number(idMatch[1]);
          const variant = variants.find((v) => v.id === id);
          if (variant) {
            if (defaultMatch) variant.is_default = Number(defaultMatch[1]);
            if (keyMatch) variant.combination_key = keyMatch[1];
            variant.is_active = 1;
          }
        }
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
  };

  return { connection, categories, products, variants, productCategories };
}

test('reconcileLegacyCatalogue marks products legacy, inactive with deterministic SKUs', async () => {
  const { connection, products, variants, productCategories, categories } = createMockDb();

  await reconcileLegacyCatalogue(connection);

  assert.equal(categories.length, 1);
  assert.equal(categories[0].name, 'Demo Electronics & Toys');

  // Verify all 3 products
  assert.equal(products[0].sku, 'LEGACY-PRD-1');
  assert.equal(products[0].currency, 'USD');
  assert.equal(products[0].is_legacy, 1);
  assert.equal(products[0].is_active, 0);

  assert.equal(products[1].sku, 'LEGACY-PRD-2');
  assert.equal(products[2].sku, 'LEGACY-PRD-3');

  // Verify product categories assignment
  assert.equal(productCategories.length, 3);
  assert.deepEqual(
    productCategories.map((pc) => pc.productId),
    [1, 2, 3],
  );

  // Verify default variant assignment:
  // Product 1: Variant 1 is default, Variant 2 is not
  assert.equal(variants.find((v) => v.id === 1).is_default, 1);
  assert.equal(variants.find((v) => v.id === 2).is_default, 0);

  // Product 2: Variant 3 is default, Variant 4 is not
  assert.equal(variants.find((v) => v.id === 3).is_default, 1);
  assert.equal(variants.find((v) => v.id === 4).is_default, 0);

  // Product 3: Variant 5 is default
  assert.equal(variants.find((v) => v.id === 5).is_default, 1);

  // All variants must have combination keys and be active
  for (const variant of variants) {
    assert.equal(variant.is_active, 1);
    assert.ok(variant.combination_key);
  }
});

test('reconcileLegacyCatalogue is idempotent when run repeatedly', async () => {
  const { connection, products, variants } = createMockDb();

  await reconcileLegacyCatalogue(connection);
  await reconcileLegacyCatalogue(connection);

  assert.equal(products[0].sku, 'LEGACY-PRD-1');
  assert.equal(variants.find((v) => v.id === 1).is_default, 1);
  assert.equal(variants.find((v) => v.id === 2).is_default, 0);
});
