import { test } from 'node:test';
import assert from 'node:assert/strict';
import { variantColor, variantConfiguration, colorStyle } from '../src/utils/variant-colors.js';
import { getProductImage, IMAGE_PLACEHOLDER } from '../src/utils/productImages.js';
test('images use product identity and selected colour rather than category guesses', () => {
  const product = { sku: 'SONIX-WH-1000', categories: [{ name: 'Gaming' }] };
  assert.equal(getProductImage(product, { name: 'White' }), '/images/studio/sonix-wh-1000-white.webp');
  assert.equal(getProductImage(product, { name: 'Black' }), '/images/studio/headphones-black.webp');
  assert.equal(
    getProductImage({ sku: 'TITAN-HEADSET-G7' }, { name: 'Black' }),
    '/images/studio/gaming-headset-black.webp',
  );
  assert.equal(
    getProductImage(product, { attributeValues: [{ name: 'Color', value: 'Turquoise' }] }),
    IMAGE_PLACEHOLDER,
  );
  assert.equal(
    getProductImage({ sku: 'CUSTOM', categories: [{ name: 'Gaming' }] }),
    IMAGE_PLACEHOLDER,
  );
});
test('colour parsing preserves configuration and compound finishes', () => {
  assert.equal(variantColor({ name: 'White / 256 GB' }), 'white');
  assert.equal(variantConfiguration({ name: 'White / 256 GB' }), '256 GB');
  assert.equal(variantColor({ name: 'Black / Red' }), 'Black / Red');
  assert.match(colorStyle('Black / Red'), /^linear-gradient/);
  assert.equal(colorStyle('Unknown'), null);
  assert.equal(
    getProductImage({ sku: 'ORBIT-CHAIR-GT' }, { name: 'White / Blue' }),
    '/images/studio/chair-white-blue.webp',
  );
});
