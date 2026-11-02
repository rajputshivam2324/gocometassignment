"""Malformed input must remain a useful 422 instead of breaking error responses."""

import json

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app, get_service


@pytest.fixture
def client(service):
    app.dependency_overrides[get_service] = lambda: service
    # Fixture schema creation keeps these requests away from the configured DB.
    with_client = TestClient(app, raise_server_exceptions=True)
    try:
        yield with_client
    finally:
        with_client.close()
        app.dependency_overrides.clear()


def post_raw_json(client, path, payload):
    # httpx's json argument rejects non-finite numbers before reaching the API.
    return client.post(path, content=json.dumps(payload), headers={"Content-Type": "application/json"})


def assert_validation(response, field):
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any(error["loc"] == ["body", field] for error in errors)
    assert all(error["msg"] and error["type"] for error in errors)
    assert all("input" not in error and "ctx" not in error for error in errors)
    # This also verifies no unpaired surrogate can leak into the HTTP response.
    response.content.decode("utf-8")


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf"), {"nested": [float("nan"), "\ud800"]}])
def test_auction_invalid_input_is_safe_to_serialize(client, auction_data, value):
    response = post_raw_json(client, "/api/auctions", auction_data | {"extension_minutes": value})
    assert_validation(response, "extension_minutes")
    assert client.get("/api/auctions").json() == []


@pytest.mark.parametrize("field", ["name", "reference_id"])
def test_auction_unpaired_surrogate_is_validation_error(client, auction_data, field):
    response = post_raw_json(client, "/api/auctions", auction_data | {field: "\ud800"})
    assert_validation(response, field)


@pytest.mark.parametrize("field,value", [
    ("supplier_name", "\udfff"),
    ("carrier_name", "\ud800"),
    ("freight_charges", float("nan")),
    ("transit_days", float("inf")),
])
def test_bid_invalid_input_is_safe_to_serialize(client, bid_data, field, value):
    response = post_raw_json(client, "/api/auctions/missing/bids", bid_data | {field: value})
    assert_validation(response, field)


def test_invalid_extra_field_name_is_safe_to_serialize(client, auction_data):
    response = post_raw_json(client, "/api/auctions", auction_data | {"\ud800": float("nan")})
    assert response.status_code == 422
    error = response.json()["detail"][0]
    assert error["type"] == "string_unicode"
    assert error["loc"] == ["body"]
    assert "input" not in error


def test_large_json_number_is_validation_error(client, auction_data):
    # Unlike Infinity, this spelling is legal JSON, but Python parses it as inf.
    body = json.dumps(auction_data)[:-1] + ', "extension_minutes": 1e999}'
    response = client.post("/api/auctions", content=body, headers={"Content-Type": "application/json"})
    assert_validation(response, "extension_minutes")


@pytest.mark.parametrize("field", ["start_time", "close_time", "forced_close_time"])
@pytest.mark.parametrize("value", ["0001-01-01T00:00:00+01:00", "9999-12-31T23:59:59-01:00"])
def test_datetime_utc_overflow_is_validation_error(client, auction_data, field, value):
    response = client.post("/api/auctions", json=auction_data | {field: value})
    assert_validation(response, field)
    assert "representable in UTC" in response.json()["detail"][0]["msg"]
    assert client.get("/api/auctions").json() == []


@pytest.mark.parametrize("changes,field,expected", [
    ({"start_time": "0001-01-01T01:00:00+01:00"}, "start_time", "0001-01-01T00:00:00+00:00"),
    ({"forced_close_time": "9999-12-31T22:59:59-01:00"}, "forced_close_time", "9999-12-31T23:59:59+00:00"),
])
def test_representable_utc_boundary_is_accepted(client, auction_data, changes, field, expected):
    response = client.post("/api/auctions", json=auction_data | changes)
    assert response.status_code == 201
    assert response.json()[field] == expected


def test_ordinary_validation_retains_frontend_error_contract(client, auction_data):
    response = client.post("/api/auctions", json=auction_data | {"extension_minutes": 0})
    assert_validation(response, "extension_minutes")
    assert response.json()["detail"][0]["type"] == "greater_than"
