import React from 'react';
import { useData } from '../hooks/useData.js';
import { DataState } from '../components/DataState.jsx';

export function AddressesPage() {
  const state = useData('/addresses');
  return (
    <>
      <h1>My addresses</h1>
      <DataState state={state}>
        {(rows) =>
          rows.length ? (
            <div className="grid">
              {rows.map((address) => (
                <address className="card" key={address.id}>
                  <strong>{address.recipient}</strong>
                  <p>
                    {address.line1}
                    <br />
                    {address.city} {address.postalCode}
                    <br />
                    {address.country}
                  </p>
                </address>
              ))}
            </div>
          ) : (
            <p>No saved addresses.</p>
          )
        }
      </DataState>
    </>
  );
}
