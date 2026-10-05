import { ApiError } from '../errors.js';

const cityColumns = 'id, name, is_main_city AS isMainCity, is_active AS isActive';
const storeColumns = `s.id, s.name, s.city_id AS cityId, c.name AS cityName,
  s.address_line AS addressLine, s.is_active AS isActive`;
const cityView = (row) => ({
  ...row,
  isMainCity: row.isMainCity === 1,
  isActive: row.isActive === 1,
});
const storeView = (row) => ({ ...row, isActive: row.isActive === 1 });

export async function listCities(db, { admin = false } = {}) {
  const [rows] = await db.execute(
    `SELECT ${cityColumns} FROM cities ${admin ? '' : 'WHERE is_active = 1'} ORDER BY name, id`,
  );
  return rows.map(cityView);
}

export async function listStores(db, { admin = false, cityId } = {}) {
  const filters = [];
  if (!admin) filters.push('s.is_active = 1', 'c.is_active = 1');
  if (cityId !== undefined) filters.push('s.city_id = ?');
  const [rows] = await db.execute(
    `SELECT ${storeColumns} FROM stores s JOIN cities c ON c.id = s.city_id
     ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY c.name, s.name, s.id`,
    cityId === undefined ? [] : [cityId],
  );
  return rows.map(storeView);
}

async function transaction(db, work) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function mutation(db, entity, work) {
  try {
    return await transaction(db, work);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new ApiError(
        409,
        `${entity.toUpperCase()}_NAME_EXISTS`,
        entity === 'city'
          ? 'A city with this name already exists.'
          : 'A store with this name already exists in this city.',
      );
    }
    throw error;
  }
}

async function cityById(connection, id, { lock = false } = {}) {
  const [rows] = await connection.execute(
    `SELECT ${cityColumns} FROM cities WHERE id = ? ${lock ? 'FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ApiError(404, 'CITY_NOT_FOUND', 'City not found.');
  return cityView(rows[0]);
}

async function storeById(connection, id) {
  const [rows] = await connection.execute(
    `SELECT ${storeColumns} FROM stores s JOIN cities c ON c.id = s.city_id WHERE s.id = ?`,
    [id],
  );
  if (!rows[0]) throw new ApiError(404, 'STORE_NOT_FOUND', 'Store not found.');
  return storeView(rows[0]);
}

export function createCity(db, data) {
  return mutation(db, 'city', async (connection) => {
    const [result] = await connection.execute(
      'INSERT INTO cities (name, is_main_city, is_active) VALUES (?, ?, ?)',
      [data.name, Number(data.isMainCity), Number(data.isActive)],
    );
    return cityById(connection, result.insertId);
  });
}

export function updateCity(db, id, patch) {
  return mutation(db, 'city', async (connection) => {
    const previous = await cityById(connection, id, { lock: true });
    const data = { ...previous, ...patch };
    await connection.execute(
      'UPDATE cities SET name = ?, is_main_city = ?, is_active = ? WHERE id = ?',
      [data.name, Number(data.isMainCity), Number(data.isActive), id],
    );
    return cityById(connection, id);
  });
}

export function createStore(db, data) {
  return mutation(db, 'store', async (connection) => {
    const city = await cityById(connection, data.cityId, { lock: true });
    if (!city.isActive) throw new ApiError(409, 'CITY_INACTIVE', 'Choose an active city.');
    const [result] = await connection.execute(
      'INSERT INTO stores (name, city_id, address_line, is_active) VALUES (?, ?, ?, ?)',
      [data.name, data.cityId, data.addressLine, Number(data.isActive)],
    );
    return storeById(connection, result.insertId);
  });
}

export function updateStore(db, id, patch) {
  return mutation(db, 'store', async (connection) => {
    const [rows] = await connection.execute(
      `SELECT id, name, city_id AS cityId, address_line AS addressLine, is_active AS isActive
       FROM stores WHERE id = ? FOR UPDATE`,
      [id],
    );
    if (!rows[0]) throw new ApiError(404, 'STORE_NOT_FOUND', 'Store not found.');
    const data = { ...storeView(rows[0]), ...patch };
    const city = await cityById(connection, data.cityId, { lock: true });
    // Existing stores in inactive cities can still be disabled or edited while inactive.
    if (!city.isActive && (data.isActive || Object.hasOwn(patch, 'cityId'))) {
      throw new ApiError(409, 'CITY_INACTIVE', 'Choose an active city.');
    }
    await connection.execute(
      'UPDATE stores SET name = ?, city_id = ?, address_line = ?, is_active = ? WHERE id = ?',
      [data.name, data.cityId, data.addressLine, Number(data.isActive), id],
    );
    return storeById(connection, id);
  });
}
