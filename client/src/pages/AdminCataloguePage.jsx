import React, { useEffect, useReducer, useRef, useState } from 'react';
import { api } from '../api.js';
import { useData } from '../hooks/useData.js';
import { DataState } from '../components/DataState.jsx';
import { formatMoney } from '../utils/format.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function useApi() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function call(method, path, body) {
    setBusy(true);
    setError('');
    try {
      const result = await api(path, {
        method,
        body: body != null ? JSON.stringify(body) : undefined,
      });
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setError, call };
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin Catalogue Page — tabbed: Products | Categories | Attributes
// ─────────────────────────────────────────────────────────────────────────────

export function AdminCataloguePage() {
  const [tab, setTab] = useState('products');

  return (
    <>
      <p className="eyebrow">ADMIN</p>
      <h1>Catalogue Management</h1>
      <p className="intro">
        Manage products, variants, categories and attributes. Stock adjustments are handled in{' '}
        <a href="/admin/inventory">Inventory</a>.
      </p>

      {/* Tab bar */}
      <nav className="subnav" aria-label="Catalogue sections">
        {[['products', 'Products'], ['categories', 'Categories'], ['attributes', 'Attributes']].map(
          ([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'active' : 'secondary'}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ),
        )}
      </nav>

      {tab === 'products' && <ProductsPanel />}
      {tab === 'categories' && <CategoriesPanel />}
      {tab === 'attributes' && <AttributesPanel />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Products panel
// ─────────────────────────────────────────────────────────────────────────────

function ProductsPanel() {
  const state = useData('/admin/products');
  const [selected, setSelected] = useState(null); // product being edited

  function handleSaved() {
    state.reload();
    setSelected(null);
  }

  if (selected === 'new') {
    return (
      <ProductForm
        catState={useCategories()}
        onSaved={handleSaved}
        onCancel={() => setSelected(null)}
      />
    );
  }

  if (selected) {
    return (
      <ProductEditor
        product={selected}
        onSaved={handleSaved}
        onCancel={() => setSelected(null)}
      />
    );
  }

  return (
    <>
      <div className="panel-toolbar">
        <button onClick={() => setSelected('new')}>+ New product</button>
      </div>
      <DataState state={state}>
        {(products) =>
          products.length === 0 ? (
            <p>No products yet. Create one above.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Brand</th>
                  <th>Status</th>
                  <th>Variants</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <code>{p.sku ?? '—'}</code>
                    </td>
                    <td>{p.name}</td>
                    <td>{p.brand || '—'}</td>
                    <td>
                      <span className={`status-badge ${p.isActive ? 'active' : 'draft'}`}>
                        {p.isActive ? 'Active' : 'Draft'}
                      </span>
                      {p.isLegacy && <span className="status-badge legacy">Legacy</span>}
                    </td>
                    <td>{p.variants?.length ?? 0}</td>
                    <td>
                      <button className="secondary" onClick={() => setSelected(p)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </DataState>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: category list for selects
// ─────────────────────────────────────────────────────────────────────────────

function useCategories() {
  const [cats, setCats] = useState([]);
  useEffect(() => {
    api('/categories').then(setCats).catch(() => {});
  }, []);
  return cats;
}

// ─────────────────────────────────────────────────────────────────────────────
// New product form
// ─────────────────────────────────────────────────────────────────────────────

function ProductForm({ onSaved, onCancel }) {
  const cats = useCategories();
  const { busy, error, call } = useApi();
  const [form, setForm] = useState({
    sku: '', name: '', description: '', brand: '', categoryIds: [],
  });

  function toggle(id) {
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id)
        ? f.categoryIds.filter((x) => x !== id)
        : [...f.categoryIds, id],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const result = await call('POST', '/admin/products', {
      sku: form.sku.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      brand: form.brand.trim(),
      categoryIds: form.categoryIds,
    });
    if (result) onSaved(result);
  }

  return (
    <form onSubmit={handleSubmit} className="admin-form">
      <h2>New Product Draft</h2>
      {error && <p className="form-error">{error}</p>}
      <label>
        SKU <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
      </label>
      <label>
        Name <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label>
        Brand <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
      </label>
      <label>
        Description
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </label>
      <fieldset>
        <legend>Categories</legend>
        {cats.map((c) => (
          <label key={c.id} className="checkbox-label">
            <input
              type="checkbox"
              checked={form.categoryIds.includes(c.id)}
              onChange={() => toggle(c.id)}
            />
            {c.name}
          </label>
        ))}
      </fieldset>
      <div className="form-actions">
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create draft'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Product editor (metadata + variants + activation)
// ─────────────────────────────────────────────────────────────────────────────

function ProductEditor({ product, onSaved, onCancel }) {
  const cats = useCategories();
  const [attrList, setAttrList] = useState([]);
  const { busy, error, call, setError } = useApi();
  const [form, setForm] = useState({
    name: product.name,
    description: product.description ?? '',
    brand: product.brand ?? '',
    categoryIds: (product.categories ?? []).map((c) => c.id),
  });
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [localProduct, setLocalProduct] = useState(product);

  useEffect(() => {
    api('/admin/attributes').then(setAttrList).catch(() => {});
  }, []);

  // Reload full product detail after each mutation
  async function reload() {
    const fresh = await api(`/admin/products/${localProduct.id}`);
    if (fresh) setLocalProduct(fresh);
  }

  async function handleSaveMeta(e) {
    e.preventDefault();
    const result = await call('PATCH', `/admin/products/${localProduct.id}`, {
      name: form.name.trim(),
      description: form.description.trim(),
      brand: form.brand.trim(),
      categoryIds: form.categoryIds,
    });
    if (result) {
      setLocalProduct(result);
      onSaved(result);
    }
  }

  async function handleToggleActive() {
    setError('');
    const newActive = !localProduct.isActive;
    const result = await call('PATCH', `/admin/products/${localProduct.id}/active`, {
      isActive: newActive,
    });
    if (result) setLocalProduct(result);
  }

  async function handleSetDefault(variantId) {
    const result = await call('PUT', `/admin/products/${localProduct.id}/default-variant`, {
      variantId,
    });
    if (result) setLocalProduct(result);
  }

  async function handleToggleVariantActive(v) {
    const result = await call('PATCH', `/admin/variants/${v.id}/active`, {
      isActive: !v.isActive,
    });
    if (result) await reload();
  }

  function toggleCat(id) {
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id)
        ? f.categoryIds.filter((x) => x !== id)
        : [...f.categoryIds, id],
    }));
  }

  const readiness = [];
  if (!(localProduct.categories?.length)) readiness.push('Needs at least one category');
  if (!(localProduct.variants?.some((v) => v.isActive))) readiness.push('Needs an active variant');
  if (!(localProduct.variants?.some((v) => v.isDefault && v.isActive)))
    readiness.push('Needs an active default variant');
  const canActivate = readiness.length === 0;

  return (
    <div className="product-editor">
      <div className="editor-header">
        <h2>
          Edit: {localProduct.name}{' '}
          <span className={`status-badge ${localProduct.isActive ? 'active' : 'draft'}`}>
            {localProduct.isActive ? 'Active' : 'Draft'}
          </span>
        </h2>
        <button type="button" className="secondary" onClick={onCancel}>← Back</button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {/* ── Activation readiness ── */}
      {!localProduct.isActive && (
        <div className="readiness-checklist">
          <strong>Readiness checklist</strong>
          <ul>
            {['Needs at least one category', 'Needs an active variant', 'Needs an active default variant'].map(
              (item) => (
                <li key={item} className={readiness.includes(item) ? 'check-fail' : 'check-pass'}>
                  {readiness.includes(item) ? '✗' : '✓'} {item}
                </li>
              ),
            )}
          </ul>
          <button disabled={!canActivate || busy} onClick={handleToggleActive}>
            {busy ? 'Saving…' : 'Activate product'}
          </button>
        </div>
      )}
      {localProduct.isActive && (
        <div className="readiness-checklist active-warning">
          <strong>Product is live.</strong>
          <button className="secondary" disabled={busy} onClick={handleToggleActive}>
            {busy ? 'Saving…' : 'Deactivate (make draft)'}
          </button>
        </div>
      )}

      {/* ── Metadata form ── */}
      <form onSubmit={handleSaveMeta} className="admin-form">
        <h3>Product details</h3>
        <label>
          Name <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Brand <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
        </label>
        <label>
          Description
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <fieldset>
          <legend>Categories</legend>
          {cats.map((c) => (
            <label key={c.id} className="checkbox-label">
              <input type="checkbox" checked={form.categoryIds.includes(c.id)} onChange={() => toggleCat(c.id)} />
              {c.name}
            </label>
          ))}
        </fieldset>
        <div className="form-actions">
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>

      {/* ── Variants ── */}
      <section className="variants-section">
        <h3>Variants</h3>
        {localProduct.variants?.length === 0 && <p>No variants yet.</p>}
        {localProduct.variants?.map((v) => (
          <div key={v.id} className={`variant-row ${v.isDefault ? 'variant-default' : ''}`}>
            <div className="variant-info">
              <strong>{v.name}</strong>
              <small> · {v.sku} · {formatMoney(v.price, 'USD')}</small>
              {v.isDefault && <span className="status-badge active">Default</span>}
              {!v.isActive && <span className="status-badge draft">Inactive</span>}
              {/* Stock is read-only — M4 owns stock adjustments */}
              <small className="stock-note"> · Stock: {v.stock ?? 0} (adjust in Inventory)</small>
            </div>
            <div className="variant-actions">
              {!v.isDefault && v.isActive && (
                <button className="secondary" disabled={busy} onClick={() => handleSetDefault(v.id)}>
                  Set default
                </button>
              )}
              <button
                className="secondary"
                disabled={busy}
                onClick={() => handleToggleVariantActive(v)}
              >
                {v.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
        <button className="secondary" onClick={() => setShowVariantForm((x) => !x)}>
          {showVariantForm ? 'Cancel' : '+ Add variant'}
        </button>
        {showVariantForm && (
          <VariantForm
            productId={localProduct.id}
            attrList={attrList}
            onSaved={() => { setShowVariantForm(false); reload(); }}
          />
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add variant form
// ─────────────────────────────────────────────────────────────────────────────

function VariantForm({ productId, attrList, onSaved }) {
  const { busy, error, call } = useApi();
  const [form, setForm] = useState({ sku: '', name: '', price: '', attrs: [] });

  function toggleAttr(id) {
    setForm((f) => ({
      ...f,
      attrs: f.attrs.find((a) => a.attributeId === id)
        ? f.attrs.filter((a) => a.attributeId !== id)
        : [...f.attrs, { attributeId: id, value: '' }],
    }));
  }

  function setAttrValue(id, value) {
    setForm((f) => ({
      ...f,
      attrs: f.attrs.map((a) => (a.attributeId === id ? { ...a, value } : a)),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const result = await call('POST', `/admin/products/${productId}/variants`, {
      sku: form.sku.trim(),
      name: form.name.trim(),
      price: form.price.trim(),
      attributeValues: form.attrs.map((a) => ({ attributeId: a.attributeId, value: a.value })),
    });
    if (result) onSaved(result);
  }

  return (
    <form onSubmit={handleSubmit} className="admin-form variant-form">
      <h4>New Variant</h4>
      {error && <p className="form-error">{error}</p>}
      <label>
        SKU <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
      </label>
      <label>
        Name <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label>
        Price (USD) <input required placeholder="0.00" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
      </label>
      {attrList.length > 0 && (
        <fieldset>
          <legend>Attributes</legend>
          {attrList.map((a) => {
            const selected = form.attrs.find((x) => x.attributeId === a.id);
            return (
              <div key={a.id} className="attr-row">
                <label className="checkbox-label">
                  <input type="checkbox" checked={!!selected} onChange={() => toggleAttr(a.id)} />
                  {a.name}
                </label>
                {selected && (
                  <input
                    placeholder={`${a.name} value`}
                    value={selected.value}
                    onChange={(e) => setAttrValue(a.id, e.target.value)}
                  />
                )}
              </div>
            );
          })}
        </fieldset>
      )}
      {/* Stock intentionally omitted — M4 owns stock adjustments */}
      <p className="form-note">Stock starts at 0. Use Inventory to adjust.</p>
      <div className="form-actions">
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add variant'}</button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Categories panel
// ─────────────────────────────────────────────────────────────────────────────

function CategoriesPanel() {
  const state = useData('/categories');
  const { busy, error, call } = useApi();
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editing, setEditing] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    const result = await call('POST', '/admin/categories', {
      name: newName.trim(),
      description: newDesc.trim(),
    });
    if (result) { setNewName(''); setNewDesc(''); state.reload(); }
  }

  async function handleUpdate(e, id) {
    e.preventDefault();
    const result = await call('PATCH', `/admin/categories/${id}`, {
      name: editing.name.trim(),
      description: editing.description.trim(),
    });
    if (result) { setEditing(null); state.reload(); }
  }

  return (
    <>
      <h2>Categories</h2>
      {error && <p className="form-error">{error}</p>}

      <form onSubmit={handleCreate} className="admin-form inline-form">
        <input required placeholder="Category name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add category'}</button>
      </form>

      <DataState state={state}>
        {(cats) =>
          cats.length === 0 ? (
            <p>No categories yet.</p>
          ) : (
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Description</th><th></th></tr></thead>
              <tbody>
                {cats.map((c) =>
                  editing?.id === c.id ? (
                    <tr key={c.id}>
                      <td>
                        <form onSubmit={(e) => handleUpdate(e, c.id)} className="inline-form">
                          <input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                          <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                          <button type="submit" disabled={busy}>Save</button>
                          <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
                        </form>
                      </td>
                      <td></td><td></td>
                    </tr>
                  ) : (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.description || '—'}</td>
                      <td><button className="secondary" onClick={() => setEditing({ id: c.id, name: c.name, description: c.description ?? '' })}>Edit</button></td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )
        }
      </DataState>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Attributes panel
// ─────────────────────────────────────────────────────────────────────────────

function AttributesPanel() {
  const state = useData('/admin/attributes');
  const { busy, error, call } = useApi();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    const result = await call('POST', '/admin/attributes', { name: newName.trim() });
    if (result) { setNewName(''); state.reload(); }
  }

  async function handleUpdate(e, id) {
    e.preventDefault();
    const result = await call('PATCH', `/admin/attributes/${id}`, { name: editing.name.trim() });
    if (result) { setEditing(null); state.reload(); }
  }

  return (
    <>
      <h2>Attributes</h2>
      <p className="intro">Attributes describe variant options (e.g. Color, Storage, Size).</p>
      {error && <p className="form-error">{error}</p>}

      <form onSubmit={handleCreate} className="admin-form inline-form">
        <input required placeholder="Attribute name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add attribute'}</button>
      </form>

      <DataState state={state}>
        {(attrs) =>
          attrs.length === 0 ? (
            <p>No attributes yet.</p>
          ) : (
            <table className="admin-table">
              <thead><tr><th>Name</th><th></th></tr></thead>
              <tbody>
                {attrs.map((a) =>
                  editing?.id === a.id ? (
                    <tr key={a.id}>
                      <td>
                        <form onSubmit={(e) => handleUpdate(e, a.id)} className="inline-form">
                          <input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                          <button type="submit" disabled={busy}>Save</button>
                          <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
                        </form>
                      </td>
                      <td></td>
                    </tr>
                  ) : (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td><button className="secondary" onClick={() => setEditing({ id: a.id, name: a.name })}>Edit</button></td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )
        }
      </DataState>
    </>
  );
}
