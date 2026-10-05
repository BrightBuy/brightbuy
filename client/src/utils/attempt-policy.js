const reviewCodes = new Set([
  'VALIDATION_ERROR', 'PAYMENT_DECLINED', 'CART_CHANGED', 'EMPTY_CART',
  'VARIANT_UNAVAILABLE', 'CART_LIMIT_EXCEEDED', 'CART_TOTAL_EXCEEDED',
  'DESTINATION_UNSUPPORTED', 'INVALID_STATUS_TRANSITION',
  'LEGACY_ORDER_REQUIRES_MIGRATION',
]);
export function attemptPolicy(error) {
  if (reviewCodes.has(error.code)) return 'review';
  if (['IDEMPOTENCY_CONFLICT', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND',
       'ORDER_DATA_INCOMPLETE', 'CHECKOUT_DATA_INVALID', 'PAYMENT_STATE_CONFLICT',
       'CART_VERSION_EXHAUSTED'].includes(error.code)) return 'resolve';
  if (error.code === 'TRANSACTION_RETRY' || error.code === 'TRANSACTION_OUTCOME_UNKNOWN' ||
      error.code === 'REQUEST_TIMEOUT' || error.code === 'NETWORK_ERROR' || error.code === 'INVALID_RESPONSE' ||
      error.name === 'AbortError' || !error.status || error.status >= 500) return 'retry';
  return 'resolve';
}
