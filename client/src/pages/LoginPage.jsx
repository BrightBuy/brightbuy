import { guestCart } from '../utils/guest-cart.js';
import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { returnPath } from '../utils/interactions.js';
import { useAuth } from '../auth/AuthProvider.jsx';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(Boolean(location.state?.registered));
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNeedsVerification(false);
    const form = new FormData(event.currentTarget);
    try {
      const user = await login(form.get('email'), form.get('password'));
      navigate(returnPath(user.role === 'customer' && guestCart().read().items.length ? '/cart' : location.state?.from, user.role), { replace: true });
    } catch (error) {
      setError(error.message);
      setNeedsVerification(error.code === 'EMAIL_NOT_VERIFIED');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="login card">
      <p className="eyebrow">WELCOME BACK</p>
      <h1>Sign in</h1>
      {location.state?.registered && <p role="status">{location.state.verificationEmailSent === false
        ? 'Your account was created, but we could not send the verification email. Use Resend verification email below to try again.'
        : 'Account created. Check your email to verify your account before signing in.'}</p>}
      <form onSubmit={submit}>
        <label>
          Email
          <input name="email" onChange={() => setNeedsVerification(false)} defaultValue={location.state?.email || ''} type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {needsVerification && <p>Didn’t receive the email? <Link to="/resend-verification">Resend verification email</Link></p>}
        <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p><Link to="/forgot-password">Forgot password?</Link></p>
      <p>New to BrightBuy? <Link to="/register" state={{ from: location.state?.from }}>Create an account</Link>.</p><p>Demo accounts and setup instructions are in the project README.</p>
    </section>
  );
}
