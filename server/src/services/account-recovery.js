import { randomBytes, createHash } from 'node:crypto';
import { ApiError } from '../errors.js';
import { hashPassword } from '../password.js';
import { inTransaction } from '../utils/transaction.js';
import { accountLink, buildAccountEmail } from './account-email.js';
import { sendAccountEmail } from './email.js';
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
const invalid = () => new ApiError(400, 'INVALID_ACCOUNT_LINK', 'This link is invalid, expired or already used. Please request a new link.');
export function makeAccountRecovery(db, {send = sendAccountEmail, appUrl = process.env.PUBLIC_APP_URL} = {}) {
  return {
    async request(email, purpose) {
      const token = randomBytes(32).toString('hex');
      const link = accountLink(purpose, token, appUrl);
      const recipient = await inTransaction(db, async connection => {
        const [users] = await connection.execute('SELECT id, name, email, email_verified FROM customers WHERE email = ? FOR UPDATE', [email]);
        const user = users[0];
        if (!user || (purpose === 'verify' && user.email_verified)) return null;
        const [recent] = await connection.execute('SELECT customer_id FROM account_tokens WHERE customer_id=? AND purpose=? AND created_at > UTC_TIMESTAMP() - INTERVAL 60 SECOND', [user.id,purpose]);
        if (recent.length) return null;
        await connection.execute('DELETE FROM account_tokens WHERE customer_id=? AND purpose=?', [user.id,purpose]);
        await connection.execute('INSERT INTO account_tokens (customer_id,purpose,token_hash,expires_at,created_at) VALUES (?,?,?,TIMESTAMPADD(MINUTE,?,UTC_TIMESTAMP()),UTC_TIMESTAMP())', [user.id,purpose,tokenHash(token),purpose === 'verify' ? 1440 : 30]);
        return user;
      });
      if (recipient) {
        try { await send({to:recipient.email,...buildAccountEmail({purpose,name:recipient.name,link})}); }
        catch (error) {
          await db.execute('DELETE FROM account_tokens WHERE token_hash=?', [tokenHash(token)]);
          throw error;
        }
      }
    },
    async consume(token, purpose, password) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw invalid();
      if (purpose === 'reset' && (typeof password !== 'string' || password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))) throw new ApiError(400,'VALIDATION_ERROR','Password must be 8–128 characters and include a letter and a number.');
      const hash = tokenHash(token);
      const [candidates] = await db.execute('SELECT customer_id FROM account_tokens WHERE token_hash=? AND purpose=? AND expires_at > UTC_TIMESTAMP()', [hash,purpose]);
      if (!candidates.length) throw invalid();
      const passwordHash = purpose === 'reset' ? await hashPassword(password) : null;
      await inTransaction(db, async connection => {
        const id = candidates[0].customer_id;
        // Match the lock order used when issuing links, including concurrent resets.
        await connection.execute('SELECT id FROM customers WHERE id=? FOR UPDATE', [id]);
        const [tokens] = await connection.execute('SELECT customer_id FROM account_tokens WHERE token_hash=? AND purpose=? AND expires_at > UTC_TIMESTAMP() FOR UPDATE', [hash,purpose]);
        if (!tokens.length) throw invalid();
        if (purpose === 'verify') await connection.execute('UPDATE customers SET email_verified=1 WHERE id=?', [id]);
        else await connection.execute('UPDATE customers SET password_hash=?, auth_version=auth_version+1 WHERE id=?', [passwordHash,id]);
        await connection.execute('DELETE FROM account_tokens WHERE customer_id=? AND purpose=?', [id,purpose]);
      });
    },
  };
}
