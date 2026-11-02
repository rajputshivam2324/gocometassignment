from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import event, select

from backend.app.models import Bid
from backend.app.schemas import AuctionCreate, BidCreate


def instant(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def assert_rejected(status, operation):
    with pytest.raises(HTTPException) as error:
        operation()
    assert error.value.status_code == status


@pytest.mark.parametrize("changes", [
    {"start_time": "2030-01-15T12:30:00Z"},
    {"start_time": "2030-01-15T12:31:00Z"},
    {"forced_close_time": "2030-01-15T12:30:00Z"},
    {"forced_close_time": "2030-01-15T12:29:00Z"},
    {"service_date": "2030-01-14"},
    {"trigger_window_minutes": 0},
    {"trigger_window_minutes": 1.5},
    {"trigger_window_minutes": 2_147_483_648},
    {"extension_minutes": -1},
    {"extension_minutes": 2_147_483_648},
    {"extension_trigger": "unknown"},
    {"name": "  "},
    {"reference_id": "  "},
    {"start_time": "2030-01-15T11:00:00"},
])
def test_creation_rejects_invalid_configuration(auction_data, changes):
    with pytest.raises(ValidationError):
        AuctionCreate(**(auction_data | changes))


def test_creation_and_duplicate_reference(service, create_auction):
    auction = create_auction()
    assert auction["status"] == "active"
    assert auction["lowest_bid"] is None
    assert auction["bid_count"] == auction["supplier_count"] == auction["extension_count"] == 0
    assert auction["close_time"] == auction["original_close_time"]
    detail = service.get_auction(auction["id"])
    assert detail["bids"] == []
    assert [item["event_type"] for item in detail["activity"]] == ["created"]
    assert_rejected(409, create_auction)
    assert len(service.list_auctions()) == 1


@pytest.mark.parametrize("trigger", ["bid_received", "rank_change", "l1_change"])
def test_first_bid_triggers_each_mode_at_inclusive_window_boundary(create_auction, bid, clock, trigger):
    auction = create_auction(extension_trigger=trigger)
    clock.now = instant(auction["close_time"]) - timedelta(minutes=10)
    detail = bid(auction["id"])
    assert instant(detail["close_time"]) == instant(auction["close_time"]) + timedelta(minutes=5)
    assert detail["extension_count"] == 1
    assert detail["original_close_time"] == auction["close_time"]
    extension = next(item for item in detail["activity"] if item["event_type"] == "extended")
    assert instant(extension["previous_close_time"]) == instant(auction["close_time"])
    assert instant(extension["new_close_time"]) == instant(detail["close_time"])
    assert extension["message"]


@pytest.mark.parametrize("trigger", ["bid_received", "rank_change", "l1_change"])
def test_outside_window_does_not_extend(create_auction, bid, clock, trigger):
    auction = create_auction(extension_trigger=trigger)
    clock.now = instant(auction["close_time"]) - timedelta(minutes=10, microseconds=1)
    detail = bid(auction["id"])
    assert detail["close_time"] == auction["close_time"]
    assert detail["extension_count"] == 0


@pytest.mark.parametrize("trigger,expected", [("bid_received", 1), ("rank_change", 0), ("l1_change", 0)])
def test_price_improvement_without_rank_change_only_extends_bid_received(create_auction, bid, clock, trigger, expected):
    auction = create_auction(extension_trigger=trigger)
    bid(auction["id"])
    clock.now = instant(auction["close_time"]) - timedelta(minutes=1)
    detail = bid(auction["id"], freight_charges="89.00")
    assert detail["extension_count"] == expected
    assert detail["lowest_bid"] == "99.00"
    assert detail["supplier_count"] == 1
    assert detail["bid_count"] == 2


@pytest.mark.parametrize("trigger,expected", [("rank_change", 1), ("l1_change", 0)])
def test_new_nonleading_supplier_changes_rank_map_but_not_l1(create_auction, bid, clock, trigger, expected):
    auction = create_auction(extension_trigger=trigger)
    bid(auction["id"])
    clock.now = instant(auction["close_time"]) - timedelta(minutes=1)
    detail = bid(auction["id"], supplier_name="Beacon", freight_charges="150.00")
    assert detail["extension_count"] == expected


@pytest.mark.parametrize("trigger", ["rank_change", "l1_change"])
def test_new_lowest_supplier_extends_rank_and_l1_modes(create_auction, bid, clock, trigger):
    auction = create_auction(extension_trigger=trigger)
    bid(auction["id"])
    clock.now = instant(auction["close_time"]) - timedelta(minutes=1)
    detail = bid(auction["id"], supplier_name="Beacon", freight_charges="80.00")
    assert detail["extension_count"] == 1
    assert detail["bids"][0]["supplier_name"] == "Beacon"


@pytest.mark.parametrize("trigger,expected", [("rank_change", 1), ("l1_change", 0)])
def test_existing_supplier_reorders_lower_ranks_without_changing_l1(create_auction, bid, clock, trigger, expected):
    auction = create_auction(extension_trigger=trigger)
    bid(auction["id"], supplier_name="Leader", freight_charges="40")
    bid(auction["id"], supplier_name="Second", freight_charges="80")
    bid(auction["id"], supplier_name="Third", freight_charges="90")
    clock.now = instant(auction["close_time"]) - timedelta(minutes=1)
    detail = bid(auction["id"], supplier_name="Third", freight_charges="70")
    assert detail["extension_count"] == expected
    assert [item["supplier_name"] for item in detail["bids"]] == ["Leader", "Third", "Second"]


def test_british_disabled_prevents_extension(create_auction, bid, clock):
    auction = create_auction(british_auction=False)
    clock.now = instant(auction["close_time"]) - timedelta(seconds=1)
    detail = bid(auction["id"])
    assert detail["close_time"] == auction["close_time"]
    assert detail["extension_count"] == 0


def test_extensions_use_current_close_and_cap_at_forced_time(create_auction, bid, clock, service):
    auction = create_auction(forced_close_time="2030-01-15T12:37:00Z")
    clock.now = instant(auction["close_time"]) - timedelta(seconds=1)
    detail = bid(auction["id"])
    assert instant(detail["close_time"]).minute == 35
    clock.now = instant(detail["close_time"]) - timedelta(seconds=1)
    detail = bid(auction["id"], freight_charges="80")
    assert detail["close_time"] == detail["forced_close_time"]
    assert detail["extension_count"] == 2
    clock.now = instant(detail["close_time"]) - timedelta(seconds=1)
    detail = bid(auction["id"], freight_charges="70")
    assert detail["extension_count"] == 2
    assert detail["status"] == "active"
    clock.now = instant(detail["forced_close_time"])
    assert service.get_auction(auction["id"])["status"] == "force_closed"
    assert_rejected(409, lambda: bid(auction["id"], freight_charges="60"))


def test_scheduled_start_and_close_boundaries(create_auction, bid, clock, service):
    auction = create_auction()
    clock.now = instant(auction["start_time"]) - timedelta(microseconds=1)
    assert service.get_auction(auction["id"])["status"] == "scheduled"
    assert_rejected(409, lambda: bid(auction["id"]))
    clock.now = instant(auction["start_time"])
    assert bid(auction["id"])["bid_count"] == 1
    clock.now = instant(auction["close_time"])
    assert service.get_auction(auction["id"])["status"] == "closed"
    assert_rejected(409, lambda: bid(auction["id"], freight_charges="80"))
    clock.now = instant(auction["forced_close_time"]) + timedelta(days=1)
    assert service.get_auction(auction["id"])["status"] == "closed"


@pytest.mark.parametrize("changes", [
    {"freight_charges": "-0.01"}, {"origin_charges": "-1"}, {"destination_charges": "-1"},
    {"freight_charges": "0", "origin_charges": "0", "destination_charges": "0"},
    {"freight_charges": "1.001"}, {"freight_charges": "NaN"}, {"freight_charges": "Infinity"},
    {"transit_days": 0}, {"transit_days": 1.5}, {"supplier_name": " "}, {"carrier_name": " "},
    {"transit_days": 2_147_483_648},
])
def test_quote_payload_validation(bid_data, changes):
    with pytest.raises(ValidationError):
        BidCreate(**(bid_data | changes))


@pytest.mark.parametrize("valid_until", ["2030-01-14", "2030-01-15"])
def test_quote_must_cover_today_and_service_date(create_auction, bid, valid_until):
    auction = create_auction()
    assert_rejected(422, lambda: bid(auction["id"], valid_until=valid_until))


def test_quote_expired_after_service_day_is_still_rejected(create_auction, bid, clock):
    auction = create_auction(close_time="2030-01-18T12:30:00Z", forced_close_time="2030-01-18T13:30:00Z")
    clock.now = instant("2030-01-17T00:00:00Z")
    assert_rejected(422, lambda: bid(auction["id"], valid_until="2030-01-16"))
    assert bid(auction["id"], valid_until="2030-01-17")["bid_count"] == 1


def test_creation_dates_use_utc_calendar_day(auction_data):
    data = auction_data | {
        "start_time": "2030-01-16T00:30:00+05:30",
        "close_time": "2030-01-16T01:30:00+05:30",
        "forced_close_time": "2030-01-16T02:30:00+05:30",
        "service_date": "2030-01-15",
    }
    assert AuctionCreate(**data).service_date.isoformat() == "2030-01-15"


def test_quote_valid_through_service_day_and_decimal_total(create_auction, bid):
    detail = bid(create_auction()["id"], freight_charges="0.10", origin_charges="0.20", destination_charges=0, valid_until="2030-01-16")
    assert detail["lowest_bid"] == "0.30"
    assert detail["bids"][0]["total_amount"] == "0.30"


def test_supplier_identity_requires_strictly_lower_total(create_auction, bid, service):
    auction = create_auction()
    bid(auction["id"])
    assert_rejected(409, lambda: bid(auction["id"], supplier_name="ATLAS LOGISTICS"))
    assert_rejected(409, lambda: bid(auction["id"], supplier_name="atlas logistics", freight_charges="91"))
    detail = bid(auction["id"], supplier_name="atlas logistics", freight_charges="89.99")
    assert detail["supplier_count"] == 1
    assert detail["bid_count"] == 2
    assert detail["lowest_bid"] == "99.99"
    history = service.bid_history(auction["id"])
    assert len(history) == 2
    assert {Decimal(item["total_amount"]) for item in history} == {Decimal("100"), Decimal("99.99")}


def test_maximum_length_unicode_supplier_casefold_fits_database(create_auction, bid):
    # U+0390 expands to three code points during case folding (600 total).
    supplier = "ΐ" * 200
    assert len(supplier.casefold()) == 600
    auction = create_auction()
    bid(auction["id"], supplier_name=supplier)
    detail = bid(auction["id"], supplier_name=supplier, freight_charges="80")
    assert detail["supplier_count"] == 1
    assert detail["bid_count"] == 2
    assert detail["bids"][0]["supplier_name"] == supplier


def test_largest_supported_integer_windows_are_safely_capped(create_auction, bid, clock):
    auction = create_auction(trigger_window_minutes=2_147_483_647, extension_minutes=2_147_483_647)
    detail = bid(auction["id"], transit_days=2_147_483_647)
    assert detail["close_time"] == detail["forced_close_time"]
    assert detail["extension_count"] == 1


def test_tied_bids_rank_by_earlier_submission_and_history_preserved(create_auction, bid, clock, service):
    auction = create_auction()
    bid(auction["id"], supplier_name="First")
    clock.now += timedelta(seconds=1)
    detail = bid(auction["id"], supplier_name="Second")
    assert [(item["supplier_name"], item["rank"]) for item in detail["bids"]] == [("First", 1), ("Second", 2)]
    clock.now += timedelta(seconds=1)
    detail = bid(auction["id"], supplier_name="Second", freight_charges="89")
    assert [(item["supplier_name"], item["rank"]) for item in detail["bids"]] == [("Second", 1), ("First", 2)]
    assert len(service.bid_history(auction["id"])) == 3
    assert len([item for item in detail["activity"] if item["event_type"] == "bid_submitted"]) == 3


def test_equal_time_ties_have_stable_id_tiebreaker(create_auction, bid, service):
    auction = create_auction()
    bid(auction["id"], supplier_name="One")
    detail = bid(auction["id"], supplier_name="Two")
    assert [item["id"] for item in detail["bids"]] == sorted(item["id"] for item in detail["bids"])
    assert service.get_auction(auction["id"])["bids"] == detail["bids"]


def test_failed_commit_rolls_back_bid_activity_and_extension(create_auction, bid, service, session, clock):
    auction = create_auction()
    clock.now = instant(auction["close_time"]) - timedelta(seconds=1)

    def fail_commit(_session):
        raise RuntimeError("simulated database commit failure")

    event.listen(session, "before_commit", fail_commit)
    try:
        with pytest.raises(RuntimeError, match="simulated"):
            bid(auction["id"])
    finally:
        event.remove(session, "before_commit", fail_commit)
    # Reads through the same session also prove rollback made it usable again.
    detail = service.get_auction(auction["id"])
    assert detail["bid_count"] == 0
    assert detail["extension_count"] == 0
    assert detail["close_time"] == auction["close_time"]
    assert [item["event_type"] for item in detail["activity"]] == ["created"]
    assert list(session.scalars(select(Bid))) == []


def test_unknown_auction_rejected(service, bid):
    absent = "00000000-0000-0000-0000-000000000000"
    assert_rejected(404, lambda: service.get_auction(absent))
    assert_rejected(404, lambda: service.bid_history(absent))
    assert_rejected(404, lambda: bid(absent))
