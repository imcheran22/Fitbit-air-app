# Phase 83: Protocol Architecture Refactor — Gen4/Gen5 Capability Model - Research

**Researched:** 2026-06-14
**Domain:** Rust type system additions + Swift enum migration + SQLite migration
**Confidence:** HIGH

## Summary

This phase is a pure code-health refactor with all design decisions locked in 83-CONTEXT.md. There
are no new external dependencies, no UI changes, and no new BLE protocol features. The work splits
cleanly into three independent streams: (1) Rust type additions in `protocol.rs` and a new bridge
method, (2) Swift enum/property replacement in `GooseBLEClient` and `GooseNotificationEvent`, and
(3) a one-row SQL data migration in `store.rs`. All three streams touch well-understood code that
has stable, readable patterns already established in the codebase.

The biggest implementation risk is the `activeDeviceGeneration` replacement: this property is
referenced in 23 locations across 7 Swift files, and some of those references use
`activeDeviceGeneration.buildCommandFrame()` (a method on `WhoopGeneration`) that must keep
working through the `connectedCapabilities` era — the `WhoopGeneration` enum itself is NOT
deleted; only the `activeDeviceGeneration` state variable is replaced by `connectedCapabilities`.

A secondary risk is the `GEN_4` vs `GEN4` naming inconsistency: Swift sends `"GEN4"` to Rust
(via `rustDeviceType`), but `device_type_name()` in store.rs writes `"GEN_4"` to the DB. Both
spellings are already accepted by `parse_device_type()`. New rows after this phase continue to
use `"GEN_4"` in the DB (that is what `device_type_name` produces) and `"GEN4"` in the FFI
string. No change is needed here, but the planner must not introduce a third spelling.

**Primary recommendation:** Implement in three sequential waves — Rust types first (Wave 0),
Swift replacement second (Wave 1), DB migration third (Wave 2) — so `cargo test --locked` can
gate each wave before the next begins.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- D-01: Frame reassembly buffer stays in Swift (stateless Rust bridge invariant preserved).
- D-02: Swift replaces `rustDeviceType` computed property with a `WireProtocol` Swift enum derived
  from `WhoopGeneration`. String comparisons in reassembly loop replaced by `wireProtocol == .gen4`
  enum checks.
- D-03: The string payload is still sent to Rust for frame parsing. String changes from `"GOOSE"`
  to a canonical `DeviceKind` identifier, but `parse_device_type` still accepts it.
- D-04: No new stateful bridge methods. Rust receives complete frames — no change to FFI boundary
  shape.
- D-05: `DeviceCapabilities` defined in Rust, exposed via new bridge method `device.capabilities(device_kind)`.
- D-06: Capabilities include: `wire_protocol`, `historical_sync`, `battery_via_r22`,
  `battery_via_event48`, `battery_via_cmd26`, `r22_realtime`.
- D-07: Swift calls `device.capabilities` after GATT discovery. Cached as
  `connectedCapabilities: DeviceCapabilities?` on `GooseBLEClient`. Nil = not connected.
- D-08: `activeDeviceGeneration: WhoopGeneration = .gen5` replaced by
  `connectedCapabilities: DeviceCapabilities?`. All 8 `activeDeviceGeneration == .gen4` guards
  replaced by `capabilities.historicalSync == .pageSequence`.
- D-09: DB migration: `UPDATE decoded_frames SET device_type = 'GOOSE' WHERE device_type IN ('MAVERICK', 'PUFFIN');`
  runs in Rust SQLite init sequence. Idempotent.
- D-10: After migration, `parse_device_type("MAVERICK")` and `parse_device_type("PUFFIN")` return
  an error. Deprecated and rejected.
- D-11: New rows only ever use `"GEN4"`, `"GOOSE"`, or `"HR_MONITOR"` as `device_type` values.
- D-12: Add `WireProtocol` enum to `protocol.rs`: `Gen4` and `Gen5`. Match arms delegate to
  `device_type.wire_protocol() == WireProtocol::Gen4`.
- D-13: Add `DeviceKind` enum: `Whoop4`, `Whoop5`, `HrMonitor`. `DeviceType` kept as-is (DB
  compat) but gains `wire_protocol() -> WireProtocol` and `device_kind() -> DeviceKind` methods.
- D-14: Add `DeviceCapabilities` struct to `bridge.rs` or a new `capabilities.rs` module, derived
  from `DeviceKind`.
- D-15: `is_gen5_family()` helper added to `DeviceType`.
- D-16: `Puffin` variant documented: "hardware code name with no known generation mapping — likely
  unshipped. Parses as Gen5-family wire format." `Puffin` maps to `DeviceKind::Whoop5`.
- D-17: Rust unit tests required for: `DeviceCapabilities` values per `DeviceKind`, `WireProtocol`
  dispatch, `is_gen5_family()`, DB migration idempotency, `parse_device_type` rejection of
  MAVERICK/PUFFIN post-migration.
- D-18: `cargo test --locked` must pass clean. iOS build must compile without new warnings.
- D-19: No manual simulator verification required (pure refactor — no visible behaviour change).

### Claude's Discretion

- Module placement for `DeviceCapabilities`: either `bridge.rs` inline or new `capabilities.rs`.
- Whether `WireProtocol` lives in `protocol.rs` or a new `wire.rs`.

### Deferred Ideas (OUT OF SCOPE)

- Battery feature UI (Phase 84)
- HealthKit persistence (Phase 82 — already shipped)
- Gen6 / third-party device support — future milestone
- Moving frame reassembly to Rust entirely — deferred (stateful bridge discussion needed)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROTO-01 | `WireProtocol { Gen4, Gen5 }` Rust enum exposed to Swift; replaces 17 `rustDeviceType == "GEN4"` string comparisons | Rust: add `WireProtocol` to `protocol.rs`; Swift: replace `rustDeviceType` computed property and reassembly comparisons in `GooseAppModel+NotificationPipeline.swift:829,841,881` |
| PROTO-02 | `DeviceKind { Whoop4, Whoop5, HrMonitor }` + `DeviceCapabilities` in Rust; bridge method `device.capabilities(device_kind)`; cached as `connectedCapabilities: DeviceCapabilities?` | Rust: add types + bridge method; Swift: add `connectedCapabilities` property on `GooseBLEClient`, call `device.capabilities` in `processDiscoveredCharacteristics` at line 986 |
| PROTO-03 | DB migration normalises MAVERICK/PUFFIN → GOOSE; `parse_device_type()` rejects MAVERICK/PUFFIN; `activeDeviceGeneration` replaced by `connectedCapabilities` guards | Rust: migration in `store.rs:migrate()`, rejection in `bridge.rs:parse_device_type()`; Swift: 23 sites across 7 files |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WireProtocol enum (Gen4/Gen5) | Rust core library | Swift consumer | Rust is the canonical type system; Swift derives from Rust via JSON FFI |
| DeviceKind / DeviceCapabilities | Rust core library | Swift consumer | Single source of truth for capability queries; future Android reuse |
| Frame reassembly header dispatch | Swift (GooseAppModel) | — | Stateless Rust bridge invariant; buffer state stays in Swift per D-01/D-04 |
| DB migration (MAVERICK/PUFFIN → GOOSE) | Rust core library (store.rs) | — | Rust owns the SQLite schema and migration sequence |
| Historical sync Gen4 guards | Swift (GooseBLEClient extensions) | — | 8 guards in BLE state machine; replaced by capability enum checks |
| parse_device_type rejection | Rust core library (bridge.rs) | — | Validation at the FFI boundary |

## Standard Stack

No new external dependencies. This phase uses only existing crate dependencies:

| Library | Version (current) | Purpose |
|---------|-------------------|---------|
| `serde` + `serde_json` | 1.0 (locked) | JSON serialisation for new `DeviceCapabilities` bridge response |
| `rusqlite` | 0.37 (locked) | Migration UPDATE statement in `store.rs:migrate()` |

**Installation:** None. Zero new packages.

## Package Legitimacy Audit

Not applicable — no new packages introduced in this phase.

## Architecture Patterns

### System Architecture Diagram

```
Swift (GooseBLEClient)               Rust (bridge.rs / protocol.rs)
       |                                         |
 GATT discovery                                  |
       |                                         |
 WhoopGeneration.detect()                        |
       |                                         |
 bridge.request("device.capabilities",           |
   device_kind: "WHOOP4"|"WHOOP5"|"HR_MONITOR") ──> DeviceKind::from_str()
       |                                              └─> DeviceCapabilities::for_kind()
 connectedCapabilities = result <──────────────────── JSON response
       |
 capabilities.historicalSync == .pageSequence  (replaces activeDeviceGeneration == .gen4)
 capabilities.wireProtocol == .gen4            (replaces rustDeviceType == "GEN4")
       |
 gooseFrames() reassembly                        |
 bridge.request("protocol.parse_frame_hex",      |
   device_type: "GEN4"|"GOOSE"|"HR_MONITOR") ──> parse_device_type()
                                                  └─> parse_frame()
```

### Recommended Project Structure

**Rust new types — placement decision (Claude's Discretion):**

The researcher recommends `protocol.rs` for `WireProtocol` (it naturally belongs with `DeviceType`) and a new `capabilities.rs` module for `DeviceCapabilities` (keeps `bridge.rs` from growing further before the Phase 86 split). `DeviceKind` can live in either `protocol.rs` or `capabilities.rs`; recommend `capabilities.rs` because it is used only to derive `DeviceCapabilities`.

```
Rust/core/src/
├── protocol.rs          # Add WireProtocol enum; add wire_protocol(), device_kind(),
│                        # is_gen5_family() methods to DeviceType
├── capabilities.rs      # NEW: DeviceKind enum, DeviceCapabilities struct, for_kind()
├── bridge.rs            # Add "device.capabilities" arm; import capabilities module;
│                        # reject MAVERICK/PUFFIN in parse_device_type()
├── store.rs             # Add migration step 22: UPDATE decoded_frames...
└── lib.rs               # pub mod capabilities;

GooseSwift/
├── GooseBLETypes.swift  # Replace rustDeviceType computed property;
│                        # add WireProtocol Swift enum;
│                        # add DeviceCapabilities Swift struct
├── GooseBLEClient.swift # Replace activeDeviceGeneration with connectedCapabilities
├── GooseBLEClient+Commands.swift    # Update processDiscoveredCharacteristics (line 986)
├── GooseBLEClient+HistoricalHandlers.swift  # 6 guard sites
├── GooseBLEClient+HistoricalCommands.swift  # 2 guard sites
├── GooseBLEClient+Parsing.swift             # 4 activeDeviceGeneration references
├── GooseBLEClient+DebugAndSync.swift        # 3 references
└── GooseAppModel+NotificationPipeline.swift # 3 rustDeviceType references + reassembly
```

### Pattern 1: Rust Method Addition to Existing Enum

`DeviceType` already has `header_len()` and `expected_frame_len()`. Adding methods follows the
same `impl DeviceType` block. [ASSUMED — standard Rust pattern]

```rust
// Source: Rust/core/src/protocol.rs (existing impl block, lines 35-68)
impl DeviceType {
    // existing methods...

    pub fn wire_protocol(self) -> WireProtocol {
        match self {
            DeviceType::Gen4 => WireProtocol::Gen4,
            DeviceType::Maverick
            | DeviceType::Puffin
            | DeviceType::Goose
            | DeviceType::HrMonitor => WireProtocol::Gen5,
        }
    }

    pub fn device_kind(self) -> DeviceKind {
        match self {
            DeviceType::Gen4 => DeviceKind::Whoop4,
            DeviceType::Maverick | DeviceType::Puffin | DeviceType::Goose => DeviceKind::Whoop5,
            DeviceType::HrMonitor => DeviceKind::HrMonitor,
        }
    }

    /// Returns true for all devices that use the 8-byte Gen5-family frame header.
    pub fn is_gen5_family(self) -> bool {
        matches!(
            self,
            DeviceType::Maverick | DeviceType::Puffin | DeviceType::Goose | DeviceType::HrMonitor
        )
    }
}
```

### Pattern 2: Bridge Method Addition

New bridge methods follow the exact pattern of existing arms in `handle_bridge_request`. The
`BRIDGE_METHODS` constant must also be updated (it is verified by a test). [VERIFIED: bridge.rs lines 183-332]

```rust
// Source: Rust/core/src/bridge.rs — new arm in match block, and entry in BRIDGE_METHODS
"device.capabilities" => request_args::<DeviceCapabilitiesArgs>(&request)
    .and_then(device_capabilities_bridge)
    .map(|value| bridge_ok(&request.request_id, value))
    .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
```

The `BRIDGE_METHODS` constant list is alphabetically sorted. `"device.capabilities"` inserts
between `"debug.start_session"` and `"diagnostics.perf_budget"`. [VERIFIED: bridge.rs lines 228-233]

### Pattern 3: Store Migration Step

The current schema is v21. This migration adds step 22. The pattern is: add the SQL UPDATE inside
the `migrate()` batch, add an `INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (22)`,
and bump `PRAGMA user_version = 22`. [VERIFIED: store.rs lines 1808-1830]

```rust
// Source: Rust/core/src/store.rs — add to migrate() batch after the v21 INSERT
UPDATE decoded_frames SET device_type = 'GOOSE'
WHERE device_type IN ('MAVERICK', 'PUFFIN');

INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (22);
PRAGMA user_version = 22;
```

`CURRENT_SCHEMA_VERSION` (line 14 of store.rs) must be updated from `21` to `22`.

### Pattern 4: Swift Capability Cache Pattern

`connectedCapabilities` is nil when disconnected. When GATT discovery runs, it is set via bridge
call. When BLE disconnects, it is cleared. The existing reset path in `GooseBLEClient+Parsing.swift:548`
already resets `activeDeviceGeneration = .gen5` — that line becomes `connectedCapabilities = nil`.
[VERIFIED: GooseBLEClient+Parsing.swift:548]

```swift
// In GooseBLETypes.swift — new Swift-side struct mirroring Rust JSON
struct DeviceCapabilities {
  let wireProtocol: WireProtocol
  let historicalSync: HistoricalSyncKind
  let batteryViaR22: Bool
  let batteryViaEvent48: Bool
  let batteryViaCMD26: Bool
  let r22Realtime: Bool
}

enum WireProtocol {
  case gen4
  case gen5
}

enum HistoricalSyncKind {
  case pageSequence   // Gen4: cmd34 → cmd22 → cmd23 page protocol
  case stream         // Gen5: GET_DATA_RANGE + SEND_HISTORICAL_DATA streaming
}
```

### Anti-Patterns to Avoid

- **Adding a fourth device_type DB string:** The only canonical strings in `decoded_frames.device_type`
  after migration are `GEN_4`, `GOOSE`, `HR_MONITOR`. Do not introduce `WHOOP4`, `WHOOP5`, or
  `GEN4` (without underscore) as DB values. The `device_type_name()` function in store.rs is the
  single serialisation point and must not be changed.
- **Deleting WhoopGeneration:** `WhoopGeneration` enum is still needed for frame building
  (`helloFrame`, `buildCommandFrame`). Only the *state variable* `activeDeviceGeneration` is
  replaced. `WhoopGeneration.detect()` still runs at GATT discovery and provides the source for
  deriving the `DeviceKind` arg.
- **Making device.capabilities stateful:** It must be a pure function of `device_kind` — no stored
  state in Rust. Matches the stateless bridge invariant.
- **Patching `expected_device_type()` in capture_import.rs / fixtures.rs / capture_correlation.rs:**
  These local parsers read from the DB (where the migration has already normalised rows) or from
  test fixtures. They do NOT call `parse_device_type()` from bridge.rs. MAVERICK/PUFFIN removal
  only applies to the bridge FFI entry point. The fixture parsers (`expected_device_type` in
  capture_import.rs, fixtures.rs, capture_correlation.rs) still need to accept `"MAVERICK"` for
  replaying old test data unless those fixtures are also migrated.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON serialisation for DeviceCapabilities | Custom string builder | `serde_json::to_value(capabilities)` + `#[derive(Serialize)]` | Already used throughout bridge.rs |
| DB migration idempotency | Custom version check | `INSERT OR IGNORE` + `PRAGMA user_version` | Established pattern at store.rs:1809-1830 |
| Enum-to-string mapping | `if/else` chains | `#[serde(rename_all = "snake_case")]` on derive | Used on DeviceType and ParsedPayload already |

## Runtime State Inventory

Not applicable — this is not a rename/refactor of a stored identity string. The DB migration
normalises `decoded_frames.device_type` values (`MAVERICK` → `GOOSE`, `PUFFIN` → `GOOSE`) but
these are internal parser tags, not user-visible identifiers. No external service configs, OS
registrations, or env vars embed MAVERICK/PUFFIN.

**Stored data:** `decoded_frames.device_type` column — affected rows migrated by migration step 22.
All other categories: None verified (not applicable).

## Common Pitfalls

### Pitfall 1: BRIDGE_METHODS Constant Out of Sync

**What goes wrong:** Adding `"device.capabilities"` to the match arm without adding it to
`BRIDGE_METHODS` causes the `bridge_methods_constant_matches_dispatcher` test to fail.
**Why it happens:** `BRIDGE_METHODS` is a separate sorted constant that the test cross-checks
against the match arms.
**How to avoid:** Always update `BRIDGE_METHODS` and the match arm in the same edit. Keep sorted:
`"device.capabilities"` belongs between `"debug.start_session"` and `"diagnostics.perf_budget"`.
**Warning signs:** `cargo test --locked` fails on `bridge_methods_constant_matches_dispatcher`.

### Pitfall 2: activeDeviceGeneration Used for Frame Building (Not Just Guards)

**What goes wrong:** Replacing `activeDeviceGeneration` with `connectedCapabilities` breaks the
calls `activeDeviceGeneration.buildCommandFrame(...)` and `activeDeviceGeneration.helloFrame`.
**Why it happens:** `WhoopGeneration` has methods that `connectedCapabilities` does not have.
**How to avoid:** Derive `WhoopGeneration` from `connectedCapabilities.wireProtocol` when frame
building is needed, or keep a private `activeDeviceGeneration: WhoopGeneration` derived from
capabilities. The 23 references split into: 8 guard checks (replace with capabilities) and
15 frame-building / description calls (keep WhoopGeneration, derive from capabilities).
**Warning signs:** Swift build errors on `connectedCapabilities.buildCommandFrame`.

### Pitfall 3: Schema Version Not Bumped

**What goes wrong:** Adding the migration SQL but forgetting to update `CURRENT_SCHEMA_VERSION`
from 21 to 22 causes `open_existing_current()` to reject the newly migrated DB.
**How to avoid:** Always update both the migration batch SQL and the `CURRENT_SCHEMA_VERSION`
constant in the same plan step.
**Warning signs:** Integration tests calling `open_existing_current` return schema version errors.

### Pitfall 4: `expected_device_type` in Fixture Parsers

**What goes wrong:** Removing MAVERICK/PUFFIN from `parse_device_type` in bridge.rs may seem to
require the same change in `capture_import.rs:expected_device_type`, `fixtures.rs:expected_device_type`,
and `capture_correlation.rs:expected_device_type`. But these are different functions used to parse
test fixtures/DB rows — they should continue to accept MAVERICK/PUFFIN for backward compatibility
with existing fixture files.
**How to avoid:** Only modify `bridge.rs:parse_device_type()`. Leave the three `expected_device_type`
helpers untouched.
**Warning signs:** Test fixture-based tests fail because fixtures contain `"MAVERICK"` device_type.

### Pitfall 5: Nil connectedCapabilities Mid-Session

**What goes wrong:** Guards that replace `activeDeviceGeneration == .gen4` using
`connectedCapabilities?.historicalSync == .pageSequence` will silently evaluate to `false` if
capabilities are nil (e.g. during a brief disconnect). The `.gen5` default is replaced by `nil`,
which is safer but requires guarding the call sites.
**How to avoid:** At each guard site, either use `guard let capabilities = connectedCapabilities`
or use optional chaining `connectedCapabilities?.historicalSync == .pageSequence`.
**Warning signs:** Historical sync behaves as Gen5 briefly after reconnect before capabilities
are refreshed.

### Pitfall 6: GEN_4 vs GEN4 Naming in DB

**What goes wrong:** `device_type_name()` in store.rs writes `"GEN_4"` (with underscore) to the
DB, but Swift sends `"GEN4"` (no underscore) to the bridge. Both are accepted by `parse_device_type`.
A careless edit could introduce a third spelling.
**How to avoid:** Do not change `device_type_name()` output for Gen4. The canonical DB spelling
is `GEN_4` (with underscore) — keep it as-is. New rows written after D-11 still go through
`device_type_name`, so they remain `GEN_4`.

## Code Examples

### Rust: WireProtocol Enum and DeviceType Extension

```rust
// Source: To be added to Rust/core/src/protocol.rs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WireProtocol {
    Gen4,
    Gen5,
}
```

### Rust: DeviceCapabilities Struct (new capabilities.rs)

```rust
// Source: To be created at Rust/core/src/capabilities.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceKind {
    Whoop4,
    Whoop5,
    HrMonitor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCapabilities {
    pub wire_protocol: String,       // "gen4" | "gen5"
    pub historical_sync: String,     // "page_sequence" | "stream"
    pub battery_via_r22: bool,
    pub battery_via_event48: bool,
    pub battery_via_cmd26: bool,
    pub r22_realtime: bool,
}

impl DeviceCapabilities {
    pub fn for_kind(kind: DeviceKind) -> Self {
        match kind {
            DeviceKind::Whoop4 => Self {
                wire_protocol: "gen4".to_string(),
                historical_sync: "page_sequence".to_string(),
                battery_via_r22: false,
                battery_via_event48: true,
                battery_via_cmd26: true,
                r22_realtime: false,
            },
            DeviceKind::Whoop5 => Self {
                wire_protocol: "gen5".to_string(),
                historical_sync: "stream".to_string(),
                battery_via_r22: true,
                battery_via_event48: true,
                battery_via_cmd26: true,
                r22_realtime: true,
            },
            DeviceKind::HrMonitor => Self {
                wire_protocol: "gen5".to_string(),
                historical_sync: "stream".to_string(),
                battery_via_r22: false,
                battery_via_event48: false,
                battery_via_cmd26: false,
                r22_realtime: false,
            },
        }
    }
}
```

### Swift: gooseFrames Reassembly After PROTO-01

```swift
// Source: GooseAppModel+NotificationPipeline.swift — replacing lines 829,841
// Before: let headerLength = event.rustDeviceType == "GEN4" ? 4 : 8
// After:
let headerLength = event.wireProtocol == .gen4 ? 4 : 8

// Before: if event.rustDeviceType == "GEN4" {
// After:
if event.wireProtocol == .gen4 {
```

### Swift: connectedCapabilities at GATT Discovery

```swift
// Source: GooseBLEClient+Commands.swift, inside processDiscoveredCharacteristics (~line 986)
// After setting commandCharacteristic and activeDescriptor:
let kind: String
if characteristic.uuid.uuidString.lowercased().hasPrefix("61080002") {
  kind = "WHOOP4"
} else {
  kind = "WHOOP5"
}
let capArgs: [String: Any] = ["device_kind": kind]
if let result = try? bridge.request(method: "device.capabilities", args: capArgs),
   let capData = try? JSONSerialization.data(withJSONObject: result),
   let caps = try? JSONDecoder().decode(DeviceCapabilities.self, from: capData) {
  connectedCapabilities = caps
}
```

### Swift: Guard Replacement Pattern

```swift
// Before (GooseBLEClient+HistoricalCommands.swift:68):
if activeDeviceGeneration == .gen4 {

// After:
if connectedCapabilities?.historicalSync == .pageSequence {
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| String comparisons `rustDeviceType == "GEN4"` | `wireProtocol == .gen4` enum check | Phase 83 | Compile-time exhaustive |
| `activeDeviceGeneration: WhoopGeneration = .gen5` (silent gen5 default) | `connectedCapabilities: DeviceCapabilities?` (nil when disconnected) | Phase 83 | No false-gen5 default; nil is explicit |
| MAVERICK/PUFFIN accepted by `parse_device_type` | Rejected with error | Phase 83 | Enforces canonical device set |

## Detailed Source Map

### Files Modified: Rust

| File | What Changes | Lines (approx) |
|------|-------------|----------------|
| `Rust/core/src/protocol.rs` | Add `WireProtocol` enum; add `wire_protocol()`, `device_kind()`, `is_gen5_family()` methods to `DeviceType` | After line 68 |
| `Rust/core/src/capabilities.rs` | NEW FILE: `DeviceKind` enum, `DeviceCapabilities` struct, `for_kind()` impl | New |
| `Rust/core/src/lib.rs` | Add `pub mod capabilities;` | After line 47 |
| `Rust/core/src/bridge.rs` | Add `"device.capabilities"` to `BRIDGE_METHODS` (between lines 228-232); add match arm in dispatcher; reject MAVERICK/PUFFIN in `parse_device_type()` (lines 9518-9519); add `DeviceCapabilitiesArgs` struct | Lines 228-232, 9515-9526 |
| `Rust/core/src/store.rs` | Add migration step 22 UPDATE SQL; bump `CURRENT_SCHEMA_VERSION` from 21 to 22; update `device_type_name()` (MAVERICK/PUFFIN arms can remain for existing rows, but `store.rs:8921-8922` are dead after migration — leave or remove) | Lines 14, 1828-1831 |

### Files Modified: Swift

| File | What Changes | Key Locations |
|------|-------------|---------------|
| `GooseBLETypes.swift` | Replace `rustDeviceType` computed property (lines 75-84); add `WireProtocol` Swift enum; add `wireProtocol` computed property; add `DeviceCapabilities` Swift struct | Lines 75-84, after `WhoopGeneration` enum (line 291) |
| `GooseBLEClient.swift` | Replace `activeDeviceGeneration: WhoopGeneration = .gen5` with `connectedCapabilities: DeviceCapabilities?`; keep `WhoopGeneration` derivation helper | Line 275 |
| `GooseBLEClient+Commands.swift` | `processDiscoveredCharacteristics`: add `device.capabilities` bridge call after line 986; update frame building calls to derive generation from capabilities | Lines 262, 361, 496, 986 |
| `GooseBLEClient+Parsing.swift` | `resetBLEState()`: change `activeDeviceGeneration = .gen5` to `connectedCapabilities = nil`; update `frames(in:)` and `payload(in:)` to derive generation | Lines 548, 737, 748, 1015, 1022 |
| `GooseBLEClient+HistoricalHandlers.swift` | Replace 6 `activeDeviceGeneration == .gen4` guards with `connectedCapabilities?.historicalSync == .pageSequence` | Lines 80, 453, 567, 593, 672; switch statement at line 80 |
| `GooseBLEClient+HistoricalCommands.swift` | Replace 2 `activeDeviceGeneration == .gen4` guards | Lines 68, 108 |
| `GooseBLEClient+DebugAndSync.swift` | Replace `activeDeviceGeneration == .gen4` and `activeDeviceGeneration.description` references | Lines 399, 419, 440 |
| `GooseAppModel+NotificationPipeline.swift` | Replace `rustDeviceType == "GEN4"` (line 829, 841); replace `rustDeviceType` in frameReassemblyKey (line 881) | Lines 524, 700, 720, 829, 841, 881 |
| `GooseAppModel+Upload.swift` | Replace `deviceEvent.rustDeviceType` with string from `wireProtocol` or canonical string | Line 125 |
| `OvernightRawNotificationSpool.swift` | Replace `event.rustDeviceType` | Line 369 |
| `OvernightSQLiteMirrorQueue.swift` | Replace `event.rustDeviceType` | Line 100 |
| `MovementPacketSamples.swift` | Replace `event.rustDeviceType` | Lines 229, 240 |

### Full activeDeviceGeneration Reference Inventory

From `grep -rn "activeDeviceGeneration"` (23 occurrences, 7 files):

**GooseBLEClient.swift (1):**
- Line 275: Declaration — replace with `connectedCapabilities: DeviceCapabilities?`

**GooseBLEClient+Commands.swift (4):**
- Line 262: `activeDeviceGeneration.buildCommandFrame(...)` — derive WhoopGeneration from capabilities
- Line 361: `activeDeviceGeneration.buildCommandFrame(...)` — derive WhoopGeneration from capabilities
- Line 496: `activeDeviceGeneration.buildCommandFrame(...)` — derive WhoopGeneration from capabilities
- Line 986: `activeDeviceGeneration = WhoopGeneration.detect(from:)` — also call `device.capabilities`

**GooseBLEClient+DebugAndSync.swift (3):**
- Line 399: `activeDeviceGeneration.description` — use `connectedCapabilities?.wireProtocol` description
- Line 419: `activeDeviceGeneration == .gen4` → `connectedCapabilities?.historicalSync == .pageSequence`
- Line 440: `activeDeviceGeneration == .gen4` → `connectedCapabilities?.historicalSync == .pageSequence`

**GooseBLEClient+Haptics.swift (1):**
- Line 19: `activeDeviceGeneration.buildCommandFrame(...)` — derive WhoopGeneration from capabilities

**GooseBLEClient+HistoricalCommands.swift (3):**
- Line 68: `activeDeviceGeneration == .gen4` → capabilities guard
- Line 108: `activeDeviceGeneration == .gen4` → capabilities guard
- Line 114: `activeDeviceGeneration.buildCommandFrame(...)` — derive

**GooseBLEClient+HistoricalHandlers.swift (6):**
- Line 80: `switch activeDeviceGeneration` → switch on `connectedCapabilities?.historicalSync`
- Line 453: `activeDeviceGeneration == .gen4` → capabilities guard
- Line 567: `activeDeviceGeneration == .gen4` → capabilities guard
- Line 593: `activeDeviceGeneration != .gen4` → capabilities guard
- Line 672: `activeDeviceGeneration == .gen4` → capabilities guard

**GooseBLEClient+Parsing.swift (5):**
- Line 548: `activeDeviceGeneration = .gen5` → `connectedCapabilities = nil`
- Line 737: `activeDeviceGeneration != .gen4` → capabilities guard
- Line 748: `activeDeviceGeneration != .gen4` → capabilities guard
- Line 1015: `switch activeDeviceGeneration` → switch on wireProtocol
- Line 1022: `switch activeDeviceGeneration` → switch on wireProtocol

**GooseBLEClient+UserActions.swift (2):**
- Line 82: `activeDeviceGeneration.buildCommandFrame(...)` — derive
- Line 204: `activeDeviceGeneration.helloFrame` — derive from capabilities

**Note:** The 8 CONTEXT.md-referenced guards are a subset. The full count is 23 references. Frame
building references (12 sites) require deriving `WhoopGeneration` from `connectedCapabilities`
rather than replacing the call.

### Full rustDeviceType Reference Inventory

From `grep -rn "rustDeviceType"` (11 occurrences, 8 files):

| File | Line | Type | Action |
|------|------|------|--------|
| `GooseBLETypes.swift` | 75 | Declaration | Replace with `wireProtocol` computed property |
| `GooseAppModel+NotificationPipeline.swift` | 524 | Passed to bridge arg `deviceType:` | Use canonical string from wireProtocol |
| `GooseAppModel+NotificationPipeline.swift` | 700 | Same | Same |
| `GooseAppModel+NotificationPipeline.swift` | 720 | `== "HR_MONITOR"` check | Use `wireProtocol == .hrMonitor` or keep string |
| `GooseAppModel+NotificationPipeline.swift` | 829 | `== "GEN4"` in reassembly | Replace with `wireProtocol == .gen4` |
| `GooseAppModel+NotificationPipeline.swift` | 841 | `== "GEN4"` in reassembly | Replace with `wireProtocol == .gen4` |
| `GooseAppModel+NotificationPipeline.swift` | 881 | Part of cache key string | Include wireProtocol raw value |
| `GooseAppModel+Upload.swift` | 125 | Bridge arg `deviceType:` | Use canonical string from wireProtocol |
| `OvernightRawNotificationSpool.swift` | 369 | Bridge arg `device_type:` | Use canonical string from wireProtocol |
| `OvernightSQLiteMirrorQueue.swift` | 100 | Bridge arg `device_type:` | Use canonical string from wireProtocol |
| `MovementPacketSamples.swift` | 229, 240 | Logging | Use wireProtocol description |

**The 17 string comparisons** referenced in PROTO-01 are the total number of call sites passing or
comparing `rustDeviceType` — including the 2 `== "GEN4"` reassembly checks, the 1 `== "HR_MONITOR"`
check, and all the pass-through uses where the string is forwarded to the bridge. The reassembly
checks (lines 829, 841) are the primary target; the pass-through uses become derived strings.

**Note on `wireProtocol` on `GooseNotificationEvent`:** The `rustDeviceType` computed property lives
on `GooseNotificationEvent` (GooseBLETypes.swift:75). The replacement `wireProtocol` computed
property must also live on `GooseNotificationEvent`, using the same UUID-based detection logic but
returning `WireProtocol` instead of `String`. This is a self-contained change.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `cargo test` (Rust built-in) |
| Config file | `Rust/core/Cargo.lock` (locked) |
| Quick run command | `cargo test --locked -p goose-core 2>&1 \| tail -5` |
| Full suite command | `cargo test --locked` |
| Swift build | `xcodebuild -project GooseSwift.xcodeproj -scheme GooseSwift build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROTO-01 | `WireProtocol` enum exists; `is_gen5_family()` correct | unit | `cargo test --locked -p goose-core wire_protocol` | ❌ Wave 0 |
| PROTO-01 | Swift reassembly uses enum not string | build | `xcodebuild ... build` | ✅ (will fail before fix) |
| PROTO-02 | `DeviceCapabilities::for_kind()` returns correct values per DeviceKind | unit | `cargo test --locked -p goose-core device_capabilities` | ❌ Wave 0 |
| PROTO-02 | `"device.capabilities"` in BRIDGE_METHODS and dispatcher | unit | `cargo test --locked -p goose-core bridge_methods_constant_matches_dispatcher` | ✅ (will fail before fix) |
| PROTO-03 | Migration step 22 runs idempotently; MAVERICK rows become GOOSE | unit | `cargo test --locked -p goose-core migration` | ❌ Wave 0 |
| PROTO-03 | `parse_device_type("MAVERICK")` returns Err | unit | `cargo test --locked -p goose-core parse_device_type` | ❌ Wave 0 |
| PROTO-03 | `parse_device_type("GEN4")`, `"GOOSE"`, `"HR_MONITOR"` still return Ok | unit | `cargo test --locked -p goose-core parse_device_type` | ✅ (existing tests) |

### Sampling Rate

- **Per task commit:** `cargo test --locked`
- **Per wave merge:** `cargo test --locked` + Swift build
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps (new tests required)

- [ ] `Rust/core/src/capabilities.rs` — unit tests for `DeviceCapabilities::for_kind()` per kind
- [ ] `Rust/core/src/bridge.rs` or `tests/bridge_tests.rs` — `parse_device_type_maverick_rejected()`, `parse_device_type_puffin_rejected()`
- [ ] `Rust/core/tests/store_tests.rs` — `test_migration_step_22_maverick_puffin_to_goose()`, `test_migration_idempotency()`
- [ ] `Rust/core/src/protocol.rs` unit tests — `wire_protocol_gen4()`, `is_gen5_family_all_variants()`, `device_kind_mapping()`

## Security Domain

`security_enforcement: true`, ASVS level 1.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Yes (limited) | `parse_device_type` rejects unknown strings with error; no panic |
| V6 Cryptography | No | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed `device_kind` arg in `device.capabilities` bridge call | Tampering | Return `GooseError` (not panic); existing `request_args` deserialization handles unknown values |
| MAVERICK/PUFFIN DB rows from pre-migration versions | Information Disclosure | Migration step 22 normalises; no data is deleted |

## Open Questions

1. **`HrMonitor` in `WireProtocol`**
   - What we know: `GooseNotificationEvent.rustDeviceType` returns `"HR_MONITOR"` for HR monitor
     characteristics. The CONTEXT.md `WireProtocol` enum has only `Gen4` and `Gen5`. The check
     at `NotificationPipeline.swift:720` uses `event.rustDeviceType == "HR_MONITOR"` as a special
     bypass path.
   - What's unclear: Should `WireProtocol` have a third case `.hrMonitor`, or should the special
     bypass check remain a string comparison against the canonical `"HR_MONITOR"` string?
   - Recommendation: Add `.hrMonitor` as a third case in `WireProtocol` for completeness. The
     `wireProtocol` computed property on `GooseNotificationEvent` already distinguishes the three
     paths. This removes the last string comparison.

2. **`device_type_name()` dead arms after migration**
   - What we know: After migration step 22, no rows will have `device_type = 'MAVERICK'` or
     `device_type = 'PUFFIN'`. The `device_type_name()` match arms for `DeviceType::Maverick`
     and `DeviceType::Puffin` become unreachable (they are only used for INSERT, not SELECT).
   - What's unclear: Should these arms be removed (requiring `DeviceType` enum variants to also
     be removed), or kept for compile-time coverage?
   - Recommendation: Keep the enum variants and match arms. D-16 says `Puffin` gets a doc comment.
     Removing them would require audit of `capture_import.rs:expected_device_type` fixture parsers.
     Leave removal to the Phase 86 bridge.rs split when all callers are reviewed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain | `cargo test --locked` | ✓ | Edition 2024, MSRV 1.94 | — |
| Xcode | Swift build verification | ✓ | 26.5 (local) | CI: macos-15 + Xcode 26.3 |
| cargo test | Wave gate | ✓ | Cargo (bundled) | — |

**Missing dependencies:** None.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Battery capability values for Whoop4 vs Whoop5 in `DeviceCapabilities::for_kind()` | Code Examples | Phase 84 battery feature would dispatch to wrong path; easily fixed in Phase 84 |
| A2 | `GooseBLEClient+Haptics.swift:19` is a frame-building call requiring WhoopGeneration derivation | Detailed Source Map | If it is actually a guard, would be simpler to replace directly |
| A3 | The 17 "string comparisons" in PROTO-01 includes both direct `== "GEN4"` checks and pass-through forwarding uses | Full rustDeviceType inventory | If only direct comparisons count, the target is 3 not 17 |

**If this table is empty:** Not empty — three low-risk assumptions logged above.

## Sources

### Primary (HIGH confidence)

- `Rust/core/src/protocol.rs` (lines 1-69) — DeviceType enum and impl; `header_len`, `expected_frame_len` [VERIFIED: codebase]
- `Rust/core/src/bridge.rs` (lines 183-332, 9515-9526, 10224-10253) — BRIDGE_METHODS constant, `parse_device_type`, existing tests [VERIFIED: codebase]
- `Rust/core/src/store.rs` (lines 14, 1108-1841, 8918-8926) — migration pattern, `CURRENT_SCHEMA_VERSION`, `device_type_name` [VERIFIED: codebase]
- `Rust/core/src/openwhoop_reference.rs` (lines 166-173) — `whoop_generation_from_device_type()` [VERIFIED: codebase]
- `GooseSwift/GooseBLETypes.swift` (lines 75-84, 209-291) — `rustDeviceType`, `WhoopGeneration` [VERIFIED: codebase]
- `GooseSwift/GooseBLEClient.swift` (line 275) — `activeDeviceGeneration` declaration [VERIFIED: codebase]
- `GooseSwift/GooseAppModel+NotificationPipeline.swift` (lines 819-881) — reassembly loop [VERIFIED: codebase]
- `GooseSwift/GooseBLEClient+Commands.swift` (lines 986-1034) — `processDiscoveredCharacteristics` [VERIFIED: codebase]
- grep results — full `activeDeviceGeneration` inventory (23 occurrences, 7 files) [VERIFIED: codebase]
- grep results — full `rustDeviceType` inventory (11 occurrences, 8 files) [VERIFIED: codebase]

### Secondary (MEDIUM confidence)

- `Rust/core/src/capture_import.rs` (lines 1485-1493) — `expected_device_type` fixture parser [VERIFIED: codebase]
- `Rust/core/src/fixtures.rs` (lines 476-485) — same pattern [VERIFIED: codebase]
- `Rust/core/src/capture_correlation.rs` (lines 617-625) — same pattern [VERIFIED: codebase]
- `Rust/core/tests/protocol_tests.rs` — existing test coverage of `DeviceType` [VERIFIED: codebase]

### Tertiary (LOW confidence)

- Battery capability values in `DeviceCapabilities::for_kind()` — based on Phase 81 seed knowledge about R22/Event48/cmd26 [ASSUMED — planner should validate against SEED-002]

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new packages; all existing crates verified
- Architecture: HIGH — patterns verified directly against source files
- Pitfalls: HIGH — identified from direct code inspection of all 23 `activeDeviceGeneration` sites
- Source inventory: HIGH — all locations verified via grep

**Research date:** 2026-06-14
**Valid until:** 2026-07-14 (30 days — stable internal codebase)
