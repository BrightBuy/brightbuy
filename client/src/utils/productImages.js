/**
 * Curated high-resolution tech product photos for BrightBuy catalogue.
 * Mapped by specific product names/brands and fallback category keywords.
 */

const PRODUCT_IMAGES = {
  'Wireless Headphones': 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
  'Bluetooth Speaker': 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=600&q=80',
  'Robot Building Kit': '/images/toy-blocks.svg',
  // Smartphones
  'Nova X1 Pro': 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=600&q=80',
  'Nova A5 Lite': 'https://images.unsplash.com/photo-1567581935884-3349723552ca?auto=format&fit=crop&w=600&q=80',
  'Pixel 8A': 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=600&q=80',
  'Orbit S22': 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?auto=format&fit=crop&w=600&q=80',
  'Swift Z9': 'https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=600&q=80',
  'Nova Fold 2': 'https://images.unsplash.com/photo-1565849904461-04a58ad377e0?auto=format&fit=crop&w=600&q=80',

  // Laptops
  'Apex Book 15': 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=600&q=80',
  'Titan Pro 14': 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80',
  'Zephyr Air 13': 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=600&q=80',
  'ProBook X360': 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=600&q=80',
  'Swift Edu 11': 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?auto=format&fit=crop&w=600&q=80',

  // Audio / Headphones
  'Aura NC700': 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
  'Sonix WH-1000': 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=600&q=80',
  'Beats Fit Pro': 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=600&q=80',
  'Nova Buds 3': 'https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?auto=format&fit=crop&w=600&q=80',
  'Zephyr OpenFit': 'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?auto=format&fit=crop&w=600&q=80',
  'Boom Charge 5': 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=600&q=80',

  // Accessories
  'Nova MagSafe Stand': 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80',
  'Fast Charge 65W': 'https://images.unsplash.com/photo-1622445262464-84b1456045b6?auto=format&fit=crop&w=600&q=80',
};

const DEFAULT_TOY_IMAGE = '/images/toy-blocks.svg';
const CATEGORY_FALLBACKS = {
  Toys: '/images/toy-blocks.svg',
  Smartphones: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=600&q=80',
  Laptops: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=600&q=80',
  Headphones: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
  Speakers: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=600&q=80',
  Cameras: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80',
  Gaming: 'https://images.unsplash.com/photo-1600080972464-8e5f35f63d08?auto=format&fit=crop&w=600&q=80',
  Tablets: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=600&q=80',
  'Smart Home': 'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=600&q=80',
  Wearables: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80',
  Accessories: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80',
};

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80';

export function getProductImage(product) {
  if (!product) return DEFAULT_IMAGE;

  // Direct match by product name
  if (PRODUCT_IMAGES[product.name]) {
    return PRODUCT_IMAGES[product.name];
  }

  // Prefer the assigned category over ambiguous brand/name keywords.
  for (const category of product.categories || []) {
    const name = typeof category === 'string' ? category : category.name;
    if (CATEGORY_FALLBACKS[name]) return CATEGORY_FALLBACKS[name];
  }

  // Name keyword matching
  const lowerName = (product.name || '').toLowerCase();
  if (/robot|building kit|toy|blocks|puzzle/.test(lowerName)) return DEFAULT_TOY_IMAGE;
  if (/headphone|earphone|earbud/.test(lowerName)) return CATEGORY_FALLBACKS.Headphones;
  if (lowerName.includes('phone') || lowerName.includes('pixel') || lowerName.includes('orbit') || lowerName.includes('swift z') || lowerName.includes('nova')) {
    return 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=600&q=80';
  }
  if (lowerName.includes('book') || lowerName.includes('pro') || lowerName.includes('air') || lowerName.includes('titan') || lowerName.includes('laptop')) {
    return 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=600&q=80';
  }
  if (lowerName.includes('bud') || lowerName.includes('fit') || lowerName.includes('ear') || lowerName.includes('sonix') || lowerName.includes('aura') || lowerName.includes('headphone')) {
    return 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80';
  }
  if (lowerName.includes('speaker') || lowerName.includes('boom') || lowerName.includes('sound')) {
    return 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=600&q=80';
  }
  if (lowerName.includes('camera') || lowerName.includes('lens')) {
    return 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80';
  }
  if (lowerName.includes('watch') || lowerName.includes('band')) {
    return 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80';
  }
  if (lowerName.includes('stand') || lowerName.includes('charge') || lowerName.includes('cable')) {
    return 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80';
  }

  // Category fallback
  if (product.categories && product.categories.length > 0) {
    const catName = typeof product.categories[0] === 'string' ? product.categories[0] : product.categories[0]?.name;
    if (catName && CATEGORY_FALLBACKS[catName]) {
      return CATEGORY_FALLBACKS[catName];
    }
  }

  return DEFAULT_IMAGE;
}

/**
 * Returns dynamic AliExpress-style marketing stats for display
 */
export function getProductMarketingData(product, index = 0) {
  // Deterministic seed based on product ID
  const id = Number(product.id) || (index + 1);
  const discountPercent = 15 + ((id * 7) % 55); // 15% to 69% discount
  const rating = (4.3 + ((id * 3) % 7) * 0.1).toFixed(1); // 4.3 to 4.9
  const soldCount = 500 + ((id * 317) % 8500); // e.g. 1,200+ sold
  const hasChoice = id % 2 === 0;

  return {
    discountPercent,
    rating,
    soldCount: soldCount > 1000 ? `${(soldCount / 1000).toFixed(1)}k+` : `${soldCount}+`,
    isChoice: hasChoice,
  };
}
