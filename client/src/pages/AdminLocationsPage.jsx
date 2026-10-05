import React, { useState } from 'react';
import { api } from '../api.js';
import { useData } from '../hooks/useData.js';
import { DataState } from '../components/DataState.jsx';
import './AdminLocationsPage.css';

const blankCity = () => ({ name: '', isMainCity: false, isActive: true });
const blankStore = () => ({ name: '', cityId: '', addressLine: '', isActive: true });

export function AdminLocationsPage() {
  const cities = useData('/admin/cities');
  const stores = useData('/admin/stores');
  const [cityForm, setCityForm] = useState(blankCity);
  const [storeForm, setStoreForm] = useState(blankStore);
  const [busyCity, setBusyCity] = useState(false);
  const [busyStore, setBusyStore] = useState(false);
  const [cityError, setCityError] = useState('');
  const [storeError, setStoreError] = useState('');
  const [message, setMessage] = useState('');
  const cityRows = cities.data || [];
  const selectedCity = cityRows.find((city) => city.id === Number(storeForm.cityId));

  async function saveCity(event) {
    event.preventDefault();
    setBusyCity(true);
    setCityError('');
    setMessage('');
    try {
      await api(`/admin/cities${cityForm.id ? `/${cityForm.id}` : ''}`, {
        method: cityForm.id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: cityForm.name.trim(),
          isMainCity: cityForm.isMainCity,
          isActive: cityForm.isActive,
        }),
      });
      setCityForm(blankCity());
      cities.reload();
      stores.reload();
      setMessage('City saved.');
    } catch (error) {
      setCityError(error.message);
    } finally {
      setBusyCity(false);
    }
  }
  async function saveStore(event) {
    event.preventDefault();
    setBusyStore(true);
    setStoreError('');
    setMessage('');
    try {
      const body = {
        name: storeForm.name.trim(),
        addressLine: storeForm.addressLine.trim(),
        isActive: storeForm.isActive,
      };
      // Leave an unchanged city out of a PATCH so an inactive store can be edited.
      if (!storeForm.id || Number(storeForm.cityId) !== storeForm.originalCityId)
        body.cityId = Number(storeForm.cityId);
      await api(`/admin/stores${storeForm.id ? `/${storeForm.id}` : ''}`, {
        method: storeForm.id ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      setStoreForm(blankStore());
      stores.reload();
      setMessage('Pickup store saved.');
    } catch (error) {
      setStoreError(error.message);
    } finally {
      setBusyStore(false);
    }
  }

  return (
    <div className="locations-page">
      <p className="eyebrow">STORE ADMINISTRATION</p>
      <h1>Cities and pickup stores</h1>
      <p className="intro">
        Manage supported Texas destinations. Main cities have a base estimate of 5 calendar days;
        other cities have 7. A shortage adds 3 days. Deactivation affects new orders; existing order
        destinations and estimates are preserved.
      </p>
      {message && (
        <p role="status" className="locations-success">
          {message}
        </p>
      )}
      <section aria-labelledby="cities-title">
        <h2 id="cities-title">Supported cities</h2>
        <div className="locations-grid">
          <div>
            <DataState state={cities}>
              {(rows) =>
                rows.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>City</th>
                          <th>Classification</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((city) => (
                          <tr key={city.id}>
                            <td>{city.name}</td>
                            <td>
                              {city.isMainCity ? 'Main city (5 days)' : 'Other city (7 days)'}
                            </td>
                            <td>{city.isActive ? 'Active' : 'Inactive'}</td>
                            <td>
                              <button
                                type="button"
                                className="secondary"
                                disabled={busyCity}
                                aria-label={`Edit city ${city.name}`}
                                onClick={() => {
                                  setCityForm({ ...city });
                                  setCityError('');
                                  setMessage('');
                                }}
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>No cities yet. Create a supported city to get started.</p>
                )
              }
            </DataState>
          </div>
          <form className="card" onSubmit={saveCity} aria-label="City form">
            <h3>{cityForm.id ? `Edit ${cityForm.name || 'city'}` : 'Create city'}</h3>
            {cityError && (
              <p role="alert" className="error">
                {cityError}
              </p>
            )}
            <fieldset disabled={busyCity}>
              <label>
                City name
                <input
                  required
                  maxLength={100}
                  value={cityForm.name}
                  onChange={(event) => setCityForm({ ...cityForm, name: event.target.value })}
                />
              </label>
              <label className="locations-check">
                <input
                  type="checkbox"
                  checked={cityForm.isMainCity}
                  onChange={(event) =>
                    setCityForm({ ...cityForm, isMainCity: event.target.checked })
                  }
                />
                Main city
              </label>
              <label className="locations-check">
                <input
                  type="checkbox"
                  checked={cityForm.isActive}
                  onChange={(event) => setCityForm({ ...cityForm, isActive: event.target.checked })}
                />
                Active for new orders
              </label>
              <p className="locations-note">
                An inactive city also hides its pickup stores from new checkout selections.
              </p>
              <div className="actions">
                <button type="submit">
                  {busyCity ? 'Saving...' : cityForm.id ? 'Save city' : 'Create city'}
                </button>
                {cityForm.id && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setCityForm(blankCity());
                      setCityError('');
                    }}
                  >
                    Cancel city edit
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        </div>
      </section>
      <section aria-labelledby="stores-title">
        <h2 id="stores-title">Pickup stores</h2>
        <p>
          Stores are pickup destinations. Stock remains centralized rather than belonging to
          individual stores.
        </p>
        <div className="locations-grid">
          <div>
            <DataState state={stores}>
              {(rows) =>
                rows.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Store and address</th>
                          <th>City</th>
                          <th>Eligibility</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((store) => {
                          const city = cityRows.find((row) => row.id === store.cityId);
                          return (
                            <tr key={store.id}>
                              <td>
                                <strong>{store.name}</strong>
                                <small>{store.addressLine}</small>
                              </td>
                              <td>{store.cityName}</td>
                              <td>
                                {!store.isActive
                                  ? 'Store inactive'
                                  : cities.loading
                                    ? 'Checking city...'
                                    : cities.error
                                      ? 'City status unavailable'
                                      : city?.isActive
                                        ? 'Available'
                                        : 'City inactive'}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="secondary"
                                  disabled={busyStore || cities.loading || Boolean(cities.error)}
                                  aria-label={`Edit store ${store.name}`}
                                  onClick={() => {
                                    setStoreForm({ ...store, originalCityId: store.cityId });
                                    setStoreError('');
                                    setMessage('');
                                  }}
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>No pickup stores yet.</p>
                )
              }
            </DataState>
          </div>
          <form className="card" onSubmit={saveStore} aria-label="Pickup store form">
            <h3>{storeForm.id ? `Edit ${storeForm.name || 'store'}` : 'Create pickup store'}</h3>
            {storeError && (
              <p role="alert" className="error">
                {storeError}
              </p>
            )}
            <fieldset
              disabled={busyStore || cities.loading || Boolean(cities.error) || !cityRows.length}
            >
              <label>
                Store name
                <input
                  required
                  maxLength={100}
                  value={storeForm.name}
                  onChange={(event) => setStoreForm({ ...storeForm, name: event.target.value })}
                />
              </label>
              <label>
                City
                <select
                  required
                  value={storeForm.cityId}
                  onChange={(event) => setStoreForm({ ...storeForm, cityId: event.target.value })}
                >
                  <option value="">Select a city</option>
                  {cityRows.map((city) => (
                    <option
                      key={city.id}
                      value={city.id}
                      disabled={!city.isActive && city.id !== storeForm.originalCityId}
                    >
                      {city.name}
                      {!city.isActive ? ' (inactive)' : city.isMainCity ? ' (main city)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pickup address
                <input
                  required
                  maxLength={250}
                  value={storeForm.addressLine}
                  onChange={(event) =>
                    setStoreForm({ ...storeForm, addressLine: event.target.value })
                  }
                />
              </label>
              <label className="locations-check">
                <input
                  type="checkbox"
                  checked={storeForm.isActive}
                  onChange={(event) =>
                    setStoreForm({ ...storeForm, isActive: event.target.checked })
                  }
                />
                Store active
              </label>
              {selectedCity && !selectedCity.isActive && (
                <p className="locations-note">
                  This city is inactive. Disable the store or select an active city before making it
                  available.
                </p>
              )}
              <div className="actions">
                <button type="submit">
                  {busyStore ? 'Saving...' : storeForm.id ? 'Save store' : 'Create pickup store'}
                </button>
                {storeForm.id && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setStoreForm(blankStore());
                      setStoreError('');
                    }}
                  >
                    Cancel store edit
                  </button>
                )}
              </div>
            </fieldset>
            {!cities.loading && !cities.error && !cityRows.length && (
              <p>Create an active city before adding a pickup store.</p>
            )}
          </form>
        </div>
      </section>
    </div>
  );
}
