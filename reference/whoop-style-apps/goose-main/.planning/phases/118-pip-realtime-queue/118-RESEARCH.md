# Phase 118: PIP Realtime Queue — Research

**Researched:** 2026-06-24
**Domain:** Swift concurrent queue / Rust bridge method / FastAPI server endpoint
**Confidence:** HIGH — all findings are from direct source inspection, no external docs needed

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `RealtimePIPQueue` is always-on in parallel. Every BLE frame goes to BOTH `CaptureFrameWriteQueue` (historical/raw_frames) AND `RealtimePIPQueue` (realtime_frames) simultaneously. No gating logic.
- **D-02:** New `realtime.insert_frame` bridge method (not reuse of `capture.import_frames`). Dedicated method routes directly to `realtime_frames` table. Follows existing domain module pattern (body_composition.rs, capabilities.rs).

### Claude's Discretion
- `RealtimePIPQueue` is modeled on `CaptureFrameWriteQueue.swift` — same threading pattern (`NSLock`, `DispatchQueue`, `@unchecked Sendable`), same batch-insert approach
- Server endpoint auth: Bearer token, same as `/v1/ingest-frames`
- Server hypertable creation: `SELECT create_hypertable('realtime_frames', 'captured_at', if_not_exists => TRUE)` in migration
- `realtime.insert_frame` args: `{ database_path, device_uuid, frame_hex, captured_at }` → inserts into `realtime_frames` with `source = 'realtime_pip'`
- DispatchQueue label for RealtimePIPQueue: `"com.goose.swift.realtime-pip-write"`
- Server endpoint: `POST /v1/ingest-realtime` with JSON body `{ frames: [{device_uuid, frame_hex, captured_at}] }`

### Deferred Ideas (OUT OF SCOPE)
- UI to display realtime frame rate/status (future phase)
- Rate limiting or frame sampling for realtime queue (future optimization)
- Phase 124 (PIP Server Endpoint consumer) — the server endpoint created here is the ingestion side; display/streaming is later
</user_constraints>

---

## Summary

Phase 118 adds a second, parallel SQLite write queue (`RealtimePIPQueue`) that tags every live BLE notification frame as a realtime PIP frame and inserts it into the `realtime_frames` table (already created in schema v24, Phase 113). The Swift class is a structural twin of `CaptureFrameWriteQueue`: same `NSLock`+`DispatchQueue`+`@unchecked Sendable` pattern, but calls a new `realtime.insert_frame` bridge method instead of `capture.import_frame_batch`. The Rust bridge method is a new domain module `bridge/realtime.rs`, registered in `BRIDGE_METHODS` and dispatched in `handle_bridge_request_inner`. The server layer adds `POST /v1/ingest-realtime` to `server/ingest/app/main.py` (same Bearer auth + Pydantic + psycopg pattern as `/v1/ingest-frames`) plus a `realtime_frames` TimescaleDB hypertable migration appended to `server/db/init.sql`.

**Primary recommendation:** Mirror `CaptureFrameWriteQueue` exactly for Swift; write a minimal `bridge/realtime.rs` following `body_composition.rs`; add the server endpoint following the `ingest_frames` route verbatim.

**Schema bug to fix:** The `realtime_frames` DDL in `store/mod.rs` line 1950 has `captured_at TEXT NOT NULL DEFAULT 'realtime_pip'` — the DEFAULT value is the string literal `'realtime_pip'` instead of a timestamp expression. The table also has no `source` column, but CONTEXT.md specifies inserting `source = 'realtime_pip'`. The planner must decide: either add a `source` column via `ensure_*` migration, or omit source from the SQLite table (source is implicit from the table name). The DEFAULT on `captured_at` should be fixed to `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` or simply not have a default (caller always supplies it).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Parallel BLE frame fanout | iOS App (`GooseAppModel`) | — | D-01: both queues called from same notification callback |
| Realtime frame buffering + SQLite insert | iOS App (`RealtimePIPQueue`) | Rust core (`realtime.insert_frame`) | Queue owns batching; Rust owns persistence |
| `realtime_frames` schema | Rust core (`store/mod.rs`) | — | Schema v24 already lives there; any DDL fix goes there |
| `POST /v1/ingest-realtime` ingestion | Server (`main.py`) | Server (`db/init.sql`) | Endpoint + hypertable migration |

---

## Standard Stack

No new external packages. Phase uses only existing project infrastructure.

| Component | Existing Location | Role in This Phase |
|-----------|------------------|--------------------|
| `GooseRustBridge` | `GooseSwift/GooseRustBridge.swift` | Called from `RealtimePIPQueue` (own instance, stateless) |
| `NSLock` | Foundation | Guards mutable state in `RealtimePIPQueue` |
| `DispatchQueue` | Foundation | Serial write queue for `RealtimePIPQueue` |
| `rusqlite` + `r2d2` | `Rust/core/Cargo.toml` | SQL INSERT from `realtime.insert_frame` |
| `serde` / `serde_json` | `Rust/core/Cargo.toml` | Args deserialization in `bridge/realtime.rs` |
| `psycopg` | `server/ingest/requirements.txt` | DB connection in `POST /v1/ingest-realtime` |
| `FastAPI` + `pydantic` | `server/ingest/app/main.py` | Route + request model for server endpoint |

---

## Architecture Patterns

### Swift: CaptureFrameWriteQueue Structure (Template to Mirror)

**File:** `GooseSwift/CaptureFrameWriteQueue.swift`

Key structural elements at line 184+:

```swift
// Line 184
final class CaptureFrameWriteQueue: @unchecked Sendable {
  private let writeQueue = DispatchQueue(label: "com.goose.swift.capture-frame-writes", qos: .utility)
  private let stateLock = NSLock()
  private let rust = GooseRustBridge()           // own instance, never shared
  private let databasePath: String
  private let maxQueuedRows: Int
  private let maxBatchRows: Int
  private let coalesceDelay: TimeInterval
  private var pendingRows: [CapturedFrameWriteRow] = []
  private var latestCompletion: (@MainActor (CaptureFrameWriteResult) -> Void)?
  private var queuedRowCount = 0
  private var isWriting = false
  var activeDeviceID: String? { ... }   // stateLock-guarded get/set
  var currentDeviceUUID: String? { ... } // stateLock-guarded get/set

  init(databasePath: String, maxQueuedRows: Int, maxBatchRows: Int, coalesceDelay: TimeInterval)

  func enqueue(rows: [...], completion: ...) -> CaptureFrameWriteEnqueueResult
  private func flushNext() { while true { ... rust.request(...) ... } }
}
```

**Bridge call in `flushNext` (lines 293–304):**
```swift
let report = try rust.request(
  method: "capture.import_frame_batch",
  args: [
    "database_path": databasePath,
    "parser_version": "goose-swift/live-notification",
    "include_timeline_rows": false,
    "compact_raw_payloads": false,
    "include_results": false,
    "frames": rows.map(\.bridgeObject),
    "active_device_id": activeDeviceID ?? NSNull(),
  ]
)
```

`RealtimePIPQueue` replaces this with `realtime.insert_frame` and a flat args dict (one frame at a time or batched — see below).

**After each batch, `CaptureFrameWriteQueue` also calls `storage.compact_raw_evidence` (lines 342–352).** `RealtimePIPQueue` does NOT need this — compaction applies only to `raw_evidence`, not `realtime_frames`.

### Swift: GooseAppModel Instantiation Site

**File:** `GooseSwift/GooseAppModel.swift`, lines 52–57

```swift
// Line 52
let captureFrameWriteQueue = CaptureFrameWriteQueue(
  databasePath: HealthDataStore.defaultDatabasePath(),
  maxQueuedRows: GooseAppModel.captureFrameWriteQueueMaxRows,
  maxBatchRows: GooseAppModel.captureFrameWriteBatchMaxRows,
  coalesceDelay: GooseAppModel.captureFrameWriteCoalesceDelay
)
```

`realtimePIPQueue` goes immediately after this declaration (line ~58), using the same `HealthDataStore.defaultDatabasePath()`. The planner should define `static let` constants for `realtimePIPQueueMaxRows` etc. on `GooseAppModel`.

### Swift: Notification Pipeline Dispatch Site

**File:** `GooseSwift/GooseAppModel+NotificationPipeline.swift`

The dispatch to `captureFrameWriteQueue.enqueue` happens at **line 201**, inside `captureFrameRowBuildQueue.async` (line 196):

```swift
// Line 196–210
captureFrameRowBuildQueue.async { [weak self] in
  guard let self else { return }
  let frameRows = Self.captureFrameRows(for: request)
  let enqueueResult = self.captureFrameWriteQueue.enqueue(rows: frameRows) { [weak self] result in
    self?.handleCaptureFrameWriteResult(result)
  }
  // ... aggregator.record(...)
}
```

**D-01 integration point:** `realtimePIPQueue.enqueue(...)` is called directly after `captureFrameWriteQueue.enqueue(...)` inside the same `captureFrameRowBuildQueue.async` block. This gives parallel-but-serialized-on-one-queue dispatch; both inserts race on their own respective write queues.

The `importCapturedFrames` method (line 168) has a **gate check at line 170**:
```swift
guard activeHealthPacketCapture != nil || activeActivityPersistence != nil else {
  return
}
```
Per D-01, `RealtimePIPQueue` is always-on. This means the realtime enqueue must be called **before** this guard (at a higher level in the notification path) OR the guard must be bypassed for the realtime path. The planner must resolve this: either (a) call `realtimePIPQueue.enqueue` unconditionally from the notification path before the `importCapturedFrames` guard, or (b) add a separate always-on path in `importCapturedFrames`.

**Frame row construction** (lines 696–712, `captureFrameRows(for:)`) produces `CapturedFrameWriteRow` with `source: "ios.corebluetooth.notification"`. `RealtimePIPQueue` does not use `CapturedFrameWriteRow` — it needs only `(device_uuid, frame_hex, captured_at)`, so a simpler struct `RealtimePIPFrame` suffices.

### Rust: bridge/body_composition.rs Pattern (Template for bridge/realtime.rs)

**File:** `Rust/core/src/bridge/body_composition.rs` (79 lines total)

```rust
// Pattern to follow exactly:
use serde::Deserialize;
use super::{BridgeRequest, BridgeResponse, acquire_bridge_conn, bridge_error, bridge_ok, request_args};
use crate::GooseResult;

pub(crate) fn dispatch_realtime(request: &BridgeRequest) -> BridgeResponse {
    match request.method.as_str() {
        "realtime.insert_frame" => request_args::<RealtimeInsertFrameArgs>(request)
            .and_then(insert_frame_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        _ => unreachable!("dispatch_realtime called with non-realtime method: {}", request.method),
    }
}

#[derive(Debug, Deserialize)]
struct RealtimeInsertFrameArgs {
    database_path: String,
    device_uuid: String,
    frame_hex: String,
    captured_at: String,       // ISO8601 UTC e.g. "2026-06-24T12:34:56.789Z"
}

fn insert_frame_bridge(args: RealtimeInsertFrameArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    store.insert_realtime_frame(&args.device_uuid, &args.frame_hex, &args.captured_at)?;
    Ok(serde_json::json!({"ok": true, "inserted": 1}))
}
```

The `insert_realtime_frame` method is added to `GooseStore` (in `store/mod.rs` or a new `store/realtime.rs` file) and runs:
```sql
INSERT OR IGNORE INTO realtime_frames (device_uuid, frame_hex, captured_at)
VALUES (?1, ?2, ?3)
```

### Rust: BRIDGE_METHODS Insertion Point

**File:** `Rust/core/src/bridge/mod.rs`, lines 51–218

The `BRIDGE_METHODS` array is alphabetically sorted. `"realtime.insert_frame"` belongs between:
- `"privacy.lint"` (line 179) and `"protocol.parse_frame_hex"` (line 180)

Exact insertion:
```rust
// After line 179 "privacy.lint",
"realtime.insert_frame",
// Before line 180 "protocol.parse_frame_hex",
```

### Rust: handle_bridge_request_inner Dispatch

**File:** `Rust/core/src/bridge/mod.rs`, lines 480–616

The dispatch block for `realtime.*` goes between the `capabilities` block (line 540–542) and the `metrics.*` block (line 544–552), since `realtime` sorts after `privacy` and before `settings`:

```rust
// After capabilities block (line 542):
if method.starts_with("realtime.") {
    return realtime::dispatch_realtime(&request);
}
```

Also add to mod declarations at lines 30–36:
```rust
mod realtime;
```

### Server: POST /v1/ingest-realtime Route Pattern

**File:** `server/ingest/app/main.py`, lines 427–467 (existing `/v1/ingest-frames` reference)

```python
# Request models (following IngestFramesDevice / IngestFrame / IngestFramesBatch pattern):

class RealtimeFrame(BaseModel):
    device_uuid: str
    frame_hex: str = Field(..., pattern=r"^[0-9a-fA-F]+$")
    captured_at: str   # ISO8601 UTC string

class IngestRealtimeBatch(BaseModel):
    frames: list[RealtimeFrame] = Field(..., max_length=5000)

@app.post("/v1/ingest-realtime", dependencies=[Depends(require_auth)])
def ingest_realtime(batch: IngestRealtimeBatch):
    """Accept a batch of realtime PIP frames from iOS and persist to realtime_frames."""
    payload = batch.model_dump()
    with psycopg.connect(cfg.db_dsn) as conn:
        result = store.insert_realtime_frames_batch(conn, payload["frames"])
        conn.commit()
    return result
```

`store.insert_realtime_frames_batch` is a new function in `store.py` following `insert_raw_frames_batch` (lines 36–70):

```python
def insert_realtime_frames_batch(conn: psycopg.Connection, frames: list) -> dict:
    inserted = 0
    skipped = 0
    with conn.cursor() as cur:
        for f in frames:
            cur.execute(
                """INSERT INTO realtime_frames
                   (device_uuid, frame_hex, captured_at)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (device_uuid, captured_at, frame_hex) DO NOTHING""",
                (f["device_uuid"], f["frame_hex"], f["captured_at"]),
            )
            if cur.rowcount > 0:
                inserted += 1
            else:
                skipped += 1
    return {"inserted": inserted, "skipped": skipped}
```

### Server: TimescaleDB Migration

**File:** `server/db/init.sql` — append at end of file

```sql
-- ── PIP realtime frames (Phase 118, PIP-03) ──────────────────────────────────
-- Idempotent: CREATE IF NOT EXISTS + SELECT create_hypertable with if_not_exists.
CREATE TABLE IF NOT EXISTS realtime_frames (
    device_uuid  TEXT NOT NULL,
    frame_hex    TEXT NOT NULL,
    captured_at  TIMESTAMPTZ NOT NULL,
    source       TEXT NOT NULL DEFAULT 'realtime_pip',
    synced       INTEGER NOT NULL DEFAULT 0
);
SELECT create_hypertable('realtime_frames', 'captured_at', if_not_exists => TRUE);
CREATE UNIQUE INDEX IF NOT EXISTS realtime_frames_dedup
    ON realtime_frames (device_uuid, captured_at, frame_hex);
CREATE INDEX IF NOT EXISTS realtime_frames_device_time
    ON realtime_frames (device_uuid, captured_at);
```

Note: `captured_at` is `TIMESTAMPTZ` in Postgres (the iOS side sends ISO8601; psycopg casts it). The unique index enables `ON CONFLICT DO NOTHING` for idempotent re-posts.

---

## Schema Bug: realtime_frames DDL in store/mod.rs

**Location:** `Rust/core/src/store/mod.rs`, lines 1946–1954

**Bug 1 — wrong DEFAULT on `captured_at`:** Line 1950 reads:
```sql
captured_at TEXT NOT NULL DEFAULT 'realtime_pip',
```
The string literal `'realtime_pip'` is the value that should be the `source` column default, not the `captured_at` default. This is a copy-paste error from the `source` column intent. The correct DDL should be:
```sql
captured_at TEXT NOT NULL,   -- caller always supplies ISO8601; no default needed
```

**Bug 2 — missing `source` column:** The CONTEXT.md specifies `source = 'realtime_pip'` but the DDL has no `source` column. Two options:
- Option A (recommended): Add `source TEXT NOT NULL DEFAULT 'realtime_pip'` to the DDL. Since the table is schema v24 (already created on existing devices), add it via an `ensure_realtime_source_column()` migration function (same pattern as `ensure_raw_evidence_columns()` at line 1961).
- Option B: Omit `source` from SQLite (the table name makes it implicit). The server-side `realtime_frames` already has `source DEFAULT 'realtime_pip'`.

The planner must pick Option A or B and create a DDL fix task. The `INSERT` in `insert_frame_bridge` must match whichever schema is live.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Thread safety in RealtimePIPQueue | Custom actor or semaphore | `NSLock` — exact same pattern as `CaptureFrameWriteQueue` (line 188) |
| Bridge args deserialization | Manual JSON parsing | `request_args::<Args>` + `#[derive(Deserialize)]` (body_composition.rs pattern) |
| Idempotent server insert | Manual duplicate check | `ON CONFLICT DO NOTHING` with unique index (same as `raw_frames_dedup`) |
| DB connection from Rust | `rusqlite::Connection::open` | `acquire_bridge_conn(&args.database_path)` — handles pool and path |

---

## Common Pitfalls

### Pitfall 1: Calling RealtimePIPQueue inside importCapturedFrames guard
**What goes wrong:** `importCapturedFrames` (line 168) returns early if neither `activeHealthPacketCapture` nor `activeActivityPersistence` is set. Placing the realtime enqueue inside that function after the guard means realtime capture is gated on capture session state — violating D-01.
**How to avoid:** Call `realtimePIPQueue.enqueue(...)` from the notification path at a level above the guard, or add a separate unconditional code path for realtime before the guard returns.

### Pitfall 2: Sharing a GooseRustBridge instance between queues
**What goes wrong:** `GooseRustBridge.request()` is synchronous and blocks the calling thread. If `RealtimePIPQueue` reuses `GooseAppModel.rust` or `captureFrameWriteQueue.rust`, concurrent calls from two `DispatchQueue` workers will block on each other or race.
**How to avoid:** `RealtimePIPQueue` owns its own `private let rust = GooseRustBridge()` — exactly as `CaptureFrameWriteQueue` does at line 189. This is explicitly documented in `CLAUDE.md`: "Multiple bridge instances: GooseRustBridge is not a singleton."

### Pitfall 3: Wrong DEFAULT value in realtime_frames DDL
**What goes wrong:** The existing DDL at `store/mod.rs:1950` sets `captured_at TEXT NOT NULL DEFAULT 'realtime_pip'`. Any row inserted without an explicit `captured_at` will silently get the string `'realtime_pip'` as its timestamp. The `idx_realtime_frames_device_captured` index will then order all such rows together, breaking time-based queries.
**How to avoid:** Fix the DDL in the schema v24 migration block AND add an `ensure_*` migration to patch existing databases. The `INSERT` should always supply `captured_at` explicitly (the Swift side provides an ISO8601 string).

### Pitfall 4: BRIDGE_METHODS out-of-sort order breaks the test
**What goes wrong:** `bridge_methods_constant_matches_dispatcher` test verifies the array is sorted. Adding `"realtime.insert_frame"` in the wrong position will fail the test.
**How to avoid:** Insert between `"privacy.lint"` (line 179) and `"protocol.parse_frame_hex"` (line 180). Verify with `cargo test bridge_methods` after adding.

### Pitfall 5: Server realtime_frames hypertable on non-TIMESTAMPTZ column
**What goes wrong:** `create_hypertable` requires the partition column to be `TIMESTAMPTZ` (or `TIMESTAMP`). If `captured_at` is declared as `TEXT`, TimescaleDB will reject `create_hypertable`.
**How to avoid:** Declare `captured_at TIMESTAMPTZ NOT NULL` in `init.sql`. psycopg accepts ISO8601 strings and casts them automatically.

---

## Code Examples

### RealtimePIPFrame struct (Swift)
```swift
// Minimal struct — no evidenceID/frameID/sensitivity needed for realtime table
struct RealtimePIPFrame {
  let deviceUUID: String
  let frameHex: String
  let capturedAt: String   // ISO8601 UTC, same formatter as CaptureFrameWriteQueue
}
```

### RealtimePIPQueue.flushNext bridge call (Swift)
```swift
// Source: CaptureFrameWriteQueue.swift:293 adapted for realtime.insert_frame
let report = try rust.request(
  method: "realtime.insert_frame",
  args: [
    "database_path": databasePath,
    "device_uuid": row.deviceUUID,
    "frame_hex": row.frameHex,
    "captured_at": row.capturedAt,
  ]
)
```

Note: if batching multiple frames per bridge call, the Rust method signature changes to accept `frames: [{ device_uuid, frame_hex, captured_at }]`. The CONTEXT.md implies single-frame insert; batching is Claude's discretion. Recommend matching `CaptureFrameWriteQueue`'s batch pattern (flush up to `maxBatchRows` per bridge call) for throughput.

### GooseAppModel: parallel enqueue (Swift)
```swift
// Inside captureFrameRowBuildQueue.async block, after captureFrameWriteQueue.enqueue:
captureFrameRowBuildQueue.async { [weak self] in
  guard let self else { return }
  let frameRows = Self.captureFrameRows(for: request)
  let enqueueResult = self.captureFrameWriteQueue.enqueue(rows: frameRows) { ... }

  // D-01: realtime always-on, parallel
  let realtimeFrames = Self.realtimeFrames(for: request)
  self.realtimePIPQueue.enqueue(frames: realtimeFrames)
  // ...
}
```

### Rust insert SQL (store method)
```rust
// Source: realtime_frames DDL inspection, store/mod.rs:1946
conn.execute(
    "INSERT OR IGNORE INTO realtime_frames (device_uuid, frame_hex, captured_at) VALUES (?1, ?2, ?3)",
    rusqlite::params![device_uuid, frame_hex, captured_at],
)?;
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `RealtimePIPQueue` should batch multiple frames per bridge call (like `CaptureFrameWriteQueue`) rather than insert one frame per call | Architecture Patterns (bridge call) | If insert-one-at-a-time: more FFI overhead; easily changed |
| A2 | The server `realtime_frames` table partition key should be `captured_at` (matching iOS timestamp), not `received_at` | Server migration | If wrong: hypertable partitions on wrong time axis |
| A3 | The D-01 "always-on" path goes inside `captureFrameRowBuildQueue.async` (after the existing enqueue call), not at a higher notification level | Architecture Patterns | If wrong: may need to plumb `frame_hex`+`captured_at` to a different call site |

---

## Open Questions

1. **importCapturedFrames guard vs D-01**
   - What we know: `importCapturedFrames` (line 168–211) returns early if no active capture/activity session. D-01 says realtime is always-on.
   - What's unclear: Should `RealtimePIPQueue.enqueue` be called from a lower level (bypassing the guard entirely), or should `importCapturedFrames` be refactored to have a pre-guard realtime path?
   - Recommendation: Call realtime enqueue from the BLE notification parse result handler before `importCapturedFrames` is invoked, so the guard never applies to realtime. The planner should trace the notification path above line 168 to find the right call site.

2. **realtime_frames source column in SQLite**
   - What we know: DDL has no `source` column; CONTEXT.md says `source = 'realtime_pip'`.
   - What's unclear: Is `source` actually needed in SQLite (the table is realtime-only by definition) or only in the server Postgres table?
   - Recommendation: Add `source TEXT NOT NULL DEFAULT 'realtime_pip'` to the SQLite DDL via `ensure_realtime_source_column()` for forward compatibility, since the server table has it.

3. **Batch size for realtime.insert_frame**
   - What we know: `CaptureFrameWriteQueue` flushes up to `maxBatchRows` per bridge call.
   - What's unclear: Should `realtime.insert_frame` accept a single frame or an array?
   - Recommendation: Implement as array (rename to `realtime.insert_frames`) from the start to match the batch pattern. Saves repeated FFI round-trips at high BLE notification rates.

---

## Environment Availability

Step 2.6: SKIPPED — phase is code-only (Swift + Rust + Python). All runtimes (Xcode, Cargo, Python) are already established by prior phases.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (Rust) | `cargo test` (integration tests in `Rust/core/tests/`) |
| Framework (Swift) | Xcode test target `GooseSwiftTests` |
| Quick run command | `cd /Users/francisco/Documents/goose/Rust/core && cargo test realtime` |
| Full suite command | `cd /Users/francisco/Documents/goose/Rust/core && cargo test` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command |
|-----|----------|-----------|-------------------|
| PIP-01 (bridge) | `realtime.insert_frame` inserts a row in `realtime_frames` | Integration | `cargo test realtime` |
| PIP-01 (bridge) | `BRIDGE_METHODS` sorted, dispatcher handles `realtime.*` | Unit | `cargo test bridge_methods_constant_matches_dispatcher` |
| PIP-01 (Swift) | `RealtimePIPQueue.enqueue` accepts frames without crashing | Manual/build | Xcode build + simulator smoke |
| PIP-03 (server) | `POST /v1/ingest-realtime` returns 200 + `{"inserted": N}` | Manual curl | `curl -X POST .../v1/ingest-realtime -H "Authorization: Bearer ..."` |

### Wave 0 Gaps
- [ ] `Rust/core/tests/test_realtime_bridge.rs` — covers `realtime.insert_frame` round-trip
- [ ] Schema DDL fix verified by migration test (or manual `PRAGMA table_info(realtime_frames)` check)

---

## Security Domain

No new auth surfaces on the Swift/Rust layer. Server endpoint inherits the same `require_auth` dependency (Bearer token via `secrets.compare_digest`) used by all `/v1/` routes — no additional security decisions needed.

| ASVS Category | Applies | Control |
|---------------|---------|---------|
| V4 Access Control | yes | `Depends(require_auth)` — same as all other POST endpoints |
| V5 Input Validation | yes | Pydantic `pattern=r"^[0-9a-fA-F]+$"` on `frame_hex`; `max_length=5000` on frames list |
| V6 Cryptography | no | No key material involved |

---

## Sources

### Primary (HIGH confidence — direct source inspection)
- `GooseSwift/CaptureFrameWriteQueue.swift` — full file read; threading pattern, NSLock, bridge call structure, completion coalescing
- `GooseSwift/GooseAppModel.swift` lines 1–120 — instantiation site at line 52, queue labels, constant names
- `GooseSwift/GooseAppModel+NotificationPipeline.swift` lines 160–212, 686–712 — `importCapturedFrames` dispatch, frame row builder, guard condition
- `Rust/core/src/bridge/mod.rs` lines 51–616 — full `BRIDGE_METHODS` array, `handle_bridge_request_inner` routing, all domain dispatch blocks
- `Rust/core/src/bridge/body_composition.rs` — full file; template for `bridge/realtime.rs`
- `Rust/core/src/store/mod.rs` lines 1946–1957 — `realtime_frames` DDL with bugs identified
- `server/ingest/app/main.py` — full file; `require_auth`, `ingest_frames` route at line 453, Pydantic models
- `server/ingest/app/store.py` lines 36–70 — `insert_raw_frames_batch` implementation
- `server/db/init.sql` — full file; `raw_frames` hypertable pattern at lines 107–121

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all existing infrastructure
- Architecture: HIGH — direct code inspection with exact line numbers
- Pitfalls: HIGH — schema bug confirmed by direct DDL reading; threading pitfall confirmed by CLAUDE.md pattern
- Schema bug: HIGH — confirmed at `store/mod.rs:1950`, `DEFAULT 'realtime_pip'` on `captured_at`

**Research date:** 2026-06-24
**Valid until:** 2026-07-24 (stable codebase, no fast-moving external deps)
