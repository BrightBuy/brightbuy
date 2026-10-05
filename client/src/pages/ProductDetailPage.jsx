import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useData } from '../hooks/useData.js';
import { DataState } from '../components/DataState.jsx';
import { formatMoney } from '../utils/format.js';
import { useAuth } from '../auth/AuthProvider.jsx';

// Shows full product detail: description, brand, categories, variant selector,
// price, SKU, attributes and stock. Zero stock shows "Available to backorder"
// per the project policy — we never block adding to cart solely on stock.
export function ProductDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const state = useData(`/products/${id}`);

  return (
    <DataState state={state}>
      {(product) => <ProductDetail product={product} user={user} navigate={navigate} />}
    </DataState>
  );
}

function ProductDetail({ product, user, navigate }) {
  // Start on the active default variant; fall back to first active variant.
  const defaultVariant =
    product.defaultVariant ??
    product.variants.find((v) => v.isDefault) ??
    product.variants[0] ??
    null;

  const [selectedId, setSelectedId] = useState(defaultVariant?.id ?? null);
  const [qty, setQty] = useState(1);
  const [cartMessage, setCartMessage] = useState('');

  const selected = product.variants.find((v) => v.id === selectedId) ?? defaultVariant;

  function handleAddToCart() {
    if (!user) {
      // Prompt guests to sign in before saving to cart.
      navigate('/login');
      return;
    }
    // M2 owns the cart operation. Emit a custom event with variantId + quantity
    // so M2's cart hook can listen without tight coupling.
    // Replace quantity (not increment) to match M2's agreed operation spec.
    window.dispatchEvent(
      new CustomEvent('brightbuy:add-to-cart', {
        detail: { variantId: selected.id, quantity: qty },
      }),
    );
    setCartMessage(`Added ${qty} × ${selected.name} to your cart.`);
    setTimeout(() => setCartMessage(''), 3000);
  }

  const stockLabel =
    selected?.stock > 0 ? `${selected.stock} in stock` : 'Available to backorder';

  return (
    <>
      {/* Back link */}
      <p>
        <Link to="/">← Back to shop</Link>
      </p>

      <div className="product-detail">
        {/* Left — product art / placeholder */}
        <div className="product-detail-art" aria-hidden="true">
          {product.name.charAt(0)}
        </div>

        {/* Right — all product info */}
        <div className="product-detail-info">
          {/* Brand + name */}
          <p className="eyebrow">{product.brand}</p>
          <h1>{product.name}</h1>

          {/* Categories */}
          {product.categories?.length > 0 && (
            <p className="product-categories">
              {product.categories.map((c) => (
                <span className="category-badge" key={c.id}>
                  {c.name}
                </span>
              ))}
            </p>
          )}

          {/* Description */}
          <p className="product-description">{product.description}</p>

          {/* Variant selector — only shown when there are multiple variants */}
          {product.variants.length > 1 && (
            <div className="variant-selector">
              <label htmlFor="variant-select">
                <strong>Choose option:</strong>
              </label>
              <select
                id="variant-select"
                value={selectedId ?? ''}
                onChange={(e) => {
                  setSelectedId(Number(e.target.value));
                  setCartMessage('');
                }}
              >
                {product.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Selected variant detail */}
          {selected && (
            <div className="variant-detail">
              <div className="variant-price">
                {formatMoney(selected.price, product.currency ?? 'USD')}
              </div>

              <p className="variant-sku">
                <small>SKU: {selected.sku}</small>
              </p>

              {/* Attributes (Color, Storage, etc.) */}
              {selected.attributes?.length > 0 && (
                <ul className="variant-attributes">
                  {selected.attributes.map((a) => (
                    <li key={a.attributeId}>
                      <strong>{a.name}:</strong> {a.value}
                    </li>
                  ))}
                </ul>
              )}

              {/* Stock */}
              <p className={`stock-label ${selected.stock === 0 ? 'backorder' : ''}`}>
                {stockLabel}
              </p>

              {/* Quantity + Add to cart */}
              <div className="add-to-cart">
                <label htmlFor="qty-input">Qty:</label>
                <input
                  id="qty-input"
                  type="number"
                  min="1"
                  max="99"
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                />
                <button onClick={handleAddToCart}>
                  {user ? 'Add to cart' : 'Sign in to add to cart'}
                </button>
              </div>

              {/* Feedback message after adding */}
              {cartMessage && (
                <p role="status" className="cart-feedback">
                  {cartMessage}
                </p>
              )}
            </div>
          )}

          {/* Edge case: no variants */}
          {!selected && <p>No variants available for this product.</p>}
        </div>
      </div>
    </>
  );
}
