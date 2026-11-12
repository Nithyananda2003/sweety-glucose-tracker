import pg from 'pg';
import { config } from './config.js';

if (!config.databaseUrl) throw new Error('DATABASE_URL is required. Copy .env.example to .env.');
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
pool.on('error', (error) => console.error('Idle database connection failed:', error.message));
