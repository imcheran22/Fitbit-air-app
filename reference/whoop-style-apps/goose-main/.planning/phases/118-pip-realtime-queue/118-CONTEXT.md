# Phase 118: PIP Realtime Queue - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Multi-layer phase. Delivers:
1. **Swift (PIP-01):** `RealtimePIPQueue` class — parallel to `CaptureFrameWriteQueue`; own `NSLock`; separate `DispatchQueue`; tags frames `FRAME_SOURCE_REALTIME`; inserts into `realtime_frames` via `realtime.insert_frame` bridge method. Always-on in parallel with existing capture.
2. **Rust (PIP-01 bridge):** New `realtime.insert_frame` bridge method that inserts into `realtime_frames` table.
3. **Server (PIP-03):** `POST /v1/ingest-realtime` FastAPI endpoint (Bearer token auth, same pattern as existing `/v1/ingest-frames`); `realtime_frames` TimescaleDB hypertable on server.

Requirements in scope: PIP-01, PIP-03
Out of scope: PIP-02 (table already done in Phase 113, schema v24); Phase 124 (server endpoint consumer — this phase just creates it)

</domain>

<decisions>
## Implementation Decisions

### Trigger
- **D-01:** `RealtimePIPQueue` is always-on in parallel. Every BLE frame goes to BOTH `CaptureFrameWriteQueue` (historical/raw_frames) AND `RealtimePIPQueue` (realtime_frames) simultaneously. No gating logic.

### Bridge Method
- **D-02:** New `realtime.insert_frame` bridge method (not reuse of `capture.import_frames`). Dedicated method routes directly to `realtime_frames` table. Follows existing domain module pattern (body_composition.rs, capabilities.rs).

### Claude's Discretion
- `RealtimePIPQueue` is modeled on `CaptureFrameWriteQueue.swift` — same threading pattern (`NSLock`, `DispatchQueue`, `@unchecked Sendable`), same batch-insert approach
- Server endpoint auth: Bearer token, same as `/v1/ingest-frames`
- Server hypertable creation: `SELECT create_hypertable('realtime_frames', 'captured_at', if_not_exists => TRUE)` in migration
- `realtime.insert_frame` args: `{ database_path, device_uuid, frame_hex, captured_at }` → inserts into `realtime_frames` with `source = 'realtime_pip'`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Swift Model
- `GooseSwift/CaptureFrameWriteQueue.swift` — exact threading pattern, NSLock, DispatchQueue, bridge call pattern to mirror in `RealtimePIPQueue`
- `GooseSwift/GooseAppModel.swift` lines ~52 — how `captureFrameWriteQueue` is instantiated and wired, to replicate for `realtimePIPQueue`

### Rust Bridge Pattern
- `Rust/core/src/bridge/body_composition.rs` — recent new domain module; replicate for `bridge/realtime.rs`
- `Rust/core/src/bridge/mod.rs` — BRIDGE_METHODS insertion point for `realtime.insert_frame`
- `Rust/core/src/store/mod.rs` line ~1922 area — `realtime_frames` table DDL (already exists, schema v24)

### Server Pattern
- `server/ingest/` — existing ingest endpoint structure to replicate for `/v1/ingest-realtime`
- `server/docker-compose.yml` — TimescaleDB setup for hypertable context

### Requirements
- `.planning/REQUIREMENTS.md` §PIP Realtime Pipeline (#168) — PIP-01, PIP-02, PIP-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Swift: CaptureFrameWriteQueue is the template
- `final class CaptureFrameWriteQueue: @unchecked Sendable` at GooseSwift/CaptureFrameWriteQueue.swift:184
- Uses `NSLock` for thread safety, `DispatchQueue` labeled "com.goose.swift.capture-frame-write"
- Calls bridge with JSON request, gets back response

### Rust: realtime_frames table exists
- Schema v24 from Phase 113; columns: device_uuid, frame_hex, captured_at, source (NOT NULL DEFAULT 'realtime_pip'), synced INTEGER NOT NULL DEFAULT 0
- Covering index on (device_uuid, captured_at) already in DDL

### Server: ingest pattern
- Existing `/v1/ingest-frames` in server/ingest/ is the reference
- Bearer token auth same pattern throughout server

### Integration point
- `GooseAppModel` owns `captureFrameWriteQueue`; will also own `realtimePIPQueue`
- Both queues receive the same BLE notification bytes (D-01)

</code_context>

<specifics>
## Specific Ideas

- `RealtimePIPQueue` label: `"com.goose.swift.realtime-pip-write"`
- Bridge args: `{ database_path, device_uuid, frame_hex, captured_at }` where `captured_at` is ISO8601 timestamp
- Both queues called from same notification callback in GooseAppModel
- Server endpoint: `POST /v1/ingest-realtime` with JSON body `{ frames: [{device_uuid, frame_hex, captured_at}] }`

</specifics>

<deferred>
## Deferred Ideas

- UI to display realtime frame rate/status (future phase)
- Rate limiting or frame sampling for realtime queue (future optimization)
- Phase 124 (PIP Server Endpoint consumer) — the server endpoint created here is the ingestion side; display/streaming is later

</deferred>

---

*Phase: 118-PIP Realtime Queue*
*Context gathered: 2026-06-24*
