# British Auction RFQ

A procurement workspace for RFQs with open supplier bidding, price rankings, and configurable closing-time extensions. Built with React, TypeScript, FastAPI, SQLAlchemy, and PostgreSQL.

## Run locally

Requires Python 3.11+, Node.js 20.19+ (or 22.12+), and a PostgreSQL database. Use your cloud provider's PostgreSQL connection string. No Docker setup is needed.

From the repository root:

```bash
cp .env.example .env
```

Set `DATABASE_URL` in `.env`:

```dotenv
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

URL-encode special characters in credentials. `postgres://` and `postgresql://` provider URLs are accepted too. Keep your provider's SSL parameters. Use a database account with permission to create tables for the initial setup.

Install dependencies:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
cd frontend
npm ci
cd ..
```

Initialize the schema and start the API:

```bash
.venv/bin/python -m backend.app.init_db
.venv/bin/python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal:

```bash
cd frontend
npm run dev -- --host 127.0.0.1
```

Open **http://localhost:5173**. The Vite development server forwards `/api` to FastAPI on port 8000. Interactive API docs are at **http://localhost:8000/docs**. Run commands from the repository root unless a command explicitly changes directory.

The app starts with an empty database. Create an RFQ through the UI, or optionally load demonstration auctions:

```bash
.venv/bin/python -m backend.app.seed
```

The seed command is opt-in; it is never run automatically against your cloud database.

## Try the auction flow

1. Create an RFQ with its start time in the past, close time a few minutes ahead, and forced close later than close. Choose a service date today or later.
2. Enable British Auction, set the trigger window to 10 minutes and extension duration to 5 minutes, and select a trigger.
3. Open the RFQ and submit a quote with supplier name, carrier, all three charges, transit time, and validity covering the service date.
4. Submit a lower quote under another supplier name. Observe rankings, the updated closing time, and the extension reason in the activity log.
5. Resubmit for the same supplier with a lower total. For the L1 trigger, the same supplier lowering its own leading quote does not extend the auction.

Times are entered and displayed in your browser's local timezone; the API stores UTC timestamps. Quotes and bids use INR. There is no login flow in this simplified assignment; supplier names are case-insensitive bidding identities.

## Verification

```bash
.venv/bin/python -m pytest tests -q
cd frontend
npm test
npm run build
```

See [testing notes](docs/TESTING.md) for the PostgreSQL integration test setup and verified scenarios. Tests never reuse `DATABASE_URL` as the PostgreSQL test database. The database initialization uses SQLAlchemy `create_all` for this first schema; it does not migrate existing schemas. For later schema changes, add versioned migrations before rollout.

## Project layout

```text
backend/app/       HTTP routes, validation, database models, auction service
backend/schema.sql PostgreSQL schema reference
frontend/         React components, forms, API client, styling
tests/             Auction rules and API integration tests
docs/              Assignment, HLD, schema, API contract, testing notes
```

## Submission documents

- [Architecture and HLD](docs/ARCHITECTURE.md), including architecture diagram, bid transaction, and design decisions
- [Database schema](docs/SCHEMA.md), including entity diagram and constraints
- [Adversarial test report](docs/BREAK_TEST_REPORT.md)
- [API contract](docs/API_CONTRACT.md)
- [Original assignment text](docs/assignment.txt)

The backend owns deadline enforcement and recomputes current status on reads. The frontend countdown is informational. Every accepted bid, extension, and extension reason is recorded atomically. At the forced deadline no more bids are accepted.
