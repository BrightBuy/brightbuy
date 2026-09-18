import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from '../errors.js';
import { verifyPassword } from '../password.js';
import { TOKEN_OPTIONS } from '../middleware/auth.js';

export function createAuthRoutes(db, secret, requireAuthentication) {
  const router = Router();
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
      'SELECT id, name, email, role, password_hash FROM customers WHERE email = ?',
      [email.trim().toLowerCase()],
    );
    const user = users[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    const { id, name, role } = user;
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
        user: { id, name, email: user.email, role },
      },
    });
  });
  router.get('/auth/me', requireAuthentication, (req, res) => res.json({ data: req.user }));
  return router;
}
