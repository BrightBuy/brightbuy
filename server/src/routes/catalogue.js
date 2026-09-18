import { Router } from 'express';

export function createCatalogueRoutes(db) {
  const router = Router();
  router.get('/products', async (req, res) => {
    const [products] = await db.query('SELECT id, name, description FROM products ORDER BY id');
    const [variants] = await db.query(
      'SELECT id, product_id AS productId, sku, name, price, stock FROM variants ORDER BY id',
    );
    const data = products.map((product) => ({
      ...product,
      variants: variants.filter((variant) => variant.productId === product.id),
    }));
    res.json({ data });
  });
  return router;
}
