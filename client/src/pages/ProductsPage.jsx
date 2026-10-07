import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addCartItem } from '../utils/interactions.js';
import { api } from '../api.js';
import { formatMoney } from '../utils/format.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { getProductImage, getProductMarketingData } from '../utils/productImages.js';

const PAGE_SIZE = 18;

export function ProductsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'bundle', 'choice', 'superdeals'
  const [page, setPage] = useState(1);

  // Committed filter values
  const [committed, setCommitted] = useState({ search: '', categoryId: '', page: 1 });

  const [categories, setCategories] = useState([]);
  const [result, setResult] = useState({ loading: true, data: null, error: '' });
  const adding = useRef(false);
  const [addingCart, setAddingCart] = useState(false);
  const [toast, setToast] = useState('');
  const [addedVariants, setAddedVariants] = useState({});

  // Load category list once
  useEffect(() => {
    api('/categories').then(setCategories).catch(() => {});
  }, []);

  // Fetch catalogue whenever filters change
  useEffect(() => {
    const controller = new AbortController();
    setResult({ loading: true, data: null, error: '' });

    const params = new URLSearchParams();
    if (committed.search) params.set('q', committed.search);
    if (committed.categoryId) params.set('categoryId', committed.categoryId);
    params.set('page', String(committed.page));
    params.set('pageSize', String(PAGE_SIZE));

    api(`/catalogue?${params}`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ loading: false, data, error: '' });
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setResult({ loading: false, data: null, error: err.message });
      });

    return () => controller.abort();
  }, [committed]);

  function handleSearch(e) {
    e.preventDefault();
    setCommitted({ search, categoryId, page: 1 });
    setPage(1);
  }

  function handleCategorySelect(id, tabName = '') {
    const nextId = id ? String(id) : '';
    setCategoryId(nextId);
    setActiveTab(tabName || (nextId ? 'cat-' + nextId : 'all'));
    setCommitted((prev) => ({ ...prev, categoryId: nextId, page: 1 }));
    setPage(1);
  }

  function goToPage(newPage) {
    setPage(newPage);
    setCommitted((prev) => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 300, behavior: 'smooth' });
  }

  async function handleQuickAddToCart(e, product) {
    e.preventDefault();
    e.stopPropagation();

    const variant = product.defaultVariant || product.variants?.[0];
    if (!variant) return;

    if (!user) {
      navigate('/login', { state: { from: `/products/${product.id}` } });
      return;
    }

    if (user.role !== 'customer') {
      setToast('⚠️ Administrator accounts cannot place orders.');
      setTimeout(() => setToast(''), 3000);
      return;
    }

    if (adding.current) return;
    adding.current = true;
    setAddingCart(true);
    try {
      await addCartItem(api, variant.id, 1);
      setAddedVariants((prev) => ({ ...prev, [variant.id]: true }));
      setToast(`🛒 Added ${product.name} to cart!`);
      setTimeout(() => setToast(''), 3000);
      setTimeout(() => {
        setAddedVariants((prev) => ({ ...prev, [variant.id]: false }));
      }, 2000);
    } catch (err) {
      setToast(`⚠️ ${err.message || 'Could not add to cart'}`);
      setTimeout(() => setToast(''), 3000);
    } finally { adding.current = false; setAddingCart(false); }
  }

  const { loading, data, error } = result;
  const products = data?.items ?? [];
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  // Filter products for the featured promotional boxes (Image 3)
  const bundleFeatured = products.slice(0, 3);
  const superDealsFeatured = products.slice(3, 6);

  return (
    <div className="ali-storefront-wrapper">
      {/* ── 1. Top AliExpress Pill Search Bar ── */}
      <div className="ali-search-container">
        <form className="ali-search-bar" onSubmit={handleSearch} role="search">
          <input
            type="search"
            placeholder="Search name, model, or brand…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search products"
          />
          <button type="submit" className="ali-search-submit-btn" aria-label="Search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
          {(committed.search || committed.categoryId) && (
            <button
              type="button"
              className="ali-clear-btn"
              onClick={() => {
                setSearch('');
                setCategoryId('');
                setActiveTab('all');
                setCommitted({ search: '', categoryId: '', page: 1 });
                setPage(1);
              }}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* ── 2. AliExpress Horizontal Subnav Bar (Image 2) ── */}
      <div className="ali-subnav-bar">
        {/* All Categories Dropdown Button */}
        <button
          type="button"
          className={`ali-all-cat-btn ${activeTab === 'all' && !categoryId ? 'active' : ''}`}
          onClick={() => handleCategorySelect('', 'all')}
        >
          <span className="ali-hamburger-icon">☰</span>
          <span>All Categories</span>
        </button>

        {/* Quick Promo & Category Nav Links */}
        <div className="ali-nav-links-scroll">
          {/* Database categories are the supported catalogue filters. */}
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`ali-nav-link ${String(categoryId) === String(c.id) ? 'active' : ''}`}
              onClick={() => handleCategorySelect(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3. AliExpress "Today's deals" Featured Section (Image 3) ── */}
      {!committed.search && page === 1 && products.length >= 6 && (
        <section className="ali-deals-section">
          <h2 className="ali-section-title">Today's deals</h2>

          <div className="ali-deals-promo-row">
            {/* Box 1: Bundle Deals */}
            <div className="ali-deal-box">
              <div className="deal-box-header">
                <span className="deal-box-title">Bundle deals</span>
                <span className="deal-box-badge bundle">🛍️ 3 from US $4.99 &gt;</span>
              </div>
              <div className="deal-box-items-grid">
                {bundleFeatured.map((p, idx) => {
                  const img = getProductImage(p);
                  const price = p.defaultVariant?.price ?? 12.99;
                  const mkt = getProductMarketingData(p, idx);
                  return (
                    <Link to={`/products/${p.id}`} key={p.id} className="deal-box-item">
                      <div className="deal-item-img-wrap">
                        <img src={img} alt={p.name} loading="lazy" />
                      </div>
                      <p className="deal-item-name">{p.name}</p>
                      <div className="deal-item-price-row">
                        <span className="deal-item-red-price">{formatMoney(price, p.currency ?? 'USD')}</span>
                      </div>
                      <div className="deal-item-social">★ {mkt.rating} · {mkt.soldCount} sold</div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Box 2: SuperDeals */}
            <div className="ali-deal-box">
              <div className="deal-box-header">
                <span className="deal-box-title">SuperDeals</span>
                <span className="deal-box-badge superdeal">⚡ View more &gt;</span>
              </div>
              <div className="deal-box-items-grid">
                {superDealsFeatured.map((p, idx) => {
                  const img = getProductImage(p);
                  const price = p.defaultVariant?.price ?? 19.99;
                  const mkt = getProductMarketingData(p, idx + 3);
                  return (
                    <Link to={`/products/${p.id}`} key={p.id} className="deal-box-item">
                      <div className="deal-item-img-wrap">
                        <img src={img} alt={p.name} loading="lazy" />
                        <span className="deal-discount-pill">-{mkt.discountPercent}%</span>
                      </div>
                      <p className="deal-item-name">{p.name}</p>
                      <div className="deal-item-price-row">
                        <span className="deal-item-red-price">{formatMoney(price, p.currency ?? 'USD')}</span>
                      </div>
                      <div className="deal-item-social">★ {mkt.rating} · {mkt.soldCount} sold</div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── 4. Main Product Stream (Image 2) ── */}
      <section className="ali-main-stream-section">
        {committed.search ? (
          <h2 className="ali-stream-title">
            Search results for "{committed.search}" ({data?.total ?? 0} items)
          </h2>
        ) : (
          <h2 className="ali-stream-title">Recommended For You</h2>
        )}

        {/* Loading / error states */}
        {loading && <p role="status" className="ali-status-text">Loading products…</p>}
        {error && (
          <div role="alert" className="error">
            {error}{' '}
            <button onClick={() => setCommitted((prev) => ({ ...prev }))}>Try again</button>
          </div>
        )}

        {/* AliExpress Dense Product Grid (Image 2) */}
        {!loading && !error && (
          <>
            {products.length === 0 ? (
              <p className="ali-empty-text">No products found. Try another search or category.</p>
            ) : (
              <div className="ali-product-grid">
                {products.map((product, index) => {
                  const imgUrl = getProductImage(product);
                  const marketing = getProductMarketingData(product, index);
                  const variant = product.defaultVariant || product.variants?.[0];
                  const price = variant?.price ?? 0;
                  const originalPrice = (Number(price) * (1 + marketing.discountPercent / 100)).toFixed(2);
                  const isRecentlyAdded = variant && addedVariants[variant.id];
                  const savings = (Number(originalPrice) - Number(price)).toFixed(2);

                  return (
                    <article className="ali-feed-card" key={product.id}>
                      {/* Product Thumbnail with bottom banner and floating cart */}
                      <Link to={`/products/${product.id}`} className="ali-feed-thumb-wrap">
                        <img
                          src={imgUrl}
                          alt={product.name}
                          className="ali-feed-thumb"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80';
                          }}
                        />

                        {/* Red Banner at Bottom of Photo (Image 2) */}
                        <div className="ali-thumb-ribbon">
                          <span className="ribbon-bold">WELCOME DEAL</span>
                          <span className="ribbon-dot">·</span>
                          <span className="ribbon-sub">Free shipping</span>
                        </div>

                        {/* Floating Round Cart Button (Image 2) */}
                        <button
                          type="button"
                          className={`ali-thumb-cart-btn ${isRecentlyAdded ? 'added' : ''}`}
                          onClick={(e) => handleQuickAddToCart(e, product)}
                          disabled={addingCart}
                          title="Quick add to cart"
                          aria-label={`Add ${product.name} to cart`}
                        >
                          {isRecentlyAdded ? (
                            '✓'
                          ) : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="9" cy="21" r="1"></circle>
                              <circle cx="20" cy="21" r="1"></circle>
                              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                            </svg>
                          )}
                        </button>
                      </Link>

                      {/* Card Content Below Photo (Image 2) */}
                      <div className="ali-feed-content">
                        {/* Title with Choice & Sale badges */}
                        <Link to={`/products/${product.id}`} className="ali-feed-title">
                          {marketing.isChoice && (
                            <span className="ali-pill-choice">Choice</span>
                          )}
                          <span className="ali-pill-sale">Sale</span>
                          <span className="ali-title-text">{product.name}</span>
                        </Link>

                        {/* Red Price & Strikethrough */}
                        <div className="ali-feed-price-row">
                          <span className="ali-feed-red-price">
                            {formatMoney(price, product.currency ?? 'USD')}
                          </span>
                          <span className="ali-feed-old-price">
                            {formatMoney(originalPrice, product.currency ?? 'USD')}
                          </span>
                        </div>

                        {/* Star Rating & Sold */}
                        <div className="ali-feed-rating-row">
                          <span className="ali-stars-gold">★★★★★</span>
                          <span className="ali-rating-number">{marketing.rating}</span>
                          <span className="ali-rating-pipe">|</span>
                          <span className="ali-sold-metric">{marketing.soldCount} sold</span>
                        </div>

                        {/* AliExpress Promo Perk Lines */}
                        <div className="ali-feed-perks">
                          <div className="ali-perk-line red">
                            <span>🏷️</span> Save ${savings} with SuperDeals
                          </div>
                          <div className="ali-perk-line red">
                            <span>⚡</span> Free express delivery
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <nav className="pagination" aria-label="Catalogue pages" style={{ marginTop: '36px' }}>
                <button disabled={!hasPrev} onClick={() => goToPage(page - 1)}>
                  ← Previous
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button disabled={!hasNext} onClick={() => goToPage(page + 1)}>
                  Next →
                </button>
              </nav>
            )}
          </>
        )}
      </section>

      {/* Floating feedback toast */}
      {toast && <div className="ali-toast-msg">{toast}</div>}
    </div>
  );
}
