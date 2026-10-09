import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { api } from '../api.js';

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const [cities, setCities] = useState([]);
  useEffect(() => { const controller = new AbortController(); api('/cities', { signal: controller.signal }).then(setCities).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, []);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
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

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must have at least 8 characters, a letter and a number.');
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
          phoneNumber,
          address: { recipient: `${firstName} ${lastName}`, line1: form.get('line1'), line2: form.get('line2'), cityId: Number(form.get('cityId')), postalCode: form.get('postalCode') },
        }),
      });
      // Navigate to login after successful registration
      navigate('/login', { state: { registered: true, email, from: location.state?.from } });
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
          <input name="phoneNumber" type="tel" required autoComplete="tel" maxLength={30} placeholder="e.g. 555-0100" />
        </label>
        <fieldset><legend>Your delivery address</legend>
          <label>Street address *<input name="line1" autoComplete="address-line1" maxLength={200} required /></label>
          <label>Apartment or suite<input name="line2" autoComplete="address-line2" maxLength={200} /></label>
          <div className="form-pair"><label>Texas city *<select name="cityId" required defaultValue=""><option value="">Choose a city</option>{cities.map(city => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
          <label>Postal code *<input name="postalCode" autoComplete="postal-code" maxLength={20} required /></label></div>
        </fieldset>
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
        Already have an account? <Link to="/login" state={{ from: location.state?.from }}>Sign in here</Link>.
      </p>
    </section>
  );
}
