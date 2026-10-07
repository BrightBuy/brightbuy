import { BUSINESS_TIME_ZONE, businessDate, businessDaySql } from '../../../shared/time.js';
import { ApiError } from '../errors.js';
import { inTransaction } from '../utils/transaction.js';

const scope = { timezone: BUSINESS_TIME_ZONE, scope: 'project-orders-usd' };
const project = "JOIN checkout_requests cr ON cr.order_id=o.id WHERE o.currency='USD'";
export const REPORT_QUERIES = {
  quarterly: `SELECT CASE WHEN o.created_at<? THEN 1 WHEN o.created_at<? THEN 2 WHEN o.created_at<? THEN 3 ELSE 4 END AS quarter, COUNT(*) AS orderCount, SUM(o.total) AS salesAmount
    FROM orders o ${project} AND o.status<>'cancelled' AND o.created_at>=? AND o.created_at<? GROUP BY quarter`,
  top: `SELECT p.id AS productId,p.name,SUM(i.quantity) AS quantity,SUM(i.quantity*i.unit_price) AS salesAmount
    FROM orders o JOIN order_items i ON i.order_id=o.id JOIN variants v ON v.id=i.variant_id JOIN products p ON p.id=v.product_id
    ${project} AND o.status<>'cancelled' AND o.created_at>=? AND o.created_at<?
    GROUP BY p.id,p.name ORDER BY quantity DESC,p.id ASC LIMIT ?`,
  categories: `SELECT c.id AS categoryId,c.name,COUNT(DISTINCT eligible.order_id) AS orderCount
    FROM categories c LEFT JOIN (
      SELECT ic.category_id,i.order_id FROM order_item_categories ic JOIN order_items i ON i.id=ic.order_item_id
      JOIN orders o ON o.id=i.order_id ${project} AND o.status<>'cancelled' AND o.created_at>=? AND o.created_at<?
    ) eligible ON eligible.category_id=c.id GROUP BY c.id,c.name ORDER BY c.id`,
  upcoming: `SELECT o.id AS orderId,o.fulfillment,o.status,
    DATE_FORMAT(d.estimated_date,'%Y-%m-%d') AS estimatedDate,DATE_FORMAT(d.actual_date,'%Y-%m-%d') AS actualDate,
    o.was_out_of_stock AS wasOutOfStock,(d.estimated_date<?) AS isOverdue
    FROM deliveries d JOIN orders o ON o.id=d.order_id ${project}
    AND o.status IN ('backordered','confirmed','processing','shipped','ready_for_pickup')
    AND d.estimated_date>=? AND d.estimated_date<? ORDER BY d.estimated_date,o.id`,
  customers: `SELECT c.id AS customerId,c.name,o.id,o.total,o.status,p.status AS paymentStatus,p.amount AS paymentAmount,p.currency AS paymentCurrency
    FROM orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN payments p ON p.order_id=o.id
    ${project} AND o.created_at>=? AND o.created_at<? AND (? IS NULL OR o.customer_id=?) ORDER BY c.id,o.id`,
};

function count(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new ApiError(500, 'REPORT_DATA_INVALID', 'Report count is outside the supported range.');
  return number;
}
function units(value) {
  if (typeof value !== 'string' || !/^\d+\.\d{2}$/.test(value))
    throw new ApiError(409, 'REPORT_DATA_INVALID', 'Report monetary records need review.');
  return BigInt(value.replace('.', ''));
}
const amount = (value) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

export async function readReport(pool, name, input) {
  return inTransaction(pool, async (connection) => {
    if (name === 'quarterly-sales') {
      const [rows] = await connection.execute(REPORT_QUERIES.quarterly, [
        ...['04-01', '07-01', '10-01'].map((day) => businessDaySql(`${input.year}-${day}`)),
        businessDaySql(`${input.year}-01-01`),
        businessDaySql(`${input.year + 1}-01-01`),
      ]);
      const quarters = Array.from({ length: 4 }, (_, index) => ({
        quarter: index + 1,
        orderCount: 0,
        salesAmount: '0.00',
      }));
      for (const row of rows)
        quarters[row.quarter - 1] = {
          quarter: row.quarter,
          orderCount: count(row.orderCount),
          salesAmount: amount(units(row.salesAmount)),
        };
      return { ...scope, year: input.year, currency: 'USD', quarters };
    }
    const period = { ...scope, from: input.from, to: input.to };
    const params =
      name === 'upcoming-deliveries'
        ? [businessDate(), input.from, input.end]
        : [businessDaySql(input.from), businessDaySql(input.end)];
    if (name === 'top-products') {
      const [rows] = await connection.execute(REPORT_QUERIES.top, [...params, input.limit]);
      return {
        ...period,
        currency: 'USD',
        items: rows.map((row) => ({
          ...row,
          quantity: count(row.quantity),
          salesAmount: amount(units(row.salesAmount)),
        })),
      };
    }
    if (name === 'category-orders') {
      const [rows] = await connection.execute(REPORT_QUERIES.categories, params);
      return {
        ...period,
        items: rows.map((row) => ({ ...row, orderCount: count(row.orderCount) })),
      };
    }
    if (name === 'upcoming-deliveries') {
      const [rows] = await connection.execute(REPORT_QUERIES.upcoming, params);
      return {
        ...period,
        items: rows.map((row) => ({
          ...row,
          wasOutOfStock: Boolean(row.wasOutOfStock),
          isOverdue: Boolean(row.isOverdue),
        })),
      };
    }
    const [rows] = await connection.execute(REPORT_QUERIES.customers, [
      ...params,
      input.customerId ?? null,
      input.customerId ?? null,
    ]);
    const groups = new Map();
    for (const row of rows) {
      if (
        row.paymentCurrency !== 'USD' ||
        !['pending', 'paid', 'refunded', 'void'].includes(row.paymentStatus) ||
        row.paymentAmount !== row.total
      ) {
        throw new ApiError(
          409,
          'REPORT_DATA_INCOMPLETE',
          'An order payment needs review before reporting.',
        );
      }
      if (!groups.has(row.customerId))
        groups.set(row.customerId, {
          customerId: row.customerId,
          name: row.name,
          orderCount: 0,
          ordered: 0n,
          paid: 0n,
          refunded: 0n,
          orders: [],
        });
      const group = groups.get(row.customerId),
        total = units(row.total);
      group.orderCount++;
      if (row.status !== 'cancelled') group.ordered += total;
      if (row.paymentStatus === 'paid') group.paid += units(row.paymentAmount);
      if (row.paymentStatus === 'refunded') group.refunded += units(row.paymentAmount);
      group.orders.push({
        id: row.id,
        total: amount(total),
        status: row.status,
        paymentStatus: row.paymentStatus,
      });
    }
    return {
      ...period,
      currency: 'USD',
      items: [...groups.values()].map(({ ordered, paid, refunded, ...group }) => ({
        ...group,
        orderedAmount: amount(ordered),
        paidAmount: amount(paid),
        refundedAmount: amount(refunded),
      })),
    };
  });
}
