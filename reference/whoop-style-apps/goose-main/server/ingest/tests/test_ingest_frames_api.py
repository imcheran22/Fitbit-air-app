"""Round-trip + auth + idempotency tests for POST /v1/ingest-frames.

These tests require a live TimescaleDB container (see conftest.py); they are
automatically skipped when Docker is unavailable."""
import importlib

import psycopg
import pytest
from fastapi.testclient import TestClient

from tests.conftest import requires_docker

# Even-length hex strings that represent distinct dummy BLE frames.
_FRAME_A = "aa1800ff28020f3de10128663c00000000000000000001010d844e7c"
_FRAME_B = "aa1800ff28020f3de10128663c00000000000000000001010d844ead"
_FRAME_C = "aa1800ff28020f3de10128663c00000000000000000001010d844eff"

_DEVICE_ID = "test-device-frames-01"


@pytest.fixture
def client(clean_db, tmp_path, monkeypatch):
    monkeypatch.setenv("GOOSE_API_KEY", "secret")
    monkeypatch.setenv("GOOSE_DB_DSN", clean_db)
    monkeypatch.setenv("GOOSE_RAW_ROOT", str(tmp_path))
    import app.main as m
    importlib.reload(m)
    return TestClient(m.app, headers={"Authorization": "Bearer secret"})


def _frames_payload(device_id: str) -> dict:
    """Return the iOS-shaped batch payload with 3 distinct frames."""
    return {
        "device": {
            "id": device_id,
            "mac": "AA:BB:CC:DD:EE:FF",
            "name": "WHOOP Goose Test",
        },
        "frames": [
            {
                "captured_at_unix": 1700000000.0,
                "frame_hex": _FRAME_A,
                "source": "ios.corebluetooth.notification",
                "device_type": "GOOSE",
                "device_model": "WHOOP Goose",
                "sensitivity": "user-owned-capture",
            },
            {
                "captured_at_unix": 1700000001.0,
                "frame_hex": _FRAME_B,
                "source": "ios.corebluetooth.notification",
                "device_type": "GOOSE",
                "device_model": "WHOOP Goose",
                "sensitivity": "user-owned-capture",
            },
            {
                "captured_at_unix": 1700000002.0,
                "frame_hex": _FRAME_C,
                "source": "ios.corebluetooth.notification",
                "device_type": "GOOSE",
                "device_model": "WHOOP Goose",
                "sensitivity": "user-owned-capture",
            },
        ],
    }


@requires_docker
def test_round_trip(client):
    """POST 3 frames, then GET them back via the export endpoint in order."""
    payload = _frames_payload(_DEVICE_ID)

    # Upload
    r = client.post("/v1/ingest-frames", json=payload)
    assert r.status_code == 200, r.text
    assert r.json() == {"inserted": 3, "skipped": 0}

    # Export — fetch with a wide time window
    r2 = client.get(
        f"/v1/export/frames/{_DEVICE_ID}",
        params={"from": 1699999999.0, "to": 1700000010.0},
    )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["count"] == 3
    frames = body["frames"]
    # Must be ordered ascending by captured_at_unix
    timestamps = [f["captured_at_unix"] for f in frames]
    assert timestamps == sorted(timestamps)
    # frame_hex values must match what was posted
    hexes = {f["frame_hex"] for f in frames}
    assert hexes == {_FRAME_A, _FRAME_B, _FRAME_C}


@requires_docker
def test_idempotency(client):
    """Posting the same batch twice inserts 0 rows on the second attempt."""
    payload = _frames_payload(_DEVICE_ID)

    r1 = client.post("/v1/ingest-frames", json=payload)
    assert r1.status_code == 200
    assert r1.json() == {"inserted": 3, "skipped": 0}

    # Re-post the identical batch
    r2 = client.post("/v1/ingest-frames", json=payload)
    assert r2.status_code == 200
    assert r2.json() == {"inserted": 0, "skipped": 3}

    # Export still returns exactly 3 frames (no duplicates)
    r3 = client.get(
        f"/v1/export/frames/{_DEVICE_ID}",
        params={"from": 1699999999.0, "to": 1700000010.0},
    )
    assert r3.status_code == 200
    assert r3.json()["count"] == 3


@requires_docker
def test_auth_required(client):
    """POST /v1/ingest-frames without a valid Bearer token must return 401."""
    payload = _frames_payload(_DEVICE_ID)
    r = client.post(
        "/v1/ingest-frames",
        json=payload,
        headers={"Authorization": ""},
    )
    assert r.status_code == 401


_UUID_DEVICE_ID = "test-device-uuid-01"
_TEST_UUID = "12345678-1234-5678-1234-567812345678"


@requires_docker
def test_device_uuid_persisted(client, clean_db):
    """POST /v1/ingest-frames with device_uuid — row stored with that device_uuid."""
    payload = {
        "device": {
            "id": _UUID_DEVICE_ID,
            "mac": "AA:BB:CC:DD:EE:01",
            "name": "WHOOP UUID Test",
        },
        "frames": [
            {
                "captured_at_unix": 1700001000.0,
                "frame_hex": _FRAME_A,
                "source": "ios.corebluetooth.notification",
                "device_type": "GOOSE",
                "device_model": "WHOOP 5.0 Goose",
                "sensitivity": "user-owned-capture",
                "device_uuid": _TEST_UUID,
            }
        ],
    }
    r = client.post("/v1/ingest-frames", json=payload)
    assert r.status_code == 200, r.text
    assert r.json() == {"inserted": 1, "skipped": 0}

    # Verify the row was stored with the expected device_uuid.
    with psycopg.connect(clean_db) as conn:
        row = conn.execute(
            "SELECT device_uuid FROM raw_frames WHERE device_id = %s",
            (_UUID_DEVICE_ID,),
        ).fetchone()
    assert row is not None, "Row not found in raw_frames"
    assert row[0] == _TEST_UUID, f"Expected device_uuid={_TEST_UUID!r}, got {row[0]!r}"
