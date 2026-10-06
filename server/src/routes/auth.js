import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from '../errors.js';
import { hashPassword, verifyPassword } from '../password.js';
import { TOKEN_OPTIONS } from '../middleware/auth.js';

export function createAuthRoutes(db, secret, requireAuthentication) {
  const router = Router();

  router.post('/auth/register', async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
    }

    const { firstName, lastName, email, password, phoneNumber, role, staffRole, customerId } = req.body;

    // Reject security injection attempts
    if (role !== undefined || staffRole !== undefined || customerId !== undefined) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Cannot specify role or customer ID during registration.');
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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof email !== 'string' || !email.trim() || email.length > 254 || !emailRegex.test(email.trim())) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Valid email address is required (maximum 254 characters).');
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Password must be between 8 and 128 characters.');
    }

    let phone = null;
    if (phoneNumber !== undefined && phoneNumber !== null) {
      if (typeof phoneNumber !== 'string' || phoneNumber.length > 30) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Phone number must be a string (maximum 30 characters).');
      }
      phone = phoneNumber.trim() || null;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check unique email conflict
    const [existing] = await db.execute('SELECT id FROM customers WHERE email = ?', [normalizedEmail]);
    if (existing.length > 0) {
      throw new ApiError(409, 'EMAIL_EXISTS', 'An account with this email address already exists.');
    }

    // Hash password BEFORE acquiring locks or database operations
    const passwordHash = await hashPassword(password);

    let insertId;
    let registeredAt = new Date().toISOString();

    try {
      const [result] = await db.execute(
        `INSERT INTO customers (first_name, last_name, name, email, password_hash, phone_number, role)
         VALUES (?, ?, ?, ?, ?, ?, 'customer')`,
        [firstName.trim(), lastName.trim(), combinedName, normalizedEmail, passwordHash, phone],
      );
      insertId = result.insertId;

      const [freshRow] = await db.execute(
        'SELECT registered_at FROM customers WHERE id = ?',
        [insertId],
      );
      if (freshRow.length && freshRow[0].registered_at) {
        registeredAt = new Date(freshRow[0].registered_at).toISOString();
      }
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
        throw new ApiError(409, 'EMAIL_EXISTS', 'An account with this email address already exists.');
      }
      throw err;
    }

    res.status(201).json({
      data: {
        id: insertId,
        name: combinedName,
        email: normalizedEmail,
        role: 'customer',
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: phone,
        registeredAt,
      },
    });
  });

  router.post('/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (
      typeof email !== 'string' ||
      !email.trim() ||
      email.length > 254 ||
      typeof password !== 'string' ||
      !password ||
      password.length > 128
    ) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Provide an email and password (maximum 128 characters).',
      );
    }
    const [users] = await db.execute(
      `SELECT id, name, email, role, password_hash,
              first_name AS firstName, last_name AS lastName,
              phone_number AS phoneNumber, registered_at AS registeredAt
       FROM customers WHERE email = ?`,
      [email.trim().toLowerCase()],
    );
    const user = users[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    const { id, name, role, firstName, lastName, phoneNumber, registeredAt } = user;
    const accessToken = jwt.sign({ role }, secret, {
      algorithm: 'HS256',
      subject: String(id),
      issuer: TOKEN_OPTIONS.issuer,
      audience: TOKEN_OPTIONS.audience,
      expiresIn: '1h',
    });
    res.set('Cache-Control', 'no-store');
    res.json({
      data: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: {
          id,
          name,
          email: user.email,
          role,
          firstName: firstName || null,
          lastName: lastName || null,
          phoneNumber: phoneNumber || null,
          registeredAt: registeredAt ? new Date(registeredAt).toISOString() : null,
        },
      },
    });
  });

  router.get('/auth/me', requireAuthentication, (req, res) => res.json({ data: req.user }));

  return router;
}
