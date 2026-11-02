"""Validated request models shared by HTTP handlers and the auction service."""

from datetime import date, timezone
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator


class InputModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    @field_validator("*")
    @classmethod
    def valid_database_text(cls, value):
        if isinstance(value, str):
            if "\x00" in value:
                raise ValueError("Text must not contain null characters")
            try:
                value.encode("utf-8")
            except UnicodeEncodeError as exc:
                raise ValueError("Text must contain valid Unicode characters") from exc
        return value


# Match PostgreSQL INTEGER capacity so oversized JSON numbers return 422.
PositiveInteger = Annotated[int, Field(gt=0, le=2_147_483_647, strict=True)]
Money = Annotated[Decimal, Field(ge=0, max_digits=16, decimal_places=2, allow_inf_nan=False)]


class AuctionCreate(InputModel):
    name: str = Field(min_length=1, max_length=200)
    reference_id: str = Field(min_length=1, max_length=100)
    start_time: AwareDatetime
    close_time: AwareDatetime
    forced_close_time: AwareDatetime
    service_date: date
    british_auction: bool = True
    trigger_window_minutes: PositiveInteger = 10
    extension_minutes: PositiveInteger = 5
    extension_trigger: Literal["bid_received", "rank_change", "l1_change"] = "bid_received"

    @field_validator("start_time", "close_time", "forced_close_time")
    @classmethod
    def valid_utc_time(cls, value):
        # An offset can push a valid local year beyond datetime's UTC range.
        try:
            return value.astimezone(timezone.utc)
        except OverflowError as exc:
            raise ValueError("Time must be representable in UTC") from exc

    @model_validator(mode="after")
    def validate_schedule(self):
        if not self.start_time < self.close_time < self.forced_close_time:
            raise ValueError("Times must satisfy start_time < close_time < forced_close_time")
        # Date comparisons use UTC, just as all persisted and server times do.
        if self.service_date < self.start_time.astimezone(timezone.utc).date():
            raise ValueError("service_date must be on or after the UTC start date")
        return self


class BidCreate(InputModel):
    supplier_name: str = Field(min_length=1, max_length=200)
    carrier_name: str = Field(min_length=1, max_length=200)
    freight_charges: Money
    origin_charges: Money
    destination_charges: Money
    transit_days: PositiveInteger
    valid_until: date

    @model_validator(mode="after")
    def validate_total(self):
        if self.freight_charges + self.origin_charges + self.destination_charges <= 0:
            raise ValueError("The total quote amount must be positive")
        return self
