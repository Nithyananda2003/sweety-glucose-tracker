import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { parseArgs } from 'node:util';
import { config } from './config.js';
import { isDate, todayInZone } from '../../shared/domain.js';
import { REMINDER_QUEUE, REMINDER_PREFIX, reminderJobOptions } from './reminders.js';

const { values } = parseArgs({ options: { date: { type: 'string' } } });
const date = values.date || todayInZone(config.timezone);
if (!isDate(date) || date > todayInZone(config.timezone))
  throw new Error('Choose a valid date at or before today.');
const connection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 1,
  connectTimeout: 1000,
  retryStrategy: () => null,
});
connection.on('error', () => {});
const queue = new Queue(REMINDER_QUEUE, { connection, prefix: REMINDER_PREFIX });
queue.on('error', () => {});
try {
  const job = await queue.add('daily-reminder', { date }, reminderJobOptions);
  console.log(
    `Reminder sweep queued for ${date} (job ${job.id}). Run npm run worker to process it.`,
  );
} catch {
  console.error('Could not enqueue reminders. Check REDIS_URL and Redis availability.');
  process.exitCode = 1;
} finally {
  await queue.close();
  connection.disconnect();
}
