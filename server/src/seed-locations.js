import { db } from './db.js';
import { applyMigrations } from './database/migrate.js';
import { seedLocations } from './database/seedLocations.js';

let connection,
  locked = false,
  transaction = false;
try {
  connection = await db.getConnection();
  const [[lock]] = await connection.query("SELECT GET_LOCK('brightbuy_setup', 30) AS acquired");
  if (lock.acquired !== 1) throw new Error('Could not acquire database setup lock.');
  locked = true;
  await applyMigrations(connection);
  await connection.beginTransaction();
  transaction = true;
  const locations = await seedLocations(connection);
  await connection.commit();
  transaction = false;
  console.log('Demo city classifications and pickup addresses are fictional project fixtures.');
  console.log(JSON.stringify(locations, null, 2));
} catch (error) {
  if (transaction) await connection.rollback();
  console.error('Location seed failed:', error.message);
  process.exitCode = 1;
} finally {
  try {
    if (locked) await connection.query("SELECT RELEASE_LOCK('brightbuy_setup')");
  } finally {
    connection?.release();
    await db.end();
  }
}
