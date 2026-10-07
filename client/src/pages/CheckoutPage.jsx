import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { pendingAttempt } from '../utils/interactions.js';
import { api } from '../api.js';
import { formatMoney } from '../utils/format.js';

import { attemptPolicy } from '../utils/attempt-policy.js';
import { postAttempt } from '../utils/post-attempt.js';

export function CheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const saved = pendingAttempt(sessionStorage, 'brightbuy:checkout:' + user.id);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [fulfillment, setFulfillment] = useState('delivery');
  const [addressId, setAddressId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [simulationToken, setSimulationToken] = useState('demo-approved');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(() => saved.read());
  const [needsResolution, setNeedsResolution] = useState(false);
  const pending = useRef(attempt);
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setLoadError('');
    Promise.all(['/cart', '/addresses', '/stores', '/cities'].map((path) =>
      api(path, { signal: controller.signal })))
      .then(([cart, addresses, stores, cities]) => {
        if (controller.signal.aborted) return;
        const activeCities = new Set(cities.map((city) => city.id));
        const usable = addresses.filter((address) =>
          address.country === 'US' && activeCities.has(address.cityId));
        setData({ cart, addresses: usable, stores });
        setAddressId(String(pending.current?.addressId || (usable.find((a) => a.isDefault) || usable[0])?.id || ''));
        if (pending.current) {
          setFulfillment(pending.current.fulfillment);
          setPaymentMethod(pending.current.paymentMethod);
          setSimulationToken(pending.current.simulationToken || 'demo-approved');
          setConsent(true);
        }
        setStoreId(String(pending.current?.storeId || stores[0]?.id || ''));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      });
    return () => controller.abort();
  }, [revision]);

  async function submit(event) {
    event.preventDefault();
    if (inFlight.current || needsResolution) return;
    if (!pending.current) {
      if (!data?.cart.items.length || data.cart.items.some((item) => !item.available) ||
          !consent || !(fulfillment === 'delivery' ? addressId : storeId)) return;
      const payload = Object.freeze({
        fulfillment,
        ...(fulfillment === 'delivery' ? { addressId: Number(addressId) } : { storeId: Number(storeId) }),
        paymentMethod,
        ...(paymentMethod === 'card' ? { simulationToken } : {}),
        cartVersion: data.cart.version,
        requestKey: crypto.randomUUID(),
      });
      try { saved.save(payload); } catch (error) { setMessage(error.message); return; }
      pending.current = payload;
      setAttempt(payload);
    }
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      const order = await postAttempt(api, '/orders', pending.current);
      if (!Number.isInteger(order?.id) || order.id < 1) {
        throw Object.assign(new Error('Invalid order response.'), { code: 'INVALID_RESPONSE' });
      }
      saved.clear();
      pending.current = null;
      setAttempt(null);
      navigate(`/account/orders/${order.id}`);
    } catch (error) {
      const policy = attemptPolicy(error);
      if (policy === 'review') {
        saved.clear();
      pending.current = null;
        setAttempt(null);
        setConsent(false);
        setMessage(`${error.message} Review the form before making a new attempt.`);
        setRevision((value) => value + 1);
      } else if (policy === 'resolve') {
        setNeedsResolution(true);
        setMessage(`${error.message} Check My orders and resolve this conflict before starting another checkout.`);
      } else {
        // Includes network/invalid-response/5xx/retryable transaction failures.
        // Do not generate a new UUID because the server may already have committed.
        setMessage(`${error.message} Use Retry same attempt. Do not start another checkout.`);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!data) return <section>
    <h1>Checkout</h1>
    {message && <p role="alert">{message}</p>}
    {loadError ? <><p role="alert">{loadError}</p>
      <button onClick={() => setRevision((value) => value + 1)}>Reload checkout</button></>
      : <p>Loading checkout…</p>}
  </section>;
  const blocked = !data.cart.items.length || data.cart.items.some((item) => !item.available);
  return <section className="checkout card">
    <h1>Checkout</h1>
    <p>Simulated classroom checkout. No real card is charged.</p>
    {!data.cart.items.length && <p>Your cart is empty. <Link to="/">Browse products</Link></p>}
    {data.cart.items.map((item) => <div className="variant" key={item.variantId}>
      <span>{item.productName} · {item.variantName} × {item.quantity}
        {!item.available && <strong> — unavailable; remove from cart</strong>}</span>
      <span>{formatMoney(item.lineTotal, data.cart.currency)}</span>
    </div>)}
    <p><strong>Current total: {formatMoney(data.cart.total, data.cart.currency)}</strong></p>
    {data.cart.hasShortage && <p role="status">At least one line is short of stock.
      The whole order may be backordered, with no stock allocated yet.</p>}
    <p>The server rechecks current prices and stock when you submit. Taxes, discounts
      and delivery charges are zero in this project.</p>
    {attempt && <p role="status">A saved checkout attempt is pending. Retry it to confirm the result using its original details.</p>}
    {message && <p className="error" role="alert">{message}</p>}
    <form onSubmit={submit}>
      <fieldset disabled={busy || Boolean(attempt)}>
        <legend>Destination and payment</legend>
        <label>Fulfilment
          <select value={fulfillment} onChange={(event) => setFulfillment(event.target.value)}>
            <option value="delivery">Standard delivery</option><option value="pickup">Store pickup</option>
          </select>
        </label>
        {fulfillment === 'delivery' ? <label>Delivery address
          <select required value={addressId} onChange={(event) => setAddressId(event.target.value)}>
            <option value="">Choose a supported address</option>
            {data.addresses.map((a) => <option key={a.id} value={a.id}>
              {a.recipient} — {a.line1}, {a.city}</option>)}
          </select>
        </label> : <label>Pickup store
          <select required value={storeId} onChange={(event) => setStoreId(event.target.value)}>
            <option value="">Choose a store</option>
            {data.stores.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.addressLine}</option>)}
          </select>
        </label>}
        <label>Payment method
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
            <option value="cod">Cash on delivery / collection</option>
            <option value="card">Simulated card payment</option>
          </select>
        </label>
        {paymentMethod === 'card' && <label>Classroom simulation result
          <select value={simulationToken} onChange={(event) => setSimulationToken(event.target.value)}>
            <option value="demo-approved">Approve simulated payment</option>
            <option value="demo-declined">Decline simulated payment</option>
          </select>
        </label>}
        <label className="checkout-consent">
          <input type="checkbox" checked={consent} required
            onChange={(event) => setConsent(event.target.checked)} />
          I accept the current-price check and understand that any shortage makes
          the whole order a backorder. Approved simulated card orders are recorded
          as prepaid even when backordered.
        </label>
      </fieldset>
      <button disabled={busy || needsResolution || (!attempt && blocked)}>
        {needsResolution ? 'Resolve the issue before continuing' : busy ? 'Submitting…' : attempt ? 'Retry same attempt' : 'Place order'}
      </button>
    </form>
    <p><Link to="/account/addresses">Manage addresses</Link> · <Link to="/cart">Review cart</Link></p>
    <p>Pending attempts are saved for this account in this browser tab. Return here after signing in to retry the same attempt, or check <Link to="/account/orders">My orders</Link>.</p>
  </section>;
}
