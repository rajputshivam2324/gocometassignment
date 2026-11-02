"""HTTP API. Run from the repository root with uvicorn backend.app.main:app."""

import os
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .database import get_session, init_db
from .schemas import AuctionCreate, BidCreate
from .service import AuctionService


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="British Auction RFQ API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def get_service(session: Annotated[Session, Depends(get_session)]) -> AuctionService:
    return AuctionService(session)


Service = Annotated[AuctionService, Depends(get_service)]


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/auctions")
def list_auctions(service: Service):
    return service.list_auctions()


@app.post("/api/auctions", status_code=201)
def create_auction(payload: AuctionCreate, service: Service):
    return service.create_auction(payload)


@app.get("/api/auctions/{auction_id}")
def get_auction(auction_id: str, service: Service):
    return service.get_auction(auction_id)


@app.post("/api/auctions/{auction_id}/bids", status_code=201)
def submit_bid(auction_id: str, payload: BidCreate, service: Service):
    return service.submit_bid(auction_id, payload)


@app.get("/api/auctions/{auction_id}/bid-history")
def bid_history(auction_id: str, service: Service):
    return service.bid_history(auction_id)
