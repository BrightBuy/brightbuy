import { toCsv } from '../utils/csv.js';
import { businessDate } from '../../../shared/time.js';
import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../hooks/useData.js';
import { DataState } from '../components/DataState.jsx';
import { calendarDate, trackingStatus } from '../utils/order-tracking.js';
import { downloadReportCsv } from '../utils/report-csv.js';
import './AdminReportsPage.css';

const reports = [
  [
    'quarterly-sales',
    'Quarterly sales',
    'Noncancelled ordered value by creation date, including backorders. This is not cash received.',
  ],
  [
    'top-products',
    'Top-selling products',
    'Ranks total units across all variants. Amounts use historical order prices; names use current catalogue labels. Cancelled orders are excluded.',
  ],
  [
    'category-orders',
    'Orders by category',
    'Counts each order once per category using checkout category snapshots. One order may count in several categories, so category totals need not equal total orders.',
  ],
  [
    'upcoming-deliveries',
    'Upcoming delivery estimates',
    'Uses stored estimates for unfinished orders, including backorders. New pickup orders have no delivery estimate and are not included. Past ranges can show overdue orders. An estimate does not guarantee stock availability.',
  ],
  [
    'customer-orders',
    'Customer orders and payments',
    'Includes cancelled orders. Ordered value excludes cancellations. Paid/refunded values describe the current payments for orders created in this range, not cash received/refunded during the range.',
  ],
];
const money = (value) => {
  const [whole, cents] = value.split('.');
  return `USD ${BigInt(whole).toLocaleString('en-US')}.${cents}`;
};
function Table({ headers, rows }) {
  const table = useRef(null);
  function download() {
    const values = [...table.current.querySelectorAll('tr')].map(row => [...row.querySelectorAll('th,td')].map(cell => cell.textContent));
    const url = URL.createObjectURL(new Blob([toCsv(values)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'brightbuy-report.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return rows.length ? (
    <div className="table-wrap"><div className="report-export"><button className="secondary" onClick={download}>Download CSV</button><button className="secondary" onClick={() => window.print()}>Print / save PDF</button></div>
      <table ref={table}>
        <thead>
          <tr>
            {headers.map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, column) => (
                <td key={column}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p>No matching records for these filters.</p>
  );
}
function ReportResult({ name, data }) {
  if (name === 'quarterly-sales')
    return (
      <Table
        headers={['Quarter', 'Orders', 'Ordered value']}
        rows={data.quarters.map((row) => [
          `Q${row.quarter}`,
          row.orderCount,
          money(row.salesAmount),
        ])}
      />
    );
  if (name === 'top-products')
    return (
      <Table
        headers={['Product', 'Units', 'Ordered value']}
        rows={data.items.map((row) => [row.name, row.quantity, money(row.salesAmount)])}
      />
    );
  if (name === 'category-orders')
    return (
      <Table
        headers={['Category', 'Distinct orders']}
        rows={data.items.map((row) => [row.name, row.orderCount])}
      />
    );
  if (name === 'upcoming-deliveries')
    return (
      <Table
        headers={[
          'Order',
          'Mode',
          'Status',
          'Original estimate',
          'Actual date',
          'Initial shortage',
          'Overdue',
        ]}
        rows={data.items.map((row) => [
          <Link to={`/admin/orders/${row.orderId}`}>#{row.orderId}</Link>,
          row.fulfillment === 'pickup' ? 'Pickup' : 'Delivery',
          trackingStatus(row.status),
          calendarDate(row.estimatedDate),
          row.actualDate ? calendarDate(row.actualDate) : 'Not recorded',
          row.wasOutOfStock ? 'Yes' : 'No',
          row.isOverdue ? 'Yes' : 'No',
        ])}
      />
    );
  return data.items.length ? (
    <div className="report-customers">
      {data.items.map((customer) => (
        <section className="card" key={customer.customerId}>
          <h3>{customer.name}</h3>
          <p>
            {customer.orderCount} orders · Ordered: {money(customer.orderedAmount)} · Paid:{' '}
            {money(customer.paidAmount)} · Refunded: {money(customer.refundedAmount)}
          </p>
          <Table
            headers={['Order', 'Total', 'Status', 'Payment']}
            rows={customer.orders.map((order) => [
              <Link to={`/admin/orders/${order.id}`}>#{order.id}</Link>,
              money(order.total),
              trackingStatus(order.status),
              order.paymentStatus,
            ])}
          />
        </section>
      ))}
    </div>
  ) : (
    <p>No matching records for these filters.</p>
  );
}
export function AdminReportsPage() {
  const today = businessDate();
  const [name, setName] = useState('quarterly-sales');
  const [year, setYear] = useState(today.slice(0, 4));
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [limit, setLimit] = useState('10');
  const [customerId, setCustomerId] = useState('');
  const [applied, setApplied] = useState({
    name: 'quarterly-sales',
    query: `year=${today.slice(0, 4)}`,
  });
  const state = useData(`/admin/reports/${applied.name}?${applied.query}`);
  const customers = useData('/admin/customers');
  function run(event) {
    event.preventDefault();
    const query = new URLSearchParams(name === 'quarterly-sales' ? { year } : { from, to });
    if (name === 'top-products') query.set('limit', limit);
    if (name === 'customer-orders' && customerId) query.set('customerId', customerId);
    setApplied({ name, query: query.toString() });
    // Running unchanged filters still refreshes current status/payment values.
    if (name === applied.name && query.toString() === applied.query) state.reload();
  }
  const selected = reports.find((report) => report[0] === applied.name);
  const appliedFilters = new URLSearchParams(applied.query);
  return (
    <div className="reports-page">
      <p className="eyebrow">STORE ADMINISTRATION</p>
      <h1>Project reports</h1>
      <p className="intro">
        Central Time periods · USD project orders only. Legacy sample orders and failed checkout
        attempts are excluded.
      </p>
      <form className="card report-filters" onSubmit={run}>
        <label>
          Report
          <select value={name} onChange={(event) => setName(event.target.value)}>
            {reports.map((report) => (
              <option value={report[0]} key={report[0]}>
                {report[1]}
              </option>
            ))}
          </select>
        </label>
        {name === 'quarterly-sales' ? (
          <label>
            Year
            <input
              type="number"
              min="2000"
              max="2100"
              step="1"
              required
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
          </label>
        ) : (
          <>
            <label>
              From (Central Time)
              <input
                type="date"
                required
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label>
              To (Central Time, inclusive)
              <input
                type="date"
                required
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
            <p className="report-hint">Choose 1–366 days. Past dates are supported.</p>
          </>
        )}
        {name === 'top-products' && (
          <label>
            Maximum products
            <input
              type="number"
              min="1"
              max="50"
              step="1"
              required
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
          </label>
        )}
        {name === 'customer-orders' && (
          <label>
            Customer
            <select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              disabled={customers.loading || Boolean(customers.error)}
            >
              <option value="">All customers</option>
              {(customers.data || []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} ({customer.email})
                </option>
              ))}
            </select>
            {customers.error && (
              <span role="alert">Could not load customer choices: {customers.error}</span>
            )}
          </label>
        )}
        <button>Run report</button>
      </form>
      <section aria-label="Report results">
        <h2>{selected[1]}</h2>
        <p>{selected[2]}</p>
        <p className="report-hint">
          Applied filters:{' '}
          {appliedFilters.has('year')
            ? `Year ${appliedFilters.get('year')}`
            : `${calendarDate(appliedFilters.get('from'))} to ${calendarDate(appliedFilters.get('to'))} (inclusive)`}
          {appliedFilters.has('limit') ? ` · Maximum ${appliedFilters.get('limit')} products` : ''}
          {appliedFilters.has('customerId')
            ? ` · Customer: ${(customers.data || []).find((customer) => String(customer.id) === appliedFilters.get('customerId'))?.name || 'Selected customer'}`
            : ''}
        </p>
        <DataState state={state}>
          {(data) => (
            <>
              <p className="report-hint">
                Scope: project orders · Timezone: {data.timezone}
                {data.year
                  ? ` · Year: ${data.year}`
                  : ` · ${calendarDate(data.from)} to ${calendarDate(data.to)} (inclusive)`}
              </p>
              <button
                className="report-export"
                type="button"
                onClick={() =>
                  downloadReportCsv(applied.name, data, {
                    title: selected[1],
                    description: selected[2],
                    query: applied.query,
                  })
                }
              >
                Export CSV
              </button>
              <ReportResult name={applied.name} data={data} />
            </>
          )}
        </DataState>
      </section>
    </div>
  );
}
