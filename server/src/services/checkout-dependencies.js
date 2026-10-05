import { ApiError } from '../errors.js';
const broken = (message) => new ApiError(409, 'CHECKOUT_DATA_INVALID', message);
const positive = (value) => Number.isInteger(value) && value > 0 && value <= 4294967295;

export function assertCart(cart) {
  if (!cart || !Number.isInteger(cart.version) || cart.version < 0 ||
      cart.version > 4294967295 || !Array.isArray(cart.items)) {
    throw broken('Cart data needs review.');
  }
}
export function assertDestination(destination, input) {
  if (!destination || typeof destination.isMainCity !== 'boolean' ||
      !destination.snapshot || typeof destination.snapshot !== 'object' ||
      Array.isArray(destination.snapshot)) throw broken('Invalid destination data.');
  const snapshot = destination.snapshot;
  if (snapshot.country !== 'US' || !positive(snapshot.cityId) ||
      typeof snapshot.city !== 'string' || !snapshot.city.trim() ||
      snapshot.isMainCity !== destination.isMainCity) throw broken('Invalid destination snapshot.');
  if (input.fulfillment === 'delivery') {
    if (destination.addressId !== input.addressId || destination.storeId !== null ||
        typeof snapshot.recipient !== 'string' || !snapshot.recipient.trim() ||
        typeof snapshot.line1 !== 'string' || !snapshot.line1.trim()) {
      throw broken('Invalid delivery address data.');
    }
  } else if (destination.storeId !== input.storeId || destination.addressId !== null ||
      snapshot.storeId !== input.storeId || typeof snapshot.storeName !== 'string' ||
      !snapshot.storeName.trim() || typeof snapshot.addressLine !== 'string' ||
      !snapshot.addressLine.trim()) throw broken('Invalid pickup destination data.');
  // Ownership, active status and Texas membership still belong to M5's locked lookup.
}
export function assertDeliveryDays(days, isMainCity, shortage) {
  const expected = (isMainCity ? 5 : 7) + (shortage ? 3 : 0);
  if (!Number.isInteger(days) || days !== expected) throw broken('Invalid delivery estimate result.');
}
