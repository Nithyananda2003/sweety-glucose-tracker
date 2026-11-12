// Explicitly opt in with TEST_DATABASE_URL. Uses an isolated, randomly named schema.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../src/app.js';
import { SLOTS, todayInZone } from '../../shared/domain.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to run PostgreSQL integration tests.');
// migrate.js imports the normal pool; bind it to the explicit test database too.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { migrate } = await import('../src/migrate.js');
const { pool: unusedPool } = await import('../src/db.js');
const schema = `sweety_test_${randomBytes(8).toString('hex')}`;
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
let app, alice, bob, aliceId;
const newReading = { date: '2024-03-15', slot: 'morning', value: 100 };
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(db);
  app = createApp(db, { production: false, origin: 'http://localhost:5173', timezone: 'Asia/Kolkata' });
  alice = request.agent(app); bob = request.agent(app);
});
after(async () => {
  await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end(); await unusedPool.end();
});

test('register, bcrypt storage, cookie flags, normalized email and duplicate account', async () => {
  const result = await alice.post('/api/auth/register').send({ name: 'Alice', email: ' ALICE@example.com ', password: 'password123!' }).expect(201);
  aliceId = result.body.user.id;
  assert.deepEqual(Object.keys(result.body.user).sort(), ['email', 'id', 'name']);
  assert.equal(result.body.user.email, 'alice@example.com');
  assert.match(result.headers['set-cookie'][0], /HttpOnly/);
  assert.match(result.headers['set-cookie'][0], /SameSite=Lax/);
  const stored = (await db.query('SELECT password_hash FROM users WHERE id=$1', [aliceId])).rows[0].password_hash;
  assert.notEqual(stored, 'password123!'); assert.equal(await bcrypt.compare('password123!', stored), true);
  await request(app).post('/api/auth/register').send({ name: 'Other', email: 'alice@example.com', password: 'password123!' }).expect(409);
  await bob.post('/api/auth/register').send({ name: 'Bob', email: 'bob@example.com', password: 'password123!' }).expect(201);
});
test('auth validation, bad credentials and protected endpoints', async () => {
  await request(app).post('/api/auth/register').send({ name: '', email: 'bad', password: 'short' }).expect(400);
  await request(app).post('/api/auth/login').send({ email: 'alice@example.com', password: 'wrong' }).expect(401);
  await request(app).post('/api/auth/login').send({ email: 'absent@example.com', password: 'wrong' }).expect(401);
  await request(app).get('/api/readings').expect(401);
  await request(app).get('/api/reports?date=2024-03-15').expect(401);
  await alice.get('/api/auth/me').expect(200);
});
test('create and edit reject missing, decimal, string, out-of-range and future readings', async () => {
  for (const value of [undefined, '', 39, 601, 100.5, '100', null]) {
    const result = await alice.post('/api/readings').send({ ...newReading, value }).expect(400);
    assert.equal(typeof result.body.error, 'string');
  }
  await alice.post('/api/readings').send({ ...newReading, date: '2999-01-01' }).expect(400);
  await alice.post('/api/readings').send({ ...newReading, date: '2024-02-30' }).expect(400);
  await alice.post('/api/readings').send({ ...newReading, slot: 'invalid' }).expect(400);
});
test('CRUD, duplicate slots, maximum four, edit exclusion and ownership isolation', async () => {
  const first = await alice.post('/api/readings').send(newReading).expect(201);
  const id = first.body.reading.id;
  assert.equal(first.body.reading.date, newReading.date);
  await alice.put(`/api/readings/${id}`).send({ ...newReading, value: 101 }).expect(200);
  await alice.put(`/api/readings/${id}`).send({ ...newReading, value: 101.1 }).expect(400);
  const duplicate = await alice.post('/api/readings').send(newReading).expect(409);
  assert.match(duplicate.body.error, /already have/);
  for (const slot of SLOTS.slice(1)) await alice.post('/api/readings').send({ ...newReading, slot: slot.key }).expect(201);
  const full = await alice.post('/api/readings').send(newReading).expect(409);
  assert.match(full.body.error, /only 4/);
  await alice.put(`/api/readings/${id}`).send({ ...newReading, value: 110 }).expect(200);
  await alice.put(`/api/readings/${id}`).send({ ...newReading, slot: 'after_lunch' }).expect(409);
  assert.equal((await bob.get('/api/readings').expect(200)).body.total, 0);
  await bob.put(`/api/readings/${id}`).send(newReading).expect(404);
  await bob.delete(`/api/readings/${id}`).expect(404);
  assert.equal((await bob.get('/api/reports?date=2024-03-15').expect(200)).body.daily.count, 0);
  await bob.post('/api/readings').send(newReading).expect(201);
  await alice.delete(`/api/readings/${id}`).expect(204);
  await alice.delete(`/api/readings/${id}`).expect(404);
  for (const id of ['bad', '999999999999999999999']) await alice.delete(`/api/readings/${id}`).expect(404);
});
test('concurrent requests cannot bypass slot uniqueness or daily cap', async () => {
  const body = { ...newReading, date: '2024-03-10' };
  const results = await Promise.all(Array.from({ length: 6 }, () => alice.post('/api/readings').send(body)));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 5);
  const remaining = await Promise.all(SLOTS.slice(1).map((slot) => alice.post('/api/readings').send({ ...body, slot: slot.key })));
  assert.equal(remaining.filter((r) => r.status === 201).length, 3);
  assert.equal((await alice.get('/api/reports?date=2024-03-10')).body.daily.count, 4);
});
test('database itself rejects an invalid slot, range and duplicate', async () => {
  await assert.rejects(db.query('INSERT INTO readings(user_id,date,slot,value) VALUES ($1,$2,$3,$4)', [aliceId, '2024-03-10', 'invalid', 100]), { code: '23514' });
  await assert.rejects(db.query('INSERT INTO readings(user_id,date,slot,value) VALUES ($1,$2,$3,$4)', [aliceId, '2024-03-10', 'morning', 601]), { code: '23514' });
  await assert.rejects(db.query('INSERT INTO readings(user_id,date,slot,value) VALUES ($1,$2,$3,$4)', [aliceId, '2024-03-10', 'morning', 100]), { code: '23505' });
});
test('reports include exact date boundaries, leap day, rounding and empty state', async () => {
  for (const [date, value] of [['2024-01-31', 600], ['2024-02-01', 100], ['2024-02-29', 103], ['2024-03-01', 90]]) {
    await alice.post('/api/readings').send({ ...newReading, date, value }).expect(201);
  }
  const result = (await alice.get('/api/reports?date=2024-03-01').expect(200)).body;
  assert.deepEqual(result.monthly, { from: '2024-02-01', to: '2024-02-29', count: 2, highest: 103, lowest: 100, average: 101.5 });
  assert.equal(result.daily.count, 1); assert.equal(result.daily.readings[0].slot, 'morning');
  assert.equal(result.monthToDate.count, 1); assert.equal(result.trend.length, 1);
  const empty = (await alice.get('/api/reports?date=2023-01-01').expect(200)).body;
  assert.equal(empty.daily.count, 0); assert.equal(empty.daily.average, null); assert.deepEqual(empty.daily.readings, []);
  await alice.get('/api/reports?date=2999-01-01').expect(400);
  await alice.get('/api/reports?date=2024-02-30').expect(400);
  await alice.get('/api/reports').expect(400);
});
test('pagination and inclusive filters work, with stable slot ordering', async () => {
  const first = (await alice.get('/api/readings?from=2024-03-10&to=2024-03-10&limit=2&page=1').expect(200)).body;
  const second = (await alice.get('/api/readings?from=2024-03-10&to=2024-03-10&limit=2&page=2').expect(200)).body;
  assert.equal(first.total, 4); assert.equal(first.pages, 2);
  assert.deepEqual([...first.readings, ...second.readings].map((row) => row.slot), SLOTS.map((slot) => slot.key));
  for (const query of ['limit=0', 'limit=101', 'page=1.5', 'page=-1', 'from=bad', 'from=2024-03-11&to=2024-03-10']) await alice.get(`/api/readings?${query}`).expect(400);
});
test('CSRF origin check, malformed JSON and API 404 are clear', async () => {
  await alice.post('/api/readings').set('Origin', 'https://evil.example').send(newReading).expect(403);
  await alice.post('/api/readings').set('Content-Type', 'application/json').send('{').expect(400);
  await request(app).get('/api/unknown').expect(404);
  const settings = (await request(app).get('/api/config').expect(200)).body;
  assert.equal(settings.today, todayInZone('Asia/Kolkata'));
});
test('logout revokes the database session, even if an old cookie is replayed', async () => {
  const login = await request(app).post('/api/auth/login').send({ email: 'alice@example.com', password: 'password123!' }).expect(200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(204);
  await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
});
