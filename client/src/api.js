export class ApiRequestError extends Error {
  constructor(message, { status = 0, code = 'REQUEST_FAILED', requestId } = {}) {
    super(message);
    this.name = 'ApiRequestError';
    Object.assign(this, { status, code, requestId });
  }
}

// An independent client lets tests simulate network races without a browser.
export function createApiClient({
  fetchImpl = (...args) => fetch(...args),
  onUnauthorized = () => {},
} = {}) {
  let token = null;
  let sessionVersion = 0;
  function setToken(value) {
    token = value;
    sessionVersion += 1;
  }

  async function api(path, options = {}) {
    const requestToken = token;
    const requestVersion = sessionVersion;
    const headers = new Headers(options.headers);
    if (options.body && !headers.has('Content-Type'))
      headers.set('Content-Type', 'application/json');
    if (requestToken) headers.set('Authorization', `Bearer ${requestToken}`);

    let response;
    try {
      response = await fetchImpl(`/api${path}`, { ...options, headers });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new ApiRequestError('Cannot reach the server. Check your connection and try again.', {
        code: 'NETWORK_ERROR',
      });
    }

    // A delayed 401 from the old session must not log out a newly signed-in user.
    if (
      response.status === 401 &&
      path !== '/auth/login' &&
      requestToken &&
      token === requestToken &&
      sessionVersion === requestVersion
    ) {
      token = null;
      sessionVersion += 1;
      onUnauthorized();
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      // Fetch can also be cancelled after headers arrive, while reading the body.
      if (error.name === 'AbortError') throw error;
      // A stopped API may make Vite return an empty/HTML proxy error, not JSON.
      throw new ApiRequestError('The server returned an unreadable response. Please try again.', {
        status: response.status,
        code: 'INVALID_RESPONSE',
      });
    }
    if (!response.ok) {
      throw new ApiRequestError(payload?.error?.message || 'Request failed.', {
        status: response.status,
        code: payload?.error?.code,
        requestId: payload?.error?.requestId,
      });
    }
    if (!payload || !Object.hasOwn(payload, 'data')) {
      throw new ApiRequestError('The server returned an unexpected response. Please try again.', {
        status: response.status,
        code: 'INVALID_RESPONSE',
      });
    }
    if (requestToken && path !== '/auth/login' && requestVersion !== sessionVersion) {
      throw new ApiRequestError('Your session changed. Reload this page before continuing.', {
        status: 401, code: 'UNAUTHENTICATED',
      });
    }
    return payload.data;
  }
  return { api, setToken };
}

export const { api, setToken } = createApiClient({
  onUnauthorized: () => window.dispatchEvent(new Event('session-expired')),
});
