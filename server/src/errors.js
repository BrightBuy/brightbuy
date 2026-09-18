export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
export function positiveId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))
    throw new ApiError(400, 'VALIDATION_ERROR', 'ID must be a positive integer.');
  return Number(value);
}
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed')
    error = new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  if (error.type === 'entity.too.large')
    error = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  // Body-parser rejects unsupported encodings before the route is called.
  // These are client request errors, not internal server failures.
  if (['charset.unsupported', 'encoding.unsupported'].includes(error.type))
    error = new ApiError(
      415,
      'UNSUPPORTED_ENCODING',
      'Use a supported JSON charset and content encoding.',
    );
  if (error.status === 400 && ['Z_DATA_ERROR', 'Z_BUF_ERROR'].includes(error.code))
    error = new ApiError(400, 'INVALID_JSON', 'Request body must contain valid encoded JSON.');
  const known = error instanceof ApiError;
  if (!known) console.error({ requestId: req.id, message: error.message });
  res.status(known ? error.status : 500).json({
    error: {
      code: known ? error.code : 'INTERNAL_ERROR',
      message: known ? error.message : 'An unexpected error occurred.',
      details: known ? error.details : [],
      requestId: req.id,
    },
  });
}
