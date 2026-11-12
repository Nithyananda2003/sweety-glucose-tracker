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
};
// Fail early on invalid timezone/origin instead of rejecting requests later.
new Intl.DateTimeFormat('en', { timeZone: config.timezone });
new URL(config.origin);
