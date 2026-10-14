import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { api } from '../api.js';
export function AccountRecoveryPage({mode}) {
  const { logout } = useAuth();
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  useEffect(() => { window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search); }, []);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [done,setDone] = useState(false);
  const request = mode === 'forgot-password' || mode === 'resend-verification';
  const reset = mode === 'reset-password';
  const title = {'forgot-password':'Forgot your password?', 'resend-verification':'Resend verification', 'verify-email':'Verify your email', 'reset-password':'Choose a new password'}[mode];
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    setError(''); setMessage('');
    if (reset && form.get('password') !== form.get('confirmPassword')) {setError('Passwords do not match.');return;}
    setBusy(true);
    try {
      const result = await api('/auth/'+mode,{method:'POST',body:JSON.stringify(request ? {email:form.get('email')} : {token,...(reset ? {password:form.get('password')} : {})})});
      if (reset) logout();
      setMessage(result.message); setDone(true);
    } catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  return <section className="login card"><p className="eyebrow">YOUR BRIGHTBUY ACCOUNT</p><h1>{title}</h1>
    <p>{request ? 'Enter the email address you used to create your account. We will send you a secure link.' : reset ? 'Use 8–128 characters, including a letter and a number.' : 'Confirm your email address to finish setting up your account.'}</p>
    {!request && !token ? <p role="alert">This link is missing its verification code. Open the link from your email or request a new one.</p> : !done && <form onSubmit={submit}>
      {request && <label>Email<input type="email" name="email" autoComplete="email" maxLength={254} required /></label>}
      {reset && <><label>New password<input type="password" name="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label><label>Confirm password<input type="password" name="confirmPassword" autoComplete="new-password" minLength={8} maxLength={128} required /></label></>}
      <button disabled={busy}>{busy ? 'Please wait…' : request ? 'Send email link' : reset ? 'Update password' : 'Verify email'}</button>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <p><Link to="/login">Back to sign in</Link></p>
    {!request && <p><Link to={reset ? '/forgot-password' : '/resend-verification'}>Request a new link</Link></p>}
  </section>;
}
