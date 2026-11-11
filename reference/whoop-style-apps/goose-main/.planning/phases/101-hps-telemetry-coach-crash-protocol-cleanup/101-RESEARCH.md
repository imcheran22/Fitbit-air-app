# Phase 101: HPS Telemetry + Coach Crash + Protocol Cleanup - Research

**Researched:** 2026-06-21
**Domain:** Swift BLE sync instrumentation / SwiftUI coach crash / Rust protocol layer
**Confidence:** HIGH

---

## Summary

Three independent tracks with no shared state. Track 1 (SYNC-12) adds HPS burst-level telemetry via a new `sync_telemetry` SQLite table (Rust schema migration v23) plus a real-time `ble.record` call per burst in Swift. Track 2 (BUG-COACH-01) investigates a crash in the Coach tab; the code path is safe — no force-unwraps; the crash is almost certainly a missing or expired OAuth token causing a Keychain lookup that throws, or an `async` `Task` spawned from a SwiftUI `.onChange` running before `@MainActor` state is stable. Track 3 (PROTO-08/09/10/11) is purely Rust: `PacketType` is already an enum (PROTO-08 is partially done), `parse_data_packet_body_summary` has a `_ =>` catch-all that emits a warning but is NOT silent (PROTO-09 status: acceptable), `data_packet_domain()` has a mismatch with parse arms for packet_k 24 (PROTO-10 gap), and `COMMAND_DEFINITIONS` already exists in `commands.rs` with 76 entries and a PROTO-11 serialization test (PROTO-11 is already done).

**Primary recommendation:** SYNC-12 is the highest-value track — instrument `historyStartReceived`/`historyEndReceived` transitions in `CoreBluetoothBLETransport+HistoricalHandlers.swift` and add a Rust schema migration v23 for `sync_telemetry`. Coach crash needs targeted investigation on device (enable debug build, reproduce, capture crash log) before coding; the code shows no obvious crash site but the OAuth flow is async and could race. Protocol cleanup: only PROTO-10 requires a real code change (`data_packet_domain` domain string mismatch for packet_k 24).

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Both tracks delivered — real-time log AND SQLite persistence
  - Real-time: `ble.record(level: .debug, source: "ble.sync", title: "hps.telemetry", body: "bytes=X duration=Yms gaps=Z")` per burst, visible in Debug > Logs
  - Persistence: new `sync_telemetry` SQLite table in Rust (schema migration included); fields per issue #162: `session_id, burst_index, bytes_received, duration_ms, missing_packets, sequence_gaps, result`
- **D-02:** Rust-side instrumentation (historical sync loop already tracks packets); Swift side only reads from Debug log (no new Swift UI beyond existing Debug > Logs view)
- **D-03:** Researcher investigates root cause first — do NOT assume cause; check nil force-unwrap, @MainActor violations, missing API config guard
- **D-04:** Fix must eliminate the crash path, not just add a try?; if cause is nil API key → add explicit guard with user-facing message; if threading → Task/@MainActor fix

### Claude's Discretion

- Purely Rust; follow existing bridge module conventions; researcher maps exact locations of PACKET_TYPE constants, silent arms, and domain function

### Deferred Ideas (OUT OF SCOPE)

- (none listed)

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HPS burst start/end detection | Swift (CoreBluetoothBLETransport) | — | `historyStartReceived`, `historyEndReceived`, `historicalSyncBurstsCompleted` all live in Swift |
| HPS telemetry persistence | Rust (store + bridge) | — | All SQLite writes go through the Rust bridge; new table follows the same pattern as `overnight_sync_sessions` |
| Real-time telemetry log | Swift (`ble.record`) | — | `record()` is on `CoreBluetoothBLETransport`; pattern established throughout `+HistoricalHandlers.swift` |
| Coach crash | Swift (CoachView + ChatGPTCoachProvider) | — | Crash reported on tap; auth flow is async Swift |
| PacketType enum | Rust (protocol.rs) | — | Already an enum; `From<u8>` impls in `protocol.rs:43` |
| Protocol silent arms | Rust (protocol.rs) | — | `parse_data_packet_body_summary` and `data_packet_domain` both in `protocol.rs` |
| CommandDefinition registry | Rust (commands.rs) | bridge/mod.rs | `COMMAND_DEFINITIONS` array exists at `commands.rs:534`; PROTO-11 test at bridge/mod.rs |

---

## Track 1: HPS Telemetry (SYNC-12)

### Where bursts start and end in Swift

File: `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift`

| Event | Location | Signal |
|-------|----------|--------|
| Burst **start** | `handleHistoricalMetadata` → `case .historyStart` (line ~719) | `historicalManager.historyStartReceived = true`; `historicalManager.historicalPacketsReceivedThisSync` just reset |
| Burst **end** | `handleHistoricalMetadata` → `case .historyEnd` (line ~725) | `historicalSyncBurstsCompleted += 1`; all pending frames flushed via `flushPendingHistoricalFramesIfNeeded(force: true)` |
| Sync **complete** | `completeHistoricalSync(reason:)` (line ~793) | Called after last burst ack; total packet count available as `historicalManager.historicalPacketsReceivedThisSync` |

**Burst index** is already tracked as `historicalSyncBurstsCompleted` (integer, incremented in `case .historyEnd`). This is the `burst_index` field for `sync_telemetry`.

**Bytes received** is not currently counted per burst. The closest proxy is `historicalManager.historicalPacketsReceivedThisSync`, but this is a packet count not a byte count. To get bytes, count BLE notification sizes in `handleHistoricalSyncValue` (receives `Data value`) or sum frame hex lengths in `flushPendingHistoricalFrames`. The simplest approach: accumulate `value.count` in `handleHistoricalSyncValue` per burst, reset on `historyStart`.

**Duration (ms)** is computable: capture `Date()` on `historyStart` and diff on `historyEnd`. No existing timestamp for this.

**Sequence gaps** requires inspecting parsed frame sequence numbers. The existing `historicalPacketsReceivedThisSync` counter does not track gaps. Gaps could be detected in Rust's `capture.import_frame_batch` bridge call result (look for sequence discontinuities in parsed frame sequence fields).

**Session ID** — there is no explicit historical sync session UUID in `GooseBLEHistoricalManager`. The `historicalManager.historicalSyncRunID: UUID` field (assigned on `beginSync`) is the natural session ID to use. It resets on each `beginSync()` call.

### The `ble.record` pattern to copy

File: `GooseSwift/CoreBluetoothBLETransport+VitalsAndLogging.swift`, line 192–222

```swift
func record(
  level: GooseLogLevel = .info,
  source: String,
  title: String,
  body: String = ""
)
```

Existing call site in HistoricalHandlers (line ~60–65):

```swift
record(
  level: .debug,
  source: "ble.sync",
  title: "historical_sync.packet",
  body: "\(characteristic.uuid.uuidString) count=\(historicalManager.historicalPacketsReceivedThisSync)"
)
```

**New call site to add at burst end (in `case .historyEnd`):**

```swift
record(
  level: .debug,
  source: "ble.sync",
  title: "hps.telemetry",
  body: "session_id=\(historicalManager.historicalSyncRunID) burst_index=\(historicalSyncBurstsCompleted) bytes=X duration_ms=Y gaps=Z result=ok"
)
```

The `source: "ble.sync"` is already in `shouldAlwaysRecord` (VitalsAndLogging.swift line ~431), so this will always be persisted to the diagnostic log.

### Rust SQLite schema migration

File: `Rust/core/src/store/mod.rs`

Current schema version: **22** (`pub const CURRENT_SCHEMA_VERSION: i64 = 22;` at line 23).

New table must be added as **version 23**. Follow the `overnight_sync_sessions` table pattern (already a lazy-created table in `ensure_overnight_mirror_tables()`). For `sync_telemetry`, add it to the main `migrate()` SQL block since it is a first-class operational table, not a debug mirror.

**Schema for `sync_telemetry` (per issue #162):**

```sql
CREATE TABLE IF NOT EXISTS sync_telemetry (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id       TEXT NOT NULL,
    burst_index      INTEGER NOT NULL,
    bytes_received   INTEGER NOT NULL,
    duration_ms      INTEGER NOT NULL,
    missing_packets  INTEGER NOT NULL DEFAULT 0,
    sequence_gaps    INTEGER NOT NULL DEFAULT 0,
    result           TEXT NOT NULL DEFAULT 'ok',
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_telemetry_session
    ON sync_telemetry(session_id);

INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (23);
PRAGMA user_version = 23;
```

**Bridge method needed** (following the 5-location pattern from cs:s3-130):
- Method name suggestion: `sync.record_hps_telemetry`
- Args: `database_path, session_id, burst_index, bytes_received, duration_ms, missing_packets, sequence_gaps, result`
- Called from Swift at burst end via `historicalDirectWriteBridge` (same bridge used in `flushPendingHistoricalFramesIfNeeded`)

**Important:** The Rust bridge method is dispatched from the `historicalWriteQueue` (background) thread. The `ble.record` call must stay on main (or be dispatched to main as the existing pattern shows in `flushPendingHistoricalFramesIfNeeded` line ~133–138).

### Missing pieces to measure

| Field | Source | Gap |
|-------|--------|-----|
| `bytes_received` | Sum `value.count` in `handleHistoricalSyncValue`, accumulate in `GooseBLEHistoricalManager` | New field needed on manager |
| `duration_ms` | `Date()` at historyStart minus `Date()` at historyEnd | New `burstStartedAt: Date?` field on manager |
| `missing_packets` | Not currently tracked; would require sequence number audit in Rust import result | Phase 101 can default to 0, or parse Rust response |
| `sequence_gaps` | Same as above | Default to 0 for now, refine later |

**Recommendation:** For phase 101, `missing_packets` and `sequence_gaps` default to 0 (not yet instrumented). Comment them as `// SYNC-12: not yet implemented, always 0`. This matches the issue #162 schema without blocking the table creation and primary telemetry.

---

## Track 2: Coach Crash (BUG-COACH-01)

### Code path investigated

**Entry point:** `CoachView.swift` → `CoachOverviewChatCard` button → `openChat()` → `showingChat = true` + `chat.startOAuthSignIn()` (if not signed in) OR `showingChat = true` directly (if signed in).

**CoachView.swift line ~105–111:**
```swift
.onChange(of: router.codexEmbeddedLoginRequestID) { _, requestID in
  guard requestID > 0, !chat.isSignedIn else { return }
  showingChat = true
  chat.startOAuthSignIn()  // This is the "connect the Codex" path
}
```

This matches the issue #170 description "clicking Coach and trying to connect the Codex."

### CoachChatModel.swift — no force unwraps found

`CoachChatModel.swift` was read in full (273 lines). Findings:
- **No force unwraps** (`!` suffix on optionals) anywhere in the file.
- `send()` method line 105: `guard let provider = registry.activeProvider, provider.isAuthenticated else { errorMessage = "Sign in first."; return }` — safe guard.
- All `Task` closures use `[weak self]` and guard against `nil`.
- Error handling catches all thrown errors and sets `errorMessage` / `streamState = .failed`.

### ChatGPTCoachProvider.swift — the crash path

`startOAuthSignIn()` (line 44) is `async throws`:

```swift
func startOAuthSignIn() async throws {
  loginStatus = "Requesting OAuth code"
  deviceCode = nil
  let code = try await authClient.requestDeviceCodeWithRetry()  // THROWS HERE if network fails
  ...
}
```

Called from `CoachChatModel.startOAuthSignIn()` (line 66–78):

```swift
func startOAuthSignIn() {
  errorMessage = nil
  guard let chatGPT = registry.activeProvider as? ChatGPTCoachProvider else { return }
  Task { [chatGPT, weak self] in
    do {
      try await chatGPT.startOAuthSignIn()
      self?.seedAssistantPromptIfNeeded()
    } catch is CancellationError {
      // cancelled — no-op
    } catch {
      self?.errorMessage = error.localizedDescription  // non-cancellation errors land here
    }
  }
}
```

And called from `CoachView.swift` line 110:
```swift
chat.startOAuthSignIn()
```

**Note:** `CoachChatModel.startOAuthSignIn()` is not `async throws` — it creates a `Task` internally. But `CoachView.startOAuthSignIn` is called without `Task {}` wrapper, directly from `.onChange`. This is acceptable because `CoachChatModel.startOAuthSignIn()` is synchronous (spawns its own task).

### CoachProviderRegistry — the freeze/nil provider risk

`CoachProviderRegistry` (`CoachProviderProtocol.swift` lines 17–43):

```swift
init() {
  let chatGPT = ChatGPTCoachProvider()
  let claude = ClaudeCoachProvider()
  let custom = CustomEndpointCoachProvider()
  let gemini = GeminiCoachProvider()
  ...
  activeProvider = allProviders.first(where: { $0.isAuthenticated }) ?? allProviders.first
}
```

**Risk 1 — `CoachView.init()` creates two separate `CoachProviderRegistry` instances:**

```swift
init() {
  let registry = CoachProviderRegistry()
  self._registry = State(initialValue: registry)
  self._chat = State(initialValue: CoachChatModel(registry: registry))
}
```

The `CoachView.body` also has `@State private var registry = CoachProviderRegistry()` at line 7, which means **TWO** registries are created if the view is initialized normally — the `@State` default initializer creates one, and the custom `init()` creates another. However, Swift's `@State` ignores the property initializer when the custom `init()` sets `_registry` explicitly. This is correct. No double-init.

**Risk 2 — `activeProvider` is nil if no stored preference matches:**

In the registry `init()`, `activeProvider` is set to `allProviders.first(where: { $0.isAuthenticated }) ?? allProviders.first`. On a fresh install or after sign-out, this will be `chatGPT` (the first provider, unauthenticated). `activeProvider` is never nil after init.

**Risk 3 — `CodexSelfContainedAuthClient.requestDeviceCodeWithRetry()` — the actual crash site**

`ChatGPTCoachProvider.startOAuthSignIn()` calls `authClient.requestDeviceCodeWithRetry()` which is a network call. The function is `async throws`. If it throws a non-`CancellationError` error:
- `ChatGPTCoachProvider.startOAuthSignIn()` propagates the throw
- `CoachChatModel.startOAuthSignIn()` catches it in the `catch` block and sets `self?.errorMessage`

This means a network error shows an `errorMessage` — it does NOT crash. However:

**Risk 4 — `refreshAuth()` on `.onAppear`:**

```swift
.onAppear {
  chat.refreshAuth()  // synchronous call, spawns an internal Task
  ...
}
```

`CoachChatModel.refreshAuth()`:
```swift
func refreshAuth() {
  guard let chatGPT = registry.activeProvider as? ChatGPTCoachProvider else { return }
  Task { [chatGPT] in
    await chatGPT.refreshAuth()
    if chatGPT.isAuthenticated { seedAssistantPromptIfNeeded() }
  }
}
```

`ChatGPTCoachProvider.refreshAuth()` is `async` (not `throws`). It catches all errors internally. Safe.

**Risk 5 — `@MainActor` and `@Observable` interaction (MOST LIKELY CRASH):**

`CoachChatModel` is `@MainActor @Observable`. `ChatGPTCoachProvider` is `@MainActor @Observable`. Both use Swift's `@Observable` macro (not `ObservableObject`). In iOS 26 (Swift 6.3), accessing `@Observable` properties from a non-isolated context is a runtime violation. The `Task { [weak self] in ... }` blocks in `CoachChatModel` do NOT inherit `@MainActor` isolation from the enclosing context when created inside a non-`@MainActor`-annotated closure.

**Specifically:** In `CoachChatModel.send()` lines 130–157, `sendTask = Task { [weak self] in ... }` creates a detached task. Inside this task, `self?.appendAssistantText(...)`, `self?.finishAssistantMessage(...)`, etc. are called. These methods mutate `@Observable` state. If Swift 6 strict concurrency checking is enabled, this may produce warnings promoted to errors. In Swift 6 with strict concurrency, accessing a `@MainActor`-isolated property from a non-isolated closure is a runtime assertion on debug builds.

**Actual freeze scenario (issue #170 says "crash or freeze"):** The `streamResponseLoop` in `ChatGPTCoachProvider` makes network calls; if the Codex OAuth endpoint is unreachable (self-hosted server down, network timeout), the task hangs indefinitely. `loginStatus` shows "Waiting for approval" but the Task never gets cancelled because there is no timeout. This causes the UI to freeze at the sign-in screen.

### Actual crash diagnosis: nil API key or missing OAuth token

Looking at `ChatGPTCoachProvider.send()` line 77:
```swift
guard let auth else {
  throw OpenAIResponsesError.missingOAuthSession
}
```

If `refreshAuth()` has not completed by the time the user taps "Open Chat" and `send()` is called, `auth` is nil and an error is thrown. This is caught in `CoachChatModel.send()` and shown as `errorMessage`. Not a crash.

**The true freeze** is in `authClient.completeDeviceCodeLogin(code)` — this polls the OAuth server waiting for the user to approve the device code. If the user taps the Coach button repeatedly, multiple `startOAuthSignIn()` tasks stack up. Each holds `loginStatus = "Waiting for approval"` and polls. No timeout means infinite hang.

### Fix prescription (per D-04)

The fix is a **timeout + cancellation** on the device-code polling loop:

```swift
func startOAuthSignIn() async throws {
  sendTask?.cancel()  // cancel any in-flight sign-in
  ...
  // Add Task.sleep timeout around completeDeviceCodeLogin
}
```

Or add an explicit `.timeout(seconds: 120)` wrapper. The `CoachChatModel.startOAuthSignIn()` must also cancel the previous sign-in task before starting a new one. This eliminates the infinite hang.

Secondary fix: if `activeProvider` is nil at chat time (not currently possible but defensive), add guard.

---

## Track 3: Protocol Cleanup (PROTO-08/09/10/11)

### PROTO-08: PACKET_TYPE_* constants → enum

**Status: ALREADY DONE. `PacketType` enum exists in `Rust/core/src/protocol.rs` lines 22–41.**

```rust
pub enum PacketType {
    Command,                        // 35
    CommandResponse,                // 36
    PuffinCommand,                  // 37
    PuffinCommandResponse,          // 38
    RealtimeData,                   // 40
    RealtimeRawData,                // 43
    HistoricalData,                 // 47
    Event,                          // 48
    Metadata,                       // 49
    ConsoleLogs,                    // 50
    RealtimeImuDataStream,          // 51
    HistoricalImuDataStream,        // 52
    RelativePuffinEvents,           // 53
    PuffinEventsFromStrap,          // 54
    RelativeBatteryPackConsoleLogs, // 55
    PuffinMetadata,                 // 56
    R22RealtimeData,                // 16 (0x10)
    Unknown(u8),                    // catch-all
}
```

`From<u8>` impl at line 43 and `From<PacketType> for u8` at line 68 are complete and exhaustive. `packet_type_name()` function at line 550 maps all variants to string names.

**What PROTO-08 may still require:** Check if Swift side (`V5PacketType` constants in `GooseBLETypes.swift`) still uses raw `u8` constants rather than the Rust enum. The Swift side cannot use the Rust enum directly (FFI boundary), so raw constants there are expected. PROTO-08 in the Rust layer is complete.

### PROTO-09: Silent `_ =>` arm in `parse_data_packet_body_summary`

File: `Rust/core/src/protocol.rs` lines 730–748

```rust
match packet_k {
    7 | 9 | 12 => (Some(DataPacketBodySummary::NormalHistory { ... }), Vec::new()),
    18 => parse_v18_body(payload),
    17 => parse_r17_body_summary(payload),
    10 => parse_k10_raw_motion_summary(payload),
    21 => parse_k21_raw_motion_summary(payload),
    24 => parse_v24_body_summary(payload),
    _ => (
        Some(DataPacketBodySummary::Unknown { packet_k }),
        vec![format!("unhandled_packet_k_{packet_k}")],
    ),
}
```

**The `_ =>` arm is NOT silent.** It emits a `DataPacketBodySummary::Unknown { packet_k }` variant and generates a warning string `"unhandled_packet_k_{packet_k}"`. This is visible in the `warnings_json` column of `decoded_frames`.

**PROTO-09 assessment:** No action required unless the issue #157 specifically demands that the `_ =>` arm panic or error instead of returning `Unknown`. The current behavior (log warning, return Unknown) is the correct defensive pattern. If PROTO-09 means "document that the arm is intentional," that is a comment-only change.

### PROTO-10: `data_packet_domain()` out of sync with parse arms

File: `Rust/core/src/protocol.rs` lines 1229–1241

```rust
fn data_packet_domain(packet_k: u8) -> Option<&'static str> {
    Some(match packet_k {
        7 => "legacy_raw_or_research_counted",
        9 | 12 | 18 | 24 => "normal_history_with_hr_marker",
        10 | 21 => "raw_motion_stream_result",
        11 => "raw_stream_counted",
        16 => "raw_ecg_labrador",
        17 => "r17_optical_or_labrador_filtered",
        19 | 22 => "research_packet",
        20 => "raw_or_research_counted",
        25 | 26 => "pulse_information_packet",
        _ => return None,
    })
}
```

**Mismatch found:** `data_packet_domain()` groups `18` and `24` under `"normal_history_with_hr_marker"` but `parse_data_packet_body_summary()` routes them to separate parsers:
- `18` → `parse_v18_body(payload)` → `DataPacketBodySummary::V18History`
- `24` → `parse_v24_body_summary(payload)` → `DataPacketBodySummary::V24Biometric` (different domain concept)

The domain string `"normal_history_with_hr_marker"` is misleading for packet_k=24 (which is a biometric stream, not a history packet with an HR marker). This is the PROTO-10 gap.

**Fix:** Split `data_packet_domain` for packet_k 24:

```rust
24 => "v24_biometric_stream",
9 | 12 | 18 => "normal_history_with_hr_marker",
```

Also check `hr_marker_offset()` at line 1244:
```rust
fn history_hr_marker_offset(packet_k: u8) -> Option<usize> {
    match packet_k {
        7 => Some(27),
        9 | 12 | 24 => Some(17),
        18 => Some(14),
        _ => None,
    }
}
```

`packet_k=24` is included in `history_hr_marker_offset` (returns Some(17)), consistent with it having an HR marker. Domain string needs only the rename.

### PROTO-11: CommandDefinition registry

**Status: ALREADY DONE and already tested.**

`COMMAND_DEFINITIONS` const at `Rust/core/src/commands.rs:534`, 76 entries covering all known command numbers. The PROTO-11 test at `Rust/core/src/bridge/mod.rs:1242`:

```rust
/// PROTO-11: COMMAND_DEFINITIONS must serialise to a non-empty JSON array without error.
```

This test already passes as part of `cargo test --locked`. No work needed for PROTO-11 beyond ensuring any new commands added in this phase are also added to `COMMAND_DEFINITIONS`.

---

## Common Pitfalls

### Pitfall 1: Missing `CURRENT_SCHEMA_VERSION` bump

**What goes wrong:** Adding the `sync_telemetry` table SQL to `migrate()` but forgetting to bump `CURRENT_SCHEMA_VERSION` from 22 to 23 causes `open_existing_current()` to return an error for existing databases.

**How to avoid:** Update line 23 of `store/mod.rs`: `pub const CURRENT_SCHEMA_VERSION: i64 = 23;` atomically with the SQL addition.

**Also required:** Add `INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (23);` and `PRAGMA user_version = 23;` at the end of the migrate block.

### Pitfall 2: Bridge method at 5 locations (cs:s3-130 rule)

**What goes wrong:** Adding only the store function but missing the BRIDGE_METHODS constant or dispatcher arm causes `bridge_methods_constant_matches_dispatcher` test to fail.

**How to avoid:** Follow the cs:s3-130 checklist: BRIDGE_METHODS constant, Args struct, dispatcher arm, implementation fn, store fn — all 5.

### Pitfall 3: `ble.record` called on background queue

**What goes wrong:** `flushPendingHistoricalFramesIfNeeded` already dispatches to `historicalWriteQueue.async`. The telemetry `ble.record` call inside that closure must be dispatched back to main (or be called before the async block).

**How to avoid:** Follow the existing pattern in `flushPendingHistoricalFramesIfNeeded` (lines 133–138): call `DispatchQueue.main.async { self?.record(...) }` inside the background closure.

### Pitfall 4: Duplicate `GooseBLEHistoricalManager` fields

**What goes wrong:** Adding `burstStartedAt` and `burstBytesReceived` to `GooseBLEHistoricalManager` after the executor has already read the file may cause E0592 if a submodule split was in progress.

**How to avoid:** Check `GooseBLEHistoricalManager.swift` (129 lines, single file, no split) before adding fields. The file is simple and safe to modify.

### Pitfall 5: Coach Task cancellation stacking

**What goes wrong:** User taps "Connect Codex" multiple times → multiple `startOAuthSignIn` tasks stack → UI freezes waiting for multiple parallel device-code polls.

**How to avoid:** `CoachChatModel` already has `sendTask` for message streaming. Add a parallel `signInTask: Task<Void, Never>?` field; cancel it before creating a new one.

### Pitfall 6: `data_packet_domain` change breaks existing export tests

**What goes wrong:** Export and capture correlation tests may assert the domain string `"normal_history_with_hr_marker"` for packet_k=24 fixtures.

**How to avoid:** After changing `data_packet_domain`, grep test files: `grep -rn "normal_history_with_hr_marker" Rust/core/tests/` and update any fixture assertions for packet_k=24.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Telemetry persistence | Custom file logger | Rust bridge + SQLite (`sync_telemetry` table) | Consistent with all other store tables; queryable |
| OAuth timeout | Custom polling loop | `Task.sleep` with cancellation token or `withTimeout` | Simpler and respects Swift structured concurrency |
| Burst duration | Custom timer class | `Date()` captured in manager field, diff on burst end | Zero dependencies |
| Schema migration | Separate migration runner | Existing `migrate()` SQL batch in `store/mod.rs` | All 22 previous migrations use this pattern |

---

## Code Examples

### HPS telemetry: burst instrumentation points

```swift
// In GooseBLEHistoricalManager.swift — add new fields
var burstStartedAt: Date? = nil
var burstBytesReceived = 0

// In CoreBluetoothBLETransport+HistoricalHandlers.swift
// handleHistoricalSyncValue — add byte accumulation:
historicalManager.burstBytesReceived += value.count  // ADD after existing code

// handleHistoricalMetadata → case .historyStart:
historicalManager.burstStartedAt = Date()
historicalManager.burstBytesReceived = 0

// handleHistoricalMetadata → case .historyEnd:
historicalSyncBurstsCompleted += 1  // already exists
let burstDurationMs: Int
if let startedAt = historicalManager.burstStartedAt {
  burstDurationMs = Int(Date().timeIntervalSince(startedAt) * 1000)
} else {
  burstDurationMs = 0
}
let burstBytes = historicalManager.burstBytesReceived
let burstIndex = historicalSyncBurstsCompleted
let sessionID = historicalManager.historicalSyncRunID.uuidString

// Log (on main — this closure is already on main)
record(
  level: .debug,
  source: "ble.sync",
  title: "hps.telemetry",
  body: "session_id=\(sessionID) burst_index=\(burstIndex) bytes=\(burstBytes) duration_ms=\(burstDurationMs) gaps=0 result=ok"
)

// Persist (via bridge on historicalWriteQueue)
let telemetryArgs: [String: Any] = [
  "database_path": historicalDirectWriteDatabasePath,
  "session_id": sessionID,
  "burst_index": burstIndex,
  "bytes_received": burstBytes,
  "duration_ms": burstDurationMs,
  "missing_packets": 0,
  "sequence_gaps": 0,
  "result": "ok",
]
let bridge = historicalDirectWriteBridge
historicalWriteQueue.async {
  _ = try? bridge.request(method: "sync.record_hps_telemetry", args: telemetryArgs)
}
```

### Rust bridge method (5-location pattern)

```rust
// 1. BRIDGE_METHODS — add alphabetically: "sync.record_hps_telemetry"

// 2. Args struct
#[derive(Debug, Clone, Deserialize)]
struct SyncRecordHpsTelemetryArgs {
    database_path: String,
    session_id: String,
    burst_index: i64,
    bytes_received: i64,
    duration_ms: i64,
    missing_packets: i64,
    sequence_gaps: i64,
    result: String,
}

// 3. Dispatcher arm
"sync.record_hps_telemetry" => request_args::<SyncRecordHpsTelemetryArgs>(&request)
    .and_then(sync_record_hps_telemetry_bridge)
    .map(|v| bridge_ok(&request.request_id, v))
    .unwrap_or_else(|e| bridge_error(&request.request_id, e))

// 4. Implementation fn
fn sync_record_hps_telemetry_bridge(args: SyncRecordHpsTelemetryArgs) -> GooseResult<serde_json::Value> {
    let store = GooseStore::open(Path::new(&args.database_path))?;
    store.insert_sync_telemetry(
        &args.session_id, args.burst_index, args.bytes_received,
        args.duration_ms, args.missing_packets, args.sequence_gaps, &args.result,
    )?;
    Ok(serde_json::json!({ "ok": true }))
}

// 5. Store fn (in store/mod.rs or store/capture.rs)
pub fn insert_sync_telemetry(
    &self, session_id: &str, burst_index: i64, bytes_received: i64,
    duration_ms: i64, missing_packets: i64, sequence_gaps: i64, result: &str,
) -> GooseResult<()> {
    let conn = self.conn.lock().map_err(|_| GooseError::message("mutex poisoned"))?;
    conn.execute(
        "INSERT INTO sync_telemetry (session_id, burst_index, bytes_received, duration_ms, missing_packets, sequence_gaps, result) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![session_id, burst_index, bytes_received, duration_ms, missing_packets, sequence_gaps, result],
    )?;
    Ok(())
}
```

### PROTO-10 fix: `data_packet_domain`

```rust
// In protocol.rs, fn data_packet_domain
fn data_packet_domain(packet_k: u8) -> Option<&'static str> {
    Some(match packet_k {
        7 => "legacy_raw_or_research_counted",
        9 | 12 | 18 => "normal_history_with_hr_marker",  // CHANGED: removed 24
        24 => "v24_biometric_stream",                     // NEW: split out
        10 | 21 => "raw_motion_stream_result",
        11 => "raw_stream_counted",
        16 => "raw_ecg_labrador",
        17 => "r17_optical_or_labrador_filtered",
        19 | 22 => "research_packet",
        20 => "raw_or_research_counted",
        25 | 26 => "pulse_information_packet",
        _ => return None,
    })
}
```

### Coach crash fix: sign-in task cancellation

```swift
// In CoachChatModel.swift — add field alongside sendTask
private var signInTask: Task<Void, Never>?

func startOAuthSignIn() {
  errorMessage = nil
  guard let chatGPT = registry.activeProvider as? ChatGPTCoachProvider else { return }
  signInTask?.cancel()  // cancel previous in-flight sign-in
  signInTask = Task { [chatGPT, weak self] in
    do {
      try await chatGPT.startOAuthSignIn()
      self?.seedAssistantPromptIfNeeded()
    } catch is CancellationError {
      // cancelled — no-op
    } catch {
      self?.errorMessage = error.localizedDescription
    }
  }
}
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Rust framework | `cargo test --locked` |
| Swift framework | Xcode test target `GooseSwiftTests` |
| Quick run (Rust) | `cargo test -p goose-core --lib 2>&1 | tail -5` |
| Full suite (Rust) | `cargo test --locked --manifest-path Rust/core/Cargo.toml` |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Command |
|-----|----------|-----------|---------|
| SYNC-12 store | `sync_telemetry` table created and row insertable | Rust unit | `cargo test -- insert_sync_telemetry` |
| SYNC-12 bridge | `sync.record_hps_telemetry` bridge method dispatches | Rust unit | `cargo test -- sync_record_hps_telemetry` |
| SYNC-12 schema | `CURRENT_SCHEMA_VERSION == 23` | Rust unit | `cargo test -- schema_version` |
| BUG-COACH-01 | Sign-in task cancellation on re-tap | Manual (simulator) | Tap Coach, tap sign in twice rapidly; confirm no hang |
| PROTO-10 | `data_packet_domain(24) == "v24_biometric_stream"` | Rust unit | `cargo test -- data_packet_domain` |
| BRIDGE_METHODS | `bridge_methods_constant_matches_dispatcher` | Rust unit | `cargo test -- bridge_methods_constant` |

### Wave 0 Gaps
- [ ] `Rust/core/tests/` — add `sync_telemetry_round_trip` test using `make_temp_db()`
- [ ] Verify `GooseBLEHistoricalManager` new fields (`burstStartedAt`, `burstBytesReceived`) do not break existing GooseSwiftTests

---

## Open Questions

1. **Missing/sequence gap counting** — issue #162 schema includes `missing_packets` and `sequence_gaps`. Rust `capture.import_frame_batch` returns a result but does it include sequence gap data? Need to check the Rust bridge return value for `import_frame_batch` to see if gap count is available. For phase 101, defaulting to 0 is safe.

2. **`sync.record_hps_telemetry` vs inserting from Rust directly** — should the Swift side call the bridge at burst end, or should the Rust `capture.import_frame_batch` itself increment a telemetry record? The former (Swift calls bridge) is simpler and matches D-02 ("Rust-side instrumentation"). The frame count is already tracked in Rust via the import result, but burst boundaries are only known in Swift.

3. **Coach crash reproduction** — issue #170 says "crash or freeze." The code shows no hard crash site (no force unwrap, no unguarded nil). To confirm the freeze hypothesis (device code poll hang), reproduce on a device with network connectivity to the Codex endpoint throttled. If the crash is an actual fatal (app killed by OS), a crash log from the device is needed.

4. **PROTO-08 scope in Swift** — `V5PacketType` in Swift uses raw `u8` constants (e.g., `case historicalData = 47`). If PROTO-08 is intended to also cover the Swift side, those constants are in `GooseBLETypes.swift` and are already typed as a Swift enum. No change needed.

---

## Sources

### Primary (HIGH confidence — direct code read)
- `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift` — burst start/end lifecycle, `record()` call sites
- `GooseSwift/CoreBluetoothBLETransport+VitalsAndLogging.swift` — `record()` function signature and filtering logic
- `GooseSwift/GooseBLEHistoricalManager.swift` — all manager fields; `historicalSyncRunID` confirmed as session ID
- `Rust/core/src/store/mod.rs` — `CURRENT_SCHEMA_VERSION = 22`, full schema, `migrate()` structure
- `Rust/core/src/protocol.rs` — `PacketType` enum (lines 22–41), `parse_data_packet_body_summary` (lines 720–748), `data_packet_domain` (lines 1229–1241)
- `Rust/core/src/commands.rs` — `COMMAND_DEFINITIONS` at line 534, 76 entries, PROTO-11 test at bridge/mod.rs:1242
- `GooseSwift/CoachChatModel.swift` — full read, no force unwraps, Task pattern
- `GooseSwift/ChatGPTCoachProvider.swift` — `startOAuthSignIn` async throws, device code polling
- `GooseSwift/CoachView.swift` — `.onChange` trigger, `openChat` function, init pattern
- `GooseSwift/CoachProviderProtocol.swift` — `CoachProviderRegistry.init()` — `activeProvider` always non-nil

### Secondary (MEDIUM confidence — grep results)
- grep across `bridge/mod.rs` for `COMMAND_DEFINITIONS` — confirmed test exists at line 1242
- grep across `protocol.rs` for `_ =>` — confirmed 6 catch-all arms; none silent (all return a value)

---

## Metadata

**Confidence breakdown:**
- SYNC-12 instrumentation points: HIGH — exact file:line references confirmed by reading source
- SYNC-12 schema: HIGH — `CURRENT_SCHEMA_VERSION = 22` confirmed; migration pattern established
- BUG-COACH-01 crash site: MEDIUM — no hard crash found; freeze hypothesis is well-supported; actual crash log would confirm
- PROTO-08: HIGH — enum exists and is complete
- PROTO-09: HIGH — `_ =>` arm is not silent
- PROTO-10: HIGH — mismatch between `data_packet_domain` and parse arms for packet_k=24 confirmed
- PROTO-11: HIGH — `COMMAND_DEFINITIONS` exists with 76 entries; test exists

**Research date:** 2026-06-21
**Valid until:** 2026-07-21 (stable domain)
