import React from 'react';
import { useData } from '../hooks/useData.js';
import { DataState } from '../components/DataState.jsx';

export function CustomersPage() {
  const state = useData('/admin/customers');
  return (
    <>
      <h1>Customers</h1>
      <DataState state={state}>
        {(rows) =>
          rows.length ? (
            <div className="grid">
              {rows.map((customer) => (
                <article className="card" key={customer.id}>
                  <h2>{customer.name}</h2>
                  <p>{customer.email}</p>
                </article>
              ))}
            </div>
          ) : (
            <p>No customers yet.</p>
          )
        }
      </DataState>
    </>
  );
}
