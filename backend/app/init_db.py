"""Explicit schema initialization: python -m backend.app.init_db."""

from .database import init_db

if __name__ == "__main__":
    init_db()
    print("PostgreSQL schema initialized.")
