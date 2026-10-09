// Project product seed — M1 Milestone E
// Creates electronics and toy categories, 8 attributes and 40+ active products.
// Existing product SKUs and the project-v1 marker preserve administrator edits.
// Run via: npm run seed:project (from server/)

export async function seedProjectData(connection) {
  const [seeded] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ?',
    ['project-v1'],
  );

  // ── 1. Categories ────────────────────────────────────────────────────────
  const categories = [
    ['Toys', 'Building sets, puzzles and remote-control toys.'],
    ['Smartphones', 'Latest smartphones from top brands.'],
    ['Laptops', 'Powerful laptops for work, study and gaming.'],
    ['Headphones', 'Over-ear, on-ear and in-ear headphones.'],
    ['Speakers', 'Portable and home speaker systems.'],
    ['Cameras', 'Digital cameras, lenses and accessories.'],
    ['Gaming', 'Consoles, controllers, games and accessories.'],
    ['Tablets', 'Android, iOS and Windows tablets.'],
    ['Smart Home', 'Smart plugs, bulbs, displays and hubs.'],
    ['Wearables', 'Smartwatches, fitness bands and earbuds.'],
    ['Accessories', 'Cables, chargers, cases and more.'],
  ];
  for (const [name, description] of categories) {
    await connection.execute(
      'INSERT IGNORE INTO categories (name, description) VALUES (?, ?)',
      [name, description],
    );
  }

  // Fetch category IDs by name so inserts are stable across runs
  const [catRows] = await connection.query('SELECT id, name FROM categories');
  const catId = Object.fromEntries(catRows.map((r) => [r.name, r.id]));

  // ── 2. Attributes ────────────────────────────────────────────────────────
  const attributeNames = ['Color', 'Storage', 'RAM', 'Size', 'Connectivity', 'Battery', 'Lens', 'Band'];
  for (const name of attributeNames) {
    await connection.execute('INSERT IGNORE INTO attributes (name) VALUES (?)', [name]);
  }
  const [attrRows] = await connection.query('SELECT id, name FROM attributes');
  const attrId = Object.fromEntries(attrRows.map((r) => [r.name, r.id]));

  // ── Helper: insert one product with variants ─────────────────────────────
  // Each variantDef: { sku, name, price (string '0.00'), attrs: [{attr, value}], isDefault? }
  async function insertProduct({ sku, name, description, brand, categoryNames, variants }) {
    // Check idempotency by SKU
    const [existing] = await connection.execute(
      'SELECT id FROM products WHERE sku = ?',
      [sku],
    );
    if (existing.length) return; // already exists

    const [res] = await connection.execute(
      `INSERT INTO products (sku, name, description, brand, currency, is_active, is_legacy)
       VALUES (?, ?, ?, ?, 'USD', 1, 0)`,
      [sku, name, description, brand],
    );
    const productId = res.insertId;

    // Assign categories
    for (const catName of categoryNames) {
      await connection.execute(
        'INSERT IGNORE INTO product_categories (product_id, category_id) VALUES (?, ?)',
        [productId, catId[catName]],
      );
    }

    // Insert variants
    let defaultSet = false;
    for (const v of variants) {
      const isDefault = v.isDefault || (!defaultSet && v === variants[0]) ? 1 : 0;
      if (isDefault) defaultSet = true;

      // Build canonical combination key: attr:<id>=<lowercase_trim>|... sorted by attrId
      const attrPairs = (v.attrs || [])
        .map((a) => ({ id: attrId[a.attr], value: a.value.trim().toLowerCase() }))
        .sort((a, b) => a.id - b.id);
      const combinationKey = attrPairs.length
        ? attrPairs.map((a) => `attr:${a.id}=${a.value}`).join('|')
        : null;

      const [vRes] = await connection.execute(
        `INSERT INTO variants (product_id, sku, name, price, stock, is_active, is_default, combination_key)
         VALUES (?, ?, ?, ?, 0, 1, ?, ?)`,
        [productId, v.sku, v.name, v.price, isDefault, combinationKey],
      );
      const variantId = vRes.insertId;

      // Insert attribute values
      for (const a of v.attrs || []) {
        await connection.execute(
          'INSERT IGNORE INTO variant_attribute_values (variant_id, attribute_id, value) VALUES (?, ?, ?)',
          [variantId, attrId[a.attr], a.value],
        );
      }
    }
  }

  // Add these on existing seeded installations too; SKU checks preserve edits.
  for (const [sku, name, description, price] of [
    ['BB-TOY-BLOCKS', 'Creative Building Blocks', 'A 120-piece construction set for imaginative play, ages 6 and up.', '29.99'],
    ['BB-TOY-ROBOT', 'Explorer Robot Kit', 'Build and explore with a beginner robot toy kit, ages 8 and up.', '49.99'],
    ['BB-TOY-RACER', 'Remote Control Racer', 'Rechargeable remote-control toy car, ages 8 and up.', '34.99'],
    ['BB-TOY-PUZZLE', 'Space Explorer Puzzle', 'A 100-piece space puzzle for family play, ages 6 and up.', '14.99'],
  ]) {
    await insertProduct({ sku, name, description, brand: 'BrightBuy Play', categoryNames: ['Toys'],
      variants: [{ sku: sku + '-STD', name: 'Standard', price, attrs: [] }] });
  }
  if (seeded.length) return;

  // ── 3. Products (40+) ────────────────────────────────────────────────────

  // ── Smartphones (6 products) ─────────────────────────────────────────────
  await insertProduct({
    sku: 'NOVA-X1-PRO',
    name: 'Nova X1 Pro',
    description: 'Flagship smartphone with a 6.7-inch AMOLED display and 200 MP camera.',
    brand: 'Nova',
    categoryNames: ['Smartphones'],
    variants: [
      { sku: 'NOVA-X1-PRO-128-BLK', name: 'Black / 128 GB', price: '1299.00', attrs: [{ attr: 'Color', value: 'Black' }, { attr: 'Storage', value: '128 GB' }], isDefault: true },
      { sku: 'NOVA-X1-PRO-256-BLK', name: 'Black / 256 GB', price: '1499.00', attrs: [{ attr: 'Color', value: 'Black' }, { attr: 'Storage', value: '256 GB' }] },
      { sku: 'NOVA-X1-PRO-256-SLV', name: 'Silver / 256 GB', price: '1499.00', attrs: [{ attr: 'Color', value: 'Silver' }, { attr: 'Storage', value: '256 GB' }] },
    ],
  });

  await insertProduct({
    sku: 'NOVA-A5-LITE',
    name: 'Nova A5 Lite',
    description: 'Mid-range smartphone with 5000 mAh battery and fast charging.',
    brand: 'Nova',
    categoryNames: ['Smartphones'],
    variants: [
      { sku: 'NOVA-A5-LITE-64-BLU', name: 'Blue / 64 GB', price: '549.00', attrs: [{ attr: 'Color', value: 'Blue' }, { attr: 'Storage', value: '64 GB' }], isDefault: true },
      { sku: 'NOVA-A5-LITE-128-BLU', name: 'Blue / 128 GB', price: '649.00', attrs: [{ attr: 'Color', value: 'Blue' }, { attr: 'Storage', value: '128 GB' }] },
    ],
  });

  await insertProduct({
    sku: 'PIXEL-8A',
    name: 'Pixel 8A',
    description: 'AI-powered smartphone with guaranteed OS updates for 7 years.',
    brand: 'Google',
    categoryNames: ['Smartphones'],
    variants: [
      { sku: 'PIXEL-8A-128-CRL', name: 'Coral / 128 GB', price: '999.00', attrs: [{ attr: 'Color', value: 'Coral' }, { attr: 'Storage', value: '128 GB' }], isDefault: true },
      { sku: 'PIXEL-8A-256-CRL', name: 'Coral / 256 GB', price: '1199.00', attrs: [{ attr: 'Color', value: 'Coral' }, { attr: 'Storage', value: '256 GB' }] },
      { sku: 'PIXEL-8A-128-OBS', name: 'Obsidian / 128 GB', price: '999.00', attrs: [{ attr: 'Color', value: 'Obsidian' }, { attr: 'Storage', value: '128 GB' }] },
    ],
  });

  await insertProduct({
    sku: 'ORBIT-S22',
    name: 'Orbit S22',
    description: 'Compact 6.1-inch smartphone with pro-grade triple camera.',
    brand: 'Orbit',
    categoryNames: ['Smartphones'],
    variants: [
      { sku: 'ORBIT-S22-128-GRN', name: 'Green / 128 GB', price: '899.00', attrs: [{ attr: 'Color', value: 'Green' }, { attr: 'Storage', value: '128 GB' }] },
    ],
  });

  await insertProduct({
    sku: 'SWIFT-Z9',
    name: 'Swift Z9',
    description: 'Budget 5G smartphone with a large 6.5-inch LCD and long battery life.',
    brand: 'Swift',
    categoryNames: ['Smartphones'],
    variants: [
      { sku: 'SWIFT-Z9-64-BLK', name: 'Black / 64 GB', price: '399.00', attrs: [{ attr: 'Color', value: 'Black' }, { attr: 'Storage', value: '64 GB' }] },
      { sku: 'SWIFT-Z9-128-BLK', name: 'Black / 128 GB', price: '449.00', attrs: [{ attr: 'Color', value: 'Black' }, { attr: 'Storage', value: '128 GB' }] },
    ],
  });

  await insertProduct({
    sku: 'NOVA-FOLD-2',
    name: 'Nova Fold 2',
    description: 'Foldable smartphone with a 7.6-inch inner display and S Pen support.',
    brand: 'Nova',
    categoryNames: ['Smartphones'],
    variants: [
      { sku: 'NOVA-FOLD-2-256-BLK', name: 'Black / 256 GB', price: '2499.00', attrs: [{ attr: 'Color', value: 'Black' }, { attr: 'Storage', value: '256 GB' }] },
      { sku: 'NOVA-FOLD-2-512-SLV', name: 'Silver / 512 GB', price: '2799.00', attrs: [{ attr: 'Color', value: 'Silver' }, { attr: 'Storage', value: '512 GB' }] },
    ],
  });

  // ── Laptops (5 products) ─────────────────────────────────────────────────
  await insertProduct({
    sku: 'APEX-BOOK-15',
    name: 'Apex Book 15',
    description: 'Thin and light 15-inch laptop with Intel Core Ultra 7 and OLED display.',
    brand: 'Apex',
    categoryNames: ['Laptops'],
    variants: [
      { sku: 'APEX-BOOK-15-16-512', name: '16 GB / 512 GB SSD', price: '2199.00', attrs: [{ attr: 'RAM', value: '16 GB' }, { attr: 'Storage', value: '512 GB' }], isDefault: true },
      { sku: 'APEX-BOOK-15-32-1TB', name: '32 GB / 1 TB SSD', price: '2699.00', attrs: [{ attr: 'RAM', value: '32 GB' }, { attr: 'Storage', value: '1 TB' }] },
    ],
  });

  await insertProduct({
    sku: 'TITAN-PRO-14',
    name: 'Titan Pro 14',
    description: 'AMD Ryzen 7 gaming laptop with 14-inch 144 Hz display.',
    brand: 'Titan',
    categoryNames: ['Laptops', 'Gaming'],
    variants: [
      { sku: 'TITAN-PRO-14-16-512', name: '16 GB / 512 GB', price: '1899.00', attrs: [{ attr: 'RAM', value: '16 GB' }, { attr: 'Storage', value: '512 GB' }] },
      { sku: 'TITAN-PRO-14-32-1TB', name: '32 GB / 1 TB', price: '2299.00', attrs: [{ attr: 'RAM', value: '32 GB' }, { attr: 'Storage', value: '1 TB' }] },
    ],
  });

  await insertProduct({
    sku: 'ZEPHYR-AIR-13',
    name: 'Zephyr Air 13',
    description: 'Ultra-portable 13-inch laptop weighing just 980 g with all-day battery.',
    brand: 'Zephyr',
    categoryNames: ['Laptops'],
    variants: [
      { sku: 'ZEPHYR-AIR-13-8-256', name: '8 GB / 256 GB', price: '1399.00', attrs: [{ attr: 'RAM', value: '8 GB' }, { attr: 'Storage', value: '256 GB' }] },
    ],
  });

  await insertProduct({
    sku: 'PROBOOK-X360',
    name: 'ProBook X360',
    description: '2-in-1 convertible laptop with touchscreen and stylus support.',
    brand: 'ProBook',
    categoryNames: ['Laptops', 'Tablets'],
    variants: [
      { sku: 'PROBOOK-X360-16-512', name: '16 GB / 512 GB', price: '1749.00', attrs: [{ attr: 'RAM', value: '16 GB' }, { attr: 'Storage', value: '512 GB' }] },
    ],
  });

  await insertProduct({
    sku: 'SWIFT-EDU-11',
    name: 'Swift Edu 11',
    description: 'Affordable 11-inch student laptop with long battery and rugged casing.',
    brand: 'Swift',
    categoryNames: ['Laptops'],
    variants: [
      { sku: 'SWIFT-EDU-11-4-128', name: '4 GB / 128 GB', price: '599.00', attrs: [{ attr: 'RAM', value: '4 GB' }, { attr: 'Storage', value: '128 GB' }] },
      { sku: 'SWIFT-EDU-11-8-256', name: '8 GB / 256 GB', price: '749.00', attrs: [{ attr: 'RAM', value: '8 GB' }, { attr: 'Storage', value: '256 GB' }] },
    ],
  });

  // ── Headphones (5 products) ──────────────────────────────────────────────
  await insertProduct({
    sku: 'AURA-NC700',
    name: 'Aura NC700',
    description: 'Industry-leading noise cancellation over-ear headphones, 20-hour battery.',
    brand: 'Aura',
    categoryNames: ['Headphones'],
    variants: [
      { sku: 'AURA-NC700-BLK', name: 'Black', price: '449.00', attrs: [{ attr: 'Color', value: 'Black' }], isDefault: true },
      { sku: 'AURA-NC700-SLV', name: 'Silver', price: '449.00', attrs: [{ attr: 'Color', value: 'Silver' }] },
    ],
  });

  await insertProduct({
    sku: 'SONIX-WH-1000',
    name: 'Sonix WH-1000',
    description: 'Premium wireless headphones with LDAC support and 30-hour playback.',
    brand: 'Sonix',
    categoryNames: ['Headphones'],
    variants: [
      { sku: 'SONIX-WH-1000-BLK', name: 'Black', price: '399.00', attrs: [{ attr: 'Color', value: 'Black' }] },
      { sku: 'SONIX-WH-1000-WHT', name: 'White', price: '399.00', attrs: [{ attr: 'Color', value: 'White' }] },
    ],
  });

  await insertProduct({
    sku: 'BEATS-FIT-PRO',
    name: 'Beats Fit Pro',
    description: 'True wireless earbuds with active noise cancellation and secure fit wings.',
    brand: 'Beats',
    categoryNames: ['Headphones', 'Wearables'],
    variants: [
      { sku: 'BEATS-FIT-PRO-BLK', name: 'Black', price: '299.00', attrs: [{ attr: 'Color', value: 'Black' }] },
      { sku: 'BEATS-FIT-PRO-WHT', name: 'White', price: '299.00', attrs: [{ attr: 'Color', value: 'White' }] },
      { sku: 'BEATS-FIT-PRO-PRP', name: 'Purple', price: '299.00', attrs: [{ attr: 'Color', value: 'Purple' }] },
    ],
  });

  await insertProduct({
    sku: 'NOVA-BUDS-3',
    name: 'Nova Buds 3',
    description: 'Compact TWS earbuds with 6-hour battery and IPX5 water resistance.',
    brand: 'Nova',
    categoryNames: ['Headphones', 'Wearables'],
    variants: [
      { sku: 'NOVA-BUDS-3-BLK', name: 'Black', price: '149.00', attrs: [{ attr: 'Color', value: 'Black' }] },
      { sku: 'NOVA-BUDS-3-WHT', name: 'White', price: '149.00', attrs: [{ attr: 'Color', value: 'White' }] },
    ],
  });

  await insertProduct({
    sku: 'ZEPHYR-OPENFIT',
    name: 'Zephyr OpenFit',
    description: 'Open-ear clip headphones for situational awareness during workouts.',
    brand: 'Zephyr',
    categoryNames: ['Headphones'],
    variants: [
      { sku: 'ZEPHYR-OPENFIT-BLK', name: 'Black', price: '199.00', attrs: [{ attr: 'Color', value: 'Black' }] },
    ],
  });

  // ── Speakers (4 products) ────────────────────────────────────────────────
  await insertProduct({
    sku: 'BOOM-CHARGE5',
    name: 'Boom Charge 5',
    description: 'Portable Bluetooth speaker with 13-hour battery, IP67 and built-in charger.',
    brand: 'Boom',
    categoryNames: ['Speakers'],
    variants: [
      { sku: 'BOOM-CHARGE5-BLK', name: 'Black', price: '249.00', attrs: [{ attr: 'Color', value: 'Black' }], isDefault: true },
      { sku: 'BOOM-CHARGE5-BLU', name: 'Blue', price: '249.00', attrs: [{ attr: 'Color', value: 'Blue' }] },
    ],
  });

  await insertProduct({
    sku: 'SONIX-SRS-XB43',
    name: 'Sonix SRS-XB43',
    description: 'Extra bass portable speaker with 24-hour battery and multi-colour lighting.',
    brand: 'Sonix',
    categoryNames: ['Speakers'],
    variants: [
      { sku: 'SONIX-SRS-XB43-BLK', name: 'Black', price: '299.00', attrs: [{ attr: 'Color', value: 'Black' }] },
      { sku: 'SONIX-SRS-XB43-RED', name: 'Red', price: '299.00', attrs: [{ attr: 'Color', value: 'Red' }] },
    ],
  });

  await insertProduct({
    sku: 'ECHO-DOT5',
    name: 'Echo Dot 5',
    description: 'Smart speaker with improved audio and built-in Alexa assistant.',
    brand: 'Sonix',
    categoryNames: ['Speakers', 'Smart Home'],
    variants: [
      { sku: 'ECHO-DOT5-CHR', name: 'Charcoal', price: '99.00', attrs: [{ attr: 'Color', value: 'Charcoal' }] },
      { sku: 'ECHO-DOT5-GLC', name: 'Glacier White', price: '99.00', attrs: [{ attr: 'Color', value: 'Glacier White' }] },
    ],
  });

  await insertProduct({
    sku: 'APEX-PARTY-BOX',
    name: 'Apex Party Box 300',
    description: 'Powerful 120 W party speaker with dynamic light show and guitar/mic inputs.',
    brand: 'Apex',
    categoryNames: ['Speakers'],
    variants: [
      { sku: 'APEX-PARTY-BOX-BLK', name: 'Black', price: '799.00', attrs: [{ attr: 'Color', value: 'Black' }] },
    ],
  });

  // ── Cameras (4 products) ─────────────────────────────────────────────────
  await insertProduct({
    sku: 'LUMIX-G9II',
    name: 'Lumix G9 II',
    description: 'Micro Four Thirds mirrorless camera with phase-detect AF and 5.7 K video.',
    brand: 'Lumix',
    categoryNames: ['Cameras'],
    variants: [
      { sku: 'LUMIX-G9II-BODY', name: 'Body Only', price: '1749.00', attrs: [] },
    ],
  });

  await insertProduct({
    sku: 'CANON-R50',
    name: 'Canon EOS R50',
    description: 'Compact mirrorless camera with 24.2 MP sensor and intelligent AF tracking.',
    brand: 'Canon',
    categoryNames: ['Cameras'],
    variants: [
      { sku: 'CANON-R50-BLK', name: 'Black Body Only', price: '1299.00', attrs: [{ attr: 'Color', value: 'Black' }], isDefault: true },
      { sku: 'CANON-R50-WHT', name: 'White Body Only', price: '1299.00', attrs: [{ attr: 'Color', value: 'White' }] },
    ],
  });

  await insertProduct({
    sku: 'SONY-ZVE10',
    name: 'Sony ZV-E10',
    description: 'Vlogging mirrorless camera with flip screen, 4K video and directional mic.',
    brand: 'Sony',
    categoryNames: ['Cameras'],
    variants: [
      { sku: 'SONY-ZVE10-BLK', name: 'Black', price: '1099.00', attrs: [{ attr: 'Color', value: 'Black' }] },
      { sku: 'SONY-ZVE10-WHT', name: 'White', price: '1099.00', attrs: [{ attr: 'Color', value: 'White' }] },
    ],
  });

  await insertProduct({
    sku: 'INSTAX-MINI12',
    name: 'Instax Mini 12',
    description: 'Instant film camera with close-up mode and selfie mirror.',
    brand: 'Fujifilm',
    categoryNames: ['Cameras'],
    variants: [
      { sku: 'INSTAX-MINI12-PNK', name: 'Pink', price: '199.00', attrs: [{ attr: 'Color', value: 'Pink' }], isDefault: true },
      { sku: 'INSTAX-MINI12-BLU', name: 'Blue', price: '199.00', attrs: [{ attr: 'Color', value: 'Blue' }] },
      { sku: 'INSTAX-MINI12-WHT', name: 'White', price: '199.00', attrs: [{ attr: 'Color', value: 'White' }] },
    ],
  });

  // ── Gaming (4 products) ──────────────────────────────────────────────────
  await insertProduct({
    sku: 'NOVA-CTRL-PRO',
    name: 'Nova Controller Pro',
    description: 'Wireless gaming controller with haptic feedback and adaptive triggers.',
    brand: 'Nova',
    categoryNames: ['Gaming', 'Accessories'],
    variants: [
      { sku: 'NOVA-CTRL-PRO-WHT', name: 'White', price: '149.00', attrs: [{ attr: 'Color', value: 'White' }], isDefault: true },
      { sku: 'NOVA-CTRL-PRO-BLK', name: 'Black', price: '149.00', attrs: [{ attr: 'Color', value: 'Black' }] },
    ],
  });

  await insertProduct({
    sku: 'TITAN-HEADSET-G7',
    name: 'Titan Gaming Headset G7',
    description: '7.1 surround sound gaming headset with noise-cancelling boom mic.',
    brand: 'Titan',
    categoryNames: ['Gaming', 'Headphones'],
    variants: [
      { sku: 'TITAN-G7-BLK', name: 'Black', price: '129.00', attrs: [{ attr: 'Color', value: 'Black' }] },
    ],
  });

  await insertProduct({
    sku: 'VORTEX-PAD-XL',
    name: 'Vortex Gaming Pad XL',
    description: 'Extended non-slip gaming mouse pad, 900 × 400 mm, water-resistant.',
    brand: 'Vortex',
    categoryNames: ['Gaming', 'Accessories'],
    variants: [
      { sku: 'VORTEX-PAD-XL-BLK', name: 'Black', price: '49.00', attrs: [{ attr: 'Color', value: 'Black' }] },
      { sku: 'VORTEX-PAD-XL-RED', name: 'Red', price: '49.00', attrs: [{ attr: 'Color', value: 'Red' }] },
    ],
  });

  await insertProduct({
    sku: 'ORBIT-CHAIR-GT',
    name: 'Orbit GT Racing Chair',
    description: 'Ergonomic gaming chair with lumbar support and 4D adjustable armrests.',
    brand: 'Orbit',
    categoryNames: ['Gaming'],
    variants: [
      { sku: 'ORBIT-CHAIR-GT-BLK', name: 'Black / Red', price: '599.00', attrs: [{ attr: 'Color', value: 'Black / Red' }] },
      { sku: 'ORBIT-CHAIR-GT-WHT', name: 'White / Blue', price: '599.00', attrs: [{ attr: 'Color', value: 'White / Blue' }] },
    ],
  });

  // ── Tablets (3 products) ─────────────────────────────────────────────────
  await insertProduct({
    sku: 'APEX-PAD-11',
    name: 'Apex Pad 11',
    description: 'Android tablet with 11-inch 2K display, 8-core CPU and 10 000 mAh battery.',
    brand: 'Apex',
    categoryNames: ['Tablets'],
    variants: [
      { sku: 'APEX-PAD-11-64-GRY', name: 'Grey / 64 GB', price: '499.00', attrs: [{ attr: 'Color', value: 'Grey' }, { attr: 'Storage', value: '64 GB' }], isDefault: true },
      { sku: 'APEX-PAD-11-128-GRY', name: 'Grey / 128 GB', price: '599.00', attrs: [{ attr: 'Color', value: 'Grey' }, { attr: 'Storage', value: '128 GB' }] },
    ],
  });

  await insertProduct({
    sku: 'NOVA-TAB-S9',
    name: 'Nova Tab S9',
    description: 'Premium Android tablet with IP68, DeX mode and 45 W fast charging.',
    brand: 'Nova',
    categoryNames: ['Tablets'],
    variants: [
      { sku: 'NOVA-TAB-S9-128-GRF', name: 'Graphite / 128 GB', price: '1199.00', attrs: [{ attr: 'Color', value: 'Graphite' }, { attr: 'Storage', value: '128 GB' }] },
      { sku: 'NOVA-TAB-S9-256-GRF', name: 'Graphite / 256 GB', price: '1399.00', attrs: [{ attr: 'Color', value: 'Graphite' }, { attr: 'Storage', value: '256 GB' }] },
    ],
  });

  await insertProduct({
    sku: 'PROBOOK-TAB-MINI',
    name: 'ProBook Tab Mini',
    description: '8-inch compact tablet perfect for reading, notes and video calls.',
    brand: 'ProBook',
    categoryNames: ['Tablets'],
    variants: [
      { sku: 'PROBOOK-TAB-MINI-32', name: '32 GB', price: '349.00', attrs: [{ attr: 'Storage', value: '32 GB' }] },
      { sku: 'PROBOOK-TAB-MINI-64', name: '64 GB', price: '399.00', attrs: [{ attr: 'Storage', value: '64 GB' }] },
    ],
  });

  // ── Smart Home (4 products) ──────────────────────────────────────────────
  await insertProduct({
    sku: 'NOVA-SMART-PLUG-WIFI',
    name: 'Nova Smart Plug Wi-Fi',
    description: 'Wi-Fi smart plug with energy monitoring, scheduling and voice assistant support.',
    brand: 'Nova',
    categoryNames: ['Smart Home'],
    variants: [
      { sku: 'NOVA-SMART-PLUG-WIFI-1', name: 'Single Pack', price: '49.00', attrs: [] },
      { sku: 'NOVA-SMART-PLUG-WIFI-4', name: 'Four Pack', price: '179.00', attrs: [] },
    ],
  });

  await insertProduct({
    sku: 'LUMIO-BULB-E27',
    name: 'Lumio Smart Bulb E27',
    description: 'RGB + white 9 W smart bulb with 16 million colours and app control.',
    brand: 'Lumio',
    categoryNames: ['Smart Home'],
    variants: [
      { sku: 'LUMIO-BULB-E27-1', name: 'Single', price: '39.00', attrs: [] },
      { sku: 'LUMIO-BULB-E27-3', name: 'Three Pack', price: '109.00', attrs: [] },
    ],
  });

  await insertProduct({
    sku: 'ECHO-SHOW8',
    name: 'Echo Show 8',
    description: '8-inch smart display with Alexa, video calling and home hub controls.',
    brand: 'Sonix',
    categoryNames: ['Smart Home', 'Speakers'],
    variants: [
      { sku: 'ECHO-SHOW8-CHR', name: 'Charcoal', price: '199.00', attrs: [{ attr: 'Color', value: 'Charcoal' }], isDefault: true },
      { sku: 'ECHO-SHOW8-GLW', name: 'Glacier White', price: '199.00', attrs: [{ attr: 'Color', value: 'Glacier White' }] },
    ],
  });

  await insertProduct({
    sku: 'VORTEX-CAM-360',
    name: 'Vortex Home Cam 360',
    description: '1080p indoor Wi-Fi camera with 360° pan/tilt and night vision.',
    brand: 'Vortex',
    categoryNames: ['Smart Home'],
    variants: [
      { sku: 'VORTEX-CAM-360-WHT', name: 'White', price: '129.00', attrs: [{ attr: 'Color', value: 'White' }] },
    ],
  });

  // ── Wearables (4 products) ───────────────────────────────────────────────
  await insertProduct({
    sku: 'NOVA-WATCH-6',
    name: 'Nova Watch 6',
    description: 'Smartwatch with health monitoring, GPS and rotating bezel, BioActive Sensor.',
    brand: 'Nova',
    categoryNames: ['Wearables'],
    variants: [
      { sku: 'NOVA-WATCH-6-40-BLK', name: 'Black / 40 mm', price: '449.00', attrs: [{ attr: 'Color', value: 'Black' }, { attr: 'Size', value: '40 mm' }], isDefault: true },
      { sku: 'NOVA-WATCH-6-44-BLK', name: 'Black / 44 mm', price: '499.00', attrs: [{ attr: 'Color', value: 'Black' }, { attr: 'Size', value: '44 mm' }] },
      { sku: 'NOVA-WATCH-6-40-GLD', name: 'Gold / 40 mm', price: '499.00', attrs: [{ attr: 'Color', value: 'Gold' }, { attr: 'Size', value: '40 mm' }] },
    ],
  });

  await insertProduct({
    sku: 'PIXEL-WATCH-3',
    name: 'Pixel Watch 3',
    description: 'Google-made smartwatch with Fitbit health features and 28-hour battery.',
    brand: 'Google',
    categoryNames: ['Wearables'],
    variants: [
      { sku: 'PIXEL-WATCH-3-41-OBS', name: 'Obsidian / 41 mm', price: '399.00', attrs: [{ attr: 'Color', value: 'Obsidian' }, { attr: 'Size', value: '41 mm' }] },
      { sku: 'PIXEL-WATCH-3-45-OBS', name: 'Obsidian / 45 mm', price: '499.00', attrs: [{ attr: 'Color', value: 'Obsidian' }, { attr: 'Size', value: '45 mm' }] },
    ],
  });

  await insertProduct({
    sku: 'ORBIT-BAND-7',
    name: 'Orbit Smart Band 7',
    description: 'Slim fitness band with SpO2, heart rate, 14-day battery and 5 ATM rating.',
    brand: 'Orbit',
    categoryNames: ['Wearables'],
    variants: [
      { sku: 'ORBIT-BAND-7-BLK', name: 'Black', price: '99.00', attrs: [{ attr: 'Color', value: 'Black' }], isDefault: true },
      { sku: 'ORBIT-BAND-7-PNK', name: 'Pink', price: '99.00', attrs: [{ attr: 'Color', value: 'Pink' }] },
    ],
  });

  await insertProduct({
    sku: 'AURA-SPORT-WATCH',
    name: 'Aura Sport Watch',
    description: 'Rugged GPS sports watch with altimeter, barometer and 40-hour GPS life.',
    brand: 'Aura',
    categoryNames: ['Wearables'],
    variants: [
      { sku: 'AURA-SPORT-WATCH-BLK', name: 'Black', price: '349.00', attrs: [{ attr: 'Color', value: 'Black' }] },
      { sku: 'AURA-SPORT-WATCH-ORG', name: 'Orange', price: '349.00', attrs: [{ attr: 'Color', value: 'Orange' }] },
    ],
  });

  // ── Accessories (4 products) ─────────────────────────────────────────────
  await insertProduct({
    sku: 'ZEPHYR-CHARGE-100W',
    name: 'Zephyr 100 W GaN Charger',
    description: '4-port GaN charger (2 × USB-C, 2 × USB-A) for laptops, phones and tablets.',
    brand: 'Zephyr',
    categoryNames: ['Accessories'],
    variants: [
      { sku: 'ZEPHYR-CHARGE-100W-WHT', name: 'White', price: '79.00', attrs: [{ attr: 'Color', value: 'White' }], isDefault: true },
      { sku: 'ZEPHYR-CHARGE-100W-BLK', name: 'Black', price: '79.00', attrs: [{ attr: 'Color', value: 'Black' }] },
    ],
  });

  await insertProduct({
    sku: 'LUMIO-USB-C-CABLE-2M',
    name: 'Lumio USB-C Cable 2 m',
    description: '2-metre braided USB-C to USB-C cable supporting 100 W and USB 3.2 Gen 2.',
    brand: 'Lumio',
    categoryNames: ['Accessories'],
    variants: [
      { sku: 'LUMIO-USBC-2M-BLK', name: 'Black', price: '19.00', attrs: [{ attr: 'Color', value: 'Black' }] },
      { sku: 'LUMIO-USBC-2M-WHT', name: 'White', price: '19.00', attrs: [{ attr: 'Color', value: 'White' }] },
    ],
  });

  await insertProduct({
    sku: 'APEX-HUB-7IN1',
    name: 'Apex 7-in-1 USB-C Hub',
    description: 'USB-C hub with HDMI 4K, 3 × USB-A, SD, microSD and 100 W passthrough.',
    brand: 'Apex',
    categoryNames: ['Accessories'],
    variants: [
      { sku: 'APEX-HUB-7IN1-GRY', name: 'Space Grey', price: '99.00', attrs: [{ attr: 'Color', value: 'Space Grey' }] },
    ],
  });

  await insertProduct({
    sku: 'NOVA-MAGSAFE-STAND',
    name: 'Nova MagSafe Wireless Stand',
    description: '15 W MagSafe-compatible wireless charging stand for phones and earbuds.',
    brand: 'Nova',
    categoryNames: ['Accessories', 'Smart Home'],
    variants: [
      { sku: 'NOVA-MAGSAFE-STAND-WHT', name: 'White', price: '69.00', attrs: [{ attr: 'Color', value: 'White' }], isDefault: true },
      { sku: 'NOVA-MAGSAFE-STAND-BLK', name: 'Black', price: '69.00', attrs: [{ attr: 'Color', value: 'Black' }] },
    ],
  });

  // ── Mark project seed complete ───────────────────────────────────────────
  await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', ['project-v1']);
}
