import bcrypt from 'bcrypt';
import { pathToFileURL } from 'node:url';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { config } from './config.js';
import { todayInZone, SLOTS } from '../../shared/domain.js';

export async function seed(db = pool) {
  const email = (process.env.DEMO_EMAIL || 'demo@sweety.app').trim().toLowerCase();
  const password = process.env.DEMO_PASSWORD || 'SweetyDemo123!';
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO users (name,email,password_hash) VALUES ($1,$2,$3)
      ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash
      WHERE users.role='patient' RETURNING id`,
      ['Alex Morgan', email, passwordHash],
    );
    if (!result.rows.length) throw new Error('DEMO_EMAIL must identify a patient account.');
    const userId = result.rows[0].id;
    const doctorEmail = (process.env.DEMO_DOCTOR_EMAIL || 'doctor@sweety.app').trim().toLowerCase();
    const doctorHash = await bcrypt.hash(
      process.env.DEMO_DOCTOR_PASSWORD || 'SweetyDoctor123!',
      12,
    );
    const doctorResult = await client.query(
      `INSERT INTO users (name,email,password_hash,role)
      VALUES ($1,$2,$3,'doctor') ON CONFLICT (email) DO UPDATE SET
      name=EXCLUDED.name,password_hash=EXCLUDED.password_hash WHERE users.role='doctor' RETURNING id`,
      ['Dr. Jamie Chen', doctorEmail, doctorHash],
    );
    if (!doctorResult.rows.length)
      throw new Error('DEMO_DOCTOR_EMAIL must be a separate doctor account.');
    await client.query(
      'INSERT INTO doctor_patients (doctor_id,patient_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [doctorResult.rows[0].id, userId],
    );
    const today = todayInZone(config.timezone);
    const end = new Date(`${today}T00:00:00Z`);
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
    for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
      const iso = date.toISOString().slice(0, 10);
      // Leave today's dinner open so the demo illustrates adding a reading.
      const slots = iso === today ? SLOTS.slice(0, 3) : SLOTS;
      for (let index = 0; index < slots.length; index++) {
        const value =
          iso === today
            ? [96, 138, 124][index]
            : Math.round(101 + index * 13 + Math.sin(date.getUTCDate() * 1.3 + index) * 17);
        await client.query(
          `INSERT INTO readings (user_id,date,slot,value) VALUES ($1,$2,$3,$4)
          ON CONFLICT (user_id,date,slot) DO NOTHING`,
          [userId, iso, slots[index].key, value],
        );
      }
    }
    await client.query('COMMIT');
    console.log(
      `Demo account ready: ${email} (password from DEMO_PASSWORD or the documented default).`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await migrate(pool);
    await seed();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
