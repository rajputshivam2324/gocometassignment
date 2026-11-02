# Auction verification

From the repository root, after installing `backend/requirements.txt`:

```sh
.venv/bin/python -m pytest tests -q
```

The default SQLite run covers payload validation, API responses, all three extension triggers, exact time boundaries, supplier identity, decimal amounts, rank ties, history, and transactional rollback. PostgreSQL row-lock tests skip in that run because SQLite cannot demonstrate PostgreSQL concurrency behavior.

Run the same suite against a **dedicated disposable** PostgreSQL database:

```sh
TEST_DATABASE_URL='postgresql+psycopg://USER@127.0.0.1:55432/gocomet_test' .venv/bin/python -m pytest tests -q
```

The test fixture creates and drops application tables in this database. Do not point `TEST_DATABASE_URL` at production, a cloud database with real data, or the running demo database. PostgreSQL tests verify competing submissions preserve both extensions and final rank order, and a bid blocked on an auction row lock rechecks the clock before acceptance.
