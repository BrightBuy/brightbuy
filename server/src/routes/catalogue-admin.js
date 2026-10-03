import { Router } from 'express';
import { ApiError, positiveId } from '../errors.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  computeCombinationKey,
  fetchFullProduct,
  withTransaction,
  setDefaultVariant,
  setProductActive,
  setVariantActive,
} from '../services/catalogue.js';
import { parseMoney, formatMoneyUnits } from '../utils/money.js';

function validateAllowedKeys(body, allowedKeys) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }
  const keys = Object.keys(body);
  for (const key of keys) {
    if (!allowedKeys.includes(key)) {
      throw new ApiError(400, 'VALIDATION_ERROR', `Unknown property: ${key}`);
    }
  }
}

export function createCatalogueAdminRoutes(db, requireAuthentication) {
  const router = Router();

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------

  // POST /admin/categories
  router.post('/admin/categories', requireAuthentication, requireAdmin, async (req, res) => {
    validateAllowedKeys(req.body, ['name', 'description']);

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 100) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Category name is required and must be between 1 and 100 characters.',
      );
    }

    let description = '';
    if (req.body.description !== undefined) {
      if (typeof req.body.description !== 'string') {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Description must be a string.');
      }
      description = req.body.description.trim();
      if (description.length > 500) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Description cannot exceed 500 characters.');
      }
    }

    // Check duplicate name
    const [existing] = await db.execute('SELECT id FROM categories WHERE name = ?', [name]);
    if (existing && existing.length > 0) {
      throw new ApiError(409, 'CATEGORY_NAME_EXISTS', 'A category with this name already exists.');
    }

    try {
      const [result] = await db.execute(
        'INSERT INTO categories (name, description) VALUES (?, ?)',
        [name, description],
      );
      res.status(201).json({
        data: {
          id: result.insertId,
          name,
          description,
        },
      });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
        throw new ApiError(
          409,
          'CATEGORY_NAME_EXISTS',
          'A category with this name already exists.',
        );
      }
      throw err;
    }
  });

  // PATCH /admin/categories/:id
  router.patch('/admin/categories/:id', requireAuthentication, requireAdmin, async (req, res) => {
    const id = positiveId(req.params.id);
    validateAllowedKeys(req.body, ['name', 'description']);

    const [categories] = await db.execute(
      'SELECT id, name, description FROM categories WHERE id = ?',
      [id],
    );
    if (!categories || !categories[0]) {
      throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    }

    let updatedName = categories[0].name;
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string') {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Category name must be a string.');
      }
      const trimmed = req.body.name.trim();
      if (!trimmed || trimmed.length > 100) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'Category name must be between 1 and 100 characters.',
        );
      }
      if (trimmed !== categories[0].name) {
        const [duplicate] = await db.execute(
          'SELECT id FROM categories WHERE name = ? AND id != ?',
          [trimmed, id],
        );
        if (duplicate && duplicate.length > 0) {
          throw new ApiError(
            409,
            'CATEGORY_NAME_EXISTS',
            'A category with this name already exists.',
          );
        }
      }
      updatedName = trimmed;
    }

    let updatedDescription = categories[0].description;
    if (req.body.description !== undefined) {
      if (typeof req.body.description !== 'string') {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Description must be a string.');
      }
      const trimmedDesc = req.body.description.trim();
      if (trimmedDesc.length > 500) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Description cannot exceed 500 characters.');
      }
      updatedDescription = trimmedDesc;
    }

    try {
      await db.execute('UPDATE categories SET name = ?, description = ? WHERE id = ?', [
        updatedName,
        updatedDescription,
        id,
      ]);
      res.json({
        data: {
          id,
          name: updatedName,
          description: updatedDescription,
        },
      });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
        throw new ApiError(
          409,
          'CATEGORY_NAME_EXISTS',
          'A category with this name already exists.',
        );
      }
      throw err;
    }
  });

  // ---------------------------------------------------------------------------
  // Attributes
  // ---------------------------------------------------------------------------

  // POST /admin/attributes
  router.post('/admin/attributes', requireAuthentication, requireAdmin, async (req, res) => {
    validateAllowedKeys(req.body, ['name']);

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 50) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Attribute name is required and must be between 1 and 50 characters.',
      );
    }

    const [existing] = await db.execute('SELECT id FROM attributes WHERE name = ?', [name]);
    if (existing && existing.length > 0) {
      throw new ApiError(
        409,
        'ATTRIBUTE_NAME_EXISTS',
        'An attribute with this name already exists.',
      );
    }

    try {
      const [result] = await db.execute('INSERT INTO attributes (name) VALUES (?)', [name]);
      res.status(201).json({
        data: {
          id: result.insertId,
          name,
        },
      });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
        throw new ApiError(
          409,
          'ATTRIBUTE_NAME_EXISTS',
          'An attribute with this name already exists.',
        );
      }
      throw err;
    }
  });

  // PATCH /admin/attributes/:id
  router.patch('/admin/attributes/:id', requireAuthentication, requireAdmin, async (req, res) => {
    const id = positiveId(req.params.id);
    validateAllowedKeys(req.body, ['name']);

    const [attributes] = await db.execute('SELECT id, name FROM attributes WHERE id = ?', [id]);
    if (!attributes || !attributes[0]) {
      throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    }

    if (req.body.name === undefined) {
      return res.json({ data: attributes[0] });
    }

    if (typeof req.body.name !== 'string') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Attribute name must be a string.');
    }

    const trimmed = req.body.name.trim();
    if (!trimmed || trimmed.length > 50) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Attribute name must be between 1 and 50 characters.',
      );
    }

    if (trimmed !== attributes[0].name) {
      const [duplicate] = await db.execute('SELECT id FROM attributes WHERE name = ? AND id != ?', [
        trimmed,
        id,
      ]);
      if (duplicate && duplicate.length > 0) {
        throw new ApiError(
          409,
          'ATTRIBUTE_NAME_EXISTS',
          'An attribute with this name already exists.',
        );
      }
    }

    try {
      await db.execute('UPDATE attributes SET name = ? WHERE id = ?', [trimmed, id]);
      res.json({
        data: {
          id,
          name: trimmed,
        },
      });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
        throw new ApiError(
          409,
          'ATTRIBUTE_NAME_EXISTS',
          'An attribute with this name already exists.',
        );
      }
      throw err;
    }
  });

  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------

  // GET /admin/products
  router.get('/admin/products', requireAuthentication, requireAdmin, async (req, res) => {
    const [products] = await db.query(
      `SELECT id, name, description, sku, brand, currency, is_active AS isActive, is_legacy AS isLegacy
       FROM products ORDER BY id DESC`,
    );
    const fullProducts = [];
    for (const p of products || []) {
      const full = await fetchFullProduct(db, p.id);
      if (full) fullProducts.push(full);
    }
    res.json({ data: fullProducts });
  });

  // GET /admin/products/:id
  router.get('/admin/products/:id', requireAuthentication, requireAdmin, async (req, res) => {
    const id = positiveId(req.params.id);
    const product = await fetchFullProduct(db, id);
    if (!product) {
      throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    }
    res.json({ data: product });
  });

  // POST /admin/products
  router.post('/admin/products', requireAuthentication, requireAdmin, async (req, res) => {
    validateAllowedKeys(req.body, ['sku', 'name', 'description', 'brand', 'categoryIds']);

    const sku = typeof req.body.sku === 'string' ? req.body.sku.trim().toUpperCase() : '';
    if (!sku || sku.length > 60) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'SKU is required (1-60 characters).');
    }

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 150) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Product name is required (1-150 characters).');
    }

    let description = '';
    if (req.body.description !== undefined) {
      if (typeof req.body.description !== 'string') {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Description must be a string.');
      }
      description = req.body.description.trim();
      if (description.length > 5000) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Description cannot exceed 5000 characters.');
      }
    }

    let brand = '';
    if (req.body.brand !== undefined) {
      if (typeof req.body.brand !== 'string') {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Brand must be a string.');
      }
      brand = req.body.brand.trim();
      if (brand.length > 100) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Brand cannot exceed 100 characters.');
      }
    }

    const categoryIds = req.body.categoryIds || [];
    if (!Array.isArray(categoryIds)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'categoryIds must be an array.');
    }
    const cleanCategoryIds = [];
    const seenCatIds = new Set();
    for (const cid of categoryIds) {
      const numId = Number(cid);
      if (!Number.isSafeInteger(numId) || numId <= 0) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Each categoryId must be a positive integer.');
      }
      if (seenCatIds.has(numId)) {
        throw new ApiError(400, 'VALIDATION_ERROR', `Duplicate categoryId: ${numId}`);
      }
      seenCatIds.add(numId);
      cleanCategoryIds.push(numId);
    }

    // Check duplicate SKU
    const [existingSku] = await db.execute('SELECT id FROM products WHERE sku = ?', [sku]);
    if (existingSku && existingSku.length > 0) {
      throw new ApiError(409, 'SKU_EXISTS', 'A product with this SKU already exists.');
    }

    // Check referenced category existence
    for (const cid of cleanCategoryIds) {
      const [cat] = await db.execute('SELECT id FROM categories WHERE id = ?', [cid]);
      if (!cat || !cat.length) {
        throw new ApiError(404, 'NOT_FOUND', `Referenced category ${cid} not found.`);
      }
    }

    const [insertResult] = await db.execute(
      `INSERT INTO products (sku, name, description, brand, currency, is_active, is_legacy)
       VALUES (?, ?, ?, ?, 'USD', 0, 0)`,
      [sku, name, description, brand],
    );
    const productId = insertResult.insertId;

    for (const cid of cleanCategoryIds) {
      await db.execute('INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)', [
        productId,
        cid,
      ]);
    }

    const fullProduct = await fetchFullProduct(db, productId);
    res.status(201).json({ data: fullProduct });
  });

  // PATCH /admin/products/:id
  router.patch('/admin/products/:id', requireAuthentication, requireAdmin, async (req, res) => {
    const id = positiveId(req.params.id);
    validateAllowedKeys(req.body, ['sku', 'name', 'description', 'brand', 'categoryIds', 'isActive']);

    await withTransaction(db, async (conn) => {
      const [products] = await conn.execute(
        'SELECT id, sku, name, description, brand, is_active AS isActive FROM products WHERE id = ? FOR UPDATE',
        [id],
      );
      if (!products || !products[0]) {
        throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
      }
      const current = products[0];

      let updatedSku = current.sku;
      if (req.body.sku !== undefined) {
        if (typeof req.body.sku !== 'string') {
          throw new ApiError(400, 'VALIDATION_ERROR', 'SKU must be a string.');
        }
        const trimmed = req.body.sku.trim().toUpperCase();
        if (!trimmed || trimmed.length > 60) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'SKU must be between 1 and 60 characters.');
        }
        if (trimmed !== current.sku) {
          const [duplicate] = await conn.execute(
            'SELECT id FROM products WHERE sku = ? AND id != ?',
            [trimmed, id],
          );
          if (duplicate && duplicate.length > 0) {
            throw new ApiError(409, 'SKU_EXISTS', 'A product with this SKU already exists.');
          }
        }
        updatedSku = trimmed;
      }

      let updatedName = current.name;
      if (req.body.name !== undefined) {
        if (typeof req.body.name !== 'string') {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Name must be a string.');
        }
        const trimmed = req.body.name.trim();
        if (!trimmed || trimmed.length > 150) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Name must be between 1 and 150 characters.');
        }
        updatedName = trimmed;
      }

      let updatedDescription = current.description;
      if (req.body.description !== undefined) {
        if (typeof req.body.description !== 'string') {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Description must be a string.');
        }
        const trimmed = req.body.description.trim();
        if (trimmed.length > 5000) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Description cannot exceed 5000 characters.');
        }
        updatedDescription = trimmed;
      }

      let updatedBrand = current.brand;
      if (req.body.brand !== undefined) {
        if (typeof req.body.brand !== 'string') {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Brand must be a string.');
        }
        const trimmed = req.body.brand.trim();
        if (trimmed.length > 100) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Brand cannot exceed 100 characters.');
        }
        updatedBrand = trimmed;
      }

      const willBeActive =
        req.body.isActive !== undefined ? Boolean(req.body.isActive) : Boolean(current.isActive);

      if (req.body.categoryIds !== undefined) {
        if (!Array.isArray(req.body.categoryIds)) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'categoryIds must be an array.');
        }
        if (willBeActive && req.body.categoryIds.length === 0) {
          throw new ApiError(
            409,
            'CATEGORY_REQUIRED',
            'An active product must belong to at least one category.',
          );
        }
        const cleanCategoryIds = [];
        const seenCatIds = new Set();
        for (const cid of req.body.categoryIds) {
          const numId = Number(cid);
          if (!Number.isSafeInteger(numId) || numId <= 0) {
            throw new ApiError(
              400,
              'VALIDATION_ERROR',
              'Each categoryId must be a positive integer.',
            );
          }
          if (seenCatIds.has(numId)) {
            throw new ApiError(400, 'VALIDATION_ERROR', `Duplicate categoryId: ${numId}`);
          }
          seenCatIds.add(numId);
          cleanCategoryIds.push(numId);
        }
        for (const cid of cleanCategoryIds) {
          const [cat] = await conn.execute('SELECT id FROM categories WHERE id = ?', [cid]);
          if (!cat || !cat.length) {
            throw new ApiError(404, 'NOT_FOUND', `Referenced category ${cid} not found.`);
          }
        }

        await conn.execute('DELETE FROM product_categories WHERE product_id = ?', [id]);
        for (const cid of cleanCategoryIds) {
          await conn.execute(
            'INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)',
            [id, cid],
          );
        }
      }

      if (req.body.isActive !== undefined) {
        if (typeof req.body.isActive !== 'boolean') {
          throw new ApiError(400, 'VALIDATION_ERROR', 'isActive must be a boolean.');
        }
        await setProductActive(conn, id, req.body.isActive);
      }

      await conn.execute(
        'UPDATE products SET sku = ?, name = ?, description = ?, brand = ? WHERE id = ?',
        [updatedSku, updatedName, updatedDescription, updatedBrand, id],
      );
    });

    const fullProduct = await fetchFullProduct(db, id);
    res.json({ data: fullProduct });
  });

  // ---------------------------------------------------------------------------
  // Variants
  // ---------------------------------------------------------------------------

  // POST /admin/products/:id/variants
  router.post(
    '/admin/products/:id/variants',
    requireAuthentication,
    requireAdmin,
    async (req, res) => {
      const productId = positiveId(req.params.id);
      validateAllowedKeys(req.body, ['sku', 'name', 'price', 'attributeValues']);

      const [products] = await db.execute('SELECT id, name FROM products WHERE id = ?', [
        productId,
      ]);
      if (!products || !products[0]) {
        throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
      }

      const sku = typeof req.body.sku === 'string' ? req.body.sku.trim().toUpperCase() : '';
      if (!sku || sku.length > 60) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Variant SKU is required (1-60 characters).');
      }

      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name || name.length > 100) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Variant name is required (1-100 characters).');
      }

      const priceUnits = parseMoney(req.body.price);
      const formattedPrice = formatMoneyUnits(priceUnits);

      const attributeValues = req.body.attributeValues || [];
      const combinationKey = computeCombinationKey(attributeValues);

      // Validate referenced attribute IDs exist
      for (const attr of attributeValues) {
        const [attrRow] = await db.execute('SELECT id, name FROM attributes WHERE id = ?', [
          attr.attributeId,
        ]);
        if (!attrRow || !attrRow[0]) {
          throw new ApiError(404, 'NOT_FOUND', `Attribute ${attr.attributeId} not found.`);
        }
      }

      // Check duplicate variant SKU
      const [existingSku] = await db.execute('SELECT id FROM variants WHERE sku = ?', [sku]);
      if (existingSku && existingSku.length > 0) {
        throw new ApiError(409, 'SKU_EXISTS', 'A variant with this SKU already exists.');
      }

      // Check combination key uniqueness for this product
      const [existingComb] = await db.execute(
        'SELECT id FROM variants WHERE product_id = ? AND combination_key = ?',
        [productId, combinationKey],
      );
      if (existingComb && existingComb.length > 0) {
        throw new ApiError(
          409,
          'VARIANT_COMBINATION_EXISTS',
          'A variant with this attribute combination already exists for this product.',
        );
      }

      // First variant becomes default
      const [existingVariants] = await db.execute(
        'SELECT COUNT(*) AS count FROM variants WHERE product_id = ?',
        [productId],
      );
      const count = existingVariants[0]?.count || 0;
      const isDefault = count === 0 ? 1 : 0;

      const [insertResult] = await db.execute(
        `INSERT INTO variants (product_id, sku, name, price, stock, is_active, is_default, combination_key)
       VALUES (?, ?, ?, ?, 0, 1, ?, ?)`,
        [productId, sku, name, formattedPrice, isDefault, combinationKey],
      );
      const variantId = insertResult.insertId;

      for (const attr of attributeValues) {
        await db.execute(
          'INSERT INTO variant_attribute_values (variant_id, attribute_id, value) VALUES (?, ?, ?)',
          [variantId, attr.attributeId, attr.value.trim()],
        );
      }

      const fullProduct = await fetchFullProduct(db, productId);
      const createdVariant = fullProduct?.variants?.find((v) => v.id === variantId);
      res.status(201).json({ data: createdVariant });
    },
  );

  // PATCH /admin/variants/:id
  router.patch('/admin/variants/:id', requireAuthentication, requireAdmin, async (req, res) => {
    const variantId = positiveId(req.params.id);
    validateAllowedKeys(req.body, ['sku', 'name', 'price', 'attributeValues', 'isActive']);

    let productId;
    await withTransaction(db, async (conn) => {
      const [variants] = await conn.execute(
        'SELECT id, product_id AS productId, sku, name, price, combination_key AS combinationKey FROM variants WHERE id = ?',
        [variantId],
      );
      if (!variants || !variants[0]) {
        throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
      }
      const current = variants[0];
      productId = current.productId;

      let updatedSku = current.sku;
      if (req.body.sku !== undefined) {
        if (typeof req.body.sku !== 'string') {
          throw new ApiError(400, 'VALIDATION_ERROR', 'SKU must be a string.');
        }
        const trimmed = req.body.sku.trim().toUpperCase();
        if (!trimmed || trimmed.length > 60) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'SKU must be between 1 and 60 characters.');
        }
        if (trimmed !== current.sku) {
          const [duplicate] = await conn.execute('SELECT id FROM variants WHERE sku = ? AND id != ?', [
            trimmed,
            variantId,
          ]);
          if (duplicate && duplicate.length > 0) {
            throw new ApiError(409, 'SKU_EXISTS', 'A variant with this SKU already exists.');
          }
        }
        updatedSku = trimmed;
      }

      let updatedName = current.name;
      if (req.body.name !== undefined) {
        if (typeof req.body.name !== 'string') {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Name must be a string.');
        }
        const trimmed = req.body.name.trim();
        if (!trimmed || trimmed.length > 100) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Name must be between 1 and 100 characters.');
        }
        updatedName = trimmed;
      }

      let updatedPrice = current.price;
      if (req.body.price !== undefined) {
        const priceUnits = parseMoney(req.body.price);
        updatedPrice = formatMoneyUnits(priceUnits);
      }

      let updatedCombKey = current.combinationKey;
      if (req.body.attributeValues !== undefined) {
        const combinationKey = computeCombinationKey(req.body.attributeValues);
        if (combinationKey !== current.combinationKey) {
          const [duplicate] = await conn.execute(
            'SELECT id FROM variants WHERE product_id = ? AND combination_key = ? AND id != ?',
            [productId, combinationKey, variantId],
          );
          if (duplicate && duplicate.length > 0) {
            throw new ApiError(
              409,
              'VARIANT_COMBINATION_EXISTS',
              'A variant with this attribute combination already exists for this product.',
            );
          }
        }
        updatedCombKey = combinationKey;

        for (const attr of req.body.attributeValues) {
          const [attrRow] = await conn.execute('SELECT id FROM attributes WHERE id = ?', [
            attr.attributeId,
          ]);
          if (!attrRow || !attrRow[0]) {
            throw new ApiError(404, 'NOT_FOUND', `Attribute ${attr.attributeId} not found.`);
          }
        }

        await conn.execute('DELETE FROM variant_attribute_values WHERE variant_id = ?', [variantId]);
        for (const attr of req.body.attributeValues) {
          await conn.execute(
            'INSERT INTO variant_attribute_values (variant_id, attribute_id, value) VALUES (?, ?, ?)',
            [variantId, attr.attributeId, attr.value.trim()],
          );
        }
      }

      if (req.body.isActive !== undefined) {
        if (typeof req.body.isActive !== 'boolean') {
          throw new ApiError(400, 'VALIDATION_ERROR', 'isActive must be a boolean.');
        }
        await setVariantActive(conn, variantId, req.body.isActive);
      }

      await conn.execute(
        'UPDATE variants SET sku = ?, name = ?, price = ?, combination_key = ? WHERE id = ?',
        [updatedSku, updatedName, updatedPrice, updatedCombKey, variantId],
      );
    });

    const fullProduct = await fetchFullProduct(db, productId);
    const updatedVariant = fullProduct?.variants?.find((v) => v.id === variantId);
    res.json({ data: updatedVariant });
  });

  // ---------------------------------------------------------------------------
  // Default variant & Activation Controls
  // ---------------------------------------------------------------------------

  // PUT /admin/products/:id/default-variant and PATCH /admin/products/:id/default-variant
  const handleSetDefaultVariant = async (req, res) => {
    const id = positiveId(req.params.id);
    validateAllowedKeys(req.body, ['variantId']);
    const variantId = positiveId(req.body.variantId);

    await withTransaction(db, async (conn) => {
      await setDefaultVariant(conn, id, variantId);
    });

    const fullProduct = await fetchFullProduct(db, id);
    res.json({ data: fullProduct });
  };
  router.put(
    '/admin/products/:id/default-variant',
    requireAuthentication,
    requireAdmin,
    handleSetDefaultVariant,
  );
  router.patch(
    '/admin/products/:id/default-variant',
    requireAuthentication,
    requireAdmin,
    handleSetDefaultVariant,
  );

  // PATCH /admin/products/:id/active and PUT /admin/products/:id/active
  const handleSetProductActive = async (req, res) => {
    const id = positiveId(req.params.id);
    validateAllowedKeys(req.body, ['isActive']);
    if (typeof req.body.isActive !== 'boolean') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'isActive must be a boolean.');
    }

    await withTransaction(db, async (conn) => {
      await setProductActive(conn, id, req.body.isActive);
    });

    const fullProduct = await fetchFullProduct(db, id);
    res.json({ data: fullProduct });
  };
  router.patch(
    '/admin/products/:id/active',
    requireAuthentication,
    requireAdmin,
    handleSetProductActive,
  );
  router.put(
    '/admin/products/:id/active',
    requireAuthentication,
    requireAdmin,
    handleSetProductActive,
  );

  // PATCH /admin/variants/:id/active and PUT /admin/variants/:id/active
  const handleSetVariantActive = async (req, res) => {
    const variantId = positiveId(req.params.id);
    validateAllowedKeys(req.body, ['isActive']);
    if (typeof req.body.isActive !== 'boolean') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'isActive must be a boolean.');
    }

    let productId;
    await withTransaction(db, async (conn) => {
      const [variants] = await conn.execute(
        'SELECT product_id AS productId FROM variants WHERE id = ?',
        [variantId],
      );
      if (!variants || !variants[0]) {
        throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
      }
      productId = variants[0].productId;
      await setVariantActive(conn, variantId, req.body.isActive);
    });

    const fullProduct = await fetchFullProduct(db, productId);
    const updatedVariant = fullProduct?.variants?.find((v) => v.id === variantId);
    res.json({ data: updatedVariant });
  };
  router.patch(
    '/admin/variants/:id/active',
    requireAuthentication,
    requireAdmin,
    handleSetVariantActive,
  );
  router.put(
    '/admin/variants/:id/active',
    requireAuthentication,
    requireAdmin,
    handleSetVariantActive,
  );

  return router;
}
