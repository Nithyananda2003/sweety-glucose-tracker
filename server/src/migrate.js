import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function migrate(db) {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { pool } = await import('./db.js');
  try {
    await migrate(pool);
    console.log('Database schema ready.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
