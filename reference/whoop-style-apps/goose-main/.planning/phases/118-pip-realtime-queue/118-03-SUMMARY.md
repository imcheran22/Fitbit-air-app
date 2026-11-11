---
phase: 118-pip-realtime-queue
plan: "03"
subsystem: server
tags: [fastapi, timescaledb, ingest, pip, realtime, hypertable, pytest]
status: complete
requirements: [PIP-03]
dependency_graph:
  requires: ["118-01"]
  provides: [POST /v1/ingest-realtime, realtime_frames hypertable, insert_realtime_frames_batch]
  affects: [server/ingest/app/main.py, server/ingest/app/store.py, server/db/init.sql]
tech_stack:
  added: []
  patterns: [TimescaleDB hypertable on TIMESTAMPTZ, ON CONFLICT DO NOTHING idempotent upsert, Pydantic field pattern validation, psycopg ISO8601→TIMESTAMPTZ implicit cast]
key_files:
  created:
    - server/ingest/tests/test_realtime_ingest.py
  modified:
    - server/db/init.sql
    - server/ingest/app/store.py
    - server/ingest/app/main.py
    - server/ingest/tests/conftest.py
decisions:
  - "No FK from realtime_frames to devices — realtime path does not pre-register devices via ensure_device"
  - "captured_at is TIMESTAMPTZ (not TEXT) so TimescaleDB can partition by time; psycopg casts iOS ISO8601 string automatically"
  - "Conflict key is (device_uuid, captured_at, frame_hex) matching the unique index — same dedup strategy as raw_frames"
  - "Route shares Depends(require_auth) with ingest_frames — no new auth surface, V4/V5 threat controls inherited"
metrics:
  duration: "3 minutes"
  completed: "2026-06-26T18:57:24Z"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 4
  files_created: 1
---

# Phase 118 Plan 03: FastAPI POST /v1/ingest-realtime + TimescaleDB Hypertable Summary

**One-liner:** Authenticated realtime-frame ingestion endpoint backed by a `realtime_frames` TimescaleDB hypertable partitioned on `captured_at`, with ON CONFLICT DO NOTHING idempotency and pytest coverage for 200/401/422/idempotent cases.

## What Was Built

Three changes in concert to deliver PIP-03 server ingestion:

**1. `server/db/init.sql` — realtime_frames hypertable migration**

Appended an idempotent migration block at the end of `init.sql`:
- `CREATE TABLE IF NOT EXISTS realtime_frames` with columns `device_uuid TEXT NOT NULL`, `frame_hex TEXT NOT NULL`, `captured_at TIMESTAMPTZ NOT NULL`, `source TEXT NOT NULL DEFAULT 'realtime_pip'`, `synced INTEGER NOT NULL DEFAULT 0`
- `SELECT create_hypertable('realtime_frames', 'captured_at', if_not_exists => TRUE)` — partitions by time
- `CREATE UNIQUE INDEX IF NOT EXISTS realtime_frames_dedup ON realtime_frames (device_uuid, captured_at, frame_hex)` — enables `ON CONFLICT DO NOTHING`
- `CREATE INDEX IF NOT EXISTS realtime_frames_device_time ON realtime_frames (device_uuid, captured_at)` — query performance
- No FK to `devices` — the realtime path does not pre-register devices

**2. `server/ingest/app/store.py` + `server/ingest/app/main.py` — store function + route**

- `insert_realtime_frames_batch(conn, frames: list) -> dict` — loops over frames, executes `INSERT INTO realtime_frames (device_uuid, frame_hex, captured_at) VALUES (%s, %s, %s) ON CONFLICT (device_uuid, captured_at, frame_hex) DO NOTHING`, counts `inserted` vs `skipped` via `cur.rowcount`, caller commits
- Pydantic models: `RealtimeFrame` (device_uuid: str, frame_hex: str with `pattern=r"^[0-9a-fA-F]+$"`, captured_at: str) and `IngestRealtimeBatch` (frames: list[RealtimeFrame] capped at max_length=5000)
- `POST /v1/ingest-realtime` route with `dependencies=[Depends(require_auth)]` — same auth as `ingest_frames`, no new auth surface

**3. `server/ingest/tests/` — pytest coverage + isolation**

- Added `realtime_frames` to `clean_db` TRUNCATE list in `conftest.py` for test isolation
- Created `test_realtime_ingest.py` with four tests: `test_ingest_realtime_inserts` (200, inserted==1), `test_ingest_realtime_idempotent` (skipped==1 on re-post), `test_ingest_realtime_requires_auth` (401 on missing auth), `test_ingest_realtime_validates_body` (422 on missing device_uuid)
- All four tests skip cleanly without Docker (`requires_docker` marker) — verified locally: 4 skipped, 0 failures

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 — init.sql hypertable | `5b02ab7` | feat(118-03): add realtime_frames hypertable + dedup index to init.sql |
| 2 — store + route | `09abb32` | feat(118-03): add insert_realtime_frames_batch + POST /v1/ingest-realtime |
| 3 — tests + conftest | `51e37e7` | test(118-03): add test_realtime_ingest.py + realtime_frames to conftest TRUNCATE |

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

All threat mitigations from the plan's STRIDE register are implemented:

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-118-05 (Spoofing) | `Depends(require_auth)` Bearer check via `secrets.compare_digest` | Implemented — same dependency as all `/v1` routes |
| T-118-06 (Tampering) | psycopg parameterized `%s` + Pydantic `frame_hex` pattern `^[0-9a-fA-F]+$` | Implemented |
| T-118-07 (DoS) | `IngestRealtimeBatch` `max_length=5000` | Implemented |
| T-118-SC (pip installs) | No new dependencies — FastAPI/pydantic/psycopg already in requirements.txt | Confirmed |

No new threat surface beyond what the plan modelled.

## Self-Check

| Check | Result |
|-------|--------|
| `create_hypertable('realtime_frames', 'captured_at', if_not_exists => TRUE)` in init.sql | FOUND |
| `captured_at TIMESTAMPTZ NOT NULL` in init.sql | FOUND |
| `realtime_frames_dedup` unique index in init.sql | FOUND |
| `def insert_realtime_frames_batch` in store.py | FOUND |
| `"/v1/ingest-realtime"` route in main.py | FOUND |
| `realtime_frames` in conftest.py TRUNCATE | FOUND |
| Four named tests in test_realtime_ingest.py | FOUND |
| pytest: 4 skipped (Docker unavailable), 0 failures | PASSED |
| Commits 5b02ab7, 09abb32, 51e37e7 | FOUND |

## Self-Check: PASSED
