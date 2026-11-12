# Sweety API contract

All endpoints are under `/api`. JSON request/response bodies. Errors have
`{ "error": "Human-readable message." }`. Session cookies are HttpOnly,
SameSite=Lax, Secure in production, and expire after 7 days. All writes require
the configured application Origin (requests without Origin, e.g. CLI, are allowed).
All reading and report endpoints require an authenticated session and scope every
query to that user. An unknown or unowned reading returns 404.

- `GET /health` — 200 `{ status: "ok" }` if the database is reachable.
- `GET /config` — 200 `{ timezone, today }` for the configured calendar timezone.
- `POST /auth/register` — `{ name, email, password }`; 201 `{ user: { id, name, email } }`, sets session. Invalid input 400; duplicate email 409. Name 1–80 chars; email max 254; password 8–72 UTF-8 bytes.
- `POST /auth/login` — `{ email, password }`; 200 `{ user }`, sets session. Invalid credentials 401. Auth endpoints are rate limited (429).
- `GET /auth/me` — 200 `{ user }`, or 401.
- `POST /auth/logout` — 204, revokes current session and clears cookie.
- `POST /readings` — `{ date: "YYYY-MM-DD", slot, value }`; 201 `{ reading }`.
- `PUT /readings/:id` — same complete body; 200 `{ reading }`.
- `DELETE /readings/:id` — 204.
- `GET /readings?page=1&limit=20&from=YYYY-MM-DD&to=YYYY-MM-DD` — 200 `{ readings, page, limit, total, pages }`. Limit 1–100. Dates optional; inclusive, sorted newest date then slot order.
- `GET /reports?date=YYYY-MM-DD` — 200 `{ date, daily, monthToDate, monthly, trend }`. Date required, not in future. Each report: `{ from, to, count, highest, lowest, average }`; average rounded to 1 decimal, empty statistics null. Daily also includes `readings`. Monthly means the entire **previous** month relative to the selected date. Trend contains daily aggregates for the selected month through the selected date, with `{ date, average, count, lowest, highest }`.

Slot keys are `morning`, `after_breakfast`, `after_lunch`, `after_dinner`.
Reading shape: `{ id, date, slot, value, created_at, updated_at }`.
Dates are real ISO calendar dates, at or before today in APP_TIMEZONE.
Values must be JSON integers 40–600. Omitted/empty value gets a required error.
Bad input 400; duplicate slot or full day 409. A unique database constraint
protects concurrent writes. Four allowed slots plus uniqueness enforce the daily
maximum even when requests race. Edits exclude the current reading.
