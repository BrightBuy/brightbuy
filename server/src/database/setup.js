import { applyMigrations } from './migrate.js';
import { seedDemoData } from './seed.js';
import { seedProjectData } from './seedProject.js';
import { seedLocations } from './seedLocations.js';

// The CLI and tests share this lifecycle. Always close the pool, including when
// connection acquisition or lock release fails, so setup does not hang.
export async function runSetup(pool, { seedDemo = false, seedProject = false } = {}) {
  let connection;
  let lockAcquired = false;
  try {
    connection = await pool.getConnection();
    const [[lock]] = await connection.query("SELECT GET_LOCK('brightbuy_setup', 30) AS acquired");
    if (lock.acquired !== 1) throw new Error('Could not acquire database setup lock.');
    lockAcquired = true;
    await applyMigrations(connection);

    if (seedDemo) {
      await connection.beginTransaction();
      try {
        await seedDemoData(connection);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    if (seedProject) {
      // Project seed runs after demo seed so legacy products are already reconciled.
      await connection.beginTransaction();
      try {
        await seedLocations(connection);
        await seedProjectData(connection);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
  } finally {
    try {
      if (lockAcquired) await connection.query("SELECT RELEASE_LOCK('brightbuy_setup')");
    } finally {
      try {
        connection?.release();
      } finally {
        await pool.end();
      }
    }
  }
}
