"""Exercise commits between response SELECTs against real PostgreSQL MVCC."""
from contextlib import contextmanager

import pytest
from sqlalchemy import event, select, text
from sqlalchemy.orm import Session

from backend.app.models import Auction
from backend.app.schemas import BidCreate
from backend.app.service import AuctionService


@pytest.fixture(autouse=True)
def require_postgres(engine):
    if engine.dialect.name != "postgresql":
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database to verify snapshots")


@contextmanager
def commit_bid_before_query(engine, table, auction_id, clock, bid_data):
    """Commit on another connection at a deterministic read interleaving."""
    committed = False

    def before_query(_connection, _cursor, statement, _parameters, _context, _many):
        nonlocal committed
        if committed or f"FROM {table}" not in statement:
            return
        # Mark first so the writer's own queries cannot recursively trigger it.
        committed = True
        with Session(engine) as writer:
            assert writer.scalar(text("SHOW transaction_isolation")) == "read committed"
            AuctionService(writer, clock=clock).submit_bid(auction_id, BidCreate(**bid_data))

    event.listen(engine, "before_cursor_execute", before_query)
    try:
        yield
        assert committed, "The writer must commit between the reader's SELECTs"
    finally:
        event.remove(engine, "before_cursor_execute", before_query)


@pytest.mark.parametrize("operation,table", [
    ("detail", "bids"),
    ("detail", "activities"),
    ("list", "bids"),
    ("history", "bids"),
])
def test_read_uses_one_snapshot_despite_concurrent_bid(
    engine, service, create_auction, clock, bid_data, operation, table,
):
    auction = create_auction(close_time="2030-01-15T12:05:00Z")
    with commit_bid_before_query(engine, table, auction["id"], clock, bid_data):
        if operation == "detail":
            observed = service.get_auction(auction["id"])
            assert [entry["event_type"] for entry in observed["activity"]] == ["created"]
            assert observed["bids"] == []
        elif operation == "list":
            observed = service.list_auctions()[0]
        else:
            assert service.bid_history(auction["id"]) == []
            observed = None
        if observed is not None:
            assert observed["bid_count"] == observed["extension_count"] == 0
            assert observed["close_time"] == auction["close_time"]

    # The next operation takes a fresh snapshot and sees all of the commit.
    current = service.get_auction(auction["id"])
    assert current["bid_count"] == current["extension_count"] == 1
    assert current["close_time"] == "2030-01-15T12:10:00+00:00"
    assert {entry["event_type"] for entry in current["activity"]} == {"created", "bid_submitted", "extended"}
    assert len(service.bid_history(auction["id"])) == 1
    # Read isolation is reset when the connection returns to the pool.
    with engine.connect() as connection:
        assert connection.scalar(text("SHOW transaction_isolation")) == "read committed"


def test_read_does_not_reuse_stale_caller_identity_map(engine, session, service, create_auction, clock, bid_data):
    auction = create_auction(close_time="2030-01-15T12:05:00Z")
    stale = session.scalar(select(Auction).where(Auction.id == auction["id"]))
    assert stale.extension_count == 0
    with Session(engine) as writer:
        AuctionService(writer, clock=clock).submit_bid(auction["id"], BidCreate(**bid_data))

    result = service.get_auction(auction["id"])
    assert result["bid_count"] == result["extension_count"] == 1
    assert result["close_time"] == "2030-01-15T12:10:00+00:00"
    # Snapshot reads leave any caller-owned transaction alone.
    assert session.in_transaction()
    assert stale.extension_count == 0
