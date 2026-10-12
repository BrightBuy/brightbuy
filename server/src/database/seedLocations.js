import { readFile } from 'node:fs/promises';
import { listCities, listStores } from '../services/location-management.js';

// Called inside the setup lock and a transaction; existing edits are preserved.
export async function seedLocations(connection) {
  const [markers] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ?',
    ['locations-demo-v1'],
  );
  if (!markers.length) {
    const fixtures = JSON.parse(
      await readFile(new URL('../../db/fixtures/locations.json', import.meta.url), 'utf8'),
    );
    const cityIds = new Map();
    for (const city of fixtures.cities) {
      const [result] = await connection.execute(
        `INSERT INTO cities (name, is_main_city, is_active) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [city.name, Number(city.isMainCity), Number(city.isActive)],
      );
      cityIds.set(city.name, result.insertId);
    }
    for (const store of fixtures.stores) {
      await connection.execute(
        `INSERT INTO stores (name, city_id, address_line, is_active) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [store.name, cityIds.get(store.city), store.addressLine, Number(store.isActive)],
      );
    }
    await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', [
      'locations-demo-v1',
    ]);
  }
  // Foundation sample addresses are inserted before the location seed. Repair
  // only unchanged fixtures with missing links; preserve user edits and history.
  for (const [email, recipient, line1, city, postalCode] of [
    ['nimal@example.test', 'Nimal Perera', '12 Sample Lane', 'Houston', '77001'],
    ['nimal@example.test', 'Nimal Perera', '8 Demo Road', 'Dallas', '75201'],
    ['asha@example.test', 'Asha Silva', '24 Example Street', 'Austin', '78701'],
  ]) {
    await connection.execute(
      `UPDATE addresses a
       JOIN customers u ON u.id = a.customer_id
       JOIN cities c ON c.name = a.city AND c.is_active = 1
       SET a.city_id = c.id
       WHERE a.city_id IS NULL AND a.country = 'US'
         AND u.email = ? AND a.recipient = ? AND a.line1 = ?
         AND a.city = ? AND a.postal_code = ?`,
      [email, recipient, line1, city, postalCode],
    );
  }
  // Give sample customers a usable default only when they have not chosen one.
  for (const email of ['nimal@example.test', 'asha@example.test']) {
    const [customers] = await connection.execute(
      "SELECT id FROM customers WHERE email = ? AND role = 'customer' FOR UPDATE",
      [email],
    );
    if (!customers.length) continue;
    const customerId = customers[0].id;
    const [addresses] = await connection.execute(
      'SELECT id, is_default FROM addresses WHERE customer_id = ? ORDER BY id FOR UPDATE',
      [customerId],
    );
    if (addresses.some(address => address.is_default)) continue;
    const [usable] = await connection.execute(
      `SELECT a.id FROM addresses a JOIN cities c ON c.id = a.city_id
       WHERE a.customer_id = ? AND a.country = 'US' AND c.is_active = 1
       ORDER BY a.id LIMIT 1`,
      [customerId],
    );
    if (usable.length) {
      await connection.execute('UPDATE addresses SET is_default = 1 WHERE id = ?', [usable[0].id]);
    }
  }
  return {
    cities: await listCities(connection, { admin: true }),
    stores: await listStores(connection, { admin: true }),
  };
}
