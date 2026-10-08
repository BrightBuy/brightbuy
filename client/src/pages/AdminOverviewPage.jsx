import React from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../hooks/useData.js';
import { DataState } from '../components/DataState.jsx';
import { formatMoney } from '../utils/format.js';
import { trackingStatus } from '../utils/order-tracking.js';
export function AdminOverviewPage() {
  const state = useData('/admin/dashboard');
  return <section><p className="eyebrow">STORE ADMINISTRATION</p><h1>Store overview</h1><DataState state={state}>{data => <>
    <div className="grid"><section className="card"><h2>Today's orders</h2><strong>{data.sales.orderCount}</strong><p>{data.today} · Central Time · cancellations excluded</p></section>
    <section className="card"><h2>Today's ordered value</h2><strong>{formatMoney(data.sales.orderedValue, 'USD')}</strong><p>Includes backorders; this is not cash received.</p></section></div>
    <section className="card"><h2>Low stock</h2><p>Active variants with five or fewer units, lowest stock first (up to 20).</p>{data.lowStock.length ? <div className="table-wrap"><table><thead><tr><th>Product</th><th>Variant / SKU</th><th>Stock</th></tr></thead><tbody>{data.lowStock.map(v=><tr key={v.id}><td>{v.productName}</td><td>{v.name} · {v.sku}</td><td>{v.stock}</td></tr>)}</tbody></table></div> : <p>No low-stock variants.</p>}<Link to="/admin/inventory">Manage inventory →</Link></section>
    <section className="card"><h2>Recent orders</h2>{data.recentOrders.length ? <div className="table-wrap"><table><thead><tr><th>Order</th><th>Status</th><th>Total</th></tr></thead><tbody>{data.recentOrders.map(o=><tr key={o.id}><td><Link to={'/admin/orders/'+o.id}>#{o.id}</Link></td><td>{trackingStatus(o.status)}</td><td>{formatMoney(o.total,'USD')}</td></tr>)}</tbody></table></div> : <p>No orders yet.</p>}<Link to="/admin/reports">View reports →</Link></section>
  </>}</DataState></section>;
}
