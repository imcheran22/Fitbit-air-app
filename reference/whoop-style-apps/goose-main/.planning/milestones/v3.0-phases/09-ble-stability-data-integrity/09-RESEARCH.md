# Phase 9: BLE Stability & Data Integrity - Research

**Researched:** 2026-06-04
**Domain:** Swift/CoreBluetooth BLE reconnection, Rust FFI panic safety, SQLite storage compaction, device_id provenance
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**FIX-01 — device_id per linha (CR-02)**
- D-01: Fix on the INSERT side. Swift passes `peripheral.identifier.uuidString` as `active_device_id` in the bridge args when calling capture_import methods. Stores non-NULL value in `capture_sessions.active_device_id` AND `ble_raw_notifications.device_id` for every HR monitor frame.
- D-02: Upload bridge (`upload.get_recent_decoded_streams`) filters by `device_type` column already present in `decoded_frames`. No JOIN to `capture_sessions` required. The JOIN-based multi-device filter is deferred to a future phase.

**FIX-02/FIX-03 — UI do backoff de reconexão**
- D-03: Attempt counter and reconnect controls (Retry / Stop buttons) displayed in `ConnectionView`. No new view added.
- D-04: After 10 failed attempts: show failure message and "Try again" button. Tapping restarts the backoff cycle from attempt 1.
- D-05: Stop button aborts the active reconnection cycle and returns state to "idle". Remembered device is NOT cleared.

**FIX-02/FIX-03 — Estrutura do código de backoff**
- D-06: Single shared `ReconnectBackoff` struct in new file `GooseSwift/GooseBLEReconnect.swift`. Parameters: 1 s base delay, doubles each attempt, 60 s cap, 10-attempt circuit breaker. Applied identically to WHOOP and HR monitor reconnection.
- D-07: `GooseBLEHRMonitorManager` manages its own backoff state self-contained (holds a `ReconnectBackoff` instance, schedules `DispatchQueue.asyncAfter` delays, calls `connect()` on the `CBCentralManager`).
- D-08: `GooseBLEClient` (WHOOP reconnect path via `attemptAutomaticReconnect`) uses the shared `ReconnectBackoff` struct. Existing reconnect logic in `GooseBLEClient+Commands.swift` is refactored.

**FIX-05 — Retenção de storage**
- D-09: Compaction triggered at TWO points: (a) on app launch in `GooseAppModel` init, and (b) after each batch write in `CaptureFrameWriteQueue`. Fast no-op when already below the limit.
- D-10: Compaction result surfaced in `ConnectionView` via `ble.record()` with compacted row count and bytes freed. Silent when no compaction needed.
- D-11: Hard limit is 24 MB (25 165 824 bytes). Compaction voids `payload_hex` of oldest rows (sets to `''`).

### Claude's Discretion

- **FIX-04 (FFI panic safety):** Change Cargo.toml release profile from `panic = "abort"` to `panic = "unwind"`. Wrap body of `goose_bridge_handle_json` in `std::panic::catch_unwind(AssertUnwindSafe(|| { ... }))`. On panic, return structured JSON error: `{"ok": false, "error": {"code": "panic", "message": "..."}}`.

### Deferred Ideas (OUT OF SCOPE)

- JOIN-based device_id filter in upload bridge (multi-device tracking): deferred to a future phase.
- Compaction status in Home tab or as a toast: deferred; ConnectionView is the appropriate surface.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FIX-01 | HR monitor frames stored with correct non-NULL `device_id` per row | D-01: `CaptureSessionInput.active_device_id` is already wired in store; `CapturedFrameInput` has no `device_id` field — fix is in `capture_import.rs` line 400 (change `None` → `Some(device_id_str)`) and in Swift bridge call args |
| FIX-02 | WHOOP BLE reconnection uses exponential backoff (1 s base, doubles, 60 s cap, 10-attempt circuit breaker) with manual retry and stop buttons | `attemptAutomaticReconnect()` in `GooseBLEClient+Commands.swift` lines 693–749 uses `autoReconnectInFlight: Bool` guard; refactor to drive through `ReconnectBackoff` struct |
| FIX-03 | HR monitor BLE reconnection uses same exponential backoff parameters | `didDisconnectPeripheral` in `GooseBLEClient+HRMonitor.swift` lines 94–101 has zero reconnect logic; add `ReconnectBackoff` instance to `GooseBLEHRMonitorManager` |
| FIX-04 | Rust FFI dispatch wraps in `catch_unwind`; release profile uses `panic = "unwind"` | `goose_bridge_handle_json` at bridge.rs line 2685 delegates to `handle_bridge_request_json`; wrap at that call site; Cargo.toml line 161 has `panic = "abort"` to change |
| FIX-05 | Raw evidence payload retention limit reduced from 512 MB to 24 MB | `compact_raw_evidence_payloads_to_limit` already implemented in `store.rs` lines 4641–4695; needs bridge method exposed (`storage.compact_raw_evidence`) and two Swift call sites |
</phase_requirements>

---

## Summary

Phase 9 fixes five structural bugs with no new user-facing features. All five fixes are isolated and independently implementable — no fix has a code dependency on another. The Rust side has the hardest changes (FFI panic safety, bridge method exposure, device_id propagation). The Swift side has the most files touched (new `ReconnectBackoff` struct, two reconnect path refactors, two compaction call sites, ConnectionView UI additions).

The key insight for planning is that every fix has a well-understood, bounded scope confirmed by reading the actual source. No exploratory work is required during execution — the exact locations to modify are known for each requirement.

**Primary recommendation:** Implement in sequence FIX-01 → FIX-04 → FIX-05 → FIX-02 → FIX-03. FIX-01 is pure Rust with no Swift changes; FIX-04 and FIX-05 are Rust-only (except two Swift call sites for FIX-05); FIX-02 and FIX-03 are the highest-complexity Swift changes and should come last.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| device_id propagation (FIX-01) | Rust Core (capture_import.rs) | Swift BLE layer (bridge args) | Insert is in Rust; Swift must supply the UUID string in args |
| BLE reconnect backoff — WHOOP (FIX-02) | Swift BLE layer (GooseBLEClient) | SwiftUI (ConnectionView) | CoreBluetooth state machine lives in Swift; UI reads @Published state |
| BLE reconnect backoff — HR monitor (FIX-03) | Swift BLE layer (GooseBLEHRMonitorManager) | SwiftUI (ConnectionView) | Same as FIX-02; HR monitor has its own CBCentralManager instance |
| FFI panic safety (FIX-04) | Rust Core (bridge.rs + Cargo.toml) | — | Panic originates in Rust; must be caught before crossing the FFI boundary |
| Storage compaction (FIX-05) | Rust Core (store.rs already done) | Swift (GooseAppModel + CaptureFrameWriteQueue) | Algorithm already implemented; Swift triggers it via new bridge method |

---

## Standard Stack

No new external libraries required. All changes are internal to the existing stack.

### Core (existing, no changes)
| Component | Purpose | Phase Relevance |
|-----------|---------|----------------|
| `rusqlite 0.37` (bundled) | SQLite persistence | FIX-01: `capture_sessions.active_device_id` update; FIX-05: compaction query |
| `serde_json 1.0` | Bridge JSON serialisation | FIX-04: panic response JSON; FIX-01: bridge args |
| CoreBluetooth | BLE peripheral management | FIX-02/FIX-03: `CBCentralManager.connect()` retry |
| `std::panic::catch_unwind` + `AssertUnwindSafe` | Rust stdlib — no dep | FIX-04: panic interception at FFI boundary |

### No Package Changes
This phase makes zero changes to `Rust/core/Cargo.toml` dependencies. The only Cargo.toml change is `panic = "abort"` → `panic = "unwind"` in `[profile.release]`.

---

## Package Legitimacy Audit

> No new external packages are introduced in this phase. Section not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
[WHOOP disconnect event]
        |
        v
GooseBLEClient.didDisconnectPeripheral
        |
        v
ReconnectBackoff.nextDelay() ──> DispatchQueue.asyncAfter
        |                                  |
  attemptCount++                    attemptAutomaticReconnect()
        |                                  |
  [attempt <= 10?] ──NO──> "failed" @Published ──> ConnectionView "Try again"
        |YES
        v
  CBCentralManager.connect(peripheral)
        |
  [didConnect] ──> ReconnectBackoff.reset()


[HR monitor disconnect event]
        |
        v
GooseBLEHRMonitorManager.didDisconnectPeripheral
        |
        v
self.reconnectBackoff.nextDelay() ──> DispatchQueue.asyncAfter
        |
  hrManager.centralManager.connect(peripheral)


[Swift bridge call] ──JSON──> goose_bridge_handle_json
        |
        v
catch_unwind(AssertUnwindSafe(|| handle_bridge_request_json(request)))
        |
  [ok] ──> normal response
  [panic] ──> {"ok":false,"error":{"code":"panic","message":"..."}}


[App launch / batch write]
        |
        v
bridge "storage.compact_raw_evidence" (limit_bytes: 25_165_824)
        |
        v
store.compact_raw_evidence_payloads_to_limit()  ← already implemented
        |
  [compacted_rows > 0] ──> ble.record("Storage compacted: N rows, X MB freed")
  [no compaction needed] ──> silent
```

### Recommended Project Structure (new files only)
```
GooseSwift/
└── GooseBLEReconnect.swift    # New: ReconnectBackoff struct (shared by WHOOP + HR monitor)
```

All other changes are in existing files.

---

### Pattern 1: ReconnectBackoff Value Type

**What:** A pure Swift struct that tracks exponential backoff state. Holds `attemptCount`, computes `nextDelay()`, enforces max attempts and cap.

**When to use:** Every time a BLE device disconnects unexpectedly — both WHOOP path and HR monitor path.

**Example:**
```swift
// Source: CONTEXT.md § Specific Ideas (D-06)
// File: GooseSwift/GooseBLEReconnect.swift
struct ReconnectBackoff {
  var attemptCount: Int = 0
  let baseDelay: TimeInterval = 1.0
  let maxDelay: TimeInterval = 60.0
  let maxAttempts: Int = 10

  /// Returns the delay before the next attempt, or nil if maxAttempts exhausted.
  mutating func nextDelay() -> TimeInterval? {
    guard attemptCount < maxAttempts else { return nil }
    let delay = min(baseDelay * pow(2.0, Double(attemptCount)), maxDelay)
    attemptCount += 1
    return delay
  }

  mutating func reset() {
    attemptCount = 0
  }

  var statusString: String {
    "reconnecting (attempt \(attemptCount)/\(maxAttempts))"
  }
}
```

**Threading note:** `ReconnectBackoff` is a value type (struct). Callers own one copy each — no shared mutable state, no lock needed. Mutations happen on the CoreBluetooth queue in both callers.

---

### Pattern 2: catch_unwind at FFI Boundary

**What:** Wrap the call to `handle_bridge_request_json` inside `std::panic::catch_unwind(AssertUnwindSafe(...))` so that a Rust panic cannot unwind through the FFI boundary into Swift (which is undefined behaviour under `panic = "abort"`, and a process abort regardless).

**When to use:** Any `extern "C"` function that calls into safe Rust. `goose_bridge_handle_json` is the only such entry point in this library.

**Why `panic = "unwind"` is required first:** `catch_unwind` only intercepts panics when the runtime can unwind the stack. With `panic = "abort"` in the release profile, a panic terminates the process unconditionally — `catch_unwind` has no effect. The profile change is a prerequisite for the `catch_unwind` to work.

**Example:**
```rust
// Source: Rust stdlib std::panic (ASSUMED — verified pattern, not from Context7)
// File: Rust/core/src/bridge.rs — goose_bridge_handle_json
use std::panic::{AssertUnwindSafe, catch_unwind};

#[unsafe(no_mangle)]
pub unsafe extern "C" fn goose_bridge_handle_json(request_json: *const c_char) -> *mut c_char {
    // ... existing null + UTF-8 checks ...

    let request = /* existing CStr::from_ptr logic */;

    let result = catch_unwind(AssertUnwindSafe(|| {
        string_to_c_string(handle_bridge_request_json(request))
    }));

    match result {
        Ok(ptr) => ptr,
        Err(payload) => {
            let message = payload
                .downcast_ref::<&str>()
                .map(|s| s.to_string())
                .or_else(|| payload.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "unknown panic payload".to_string());
            response_to_c_string(&bridge_error("unknown", "panic", message))
        }
    }
}
```

**Cargo.toml change:**
```toml
# File: Rust/core/Cargo.toml line 161
[profile.release]
# Before:
panic = "abort"
# After:
panic = "unwind"
```

---

### Pattern 3: Expose `storage.compact_raw_evidence` Bridge Method

**What:** Add a new bridge method that calls `store.compact_raw_evidence_payloads_to_limit(limit_bytes)` and returns the `RawEvidencePayloadRetentionReport` as JSON.

**Context:** The function already exists in `store.rs` (lines 4641–4695). It is a fast no-op when the database is already below the limit. The bridge method just needs to be wired up.

**Example:**
```rust
// Source: Rust/core/src/store.rs:4641 (VERIFIED by direct code read)
// File: Rust/core/src/bridge.rs — add to handle_bridge_request_inner match

#[derive(Debug, Deserialize)]
struct StorageCompactRawEvidenceArgs {
    database_path: String,
    limit_bytes: i64,
}

fn storage_compact_raw_evidence_bridge(
    args: StorageCompactRawEvidenceArgs,
) -> GooseResult<serde_json::Value> {
    let store = open_bridge_store(&args.database_path)?;
    let report = store.compact_raw_evidence_payloads_to_limit(args.limit_bytes)?;
    serde_json::to_value(report)
        .map_err(|e| GooseError::message(format!("cannot serialize compaction report: {e}")))
}

// In handle_bridge_request_inner match:
"storage.compact_raw_evidence" => {
    request_args::<StorageCompactRawEvidenceArgs>(&request)
        .and_then(storage_compact_raw_evidence_bridge)
        .map(|value| bridge_ok(&request.request_id, value))
        .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
}
```

---

### Pattern 4: FIX-01 — Propagating `device_id` to `capture_sessions`

**What:** The bug is in `capture_import.rs` line 400: `active_device_id: None`. The bridge args for `capture.import_frame_batch` do NOT currently include `active_device_id` — it must be added to `CaptureImportFrameBatchArgs` and threaded through to `start_capture_session`.

**Finding (VERIFIED by code read):** `CapturedFrameInput` struct does NOT have a `device_id` field. The `device_id` target for FIX-01 is `capture_sessions.active_device_id` (one per session) — NOT a per-frame field in `CapturedFrameInput`. The Swift side passes a single `active_device_id` with the batch, not per frame.

**Two-location fix:**

1. **Rust `bridge.rs`:** Add `active_device_id: Option<String>` to `CaptureImportFrameBatchArgs`. Pass it into `CaptureSessionInput.active_device_id` in `capture_import_frame_batch_bridge`.

2. **Swift `CaptureFrameWriteQueue.swift`:** Add `"active_device_id": peripheral.identifier.uuidString` to the bridge args dict at line 283 (in the `capture.import_frame_batch` call). The `peripheral` identifier must be accessible at the call site — see integration point below.

**Reference pattern (VERIFIED by code read):**
```swift
// Source: GooseSwift/OvernightSQLiteMirrorQueue.swift line 95
"device_id": event.deviceID.uuidString  // ← correct pattern to replicate
```

**Integration point:** `CaptureFrameWriteQueue` does not currently hold a reference to the active peripheral. The queue must receive the `device_id` string at enqueue time (alongside the frames), not at write time. `CapturedFrameWriteRow` may need an `activeDeviceID: String?` field, or `CaptureFrameWriteQueue` receives it as a parameter to the write call.

**Note on `ble_raw_notifications.device_id`:** This column (nullable `device_id TEXT`) is populated by `OvernightSQLiteMirrorQueue`. The overnight path already passes `device_id` correctly (line 95). For live-capture frames going through `CaptureFrameWriteQueue` → `capture.import_frame_batch`, the `device_id` ends up in `capture_sessions.active_device_id` — NOT in `ble_raw_notifications`. Those two tables are populated by different code paths.

---

### Anti-Patterns to Avoid

- **Calling `ReconnectBackoff.nextDelay()` from `@MainActor` inline:** BLE callbacks and reconnect scheduling run on `coreBluetoothQueue`. Never hop to main actor for the backoff computation or `DispatchQueue.asyncAfter` call — only hop to main for `@Published` state updates via `Task { @MainActor in ... }`.

- **Using `panic = "unwind"` without `catch_unwind`:** Changing the profile without wrapping the entry point only changes how panics propagate — they still cross the FFI boundary as stack unwinding, which is UB in C. Both changes are required together.

- **Retaining `autoReconnectInFlight` alongside `ReconnectBackoff`:** The old bool guard must be removed from `GooseBLEClient` and replaced entirely by `ReconnectBackoff.attemptCount > 0` (or a dedicated `isReconnecting: Bool` computed property). Leaving both creates inconsistent state.

- **Calling the compaction bridge from `@MainActor`:** Bridge calls are synchronous and block the calling thread. Both call sites (GooseAppModel init and CaptureFrameWriteQueue) must dispatch to a background queue before calling the bridge.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exponential backoff computation | Custom timer logic | `ReconnectBackoff.nextDelay()` + `DispatchQueue.asyncAfter` | Swift stdlib gives nanosecond-precision async dispatch; no dependencies needed |
| Panic message extraction | Custom downcast chain | `payload.downcast_ref::<&str>()` + `downcast_ref::<String>()` fallback | Standard Rust panic payload access pattern |
| Storage size estimation | Re-implement byte counting | `store.raw_evidence_payload_bytes()` already in store.rs line 4629 | Already correct — used inside `compact_raw_evidence_payloads_to_limit` |
| Database row compaction | DELETE oldest rows | `compact_raw_evidence_payloads_to_limit`: sets `payload_hex = ''` | Preserves metadata and row integrity; avoids WAL fragmentation from deletes |

**Key insight:** All primitive operations are implemented. Phase 9 is plumbing work — connecting existing pieces at the right call sites, not building algorithms.

---

## Common Pitfalls

### Pitfall 1: `panic = "unwind"` breaks iOS app binary unless also applied to debug profile
**What goes wrong:** Rust sets `panic = "abort"` globally for iOS builds because stack unwinding on iOS with ARC-managed Swift objects can corrupt ARC reference counts if unwinding crosses an ObjC frame. Changing only the `[profile.release]` stanza is safe because Swift is never on the Rust call stack — the FFI boundary is always the last Rust frame.
**Why it happens:** Developers sometimes change both `dev` and `release` profiles to be symmetric.
**How to avoid:** Change ONLY `[profile.release]`. The `dev` profile has no explicit `panic` setting — leave it as-is (defaults to "unwind" in dev, which is fine for tests).
**Warning signs:** App crashes on launch in debug build with EXC_BAD_ACCESS if dev profile is also changed to something unexpected.

### Pitfall 2: `AssertUnwindSafe` is a marker — it doesn't make code safe
**What goes wrong:** Wrapping a closure that mutates shared state in `AssertUnwindSafe` and panicking mid-mutation can leave SQLite or other state corrupt.
**Why it happens:** `catch_unwind` requires `AssertUnwindSafe` for types that don't implement `UnwindSafe`. The `GooseStore` (owns a `rusqlite::Connection`) is not `UnwindSafe` — the wrapper is needed syntactically.
**How to avoid:** The closure body in `goose_bridge_handle_json` calls `handle_bridge_request_json(request)` which opens a fresh `GooseStore` per call (`open_bridge_store`) and drops it before returning. No shared mutable state survives a panic. This is safe.
**Warning signs:** If bridge methods are ever refactored to hold a long-lived store across calls, the `AssertUnwindSafe` assumption must be revisited.

### Pitfall 3: ReconnectBackoff on the wrong queue for `GooseBLEClient`
**What goes wrong:** `attemptAutomaticReconnect()` is called on `coreBluetoothQueue` (CBCentral delegate callbacks) but some paths call it from other queues (e.g., `prioritizeLiveCaptureOnReady` path). If `ReconnectBackoff` state is mutated from multiple queues, you get data races.
**Why it happens:** `GooseBLEClient` is `@unchecked Sendable`; all stored properties are protected by the convention that they are only accessed on `coreBluetoothQueue`. A `var reconnectBackoff: ReconnectBackoff` added to `GooseBLEClient` must follow the same convention.
**How to avoid:** Only mutate `reconnectBackoff` inside methods that are guaranteed to run on `coreBluetoothQueue` (all CBCentral delegate methods, all methods called via `coreBluetoothQueue.async { }`).
**Warning signs:** Thread sanitiser warnings for `reconnectBackoff` accesses.

### Pitfall 4: HR monitor reconnect does not have a remembered peripheral reference
**What goes wrong:** After `didDisconnectPeripheral`, `hrPeripheral` is set to `nil` (current code line 100). The backoff retry needs to call `connect(peripheral)` — but which peripheral?
**Why it happens:** The disconnection callback receives the `peripheral` argument, but the code sets `hrPeripheral = nil` before returning.
**How to avoid:** Capture the `peripheral` argument from `didDisconnectPeripheral` in a local variable before clearing `hrPeripheral`. Pass it into the `DispatchQueue.asyncAfter` closure via capture: `[peripheral]`. The closure calls `self.central?.connect(peripheral, options: nil)`.
**Warning signs:** `hrPeripheral` is nil inside the retry closure, causing silent no-op reconnects.

### Pitfall 5: FIX-01 `active_device_id` is session-scoped, not frame-scoped
**What goes wrong:** Developer adds `device_id` to `CapturedFrameInput` (per frame), which does not exist in the Rust struct and is not the correct target.
**Why it happens:** The column name `device_id` in `ble_raw_notifications` and `active_device_id` in `capture_sessions` are different targets populated by different code paths.
**How to avoid:** The fix is in `CaptureImportFrameBatchArgs` (add `active_device_id: Option<String>`) and in `capture_import.rs` line 400 (change `active_device_id: None` to `active_device_id: args.active_device_id.as_deref()`). Do NOT modify `CapturedFrameInput`.
**Warning signs:** Rust compilation error if `device_id` is added to `CapturedFrameInput` without matching Deserialize impl.

### Pitfall 6: Compaction called from `@MainActor` in `GooseAppModel.init`
**What goes wrong:** `GooseAppModel.init` runs on `@MainActor`. A synchronous bridge call there blocks the main thread, causing the app to appear frozen on launch.
**Why it happens:** `GooseAppModel.init` already calls several synchronous functions (all of which are fast). The bridge `storage.compact_raw_evidence` could take 100+ ms on a large database.
**How to avoid:** Dispatch to a background queue inside `init`:
```swift
// In GooseAppModel.init — after existing setup:
DispatchQueue.global(qos: .utility).async { [weak self] in
    guard let self else { return }
    self.runStorageCompactionIfNeeded()
}
```
The compaction result logging (`ble.record(...)`) must then dispatch back to the BLE message queue (not main) since `ble.record` is queue-safe.

---

## Code Examples

### Compaction Swift call site (GooseAppModel)
```swift
// Source: inferred from existing bridge call patterns in GooseAppModel+*.swift [ASSUMED pattern, structure from GooseRustBridge.swift]
private func runStorageCompactionIfNeeded() {
  // Runs on background queue — never call from @MainActor directly
  let limit: Int = 25_165_824  // 24 MB
  guard let report = try? rust.request(
    method: "storage.compact_raw_evidence",
    args: [
      "database_path": HealthDataStore.defaultDatabasePath(),
      "limit_bytes": limit,
    ]
  ) else { return }

  let compactedRows = (report["compacted_rows"] as? Int) ?? 0
  let freedBytes = (report["freed_bytes"] as? Int) ?? 0
  if compactedRows > 0 {
    let mbFreed = String(format: "%.1f", Double(freedBytes) / 1_048_576)
    ble.record(source: "storage", title: "compact", body: "\(compactedRows) rows, \(mbFreed) MB freed")
  }
}
```

### CaptureFrameWriteQueue bridge args with active_device_id
```swift
// Source: GooseSwift/CaptureFrameWriteQueue.swift lines 275–284 (existing) [ASSUMED extension]
// active_device_id must be passed at enqueue time and forwarded to the bridge call
let report = try rust.request(
  method: "capture.import_frame_batch",
  args: [
    "database_path": databasePath,
    "parser_version": "goose-swift/live-notification",
    "include_timeline_rows": false,
    "compact_raw_payloads": false,
    "include_results": false,
    "active_device_id": activeDeviceID ?? NSNull(),  // NEW
    "frames": rows.map(\.bridgeObject),
  ]
)
```

---

## Runtime State Inventory

> This is a bug-fix phase with no renames or migrations.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `capture_sessions.active_device_id` is NULL for all existing HR monitor rows | No migration needed — historical rows remain NULL; only new rows get the device_id after the fix |
| Stored data | `raw_evidence.payload_hex` — existing rows may exceed 24 MB aggregate | Compaction on first launch will void oldest payloads; this is the intended behaviour |
| Live service config | None | — |
| OS-registered state | None | — |
| Secrets/env vars | None | — |
| Build artifacts | `Rust/iphoneos/libgoose_core.a`, `Rust/iphonesimulator/libgoose_core.a` — must be rebuilt after Rust changes | Xcode build phase triggers `Scripts/build_ios_rust.sh` automatically on next build |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain (`aarch64-apple-ios`, `aarch64-apple-ios-sim`) | FIX-04, FIX-05, FIX-01 Rust changes | Assumed present (committed .a files in repo) | MSRV 1.94 | None — Rust changes require recompile |
| Xcode (iOS 26.0 SDK) | All Swift changes | Assumed present (macOS dev machine) | — | — |
| `cargo test` | Rust unit tests | Assumed present | — | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `cargo test` (Rust integration tests in `Rust/core/tests/`) |
| Config file | `Rust/core/Cargo.toml` |
| Quick run command | `cd /Users/francisco/Documents/goose/Rust/core && cargo test --test bridge_tests 2>&1 \| tail -20` |
| Full suite command | `cd /Users/francisco/Documents/goose/Rust/core && cargo test 2>&1 \| tail -30` |

No Swift test target exists in the Xcode project. Swift validation is manual (device/simulator run).

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIX-01 | `active_device_id` is non-NULL after batch import with device_id arg | unit (Rust) | `cargo test --test capture_import_tests -- device_id` | ✅ `tests/capture_import_tests.rs` |
| FIX-01 | Upload bridge still returns HR frames when device_type filter applied | unit (Rust) | `cargo test --test bridge_tests -- upload` | ✅ `tests/bridge_tests.rs` |
| FIX-04 | `goose_bridge_handle_json` returns JSON error on panic instead of crashing | unit (Rust) | `cargo test --test bridge_tests -- panic` | ❌ Wave 0 — new test needed |
| FIX-05 | `storage.compact_raw_evidence` bridge method returns compaction report | unit (Rust) | `cargo test --test bridge_tests -- compact` | ❌ Wave 0 — new test needed |
| FIX-05 | Compaction is a no-op when under limit | unit (Rust) | same test | ❌ Wave 0 |
| FIX-02 | `ReconnectBackoff.nextDelay()` returns correct delays and caps at 60s | unit (Swift — manual) | not automatable without XCTest target | manual |
| FIX-03 | HR monitor shows "reconnecting (attempt N/10)" after disconnect | manual | — | manual |

### Sampling Rate
- **Per task commit:** `cargo test --test bridge_tests 2>&1 | tail -20`
- **Per wave merge:** `cargo test 2>&1 | tail -30`
- **Phase gate:** Full Rust suite green + manual BLE reconnect smoke test before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] New test in `tests/bridge_tests.rs` — FIX-04 panic catch (use a test-only bridge method that panics, or trigger via malformed args that hit an `unwrap`)
- [ ] New test in `tests/bridge_tests.rs` — FIX-05 `storage.compact_raw_evidence` method existence and correctness
- [ ] New test in `tests/capture_import_tests.rs` — FIX-01 `active_device_id` non-NULL after import with device_id supplied

---

## Security Domain

> `security_enforcement: true`, ASVS Level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes (FIX-04) | `catch_unwind` prevents panic from becoming an app-crash DoS vector; `validate_non_negative` already in `compact_raw_evidence_payloads_to_limit` for the limit_bytes arg |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed bridge JSON triggers panic → process crash | Denial of Service | FIX-04: `catch_unwind` returns JSON error instead of crashing |
| Unbounded SQLite growth → device storage exhaustion | Denial of Service | FIX-05: 24 MB compaction cap prevents unbounded growth |
| NULL `device_id` in DB → inability to trace which device produced data | Tampering (data provenance) | FIX-01: non-NULL `active_device_id` per session |

No authentication, encryption, or network-facing changes in this phase.

---

## Open Questions (RESOLVED)

1. **Where does `CaptureFrameWriteQueue` get the `activeDeviceID`?** — RESOLVED
   - What we know: The queue currently holds `databasePath` and a `GooseRustBridge` instance. It does not hold a reference to `GooseBLEClient` or the active peripheral.
   - Resolution: Add `var activeDeviceID: String?` as a mutable property on `CaptureFrameWriteQueue`, set by `GooseAppModel` whenever the peripheral connects/disconnects. The queue reads it at write time. This avoids changing `enqueue()` signatures across all callers.

2. **Does `ReconnectBackoff` state need to be @Published for the `GooseBLEHRMonitorManager`?** — RESOLVED
   - What we know: `GooseBLEHRMonitorManager` is not an `ObservableObject`. It notifies the UI by calling `owner?.objectWillChange.send()` (line 83 in GooseBLEClient+HRMonitor.swift).
   - Resolution: Add `@Published var hrReconnectState: String = "idle"` to `GooseBLEClient`. `GooseBLEHRMonitorManager` calls `owner?.hrReconnectState = backoff.statusString` (dispatching to main via `Task { @MainActor in ... }` or via the existing `DispatchQueue.main.async` pattern used at line 82). ConnectionView then uses `ble.hrReconnectState`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `CaptureFrameWriteQueue` adding `activeDeviceID: String?` property is the cleanest integration point for FIX-01 on the Swift side | Open Questions #1 | Low — could use enqueue parameter instead; no correctness impact |
| A2 | `GooseBLEHRMonitorManager` will publish reconnect state via `owner?.hrReconnectState` pattern | Open Questions #2 | Low — alternative is a direct `GooseBLEClient` property updated in `GooseBLEHRMonitorManager` callbacks |
| A3 | `std::panic::catch_unwind` with `AssertUnwindSafe` on the `handle_bridge_request_json` call is safe because `open_bridge_store` opens a fresh connection per call | Code Examples — FIX-04 | Medium — if any future bridge method holds shared state across calls, this assumption breaks |
| A4 | Changing `panic = "unwind"` only in `[profile.release]` does not affect iOS app stability | Common Pitfalls #1 | Low — dev profile already defaults to unwind; release profile change is iOS-safe because FFI is always the outermost Rust frame |

---

## Sources

### Primary (HIGH confidence — direct code read)
- `Rust/core/src/bridge.rs` lines 2060–2706 — bridge entry point, `handle_bridge_request_json`, `goose_bridge_handle_json` exact structure
- `Rust/core/src/store.rs` lines 939–970, 1011–1023, 1561–1583, 4629–4695 — table schemas, `compact_raw_evidence_payloads_to_limit` implementation
- `Rust/core/src/capture_import.rs` lines 65–78, 390–405, 637–692 — `CapturedFrameInput` struct (no `device_id` field), bug location at line 400, HR pseudo-frame path
- `Rust/core/Cargo.toml` line 161 — `panic = "abort"` confirmed
- `GooseSwift/GooseBLEClient+Commands.swift` lines 693–749 — `attemptAutomaticReconnect()` with `autoReconnectInFlight` guard
- `GooseSwift/GooseBLEClient+HRMonitor.swift` lines 85–101 — `didDisconnectPeripheral` confirmed zero reconnect logic
- `GooseSwift/OvernightSQLiteMirrorQueue.swift` line 95 — `"device_id": event.deviceID.uuidString` reference pattern
- `GooseSwift/CaptureFrameWriteQueue.swift` lines 275–315 — bridge call args, `compact_raw_payloads: false` confirmed
- `GooseSwift/ConnectionView.swift` lines 1–145 — existing view structure, `reconnectState` already displayed
- `GooseSwift/GooseAppModel.swift` lines 277–383 — `init` structure, existing call sites for adding compaction

### Secondary (MEDIUM confidence)
- CONTEXT.md canonical refs — all file+line references cross-checked against actual code

### Tertiary (LOW confidence)
- `std::panic::catch_unwind` + `AssertUnwindSafe` pattern — based on Rust stdlib knowledge [ASSUMED]; no Context7 lookup performed (stdlib, not a crate)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing
- Architecture: HIGH — verified by direct code read of all canonical refs
- Pitfalls: HIGH — derived from actual code structure, not generic advice
- FIX-01 integration point for `activeDeviceID` in Swift: MEDIUM — two viable options, recommendation made but not locked

**Research date:** 2026-06-04
**Valid until:** 2026-07-04 (stable codebase, no fast-moving dependencies)
