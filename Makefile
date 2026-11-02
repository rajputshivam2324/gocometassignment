.PHONY: setup backend frontend test build seed

setup:
	python3 -m venv .venv
	.venv/bin/python -m pip install -r backend/requirements.txt
	cd frontend && npm ci

backend:
	.venv/bin/python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000

frontend:
	cd frontend && npm run dev -- --host 127.0.0.1

test:
	.venv/bin/python -m pytest tests -q

build:
	cd frontend && npm run build

seed:
	.venv/bin/python -m backend.app.seed
