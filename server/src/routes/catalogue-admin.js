import { Router } from 'express';
import { ApiError, positiveId } from '../errors.js';
import { requireAdmin } from '../middleware/auth.js';

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

  return router;
}
