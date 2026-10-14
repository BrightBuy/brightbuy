import { Router } from 'express';
import { ApiError } from '../errors.js';
// Per-process IP protection, plus a database-backed 60-second per-account cooldown.
export function createRecoveryRoutes(recovery) {
  const router = Router();
  const requests = new Map();
  router.use('/auth', (req,res,next) => {
    if (!['/register','/forgot-password','/resend-verification','/verify-email','/reset-password'].includes(req.path)) return next();
    const now = Date.now();
    for (const [key,value] of requests) if (value.until <= now) requests.delete(key);
    const key = req.ip;
    const entry = requests.get(key) || {count:0,until:now+15*60*1000};
    requests.set(key,entry);
    res.set('Cache-Control','no-store');
    if (++entry.count > 20) throw new ApiError(429,'TOO_MANY_REQUESTS','Too many attempts. Please try again in 15 minutes.');
    next();
  });
  for (const [path,purpose] of [['forgot-password','reset'],['resend-verification','verify']]) {
    router.post('/auth/'+path, (req,res) => {
      const email = req.body?.email;
      if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new ApiError(400,'VALIDATION_ERROR','Enter a valid email address.');
      // Always respond before account lookup / SMTP to avoid disclosing account existence.
      res.status(202).json({data:{message:'If this account is eligible, we will email a link shortly. Check your inbox and spam folder.'}});
      recovery.request(email.trim().toLowerCase(),purpose).catch(() => console.error('[Email] Account link could not be delivered. Check email configuration.'));
    });
  }
  for (const [path,purpose] of [['verify-email','verify'],['reset-password','reset']]) {
    router.post('/auth/'+path, async (req,res) => {
      await recovery.consume(req.body?.token,purpose,req.body?.password);
      res.json({data:{message:purpose === 'verify' ? 'Email verified. You can now sign in.' : 'Password updated. Sign in with your new password.'}});
    });
  }
  return router;
}
