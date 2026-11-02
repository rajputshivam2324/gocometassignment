"""Portable rule tests; set TEST_DATABASE_URL to run against a disposable Postgres DB."""
import os
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.app.models import Base
from backend.app.schemas import AuctionCreate, BidCreate
from backend.app.service import AuctionService


class Clock:
    def __init__(self):
        self.now = datetime(2030, 1, 15, 12, 0, tzinfo=timezone.utc)

    def __call__(self):
        return self.now


@pytest.fixture
def engine():
    url = os.getenv("TEST_DATABASE_URL", "sqlite+pysqlite:///:memory:")
    options = {"poolclass": StaticPool, "connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {}
    instance = create_engine(url, **options)
    Base.metadata.create_all(instance)
    yield instance
    Base.metadata.drop_all(instance)
    instance.dispose()


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def session(engine):
    with Session(engine) as instance:
        yield instance


@pytest.fixture
def service(session, clock):
    return AuctionService(session, clock=clock)


@pytest.fixture
def auction_data():
    return {
        "name": "Mumbai to Rotterdam",
        "reference_id": "RFQ-2030-001",
        "start_time": "2030-01-15T11:00:00Z",
        "close_time": "2030-01-15T12:30:00Z",
        "forced_close_time": "2030-01-15T13:30:00Z",
        "service_date": "2030-01-16",
        "british_auction": True,
        "trigger_window_minutes": 10,
        "extension_minutes": 5,
        "extension_trigger": "bid_received",
    }


@pytest.fixture
def create_auction(service, auction_data):
    def create(**changes):
        return service.create_auction(AuctionCreate(**(auction_data | changes)))
    return create


@pytest.fixture
def bid_data():
    return {
        "supplier_name": "Atlas Logistics",
        "carrier_name": "Ocean Carrier",
        "freight_charges": "90.00",
        "origin_charges": "5.00",
        "destination_charges": "5.00",
        "transit_days": 14,
        "valid_until": "2030-02-01",
    }


@pytest.fixture
def bid(service, bid_data):
    def submit(auction_id, **changes):
        return service.submit_bid(auction_id, BidCreate(**(bid_data | changes)))
    return submit
