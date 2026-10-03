import { readdir, readFile } from 'node:fs/promises';

export async function applyMigrations(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  const directory = new URL('../../db/', import.meta.url);
  const files = (await readdir(directory))
    .filter((name) => /^\d{3}-[a-z0-9-]+\.(?:sql|mjs)$/.test(name))
    .sort((a, b) => {
      const baseA = a.replace(/\.(?:sql|mjs)$/, '');
      const baseB = b.replace(/\.(?:sql|mjs)$/, '');
      if (baseA === baseB) {
        return a.endsWith('.mjs') ? -1 : 1;
      }
      return a.localeCompare(b);
    });

  const executedVersions = new Set();

  for (const filename of files) {
    const version = filename.replace(/\.(?:sql|mjs)$/, '');
    if (executedVersions.has(version)) continue;
    executedVersions.add(version);

    const [applied] = await connection.execute(
      'SELECT version FROM schema_migrations WHERE version = ?',
      [version],
    );
    if (applied.length) continue;

    if (filename.endsWith('.mjs')) {
      const migrationModule = await import(new URL(filename, directory).href);
      if (typeof migrationModule.apply === 'function') {
        await migrationModule.apply(connection);
      }
    } else {
      const sql = await readFile(new URL(filename, directory), 'utf8');
      // MySQL DDL commits implicitly. Migrations must tolerate retry after a
      // partial failure. These files contain plain SQL, not stored procedures.
      for (const statement of sql
        .split(';')
        .map((value) => value.trim())
        .filter(Boolean)) {
        await connection.query(statement);
      }
    }
    await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
  }
}
