import pytest
from fastapi.testclient import TestClient

from backend.app.main import app, get_service


@pytest.fixture
def client(service):
    app.dependency_overrides[get_service] = lambda: service
    # The isolated fixture owns schema creation, so startup need not connect to a configured cloud DB.
    instance = TestClient(app, raise_server_exceptions=True)
    yield instance
    instance.close()
    app.dependency_overrides.clear()


def test_api_round_trip(client, auction_data, bid_data):
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/auctions").json() == []
    created = client.post("/api/auctions", json=auction_data)
    assert created.status_code == 201
    auction = created.json()
    submitted = client.post(f"/api/auctions/{auction['id']}/bids", json=bid_data)
    assert submitted.status_code == 201
    assert submitted.json()["lowest_bid"] == "100.00"
    assert client.get(f"/api/auctions/{auction['id']}").json()["bid_count"] == 1
    assert len(client.get(f"/api/auctions/{auction['id']}/bid-history").json()) == 1
    assert client.get("/api/auctions").json()[0]["id"] == auction["id"]


def test_api_validation_and_not_found(client, auction_data, bid_data):
    assert client.post("/api/auctions", json=auction_data | {"extension_minutes": 0}).status_code == 422
    first = client.post("/api/auctions", json=auction_data)
    assert first.status_code == 201
    assert client.post("/api/auctions", json=auction_data).status_code == 409
    auction_id = first.json()["id"]
    assert client.post(f"/api/auctions/{auction_id}/bids", json=bid_data | {"freight_charges": "1.123"}).status_code == 422
    assert client.get("/api/auctions/00000000-0000-0000-0000-000000000000").status_code == 404
