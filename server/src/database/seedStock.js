import { applyStockChange } from '../services/inventory.js';

// Keep six catalogue products available for backorder demonstrations.
const backorderProducts = new Set([
  'BB-TOY-PUZZLE', 'ORBIT-S22', 'ZEPHYR-AIR-13',
  'ZEPHYR-OPENFIT', 'LUMIX-G9II', 'VORTEX-CAM-360',
]);
const lowStockProducts = new Set([
  'BB-TOY-ROBOT', 'SWIFT-Z9', 'NOVA-BUDS-3', 'ECHO-DOT5', 'APEX-HUB-7IN1',
]);

export function initialStock(productSku, variantSku) {
  if (backorderProducts.has(productSku)) return 0;
  let hash = 0;
  for (const char of variantSku) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return lowStockProducts.has(productSku) ? 1 + hash % 5 : 12 + hash % 49;
}

// Called only immediately after inserting a new sample variant. Never reset
// existing stock during setup: purchases and administrator adjustments survive.
export async function seedVariantStock(connection, productSku, variantSku, variantId) {
  const quantity = initialStock(productSku, variantSku);
  if (!quantity) return;
  await applyStockChange(connection, {
    variantId, quantityDelta: quantity, movementType: 'adjustment',
    referenceKey: `catalogue-opening-v1:${variantId}`,
    reason: 'Initial sample catalogue stock',
  });
}
