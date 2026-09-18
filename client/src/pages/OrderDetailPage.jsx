import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useData } from '../hooks/useData.js';
import { DataState } from '../components/DataState.jsx';
import { formatMoney, statusLabel } from '../utils/format.js';
import { api } from '../api.js';

export function OrderDetailPage() {
  const { id } = useParams();
  const state = useData(`/orders/${id}`);
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function changeStatus(status) {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      state.reload();
    } catch (error) {
      setError(error.message);
      // Show the latest status if another administrator changed the order.
      if (error.status === 409) state.reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Order #{id}</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <DataState state={state}>
        {(order) => (
          <article className="card">
            <p>
              <span className="badge">{statusLabel(order.status)}</span> · {order.fulfillment}
            </p>
            <p>{new Date(order.createdAt).toLocaleString()}</p>
            {order.addressSnapshot && (
              <p>
                Deliver to: {order.addressSnapshot.recipient}, {order.addressSnapshot.line1},{' '}
                {order.addressSnapshot.city}, {order.addressSnapshot.postalCode}
              </p>
            )}
            {order.items.map((item) => (
              <div className="variant" key={item.id}>
                <span>
                  {item.productName} · {item.variantName} × {item.quantity}
                </span>
                <span>{formatMoney(item.unitPrice, order.currency)} each</span>
              </div>
            ))}
            <h2>Total: {formatMoney(order.total, order.currency)}</h2>
            {user.role === 'admin' && (
              <div className="actions">
                {order.nextStatuses.map((status) => (
                  <button key={status} disabled={busy} onClick={() => changeStatus(status)}>
                    Mark {statusLabel(status)}
                  </button>
                ))}
              </div>
            )}
          </article>
        )}
      </DataState>
    </>
  );
}
