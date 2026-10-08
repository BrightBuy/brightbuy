import { api } from '../api.js';
import React, { useState } from 'react';
import { useData } from '../hooks/useData.js';
import { DataState } from '../components/DataState.jsx';

export function CustomersPage() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  async function changeRole(id, role) { if (busy) return; setBusy(id); setError(''); try { await api('/admin/customers/'+id+'/role', { method: 'PATCH', body: JSON.stringify({ role }) }); state.reload(); } catch(e) { setError(e.message); } finally { setBusy(null); } }
  const state = useData('/admin/customers');
  return (
    <>
      <h1>Customers and warehouse staff</h1>{error && <p role="alert">{error}</p>}
      <DataState state={state}>
        {(rows) =>
          rows.length ? (
            <div className="grid">
              {rows.map((customer) => (
                <article className="card" key={customer.id}>
                  <h2>{customer.name}</h2>
                  <p>{customer.email}</p><label>Access<select aria-label={"Access for "+customer.name} value={customer.role} disabled={busy !== null} onChange={e=>changeRole(customer.id,e.target.value)}><option value="customer">Customer</option><option value="warehouse">Warehouse inventory staff</option></select></label>
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
