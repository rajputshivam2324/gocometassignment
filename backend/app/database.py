"""Lazily configured database connection: importing the app needs no credentials."""

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from .models import Base

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


@lru_cache
def get_engine():
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is required. Set a PostgreSQL connection URL in the root .env file.")
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    if not url.startswith("postgresql+psycopg://"):
        raise RuntimeError("DATABASE_URL must be a PostgreSQL URL (postgresql:// or postgresql+psycopg://).")
    return create_engine(url, pool_pre_ping=True)


def init_db():
    Base.metadata.create_all(get_engine())


def get_session():
    with Session(get_engine(), expire_on_commit=False) as session:
        yield session
