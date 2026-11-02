"""Explicit opt-in demo records. Never run automatically."""

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .database import get_engine, init_db
from .models import Auction
from .schemas import AuctionCreate, BidCreate
from .service import AuctionService


def main():
    init_db()
    with Session(get_engine(), expire_on_commit=False) as session:
        if session.query(Auction).filter_by(reference_id="DEMO-001").first():
            print("DEMO-001 already exists; nothing changed.")
            return
        now = datetime.now(timezone.utc)
        service = AuctionService(session)
        auction = service.create_auction(AuctionCreate(
            name="Mumbai to Rotterdam ocean freight", reference_id="DEMO-001",
            start_time=now - timedelta(hours=1), close_time=now + timedelta(minutes=30),
            forced_close_time=now + timedelta(hours=2), service_date=(now + timedelta(days=7)).date(),
            extension_trigger="l1_change",
        ))
        for supplier, amount in [("Bluewater Logistics", "125000.00"), ("Harbor Freight", "119500.00")]:
            service.submit_bid(auction["id"], BidCreate(
                supplier_name=supplier, carrier_name="Ocean Express", freight_charges=amount,
                origin_charges="5000.00", destination_charges="3500.00", transit_days=21,
                valid_until=(now + timedelta(days=14)).date(),
            ))
        print(f"Created optional demo auction {auction['id']} (DEMO-001).")


if __name__ == "__main__":
    main()
