import { Worker } from 'bullmq';
import { isDate, todayInZone } from '../../shared/domain.js';

export const REMINDER_QUEUE = 'daily-reminders';
export const REMINDER_PREFIX = 'sweety';
export const reminderJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 30 },
  removeOnFail: { count: 100 },
};

export async function runReminderSweep(
  db,
  date,
  { timezone = 'Asia/Kolkata', logger = console } = {},
) {
  if (!isDate(date)) throw new Error('A valid reminder date is required.');
  // One SQL statement provides a consistent count and deduplicates concurrent jobs.
  const result = await db.query(
    `INSERT INTO reminder_logs (user_id,date,reading_count)
    SELECT u.id,$1::date,count(r.id)::int FROM users u
    LEFT JOIN readings r ON r.user_id=u.id AND r.date=$1::date
    WHERE u.role='patient' AND (u.created_at AT TIME ZONE $2)::date <= $1::date
    GROUP BY u.id HAVING count(r.id)<4
    ON CONFLICT (user_id,date) DO NOTHING
    RETURNING user_id,date::text,reading_count`,
    [date, timezone],
  );
  for (const reminder of result.rows) {
    logger.info(
      JSON.stringify({
        event: 'daily_reading_reminder',
        ...reminder,
        remaining: 4 - reminder.reading_count,
      }),
    );
  }
  return { date, remindersLogged: result.rows.length };
}

export async function scheduleReminders(queue, { pattern, timezone }) {
  return queue.upsertJobScheduler(
    'daily-reading-reminders',
    { pattern, tz: timezone },
    {
      name: 'daily-reminder',
      data: {},
      opts: reminderJobOptions,
    },
  );
}

export function createReminderWorker(
  db,
  { connection, timezone, prefix = REMINDER_PREFIX, logger = console },
) {
  const worker = new Worker(
    REMINDER_QUEUE,
    async (job) => {
      if (job.name !== 'daily-reminder') throw new Error('Unknown reminder job.');
      // Persist the calendar date before work, so a retry after midnight uses the same date.
      const date = job.data.date || todayInZone(timezone);
      if (!job.data.date) await job.updateData({ ...job.data, date });
      if (!isDate(date) || date > todayInZone(timezone))
        throw new Error('Reminder date must be valid and cannot be in the future.');
      return runReminderSweep(db, date, { logger, timezone });
    },
    { connection, prefix, concurrency: 1 },
  );
  worker.on('error', () => logger.warn('Reminder worker connection error; retrying.'));
  worker.on('failed', (job) =>
    logger.warn(`Reminder job ${job?.id || 'unknown'} failed; inspect the queue for details.`),
  );
  return worker;
}
