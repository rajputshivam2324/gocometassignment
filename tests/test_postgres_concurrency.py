"""Real PostgreSQL verification, deliberately skipped by portable SQLite runs."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier, Event

import pytest
from fastapi import HTTPException
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from backend.app.models import Auction
from backend.app.schemas import BidCreate
from backend.app.service import AuctionService

from test_auction_rules import instant


@pytest.fixture(autouse=True)
def require_postgres(engine):
    if engine.dialect.name != "postgresql":
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database to verify row locks")


def test_simultaneous_bids_serialize_extensions_and_rank_maps(engine, create_auction, clock, bid_data):
    auction = create_auction(trigger_window_minutes=60, extension_trigger="rank_change")
    clock.now = instant(auction["close_time"]) - timedelta(minutes=1)
    barrier = Barrier(2)

    def submit(name, amount):
        with Session(engine) as session:
            service = AuctionService(session, clock=clock)
            barrier.wait(timeout=5)
            return service.submit_bid(auction["id"], BidCreate(**(bid_data | {"supplier_name": name, "freight_charges": amount})))

    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(submit, "Atlas", "90")
        b = pool.submit(submit, "Beacon", "80")
        a.result(timeout=10)
        b.result(timeout=10)
    with Session(engine) as session:
        detail = AuctionService(session, clock=clock).get_auction(auction["id"])
    assert detail["bid_count"] == detail["supplier_count"] == detail["extension_count"] == 2
    assert instant(detail["close_time"]) == instant(auction["close_time"]) + timedelta(minutes=10)
    assert [(item["supplier_name"], item["rank"]) for item in detail["bids"]] == [("Beacon", 1), ("Atlas", 2)]


def test_waiting_bid_rechecks_close_after_obtaining_row_lock(engine, create_auction, clock, bid_data):
    auction = create_auction()
    clock.now = instant(auction["close_time"]) - timedelta(seconds=1)
    query_started = Event()

    def observe_lock_query(_connection, _cursor, statement, _parameters, _context, _many):
        if "FOR UPDATE" in statement.upper():
            query_started.set()

    def submit():
        with Session(engine) as session:
            return AuctionService(session, clock=clock).submit_bid(auction["id"], BidCreate(**bid_data))

    with Session(engine) as locker:
        locker.execute(select(Auction).where(Auction.id == auction["id"]).with_for_update()).scalar_one()
        event.listen(engine, "before_cursor_execute", observe_lock_query)
        try:
            with ThreadPoolExecutor(max_workers=1) as pool:
                pending = pool.submit(submit)
                try:
                    assert query_started.wait(timeout=5), "Bid must acquire an auction row lock"
                    assert not pending.done(), "Bid must block while another transaction holds the row lock"
                    clock.now = instant(auction["close_time"])
                finally:
                    locker.rollback()
                with pytest.raises(HTTPException) as failure:
                    pending.result(timeout=5)
                assert failure.value.status_code == 409
        finally:
            event.remove(engine, "before_cursor_execute", observe_lock_query)
    with Session(engine) as session:
        detail = AuctionService(session, clock=clock).get_auction(auction["id"])
    assert detail["bid_count"] == 0
    assert detail["extension_count"] == 0


def test_simultaneous_repeat_supplier_bids_cannot_replace_a_lower_quote(engine, create_auction, bid, clock, bid_data):
    auction = create_auction()
    bid(auction["id"])
    barrier = Barrier(2)

    def submit(amount):
        with Session(engine) as session:
            service = AuctionService(session, clock=clock)
            barrier.wait(timeout=5)
            try:
                service.submit_bid(auction["id"], BidCreate(**(bid_data | {"freight_charges": amount})))
                return 201
            except HTTPException as failure:
                return failure.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        higher = pool.submit(submit, "85")
        lower = pool.submit(submit, "80")
        outcomes = [higher.result(timeout=10), lower.result(timeout=10)]
    assert outcomes[1] == 201
    assert outcomes[0] in (201, 409)
    with Session(engine) as session:
        detail = AuctionService(session, clock=clock).get_auction(auction["id"])
    assert detail["lowest_bid"] == "90.00"
    assert detail["supplier_count"] == 1
    assert detail["bid_count"] == 1 + outcomes.count(201)
