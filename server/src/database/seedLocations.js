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
  return {
    cities: await listCities(connection, { admin: true }),
    stores: await listStores(connection, { admin: true }),
  };
}
