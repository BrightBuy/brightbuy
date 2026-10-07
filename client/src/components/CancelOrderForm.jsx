import React, { useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { pendingAttempt } from '../utils/interactions.js';
import { api } from '../api.js';
import { attemptPolicy } from '../utils/attempt-policy.js';
import { postAttempt } from '../utils/post-attempt.js';

export function CancelOrderForm({ orderId, admin = false, onSuccess }) {
  const { user } = useAuth();
  const saved = pendingAttempt(sessionStorage, 'brightbuy:cancel:' + user.id + ':' + orderId);
  const [attempt, setAttempt] = useState(() => saved.read());
  const [reason, setReason] = useState(attempt?.reason || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [needsResolution, setNeedsResolution] = useState(false);
  const pending = useRef(attempt);
  const inFlight = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (inFlight.current || needsResolution) return;
    if (!pending.current) {
      if (!reason.trim() || reason.trim().length > 200) return;
      try { pending.current = saved.save({ requestKey: crypto.randomUUID(), reason: reason.trim() }); }
      catch (error) { setMessage(error.message); return; }
      setAttempt(pending.current);
    }
    setBusy(true);
    inFlight.current = true;
    setMessage('');
    try {
      const result = await postAttempt(api, `${admin ? '/admin' : ''}/orders/${orderId}/cancel`, pending.current);
      if (result?.id !== orderId || result.status !== 'cancelled') {
        throw Object.assign(new Error('Invalid cancellation response.'), { code: 'INVALID_RESPONSE' });
      }
      saved.clear();
      pending.current = null;
      setAttempt(null);
      onSuccess();
    } catch (error) {
      const policy = attemptPolicy(error);
      if (policy === 'review') { saved.clear(); pending.current = null; setAttempt(null); }
      if (policy === 'resolve') setNeedsResolution(true);
      setMessage(policy === 'retry' ? `${error.message} Retry this same cancellation.`
        : policy === 'resolve' ? `${error.message} Reload the order and resolve the conflict before another action.`
        : error.message);
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <form onSubmit={submit}>
    <p>Cancelling restores allocated stock and records a simulated refund or COD void.</p>
    <label>Reason for cancellation
      <input value={reason} maxLength={200} required disabled={busy || Boolean(attempt)}
        onChange={(event) => setReason(event.target.value)} />
    </label>
    {message && <p role="alert">{message}</p>}
    <button disabled={busy || needsResolution}>{needsResolution ? 'Resolve conflict first' : busy ? 'Cancelling…' : attempt ? 'Retry cancellation' : 'Confirm cancellation'}</button>
  </form>;
}
