"""Portable ORM mappings; PostgreSQL provides row locks for bid transactions."""

from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def new_id() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Auction(Base):
    __tablename__ = "auctions"
    __table_args__ = (
        CheckConstraint("start_time < original_close_time", name="auction_start_before_close"),
        CheckConstraint("original_close_time < forced_close_time", name="auction_initial_before_forced"),
        CheckConstraint("close_time >= original_close_time AND close_time <= forced_close_time", name="auction_close_bounds"),
        CheckConstraint("trigger_window_minutes > 0 AND extension_minutes > 0", name="auction_positive_windows"),
        CheckConstraint("extension_count >= 0", name="auction_nonnegative_extensions"),
        CheckConstraint("extension_trigger IN ('bid_received', 'rank_change', 'l1_change')", name="auction_valid_trigger"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    reference_id: Mapped[str] = mapped_column(String(100), unique=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    close_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    original_close_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    forced_close_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    service_date: Mapped[date] = mapped_column(Date)
    british_auction: Mapped[bool] = mapped_column(Boolean, default=True)
    trigger_window_minutes: Mapped[int] = mapped_column(Integer, default=10)
    extension_minutes: Mapped[int] = mapped_column(Integer, default=5)
    extension_trigger: Mapped[str] = mapped_column(String(20), default="bid_received")
    extension_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Bid(Base):
    __tablename__ = "bids"
    __table_args__ = (
        Index("ix_bids_auction_supplier_created", "auction_id", "supplier_key", "created_at"),
        CheckConstraint("freight_charges >= 0 AND origin_charges >= 0 AND destination_charges >= 0", name="bid_nonnegative_charges"),
        CheckConstraint("total_amount > 0", name="bid_positive_total"),
        # SQLite NUMERIC uses floats, so exact decimal arithmetic is enforced
        # by the service there; PostgreSQL also guarantees it in the schema.
        CheckConstraint("total_amount = freight_charges + origin_charges + destination_charges", name="bid_total_matches").ddl_if(dialect="postgresql"),
        CheckConstraint("transit_days > 0", name="bid_positive_transit"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    auction_id: Mapped[str] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"))
    supplier_name: Mapped[str] = mapped_column(String(200))
    # Unicode casefold can expand one character into up to three characters.
    supplier_key: Mapped[str] = mapped_column(String(600))
    carrier_name: Mapped[str] = mapped_column(String(200))
    freight_charges: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    origin_charges: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    destination_charges: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    transit_days: Mapped[int] = mapped_column(Integer)
    valid_until: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Activity(Base):
    __tablename__ = "activities"

    # A monotonic key preserves event order when creation timestamps are identical.
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(36), unique=True, default=new_id)
    auction_id: Mapped[str] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(30))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    previous_close_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    new_close_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
