import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useData } from '../hooks/useData.js';
import { DataState } from '../components/DataState.jsx';
import { formatMoney, statusLabel } from '../utils/format.js';
import { api } from '../api.js';
import { postAttempt } from '../utils/post-attempt.js';
import { attemptPolicy } from '../utils/attempt-policy.js';
import { calendarDate, trackingStatus, canCancel, isOverdue } from '../utils/order-tracking.js';
import './OrderDetailPage.css';

function utcTime(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Unavailable';
  return (
    new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(value)) + ' UTC'
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const state = useData(`/orders/${id}`);
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [attempt, setAttempt] = useState(null);
  const [success, setSuccess] = useState('');
  const storageKey = `brightbuy:cancel:${user.id}:${id}`;
  useEffect(() => {
    setError('');
    setSuccess('');
    setReason('');
    setAttempt(null);
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey));
      if (saved && typeof saved.requestKey === 'string' && typeof saved.reason === 'string') {
        setAttempt(saved);
        setReason(saved.reason);
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  async function cancel(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const payload = attempt || { requestKey: crypto.randomUUID(), reason: reason.trim() };
      // Persist before sending so an uncertain result can replay the same action.
      sessionStorage.setItem(storageKey, JSON.stringify(payload));
      setAttempt(payload);
      await postAttempt(
        api,
        `${user.role === 'admin' ? '/admin' : ''}/orders/${id}/cancel`,
        payload,
      );
      sessionStorage.removeItem(storageKey);
      setAttempt(null);
      setReason('');
      setSuccess('Order cancelled. Payment and stock changes are recorded.');
      state.reload();
    } catch (failure) {
      const retry = attemptPolicy(failure) === 'retry';
      setError(
        failure.message + (retry ? ' Retry the same cancellation to confirm its result.' : ''),
      );
      if (!retry) {
        sessionStorage.removeItem(storageKey);
        setAttempt(null);
      }
      state.reload();
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
      {success && <p role="status">{success}</p>}
      <DataState state={state}>
        {(order) => {
          const destination = order.delivery?.destinationSnapshot || order.addressSnapshot;
          const pickup = order.fulfillment === 'pickup';
          return (
            <article className="card">
              <p>
                <span className="badge">{trackingStatus(order.status)}</span> ·{' '}
                {pickup ? 'Store pickup' : 'Delivery'}
              </p>
              <p>Placed {utcTime(order.createdAt)}</p>
              {order.isLegacy && (
                <p className="order-notice">
                  Legacy sample; delivery/payment tracking unavailable. Historical order details are
                  shown below.
                </p>
              )}
              {!order.isLegacy && (
                <>
                  {order.status === 'cancelled' && (
                    <p className="order-notice">
                      This order is cancelled. No further delivery or pickup is expected.
                    </p>
                  )}
                  {order.status === 'backordered' && (
                    <p className="order-notice">
                      Waiting for stock. The original estimate does not guarantee that stock has
                      arrived.
                    </p>
                  )}
                  {order.wasOutOfStock && order.status !== 'backordered' && (
                    <p>
                      This order had a stock shortage when placed. Its original estimate is
                      retained.
                    </p>
                  )}
                  {isOverdue(order) && (
                    <p className="order-notice">
                      The original {pickup ? 'pickup ready' : 'delivery'} estimate has passed. This
                      order is still unfinished.
                    </p>
                  )}
                </>
              )}
              <div className="order-tracking-grid">
                <section aria-label="Destination">
                  <h2>{pickup ? 'Pickup destination' : 'Delivery address'}</h2>
                  {destination ? (
                    <>
                      {pickup ? (
                        <>
                          <p>{destination.storeName || 'Pickup store unavailable'}</p>
                          <p>{destination.addressLine || 'Address unavailable'}</p>
                        </>
                      ) : (
                        <>
                          <p>{destination.recipient}</p>
                          <p>
                            {[destination.line1, destination.line2, destination.line3]
                              .filter(Boolean)
                              .join(', ')}
                          </p>
                        </>
                      )}
                      <p>
                        {[destination.city, destination.postalCode, destination.country]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    </>
                  ) : (
                    <p>Destination unavailable.</p>
                  )}
                  {order.delivery && (
                    <>
                      <p>
                        {order.status === 'cancelled'
                          ? 'Original estimate'
                          : pickup
                            ? 'Estimated ready date'
                            : 'Estimated delivery date'}
                        : <strong>{calendarDate(order.delivery.estimatedDate)}</strong>
                      </p>
                      <p>
                        {pickup ? 'Collected date' : 'Delivered date'}:{' '}
                        {order.delivery.actualDate
                          ? calendarDate(order.delivery.actualDate)
                          : order.status === 'cancelled'
                            ? 'Not applicable'
                            : 'Not yet recorded'}
                      </p>
                      <p>Estimates use calendar days, including weekends and public holidays.</p>
                    </>
                  )}
                </section>
                <section aria-label="Payment">
                  <h2>Payment</h2>
                  {order.payment ? (
                    <>
                      <p>
                        {order.payment.method === 'cod'
                          ? 'Cash on delivery / collection'
                          : 'Simulated card'}{' '}
                        · <strong>{statusLabel(order.payment.status)}</strong>
                      </p>
                      <p>
                        Original amount: {formatMoney(order.payment.amount, order.payment.currency)}
                      </p>
                      {order.payment.reference && <p>Reference: {order.payment.reference}</p>}
                      {order.payment.paidAt && <p>Paid: {utcTime(order.payment.paidAt)}</p>}
                      {order.payment.refundedAt && (
                        <p>Refunded: {utcTime(order.payment.refundedAt)}</p>
                      )}
                      {order.payment.status === 'void' && (
                        <p>No payment is due for this cancelled order.</p>
                      )}
                    </>
                  ) : (
                    <p>Payment tracking unavailable.</p>
                  )}
                </section>
              </div>
              <h2>Items</h2>
              {order.items.map((item) => (
                <div className="variant" key={item.id}>
                  <span>
                    {item.productName} · {item.variantName} × {item.quantity}
                  </span>
                  <span>{formatMoney(item.unitPrice, order.currency)} each</span>
                </div>
              ))}
              <h2>Total: {formatMoney(order.total, order.currency)}</h2>
              {!order.isLegacy && (
                <section aria-label="Status history">
                  <h2>Status history</h2>
                  <ol className="order-history">
                    {order.history.map((event, index) => (
                      <li key={`${event.createdAt}:${index}`}>
                        <strong>
                          {event.fromStatus ? `${trackingStatus(event.fromStatus)} → ` : ''}
                          {trackingStatus(event.toStatus)}
                        </strong>
                        <time dateTime={event.createdAt}>{utcTime(event.createdAt)}</time>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              {(canCancel(order) || attempt) && (
                <form className="order-cancel" onSubmit={cancel}>
                  <h2>Cancel order</h2>
                  <p>
                    Cancellation is available before processing. Simulated card payments are
                    refunded; pending cash payments are voided.
                  </p>
                  <label>
                    Cancellation reason
                    <input
                      required
                      maxLength={200}
                      value={reason}
                      disabled={busy || Boolean(attempt)}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  <button disabled={busy || !reason.trim()}>
                    {busy
                      ? 'Cancelling…'
                      : attempt
                        ? 'Retry same cancellation'
                        : 'Confirm cancellation'}
                  </button>
                </form>
              )}
              {user.role === 'admin' && !order.isLegacy && (
                <p>
                  Use the fulfilment workflow for stock allocation and delivery/pickup completion.
                </p>
              )}
            </article>
          );
        }}
      </DataState>
    </>
  );
}
