import { Router } from 'express';
import { ApiError, positiveId } from '../errors.js';
import { fetchPublicProduct, fetchPublicCatalogue } from '../services/catalogue.js';
import { parseMoney, formatMoneyUnits } from '../utils/money.js';

export function createCatalogueRoutes(db) {
  const router = Router();

  // Backward compatibility: GET /products returns array of active products with active variants
  router.get('/products', async (req, res) => {
    const [products] = await db.query(
      'SELECT id, sku, name, description, brand, currency FROM products WHERE is_active = 1 ORDER BY id',
    );
    const [variants] = await db.query(
      'SELECT id, product_id AS productId, sku, name, price, stock, is_default AS isDefault FROM variants WHERE is_active = 1 ORDER BY id',
    );
    const data = (products || []).map((product) => ({
      ...product,
      variants: (variants || [])
        .filter((variant) => variant.productId === product.id)
        .map((v) => ({
          ...v,
          price: formatMoneyUnits(parseMoney(String(v.price))),
        })),
    }));
    res.json({ data });
  });

  // GET /catalogue - paginated public product browsing
  router.get('/catalogue', async (req, res) => {
    let page = 1;
    if (req.query.page !== undefined) {
      const parsedPage = Number(req.query.page);
      if (!Number.isSafeInteger(parsedPage) || parsedPage <= 0) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'page must be a positive integer.');
      }
      page = parsedPage;
    }

    let pageSize = 12;
    if (req.query.pageSize !== undefined) {
      const parsedPageSize = Number(req.query.pageSize);
      if (!Number.isSafeInteger(parsedPageSize) || parsedPageSize <= 0 || parsedPageSize > 50) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'pageSize must be an integer between 1 and 50.');
      }
      pageSize = parsedPageSize;
    }

    let categoryId = undefined;
    if (req.query.categoryId !== undefined) {
      const parsedCatId = Number(req.query.categoryId);
      if (!Number.isSafeInteger(parsedCatId) || parsedCatId <= 0) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'categoryId must be a positive integer.');
      }
      categoryId = parsedCatId;
    }

    let q = undefined;
    if (req.query.q !== undefined) {
      if (typeof req.query.q !== 'string') {
        throw new ApiError(400, 'VALIDATION_ERROR', 'q must be a string.');
      }
      const trimmed = req.query.q.trim();
      if (trimmed.length > 100) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'q cannot exceed 100 characters.');
      }
      q = trimmed || undefined;
    }

    const { minPrice, maxPrice, availability } = req.query;
    for (const value of [minPrice, maxPrice]) if (value !== undefined) parseMoney(value);
    if (minPrice !== undefined && maxPrice !== undefined && parseMoney(minPrice) > parseMoney(maxPrice)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Minimum price cannot exceed maximum price.');
    }
    if (availability !== undefined && !['in-stock', 'backorder'].includes(availability)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Choose in-stock or backorder availability.');
    }
    const result = await fetchPublicCatalogue(db, { q, categoryId, minPrice, maxPrice, availability, page, pageSize });
    res.json({ data: result });
  });

  // GET /products/:id - single product detail with categories and active variants
  router.get('/products/:id', async (req, res) => {
    const id = positiveId(req.params.id);
    const product = await fetchPublicProduct(db, id);
    if (!product) {
      throw new ApiError(404, 'NOT_FOUND', 'Product not found.');
    }
    res.json({ data: product });
  });

  // GET /categories - public categories list
  router.get('/categories', async (req, res) => {
    const [categories] = await db.query(
      'SELECT id, name, description FROM categories ORDER BY name ASC',
    );
    res.json({ data: categories || [] });
  });

  // GET /attributes - public attributes list
  router.get('/attributes', async (req, res) => {
    const [attributes] = await db.query('SELECT id, name FROM attributes ORDER BY name ASC');
    res.json({ data: attributes || [] });
  });

  return router;
}
