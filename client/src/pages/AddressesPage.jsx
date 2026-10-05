import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';

export function AddressesPage() {
  const [addresses, setAddresses] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form state
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [recipient, setRecipient] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [line3, setLine3] = useState('');
  const [cityId, setCityId] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [addrRes, cityRes] = await Promise.all([
        api('/addresses'),
        api('/cities').catch(() => []), // Fallback if cities endpoint unavailable
      ]);
      setAddresses(addrRes || []);
      setCities((cityRes || []).filter((c) => c.isActive !== false));
      if (cityRes && cityRes.length > 0 && !cityId) {
        const activeCities = cityRes.filter((c) => c.isActive !== false);
        if (activeCities.length > 0) setCityId(String(activeCities[0].id));
      }
    } catch (err) {
      setError(err.message || 'Failed to load addresses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function resetForm() {
    setIsEditing(false);
    setEditingId(null);
    setRecipient('');
    setLine1('');
    setLine2('');
    setLine3('');
    if (cities.length > 0) setCityId(String(cities[0].id));
    setPostalCode('');
    setIsDefault(false);
    setFormError('');
  }

  function startAdd() {
    resetForm();
    setIsEditing(true);
  }

  function startEdit(addr) {
    setIsEditing(true);
    setEditingId(addr.id);
    setRecipient(addr.recipient || '');
    setLine1(addr.line1 || '');
    setLine2(addr.line2 || '');
    setLine3(addr.line3 || '');
    setCityId(addr.cityId ? String(addr.cityId) : cities[0] ? String(cities[0].id) : '');
    setPostalCode(addr.postalCode || '');
    setIsDefault(Boolean(addr.isDefault));
    setFormError('');
  }

  async function handleSave(event) {
    event.preventDefault();
    setFormError('');
    setBusy(true);

    const payload = {
      recipient: recipient.trim(),
      line1: line1.trim(),
      line2: line2.trim(),
      line3: line3.trim(),
      cityId: Number(cityId),
      postalCode: postalCode.trim(),
      isDefault,
    };

    try {
      if (editingId) {
        await api(`/addresses/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/addresses', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      resetForm();
      await loadData();
    } catch (err) {
      setFormError(err.message || 'Failed to save address.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSetDefault(id) {
    try {
      await api(`/addresses/${id}/default`, { method: 'PUT' });
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to set default address.');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Are you sure you want to delete this address?')) return;
    try {
      await api(`/addresses/${id}`, { method: 'DELETE' });
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete address.');
    }
  }

  if (loading) return <p>Loading addresses…</p>;
  if (error) return <p className="error" role="alert">{error}</p>;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>Address Book</h1>
        {!isEditing && (
          <button onClick={startAdd} className="button">
            + Add New Address
          </button>
        )}
      </div>

      {isEditing && (
        <section className="card" style={{ marginBottom: '2rem', border: '2px solid #2563eb' }}>
          <h2>{editingId ? 'Edit Address' : 'Add New Address'}</h2>
          <form onSubmit={handleSave}>
            <label>
              Recipient Name *
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                maxLength={100}
                required
              />
            </label>

            <label>
              Address Line 1 *
              <input
                type="text"
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                maxLength={200}
                required
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <label>
                Address Line 2
                <input
                  type="text"
                  value={line2}
                  onChange={(e) => setLine2(e.target.value)}
                  maxLength={200}
                  placeholder="Apt, Suite, Unit"
                />
              </label>

              <label>
                Address Line 3
                <input
                  type="text"
                  value={line3}
                  onChange={(e) => setLine3(e.target.value)}
                  maxLength={200}
                  placeholder="Building, Landmark"
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
              <label>
                City *
                <select value={cityId} onChange={(e) => setCityId(e.target.value)} required>
                  <option value="" disabled>
                    Select a supported Texas city…
                  </option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Postal Code *
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  maxLength={20}
                  required
                />
              </label>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: '0.5rem 0' }}>
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              Set as default delivery address
            </label>

            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button disabled={busy}>{busy ? 'Saving…' : 'Save Address'}</button>
              <button type="button" className="button secondary" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {addresses.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p>No saved delivery addresses found.</p>
          {!isEditing && (
            <button onClick={startAdd} style={{ marginTop: '1rem' }}>
              Add Your First Address
            </button>
          )}
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {addresses.map((address) => (
            <address
              className="card"
              key={address.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justify: 'space-between',
                borderLeft: address.isDefault ? '4px solid #2563eb' : '1px solid #e2e8f0',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <strong>{address.recipient}</strong>
                  {address.isDefault && (
                    <span className="badge" style={{ background: '#dbeafe', color: '#1e40af' }}>
                      Default Address
                    </span>
                  )}
                </div>

                <p style={{ margin: 0, color: '#334155' }}>
                  {address.line1}
                  {address.line2 && <><br />{address.line2}</>}
                  {address.line3 && <><br />{address.line3}</>}
                  <br />
                  {address.cityName || address.city} {address.postalCode}
                  <br />
                  {address.country}
                </p>

                {!address.isEligible && (
                  <p style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                    ⚠️ Edit required: City unavailable or inactive for checkout.
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                {!address.isDefault && address.isEligible && (
                  <button
                    onClick={() => handleSetDefault(address.id)}
                    className="button secondary"
                    style={{ fontSize: '0.85rem', padding: '0.25rem 0.5rem' }}
                  >
                    Set as Default
                  </button>
                )}
                <button
                  onClick={() => startEdit(address)}
                  className="button secondary"
                  style={{ fontSize: '0.85rem', padding: '0.25rem 0.5rem' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(address.id)}
                  className="button secondary"
                  style={{ fontSize: '0.85rem', padding: '0.25rem 0.5rem', color: '#dc2626' }}
                >
                  Delete
                </button>
              </div>
            </address>
          ))}
        </div>
      )}
    </div>
  );
}
