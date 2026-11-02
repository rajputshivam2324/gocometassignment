"""Longer bidding sequences checked against an independent ranking model."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from decimal import Decimal
import random

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.app.schemas import BidCreate
from backend.app.service import AuctionService


@pytest.mark.parametrize('trigger', ['bid_received', 'rank_change', 'l1_change'])
def test_mixed_bid_sequence_preserves_rankings_deadlines_and_audit(
    service, create_auction, bid, clock, bid_data, trigger,
):
    auction = create_auction(extension_trigger=trigger, extension_minutes=1, trigger_window_minutes=2)
    original = datetime.fromisoformat(auction['close_time'])
    forced = datetime.fromisoformat(auction['forced_close_time'])
    clock.now = original - timedelta(seconds=90)
    rng = random.Random(71)
    offers = {}
    close = original
    extensions = 0
    accepted = 0
    expected = []
    for step in range(100):
        clock.now += timedelta(seconds=rng.randint(1, 15))
        supplier = f'Supplier {rng.randrange(8)}'
        # Unique cents keep this test about price movement; ties have separate tests.
        total = offers[supplier] - Decimal('10.01') if supplier in offers else Decimal(1000 + step) + Decimal('0.37')
        previous_ranks = {name: rank for rank, name in enumerate(expected, 1)}
        before_l1 = expected[0] if expected else None
        if clock.now >= close:
            with pytest.raises(HTTPException) as failure:
                bid(auction['id'], supplier_name=supplier, freight_charges=str(total), origin_charges='0', destination_charges='0')
            assert failure.value.status_code == 409
            break
        offers[supplier] = total
        expected = sorted(offers, key=lambda name: offers[name])
        next_ranks = {name: rank for rank, name in enumerate(expected, 1)}
        qualifies = (trigger == 'bid_received' or (trigger == 'rank_change' and previous_ranks != next_ranks) or (trigger == 'l1_change' and before_l1 != expected[0]))
        if qualifies and close - clock.now <= timedelta(minutes=2):
            extended = min(close + timedelta(minutes=1), forced)
            extensions += extended > close
            close = extended
        result = bid(auction['id'], supplier_name=supplier, freight_charges=str(total), origin_charges='0', destination_charges='0')
        accepted += 1
        assert result['bid_count'] == accepted
        assert result['supplier_count'] == len(offers)
        assert result['extension_count'] == extensions
        assert datetime.fromisoformat(result['close_time']) == close <= forced
        assert [(row['supplier_name'], row['rank'], Decimal(row['total_amount'])) for row in result['bids']] == [(name, rank, offers[name]) for rank, name in enumerate(expected, 1)]
        events = result['activity']
        assert sum(e['event_type'] == 'bid_submitted' for e in events) == accepted
        assert sum(e['event_type'] == 'extended' for e in events) == extensions
        if step % 9 == 0:
            with pytest.raises(HTTPException) as failure:
                bid(auction['id'], supplier_name=supplier.upper(), freight_charges=str(total), origin_charges='0', destination_charges='0')
            assert failure.value.status_code == 409
            unchanged = service.get_auction(auction['id'])
            assert unchanged['bid_count'] == accepted
            assert len(unchanged['activity']) == len(events)
    assert accepted >= 10


def test_twenty_simultaneous_suppliers_preserve_bids_and_hard_cap(engine, create_auction, clock, bid_data):
    if engine.dialect.name != 'postgresql':
        pytest.skip('Real PostgreSQL row locking is required')
    auction = create_auction(extension_trigger='rank_change', trigger_window_minutes=60, extension_minutes=20)
    clock.now = datetime.fromisoformat(auction['close_time']) - timedelta(seconds=1)

    def submit(index):
        with Session(engine) as session:
            return AuctionService(session, clock=clock).submit_bid(auction['id'], BidCreate(**(bid_data | {'supplier_name': f'Concurrent {index}', 'freight_charges': str(1000 - index)})))

    with ThreadPoolExecutor(max_workers=20) as pool:
        results = list(pool.map(submit, range(20)))
    assert len(results) == 20
    with Session(engine) as session:
        final = AuctionService(session, clock=clock).get_auction(auction['id'])
    assert final['bid_count'] == final['supplier_count'] == 20
    assert final['close_time'] == auction['forced_close_time']
    assert final['extension_count'] == 3
    assert [row['supplier_name'] for row in final['bids']] == [f'Concurrent {index}' for index in reversed(range(20))]
    assert len([e for e in final['activity'] if e['event_type'] == 'bid_submitted']) == 20
