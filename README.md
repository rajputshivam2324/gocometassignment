# British Auction RFQ

An RFQ tool where suppliers bid against each other and the auction's closing time moves out when bids come in near the end. Frontend is React + TypeScript, backend is FastAPI with SQLAlchemy on PostgreSQL.

## Running it locally

You'll need Python 3.11+, Node 20.19+ (or 22.12+), `make`, and a PostgreSQL database. There's no Docker setup, so just point it at a hosted Postgres and use the connection string your provider gives you.

Copy the example env file from the repo root:

```bash
cp .env.example .env
```

Then fill in `DATABASE_URL`:

```dotenv
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

A few things about that URL: special characters in the username or password need to be URL-encoded, plain `postgres://` and `postgresql://` URLs from your provider work too, and you should keep whatever SSL parameters they give you. For the first run the database user needs permission to create tables.

Install everything once (Python and frontend dependencies):

```bash
make setup
```

Start the backend from the repo root:

```bash
make backend
```

This starts FastAPI on port 8000 with reload enabled. It reads the root `.env` and creates missing tables on startup, so there is no separate database setup command. It needs a working PostgreSQL connection before it can start.

In a second terminal, also from the repo root:

```bash
make frontend
```

The app is at http://localhost:5173. Vite proxies `/api` to the FastAPI server on port 8000, and the API docs live at http://localhost:8000/docs. Unless a command says otherwise, run everything from the repo root.

The database starts empty. You can create an RFQ in the UI, or load some demo auctions with:

```bash
make seed
```

Seeding is opt-in. Nothing runs it automatically, so it won't touch your cloud database unless you tell it to.

## Trying out an auction

1. Create an RFQ with a start time in the past, a close time a few minutes from now, and a forced close time after that. The service date should be today or later.
2. Turn on British Auction, set the trigger window to 10 minutes and the extension to 5 minutes, and pick a trigger.
3. Open the RFQ and submit a quote. You need a supplier name, carrier, all three charges, transit time, and a validity that covers the service date.
4. Submit a lower quote as a different supplier. The rankings will update, the close time should move out, and the activity log will say why it was extended.
5. Now submit a lower quote again as the same supplier. With the L1 trigger, a supplier undercutting its own leading bid doesn't extend the auction.

Some things worth knowing: times are entered and shown in your browser's timezone, but stored as UTC. All amounts are in INR. There's no login in this version, so a supplier is just a name, and names are matched case-insensitively.

## Tests

```bash
.venv/bin/python -m pytest tests -q
cd frontend
npm test
npm run build
```

The PostgreSQL integration tests need their own database, which is covered in [docs/TESTING.md](docs/TESTING.md) along with the scenarios we checked. The tests will never use your `DATABASE_URL` as the test database.

One caveat: `init_db` uses SQLAlchemy's `create_all`, which only creates missing tables and won't migrate an existing schema. If the schema changes later, add proper migrations before deploying.

## Layout

```text
backend/app/        routes, validation, models, auction logic
backend/schema.sql  reference copy of the PostgreSQL schema
frontend/           React components, forms, API client, styles
tests/              auction rule tests and API integration tests
docs/               assignment, HLD, schema, API contract, testing notes
```

## Docs

- [Architecture / HLD](docs/ARCHITECTURE.md): architecture diagram, how a bid is processed, design decisions
- [Database schema](docs/SCHEMA.md): entity diagram and constraints
- [Adversarial test report](docs/BREAK_TEST_REPORT.md)
- [API contract](docs/API_CONTRACT.md)
- [Original assignment](docs/assignment.txt)

## Backend

`main.py` exposes the API, `schemas.py` validates input, and `service.py` handles bidding and rankings. PostgreSQL stores auctions, bid history, and activity. Totals use decimal arithmetic; only each supplier's latest quote is ranked.

Each bid locks its auction row, checks server time, and saves the quote, any extension, and activity together. Reads use one database snapshot to avoid mixing old deadlines with new bids. Closing needs no background job: late bids are rejected and extensions stop at the forced deadline. The UI countdown is only a display.
