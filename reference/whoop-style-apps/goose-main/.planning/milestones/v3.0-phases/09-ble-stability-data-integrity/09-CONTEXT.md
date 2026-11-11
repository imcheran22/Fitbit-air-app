# Phase 9: BLE Stability & Data Integrity - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix five structural bugs: (1) HR monitor frames stored without device_id, (2) WHOOP BLE reconnect has no backoff, (3) HR monitor BLE reconnect has no backoff, (4) Rust FFI panics crash the process instead of returning a JSON error, (5) raw evidence storage can balloon to 512 MB during large history syncs.

No new user-facing features. No new BLE protocol work. No new server changes.

</domain>

<decisions>
## Implementation Decisions

### FIX-01 — device_id per linha (CR-02)

- **D-01:** Fix on the INSERT side. Swift passes `peripheral.identifier.uuidString` as `active_device_id` in the bridge args when calling capture_import methods. Stores non-NULL value in `capture_sessions.active_device_id` AND `ble_raw_notifications.device_id` for every HR monitor frame.
- **D-02:** Upload bridge (`upload.get_recent_decoded_streams`) filters by `device_type` column already present in `decoded_frames` ("HrMonitor" vs "Goose"). No JOIN to `capture_sessions` required. The JOIN-based multi-device filter is deferred to a future phase.

### FIX-02/FIX-03 — UI do backoff de reconexão

- **D-03:** Attempt counter and reconnect controls (Retry / Stop buttons) are displayed in `ConnectionView` (existing debug/diagnostic screen). No new view added.
- **D-04:** After 10 failed attempts: show a failure message (e.g., "Reconnection failed after 10 attempts") and a "Try again" button. Tapping "Try again" restarts the backoff cycle from attempt 1.
- **D-05:** Stop button aborts the active reconnection cycle and returns state to `"idle"`. Remembered device is NOT cleared — the user can reconnect manually at any time.

### FIX-02/FIX-03 — Estrutura do código de backoff

- **D-06:** Single shared `ReconnectBackoff` struct in new file `GooseSwift/GooseBLEReconnect.swift`. Parameters: 1 s base delay, doubles each attempt, 60 s cap, 10-attempt circuit breaker. Applied identically to WHOOP and HR monitor reconnection.
- **D-07:** `GooseBLEHRMonitorManager` manages its own backoff state self-contained (holds a `ReconnectBackoff` instance, schedules `DispatchQueue.asyncAfter` delays, calls `connect()` on the `CBCentralManager`). Not delegated to `GooseBLEClient`.
- **D-08:** `GooseBLEClient` (WHOOP reconnect path via `attemptAutomaticReconnect`) also uses the shared `ReconnectBackoff` struct. Existing reconnect logic in `GooseBLEClient+Commands.swift` is refactored to drive state through `ReconnectBackoff`.

### FIX-05 — Retenção de storage

- **D-09:** Compaction is triggered at TWO points: (a) on app launch in `GooseAppModel` init, and (b) after each batch write in `CaptureFrameWriteQueue`. The function is a fast no-op when already below the limit.
- **D-10:** Compaction result is surfaced in `ConnectionView` — record via `ble.record()` with compacted row count and bytes freed (e.g., "Storage compacted: 1 200 rows, 18 MB freed"). Silent when no compaction needed.
- **D-11:** Hard limit is 24 MB (25 165 824 bytes). Compaction voids the `payload_hex` field of the oldest rows (sets to `''`) — rows and metadata are preserved, raw bytes are discarded.

### Claude's Discretion

- **FIX-04 (FFI panic safety):** Change Cargo.toml release profile from `panic = "abort"` to `panic = "unwind"`. Wrap the body of `goose_bridge_handle_json` in `std::panic::catch_unwind(AssertUnwindSafe(|| { ... }))`. On panic, return a structured JSON error: `{"ok": false, "error": {"code": "panic", "message": "..."}}`. No user preference required — implementation is technically prescribed by the upstream PR #19 approach.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — FIX-01 through FIX-05 requirement definitions with acceptance criteria
- `.planning/ROADMAP.md` §Phase 9 — Success criteria (6 numbered items) and phase boundaries

### Rust Core — Storage & Bridge
- `Rust/core/src/store.rs` lines 939–970 — `raw_evidence` and `decoded_frames` table schemas; note `decoded_frames` has NO `device_id` column
- `Rust/core/src/store.rs` lines 1011–1023 — `capture_sessions` schema with `active_device_id TEXT`
- `Rust/core/src/store.rs` lines 1561–1583 — `ble_raw_notifications` schema with `device_id TEXT`
- `Rust/core/src/store.rs` lines 4641–4695 — `compact_raw_evidence_payloads_to_limit` (already implemented, not yet exposed in bridge)
- `Rust/core/src/capture_import.rs` lines 390–405 — `active_device_id: None` is the bug location for FIX-01
- `Rust/core/src/capture_import.rs` lines 637–692 — HR monitor pseudo-frame insertion path
- `Rust/core/src/bridge.rs` lines 2685–2706 — `goose_bridge_handle_json` entry point (FIX-04 target for `catch_unwind`)
- `Rust/core/src/bridge.rs` lines 3019–3073 — `upload_get_recent_decoded_streams_bridge` with CR-02 comment (FIX-01/D-02 target)
- `Rust/core/Cargo.toml` line 161 — `panic = "abort"` in release profile (FIX-04 change target)

### Swift BLE Layer
- `GooseSwift/GooseBLEClient+Commands.swift` lines 693–749 — `attemptAutomaticReconnect()` (WHOOP reconnect, FIX-02 refactor target)
- `GooseSwift/GooseBLEClient+HRMonitor.swift` lines 94–101 — `didDisconnectPeripheral` with zero reconnect logic (FIX-03 implementation target)
- `GooseSwift/GooseBLEClient.swift` lines 8, 23 — `@Published var connectionState` and `@Published var reconnectState`
- `GooseSwift/OvernightSQLiteMirrorQueue.swift` line 95 — correct `device_id` passing pattern (D-01 reference)
- `GooseSwift/GooseAppModel+Upload.swift` lines 36–45 — separate upload calls per device (WHOOP + HR monitor)

### Swift UI Layer
- `GooseSwift/ConnectionView.swift` — target view for reconnect attempt counter, Retry/Stop buttons, and storage compaction result display

### Upstream PRs (reference for FIX-04/FIX-05 scope)
- Upstream PR #18 — BLE reconnect backoff specification (1s base, doubles, 60s cap, 10 attempts)
- Upstream PR #19 — FFI catch_unwind + 24 MB storage retention cap

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `store.compact_raw_evidence_payloads_to_limit(limit_bytes)` — already implemented in Rust, just needs a bridge method exposed and called from Swift
- `ble.record(source:title:body:)` — existing logging/display pattern used throughout; use for compaction result in ConnectionView
- `autoReconnectInFlight: Bool` — existing guard in WHOOP reconnect; `ReconnectBackoff` replaces the ad-hoc flag with structured state
- `OvernightSQLiteMirrorQueue.swift:95` — `"device_id": event.deviceID.uuidString` — correct pattern for D-01 to replicate in capture_import bridge args

### Established Patterns
- Bridge calls: always pass `database_path` explicitly; bridge is stateless
- Multiple `GooseRustBridge` instances: each owner (`GooseAppModel`, `HealthDataStore`, `CaptureFrameWriteQueue`) holds its own — do not create a singleton
- Background threading: bridge calls block the calling thread; never call from `@MainActor`; use existing background queues (`coreBluetoothQueue`, `notificationIngestQueue`, etc.)
- `@Published` state mutations: always on `@MainActor`; background workers dispatch back via `Task { @MainActor in ... }`
- Swift extensions: BLE client logic is split by concern into `+Commands`, `+CentralDelegate`, `+HRMonitor`, etc. New reconnect logic → `GooseBLEClient+Commands.swift` for WHOOP; `GooseBLEClient+HRMonitor.swift` or new `GooseBLEReconnect.swift` for HR monitor

### Integration Points
- `CaptureFrameWriteQueue` → bridge `capture.import_frames` → `capture_import.rs`: D-01 fix propagates Swift's `peripheral.identifier.uuidString` through this path
- `GooseBLEHRMonitorManager.didDisconnectPeripheral` → new `ReconnectBackoff` state machine → `hrManager.centralManager.connect(peripheral)` retry
- `GooseBLEClient.attemptAutomaticReconnect()` → refactored to use `ReconnectBackoff` for timed delays instead of immediate retry
- `GooseAppModel.init` → new bridge call `storage.compact_raw_evidence(limit_bytes: 25_165_824)` on startup
- `CaptureFrameWriteQueue` (after each batch write) → same bridge call for per-write compaction
- `ConnectionView` → reads `@Published` state for attempt count, reconnect state, compaction result

</code_context>

<specifics>
## Specific Ideas

- The `compact_raw_evidence_payloads_to_limit` report struct (`before_bytes`, `after_bytes`, `compacted_rows`, `freed_bytes`) should be logged as a single `ble.record()` line in `ConnectionView` only when `compacted_rows > 0`.
- `ReconnectBackoff` should be a value type (struct), not a class. It holds: `attemptCount: Int`, `baseDelay: TimeInterval = 1.0`, `maxDelay: TimeInterval = 60.0`, `maxAttempts: Int = 10`, and computes `nextDelay() -> TimeInterval` via `min(baseDelay * pow(2.0, Double(attemptCount)), maxDelay)`.
- `reconnectState` string during backoff should include the attempt count: e.g., `"reconnecting (attempt 3/10)"`.

</specifics>

<deferred>
## Deferred Ideas

- JOIN-based device_id filter in upload bridge (multi-device tracking): deferred to a future phase when multiple WHOOP or HR monitors need to coexist. Noted in bridge.rs CR-02 comment.
- Showing compaction status in the main Home tab or as a toast: deferred; ConnectionView is the appropriate surface for now (diagnostic information).

</deferred>

---

*Phase: 9-BLE Stability & Data Integrity*
*Context gathered: 2026-06-04*
