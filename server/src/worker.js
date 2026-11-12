import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { pool } from './db.js';
import { config } from './config.js';
import {
  REMINDER_PREFIX,
  REMINDER_QUEUE,
  createReminderWorker,
  scheduleReminders,
} from './reminders.js';

await pool.query('SELECT 1');
const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
connection.on('error', () => {}); // The worker logs a sanitized connection warning.
const queue = new Queue(REMINDER_QUEUE, { connection, prefix: REMINDER_PREFIX });
const worker = createReminderWorker(pool, { connection, timezone: config.timezone });
queue.on('error', () => console.warn('Reminder scheduler connection error; retrying.'));
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await worker.close();
  await queue.close();
  connection.disconnect();
  await pool.end();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
await scheduleReminders(queue, { pattern: config.reminderCron, timezone: config.timezone });
console.log(`Daily reminder worker ready (${config.reminderCron}, ${config.timezone}).`);
