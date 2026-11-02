# Verification

Install backend dependencies and run the portable suite:

```bash
.venv/bin/python -m pytest tests -q
```

SQLite is used only as a fast test fixture. The application requires PostgreSQL. The portable run skips tests of PostgreSQL row locks.

To verify the real database behavior, provision a **dedicated disposable database**, then run:

```bash
TEST_DATABASE_URL='postgresql+psycopg://USER:PASSWORD@HOST:5432/DISPOSABLE_TEST_DB?sslmode=require' \
  .venv/bin/python -m pytest tests -q
```

Tests create and drop application tables in `TEST_DATABASE_URL`. Never use your app's cloud database for this command. Tests do not read `DATABASE_URL` as their integration test target.

Coverage includes:

- RFQ schedule validation, unique reference handling, and unknown RFQs.
- Nonnegative charges, exact decimal totals, positive transit time, and quote validity.
- All extension triggers inside and outside the trigger window.
- Inclusive start/window boundaries and exclusive closing-time boundaries.
- Cumulative extensions clamped to the forced close, with correct final status.
- Case-insensitive supplier identity, strictly cheaper replacement quotes, ties, and preserved bid history.
- Bid and extension event rollback when a transaction fails.
- Full HTTP create/list/detail/submit/history flow.
- PostgreSQL concurrent submissions preserving both bids and both extensions.
- A blocked bid checking the clock after obtaining its row lock.

The concurrency tests use independent SQLAlchemy sessions on PostgreSQL; they do not attempt to infer locking behavior from SQLite.

Build the frontend:

```bash
cd frontend
npm ci
npm test
npm run build
```

Browser checks use the actual FastAPI server and a separate local PostgreSQL demo database. Demo records are created explicitly for verification and are never included as fabricated API responses or inserted automatically into a cloud database.

## Recorded run — 2026-11-02

- Python 3.14.8, PostgreSQL 18.6: **62 passed**.
- Portable SQLite: **59 passed, 3 PostgreSQL-only tests skipped**.
- Both runs also exercise maximum PostgreSQL integer inputs and Unicode supplier case-fold expansion.
- A dependency emits a Starlette/httpx deprecation warning; no application test failures.
- React production build: TypeScript and Vite build passed.
- Browser at 1440px: RFQ creation, two supplier submissions, rankings, two automatic extensions with reasons, charge breakdown expansion, and a rejected higher replacement quote passed.
- A bid submitted through a separate HTTP client appeared through frontend polling without reloading.
- Search, completed-status empty state, filter reset, and mobile navigation passed.
- At 390px: detail and creation dialog had no page-level horizontal overflow; typing focus survived polling and Escape dismissed the dialog.

## Adversarial follow-up — 2026-11-02

PostgreSQL: **92 passed**. Portable SQLite: **83 passed, 9 PostgreSQL-only skipped**. Frontend: **7 regression tests passed**, production build passed. See [root causes and reproductions](BREAK_TEST_REPORT.md).
