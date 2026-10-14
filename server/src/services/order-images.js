import { readFile } from 'node:fs/promises';
import { getProductImage, IMAGE_PLACEHOLDER } from '../../../shared/product-images.js';

// Runs inside checkout's transaction: rollback removes the image with the item.
export async function snapshotOrderImage(connection, itemId, variantId) {
  const [rows] = await connection.execute(
    'SELECT p.sku AS productSku,v.name AS variantName,i.mime_type AS mimeType,i.image_data AS imageData FROM variants v JOIN products p ON p.id=v.product_id LEFT JOIN variant_images i ON i.variant_id=v.id WHERE v.id=?', [variantId]);
  const row = rows[0];
  if (!row) return;
  let bytes = row.imageData;
  let mime = row.mimeType;
  if (!bytes) {
    const asset = getProductImage({sku:row.productSku},{name:row.variantName});
    if (asset === IMAGE_PLACEHOLDER) return;
    // The path comes only from the bundled catalogue mapping, never user input.
    try { bytes = await readFile(new URL('../../../client/public'+asset,import.meta.url)); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    mime = 'image/webp';
  }
  await connection.execute('INSERT INTO order_item_images(order_item_id,mime_type,image_data) VALUES (?,?,?)',[itemId,mime,bytes]);
}
