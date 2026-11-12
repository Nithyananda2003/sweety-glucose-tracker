# Verification record

Verified on 12 November 2026 using Windows, Node.js 24.15.0, npm 11.12.1,
and real isolated PostgreSQL 18.6 and Redis 8.10.3 instances. No in-memory
database or Redis replacement was used for the integration tests.

## Automated checks

- `npm test`: **17 passed** (5 domain tests, 8 reading form tests, 4 doctor UI tests).
- `npm run test:integration -w server`: **10 passed** against PostgreSQL.
- `npm run test:services`: **12 passed** against PostgreSQL, Redis, and BullMQ.
- `npm run build`: passed, including bundled local fonts.
- `git diff --check`: passed.

The same checks also passed in [GitHub Actions run 43163026918](https://github.com/Nithyananda2003/sweety-glucose-tracker/actions/runs/43163026918)
on a fresh Ubuntu checkout using Node 22, PostgreSQL 17, and Redis 7. All
installation, domain/frontend tests, API tests, service tests, and build steps
completed successfully.

Integration tests also ran with only TEST_DATABASE_URL set, matching CI's
configuration. They exercise password hashing, session cookies, Secure cookies
in production mode, expired sessions, logout revocation, access isolation, CRUD,
invalid values and dates, duplicate slots, four-reading cap, concurrent inserts,
database constraints, pagination, inclusive date filtering, rounded averages,
leap-month and year boundaries, Origin checks, invalid JSON, and empty reports.
The service suite additionally verifies cache hits/TTL, patient-scoped invalidation
on every mutation, stale-fill races, disconnected/unreachable Redis and recovery,
doctor provisioning, assignment checks, immediate revocation on warm caches,
read-only doctor permissions, reminder eligibility, duplicate jobs, BullMQ retries
after an injected database failure, and scheduler timezone/idempotency.

## Browser checks

Verified in the local in-app browser:

- Demo login and logout.
- Required-value validation displayed in the reading form.
- Creating a dinner reading, then editing its value; the statistics refreshed.
- A fifth reading produced the daily-limit error in the UI.
- Delete confirmation showed the reading, value, and date; API deletion was
  separately verified and the synthetic browser-test reading was cleaned up.
- Daily, month-to-date, and previous-month report periods and date labels.
- Native date-picker keyboard selection changed the reporting date.
- An empty historical period displayed null statistics and friendly empty states.
- Reading history pagination moved to page 2 with different records.
- Mobile layout at 390 × 844, with no document-level horizontal overflow.
- The compiled frontend served directly from Express, including authentication;
  no console warnings or errors were observed during that smoke check.
- The seeded doctor signed in, saw only the assigned demo patient, and opened
  daily and previous-month reports with daily reading details and no editing
  controls. The doctor layout was checked at desktop and mobile breakpoints.
- The documented assignment CLI ran successfully. The real standalone worker
  processed a manually enqueued sweep and logged the demo patient's three readings
  with one remaining slot. Live doctor reports returned cache HIT, and a doctor
  attempt to create a reading returned 403.

Nine actual browser captures are included in `screenshots/`. Some captures
show the synthetic fourth reading used to verify the workflow. The final demo
was restored to its seeded state: three readings for the current day, with
dinner available to add.

## Published submission

Public repository: [Nithyananda2003/sweety-glucose-tracker](https://github.com/Nithyananda2003/sweety-glucose-tracker).
The repository's initial commit was preserved and combined with the app's
incremental implementation history. The public repository was checked for the
README, environment example, seed script, Docker configuration, CI workflow, and
screenshots. No `.env` file was published.

## Limits

- Docker/Compose files were prepared but could not be executed: Docker was not
  installed. The Node build, migration, seed, and real PostgreSQL API flows ran.
- The browser timeout during the final screenshot refresh did not invalidate the
  earlier captures. The compiled app login was recovered and verified afterward.
