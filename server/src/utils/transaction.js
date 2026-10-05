import { ApiError } from '../errors.js';

export async function inTransaction(pool, work) {
  const connection = await pool.getConnection();
  let started = false;
  let beginning = false;
  let committing = false;
  let destroyed = false;
  try {
    // Driver timezone conversion does not set the server session timezone.
    await connection.query("SET time_zone = '+00:00'");
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    beginning = true;
    await connection.beginTransaction();
    beginning = false;
    started = true;
    const result = await work(connection);
    committing = true;
    await connection.commit();
    started = false;
    return result;
  } catch (error) {
    if (beginning) {
      // START TRANSACTION may have reached MySQL; never reuse this session.
      destroyed = true;
      connection.destroy();
    }
    if (committing) {
      // COMMIT may have reached MySQL even if its acknowledgement was lost.
      destroyed = true;
      connection.destroy();
      throw new ApiError(503, 'TRANSACTION_OUTCOME_UNKNOWN',
        'The outcome is uncertain. Retry the exact same action and request key.');
    }
    if (started) {
      try { await connection.rollback(); }
      catch {
        destroyed = true;
        connection.destroy();
      }
    }
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
      throw new ApiError(409, 'TRANSACTION_RETRY', 'Please retry the same action.');
    }
    throw error;
  } finally {
    if (!destroyed) connection.release();
  }
}
