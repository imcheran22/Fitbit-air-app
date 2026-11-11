"""Round-trip + auth + idempotency + validation tests for POST /v1/ingest-realtime.

These tests require a live TimescaleDB container (see conftest.py); they are
automatically skipped when Docker is unavailable."""
import importlib

import pytest
from fastapi.testclient import TestClient

from tests.conftest import requires_docker

# Fixed test frame values used across all tests.
_DEVICE_UUID = "DEV-1"
_FRAME_HEX = "aabbcc"
_CAPTURED_AT = "2026-06-24T12:34:56.789Z"

_VALID_FRAME = {
    "device_uuid": _DEVICE_UUID,
    "frame_hex": _FRAME_HEX,
    "captured_at": _CAPTURED_AT,
}


@pytest.fixture
def client(clean_db, tmp_path, monkeypatch):
    monkeypatch.setenv("GOOSE_API_KEY", "secret")
    monkeypatch.setenv("GOOSE_DB_DSN", clean_db)
    monkeypatch.setenv("GOOSE_RAW_ROOT", str(tmp_path))
    import app.main as m
    importlib.reload(m)
    return TestClient(m.app, headers={"Authorization": "Bearer secret"})


@requires_docker
def test_ingest_realtime_inserts(client):
    """POST one valid frame with auth returns 200 and inserted == 1."""
    r = client.post("/v1/ingest-realtime", json={"frames": [_VALID_FRAME]})
    assert r.status_code == 200, r.text
    assert r.json()["inserted"] == 1
    assert r.json()["skipped"] == 0


@requires_docker
def test_ingest_realtime_idempotent(client):
    """Re-posting the same frame returns skipped == 1, inserted == 0."""
    payload = {"frames": [_VALID_FRAME]}

    r1 = client.post("/v1/ingest-realtime", json=payload)
    assert r1.status_code == 200, r1.text
    assert r1.json()["inserted"] == 1

    r2 = client.post("/v1/ingest-realtime", json=payload)
    assert r2.status_code == 200, r2.text
    assert r2.json()["inserted"] == 0
    assert r2.json()["skipped"] == 1


@requires_docker
def test_ingest_realtime_requires_auth(client):
    """POST without Authorization header returns 401."""
    r = client.post(
        "/v1/ingest-realtime",
        json={"frames": [_VALID_FRAME]},
        headers={"Authorization": ""},
    )
    assert r.status_code == 401


@requires_docker
def test_ingest_realtime_validates_body(client):
    """POST a frame missing device_uuid returns 422."""
    r = client.post(
        "/v1/ingest-realtime",
        json={"frames": [{"frame_hex": _FRAME_HEX, "captured_at": _CAPTURED_AT}]},
    )
    assert r.status_code == 422
