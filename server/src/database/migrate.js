import { readdir, readFile } from 'node:fs/promises';

export async function applyMigrations(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  const directory = new URL('../../db/', import.meta.url);
  const files = (await readdir(directory))
    .filter((name) => /^\d{3}-[a-z0-9-]+\.(sql|mjs)$/.test(name)) //filter sql and mjs both
    .sort();

  //duplicate check
  const seen = new Set();
  for (const filename of files) {
    const v = filename.replace(/\.(sql|mjs)$/, '');
    if (seen.has(v)) throw new Error(`Duplicate migration ${v}`);
    seen.add(v);
  }

  for (const filename of files) {
    const version = filename.replace(/\.(sql|mjs)$/, ''); //allow for mjs and sql
    const [applied] = await connection.execute(
      'SELECT version FROM schema_migrations WHERE version = ?',
      [version],
    );
    if (applied.length) continue;
    if (filename.endsWith('.sql')) {
      const sql = await readFile(new URL(filename, directory), 'utf8');
      // MySQL DDL commits implicitly. Migrations must tolerate retry after a
      // partial failure. These files contain plain SQL, not stored procedures.
      for (const statement of sql
        .split(';')
        .map((value) => value.trim())
        .filter(Boolean)) {
        await connection.query(statement);
      }
    } else {
      //for mjs files
      const fileUrl = new URL(filename, directory).href;
      const module = await import(fileUrl);
      await module.up(connection);
    }
    await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
  }
}
