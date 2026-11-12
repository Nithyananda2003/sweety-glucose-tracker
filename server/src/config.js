import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export const config = {
  databaseUrl: process.env.DATABASE_URL,
  port: Number(process.env.PORT || 3001),
  origin: process.env.APP_ORIGIN || 'http://localhost:5173',
  timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  production: process.env.NODE_ENV === 'production',
  trustProxy: process.env.TRUST_PROXY === '1',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  cacheTtl: Number(process.env.REPORT_CACHE_TTL_SECONDS || 300),
  reminderCron: process.env.REMINDER_CRON || '0 0 21 * * *',
};
// Fail early on invalid timezone/origin instead of rejecting requests later.
new Intl.DateTimeFormat('en', { timeZone: config.timezone });
new URL(config.origin);
if (!Number.isInteger(config.cacheTtl) || config.cacheTtl < 1 || config.cacheTtl > 86400)
  throw new Error('REPORT_CACHE_TTL_SECONDS must be between 1 and 86400.');
