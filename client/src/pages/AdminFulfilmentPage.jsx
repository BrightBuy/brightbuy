import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../hooks/useData.js';
import { DataState } from '../components/DataState.jsx';
import { api } from '../api.js';
import { formatMoney, statusLabel } from '../utils/format.js';
import { calendarDate, trackingStatus } from '../utils/order-tracking.js';

export function AdminFulfilmentPage() {
    const state = useData('/admin/orders');


    const [statusFilter, setStatusFilter] = useState('all');
    const [modeFilter, setModeFilter] = useState('all');


    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');


    const [completingOrder, setCompletingOrder] = useState(null);
    const [cashReceived, setCashReceived] = useState(false);


    async function handleAllocate(order) {
        setBusyId(order.id);
        setError('');
        setSuccess('');
        try {
            const requestKey = crypto.randomUUID();
            await api(`/admin/orders/${order.id}/allocate`, {
                method: 'POST',
                body: JSON.stringify({ requestKey }),
            });
            setSuccess(`Order #${order.id} stock successfully allocated!`);
            state.reload();
        } catch (err) {
            setError(err.message || 'Failed to allocate stock for order.');
        } finally {
            setBusyId(null);
        }
    }


    async function handleAdvanceStatus(order, nextStatus) {
        setBusyId(order.id);
        setError('');
        setSuccess('');
        try {
            await api(`/admin/orders/${order.id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: nextStatus }),
            });
            setSuccess(`Order #${order.id} updated to ${statusLabel(nextStatus)}.`);
            state.reload();
        } catch (err) {
            setError(err.message || 'Failed to update order status.');
        } finally {
            setBusyId(null);
        }
    }


    async function handleCompleteSubmit(e) {
        e.preventDefault();
        if (!completingOrder) return;

        const isCod = completingOrder.payment?.method === 'cod';
        const isPending = completingOrder.payment?.status === 'pending';

        if (isCod && isPending && !cashReceived) {
            setError('You must confirm that cash payment was received for Cash-on-Delivery orders.');
            return;
        }

        setBusyId(completingOrder.id);
        setError('');
        setSuccess('');
        try {
            const requestKey = crypto.randomUUID();
            await api(`/admin/orders/${completingOrder.id}/complete`, {
                method: 'POST',
                body: JSON.stringify({
                    requestKey,
                    cashReceived: Boolean(isCod && isPending ? cashReceived : false),
                }),
            });
            setSuccess(`Order #${completingOrder.id} marked as completed!`);
            setCompletingOrder(null);
            setCashReceived(false);
            state.reload();
        } catch (err) {
            setError(err.message || 'Failed to complete order.');
        } finally {
            setBusyId(null);
        }
    }

    return (
        <>
            <p className="eyebrow">STORE ADMINISTRATION</p>
            <h1>Order Fulfillment</h1>
            <p className="intro">
                Manage fulfillment lifecycle, allocate backorders, and record completed deliveries and collections.
            </p>

            {error && (
                <p role="alert" className="error" style={{ marginBottom: '1.5rem' }}>
                    {error}
                </p>
            )}

            {success && (
                <p
                    role="status"
                    style={{
                        padding: '16px',
                        background: '#e8efe3',
                        color: '#255c3c',
                        borderRadius: '8px',
                        marginBottom: '1.5rem',
                    }}
                >
                    {success}
                </p>
            )}


            {completingOrder && (
                <section
                    className="card"
                    style={{
                        background: '#ffffff',
                        border: '2px solid #255e49ff',
                        padding: '24px',
                        borderRadius: '12px',
                        marginBottom: '2rem',
                    }}
                >
                    <h2>Complete Order #{completingOrder.id}</h2>
                    <p>
                        Fulfillment Mode: <strong>{completingOrder.fulfillment}</strong> (Target Status:{' '}
                        <strong>{completingOrder.fulfillment === 'delivery' ? 'delivered' : 'collected'}</strong>)
                    </p>
                    <p>
                        Payment Method: <strong>{completingOrder.payment?.method?.toUpperCase() || 'UNKNOWN'}</strong> | Current
                        Status: <strong>{completingOrder.payment?.status}</strong>
                    </p>
                    <p>
                        Total: <strong>{formatMoney(completingOrder.total, completingOrder.currency)}</strong>
                    </p>

                    <form onSubmit={handleCompleteSubmit} style={{ marginTop: '1rem' }}>
                        {completingOrder.payment?.method === 'cod' && completingOrder.payment?.status === 'pending' ? (
                            <label
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    fontSize: '15px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    padding: '12px',
                                    background: '#fcf8ee',
                                    borderRadius: '8px',
                                    border: '1px solid #dfc79b',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    style={{ width: 'auto', cursor: 'pointer' }}
                                    checked={cashReceived}
                                    onChange={(e) => setCashReceived(e.target.checked)}
                                />
                                Confirm Cash Received ({formatMoney(completingOrder.total, completingOrder.currency)})
                            </label>
                        ) : (
                            <p style={{ color: '#4d695b' }}>Card payment already captured. No cash collection required.</p>
                        )}

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem' }}>
                            <button type="submit" disabled={busyId === completingOrder.id}>
                                {busyId === completingOrder.id ? 'Processing...' : 'Confirm Order Completion'}
                            </button>
                            <button
                                type="button"
                                className="secondary"
                                disabled={busyId === completingOrder.id}
                                onClick={() => {
                                    setCompletingOrder(null);
                                    setError('');
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </section>
            )}


            <section
                className="card"
                style={{
                    marginBottom: '1.5rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '1.5rem',
                    alignItems: 'center',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label htmlFor="status-filter" style={{ fontWeight: 600, fontSize: '14px' }}>
                        Status:
                    </label>
                    <select
                        id="status-filter"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #b9c7bd' }}
                    >
                        <option value="all">All Statuses</option>
                        <option value="backordered">Backordered</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="processing">Processing</option>
                        <option value="shipped">Dispatched / Shipped</option>
                        <option value="ready_for_pickup">Ready for Pickup</option>
                        <option value="delivered">Delivered</option>
                        <option value="collected">Collected</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label htmlFor="mode-filter" style={{ fontWeight: 600, fontSize: '14px' }}>
                        Fulfillment Mode:
                    </label>
                    <select
                        id="mode-filter"
                        value={modeFilter}
                        onChange={(e) => setModeFilter(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #b9c7bd' }}
                    >
                        <option value="all">All Modes</option>
                        <option value="delivery">Delivery</option>
                        <option value="pickup">Store Pickup</option>
                    </select>
                </div>
            </section>


            <DataState state={state}>
                {(orders) => {
                    const filtered = orders.filter((o) => {
                        if (statusFilter !== 'all' && o.status !== statusFilter) return false;
                        if (modeFilter !== 'all' && o.fulfillment !== modeFilter) return false;
                        return true;
                    });

                    if (!filtered.length) {
                        return <p>No orders match the selected filters.</p>
                    }

                    return (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Order #</th>
                                        <th>Status</th>
                                        <th>Mode</th>
                                        <th>Stock State</th>
                                        <th>Payment</th>
                                        <th>Total</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((order) => {
                                        const isBusy = busyId === order.id;

                                        return (
                                            <tr key={order.id}>
                                                <td>
                                                    <strong>#{order.id}</strong>
                                                    <br />
                                                    <small>
                                                        <Link to={`/admin/orders/${order.id}`}>View details</Link>
                                                    </small>
                                                </td>
                                                <td>
                                                    <span className="badge">{trackingStatus(order.status)}</span>
                                                </td>
                                                <td style={{ textTransform: 'capitalize' }}>{order.fulfillment}</td>
                                                <td>
                                                    <span
                                                        style={{
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '12px',
                                                            fontWeight: 600,
                                                            background:
                                                                order.stockState === 'allocated'
                                                                    ? '#e8efe3'
                                                                    : order.stockState === 'consumed'
                                                                        ? '#e1e9f5'
                                                                        : '#fdebe7',
                                                            color:
                                                                order.stockState === 'allocated'
                                                                    ? '#27583e'
                                                                    : order.stockState === 'consumed'
                                                                        ? '#244b7d'
                                                                        : '#993322',
                                                        }}
                                                    >
                                                        {order.stockState || 'none'}
                                                    </span>
                                                </td>
                                                <td>
                                                    {order.payment ? (
                                                        <>
                                                            <span style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '12px' }}>
                                                                {order.payment.method}
                                                            </span>
                                                            <br />
                                                            <small style={{ color: order.payment.status === 'paid' ? '#255c3c' : '#8f6820' }}>
                                                                {order.payment.status}
                                                            </small>
                                                        </>
                                                    ) : (
                                                        'Unavailable'
                                                    )}
                                                </td>
                                                <td>{formatMoney(order.total, order.currency)}</td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>

                                                        {order.status === 'backordered' && (
                                                            <button
                                                                type="button"
                                                                disabled={isBusy}
                                                                onClick={() => handleAllocate(order)}
                                                                style={{ fontSize: '13px', padding: '6px 12px' }}
                                                            >
                                                                {isBusy ? 'Allocating...' : 'Allocate Stock'}
                                                            </button>
                                                        )}


                                                        {order.status === 'confirmed' && (
                                                            <button
                                                                type="button"
                                                                disabled={isBusy}
                                                                onClick={() => handleAdvanceStatus(order, 'processing')}
                                                                style={{ fontSize: '13px', padding: '6px 12px' }}
                                                            >
                                                                {isBusy ? 'Updating...' : 'Start Processing'}
                                                            </button>
                                                        )}


                                                        {order.status === 'processing' && order.fulfillment === 'delivery' && (
                                                            <button
                                                                type="button"
                                                                disabled={isBusy}
                                                                onClick={() => handleAdvanceStatus(order, 'shipped')}
                                                                style={{ fontSize: '13px', padding: '6px 12px' }}
                                                            >
                                                                {isBusy ? 'Updating...' : 'Mark Dispatched'}
                                                            </button>
                                                        )}


                                                        {order.status === 'processing' && order.fulfillment === 'pickup' && (
                                                            <button
                                                                type="button"
                                                                disabled={isBusy}
                                                                onClick={() => handleAdvanceStatus(order, 'ready_for_pickup')}
                                                                style={{ fontSize: '13px', padding: '6px 12px' }}
                                                            >
                                                                {isBusy ? 'Updating...' : 'Mark Ready for Pickup'}
                                                            </button>
                                                        )}


                                                        {['shipped', 'ready_for_pickup'].includes(order.status) && (
                                                            <button
                                                                type="button"
                                                                disabled={isBusy}
                                                                onClick={() => {
                                                                    setCompletingOrder(order);
                                                                    setCashReceived(false);
                                                                    setError('');
                                                                }}
                                                                style={{
                                                                    fontSize: '13px',
                                                                    padding: '6px 12px',
                                                                    background: '#1b4a39',
                                                                }}
                                                            >
                                                                Complete Order
                                                            </button>
                                                        )}


                                                        {['delivered', 'collected', 'cancelled'].includes(order.status) && (
                                                            <span style={{ fontSize: '13px', color: '#7b8a82' }}>Completed</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    );
                }}
            </DataState>
        </>
    );
}
