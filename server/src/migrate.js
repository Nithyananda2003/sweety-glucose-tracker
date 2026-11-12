import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { pool } from './db.js';

export async function migrate(db = pool) {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await migrate(); console.log('Database schema ready.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await pool.end(); }
}
