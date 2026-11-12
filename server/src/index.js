import { pool } from './db.js';
import { config } from './config.js';
import { createApp } from './app.js';

await pool.query('SELECT 1');
const server = createApp(pool).listen(config.port, () => console.log(`Sweety API: http://localhost:${config.port}`));
async function shutdown() {
  server.close(async () => { await pool.end(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
