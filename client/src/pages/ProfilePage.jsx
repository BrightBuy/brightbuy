import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { api } from '../api.js';
import { formatCentralDate } from '../utils/date-time.js';

export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setPhoneNumber(user.phoneNumber || '');
    }
  }, [user]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required.');
      return;
    }

    setBusy(true);
    try {
      const result = await api('/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phoneNumber: phoneNumber.trim() || null,
        }),
      });
      updateUser(result);
      setSuccess('Profile updated successfully.');
    } catch (err) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <p>Loading profile…</p>;

  return (
    <section className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <p className="eyebrow">ACCOUNT</p>
      <h1>Profile Details</h1>

      <div style={{ marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '6px' }}>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Account Role:</strong> <span className="badge">{user.role}</span></p>
        {user.registeredAt && (
          <p><strong>Member Since (Central Time):</strong> {formatCentralDate(user.registeredAt)}</p>
        )}
      </div>

      <form onSubmit={submit}>
        <div className="form-pair">
          <label>
            First Name *
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={50}
              required
            />
          </label>
          <label>
            Last Name *
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={50}
              required
            />
          </label>
        </div>

        <label>
          Phone Number
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            maxLength={30}
            placeholder="e.g. 555-0100"
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p style={{ color: '#16a34a', fontWeight: 500, margin: '0.5rem 0' }} role="status">
            {success}
          </p>
        )}

        <button disabled={busy}>{busy ? 'Saving…' : 'Save Profile'}</button>
      </form>
    </section>
  );
}
