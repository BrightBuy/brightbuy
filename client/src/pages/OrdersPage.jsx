import React from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../hooks/useData.js';
import { DataState } from '../components/DataState.jsx';
import { formatMoney, statusLabel } from '../utils/format.js';
import { calendarDate, trackingStatus } from '../utils/order-tracking.js';

export function OrdersPage({ admin = false }) {
  const state = useData(admin ? '/admin/orders' : '/orders');
  return (
    <>
      <h1>{admin ? 'All orders' : 'My orders'}</h1>
      <DataState state={state}>
        {(rows) =>
          rows.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Status</th>
                    <th>Fulfillment</th>
                    <th>Payment</th>
                    <th>Estimate</th>
                    <th>Total</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((order) => (
                    <tr key={order.id}>
                      <td>#{order.id}</td>
                      <td>
                        <span className="badge">{trackingStatus(order.status)}</span>
                      </td>
                      <td>{order.fulfillment}</td>
                      <td>
                        {order.payment
                          ? statusLabel(order.payment.status)
                          : 'Legacy sample — unavailable'}
                      </td>
                      <td>
                        {order.delivery ? (
                          <>
                            {order.status === 'cancelled'
                              ? 'Original: '
                              : order.fulfillment === 'pickup'
                                ? 'Ready: '
                                : 'Delivery: '}
                            {calendarDate(order.delivery.estimatedDate)}
                          </>
                        ) : (
                          'Unavailable'
                        )}
                      </td>
                      <td>{formatMoney(order.total, order.currency)}</td>
                      <td>
                        <Link to={`${admin ? '/admin' : '/account'}/orders/${order.id}`}>
                          View order
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No orders yet.</p>
          )
        }
      </DataState>
    </>
  );
}
