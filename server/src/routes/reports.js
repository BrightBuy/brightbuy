import { Router } from 'express';
import { ApiError } from '../errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { readReport } from '../services/reports.js';
const names = [
  'quarterly-sales',
  'top-products',
  'category-orders',
  'upcoming-deliveries',
  'customer-orders',
];
const invalid = (message) => {
  throw new ApiError(400, 'VALIDATION_ERROR', message);
};
function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) invalid('Use real dates in YYYY-MM-DD format.');
  const result = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(result.getTime()) ||
    result.toISOString().slice(0, 10) !== value ||
    Number(value.slice(0, 4)) < 1000 ||
    Number(value.slice(0, 4)) > 9998
  )
    invalid('Use real dates in YYYY-MM-DD format.');
  return result;
}
function integer(value, min, max, label) {
  if (!/^[1-9]\d*$/.test(value || ''))
    invalid(`${label} must be an integer from ${min} to ${max}.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max)
    invalid(`${label} must be an integer from ${min} to ${max}.`);
  return number;
}
export function reportInput(name, url) {
  const query = new URL(url, 'http://localhost').searchParams;
  const allowed =
    name === 'quarterly-sales'
      ? ['year']
      : [
          'from',
          'to',
          ...(name === 'top-products'
            ? ['limit']
            : name === 'customer-orders'
              ? ['customerId']
              : []),
        ];
  for (const key of query.keys())
    if (!allowed.includes(key) || query.getAll(key).length !== 1)
      invalid('Unsupported or repeated query parameter.');
  if (name === 'quarterly-sales') return { year: integer(query.get('year'), 2000, 2100, 'Year') };
  const from = query.get('from'),
    to = query.get('to'),
    start = date(from),
    finish = date(to);
  const days = (finish - start) / 86400000 + 1;
  if (days < 1 || days > 366) invalid('Choose an inclusive range of 1 to 366 days.');
  finish.setUTCDate(finish.getUTCDate() + 1);
  const input = { from, to, end: finish.toISOString().slice(0, 10) };
  if (name === 'top-products')
    input.limit = query.has('limit') ? integer(query.get('limit'), 1, 50, 'Limit') : 10;
  if (name === 'customer-orders' && query.has('customerId'))
    input.customerId = integer(query.get('customerId'), 1, 4294967295, 'Customer ID');
  return input;
}
export function createReportRoutes(db, auth) {
  const router = Router();
  for (const name of names)
    router.get(`/admin/reports/${name}`, auth, requireAdmin, async (req, res) => {
      res.json({ data: await readReport(db, name, reportInput(name, req.originalUrl)) });
    });
  return router;
}
