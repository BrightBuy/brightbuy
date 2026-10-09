import { variantColor } from './variant-colors.js';

// Product-specific studio illustrations for the bundled demo catalogue.
// Storage-only variants share their model's appearance; colours and packs have their own photos.
export const DEMO_PRODUCT_IMAGES = {
  'BB-TOY-BLOCKS': {
    standard: 'toy-blocks',
    colors: {},
    configurations: {},
  },
  'BB-TOY-ROBOT': {
    standard: 'toy-robot',
    colors: {},
    configurations: {},
  },
  'BB-TOY-RACER': {
    standard: 'toy-car',
    colors: {},
    configurations: {},
  },
  'BB-TOY-PUZZLE': {
    standard: 'toy-puzzle',
    colors: {},
    configurations: {},
  },
  'NOVA-X1-PRO': {
    standard: 'phone-black',
    colors: {
      black: 'phone-black',
      silver: 'nova-x1-pro-silver',
    },
    configurations: {},
  },
  'NOVA-A5-LITE': {
    standard: 'phone-blue',
    colors: {
      blue: 'phone-blue',
    },
    configurations: {},
  },
  'PIXEL-8A': {
    standard: 'pixel-8a-coral',
    colors: {
      coral: 'pixel-8a-coral',
      obsidian: 'pixel-8a-obsidian',
    },
    configurations: {},
  },
  'ORBIT-S22': {
    standard: 'phone-green',
    colors: {
      green: 'phone-green',
    },
    configurations: {},
  },
  'SWIFT-Z9': {
    standard: 'swift-z9-black',
    colors: {
      black: 'swift-z9-black',
    },
    configurations: {},
  },
  'NOVA-FOLD-2': {
    standard: 'nova-fold-2-black',
    colors: {
      black: 'nova-fold-2-black',
      silver: 'nova-fold-2-silver',
    },
    configurations: {},
  },
  'APEX-BOOK-15': {
    standard: 'laptop-silver',
    colors: {},
    configurations: {},
  },
  'TITAN-PRO-14': {
    standard: 'titan-pro-14-standard',
    colors: {},
    configurations: {},
  },
  'ZEPHYR-AIR-13': {
    standard: 'zephyr-air-13-standard',
    colors: {},
    configurations: {},
  },
  'PROBOOK-X360': {
    standard: 'probook-x360-standard',
    colors: {},
    configurations: {},
  },
  'SWIFT-EDU-11': {
    standard: 'swift-edu-11-standard',
    colors: {},
    configurations: {},
  },
  'AURA-NC700': {
    standard: 'aura-nc700-black',
    colors: {
      black: 'aura-nc700-black',
      silver: 'aura-nc700-silver',
    },
    configurations: {},
  },
  'SONIX-WH-1000': {
    standard: 'headphones-black',
    colors: {
      black: 'headphones-black',
      white: 'sonix-wh-1000-white',
    },
    configurations: {},
  },
  'BEATS-FIT-PRO': {
    standard: 'beats-fit-pro-black',
    colors: {
      black: 'beats-fit-pro-black',
      white: 'beats-fit-pro-white',
      purple: 'beats-fit-pro-purple',
    },
    configurations: {},
  },
  'NOVA-BUDS-3': {
    standard: 'nova-buds-3-black',
    colors: {
      black: 'nova-buds-3-black',
      white: 'nova-buds-3-white',
    },
    configurations: {},
  },
  'ZEPHYR-OPENFIT': {
    standard: 'zephyr-openfit-black',
    colors: {
      black: 'zephyr-openfit-black',
    },
    configurations: {},
  },
  'BOOM-CHARGE5': {
    standard: 'speaker-black',
    colors: {
      black: 'speaker-black',
      blue: 'boom-charge5-blue',
    },
    configurations: {},
  },
  'SONIX-SRS-XB43': {
    standard: 'sonix-srs-xb43-black',
    colors: {
      black: 'sonix-srs-xb43-black',
      red: 'sonix-srs-xb43-red',
    },
    configurations: {},
  },
  'ECHO-DOT5': {
    standard: 'smart-speaker-charcoal',
    colors: {
      charcoal: 'smart-speaker-charcoal',
      'glacier white': 'smart-speaker-white',
    },
    configurations: {},
  },
  'APEX-PARTY-BOX': {
    standard: 'party-speaker-black',
    colors: {
      black: 'party-speaker-black',
    },
    configurations: {},
  },
  'LUMIX-G9II': {
    standard: 'lumix-g9ii-standard',
    colors: {},
    configurations: {},
  },
  'CANON-R50': {
    standard: 'canon-r50-black',
    colors: {
      black: 'canon-r50-black',
      white: 'canon-r50-white',
    },
    configurations: {},
  },
  'SONY-ZVE10': {
    standard: 'sony-zve10-black',
    colors: {
      black: 'sony-zve10-black',
      white: 'sony-zve10-white',
    },
    configurations: {},
  },
  'INSTAX-MINI12': {
    standard: 'instant-camera-pink',
    colors: {
      pink: 'instant-camera-pink',
      blue: 'instant-camera-blue',
      white: 'instant-camera-white',
    },
    configurations: {},
  },
  'NOVA-CTRL-PRO': {
    standard: 'controller-white',
    colors: {
      white: 'controller-white',
      black: 'controller-black',
    },
    configurations: {},
  },
  'TITAN-HEADSET-G7': {
    standard: 'gaming-headset-black',
    colors: {
      black: 'gaming-headset-black',
    },
    configurations: {},
  },
  'VORTEX-PAD-XL': {
    standard: 'mousepad-black',
    colors: {
      black: 'mousepad-black',
      red: 'mousepad-red',
    },
    configurations: {},
  },
  'ORBIT-CHAIR-GT': {
    standard: 'chair-black-red',
    colors: {
      'black / red': 'chair-black-red',
      'white / blue': 'chair-white-blue',
    },
    configurations: {},
  },
  'APEX-PAD-11': {
    standard: 'tablet-grey',
    colors: {
      grey: 'tablet-grey',
    },
    configurations: {},
  },
  'NOVA-TAB-S9': {
    standard: 'nova-tab-s9-graphite',
    colors: {
      graphite: 'nova-tab-s9-graphite',
    },
    configurations: {},
  },
  'PROBOOK-TAB-MINI': {
    standard: 'probook-tab-mini-standard',
    colors: {},
    configurations: {},
  },
  'NOVA-SMART-PLUG-WIFI': {
    standard: 'plug-white',
    colors: {},
    configurations: {
      'four pack': 'nova-smart-plug-four',
    },
  },
  'LUMIO-BULB-E27': {
    standard: 'bulb-white',
    colors: {},
    configurations: {
      'three pack': 'lumio-bulb-three',
    },
  },
  'ECHO-SHOW8': {
    standard: 'display-charcoal',
    colors: {
      charcoal: 'display-charcoal',
      'glacier white': 'display-white',
    },
    configurations: {},
  },
  'VORTEX-CAM-360': {
    standard: 'security-camera-white',
    colors: {
      white: 'security-camera-white',
    },
    configurations: {},
  },
  'NOVA-WATCH-6': {
    standard: 'nova-watch-6-black',
    colors: {
      black: 'nova-watch-6-black',
      gold: 'nova-watch-6-gold',
    },
    configurations: {},
  },
  'PIXEL-WATCH-3': {
    standard: 'pixel-watch-3-obsidian',
    colors: {
      obsidian: 'pixel-watch-3-obsidian',
    },
    configurations: {},
  },
  'ORBIT-BAND-7': {
    standard: 'band-black',
    colors: {
      black: 'band-black',
      pink: 'band-pink',
    },
    configurations: {},
  },
  'AURA-SPORT-WATCH': {
    standard: 'aura-sport-watch-black',
    colors: {
      black: 'aura-sport-watch-black',
      orange: 'aura-sport-watch-orange',
    },
    configurations: {},
  },
  'ZEPHYR-CHARGE-100W': {
    standard: 'zephyr-charge-100w-white',
    colors: {
      white: 'zephyr-charge-100w-white',
      black: 'zephyr-charge-100w-black',
    },
    configurations: {},
  },
  'LUMIO-USB-C-CABLE-2M': {
    standard: 'cable-black',
    colors: {
      black: 'cable-black',
      white: 'cable-white',
    },
    configurations: {},
  },
  'APEX-HUB-7IN1': {
    standard: 'hub-grey',
    colors: {
      'space grey': 'hub-grey',
    },
    configurations: {},
  },
  'NOVA-MAGSAFE-STAND': {
    standard: 'stand-white',
    colors: {
      white: 'stand-white',
      black: 'stand-black',
    },
    configurations: {},
  },
  'LEGACY-PRD-1': {
    standard: 'headphones-navy',
    colors: {
      navy: 'headphones-navy',
      white: 'legacy-headphones-white',
    },
    configurations: {},
  },
  'LEGACY-PRD-2': {
    standard: 'speaker-sage',
    colors: {
      sage: 'speaker-sage',
      black: 'legacy-speaker-black',
    },
    configurations: {},
  },
  'LEGACY-PRD-3': {
    standard: 'legacy-robot-standard',
    colors: {},
    configurations: {},
  },
};

export const IMAGE_PLACEHOLDER = '/images/product-image-unavailable.svg';
export function getProductImage(product, variant) {
  const entry = DEMO_PRODUCT_IMAGES[product?.sku];
  if (!entry) return IMAGE_PLACEHOLDER;
  const selected =
    variant ??
    product.defaultVariant ??
    product.variants?.find((v) => v.isDefault) ??
    product.variants?.[0];
  const configuration = entry.configurations[selected?.name?.trim().toLowerCase()];
  const color = variantColor(selected)?.trim().toLowerCase();
  const asset = configuration || (color ? entry.colors[color] : entry.standard);
  return asset ? '/images/studio/' + asset + '.webp' : IMAGE_PLACEHOLDER;
}
