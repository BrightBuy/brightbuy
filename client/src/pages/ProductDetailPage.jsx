import React, { useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useData } from '../hooks/useData.js';
import { DataState } from '../components/DataState.jsx';
import { formatMoney } from '../utils/format.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { addCartItem, quantity } from '../utils/interactions.js';
import { api } from '../api.js';
import { getProductImage, getProductMarketingData } from '../utils/productImages.js';

// Shows modern AliExpress-style full product detail:
// high-res product photo, price with discount tag, star rating,
// interactive variant selector, attributes, stock status, quantity picker and cart action.
export function ProductDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const state = useData(`/products/${id}`);

  return (
    <DataState state={state}>
      {(product) => <ProductDetail key={product.id} product={product} user={user} navigate={navigate} />}
    </DataState>
  );
}

function ProductDetail({ product, user, navigate }) {
  // Start on active default variant; fall back to first active variant
  const defaultVariant =
    product.defaultVariant ??
    product.variants?.find((v) => v.isDefault) ??
    product.variants?.[0] ??
    null;

  const [selectedId, setSelectedId] = useState(defaultVariant?.id ?? null);
  const [qty, setQty] = useState(1);
  const [cartMessage, setCartMessage] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const adding = useRef(false);

  const selected = product.variants?.find((v) => v.id === selectedId) ?? defaultVariant;
  const marketing = getProductMarketingData(product);
  const imgUrl = getProductImage(product);

  const currentPrice = selected?.price ?? 0;
  const originalPrice = (Number(currentPrice) * (1 + marketing.discountPercent / 100)).toFixed(2);

  async function handleAddToCart() {
    if (!user) {
      navigate('/login', { state: { from: `/products/${product.id}` } });
      return;
    }

    if (user.role !== 'customer') {
      setCartMessage('⚠️ Administrator accounts cannot place orders.');
      setTimeout(() => setCartMessage(''), 3500);
      return;
    }

    if (!selected || adding.current) return;
    if (quantity(qty) === null) { setCartMessage('Enter a whole quantity from 1 to 99.'); return; }
    adding.current = true;

    setIsAdding(true);
    setCartMessage('');

    try {
      // Save item directly to database cart
      await addCartItem(api, selected.id, qty);

      // Dispatch decoupled event for any listening hooks
      window.dispatchEvent(
        new CustomEvent('brightbuy:add-to-cart', {
          detail: { variantId: selected.id, quantity: qty },
        }),
      );

      setCartMessage(`✓ Added ${qty} × ${selected.name} to your cart!`);
      setTimeout(() => setCartMessage(''), 3500);
    } catch (err) {
      setCartMessage(`⚠️ ${err.message || 'Could not add to cart.'}`);
      setTimeout(() => setCartMessage(''), 3500);
    } finally {
      adding.current = false;
      setIsAdding(false);
    }
  }

  const stockCount = selected?.stock ?? 0;
  const inStock = stockCount > 0;

  return (
    <div className="product-page-container">
      {/* ── Breadcrumb Bar ── */}
      <nav className="detail-breadcrumbs" aria-label="Breadcrumb">
        <Link to="/" className="breadcrumb-link">Shop</Link>
        <span className="breadcrumb-sep">/</span>
        {product.categories?.[0] && (
          <>
            <span className="breadcrumb-cat">{product.categories[0].name}</span>
            <span className="breadcrumb-sep">/</span>
          </>
        )}
        <span className="breadcrumb-current">{product.name}</span>
      </nav>

      {/* ── Main Product Card Container ── */}
      <div className="detail-layout">
        {/* Left Column: Visuals & Guarantees */}
        <div className="detail-gallery-col">
          <div className="detail-image-wrapper">
            <img
              src={imgUrl}
              alt={product.name}
              className="detail-main-img"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80';
              }}
            />
            {marketing.isChoice && (
              <span className="detail-choice-tag">Choice Verified</span>
            )}
            <span className="detail-discount-tag">-{marketing.discountPercent}%</span>
          </div>

          <div className="detail-trust-badges">
            <div className="trust-item">
              <span>🚚</span> <strong>Free Express Shipping</strong> on Choice items
            </div>
            <div className="trust-item">
              <span>🛡️</span> <strong>30-Day Free Return</strong> & Buyer Protection
            </div>
            <div className="trust-item">
              <span>⚡</span> <strong>Fast Dispatch</strong> with tracking
            </div>
          </div>
        </div>

        {/* Right Column: Information & Buy Box */}
        <div className="detail-info-col">
          {/* Brand & Title */}
          <div className="detail-title-block">
            {product.brand && (
              <span className="detail-brand-badge">{product.brand}</span>
            )}
            <h1>{product.name}</h1>
          </div>

          {/* Social Proof Bar */}
          <div className="detail-social-bar">
            <div className="detail-rating">
              <span>★</span> {marketing.rating}
              <span className="rating-count">({Math.floor(120 + marketing.discountPercent * 28)} reviews)</span>
            </div>
            <span className="social-sep">·</span>
            <span className="detail-sold-stat">{marketing.soldCount} sold</span>
            <span className="social-sep">·</span>
            <span className="detail-popular-tag">🔥 Trending item</span>
          </div>

          {/* AliExpress Pricing Banner */}
          <div className="detail-price-banner">
            <div className="price-primary-row">
              <span className="detail-current-price">
                {formatMoney(currentPrice, product.currency ?? 'USD')}
              </span>
              <span className="detail-original-price">
                {formatMoney(originalPrice, product.currency ?? 'USD')}
              </span>
              <span className="detail-deal-badge">-{marketing.discountPercent}% OFF</span>
            </div>
            <div className="detail-deal-urgency">
              <span>⚡ SuperDeal: Price available for limited quantities</span>
            </div>
          </div>

          {/* Categories */}
          {product.categories?.length > 0 && (
            <div className="detail-categories-wrap">
              <span className="meta-label">Category:</span>
              {product.categories.map((c) => (
                <span className="category-pill-tag" key={c.id}>
                  {c.name}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          <div className="detail-description-wrap">
            <p className="detail-description-text">{product.description}</p>
          </div>

          {/* Variant Selector */}
          {product.variants?.length > 1 && (
            <div className="detail-variant-box">
              <label htmlFor="variant-select" className="meta-label">
                <strong>Choose Option / Model:</strong>
              </label>
              <div className="variant-pills-row">
                {product.variants.map((v) => {
                  const isActive = v.id === selected?.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className={`variant-option-pill ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedId(v.id);
                        setCartMessage('');
                      }}
                    >
                      {v.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected Variant Attributes & SKU */}
          {selected && (
            <div className="detail-specs-box">
              <div className="specs-row">
                <span className="meta-label">SKU:</span>
                <span className="specs-sku">{selected.sku}</span>
              </div>

              {selected.attributes?.length > 0 && (
                <div className="specs-attributes-grid">
                  {selected.attributes.map((a) => (
                    <div className="attribute-chip" key={a.attributeId}>
                      <span className="attr-name">{a.name}:</span>{' '}
                      <span className="attr-val">{a.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Stock Status */}
              <div className="detail-stock-row">
                <span className="meta-label">Availability:</span>
                {inStock ? (
                  <span className="stock-status in-stock">
                    ✅ In Stock ({stockCount} units ready to ship)
                  </span>
                ) : (
                  <span className="stock-status backorder">
                    📦 Available to backorder (ships immediately upon replenishment)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Purchase Actions Box */}
          <div className="detail-buy-box">
            <div className="qty-picker-wrap">
              <span className="meta-label">Quantity:</span>
              <div className="qty-controls">
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => setQty((prev) => Math.max(1, prev - 1))}
                  disabled={isAdding || qty <= 1}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <input
                  id="qty-input"
                  type="number"
                  min="1"
                  max="99"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="qty-input-field"
                  aria-label="Quantity"
                />
                <button
                  type="button"
                  className="qty-btn"
                  disabled={isAdding || Number(qty) >= 99}
                  onClick={() => setQty((prev) => Math.min(99, Number(prev) + 1))}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>

            <button
              type="button"
              className="detail-add-cart-btn"
              onClick={handleAddToCart}
              disabled={isAdding || !selected}
            >
              {isAdding ? 'Adding to cart…' : user ? '🛒 Add to Cart' : 'Sign In to Add to Cart'}
            </button>
          </div>

          {/* Feedback Toast */}
          {cartMessage && (
            <div role="status" className={`detail-cart-alert ${cartMessage.startsWith('✓') ? 'success' : 'warn'}`}>
              {cartMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
