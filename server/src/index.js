import { pool } from './db.js';
import { config } from './config.js';
import { createApp } from './app.js';
import { connectReportRedis, createReportCache } from './report-cache.js';

await pool.query('SELECT 1');
const redis = connectReportRedis(config.redisUrl);
const reportCache = createReportCache(redis, { ttl: config.cacheTtl });
const server = createApp(pool, { reportCache }).listen(config.port, () =>
  console.log(`Sweety API: http://localhost:${config.port}`),
);
async function shutdown() {
  server.close(async () => {
    redis.disconnect();
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
