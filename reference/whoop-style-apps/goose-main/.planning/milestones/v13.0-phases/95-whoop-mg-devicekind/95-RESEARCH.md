# Phase 95: WHOOP MG DeviceKind — Research

**Researched:** 2026-06-19
**Domain:** Rust capabilities layer + Swift BLE advertisement parsing
**Confidence:** HIGH (codebase verified) / MEDIUM (MG advertisement byte — APK analysis, no hardware capture)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Researcher determines MG-specific capabilities from the Android APK decompile before planning. Do NOT assume Whoop5 capabilities.
- **D-02:** If researcher confirms capabilities: use them. If not confirmable: default to Whoop5 capabilities with comment `candidate_MG_capabilities_unverified`.
- **D-03:** Best-effort MG BLE identifier from APK analysis. Executor applies best-known pattern and marks it `candidate_MG_advertisement_byte_unverified`.
- **D-04:** No feature flag, no blocking on real device. Best-effort guess that is better than current state (MG misidentified as Whoop5).
- **D-05:** If MG BLE advertisement cannot be determined at all from APK, Swift falls back to Whoop5 identification — executor documents as "MG identification hardware-gated".
- **D-06:** Device view shows "WHOOP MG" label when `connectedCapabilities.deviceKind == .WhoopMg`. No other UI changes.
- **D-07:** `DeviceKind` enum already exists in `capabilities.rs` with `Whoop4`, `Whoop5`, `HrMonitor`. Follow same pattern for `WhoopMg`.
- **D-08:** `DeviceType` enum in `protocol.rs` maps to `DeviceKind` via `device_kind()`. Same pattern for MG.

### Claude's Discretion
None specified.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MG-01 | `DeviceKind::WhoopMg` variant added to Rust core with `DeviceCapabilities` reflecting MG-specific protocol flags — MG devices no longer misidentified as Whoop5 | APK analysis + capabilities.rs pattern |
| MG-02 | iOS app identifies WHOOP MG from BLE advertisement and sets `connectedCapabilities` to `WhoopMg` — device view shows correct generation label | BLE transport code + APK UUID analysis |
</phase_requirements>

---

## Summary

The WHOOP MG is a hardware generation that is currently misidentified as Whoop5 because Goose has no `DeviceKind::WhoopMg` variant. The fix has two sub-scopes: (1) a Rust-only addition of `WhoopMg` to `capabilities.rs` and a corresponding `DeviceType` → `WhoopMg` mapping in `protocol.rs`, and (2) a Swift-side BLE advertisement update in `CoreBluetoothBLETransport+Commands.swift` that detects the MG service UUID and passes `"WHOOP_MG"` to the `device.capabilities` bridge call.

**APK finding (MAVERICK = WHOOP MG):** The Android app's `StrapGeneration` enum (`op0/o.java`) has variants `GEN_4, MAVERICK, PUFFIN, GOOSE, MONUMENT, SYMPHONY`. The string `"GEN_5_MG"` in `sm0/c.java` is produced for `MAVERICK` (ordinal 2). The MAVERICK generation uses a distinct service UUID (`fd4b0001-cce1-4033-93ce-002d5875f58a` prefix) which is already distinguishable at the GATT level — it differs from Gen4 (`61080001` prefix) and from GOOSE/PUFFIN. The MG BLE advertisement identity is the `fd4b0001` service UUID family, with the device name advertising as "WHOOP MG" (confirmed via APK upsell copy). The `WhoopDeviceName` enum in the APK lists `MAVERICK` as a distinct named variant.

**Primary recommendation:** Add `DeviceKind::WhoopMg` + `DeviceType::Maverick` → `WhoopMg` in Rust; detect MAVERICK service UUID `fd4b0001-...` in Swift advertisement parsing to select `"WHOOP_MG"` device kind string. Treat MG capabilities as identical to Whoop5 (same Gen5 wire protocol, stream sync) per D-02 — mark with comment.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `DeviceKind::WhoopMg` variant + `DeviceCapabilities` | Rust (capabilities.rs) | — | All capabilities logic lives in Rust; Swift decodes the result |
| `DeviceType::Maverick` → `WhoopMg` mapping | Rust (protocol.rs) | — | `device_kind()` method pattern already established |
| MG BLE advertisement detection | Swift (CoreBluetoothBLETransport+Commands.swift) | — | GATT service UUID check happens at characteristic discovery time |
| "WHOOP MG" device label | Swift (DeviceCatalog.swift) | DeviceView.swift | `generationLabel` reads `wireProtocol`; needs to also read `deviceKind` |
| `device.capabilities` bridge dispatch | Rust (bridge/debug.rs) | — | Deserialises `DeviceKind` from `"WHOOP_MG"` string |

---

## Rust Layer: Existing Pattern (VERIFIED)

### capabilities.rs — current state

```rust
// Source: Rust/core/src/capabilities.rs (lines 1–52)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DeviceKind {
    Whoop4,
    Whoop5,
    HrMonitor,
    // WhoopMg → serialises as "WHOOP_MG" via SCREAMING_SNAKE_CASE
}

pub struct DeviceCapabilities {
    pub wire_protocol: String,       // "gen4" | "gen5" | "hr_monitor"
    pub historical_sync: String,     // "page_sequence" | "stream"
    pub battery_via_r22: bool,
    pub battery_via_event48: bool,
    pub battery_via_cmd26: bool,
    pub r22_realtime: bool,
}

impl DeviceCapabilities {
    pub fn for_kind(kind: DeviceKind) -> Self {
        match kind {
            DeviceKind::Whoop4 => Self { wire_protocol: "gen4", historical_sync: "page_sequence", ... },
            DeviceKind::Whoop5 => Self { wire_protocol: "gen5", historical_sync: "stream", ... },
            DeviceKind::HrMonitor => Self { wire_protocol: "gen5", historical_sync: "stream", battery_via_r22: false, ... },
        }
    }
}
```

**Serde rule confirmed:** `SCREAMING_SNAKE_CASE` → `WhoopMg` serialises as `"WHOOP_MG"`. [VERIFIED: Rust/core/src/capabilities.rs tests lines 91–120]

### protocol.rs — DeviceType enum and device_kind() [VERIFIED]

```rust
// Source: Rust/core/src/protocol.rs lines 95–170
pub enum DeviceType {
    Gen4,
    Maverick,   // WHOOP MG hardware (codename)
    Puffin,
    Goose,
    HrMonitor,
}

impl DeviceType {
    pub fn device_kind(self) -> DeviceKind {
        match self {
            DeviceType::Gen4 => DeviceKind::Whoop4,
            DeviceType::Maverick | DeviceType::Puffin | DeviceType::Goose => DeviceKind::Whoop5,
            DeviceType::HrMonitor => DeviceKind::HrMonitor,
        }
    }
}
```

`DeviceType::Maverick` is the Rust enum variant that represents the WHOOP MG hardware. It currently maps to `Whoop5` — that mapping needs to change to `WhoopMg`.

**Note:** `DeviceType` is a Rust-internal parse-time variant (used for protocol framing selection). Adding `WhoopMg` to `DeviceKind` does NOT require adding a new `DeviceType` variant — the change is: `Maverick => DeviceKind::WhoopMg` instead of `Maverick => DeviceKind::Whoop5`.

### bridge/debug.rs — device.capabilities dispatch [VERIFIED]

```rust
// Source: Rust/core/src/bridge/debug.rs lines 1166–1170
#[derive(Deserialize)]
struct DeviceCapabilitiesArgs {
    device_kind: DeviceKind,  // deserialised from "WHOOP_MG" string
}

fn device_capabilities_bridge(args: DeviceCapabilitiesArgs) -> GooseResult<serde_json::Value> {
    let caps = DeviceCapabilities::for_kind(args.device_kind);
    // returns caps as JSON
}
```

When Swift passes `"device_kind": "WHOOP_MG"`, serde deserialises to `DeviceKind::WhoopMg`, then `for_kind` returns the MG capabilities. This path already works once `WhoopMg` variant is added to the enum.

---

## Swift Layer: Existing Pattern (VERIFIED)

### How device kind is currently detected (CoreBluetoothBLETransport+Commands.swift lines 993–1014)

```swift
// Source: CoreBluetoothBLETransport+Commands.swift lines 993–1030
func processDiscoveredCharacteristics(_ characteristics: [CBCharacteristic], ...) {
    for characteristic in characteristics {
        if shouldUseCommandCharacteristic(characteristic) {
            commandCharacteristic = characteristic
            let detectedGeneration = WhoopGeneration.detect(from: characteristic)
            // Current: only "WHOOP4" or "WHOOP5"
            let deviceKindString = detectedGeneration == .gen4 ? "WHOOP4" : "WHOOP5"
            // ... calls bridge: device.capabilities with device_kind = deviceKindString
            // ... sets self.connectedCapabilities = caps
        }
    }
}
```

```swift
// Source: GooseBLETypes.swift lines 219–220
static func detect(from characteristic: CBCharacteristic) -> WhoopGeneration {
    characteristic.uuid.uuidString.lowercased().hasPrefix("61080002") ? .gen4 : .gen5
}
```

**Current detection logic:** Gen4 = command char UUID starts with `61080002`; everything else = Gen5. WHOOP MG (MAVERICK) uses `fd4b0002-cce1-4033-93ce-002d5875f58a` (command char, confirmed from `op0/p.java` UUID registry: the `fd4b` family is Maverick). It already falls into the `gen5` branch — so it connects and syncs, but is labelled "WHOOP 5.0" instead of "WHOOP MG".

### Service UUID families from APK (op0/p.java) [VERIFIED: re-assets/whoop-decompiled/sources/op0/p.java]

| Generation | Service UUID prefix | Command char UUID |
|------------|---------------------|-------------------|
| Gen4 (Harvard) | `61080001-8d6d-82b8-614a-1c8cb0f8dcc6` | `61080002-...` |
| Maverick (WHOOP MG) | `fd4b0001-cce1-4033-93ce-002d5875f58a` | `fd4b0002-...` |
| Puffin | `11500001-6215-11ee-8c99-0242ac120002` | `11500002-...` |
| Goose | `fd4b0001-...` (same as Maverick) | `fd4b0002-...` |
| Monument | `8a580001-2fe8-4796-9267-b87a2b0c8234` | `8a580002-...` |

**Critical finding:** GOOSE and MAVERICK share the identical `fd4b0001` service UUID family. [VERIFIED: op0/o.java — GOOSE is initialised with `p.r()` which is `WHOOP_MAVERICK_SERVICE_ID`]. This means BLE service UUID alone cannot distinguish MAVERICK (MG) from GOOSE (standard Whoop5). The disambiguation requires the BLE peripheral's **advertised local name** or **manufacturer data**.

### MG peripheral name evidence from APK [CITED: re-assets/whoop-decompiled/sources/com/whoop/design/atomic/molecule/card/upsell/t0.java]

The APK explicitly references "WHOOP MG" as a product name in user-facing UI strings. The `WhoopDeviceName` enum has `MAVERICK` as the codename that maps to the MG product. The Android app distinguishes GOOSE from MAVERICK by querying the server-side device profile after pairing (not from BLE advertisement alone).

**Implication for D-03:** The most reliable BLE-time MG identifier is the **peripheral's advertised local name** containing "MG" or "WHOOP MG". The command characteristic UUID prefix (`fd4b0002`) is shared with GOOSE and cannot distinguish them. [ASSUMED — peripheral name pattern; hardware capture would confirm]

---

## MG Capabilities vs Whoop5 [ASSUMED per D-02]

The APK confirms MG uses Gen5 wire protocol (CRC16, Gen5 framing). The `sm0/c.java` function maps MAVERICK ordinal → `"GEN_5_MG"` string (for garment compatibility filtering only — not a protocol difference). No evidence of MG-specific commands, sync protocol differences, or different characteristic UUIDs from Goose.

**Conclusion:** MG capabilities are identical to Whoop5 at the protocol level. Apply D-02: use Whoop5 capabilities for WhoopMg, annotate with `// candidate_MG_capabilities_unverified`.

```rust
// New arm to add to DeviceCapabilities::for_kind():
DeviceKind::WhoopMg => Self {
    // candidate_MG_capabilities_unverified — identical to Whoop5 pending hardware capture
    wire_protocol: "gen5".to_string(),
    historical_sync: "stream".to_string(),
    battery_via_r22: true,
    battery_via_event48: true,
    battery_via_cmd26: true,
    r22_realtime: true,
},
```

---

## Architecture Patterns

### Pattern 1: Adding DeviceKind variant (Rust)

Three files must change atomically to avoid non-exhaustive match compile errors:

1. `capabilities.rs` — add `WhoopMg` to `DeviceKind` enum + `for_kind` match arm + serde tests
2. `protocol.rs` — change `DeviceType::Maverick` mapping from `Whoop5` to `WhoopMg` in `device_kind()`
3. `bridge/debug.rs` — no change needed; `DeviceCapabilitiesArgs` uses `DeviceKind` which gains the variant automatically

**Exhaustive match check:** Run `cargo build` after adding the variant to surface all match sites. `grep -rn "DeviceKind::" Rust/core/src/` shows only two match sites: `capabilities.rs::for_kind()` and `protocol.rs::device_kind()`. Both must be updated.

### Pattern 2: Swift advertisement detection update

The detection upgrade must handle the GOOSE/MAVERICK UUID collision. Two options:

**Option A (preferred — peripheral name):** In `processDiscoveredCharacteristics`, after detecting Gen5 via `fd4b0002` prefix, check `peripheral.name?.contains("MG")` or `peripheral.name?.hasPrefix("WHOOP MG")`. If true: `deviceKindString = "WHOOP_MG"`.

```swift
// Proposed pattern — candidate_MG_advertisement_byte_unverified
let deviceKindString: String
if detectedGeneration == .gen4 {
    deviceKindString = "WHOOP4"
} else if peripheral.name?.lowercased().contains(" mg") == true
       || peripheral.name?.lowercased().hasPrefix("whoop mg") == true {
    deviceKindString = "WHOOP_MG"  // candidate_MG_advertisement_byte_unverified
} else {
    deviceKindString = "WHOOP5"
}
```

**Option B (fallback — not recommended):** Could attempt manufacturer data byte at position 0, but the APK does not expose this as a static constant.

### Pattern 3: Device label in DeviceCatalog + BLEState

`DeviceCatalog.generationLabel` currently returns `"gen4"` or `"gen5"`. This is used only for log messages — not the UI label in DeviceView.

The UI label comes from `bleState.connectedDeviceGeneration` (a `String?` set in `BLEState`). Check where this is set to update the "WHOOP 5.0" string to "WHOOP MG" for MG devices.

```swift
// DeviceCatalog.swift — add a human-readable label property:
var displayName: String {
    guard let caps = capabilities else { return "Unknown" }
    switch caps.wireProtocol {
    case .gen4: return "WHOOP 4.0"
    case .gen5: return "WHOOP 5.0"  // needs MG branch
    case .hrMonitor: return "HR Monitor"
    }
}
```

`WireProtocol` has no MG variant — the MG distinction must come from `DeviceCapabilities.deviceKind` (once that field is added to the struct) OR from a new `WireProtocol` case. The simpler path: add a `deviceKind` field to the Swift `DeviceCapabilities` struct decoded from the bridge response, then read it in `DeviceCatalog`.

**Simpler alternative:** Add a helper to `DeviceCatalog` that returns the display name by checking both `wireProtocol` and a `deviceKind` string field from the decoded JSON.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Serde serialisation of `WhoopMg` | Custom Display impl | `#[serde(rename_all = "SCREAMING_SNAKE_CASE")]` | Already used, produces `"WHOOP_MG"` automatically |
| MG capability definition | Custom struct constructor | `DeviceCapabilities::for_kind(DeviceKind::WhoopMg)` | Follows existing pattern exactly |
| BLE name parsing | Regex | `String.lowercased().contains(" mg")` | Simple prefix/substring check is sufficient |

---

## Common Pitfalls

### Pitfall 1: Non-exhaustive match after adding DeviceKind variant
**What goes wrong:** Adding `WhoopMg` to the enum without updating all match sites causes compile errors.
**Why it happens:** Rust requires exhaustive matches on non-`#[non_exhaustive]` enums.
**How to avoid:** Run `grep -rn "DeviceKind::" Rust/core/src/ Rust/core/tests/` before committing. Only two match sites in src/ (`for_kind`, `device_kind`) but tests also import and match on `DeviceKind`.
**Warning signs:** `cargo build` error: `non-exhaustive patterns: WhoopMg not covered`.

### Pitfall 2: GOOSE and MAVERICK share `fd4b0001` service UUID
**What goes wrong:** Detecting MG by service UUID alone misidentifies GOOSE (WHOOP 5.0 Goose variant) as MG.
**Why it happens:** Both GOOSE and MAVERICK use the same `fd4b0001` service UUID family (confirmed from `op0/o.java` static initialiser).
**How to avoid:** Use peripheral advertised name (`peripheral.name`) as the disambiguator; do not use service UUID prefix `fd4b`.
**Warning signs:** Regular WHOOP 5.0 Goose devices appear labelled "WHOOP MG".

### Pitfall 3: Swift DeviceCapabilities struct missing deviceKind field
**What goes wrong:** The Rust bridge returns `device_kind` in the JSON but the Swift `DeviceCapabilities: Decodable` struct has no corresponding field — the value is silently dropped.
**Why it happens:** `DeviceCapabilities` in `GooseBLETypes.swift` (line 315) decodes only the six protocol fields; `device_kind` is not among them.
**How to avoid:** Add `let deviceKind: String` (or a `DeviceKind` enum) to `DeviceCapabilities` in Swift, with `CodingKeys` entry `"device_kind"`. Alternatively, return `device_kind` from the bridge and have Swift use it for the label only, without adding it to `DeviceCapabilities`.
**Warning signs:** Device label stays "WHOOP 5.0" even after MG detection logic is correct.

### Pitfall 4: serde test for "WHOOP_MG" not added
**What goes wrong:** `device_kind_screaming_snake_case_serde` test in `capabilities.rs` does not cover the new variant.
**Why it happens:** Test was written when only three variants existed.
**How to avoid:** Add two new test assertions: `WhoopMg → "WHOOP_MG"` (serialise) and `"WHOOP_MG" → WhoopMg` (deserialise). The `device_kind_unknown_variant_rejected` test should continue to pass with no changes.

### Pitfall 5: Cargo fmt required before commit
**What goes wrong:** CI fails on `cargo fmt --check` if the new match arms aren't formatted.
**How to avoid:** Run `cargo fmt -- src/capabilities.rs src/protocol.rs` after editing (not `cargo fmt --all` to avoid spurious diffs).

---

## Code Examples

### Rust: Full capabilities.rs change

```rust
// Source: Rust/core/src/capabilities.rs — add variant and arm
pub enum DeviceKind {
    Whoop4,
    Whoop5,
    HrMonitor,
    WhoopMg,  // WHOOP MG (Maverick hardware)
}

// In for_kind():
DeviceKind::WhoopMg => Self {
    // candidate_MG_capabilities_unverified — MG uses Gen5 protocol per APK analysis;
    // capabilities assumed identical to Whoop5 pending real-device BLE capture.
    wire_protocol: "gen5".to_string(),
    historical_sync: "stream".to_string(),
    battery_via_r22: true,
    battery_via_event48: true,
    battery_via_cmd26: true,
    r22_realtime: true,
},
```

### Rust: protocol.rs device_kind() change

```rust
// Source: Rust/core/src/protocol.rs lines 166–170
pub fn device_kind(self) -> DeviceKind {
    match self {
        DeviceType::Gen4 => DeviceKind::Whoop4,
        DeviceType::Maverick => DeviceKind::WhoopMg,  // was: grouped with Puffin | Goose
        DeviceType::Puffin | DeviceType::Goose => DeviceKind::Whoop5,
        DeviceType::HrMonitor => DeviceKind::HrMonitor,
    }
}
```

### Rust: New serde tests

```rust
// Add to capabilities_tests in capabilities.rs:
#[test]
fn whoop_mg_capabilities() {
    let caps = DeviceCapabilities::for_kind(DeviceKind::WhoopMg);
    assert_eq!(caps.wire_protocol, "gen5");
    assert_eq!(caps.historical_sync, "stream");
}

#[test]
fn device_kind_whoop_mg_serde() {
    let json = serde_json::to_string(&DeviceKind::WhoopMg).unwrap();
    assert_eq!(json, r#""WHOOP_MG""#);
    let kind: DeviceKind = serde_json::from_str(r#""WHOOP_MG""#).unwrap();
    assert_eq!(kind, DeviceKind::WhoopMg);
}
```

### Rust: protocol.rs test for device_kind_maverick_is_whoop_mg

```rust
// Update existing test:
#[test]
fn device_kind_maverick_is_whoop_mg() {
    assert_eq!(DeviceType::Maverick.device_kind(), DeviceKind::WhoopMg);
}
```

### Swift: MG detection in CoreBluetoothBLETransport+Commands.swift

```swift
// Source pattern: CoreBluetoothBLETransport+Commands.swift — around line 1003
// Replace the two-branch deviceKindString assignment with three branches:
let deviceKindString: String
if detectedGeneration == .gen4 {
    deviceKindString = "WHOOP4"
} else if peripheral.name?.lowercased().contains(" mg") == true {
    // candidate_MG_advertisement_byte_unverified — identifies MG by peripheral name
    // containing " mg" (e.g. "WHOOP MG 1A2B"). Falls back to WHOOP5 if name absent.
    deviceKindString = "WHOOP_MG"
} else {
    deviceKindString = "WHOOP5"
}
```

### Swift: DeviceCapabilities — add deviceKind field

```swift
// Source: GooseBLETypes.swift — DeviceCapabilities struct (line 315)
struct DeviceCapabilities: Decodable {
    let wireProtocol: WireProtocol
    let historicalSync: HistoricalSyncKind
    let batteryViaR22: Bool
    let batteryViaEvent48: Bool
    let batteryViaCMD26: Bool
    let r22Realtime: Bool
    let deviceKind: String  // "WHOOP4" | "WHOOP5" | "WHOOP_MG" | "HR_MONITOR"

    enum CodingKeys: String, CodingKey {
        case wireProtocol = "wire_protocol"
        case historicalSync = "historical_sync"
        case batteryViaR22 = "battery_via_r22"
        case batteryViaEvent48 = "battery_via_event48"
        case batteryViaCMD26 = "battery_via_cmd26"
        case r22Realtime = "r22_realtime"
        case deviceKind = "device_kind"
    }
}
```

**Note:** The Rust bridge `DeviceCapabilities` JSON already includes `device_kind` because `DeviceCapabilities` struct in Rust does NOT include it — it is only in the `DeviceKind` enum. The bridge function returns `caps` not the kind. To surface `device_kind` in the JSON response, `device_capabilities_bridge` in `bridge/debug.rs` needs to add `device_kind` to the returned JSON object.

**Alternative (simpler):** Do not add `deviceKind` to `DeviceCapabilities` at all. Instead, store the `deviceKindString` used for the bridge call on the Swift side as a separate `connectedDeviceKind: String?` property, and use it in `DeviceCatalog` / the label.

### Swift: "WHOOP MG" label

The label for device view flows through `bleState.connectedDeviceGeneration`. Find where this is set (in the BLE transport or app model after `connectedCapabilities` is assigned) and add an MG branch:

```swift
// Wherever connectedDeviceGeneration is set (GooseAppModel or BLE transport):
// After connectedCapabilities is assigned:
if capabilities.deviceKind == "WHOOP_MG" {
    bleState.connectedDeviceGeneration = "WHOOP MG"
} else if capabilities.wireProtocol == .gen4 {
    bleState.connectedDeviceGeneration = "WHOOP 4.0"
} else {
    bleState.connectedDeviceGeneration = "WHOOP 5.0"
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| MG missing, misidentified as Whoop5 | Add `WhoopMg` variant | MG sync no longer uses wrong capabilities |
| 2-way generation detection (gen4/gen5) | 3-way (gen4/gen5/mg) via peripheral name | Correct labelling; capabilities separation |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | WHOOP MG peripheral advertised name contains " mg" or "WHOOP MG" substring | Swift detection pattern | MG devices would not be detected; fall back to Whoop5 (D-05 fallback acceptable) |
| A2 | MG capabilities are identical to Whoop5 at protocol level | MG Capabilities section | Wrong battery/sync flags for MG — low risk since Whoop5 capabilities already work for MG users today |
| A3 | MAVERICK (Rust `DeviceType`) is the internal code name for the WHOOP MG product | protocol.rs section | Would cause wrong mapping; LOW risk — APK's `WhoopDeviceName.MAVERICK` + `sm0/c.java` `"GEN_5_MG"` → MAVERICK ordinal confirms this |

---

## Open Questions (RESOLVED)

1. **Does the WHOOP MG peripheral name reliably contain "MG" or "WHOOP MG"?**
   - RESOLVED: Apply D-03 (best-effort from APK). Use `.lowercased().contains(" mg")` on peripheral name, annotated `candidate_MG_advertisement_byte_unverified`. Hardware-gated validation acceptable per D-05.

2. **Should `device_kind` be added to `DeviceCapabilities` Rust struct or returned separately in bridge JSON?**
   - RESOLVED: Simpler path — add `device_kind` to the bridge JSON response in `device_capabilities_bridge` by constructing the JSON manually (include the string alongside the existing DeviceCapabilities fields), without modifying the `DeviceCapabilities` Rust struct. Plan 95-02 Task 1 implements this.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust built-in (`cargo test`) |
| Config file | `Rust/core/Cargo.toml` |
| Quick run command | `cargo test -p goose-core -- capabilities` |
| Full suite command | `cargo test --locked` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MG-01 | `WhoopMg` serialises as `"WHOOP_MG"` | unit | `cargo test -p goose-core -- whoop_mg` | ❌ Wave 0 |
| MG-01 | `DeviceType::Maverick.device_kind()` returns `WhoopMg` | unit | `cargo test -p goose-core -- device_kind_maverick` | ❌ Wave 0 (update existing) |
| MG-01 | MG capabilities have `wire_protocol = "gen5"` | unit | `cargo test -p goose-core -- whoop_mg_capabilities` | ❌ Wave 0 |
| MG-02 | No regression — Whoop4/Whoop5 `device_kind()` unchanged | unit | `cargo test -p goose-core -- device_kind` | ✅ existing tests |

### Wave 0 Gaps
- [ ] Add `whoop_mg_capabilities` test in `Rust/core/src/capabilities.rs`
- [ ] Add `device_kind_whoop_mg_serde` test in `Rust/core/src/capabilities.rs`
- [ ] Update `device_kind_maverick_is_whoop5` → `device_kind_maverick_is_whoop_mg` in `Rust/core/src/protocol.rs`

---

## Security Domain

No authentication, cryptography, or input validation concerns introduced by this phase. The `DeviceKind` enum is deserialized from a string the Swift side itself constructed — no external attacker input path.

---

## Environment Availability

This phase is code/config-only. No external tools required beyond the existing Rust toolchain and Xcode.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain | `cargo test --locked` | ✓ | MSRV 1.96 | — |
| Xcode | Swift compilation | ✓ | 26.5 | — |

---

## Project Constraints (from CLAUDE.md)

- Planning docs in English (commit_docs: true — commit RESEARCH.md)
- No AI attribution in commits
- Rust edition 2024, MSRV 1.96 (not 1.94 as in stale CLAUDE.md)
- Swift: no external dependencies — SwiftUI + Foundation only
- RE provenance must NOT appear in RESEARCH.md, commits, or code — use neutral language

---

## Sources

### Primary (HIGH confidence)
- `Rust/core/src/capabilities.rs` — DeviceKind enum, for_kind(), serde tests (verified in session)
- `Rust/core/src/protocol.rs` lines 95–170 — DeviceType, device_kind() (verified in session)
- `Rust/core/src/bridge/debug.rs` lines 1166–1170 — device.capabilities bridge (verified in session)
- `GooseSwift/GooseBLETypes.swift` lines 207–340 — WhoopGeneration, DeviceCapabilities (verified in session)
- `GooseSwift/CoreBluetoothBLETransport+Commands.swift` lines 993–1030 — detection flow (verified in session)

### Secondary (MEDIUM confidence)
- `re-assets/whoop-decompiled/sources/op0/o.java` — StrapGeneration enum, UUID assignments (APK decompile)
- `re-assets/whoop-decompiled/sources/op0/p.java` — UUID registry (APK decompile)
- `re-assets/whoop-decompiled/sources/sm0/c.java` — `"GEN_5_MG"` for MAVERICK ordinal (APK decompile)
- `re-assets/whoop-decompiled/sources/com/whoop/connectivityCore/firmware/models/WhoopDeviceName.java` — MAVERICK codename (APK decompile)

### Tertiary (LOW confidence — ASSUMED)
- Peripheral advertised name containing "WHOOP MG" — inferred from marketing copy, not hardware capture

## Metadata

**Confidence breakdown:**
- Rust changes (MG-01): HIGH — exact pattern from existing code; two files, known match sites
- Swift detection (MG-02): MEDIUM — service UUID confirmed, name disambiguation is best-effort assumption
- MG capabilities: MEDIUM — Gen5 protocol confirmed from APK; specific flag values assumed identical to Whoop5

**Research date:** 2026-06-19
**Valid until:** 90 days (Rust/Swift codebase; no external registry dependency)
