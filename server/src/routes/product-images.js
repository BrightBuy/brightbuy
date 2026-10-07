import express, { Router } from 'express';
import { ApiError, positiveId } from '../errors.js';
import { requireAdmin } from '../middleware/auth.js';
export function imageType(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new ApiError(400, 'INVALID_IMAGE', 'Choose a JPEG, PNG or WebP image.');
  if (bytes.length > 2 * 1024 * 1024) throw new ApiError(413, 'IMAGE_TOO_LARGE', 'Images must be 2 MB or smaller.');
  if (bytes.length >= 24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217) return 'image/jpeg';
  if (bytes.length >= 20 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return 'image/webp';
  throw new ApiError(415, 'INVALID_IMAGE', 'Only JPEG, PNG and WebP images are supported.');
}
export function createProductImageRoutes(db, auth) {
  const router = Router();
  router.get('/variants/:id/image', async (req,res) => {
    const [rows] = await db.execute('SELECT i.mime_type, i.image_data FROM variant_images i JOIN variants v ON v.id=i.variant_id JOIN products p ON p.id=v.product_id WHERE i.variant_id=? AND p.is_active=1 AND v.is_active=1', [positiveId(req.params.id)]);
    if (!rows[0]) throw new ApiError(404,'NOT_FOUND','Variant image not found.');
    res.set('Cache-Control','no-cache').set('X-Content-Type-Options','nosniff').type(rows[0].mime_type).send(rows[0].image_data);
  });
  router.get('/admin/variants/:id/image', auth, requireAdmin, async (req,res) => {
    const [rows] = await db.execute('SELECT mime_type, image_data FROM variant_images WHERE variant_id=?', [positiveId(req.params.id)]);
    res.json({data: rows[0] ? { preview: 'data:' + rows[0].mime_type + ';base64,' + rows[0].image_data.toString('base64') } : null});
  });
  router.put('/admin/variants/:id/image', auth, requireAdmin, express.raw({type:()=>true,limit:'2mb'}), async (req,res) => {
    const id=positiveId(req.params.id);
    const mime=imageType(req.body);
    const [products]=await db.execute('SELECT id FROM variants WHERE id=?',[id]);
    if (!products.length) throw new ApiError(404,'NOT_FOUND','Variant not found.');
    await db.execute('INSERT INTO variant_images(variant_id,mime_type,image_data) VALUES(?,?,?) ON DUPLICATE KEY UPDATE mime_type=VALUES(mime_type),image_data=VALUES(image_data)',[id,mime,req.body]);
    res.json({data:{imageUrl:'/api/variants/'+id+'/image'}});
  });
  router.delete('/admin/variants/:id/image', auth, requireAdmin, async(req,res)=>{
    await db.execute('DELETE FROM variant_images WHERE variant_id=?',[positiveId(req.params.id)]);
    res.json({data:{removed:true}});
  });
  return router;
}
