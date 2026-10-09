import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  DEMO_PRODUCT_IMAGES,
  getProductImage,
  IMAGE_PLACEHOLDER,
} from '../src/utils/productImages.js';
import { seedProjectData } from '../../server/src/database/seedProject.js';

test('each demo product owns distinct image files and no unused studio assets remain', () => {
  const owners = new Map();
  const contentOwners = new Map();
  for (const [sku, entry] of Object.entries(DEMO_PRODUCT_IMAGES)) {
    const assets = new Set([
      entry.standard,
      ...Object.values(entry.colors),
      ...Object.values(entry.configurations),
    ]);
    for (const asset of assets) {
      assert.ok(!owners.has(asset), `${asset} is shared by ${owners.get(asset)} and ${sku}`);
      owners.set(asset, sku);
      const bytes = readFileSync(new URL(`../public/images/studio/${asset}.webp`, import.meta.url));
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
      const digest = createHash('sha256').update(bytes).digest('hex');
      assert.ok(!contentOwners.has(digest), `${asset} duplicates ${contentOwners.get(digest)}`);
      contentOwners.set(digest, asset);
    }
  }
  const files = readdirSync(new URL('../public/images/studio/', import.meta.url));
  assert.deepEqual(files.sort(), [...owners.keys()].map((name) => name + '.webp').sort());
});

test('every seeded product and variant resolves to an existing product-specific image', async () => {
  const categories = [],
    attributes = [],
    products = [],
    variants = [];
  let nextId = 1;
  // Capture the actual seed definitions without connecting to or changing a database.
  const connection = {
    async execute(sql, params = []) {
      if (sql.startsWith('SELECT')) return [[]];
      const insertId = nextId++;
      if (sql.startsWith('INSERT IGNORE INTO categories'))
        categories.push({ id: insertId, name: params[0] });
      if (sql.startsWith('INSERT IGNORE INTO attributes'))
        attributes.push({ id: insertId, name: params[0] });
      if (sql.startsWith('INSERT INTO products')) products.push({ id: insertId, sku: params[0] });
      if (sql.startsWith('INSERT INTO variants'))
        variants.push({ id: insertId, productId: params[0], name: params[2], attributeValues: [] });
      if (sql.startsWith('INSERT IGNORE INTO variant_attribute_values')) {
        variants
          .find((v) => v.id === params[0])
          .attributeValues.push({
            name: attributes.find((a) => a.id === params[1]).name,
            value: params[2],
          });
      }
      return [{ insertId }];
    },
    async query(sql) {
      return [sql.includes('categories') ? categories : attributes];
    },
  };
  await seedProjectData(connection);
  assert.ok(products.length > 40);
  for (const product of products) {
    for (const variant of variants.filter((v) => v.productId === product.id)) {
      const image = getProductImage(product, variant);
      assert.notEqual(image, IMAGE_PLACEHOLDER, `${product.sku}: ${variant.name}`);
      assert.ok(readFileSync(new URL('../public' + image, import.meta.url)).length > 0);
    }
  }
  const product = { sku: 'NOVA-X1-PRO' };
  assert.equal(
    getProductImage(product, { name: 'Black / 128 GB' }),
    getProductImage(product, { name: 'Black / 256 GB' }),
  );
  assert.notEqual(
    getProductImage(product, { name: 'Black / 128 GB' }),
    getProductImage(product, { name: 'Silver / 256 GB' }),
  );
  assert.notEqual(
    getProductImage({ sku: 'NOVA-SMART-PLUG-WIFI' }, { name: 'Single Pack' }),
    getProductImage({ sku: 'NOVA-SMART-PLUG-WIFI' }, { name: 'Four Pack' }),
  );
});
