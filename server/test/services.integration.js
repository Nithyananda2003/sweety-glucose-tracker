import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import Redis from 'ioredis';
import { Queue, QueueEvents } from 'bullmq';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { createReportCache, connectReportRedis } from '../src/report-cache.js';
import { createDoctor, assignPatient } from '../src/doctor-admin.js';
import { REMINDER_QUEUE, createReminderWorker, scheduleReminders } from '../src/reminders.js';
import { SLOTS, todayInZone } from '../../shared/domain.js';

if (!process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL)
  throw new Error('Set TEST_DATABASE_URL and TEST_REDIS_URL to run service integration tests.');
const token = randomBytes(8).toString('hex');
const schema = `sweety_services_${token}`;
const prefix = `sweetytest${token}`;
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const db = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema}`,
});
const redis = new Redis(process.env.TEST_REDIS_URL, { maxRetriesPerRequest: null });
const cacheRedis = new Redis(process.env.TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
const cache = createReportCache(cacheRedis, { prefix, ttl: 60 });
const today = todayInZone('Asia/Kolkata');
const date = '2024-03-15';
const body = { date, slot: 'morning', value: 110 };
let app,
  alice,
  bob,
  doctor,
  strangerDoctor,
  aliceId,
  bobId,
  carolId,
  doctorUser,
  createdId,
  queue,
  events,
  worker;
let failNextSweep = false;
const logLines = [];
before(async () => {
  await redis.ping();
  await cacheRedis.ping();
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(db);
  app = createApp(db, { reportCache: cache, production: false });
  alice = request.agent(app);
  bob = request.agent(app);
  doctor = request.agent(app);
  strangerDoctor = request.agent(app);
  aliceId = (
    await alice
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@example.com', password: 'password123!' })
      .expect(201)
  ).body.user.id;
  bobId = (
    await bob
      .post('/api/auth/register')
      .send({ name: 'Bob', email: 'bob@example.com', password: 'password123!' })
      .expect(201)
  ).body.user.id;
  carolId = (
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Carol', email: 'carol@example.com', password: 'password123!' })
      .expect(201)
  ).body.user.id;
  doctorUser = await createDoctor(db, {
    name: 'Dr. Chen',
    email: 'doctor@example.com',
    password: 'doctor123!',
  });
  await createDoctor(db, {
    name: 'Dr. Unassigned',
    email: 'stranger@example.com',
    password: 'doctor123!',
  });
  await doctor
    .post('/api/auth/login')
    .send({ email: 'doctor@example.com', password: 'doctor123!' })
    .expect(200);
  await strangerDoctor
    .post('/api/auth/login')
    .send({ email: 'stranger@example.com', password: 'doctor123!' })
    .expect(200);
  queue = new Queue(REMINDER_QUEUE, { connection: redis, prefix });
  events = new QueueEvents(REMINDER_QUEUE, { connection: redis, prefix });
  await events.waitUntilReady();
  worker = createReminderWorker(
    {
      query: (...args) => {
        if (failNextSweep) {
          failNextSweep = false;
          throw new Error('Simulated transient database outage');
        }
        return db.query(...args);
      },
    },
    {
      connection: redis,
      prefix,
      timezone: 'Asia/Kolkata',
      logger: { info: (line) => logLines.push(JSON.parse(line)), warn: () => {} },
    },
  );
  await worker.waitUntilReady();
});
after(async () => {
  await worker?.close();
  await events?.close();
  if (queue) {
    await queue.obliterate({ force: true });
    await queue.close();
  }
  if (cacheRedis.status !== 'ready') {
    cacheRedis.disconnect();
    await cacheRedis.connect();
  }
  const keys = await cacheRedis.keys(`${prefix}:*`);
  if (keys.length) await cacheRedis.unlink(...keys);
  cacheRedis.disconnect();
  redis.disconnect();
  await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

test('reports are cached per patient and date, with bounded TTL', async () => {
  const first = await alice.get(`/api/reports?date=${date}`).expect(200);
  const second = await alice.get(`/api/reports?date=${date}`).expect(200);
  assert.equal(first.headers['x-report-cache'], 'MISS');
  assert.equal(second.headers['x-report-cache'], 'HIT');
  assert.deepEqual(first.body, second.body);
  assert.equal((await bob.get(`/api/reports?date=${date}`)).headers['x-report-cache'], 'MISS');
  const keys = await redis.keys(`${prefix}:reports:${aliceId}:v*`);
  assert.equal(keys.length, 1);
  assert.ok((await redis.ttl(keys[0])) > 0);
  assert.ok((await redis.ttl(keys[0])) <= 60);
});
test('create, edit/date move, and delete clear all cached report periods', async () => {
  createdId = (await alice.post('/api/readings').send(body).expect(201)).body.reading.id;
  assert.equal((await redis.keys(`${prefix}:reports:${aliceId}:v*`)).length, 0);
  let report = await alice.get(`/api/reports?date=${date}`).expect(200);
  assert.equal(report.headers['x-report-cache'], 'MISS');
  assert.equal(report.body.daily.average, 110);
  await alice.get('/api/reports?date=2024-04-01').expect(200);
  assert.equal((await redis.keys(`${prefix}:reports:${aliceId}:v*`)).length, 2);
  await alice
    .put(`/api/readings/${createdId}`)
    .send({ ...body, date: '2024-03-16', value: 150 })
    .expect(200);
  assert.equal((await redis.keys(`${prefix}:reports:${aliceId}:v*`)).length, 0);
  assert.equal((await alice.get(`/api/reports?date=${date}`)).body.daily.count, 0);
  assert.equal((await alice.get('/api/reports?date=2024-03-16')).body.daily.average, 150);
  await alice.delete(`/api/readings/${createdId}`).expect(204);
  assert.equal((await redis.keys(`${prefix}:reports:${aliceId}:v*`)).length, 0);
  assert.equal((await alice.get('/api/reports?date=2024-03-16')).body.daily.count, 0);
});
test('a delayed stale cache fill cannot resurrect an old report after a write', async () => {
  const revision = (await db.query('SELECT reading_revision FROM users WHERE id=$1', [aliceId]))
    .rows[0].reading_revision;
  const old = (await alice.get(`/api/reports?date=${date}`)).body;
  createdId = (await alice.post('/api/readings').send(body).expect(201)).body.reading.id;
  await cache.set(aliceId, revision, date, old);
  const result = await alice.get(`/api/reports?date=${date}`).expect(200);
  assert.equal(result.headers['x-report-cache'], 'MISS');
  assert.equal(result.body.daily.average, 110);
});
test('API remains usable with Redis disconnected, and recovery never returns stale values', async () => {
  cacheRedis.disconnect();
  await alice
    .put(`/api/readings/${createdId}`)
    .send({ ...body, value: 140 })
    .expect(200);
  const offline = await alice.get(`/api/reports?date=${date}`).expect(200);
  assert.equal(offline.headers['x-report-cache'], 'BYPASS');
  assert.equal(offline.body.daily.average, 140);
  await cacheRedis.connect();
  const recovered = await alice.get(`/api/reports?date=${date}`).expect(200);
  assert.equal(recovered.headers['x-report-cache'], 'MISS');
  assert.equal(recovered.body.daily.average, 140);
  assert.equal((await alice.get(`/api/reports?date=${date}`)).headers['x-report-cache'], 'HIT');
});
test('a failed Redis connection bypasses caching quickly without blocking requests', async () => {
  const down = connectReportRedis('redis://127.0.0.1:1', { warn: () => {} });
  try {
    const offlineApp = createApp(db, { reportCache: createReportCache(down), production: false });
    const agent = request.agent(offlineApp);
    await agent
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'password123!' })
      .expect(200);
    const result = await agent.get(`/api/reports?date=${date}`).timeout(2000).expect(200);
    assert.equal(result.headers['x-report-cache'], 'BYPASS');
    assert.equal(result.body.daily.average, 140);
  } finally {
    down.disconnect();
  }
});
test('doctor provisioning and assignments are owner-controlled and idempotent', async () => {
  assert.equal(doctorUser.role, 'doctor');
  await assignPatient(db, 'doctor@example.com', 'alice@example.com');
  await assignPatient(db, 'doctor@example.com', 'alice@example.com');
  assert.equal((await db.query('SELECT * FROM doctor_patients')).rowCount, 1);
  await assert.rejects(
    assignPatient(db, 'alice@example.com', 'bob@example.com'),
    /existing doctor/,
  );
  await assert.rejects(
    assignPatient(db, 'doctor@example.com', 'stranger@example.com'),
    /existing doctor/,
  );
  const list = (await doctor.get('/api/doctor/patients').expect(200)).body.patients;
  assert.deepEqual(
    list.map((p) => p.id),
    [aliceId],
  );
});
test('only assigned doctors can see patient reports, even on a warm cache', async () => {
  const result = await doctor
    .get(`/api/doctor/patients/${aliceId}/reports?date=${date}`)
    .expect(200);
  assert.equal(result.headers['x-report-cache'], 'HIT');
  assert.equal(result.body.daily.average, 140);
  await doctor.get(`/api/doctor/patients/${bobId}/reports?date=${date}`).expect(404);
  await strangerDoctor.get(`/api/doctor/patients/${aliceId}/reports?date=${date}`).expect(404);
  await alice.get('/api/doctor/patients').expect(403);
  await alice.get(`/api/doctor/patients/${bobId}/reports?date=${date}`).expect(403);
  await doctor.get('/api/reports?date=2024-03-15').expect(403);
  await doctor.post('/api/readings').send(body).expect(403);
  await doctor.put(`/api/readings/${createdId}`).send(body).expect(403);
  await doctor.delete(`/api/readings/${createdId}`).expect(403);
});
test('unassigning a patient revokes cached report access immediately', async () => {
  await assignPatient(db, 'doctor@example.com', 'alice@example.com', true);
  await doctor.get(`/api/doctor/patients/${aliceId}/reports?date=${date}`).expect(404);
  assert.deepEqual((await doctor.get('/api/doctor/patients')).body.patients, []);
  await assignPatient(db, 'doctor@example.com', 'alice@example.com');
});
test('daily BullMQ job logs only patients with fewer than four readings, once per day', async () => {
  for (const slot of SLOTS)
    await alice.post('/api/readings').send({ date: today, slot: slot.key, value: 100 }).expect(201);
  for (const slot of SLOTS.slice(0, 3))
    await bob.post('/api/readings').send({ date: today, slot: slot.key, value: 120 }).expect(201);
  const job = await queue.add('daily-reminder', { date: today });
  const result = await job.waitUntilFinished(events, 10000);
  assert.equal(result.remindersLogged, 2);
  assert.deepEqual(
    logLines.map((r) => [r.user_id, r.reading_count, r.remaining]).sort((a, b) => a[0] - b[0]),
    [
      [bobId, 3, 1],
      [carolId, 0, 4],
    ],
  );
  const replay = await queue.add('daily-reminder', { date: today });
  assert.equal((await replay.waitUntilFinished(events, 10000)).remindersLogged, 0);
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM reminder_logs')).rows[0].count,
    2,
  );
});
test('BullMQ retries a transient database failure and keeps the persisted reminder date', async () => {
  failNextSweep = true;
  const job = await queue.add(
    'daily-reminder',
    {},
    { attempts: 2, backoff: { type: 'fixed', delay: 10 } },
  );
  assert.equal((await job.waitUntilFinished(events, 10000)).date, today);
  const stored = await queue.getJob(job.id);
  assert.equal(stored.data.date, today);
  assert.equal(stored.attemptsMade, 2);
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM reminder_logs')).rows[0].count,
    2,
  );
});
test('daily scheduler registration is idempotent and records the calendar timezone', async () => {
  const options = { pattern: '0 0 0 1 1 *', timezone: 'Asia/Kolkata' };
  await scheduleReminders(queue, options);
  await scheduleReminders(queue, options);
  const schedulers = await queue.getJobSchedulers();
  assert.equal(schedulers.length, 1);
  assert.equal(schedulers[0].tz, 'Asia/Kolkata');
  assert.equal(schedulers[0].pattern, options.pattern);
});
test('re-running the additive migration preserves existing accounts, assignments and readings', async () => {
  const before = (await db.query('SELECT count(*)::int AS count FROM readings')).rows[0].count;
  await migrate(db);
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM readings')).rows[0].count,
    before,
  );
  assert.equal((await doctor.get('/api/doctor/patients')).body.patients[0].id, aliceId);
});
