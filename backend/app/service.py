"""Auction rules and atomic bid processing independent of HTTP and wall-clock time."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Callable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import Activity, Auction, Bid
from .schemas import AuctionCreate, BidCreate


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    """SQLite drops timezone metadata; PostgreSQL timestamptz remains aware."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def iso(value: datetime) -> str:
    return as_utc(value).isoformat()


def money(value: Decimal) -> str:
    return format(value, ".2f")


class AuctionService:
    def __init__(self, session: Session, clock: Callable[[], datetime] = utc_now):
        self.session = session
        self.clock = clock

    def _bids(self, auction_id: str) -> list[Bid]:
        return list(self.session.scalars(select(Bid).where(Bid.auction_id == auction_id)))

    @staticmethod
    def _ranked(bids: list[Bid]) -> list[Bid]:
        latest: dict[str, Bid] = {}
        for bid in bids:
            # Supplier totals strictly decrease. The minimum is their latest
            # quote even when two submissions share a clock timestamp.
            if bid.supplier_key not in latest or bid.total_amount < latest[bid.supplier_key].total_amount:
                latest[bid.supplier_key] = bid
        return sorted(latest.values(), key=lambda bid: (bid.total_amount, as_utc(bid.created_at), bid.id))

    @staticmethod
    def _rank_map(ranked: list[Bid]) -> dict[str, int]:
        return {bid.supplier_key: rank for rank, bid in enumerate(ranked, 1)}

    def _auction(self, auction_id: str, *, lock: bool = False) -> Auction:
        statement = select(Auction).where(Auction.id == auction_id)
        if lock:
            # Refresh identity-map values after a lock wait or previous read.
            statement = statement.with_for_update().execution_options(populate_existing=True)
        auction = self.session.scalar(statement)
        if auction is None:
            raise HTTPException(404, "Auction not found")
        return auction

    @staticmethod
    def _status(auction: Auction, now: datetime) -> str:
        if now < as_utc(auction.start_time):
            return "scheduled"
        if now < as_utc(auction.close_time):
            return "active"
        return "force_closed" if as_utc(auction.close_time) == as_utc(auction.forced_close_time) else "closed"

    def _summary(self, auction: Auction, bids: list[Bid], now: datetime) -> dict:
        ranked = self._ranked(bids)
        return {
            "id": auction.id,
            "name": auction.name,
            "reference_id": auction.reference_id,
            "start_time": iso(auction.start_time),
            "close_time": iso(auction.close_time),
            "original_close_time": iso(auction.original_close_time),
            "forced_close_time": iso(auction.forced_close_time),
            "service_date": auction.service_date.isoformat(),
            "british_auction": auction.british_auction,
            "trigger_window_minutes": auction.trigger_window_minutes,
            "extension_minutes": auction.extension_minutes,
            "extension_trigger": auction.extension_trigger,
            "extension_count": auction.extension_count,
            "status": self._status(auction, now),
            "lowest_bid": money(ranked[0].total_amount) if ranked else None,
            "bid_count": len(bids),
            "supplier_count": len(ranked),
            "created_at": iso(auction.created_at),
        }

    @staticmethod
    def _bid_output(bid: Bid, rank: int | None) -> dict:
        return {
            "id": bid.id,
            "auction_id": bid.auction_id,
            "supplier_name": bid.supplier_name,
            "carrier_name": bid.carrier_name,
            "freight_charges": money(bid.freight_charges),
            "origin_charges": money(bid.origin_charges),
            "destination_charges": money(bid.destination_charges),
            "total_amount": money(bid.total_amount),
            "transit_days": bid.transit_days,
            "valid_until": bid.valid_until.isoformat(),
            "rank": rank,
            "created_at": iso(bid.created_at),
        }

    def _detail(self, auction: Auction, now: datetime) -> dict:
        bids = self._bids(auction.id)
        result = self._summary(auction, bids, now)
        result["bids"] = [self._bid_output(bid, rank) for rank, bid in enumerate(self._ranked(bids), 1)]
        activity = self.session.scalars(
            select(Activity).where(Activity.auction_id == auction.id).order_by(Activity.created_at.desc(), Activity.sequence.desc())
        )
        result["activity"] = [
            {
                "id": event.id,
                "event_type": event.event_type,
                "message": event.message,
                "created_at": iso(event.created_at),
                "previous_close_time": iso(event.previous_close_time) if event.previous_close_time else None,
                "new_close_time": iso(event.new_close_time) if event.new_close_time else None,
            }
            for event in activity
        ]
        return result

    def create_auction(self, payload: AuctionCreate) -> dict:
        now = as_utc(self.clock())
        values = payload.model_dump()
        for key in ("start_time", "close_time", "forced_close_time"):
            values[key] = as_utc(values[key])
        auction = Auction(**values, original_close_time=values["close_time"], created_at=now, extension_count=0)
        try:
            self.session.add(auction)
            self.session.flush()
            self.session.add(Activity(auction_id=auction.id, event_type="created", message="Auction created.", created_at=now))
            self.session.flush()
            result = self._summary(auction, [], now)
            self.session.commit()
            return result
        except IntegrityError as exc:
            self.session.rollback()
            raise HTTPException(409, "An auction with this reference_id already exists") from exc
        except Exception:
            self.session.rollback()
            raise

    def list_auctions(self) -> list[dict]:
        now = as_utc(self.clock())
        auctions = list(self.session.scalars(select(Auction).order_by(Auction.created_at.desc(), Auction.id.desc())))
        bids_by_auction: dict[str, list[Bid]] = {}
        if auctions:
            for bid in self.session.scalars(select(Bid).where(Bid.auction_id.in_([auction.id for auction in auctions]))):
                bids_by_auction.setdefault(bid.auction_id, []).append(bid)
        return [self._summary(auction, bids_by_auction.get(auction.id, []), now) for auction in auctions]

    def get_auction(self, auction_id: str) -> dict:
        return self._detail(self._auction(auction_id), as_utc(self.clock()))

    def bid_history(self, auction_id: str) -> list[dict]:
        self._auction(auction_id)
        bids = self._bids(auction_id)
        latest_ranks = {bid.id: rank for rank, bid in enumerate(self._ranked(bids), 1)}
        return [self._bid_output(bid, latest_ranks.get(bid.id)) for bid in sorted(bids, key=lambda b: (as_utc(b.created_at), b.id), reverse=True)]

    def submit_bid(self, auction_id: str, payload: BidCreate) -> dict:
        try:
            auction = self._auction(auction_id, lock=True)
            # Capture server time AFTER taking the row lock. A request waiting
            # behind another transaction cannot submit after the deadline.
            now = as_utc(self.clock())
            close = as_utc(auction.close_time)
            forced = as_utc(auction.forced_close_time)
            if now < as_utc(auction.start_time):
                raise HTTPException(409, "Bidding has not started")
            if now >= close or now >= forced:
                raise HTTPException(409, "Bidding has closed")
            if payload.valid_until < max(now.date(), auction.service_date):
                raise HTTPException(422, "valid_until must be on or after both the current UTC date and service_date")

            before = self._ranked(self._bids(auction.id))
            supplier_key = payload.supplier_name.casefold()
            total = payload.freight_charges + payload.origin_charges + payload.destination_charges
            previous = next((bid for bid in before if bid.supplier_key == supplier_key), None)
            if previous is not None and total >= previous.total_amount:
                raise HTTPException(409, "A supplier's new quote must strictly decrease their previous total")

            bid = Bid(**payload.model_dump(), auction_id=auction.id, supplier_key=supplier_key, total_amount=total, created_at=now)
            self.session.add(bid)
            self.session.flush()
            after = self._ranked([*before, bid])
            self.session.add(Activity(
                auction_id=auction.id, event_type="bid_submitted",
                message=f"{bid.supplier_name} submitted a quote of INR {money(total)}.", created_at=now,
            ))
            before_l1 = before[0].supplier_key if before else None
            after_l1 = after[0].supplier_key
            qualifies = {
                "bid_received": True,
                "rank_change": self._rank_map(before) != self._rank_map(after),
                "l1_change": before_l1 != after_l1,
            }[auction.extension_trigger]
            in_window = (close - now).total_seconds() <= auction.trigger_window_minutes * 60
            if auction.british_auction and in_window and qualifies:
                # Keep exact microsecond precision and cap before adding to
                # datetime, including unusually large positive settings.
                duration = min(timedelta(minutes=auction.extension_minutes), forced - close)
                new_close = close + duration
                if new_close > close:
                    auction.close_time = new_close
                    auction.extension_count += 1
                    reason = {
                        "bid_received": "a bid was received",
                        "rank_change": "supplier rankings changed",
                        "l1_change": "the lowest-priced supplier changed",
                    }[auction.extension_trigger]
                    self.session.add(Activity(
                        auction_id=auction.id, event_type="extended",
                        message=f"Auction extended because {reason} within the trigger window.",
                        created_at=now, previous_close_time=close, new_close_time=new_close,
                    ))
            self.session.flush()
            result = self._detail(auction, now)
            self.session.commit()
            return result
        except Exception:
            self.session.rollback()
            raise
