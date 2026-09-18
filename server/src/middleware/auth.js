import jwt from 'jsonwebtoken';
import { ApiError } from '../errors.js';

export const USER_FIELDS = 'id, name, email, role';
export const TOKEN_OPTIONS = {
  algorithms: ['HS256'],
  issuer: 'brightbuy',
  audience: 'brightbuy-web',
};

export function createAuthMiddleware(db, secret) {
  return async function requireAuthentication(req, res, next) {
    // HTTP authentication scheme names are case-insensitive.
    const token = /^Bearer (\S+)$/i.exec(req.headers.authorization || '')?.[1];
    let claims;
    try {
      claims = jwt.verify(token, secret, TOKEN_OPTIONS);
      // Reject invalid subjects before SQL binding: undefined would cause a 500.
      if (
        typeof claims.sub !== 'string' ||
        !/^[1-9]\d*$/.test(claims.sub) ||
        !Number.isSafeInteger(Number(claims.sub)) ||
        !Number.isFinite(claims.exp)
      ) {
        throw new Error('Invalid token claims.');
      }
    } catch {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    }
    const [users] = await db.execute(`SELECT ${USER_FIELDS} FROM customers WHERE id = ?`, [
      claims.sub,
    ]);
    if (!users[0]) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    // Read the current database role so role changes take effect immediately.
    req.user = users[0];
    res.set('Cache-Control', 'no-store');
    next();
  };
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin')
    throw new ApiError(403, 'FORBIDDEN', 'Administrator access required.');
  next();
}
