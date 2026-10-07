import React, { useState, useRef } from 'react';
import { useData } from '../hooks/useData.js';
import { DataState } from '../components/DataState.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { pendingAttempt } from '../utils/interactions.js';
import { attemptPolicy } from '../utils/attempt-policy.js';
import { postAttempt } from '../utils/post-attempt.js';
import { api } from '../api.js';
import { formatCentralTime } from '../utils/date-time.js';

export function AdminInventoryPage() {
    const historyRequest = useRef(0);
    const { user } = useAuth();
    const submitting = useRef(false);
    const [adjustmentAttempt, setAdjustmentAttempt] = useState(null);
    const store = (id) => pendingAttempt(sessionStorage, 'brightbuy:stock:' + user.id + ':' + id);
    const [lowStockOnly, setLowStockOnly] = useState(false);
    const [threshold, setThreshold] = useState(5);

    // Filter URL
    const query = lowStockOnly ? `?lowStockOnly=true&threshold=${threshold}` : '';
    const state = useData(`/admin/inventory${query}`);

    // Adjustment state
    const [adjustingVariant, setAdjustingVariant] = useState(null);
    const [quantityDelta, setQuantityDelta] = useState('');
    const [reason, setReason] = useState('');
    const [requestKey, setRequestKey] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // History state
    const [historyVariant, setHistoryVariant] = useState(null);
    const [historyMovements, setHistoryMovements] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Open adjustment form with a fresh UUID
    function openAdjustment(variant) {
        setAdjustingVariant(variant);
        const previous = store(variant.id).read();
        setAdjustmentAttempt(previous);
        setQuantityDelta(previous ? String(previous.quantityDelta) : '');
        setReason(previous?.reason || '');
        setError('');
        setRequestKey(previous?.requestKey || crypto.randomUUID());
    }

    // Handle stock adjustment submit
    async function handleAdjustSubmit(e) {
        e.preventDefault();
        if (submitting.current || !adjustingVariant) return;
        submitting.current = true;
        setBusy(true);
        setError('');

        const delta = Number(quantityDelta);
        if (!Number.isInteger(delta) || delta === 0) {
            setError('Quantity delta must be a non-zero integer.');
            submitting.current = false;
            setBusy(false);
            return;
        }

        try {
            const payload = adjustmentAttempt || store(adjustingVariant.id).save({ quantityDelta: delta, reason: reason.trim(), requestKey });
            setAdjustmentAttempt(payload);
            await postAttempt(api, '/admin/variants/' + adjustingVariant.id + '/stock-adjustments', payload);
            store(adjustingVariant.id).clear();
            setAdjustmentAttempt(null);

            // Reload inventory data & close form
            state.reload();
            setAdjustingVariant(null);
        } catch (err) {
            setError(err.message);
            if (attemptPolicy(err) === 'review') {
                store(adjustingVariant.id).clear(); setAdjustmentAttempt(null); setRequestKey(crypto.randomUUID());
            }
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    }

    // Open history view
    async function openHistory(variant) {
        const request = ++historyRequest.current;
        setHistoryVariant(variant);
        setHistoryMovements([]);
        setLoadingHistory(true);
        setError('');
        try {
            const response = await api(`/admin/variants/${variant.id}/stock-movements`);
            if (request === historyRequest.current) setHistoryMovements(response);
        } catch (err) {
            if (request === historyRequest.current) setError(err.message);
        } finally {
            if (request === historyRequest.current) setLoadingHistory(false);
        }
    }

    return (
        <>
            <p className="eyebrow">STORE ADMINISTRATION</p>
            <h1>Inventory Management</h1>
            <p className="intro">
                Monitor real-time warehouse stock, make adjustments, and audit movement logs.
            </p>

            {error && (
                <p role="alert" className="error">
                    {error}
                </p>
            )}


            <section className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={lowStockOnly}
                        onChange={(e) => setLowStockOnly(e.target.checked)}
                    />
                    <strong>Show low stock only</strong>
                </label>

                {lowStockOnly && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>Threshold:</span>
                        <input
                            type="number"
                            min="0"
                            value={threshold}
                            onChange={(e) => setThreshold(Math.max(0, Number(e.target.value)))}
                            style={{ width: '80px' }}
                        />
                    </label>
                )}
            </section>


            {adjustingVariant && (
                <article className="card" style={{ marginBottom: '1.5rem', border: '2px solid var(--accent, #3b82f6)' }}>
                    <h2>Adjust Stock: {adjustingVariant.productTitle} — {adjustingVariant.title}</h2>
                    <p>
                        SKU: <strong>{adjustingVariant.sku}</strong> | Current stock: <strong>{adjustingVariant.stock}</strong>
                    </p>

                    <form onSubmit={handleAdjustSubmit}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '400px' }}>
                            <label>
                                Quantity Delta (e.g. <code>+10</code> to add, <code>-5</code> to deduct):
                                <input
                                    type="number"
                                    required
                                    placeholder="+5 or -3"
                                    disabled={busy || Boolean(adjustmentAttempt)}
                                    value={quantityDelta}
                                    onChange={(e) => setQuantityDelta(e.target.value)}
                                />
                            </label>

                            <label>
                                Reason:
                                <input
                                    type="text"
                                    required
                                    maxLength="200"
                                    placeholder="e.g. Restock shipment, Damaged item"
                                    disabled={busy || Boolean(adjustmentAttempt)}
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                />
                            </label>

                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <button type="submit" disabled={busy}>
                                    {busy ? 'Saving...' : adjustmentAttempt ? 'Retry same adjustment' : 'Apply Stock Change'}
                                </button>
                                <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => setAdjustingVariant(null)}
                                    disabled={busy}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </form>
                </article>
            )}


            {historyVariant && (
                <article className="card" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2>Movement Audit History: {historyVariant.productTitle} ({historyVariant.title})</h2>
                        <button className="secondary" onClick={() => { historyRequest.current++; setHistoryVariant(null); }}>
                            Close History
                        </button>
                    </div>

                    {loadingHistory ? (
                        <p>Loading movements...</p>
                    ) : historyMovements.length ? (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Date (Central Time)</th>
                                        <th>Change</th>
                                        <th>Stock After</th>
                                        <th>Type</th>
                                        <th>Reason</th>
                                        <th>Reference</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyMovements.map((move) => (
                                        <tr key={move.id}>
                                            <td>#{move.id}</td>
                                            <td>{formatCentralTime(move.createdAt)}</td>
                                            <td style={{ fontWeight: 'bold', color: move.changeQty > 0 ? '#10b981' : '#ef4444' }}>
                                                {move.changeQty > 0 ? `+${move.changeQty}` : move.changeQty}
                                            </td>
                                            <td>{move.stockAfter}</td>
                                            <td><span className="badge">{move.movementType}</span></td>
                                            <td>{move.reason}</td>
                                            <td><small><code>{move.referenceKey}</code></small></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p>No movement history found for this variant.</p>
                    )}
                </article>
            )}


            <DataState state={state}>
                {(variants) =>
                    variants.length ? (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>Variant</th>
                                        <th>SKU</th>
                                        <th>Current Stock</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {variants.map((v) => (
                                        <tr key={v.id}>
                                            <td><strong>{v.productTitle}</strong></td>
                                            <td>{v.title}</td>
                                            <td><code>{v.sku}</code></td>
                                            <td>
                                                <span style={{ fontWeight: 'bold', color: v.stock <= 5 ? '#ef4444' : 'inherit' }}>
                                                    {v.stock}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="badge">{v.active ? 'Active' : 'Inactive'}</span>
                                            </td>
                                            <td style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button className="secondary" disabled={busy} onClick={() => openAdjustment(v)}>
                                                    Adjust
                                                </button>
                                                <button className="secondary" onClick={() => openHistory(v)}>
                                                    History
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p>No inventory records found.</p>
                    )
                }
            </DataState>
        </>
    );
}
