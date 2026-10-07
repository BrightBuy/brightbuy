import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';

export function RegisterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);

    const firstName = form.get('firstName')?.toString().trim();
    const lastName = form.get('lastName')?.toString().trim();
    const email = form.get('email')?.toString().trim();
    const phoneNumber = form.get('phoneNumber')?.toString().trim();
    const password = form.get('password')?.toString();
    const confirmPassword = form.get('confirmPassword')?.toString();

    if (!firstName || !lastName || !email || !password) {
      setError('Please fill in all required fields.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);

    try {
      await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          password,
          phoneNumber: phoneNumber || undefined,
        }),
      });
      // Navigate to login after successful registration
      navigate('/login', { state: { registered: true, email } });
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="login card">
      <p className="eyebrow">NEW CUSTOMER</p>
      <h1>Create account</h1>
      <form onSubmit={submit}>
        <div className="form-pair">
          <label>
            First Name *
            <input name="firstName" type="text" maxLength={50} required />
          </label>
          <label>
            Last Name *
            <input name="lastName" type="text" maxLength={50} required />
          </label>
        </div>
        <label>
          Email *
          <input name="email" type="email" autoComplete="email" maxLength={254} required />
        </label>
        <label>
          Phone Number
          <input name="phoneNumber" type="tel" maxLength={30} placeholder="e.g. 555-0100" />
        </label>
        <label>
          Password *
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
        </label>
        <label>
          Confirm Password *
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy}>{busy ? 'Creating account…' : 'Register'}</button>
      </form>
      <p>
        Already have an account? <Link to="/login">Sign in here</Link>.
      </p>
    </section>
  );
}
