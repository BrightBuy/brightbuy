import { Router } from 'express';
import { ApiError } from '../errors.js';
import { requireAdmin, USER_FIELDS } from '../middleware/auth.js';
import {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from '../services/addresses.js';

export function createAccountRoutes(db, requireAuthentication) {
  const router = Router();

  // Profile update
  router.patch('/account/profile', requireAuthentication, async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
    }

    const { firstName, lastName, phoneNumber, email, password, role, id } = req.body;

    // Disallow altering security/identity parameters on profile patch
    if (email !== undefined || password !== undefined || role !== undefined || id !== undefined) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Email, password, role, or ID cannot be changed via profile update.');
    }

    if (typeof firstName !== 'string' || !firstName.trim() || firstName.trim().length > 50) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'First name is required (maximum 50 characters).');
    }
    if (typeof lastName !== 'string' || !lastName.trim() || lastName.trim().length > 50) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Last name is required (maximum 50 characters).');
    }

    const combinedName = `${firstName.trim()} ${lastName.trim()}`;
    if (combinedName.length > 100) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Combined name must not exceed 100 characters.');
    }

    let phone = null;
    if (phoneNumber !== undefined && phoneNumber !== null) {
      if (typeof phoneNumber !== 'string' || phoneNumber.length > 30) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Phone number must be a string (maximum 30 characters).');
      }
      phone = phoneNumber.trim() || null;
    }

    await db.execute(
      `UPDATE customers
       SET first_name = ?, last_name = ?, name = ?, phone_number = ?
       WHERE id = ?`,
      [firstName.trim(), lastName.trim(), combinedName, phone, req.user.id],
    );

    const [updatedUsers] = await db.execute(
      `SELECT ${USER_FIELDS} FROM customers WHERE id = ?`,
      [req.user.id],
    );
    const user = updatedUsers[0];

    const mappedUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      phoneNumber: user.phoneNumber || null,
      registeredAt: user.registeredAt ? new Date(user.registeredAt).toISOString() : null,
    };

    res.json({ data: mappedUser });
  });

  // Addresses endpoints
  router.get('/addresses', requireAuthentication, async (req, res) => {
    const addresses = await getAddresses(db, req.user.id);
    res.json({ data: addresses });
  });

  router.post('/addresses', requireAuthentication, async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
    }

    if (req.body.customerId !== undefined) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Cannot override address customerId.');
    }

    const address = await createAddress(db, req.user.id, req.body);
    res.status(201).json({ data: address });
  });

  router.put('/addresses/:id', requireAuthentication, async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
    }

    if (req.body.customerId !== undefined) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Cannot override address customerId.');
    }

    const address = await updateAddress(db, req.user.id, req.params.id, req.body);
    res.json({ data: address });
  });

  router.put('/addresses/:id/default', requireAuthentication, async (req, res) => {
    const address = await setDefaultAddress(db, req.user.id, req.params.id);
    res.json({ data: address });
  });

  router.delete('/addresses/:id', requireAuthentication, async (req, res) => {
    const result = await deleteAddress(db, req.user.id, req.params.id);
    res.json({ data: result });
  });

  router.get('/admin/customers', requireAuthentication, requireAdmin, async (req, res) => {
    const [customers] = await db.query(
      `SELECT ${USER_FIELDS} FROM customers WHERE role = 'customer' ORDER BY id`,
    );
    const mapped = customers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      role: c.role,
      firstName: c.firstName || null,
      lastName: c.lastName || null,
      phoneNumber: c.phoneNumber || null,
      registeredAt: c.registeredAt ? new Date(c.registeredAt).toISOString() : null,
    }));
    res.json({ data: mapped });
  });

  return router;
}
