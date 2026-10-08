import { trackingStatus } from './order-tracking.js';

function csvCell(value) {
  let text = String(value ?? '');
  // Keep user-entered names as text when opened in a spreadsheet.
  if (/^\s*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function reportCsv(name, data, { title, description, query }) {
  const rows = [
    ['Report', title],
    ['Definition', description],
    ['Scope', data.scope],
    ['Timezone', data.timezone],
    ['Currency', data.currency || 'USD'],
    ...[...new URLSearchParams(query)].map(([key, value]) => ['Filter: ' + key, value]),
    [],
  ];
  if (name === 'quarterly-sales') {
    rows.push(
      ['Quarter', 'Orders', 'Ordered value (USD)'],
      ...data.quarters.map((row) => ['Q' + row.quarter, row.orderCount, row.salesAmount]),
    );
  } else if (name === 'top-products') {
    rows.push(
      ['Product ID', 'Product', 'Units', 'Ordered value (USD)'],
      ...data.items.map((row) => [row.productId, row.name, row.quantity, row.salesAmount]),
    );
  } else if (name === 'category-orders') {
    rows.push(
      ['Category ID', 'Category', 'Distinct orders'],
      ...data.items.map((row) => [row.categoryId, row.name, row.orderCount]),
    );
  } else if (name === 'upcoming-deliveries') {
    rows.push(
      [
        'Order',
        'Mode',
        'Status',
        'Original estimate',
        'Actual date',
        'Initial shortage',
        'Overdue',
      ],
      ...data.items.map((row) => [
        row.orderId,
        row.fulfillment === 'pickup' ? 'Pickup' : 'Delivery',
        trackingStatus(row.status),
        row.estimatedDate,
        row.actualDate,
        row.wasOutOfStock ? 'Yes' : 'No',
        row.isOverdue ? 'Yes' : 'No',
      ]),
    );
  } else if (name === 'customer-orders') {
    rows.push(
      ['Customer totals'],
      ['Customer ID', 'Customer', 'Orders', 'Ordered value (USD)', 'Paid (USD)', 'Refunded (USD)'],
      ...data.items.map((row) => [
        row.customerId,
        row.name,
        row.orderCount,
        row.orderedAmount,
        row.paidAmount,
        row.refundedAmount,
      ]),
      [],
      ['Customer orders'],
      ['Customer ID', 'Customer', 'Order', 'Total (USD)', 'Status', 'Payment'],
      ...data.items.flatMap((customer) =>
        customer.orders.map((order) => [
          customer.customerId,
          customer.name,
          order.id,
          order.total,
          trackingStatus(order.status),
          order.paymentStatus,
        ]),
      ),
    );
  } else {
    throw new Error('Unknown report.');
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadReportCsv(name, data, options) {
  const blob = new Blob([reportCsv(name, data, options)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const period = data.year || data.from + '-to-' + data.to;
  link.href = url;
  link.download = 'brightbuy-' + name + '-' + period + '.csv';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Allow the browser to start reading the download before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
