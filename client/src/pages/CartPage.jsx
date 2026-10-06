import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { api } from '../api.js';

export function CartPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingVariant, setPendingVariant] = useState(null);

  const loadCart = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api('/cart');
      setCart(result);
    } catch (err) {
      setError(err.message || 'Failed to load cart.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'customer') {
      loadCart();
    } else {
      setLoading(false);
    }
  }, [user, loadCart]);

  async function updateQuantity(variantId, newQuantity) {
    if (newQuantity < 1 || newQuantity > 99) return;
    setPendingVariant(variantId);
    setError('');
    try {
      const updated = await api(`/cart/items/${variantId}`, {
        method: 'PUT',
        body: JSON.stringify({ quantity: newQuantity }),
      });
      setCart(updated);
    } catch (err) {
      setError(err.message || 'Failed to update item quantity.');
      await loadCart();
    } finally {
      setPendingVariant(null);
    }
  }

  async function removeItem(variantId) {
    setPendingVariant(variantId);
    setError('');
    try {
      const updated = await api(`/cart/items/${variantId}`, {
        method: 'DELETE',
      });
      setCart(updated);
    } catch (err) {
      setError(err.message || 'Failed to remove item.');
      await loadCart();
    } finally {
      setPendingVariant(null);
    }
  }

  async function clearCart() {
    if (!window.confirm('Are you sure you want to clear your cart?')) return;
    setLoading(true);
    try {
      const updated = await api('/cart', { method: 'DELETE' });
      setCart(updated);
    } catch (err) {
      setError(err.message || 'Failed to clear cart.');
    } finally {
      setLoading(false);
    }
  }

  if (user && user.role !== 'customer') {
    return (
      <section className="card" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
        <p className="eyebrow">ADMINISTRATOR NOTICE</p>
        <h1>Customer Cart Only</h1>
        <p>Persistent carts are for customer accounts. Administrator accounts cannot place orders.</p>
        <button onClick={() => navigate('/admin')} style={{ marginTop: '1rem' }}>
          Go to Admin Overview
        </button>
      </section>
    );
  }

  if (loading) return <p>Loading your cart…</p>;
  if (error && !cart) return <p className="error" role="alert">{error}</p>;

  const items = cart?.items || [];
  const isEmpty = items.length === 0;

  const hasUnavailableItems = items.some(item => !item.available);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>Shopping Cart</h1>
        {!isEmpty && (
          <button onClick={clearCart} className="button secondary" style={{ color: '#dc2626' }}>
            Clear Cart
          </button>
        )}
      </div>

      {error && (
        <p className="error" role="alert" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      {cart?.hasShortage && (
        <div style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b', padding: '1rem', borderRadius: '4px', marginBottom: '1.5rem' }}>
          <strong>Notice:</strong> One or more items in your cart exceed current stock levels. This order may be backordered upon submission.
        </div>
      )}

      {isEmpty ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <h2>Your cart is empty</h2>
          <p style={{ color: '#64748b', margin: '1rem 0' }}>Explore our catalogue to add items to your cart.</p>
          <Link to="/products" className="button" style={{ display: 'inline-block', textDecoration: 'none' }}>
            Browse Products
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {items.map((item) => {
              const isPending = pendingVariant === item.variantId;
              return (
                <div
                  key={item.variantId}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    opacity: isPending ? 0.6 : 1,
                    borderLeft: !item.available ? '4px solid #ef4444' : item.shortage ? '4px solid #f59e0b' : '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{item.productName}</h3>
                      <p style={{ margin: '0.25rem 0', color: '#64748b', fontSize: '0.9rem' }}>
                        Variant: {item.variantName} | SKU: {item.sku}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: '1.1rem' }}>${item.lineTotal}</strong>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                        ({item.unitPrice} each)
                      </p>
                    </div>
                  </div>

                  {!item.available && (
                    <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: 0 }}>
                      ⛔ {item.unavailableReason || 'Variant is unavailable for purchase.'}
                    </p>
                  )}

                  {item.shortage && item.available && (
                    <p style={{ color: '#d97706', fontSize: '0.85rem', margin: 0 }}>
                      ⚠️ Order may be backordered (Requested: {item.quantity}, Stock: {item.stock})
                    </p>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.9rem', margin: 0 }}>Quantity:</label>
                      <button
                        className="button secondary"
                        disabled={isPending || item.quantity <= 1}
                        onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                        style={{ padding: '0.2rem 0.6rem' }}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={item.quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (val >= 1 && val <= 99) updateQuantity(item.variantId, val);
                        }}
                        disabled={isPending}
                        style={{ width: '60px', textAlign: 'center', padding: '0.25rem' }}
                      />
                      <button
                        className="button secondary"
                        disabled={isPending || item.quantity >= 99}
                        onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                        style={{ padding: '0.2rem 0.6rem' }}
                      >
                        +
                      </button>
                    </div>

                    <button
                      onClick={() => removeItem(item.variantId)}
                      className="button secondary"
                      disabled={isPending}
                      style={{ color: '#dc2626', fontSize: '0.85rem', padding: '0.25rem 0.5rem' }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <div className="card" style={{ position: 'sticky', top: '1rem' }}>
              <h2>Order Summary</h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '1rem 0', fontSize: '1.2rem' }}>
                <span>Subtotal:</span>
                <strong>${cart?.total} USD</strong>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0.5rem 0' }}>
                Cart Version: {cart?.version}
              </p>

              <button
                onClick={() => navigate('/checkout')}
                className="button"
                disabled={hasUnavailableItems}
                style={{
                  width: '100%',
                  marginTop: '1rem',
                  padding: '0.75rem',
                  opacity: hasUnavailableItems ? 0.5 : 1,
                  cursor: hasUnavailableItems ? 'not-allowed' : 'pointer'
                }}
              >
                {hasUnavailableItems ? 'Remove unavailable items to proceed' : 'Proceed to Checkout'}
              </button>

              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '1rem', textAlign: 'center' }}>
                Final prices and stock levels are verified at checkout submission.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}