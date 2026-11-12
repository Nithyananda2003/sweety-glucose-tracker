# Sweety

A small, private blood glucose journal built with **React, Node.js, Express,
and PostgreSQL**. Log four daily check-ins, edit your history, and see daily,
month-to-date, and previous-month reports.

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

## Requirements

- Node.js **22.12+** (Node 22 LTS recommended) and npm.
- PostgreSQL **17+**, or Docker with Compose.

The assignment says “MERN + PostgreSQL”; this implementation uses PostgreSQL
instead of MongoDB, as explicitly requested. There is no MongoDB dependency.

## Install and run

Run every command from this repository's root unless noted otherwise.

```sh
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
docker compose up -d db
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

### Initialize and launch

```sh
npm run db:migrate
npm run db:seed
npm run dev
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

## Tests

```sh
# Five domain tests and eight React Testing Library tests; no database needed.
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
leap years, error messages, and frontend form behavior. CI provisions PostgreSQL
and runs these same checks on every push and pull request.

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

For a real HTTPS deployment, set NODE_ENV=production, APP_ORIGIN to the exact
HTTPS origin, and DATABASE_URL to your private PostgreSQL URL. Build with
`npm ci && npm run build`, run `npm run db:migrate`, then `npm start`.
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
- TEST_DATABASE_URL — required only when running integration tests.
- POSTGRES_PASSWORD — optional Compose database password; local default above.

No JWT secret is needed: sessions use cryptographically random 256-bit opaque
tokens stored only as SHA-256 hashes. `.env` is ignored by both Git and Docker.
No frontend environment variables or third-party API keys are required. Fonts
are bundled locally; the app makes no Google Fonts requests.

## Structure and API

```text
client/src/       React dashboard, auth, reading form, styles, frontend tests
server/src/       Express API, PostgreSQL schema, migration and seed scripts
server/test/      Domain and real-database API tests
shared/domain.js  Slot definitions, validation, calendar ranges, statistics
docs/API.md      Endpoint contract and status/error behavior
screenshots/     Actual browser captures of the running app
```

See [the API contract](docs/API.md) for endpoint bodies, response shapes, auth,
and error codes. All queries are parameterized and scoped to the signed-in user.
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
- The app refreshes reports after writes instead of caching. Redis, background
  jobs, and doctor roles were left out to keep the required scope focused.

With more time: add password reset and email verification, versioned migrations,
periodic expired-session cleanup, accessibility review with assistive technology,
end-to-end CI browser tests, export, and per-user timezone preferences. At larger
scale, compute report aggregates in SQL instead of loading two months of readings
(at most roughly 248 rows per user here).

## Publishing to GitHub

This project includes a local Git repository with incremental commits. A remote
was not created without an authenticated GitHub connection. To publish manually,
create an empty **public** repository named `sweety` on your GitHub account, then:

```sh
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/sweety.git
git push -u origin main
```

Submit that actual repository URL. Do not upload `.env` or real patient data.
If using the supplied source ZIP, use the included Git bundle to recover the
commit history before pushing (instructions are in the delivery note).
