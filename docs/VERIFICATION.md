# Verification record

Verified on 12 November 2026 using Windows, Node.js 24.15.0, npm 11.12.1,
and a real isolated PostgreSQL 18.6 instance. No in-memory database replacement
was used for the API integration tests.

## Automated checks

- `npm test`: **13 passed** (5 domain tests and 8 React form tests).
- `npm run test:integration -w server`: **10 passed** against PostgreSQL.
- `npm run build`: passed, including bundled local fonts.
- `git diff --check`: passed.

Integration tests also ran with only TEST_DATABASE_URL set, matching CI's
configuration. They exercise password hashing, session cookies, Secure cookies
in production mode, expired sessions, logout revocation, access isolation, CRUD,
invalid values and dates, duplicate slots, four-reading cap, concurrent inserts,
database constraints, pagination, inclusive date filtering, rounded averages,
leap-month and year boundaries, Origin checks, invalid JSON, and empty reports.

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

Seven actual browser captures are included in `screenshots/`. Some captures
show the synthetic fourth reading used to verify the workflow. The final demo
was restored to its seeded state: three readings for the current day, with
dinner available to add.

## Limits

- Docker/Compose files were prepared but could not be executed: Docker was not
  installed. The Node build, migration, seed, and real PostgreSQL API flows ran.
- The GitHub Actions workflow was prepared but has not run on GitHub. It targets
  Node 22 and PostgreSQL 17; the local versions are recorded above.
- No public GitHub remote was created because no authenticated GitHub connection
  was available. The local commit history and a portable Git bundle are supplied.
- The browser timeout during the final screenshot refresh did not invalidate the
  earlier captures. The compiled app login was recovered and verified afterward.
