# Sweety

A small, private blood glucose journal built with **React, Node.js, Express,
and PostgreSQL**. Log four daily check-ins, edit your history, and see daily,
month-to-date, and previous-month reports.

Repository: [Nithyananda2003/sweety-glucose-tracker](https://github.com/Nithyananda2003/sweety-glucose-tracker)

![Sweety overview](screenshots/02-overview.jpg)

## Features

- Register and log in with bcrypt-hashed passwords (cost 12).
- Revocable, seven-day server-side sessions using HttpOnly cookies. Session
  tokens are hashed in PostgreSQL; passwords and tokens never enter localStorage.
- Add, view, edit, and delete your own readings. Four named slots per day.
- Required-value, whole-number, 40–600 mg/dl, duplicate-slot, daily-limit, and
  future-date validation with clear UI errors.
- Daily, month-to-date, and previous-month statistics: count, minimum, maximum,
  and average rounded to one decimal. Empty periods have friendly messages.
- Daily slot list and an SVG chart of daily averages for the selected month.
- Paginated reading history, date filtering, responsive layout, keyboard focus
  handling, and loading/error states.
- Demo seed, Docker setup, automated tests, and GitHub Actions CI.
- Redis report caching with expiry and invalidation after every reading change.
- A BullMQ worker that logs daily reminders for patients with fewer than four readings.
- Doctor accounts with a read-only dashboard for their assigned patients.

All seven optional bonus tasks are implemented: pagination, monthly chart,
Docker, React Testing Library tests, Redis caching, BullMQ reminders, and doctors.

## Requirements

- Node.js **22.12+** (Node 22 LTS recommended) and npm.
- PostgreSQL **17+**, or Docker with Compose.
- Redis **7+** for caching and background jobs (included in Docker Compose).

The assignment says “MERN + PostgreSQL”; this implementation uses PostgreSQL
instead of MongoDB, as explicitly requested. There is no MongoDB dependency.

## Install and run

Run every command from this repository's root unless noted otherwise.

```sh
git clone https://github.com/Nithyananda2003/sweety-glucose-tracker.git
cd sweety-glucose-tracker
npm ci
```

Copy `.env.example` to `.env`:

```sh
# macOS / Linux
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

Start PostgreSQL using either option below.

### Option A: Docker database

```sh
docker compose up -d db redis
```

The database is `sweety`, user `sweety`, local password `sweety_local`, bound
only to localhost port 5432. The example DATABASE_URL matches these defaults.
Set POSTGRES_PASSWORD before creating the volume to choose another password,
and update DATABASE_URL accordingly. Compose password overrides must be URI-safe.

### Option B: Your installed PostgreSQL

Using `psql` as a database administrator:

```sql
CREATE USER sweety WITH PASSWORD 'sweety_local';
CREATE DATABASE sweety OWNER sweety;
CREATE DATABASE sweety_test OWNER sweety;
```

Set DATABASE_URL in `.env` to your PostgreSQL connection string. Migrations
create the tables, constraints, and indexes; no manual table setup is needed.
Also start a local Redis 7+ instance and set REDIS_URL. When Redis is temporarily
unavailable, the API keeps working with uncached reports; reminders wait for Redis.

### Initialize and launch

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

In a second terminal, start the reminder worker:

```sh
npm run worker
```

- Frontend: **http://localhost:5173**
- API: **http://localhost:3001/api**
- Health check: **http://localhost:3001/api/health**

Open the frontend using **localhost**, matching APP_ORIGIN. Vite proxies `/api`
to Express, so cookies stay on the same origin and no broad CORS policy is needed.
`npm run dev` runs both processes. To run them separately in two terminals:

```sh
npm run dev -w server
npm run dev -w client
```

Demo login: **demo@sweety.app** / **SweetyDemo123!**. The login page can fill
these fixtures for you; it still performs a real API login. These are public
demo credentials, not deployment secrets. DEMO_EMAIL and DEMO_PASSWORD override
the seed account. The seed adds sample readings for the previous month and this
month, leaving today's dinner open. Re-running it preserves existing readings
and resets that demo account's name and password to the configured fixture.

Doctor demo login: **doctor@sweety.app** / **SweetyDoctor123!**. The seed assigns
the demo patient Alex Morgan to Dr. Jamie Chen. Use **Try the doctor demo** on the
login page to fill those credentials. The doctor sees the patient's daily,
month-to-date, and previous-month reports and chart, without edit/delete controls.
DEMO_DOCTOR_EMAIL and DEMO_DOCTOR_PASSWORD override that fixture. Re-running the
seed preserves readings and updates the two configured demo accounts.

## Doctor accounts and patient assignments

Public sign-up always creates a patient. Doctor creation and assignment are
owner-only CLI operations requiring the database credentials; users cannot
grant themselves doctor access or self-assign patients through the API.

Set DOCTOR_PASSWORD in your private `.env`, or in the current shell. Then:

```sh
npm run doctor:create -- --name "Dr. Taylor" --email doctor@example.com
npm run doctor:assign -- --doctor-email doctor@example.com --patient-email patient@example.com
npm run doctor:unassign -- --doctor-email doctor@example.com --patient-email patient@example.com
```

Both accounts must already exist and have the correct roles. Assigning twice is
safe. Removing an assignment revokes access immediately, including to cached
reports. Doctors cannot create, edit, or delete patient readings. There is no
public administrator endpoint. The API validates the current role and assignment
on every request; hiding UI controls is not the access control.

## Redis caching and BullMQ reminders

Reports are cached for REPORT_CACHE_TTL_SECONDS (default 300). Cache keys include
the patient ID, database reading revision, and selected date. Reading changes
clear all that patient's cached report periods. A PostgreSQL trigger increments
the revision in the same transaction, including when the seed or direct SQL
changes readings. Thus an older fill cannot become current after a concurrent
write, and a failed Redis invalidation cannot expose stale reports on recovery.
Authorization runs before any cache lookup. `X-Report-Cache` identifies HIT,
MISS, or BYPASS when inspecting API responses.

`npm run worker` registers an idempotent BullMQ schedule for **21:00 daily in
APP_TIMEZONE**, controlled by REMINDER_CRON. It selects patient accounts with
0–3 readings for that calendar day, writes a deduplicated `reminder_logs` row,
and prints a structured reminder log with user ID, date, count, and remaining
slots. No email or SMS is sent. Doctors and patients with four readings are excluded.

To test immediately while the worker is running:

```sh
npm run reminders:run
# Or enqueue a specific historical date:
npm run reminders:run -- --date 2026-11-12
```

Jobs retry database failures up to three times with exponential backoff. The date
is saved in the job before processing, so retries after midnight keep that date.
The database unique key ensures duplicate jobs do not create duplicate reminders.
Historical sweeps skip accounts created after the selected date. Durable log rows
are the source of truth; a process crash can interrupt console output after a row
has committed. PostgreSQL records remain intact. Run the worker as a separate
long-lived process; the API does not start a second scheduler.

## Tests

```sh
# Five domain tests and twelve React Testing Library tests; no services needed.
npm test

# Production frontend build.
npm run build
```

For the ten real PostgreSQL API integration tests, create `sweety_test` first.
With the Docker database:

```sh
docker compose exec db createdb -U sweety sweety_test
```

Then set TEST_DATABASE_URL in `.env` or explicitly in the shell:

```sh
# macOS / Linux
TEST_DATABASE_URL=postgresql://sweety:sweety_local@localhost:5432/sweety_test npm run test:integration -w server
```

```powershell
# Windows PowerShell
$env:TEST_DATABASE_URL='postgresql://sweety:sweety_local@localhost:5432/sweety_test'
npm run test:integration -w server
```

Tests create and drop a randomly named schema, never truncate application tables.
Use a dedicated test database whose user can create schemas. Checks cover auth,
bcrypt, cookie flags, logout revocation, validation, cross-user access, CRUD,
concurrent duplicates, database constraints, pagination, report boundaries,
leap years, error messages, and frontend form behavior. CI provisions PostgreSQL and Redis
and runs these same checks on every push and pull request.

For twelve additional real Redis/PostgreSQL/BullMQ integration tests, set
TEST_REDIS_URL as well (the example uses Redis logical database 1):

```sh
TEST_DATABASE_URL=postgresql://sweety:sweety_local@localhost:5432/sweety_test TEST_REDIS_URL=redis://localhost:6379/1 npm run test:services
```

```powershell
$env:TEST_DATABASE_URL='postgresql://sweety:sweety_local@localhost:5432/sweety_test'
$env:TEST_REDIS_URL='redis://localhost:6379/1'
npm run test:services
```

These tests isolate their database schema, cache prefix, and queue prefix; they
never flush Redis globally. They cover cache TTL/hits, invalidation on create,
edit/date move/delete, delayed stale fills, Redis failure/recovery, doctor
authorization and revocation, zero/three/four-reading reminder cases, duplicate
jobs, transient database failures and retries, scheduler registration, and safe
re-running of the additive database migration.

## Run the full app with Docker

```sh
docker compose --profile full up --build -d
docker compose --profile full exec app node server/src/seed.js
```

Open **http://localhost:3001**. This serves the built React app and the API
from Express. Compose uses `NODE_ENV=development` so the session cookie works
on local HTTP. The database persists in the `sweety_data` volume. Docker was not
available in the development environment, so the Docker image itself has not
been executed; the equivalent Node build and PostgreSQL flows were verified.
The full profile starts **PostgreSQL, Redis, Express/React, and the reminder
worker**. Redis persists its queue in `sweety_redis` with AOF enabled and uses
`noeviction`, as required for reliable BullMQ operation. The worker waits until
the app has migrated the schema and passed its health check. View reminder output:

```sh
docker compose --profile full logs -f worker
docker compose --profile full exec app npm run reminders:run
```

For a real HTTPS deployment, set NODE_ENV=production, APP_ORIGIN to the exact
HTTPS origin, and DATABASE_URL to your private PostgreSQL URL. Build with
`npm ci && npm run build`, run `npm run db:migrate`, then `npm start` and
`npm run worker` as separate supervised processes. Set REDIS_URL to your private
Redis instance, using a password/TLS URL when required by your provider.
In production, cookies use Secure and require HTTPS. Set TRUST_PROXY=1 only
behind a trusted one-hop reverse proxy. Configure database TLS through the
provider's connection string; never disable certificate verification.

## Environment variables

`.env.example` lists every application variable:

- DATABASE_URL — required PostgreSQL URL for application, migrations, and seed.
- PORT — Express port, default 3001.
- APP_ORIGIN — exact allowed browser origin, default http://localhost:5173.
- APP_TIMEZONE — calendar timezone, default Asia/Kolkata.
- NODE_ENV — development locally; production enables Secure cookies.
- TRUST_PROXY — default 0; optional 1 for one trusted reverse proxy hop.
- DEMO_EMAIL / DEMO_PASSWORD — seed overrides; public fixture defaults above.
- DEMO_DOCTOR_EMAIL / DEMO_DOCTOR_PASSWORD — doctor demo seed overrides.
- DOCTOR_PASSWORD — used only by the owner CLI when creating a new doctor.
- REDIS_URL — shared cache/queue connection, default redis://127.0.0.1:6379.
- REPORT_CACHE_TTL_SECONDS — report expiry, integer 1–86400, default 300.
- REMINDER_CRON — six-field schedule, default `0 0 21 * * *`, in APP_TIMEZONE.
- TEST_DATABASE_URL — required only when running integration tests.
- TEST_REDIS_URL — required only for the service integration tests.
- POSTGRES_PASSWORD — optional Compose database password; local default above.

No JWT secret is needed: sessions use cryptographically random 256-bit opaque
tokens stored only as SHA-256 hashes. `.env` is ignored by both Git and Docker.
No frontend environment variables or third-party API keys are required. Fonts
are bundled locally; the app makes no Google Fonts requests.

## Structure and API

```text
client/src/       React dashboard, auth, reading form, styles, frontend tests
server/src/       API, cache, queue worker, schema, seed and doctor owner CLI
server/test/      Domain and real-database API tests
shared/domain.js  Slot definitions, validation, calendar ranges, statistics
docs/API.md      Endpoint contract and status/error behavior
screenshots/     Actual browser captures of the running app
```

See [the API contract](docs/API.md) for endpoint bodies, response shapes, auth,
and error codes. Queries are parameterized and scoped to the signed-in patient
or to an explicitly assigned patient for doctors.
An unknown or unowned reading returns 404. The database combines four allowed
slots with a unique `(user_id, date, slot)` key, so concurrent requests cannot
create a fifth daily reading. Duplicate-slot errors take priority below four
readings; a full day returns the daily-limit error. Edits exclude themselves.

## Screenshots

- [Login](screenshots/01-login.jpg)
- [Overview](screenshots/02-overview.jpg)
- [Reading validation](screenshots/03-reading-validation.jpg)
- [Previous-month report](screenshots/04-previous-month-report.jpg)
- [Mobile overview](screenshots/05-mobile.jpg)
- [Reading history](screenshots/06-history.jpg)
- [Empty report](screenshots/07-empty-report.jpg)
- [Doctor reports](screenshots/08-doctor-reports.jpg)
- [Doctor mobile layout](screenshots/09-doctor-mobile.jpg)

See [the verification record](docs/VERIFICATION.md) for checks actually run
and the remaining environment limitations.

## Notes

Assumptions:

- Dates mean calendar days in APP_TIMEZONE, not the browser or database timezone.
  Dates are stored as PostgreSQL DATE and returned as ISO strings without shifts.
- “Monthly” means the **entire month before the selected date's month**. For
  15 October 2026, that is 1–30 September, regardless of today's month.
- Dates on or after 1 January 1900 are accepted; future dates are rejected.
- Reading values are recorded as mg/dl, with no medical interpretation or
  personalized target ranges. The chart shows daily averages, not clinical advice.
- Registration signs in immediately. Passwords require 8 characters and at most
  72 UTF-8 bytes to avoid bcrypt truncation. Email addresses are case insensitive.
- Migrations are idempotent for this initial schema. Production schema evolution
  would use versioned migration files.
- The API uses SameSite cookies, an exact Origin check on writes, JSON bodies,
  Helmet headers, and auth rate limits. Multi-instance deployments would need a
  shared rate-limit store. Origin-less API clients remain supported.
- Report caching fails open to PostgreSQL. Background jobs wait for Redis and
  retry failures, while PostgreSQL deduplicates patient/day reminder records.
- Doctor assignments are managed by the application owner using the CLI. No
  doctor may modify patient data or self-grant access.

With more time: add password reset and email verification, versioned migrations,
periodic expired-session cleanup, accessibility review with assistive technology,
end-to-end CI browser tests, export, and per-user timezone preferences. At larger
scale, compute report aggregates in SQL instead of loading two months of readings
(at most roughly 248 rows per user here).

## Submission

Submit this public repository URL:
[https://github.com/Nithyananda2003/sweety-glucose-tracker](https://github.com/Nithyananda2003/sweety-glucose-tracker).
The project retains incremental commits for the API, frontend, bonus features,
documentation, and the repository's original initialization commit.

The repository contains this setup guide, `.env.example`, the demo seed at
`server/src/seed.js`, nine working-app screenshots, automated tests, and the Notes
section above. Screenshots satisfy the requested screenshots-or-recording option.
No real credentials or patient data are included. The portable ZIP also includes
a Git bundle for recovering the same commit history without a GitHub clone.
