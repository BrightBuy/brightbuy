const KEY = 'brightbuy:guest-cart';
export function guestCart(storage = sessionStorage) {
  const read = () => {
    const raw = storage.getItem(KEY);
    if (!raw) return { items: [] };
    try { const value = JSON.parse(raw); if (Array.isArray(value.items)) return value; } catch {}
    throw new Error('The guest cart could not be read. Clear the guest cart to start again.');
  };
  const save = value => { storage.setItem(KEY, JSON.stringify(value)); return value; };
  return {
    read,
    clear: () => storage.removeItem(KEY),
    set(product, variant, quantity) {
      const cart = read();
      if (cart.pending) throw new Error('Retry the pending cart transfer before changing these items.');
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) throw new Error('Choose a quantity from 1 to 99.');
      cart.items = cart.items.filter(line => line.variantId !== variant.id);
      if (quantity) cart.items.push({ productId: product.id, variantId: variant.id, quantity });
      if (cart.items.length > 100) throw new Error('Your cart can contain up to 100 variants.');
      return save(cart);
    },
    async merge(api, customerId) {
      const cart = read();
      if (!cart.items.length) return;
      if (cart.pending && cart.pending.customerId !== customerId) throw new Error('Sign in to the account that started this cart transfer to retry it.');
      const pending = cart.pending || { customerId, requestKey: crypto.randomUUID(), items: cart.items.map(({ variantId, quantity }) => ({ variantId, quantity })) };
      save({ ...cart, pending });
      try {
        const result = await api('/cart/merge', { method: 'POST', body: JSON.stringify({ requestKey: pending.requestKey, items: pending.items }) });
        storage.removeItem(KEY);
        return result;
      } catch (error) {
        // Known validation failures rolled back. Unknown outcomes retain the exact key.
        if ([400, 404, 409].includes(error.status) && error.code !== 'IDEMPOTENCY_CONFLICT') save({ items: cart.items });
        throw error;
      }
    },
    async load(api) {
      const cart = read();
      const items = await Promise.all(cart.items.map(async line => {
        let product;
        try { product = await api('/products/' + line.productId); }
        catch (error) { if (error.status !== 404) throw error; }
        const variant = product?.variants?.find(v => v.id === line.variantId);
        const available = Boolean(variant && product.currency === 'USD');
        const unitPrice = variant?.price || '0.00';
        const units = BigInt(unitPrice.replace('.', '')) * BigInt(line.quantity);
        return { ...line, productName: product?.name || 'Unavailable product', variantName: variant?.name || 'Unavailable variant', sku: variant?.sku || '', stock: variant?.stock || 0, unitPrice, lineTotal: (units / 100n) + '.' + String(units % 100n).padStart(2, '0'), available, shortage: available && line.quantity > variant.stock };
      }));
      const total = items.filter(i => i.available).reduce((sum, i) => sum + BigInt(i.lineTotal.replace('.', '')), 0n);
      return { items, currency: 'USD', total: (total / 100n) + '.' + String(total % 100n).padStart(2, '0'), hasShortage: items.some(i => i.shortage) };
    },
  };
}
export function addGuestItem(product, variant, quantity, storage = sessionStorage) {
  const cart = guestCart(storage);
  const existing = cart.read().items.find(line => line.variantId === variant.id);
  return cart.set(product, variant, (existing?.quantity || 0) + Number(quantity));
}
