// Aborting the HTTP wait does not undo a server transaction.
// The caller must retain this same payload/requestKey after a timeout.
export async function postAttempt(api, path, payload, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await api(path, {
      method: 'POST', body: JSON.stringify(payload), signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error('The request timed out. Its result may already be saved.'), {
        code: 'REQUEST_TIMEOUT',
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
