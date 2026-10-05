import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatMoney } from '../utils/format.js';

const PAGE_SIZE = 12;

// Fetches GET /api/catalogue with q, categoryId, page and pageSize.
// Falls back to GET /api/products (legacy array) if the catalogue endpoint
// is unavailable so existing consumers are not broken.
export function ProductsPage() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);

  // Committed filter values — only applied when the user submits the form
  // so mid-type fetches don't fire on every keystroke.
  const [committed, setCommitted] = useState({ search: '', categoryId: '', page: 1 });

  const [categories, setCategories] = useState([]);
  const [result, setResult] = useState({ loading: true, data: null, error: '' });

  // Load category list once for the filter dropdown
  useEffect(() => {
    api('/categories').then(setCategories).catch(() => {});
  }, []);

  // Fetch catalogue whenever committed filter values change
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

  function handleCategoryChange(e) {
    const val = e.target.value;
    setCategoryId(val);
    setCommitted((prev) => ({ ...prev, categoryId: val, page: 1 }));
    setPage(1);
  }

  function goToPage(newPage) {
    setPage(newPage);
    setCommitted((prev) => ({ ...prev, page: newPage }));
  }

  const { loading, data, error } = result;
  const products = data?.items ?? [];
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  return (
    <>
      <p className="eyebrow">THE BRIGHTBUY CATALOGUE</p>
      <h1>Good things, simply chosen.</h1>
      <p className="intro">
        Browse {data?.total ?? '…'} products. Search by name or brand, or filter by category.
      </p>

      {/* ── Search + filter bar ── */}
      <form className="catalogue-filters" onSubmit={handleSearch} role="search">
        <input
          type="search"
          placeholder="Search name or brand…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search products"
        />
        <select
          value={categoryId}
          onChange={handleCategoryChange}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit">Search</button>
        {(committed.search || committed.categoryId) && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setSearch('');
              setCategoryId('');
              setCommitted({ search: '', categoryId: '', page: 1 });
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
      </form>

      {/* ── Loading / error states ── */}
      {loading && <p role="status">Loading…</p>}
      {error && (
        <div role="alert" className="error">
          {error}{' '}
          <button onClick={() => setCommitted((prev) => ({ ...prev }))}>Try again</button>
        </div>
      )}

      {/* ── Product grid ── */}
      {!loading && !error && (
        <>
          {products.length === 0 ? (
            <p>No products found. Try a different search or category.</p>
          ) : (
            <div className="grid">
              {products.map((product, index) => (
                <article className="card" key={product.id}>
                  <div className={`product-art art-${index % 3}`} aria-hidden="true">
                    {product.name.charAt(0)}
                  </div>
                  <h2>
                    <Link to={`/products/${product.id}`}>{product.name}</Link>
                  </h2>
                  {product.brand && <p className="product-brand">{product.brand}</p>}
                  <p>{product.description}</p>
                  {/* Show default variant price if available */}
                  {product.defaultVariant && (
                    <p className="card-price">
                      {formatMoney(product.defaultVariant.price, product.currency ?? 'USD')}
                    </p>
                  )}
                  <Link className="btn-link" to={`/products/${product.id}`}>
                    View details →
                  </Link>
                </article>
              ))}
            </div>
          )}

          {/* ── Pagination controls ── */}
          {totalPages > 1 && (
            <nav className="pagination" aria-label="Catalogue pages">
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
    </>
  );
}
