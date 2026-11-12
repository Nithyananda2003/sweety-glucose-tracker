import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { config as defaults } from './config.js';
import {
  SLOTS,
  isDate,
  validateReading,
  todayInZone,
  reportRanges,
  summarize,
} from '../../shared/domain.js';

const cookieName = 'sweety_session';
const sessionAge = 7 * 24 * 60 * 60 * 1000;
const hash = (token) => createHash('sha256').update(token).digest('hex');
const publicReading = 'id, date::text, slot, value, created_at, updated_at';
const slotOrder =
  "CASE slot WHEN 'morning' THEN 1 WHEN 'after_breakfast' THEN 2 WHEN 'after_lunch' THEN 3 ELSE 4 END";
const fail = (res, status, error) => res.status(status).json({ error });
const safeUser = ({ id, name, email }) => ({ id, name, email });
const validId = (id) => /^[1-9]\d*$/.test(id) && Number(id) <= 2147483647;

export function createApp(db, overrides = {}) {
  const config = { ...defaults, ...overrides };
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: config.production, path: '/' };
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.get('origin') &&
      req.get('origin') !== config.origin
    ) {
      return fail(res, 403, 'This request origin is not allowed.');
    }
    next();
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  });
  const requireAuth = async (req, res, next) => {
    const token = req.cookies[cookieName];
    if (!token || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
      return fail(res, 401, 'Please log in to continue.');
    const result = await db.query(
      `SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at > now()`,
      [hash(token)],
    );
    if (!result.rows.length)
      return fail(res, 401, 'Your session has expired. Please log in again.');
    req.user = result.rows[0];
    next();
  };
  const createSession = async (user, res) => {
    const token = randomBytes(32).toString('hex');
    await db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)', [
      hash(token),
      user.id,
      new Date(Date.now() + sessionAge),
    ]);
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionAge });
  };

  app.get('/api/health', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  });
  app.get('/api/config', (_req, res) =>
    res.json({ timezone: config.timezone, today: todayInZone(config.timezone) }),
  );
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const { name, email, password } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80)
      return fail(res, 400, 'Please enter a name between 1 and 80 characters.');
    if (
      typeof email !== 'string' ||
      email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    )
      return fail(res, 400, 'Please enter a valid email address.');
    if (
      typeof password !== 'string' ||
      password.length < 8 ||
      Buffer.byteLength(password, 'utf8') > 72
    )
      return fail(res, 400, 'Password must be at least 8 characters and at most 72 bytes.');
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const result = await db.query(
        'INSERT INTO users (name,email,password_hash) VALUES ($1,$2,$3) RETURNING id,name,email',
        [name.trim(), email.trim().toLowerCase(), passwordHash],
      );
      await createSession(result.rows[0], res);
      res.status(201).json({ user: safeUser(result.rows[0]) });
    } catch (error) {
      if (error.code === '23505')
        return fail(res, 409, 'An account with this email already exists.');
      throw error;
    }
  });
  // A valid bcrypt hash prevents a cheap timing shortcut for unknown accounts.
  const dummyHash = bcrypt.hashSync('unused-placeholder-password', 12);
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { email, password } = req.body || {};
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      Buffer.byteLength(password) > 72
    )
      return fail(res, 401, 'Email or password is incorrect.');
    const result = await db.query('SELECT id,name,email,password_hash FROM users WHERE email=$1', [
      email.trim().toLowerCase(),
    ]);
    const user = result.rows[0];
    const matches = await bcrypt.compare(password, user?.password_hash || dummyHash);
    if (!user || !matches) return fail(res, 401, 'Email or password is incorrect.');
    await createSession(user, res);
    res.json({ user: safeUser(user) });
  });
  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));
  app.post('/api/auth/logout', async (req, res) => {
    const token = req.cookies[cookieName];
    if (typeof token === 'string')
      await db.query('DELETE FROM sessions WHERE token_hash=$1', [hash(token)]);
    res.clearCookie(cookieName, cookieOptions).sendStatus(204);
  });

  app.use('/api/readings', requireAuth);
  app.get('/api/readings', async (req, res) => {
    const { from, to } = req.query;
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 1000000 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      return fail(res, 400, 'Page must be positive and limit must be between 1 and 100.');
    if (
      (from !== undefined && !isDate(from)) ||
      (to !== undefined && !isDate(to)) ||
      (from && to && from > to)
    )
      return fail(res, 400, 'Please enter a valid date range.');
    const values = [req.user.id, from || null, to || null];
    const where =
      'user_id=$1 AND ($2::date IS NULL OR date >= $2) AND ($3::date IS NULL OR date <= $3)';
    const totalResult = await db.query(
      `SELECT count(*)::int AS total FROM readings WHERE ${where}`,
      values,
    );
    const result = await db.query(
      `SELECT ${publicReading} FROM readings WHERE ${where} ORDER BY date DESC, ${slotOrder} LIMIT $4 OFFSET $5`,
      [...values, limit, (page - 1) * limit],
    );
    const total = totalResult.rows[0].total;
    res.json({ readings: result.rows, page, limit, total, pages: Math.ceil(total / limit) });
  });

  const saveReading = async (req, res) => {
    const editing = req.method === 'PUT';
    if (editing) {
      if (!validId(req.params.id)) return fail(res, 404, 'Reading not found.');
      const owned = await db.query('SELECT id FROM readings WHERE id=$1 AND user_id=$2', [
        req.params.id,
        req.user.id,
      ]);
      if (!owned.rows.length) return fail(res, 404, 'Reading not found.');
    }
    const body = req.body || {};
    const error = validateReading(body, todayInZone(config.timezone));
    if (error) return fail(res, 400, error);
    const { date, slot, value } = body;
    const excluded = editing ? Number(req.params.id) : 0;
    const existing = await db.query(
      'SELECT slot FROM readings WHERE user_id=$1 AND date=$2 AND id<>$3',
      [req.user.id, date, excluded],
    );
    if (existing.rows.length >= 4) return fail(res, 409, 'You can add only 4 readings per day.');
    if (existing.rows.some((row) => row.slot === slot))
      return fail(
        res,
        409,
        `You already have an ${SLOTS.find((s) => s.key === slot).label} reading for this date.`,
      );
    try {
      const result = editing
        ? await db.query(
            `UPDATE readings SET date=$1,slot=$2,value=$3,updated_at=now() WHERE id=$4 AND user_id=$5 RETURNING ${publicReading}`,
            [date, slot, value, req.params.id, req.user.id],
          )
        : await db.query(
            `INSERT INTO readings (date,slot,value,user_id) VALUES ($1,$2,$3,$4) RETURNING ${publicReading}`,
            [date, slot, value, req.user.id],
          );
      if (!result.rows.length) return fail(res, 404, 'Reading not found.');
      res.status(editing ? 200 : 201).json({ reading: result.rows[0] });
    } catch (error) {
      if (error.code === '23505')
        return fail(
          res,
          409,
          `You already have an ${SLOTS.find((s) => s.key === slot).label} reading for this date.`,
        );
      throw error;
    }
  };
  app.post('/api/readings', saveReading);
  app.put('/api/readings/:id', saveReading);
  app.delete('/api/readings/:id', async (req, res) => {
    if (!validId(req.params.id)) return fail(res, 404, 'Reading not found.');
    const result = await db.query('DELETE FROM readings WHERE id=$1 AND user_id=$2 RETURNING id', [
      req.params.id,
      req.user.id,
    ]);
    if (!result.rows.length) return fail(res, 404, 'Reading not found.');
    res.sendStatus(204);
  });

  app.get('/api/reports', requireAuth, async (req, res) => {
    const { date } = req.query;
    if (!isDate(date)) return fail(res, 400, 'Please select a valid date.');
    if (date > todayInZone(config.timezone)) return fail(res, 400, 'Date cannot be in the future.');
    const ranges = reportRanges(date);
    // One statement gives all three reports a consistent database snapshot.
    const result = await db.query(
      `SELECT ${publicReading} FROM readings WHERE user_id=$1 AND date BETWEEN $2 AND $3 ORDER BY date, ${slotOrder}`,
      [req.user.id, ranges.monthly.from, date],
    );
    const reports = Object.fromEntries(
      Object.entries(ranges).map(([key, range]) => {
        const rows = result.rows.filter((row) => row.date >= range.from && row.date <= range.to);
        return [
          key,
          { ...range, ...summarize(rows), ...(key === 'daily' ? { readings: rows } : {}) },
        ];
      }),
    );
    const grouped = new Map();
    for (const row of result.rows.filter((row) => row.date >= ranges.monthToDate.from)) {
      if (!grouped.has(row.date)) grouped.set(row.date, []);
      grouped.get(row.date).push(row);
    }
    const trend = [...grouped].map(([day, rows]) => ({ date: day, ...summarize(rows) }));
    res.json({ date, ...reports, trend });
  });

  app.use('/api', (_req, res) => fail(res, 404, 'Endpoint not found.'));
  const dist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (_req, res) => res.sendFile(`${dist}/index.html`));
  }
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') return fail(res, 400, 'Please send valid JSON.');
    if (error.type === 'entity.too.large') return fail(res, 413, 'Request is too large.');
    console.error('Request failed:', error.message);
    fail(res, 500, 'Something went wrong. Please try again.');
  });
  return app;
}
