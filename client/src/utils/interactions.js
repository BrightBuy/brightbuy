export function returnPath(value, role) {
  const fallback = role === 'admin' ? '/admin' : role === 'warehouse' ? '/warehouse' : '/account/orders';
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') ||
      value.includes('\\') || /^\/(login|register)(?:[/?#]|$)/.test(value)) return fallback;
  if (role !== 'admin' && /^\/admin(?:[/?#]|$)/.test(value)) return fallback;
  return value;
}

export function quantity(value) {
  if (!/^\d+$/.test(String(value))) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 99 ? parsed : null;
}

// PUT sets a quantity; adding must include the existing line. Serialize adds in this tab.
let cartQueue = Promise.resolve();
export function addCartItem(api, variantId, amount) {
  const operation = cartQueue.catch(() => {}).then(async () => {
    if (quantity(amount) === null) throw new Error('Enter a whole quantity from 1 to 99.');
    const cart = await api('/cart');
    const count = (cart.items.find((item) => item.variantId === variantId)?.quantity || 0) + Number(amount);
    if (count > 99) throw new Error('A cart line can contain at most 99 items. Review your cart.');
    return api(`/cart/items/${variantId}`, { method: 'PUT', body: JSON.stringify({ quantity: count }) });
  });
  cartQueue = operation;
  return operation;
}

export function pendingAttempt(storage, key) {
  return {
    read() {
      try {
        const item = JSON.parse(storage.getItem(key));
        return item && typeof item.requestKey === 'string' ? item : null;
      } catch { return null; }
    },
    save(payload) {
      try { storage.setItem(key, JSON.stringify(payload)); }
      catch { throw new Error('Your browser cannot save this attempt. Enable session storage before submitting.'); }
      return payload;
    },
    clear() { try { storage.removeItem(key); } catch { /* Successful server result is still authoritative. */ } },
  };
}
