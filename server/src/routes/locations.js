import { Router } from 'express';
import { ApiError, positiveId } from '../errors.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  listCities,
  listStores,
  createCity,
  updateCity,
  createStore,
  updateStore,
} from '../services/location-management.js';

function locationId(value) {
  const id = positiveId(value);
  if (id > 4294967295)
    throw new ApiError(400, 'VALIDATION_ERROR', 'ID is outside the supported range.');
  return id;
}

function queryFilter(req, allowed) {
  const query = new URL(req.originalUrl, 'http://localhost').searchParams;
  for (const key of query.keys()) {
    if (!allowed.includes(key) || query.getAll(key).length !== 1) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Unsupported or repeated query parameter.');
    }
  }
  return query.has('cityId') ? locationId(query.get('cityId')) : undefined;
}

function bodyData(body, entity, { partial = false } = {}) {
  const fields =
    entity === 'city'
      ? ['name', 'isMainCity', 'isActive']
      : ['name', 'cityId', 'addressLine', 'isActive'];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }
  const keys = Object.keys(body);
  if (
    !keys.length ||
    keys.some((key) => !fields.includes(key)) ||
    (!partial && fields.some((key) => !Object.hasOwn(body, key)))
  ) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide only the required location fields.');
  }
  const data = {};
  for (const key of keys) {
    const value = body[key];
    if (key === 'isMainCity' || key === 'isActive') {
      if (typeof value !== 'boolean')
        throw new ApiError(400, 'VALIDATION_ERROR', `${key} must be a boolean.`);
      data[key] = value;
    } else if (key === 'cityId') {
      if (!Number.isInteger(value))
        throw new ApiError(400, 'VALIDATION_ERROR', 'cityId must be an integer.');
      data[key] = locationId(value);
    } else {
      const maximum = key === 'name' ? 100 : 250;
      if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > maximum) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          `${key} must contain 1 to ${maximum} characters.`,
        );
      }
      data[key] = value.trim();
    }
  }
  return data;
}

export function createLocationRoutes(db, requireAuthentication) {
  const router = Router();
  router.get('/cities', async (req, res) => {
    queryFilter(req, []);
    res.json({ data: await listCities(db) });
  });
  router.get('/stores', async (req, res) => {
    const cityId = queryFilter(req, ['cityId']);
    res.json({ data: await listStores(db, { cityId }) });
  });
  router.get('/admin/cities', requireAuthentication, requireAdmin, async (req, res) => {
    queryFilter(req, []);
    res.json({ data: await listCities(db, { admin: true }) });
  });
  router.get('/admin/stores', requireAuthentication, requireAdmin, async (req, res) => {
    const cityId = queryFilter(req, ['cityId']);
    res.json({ data: await listStores(db, { admin: true, cityId }) });
  });
  router.post('/admin/cities', requireAuthentication, requireAdmin, async (req, res) => {
    queryFilter(req, []);
    res.status(201).json({ data: await createCity(db, bodyData(req.body, 'city')) });
  });
  router.patch('/admin/cities/:id', requireAuthentication, requireAdmin, async (req, res) => {
    queryFilter(req, []);
    res.json({
      data: await updateCity(
        db,
        locationId(req.params.id),
        bodyData(req.body, 'city', { partial: true }),
      ),
    });
  });
  router.post('/admin/stores', requireAuthentication, requireAdmin, async (req, res) => {
    queryFilter(req, []);
    res.status(201).json({ data: await createStore(db, bodyData(req.body, 'store')) });
  });
  router.patch('/admin/stores/:id', requireAuthentication, requireAdmin, async (req, res) => {
    queryFilter(req, []);
    res.json({
      data: await updateStore(
        db,
        locationId(req.params.id),
        bodyData(req.body, 'store', { partial: true }),
      ),
    });
  });
  return router;
}
