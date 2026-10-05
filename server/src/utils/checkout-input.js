import { createHash } from 'node:crypto';
import { ApiError } from '../errors.js';

export const MAX_VERSION = 4294967295;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function invalid(message) {
  throw new ApiError(400, 'VALIDATION_ERROR', message);
}
function plainObject(value) {
  if (!value || typeof value !== 'object' ||
      Object.getPrototypeOf(value) !== Object.prototype) invalid('Provide a JSON object.');
}
function exactKeys(value, expected) {
  if (Object.keys(value).length !== expected.length ||
      expected.some((key) => !Object.hasOwn(value, key))) {
    invalid(`Provide only: ${expected.join(', ')}.`);
  }
}
export function requestKey(value) {
  if (typeof value !== 'string' || !UUID.test(value)) invalid('Provide a UUID requestKey.');
  return value.toLowerCase();
}
function jsonId(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 4294967295) {
    invalid('Destination ID must be a positive JSON integer.');
  }
  return value;
}
export function validateCheckout(body) {
  plainObject(body);
  if (!['delivery', 'pickup'].includes(body.fulfillment)) invalid('Choose delivery or pickup.');
  if (!['cod', 'card'].includes(body.paymentMethod)) invalid('Choose COD or simulated card.');
  const destination = body.fulfillment === 'delivery' ? 'addressId' : 'storeId';
  const keys = ['fulfillment', destination, 'paymentMethod', 'cartVersion', 'requestKey'];
  if (body.paymentMethod === 'card') keys.push('simulationToken');
  exactKeys(body, keys);
  if (!Number.isInteger(body.cartVersion) || body.cartVersion < 0 ||
      body.cartVersion > MAX_VERSION) invalid('Invalid cartVersion.');
  if (body.paymentMethod === 'card' &&
      !['demo-approved', 'demo-declined'].includes(body.simulationToken)) {
    invalid('Use an approved or declined simulation token.');
  }
  return {
    fulfillment: body.fulfillment,
    addressId: destination === 'addressId' ? jsonId(body.addressId) : null,
    storeId: destination === 'storeId' ? jsonId(body.storeId) : null,
    paymentMethod: body.paymentMethod,
    simulationToken: body.paymentMethod === 'card' ? body.simulationToken : null,
    cartVersion: body.cartVersion,
    requestKey: requestKey(body.requestKey),
  };
}
export function checkoutFingerprint(input) {
  // Fixed field order; no prices, timestamps or requestKey in the fingerprint.
  const canonical = JSON.stringify([
    input.fulfillment, input.addressId, input.storeId,
    input.paymentMethod, input.simulationToken, input.cartVersion,
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}
export function validateCancellation(body) {
  plainObject(body);
  exactKeys(body, ['requestKey', 'reason']);
  if (typeof body.reason !== 'string' || !body.reason.trim() ||
      body.reason.trim().length > 200) invalid('Reason must contain 1–200 characters.');
  return { requestKey: requestKey(body.requestKey), reason: body.reason.trim() };
}
