# Phase 115: Feature Flag Discovery (GET_FF_VALUE) — Research

**Researched:** 2026-06-23
**Domain:** Swift BLE command dispatch + Rust bridge write path
**Confidence:** HIGH

---

## Summary

Phase 115 adds GET_FF_VALUE (cmd 0x80 = 128) post-handshake discovery. The Rust side is
entirely complete from Phase 113: `device_feature_flags` table exists (schema v24),
`capabilities.upsert_feature_flags` and `capabilities.get_feature_flags` are both wired in
`BRIDGE_METHODS` and dispatched through `bridge/capabilities.rs`, and a round-trip test suite
exists in `Rust/core/tests/feature_flags_bridge_tests.rs`. Work in this phase is **Swift-only**.

Three Swift changes are needed:

1. **`DeviceCapabilities` struct** (`GooseBLETypes.swift:315`) — add `feature_flags: [UInt8: UInt8]`
   field with a default of `[:]`; it does not exist today.
2. **Send GET_FF_VALUE after handshake** — a new `sendGetFeatureFlagValue` function in
   `CoreBluetoothBLETransport+Commands.swift` (or a new `+FeatureFlags.swift` extension), called
   from the same site as `sendClientHelloIfNeeded` / `sendGetBodyLocationAndStatus`. Needs a
   3-second `DispatchWorkItem` timeout fallback, matching the existing clock/alarm timeout
   pattern exactly.
3. **Debug UI** (`MoreDebugViews.swift` Status tab, `MoreInfoViews.swift` About section) — add
   `MoreInfoRow` entries for feature flags in the existing "Runtime" section of the About/Info
   view, following the `MoreInfoRow(title:value:systemImage:status:)` pattern.

**Primary recommendation:** Send GET_FF_VALUE immediately after `sendGetBodyLocationAndStatus()`
in `processDiscoveredCharacteristics` (line 1120), using the same `DispatchWorkItem` + 3s
`asyncAfter` timeout already in use for clock and alarm commands. Write flags to SQLite via
`capabilities.upsert_feature_flags`; update `connectedCapabilities` on the main thread.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** GET_FF_VALUE fires immediately after GET_HELLO handshake completes, on every BLE
  reconnect. 3-second timeout, then fallback to empty feature_flags. Flags refresh with firmware
  updates.
- **D-02:** On 3s timeout (or no response), `feature_flags: [:]` (empty dictionary) for ALL
  DeviceKind. No response = no flags claimed. Device uses existing DeviceKind-derived
  capabilities. Conservative, avoids false positives.
- **D-03:** Add feature flags to the existing device info section in Debug tab. Format: list of
  `"0x%02X → 0x%02X"` hex pairs. If `feature_flags` is empty, show `"None discovered"`. Minimal
  UI change — no new section header.

### Claude's Discretion
- Write to SQLite: via `capabilities.upsert_feature_flags` bridge call (preferred — keeps Rust
  as single source of truth) vs. direct JSON insert. Researcher recommends bridge call.
- `DeviceCapabilities` struct field presence: researcher confirms it does NOT exist yet.
- Send logic: researcher confirms it is only defined in the debug menu definition, not yet wired
  into the auto handshake path.

### Deferred Ideas (OUT OF SCOPE)
- Semantic naming of flag indices.
- Using feature flags to gate UI features.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID    | Description | Research Support |
|-------|-------------|------------------|
| FF-01 | Send GET_FF_VALUE (cmd 0x80) after GET_HELLO on every reconnect; 3s timeout then fallback to empty flags | Handshake send site confirmed at `processDiscoveredCharacteristics` line 1119–1120; timeout pattern from clock/alarm commands |
| FF-02 | Parse response into `DeviceCapabilities.feature_flags: [UInt8: UInt8]`; store to `device_feature_flags` SQLite table; expose in Debug tab device info section | `DeviceCapabilities` struct confirmed missing `feature_flags`; `capabilities.upsert_feature_flags` bridge confirmed present; `MoreInfoViews.swift` "Runtime" section confirmed as insertion point |
| FF-03 | (COMPLETE — Phase 113) Schema v24 + `capabilities.get_feature_flags` bridge method | Already wired; no Rust work needed |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Send GET_FF_VALUE command | BLE Transport (Swift) | — | Commands are dispatched from `CoreBluetoothBLETransport` extension files |
| Parse response bytes | BLE Transport (Swift) | — | All GATT notification responses are handled in `onNotification` / `fanOutNotification` pipeline |
| Persist flags to SQLite | Rust bridge | — | `capabilities.upsert_feature_flags` already exists; Swift calls it with `device_id` + flag array |
| Expose flags in `connectedCapabilities` | BLE Transport (Swift) | GooseAppModel | `connectedCapabilities` is set on main thread after bridge write, same as existing capability resolution |
| Debug UI display | SwiftUI (MoreInfoViews.swift) | — | `MoreInfoRow` rows in "Runtime" section |

---

## Research Area Findings

### 1. `DeviceCapabilities` struct — `GooseBLETypes.swift:315`

**Status: `feature_flags` field is ABSENT. Must be added.**

Current fields (verified by reading lines 315–335):
```swift
struct DeviceCapabilities: Decodable {
  let wireProtocol: WireProtocol
  let historicalSync: HistoricalSyncKind
  let batteryViaR22: Bool
  let batteryViaEvent48: Bool
  let batteryViaCMD26: Bool
  let r22Realtime: Bool
  let deviceKind: String
  // CodingKeys follow ...
}
```

`feature_flags: [UInt8: UInt8]` does not exist. It must be added as a property with a default
value so the existing hardcoded fallback initializations in `Commands.swift:1047` and `1055`
still compile without passing `feature_flags:`. Two options:

**Option A — Default parameter in memberwise init**: Add `var feature_flags: [UInt8: UInt8] = [:]`
(as a `var` with default). `Decodable` structs do not auto-synthesize defaults; a custom
`init(from:)` or a separate non-`Decodable` init is needed.

**Option B — `init(wireProtocol:...:featureFlags:)` factory**: Keep all existing `let` fields,
add `let featureFlags: [UInt8: UInt8]`, update the two fallback `DeviceCapabilities(...)` call
sites in `Commands.swift` to pass `featureFlags: [:]`.

**Recommended: Option B.** It is the least invasive change to the struct's `Decodable`
conformance. Add `featureFlags: [UInt8: UInt8]` as a `let` with a custom `CodingKeys` case
`featureFlags = "feature_flags"`, with a custom `init(from:)` that uses `decodeIfPresent` with
default `[:]`. Both fallback initialisers at lines 1047 and 1055 must be updated to pass
`featureFlags: [:]`.

[VERIFIED: direct source read — GooseBLETypes.swift lines 315–335]

---

### 2. Handshake sequence and GET_FF_VALUE insertion point

**Status: GET_FF_VALUE is NOT in the auto handshake path. Only defined in the debug menu.**

The auto-connect handshake fires from `processDiscoveredCharacteristics` (Commands.swift:993)
when a `commandCharacteristic` is found:

```
Line 1115: if commandCharacteristic != nil {
Line 1117:   bondingManager.transition(to: .completed(deviceID: peripheralID))
Line 1119:   sendClientHelloIfNeeded(reason: ...)      // CLIENT_HELLO (auth frame)
Line 1120:   sendGetBodyLocationAndStatus()             // cmd 54, fire-and-forget
Line 1121:   scheduleDebugSkinTemperatureCommandIfNeeded(...)
Line 1122:   scheduleAutomaticHistoricalSyncIfNeeded()
Line 1123:   scheduleAutomaticPhysiologyCaptureIfNeeded()
```

`sendClientHello` (UserActions.swift:179) writes the `GooseHello.clientHelloFrame` to GATT.
The WHOOP replies with a SERVER_HELLO notification. The connection state transitions to "ready"
via the `bondingManager.onBondingStateChange` callback (line 1066 in transport init / line 306
in GooseAppModel init override). The `connectionState == "ready"` gate is set **before** line
1119 is reached, because `bondingManager.transition(to: .completed(...))` at line 1117 fires the
callback synchronously.

**GET_FF_VALUE insertion point: line 1120.5 — after `sendGetBodyLocationAndStatus()`, before
the historical sync schedule.**

The existing debug command definition for GET_FF_VALUE (Commands.swift line 897–907):
```
commandNumber: 128, family: "config", risk: "keyed read"
detail: "APK parser nh0.p. Accepts a 32-byte key; app prefixes revision 01."
requiresPayloadHex: true
```

This confirms GET_FF_VALUE is cmd 128 (0x80). However, this is the **debug menu** definition
for manually sending with a 32-byte key payload. The **automatic** post-handshake version
described in CONTEXT.md (D-01) sends cmd 0x80 with no key payload (query all flags). The
protocol distinction must be verified — see Open Questions.

`sendGetBodyLocationAndStatus()` (cmd 54) is a good model: fire-and-forget after `connectionState == "ready"`, no pending command tracking needed at the caller — just a BLE write.

[VERIFIED: direct source read — CoreBluetoothBLETransport+Commands.swift lines 1115–1123, CoreBluetoothBLETransport+UserActions.swift lines 175–227]

---

### 3. GET_FF_VALUE usage in `HistoricalCommands.swift` line 197

**Status: This is the DEBUG MENU payload builder, NOT an automatic send.**

Lines 197–208 implement `debugCommandPayload(for:payloadHex:)`:
```swift
if definition.id == "get_device_config_value" || definition.id == "get_feature_flag_value" {
  guard let data = Self.normalizedHexData(payloadHex) else { return nil }
  if data.count == 32 { return [1] + Array(data) }  // prefix revision byte 0x01
  if data.count == 33 { return Array(data) }
  return nil
}
```

This is the debug-only keyed read path: the user provides a 32-byte key hex, the app prefixes
revision byte `0x01`. This is **different** from the post-handshake automatic discovery use case.

The automatic GET_FF_VALUE (D-01) likely sends a zero-byte payload or a fixed "enumerate all"
payload. This must be confirmed from protocol observation. See Open Questions.

[VERIFIED: direct source read — CoreBluetoothBLETransport+HistoricalCommands.swift lines 193–221]

---

### 4. Rust `start_feature_flag_key_exchange` / `send_next_feature_flag` (commands.rs:900,907)

**Status: These are DIFFERENT commands, not GET_FF_VALUE.**

- `start_feature_flag_key_exchange` = cmd 117
- `send_next_feature_flag` = cmd 118
- `get_feature_flag_value` = cmd 128 (0x80)

Commands 117/118 are a write/set protocol (key exchange). Cmd 128 is the read query.
Phase 115 only implements cmd 128 (read). Commands 117/118 are out of scope.

[VERIFIED: direct source read — Rust/core/src/commands.rs lines 893–927]

---

### 5. Bridge — `capabilities.upsert_feature_flags` in `BRIDGE_METHODS`

**Status: FULLY WIRED from Phase 113. No Rust changes needed.**

From `bridge/mod.rs` (grep confirmed):
```
Line 79: "capabilities.get_feature_flags",
Line 80: "capabilities.upsert_feature_flags",
Line 533: if method.starts_with("capabilities.") {
Line 534:     return capabilities::dispatch_capabilities(&request);
```

`bridge/capabilities.rs` implements both methods. The upsert signature (verified by reading the
full file):

```rust
// Called as:
// method: "capabilities.upsert_feature_flags"
// args: { database_path: String, device_id: String, flags: [{index: i64, value: i64}] }
// Returns: { upserted: i64 }
```

Swift must pass:
- `database_path`: `HealthDataStore.defaultDatabasePath()`
- `device_id`: `connectedPeripheralUUID ?? ""` (the CBPeripheral.identifier.uuidString set in
  `connectedPeripheralUUID` at CentralDelegate.swift line 219)
- `flags`: array of `{index: Int, value: Int}` decoded from the GATT response bytes

Round-trip tests exist in `Rust/core/tests/feature_flags_bridge_tests.rs` — all passing (Phase 113).

[VERIFIED: direct source read — Rust/core/src/bridge/mod.rs, Rust/core/src/bridge/capabilities.rs]

---

### 6. Debug tab view — insertion point for feature flags display

**Status: `MoreInfoViews.swift` "Runtime" Section is the correct insertion point.**

The device info is in `MoreInfoViews.swift` (not `MoreDebugViews.swift`), in the `About`
navigation view. The "Runtime" section (lines 120–123) currently shows:

```swift
Section("Runtime") {
  MoreInfoRow(title: "Device", value: model.ble.activeDeviceName, ...)
  MoreInfoRow(title: "Hello", value: model.helloSummary, ...)
}
```

This is the correct section for adding feature flags (D-03). The `MoreInfoRow` component takes
`title: String, value: String, systemImage: String, status: MoreInfoRowStatus`.

For a multi-flag display, a `ForEach` over `connectedCapabilities?.featureFlags` pairs or a
computed string is appropriate. D-03 specifies a hex-pair list; using a single `MoreInfoRow`
with a joined string value (e.g., `"0x00 → 0x01, 0x02 → 0x01"`) or separate rows per flag
are both viable. A single row with a joined string is simpler and avoids layout churn.

`model.ble.connectedCapabilities` is accessible from the `About` view via
`@Environment(GooseAppModel.self)` → `model.ble.connectedCapabilities`.

[VERIFIED: direct source read — GooseSwift/MoreInfoViews.swift lines 115–137]

---

### 7. BLE command response — how GET_FF_VALUE response bytes arrive

**Status: Via `onNotification` → `GooseAppModel.handleNotification` pipeline.**

GATT notifications arrive at `peripheral(_:didUpdateValueFor:error:)` in
`CoreBluetoothBLETransport+PeripheralDelegate.swift`, which calls `fanOutNotification` →
`onNotification?`. In `GooseAppModel.init` (line 275):

```swift
ble.onNotification = { [weak self] event in
  Task { @MainActor [weak self] in
    self?.handleNotification(event)
  }
}
```

The GET_FF_VALUE response will arrive as a `GooseNotificationEvent` with
`characteristicUUID` matching the command characteristic. The response handler in
`handleNotification` must extract the response command byte, check it is the GET_FF_VALUE
response opcode, parse index/value pairs from the payload, and call the bridge write.

The existing pattern for `sendGetBodyLocationAndStatus()` (cmd 54) has its response handled in
`CoreBluetoothBLETransport+HistoricalHandlers.swift:handleBodyLocationValue`. GET_FF_VALUE
response handling should follow the same pattern: a new `handleFeatureFlagResponse` function
that checks the command byte and parses payload.

**Key detail:** The 3-second timeout `DispatchWorkItem` must be cancelled on successful response
receipt, exactly like `clockCommandTimeoutWorkItem?.cancel()` in the clock command flow
(Commands.swift lines 309–321).

[VERIFIED: direct source read — CoreBluetoothBLETransport+PeripheralDelegate.swift lines 226–311, GooseAppModel.swift lines 275–279]

---

## Architecture Patterns

### Existing Timeout Pattern (Clock Command — canonical reference)

```swift
// In CoreBluetoothBLETransport+Commands.swift
func scheduleClockCommandTimeout(kind: ClockCommandKind, sequence: UInt8) {
  clockCommandTimeoutWorkItem?.cancel()
  let workItem = DispatchWorkItem { [weak self] in
    guard let self,
          let pending = self.pendingClockCommand,
          pending.kind.commandNumber == kind.commandNumber,
          pending.sequence == sequence else { return }
    self.failClockCommand("\(kind.name) timed out ...")
  }
  clockCommandTimeoutWorkItem = workItem
  DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: workItem)
}
```

GET_FF_VALUE timeout uses 3s (D-01) instead of 8s. The fallback on timeout sets
`connectedCapabilities.featureFlags = [:]` (already the default; timeout = no-op if
`DeviceCapabilities` defaults to empty).

### Existing Fire-and-Forget Pattern (Body Location — cmd 54)

`sendGetBodyLocationAndStatus()` is written directly to GATT without a pending-command tracking
struct. GET_FF_VALUE can follow the same pattern — only a timeout `DispatchWorkItem` is needed,
not a `Pending*Command` struct (no retry, no UI status string dependency).

### Bridge Call Pattern (historicalDirectWriteBridge)

Existing bridge calls in the transport layer use a dedicated bridge instance
(`historicalDirectWriteBridge`) on `historicalWriteQueue.async`. GET_FF_VALUE should follow the
same pattern to avoid blocking the main thread:

```swift
historicalWriteQueue.async { [weak self] in
  guard let self else { return }
  let result = try? self.historicalDirectWriteBridge.request(
    method: "capabilities.upsert_feature_flags",
    args: [
      "database_path": HealthDataStore.defaultDatabasePath(),
      "device_id": self.connectedPeripheralUUID ?? "",
      "flags": flagArray   // [[String: Any]] with "index" and "value" keys
    ]
  )
  // result["upserted"] confirms count
}
```

[ASSUMED] The `historicalDirectWriteBridge` is available in the transport for this call. It is
used for `device.capabilities` already (Commands.swift line 1021). [VERIFIED: Commands.swift
line 1021 shows `self.historicalDirectWriteBridge.request(method: "device.capabilities", ...)`]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite flag persistence | Custom SQL in Swift | `capabilities.upsert_feature_flags` bridge | Already implemented, tested, conflict-safe (upsert) |
| Timeout mechanism | Timer class | `DispatchWorkItem` + `asyncAfter` | Already the established pattern in this file |
| Response packet parsing | Custom byte scanner | Rust `protocol.parse_frame_hex` or direct Swift byte indexing | Keep consistent with how other responses are parsed |

---

## Common Pitfalls

### Pitfall 1: Calling `historicalDirectWriteBridge` from main thread

**What goes wrong:** Bridge calls block the calling thread. `historicalDirectWriteBridge` is used
on `historicalWriteQueue`. Calling from `@MainActor` freezes the UI.

**How to avoid:** Always dispatch bridge writes to `historicalWriteQueue.async { ... }`.

### Pitfall 2: `device_id` is empty string when peripheral disconnects mid-response

**What goes wrong:** `connectedPeripheralUUID` is set to `nil` on disconnect
(CentralDelegate.swift line 241, 315). If the response arrives just after disconnect,
`connectedPeripheralUUID ?? ""` passes an empty string to the bridge.

**How to avoid:** Capture `connectedPeripheralUUID` at send time into a local constant, pass
that into the bridge closure. Guard `!capturedDeviceID.isEmpty` before the bridge write.

### Pitfall 3: `DeviceCapabilities` fallback initialisers don't compile after adding `featureFlags`

**What goes wrong:** The two hardcoded `DeviceCapabilities(...)` calls at Commands.swift lines
1047 and 1055 will fail to compile if `featureFlags` is added as a non-optional `let` without
a default.

**How to avoid:** Add `featureFlags: [UInt8: UInt8] = [:]` as the last parameter in both
fallback call sites, OR implement a `Decodable` `init(from:)` that uses `decodeIfPresent`
with default `[:]` so the fallback initialisers keep working with an explicit `featureFlags: [:]`
parameter.

### Pitfall 4: Timeout fires after successful response

**What goes wrong:** If the response arrives quickly and the timeout `DispatchWorkItem` fires
afterward, `featureFlags` gets reset to `[:]`.

**How to avoid:** Follow the clock command pattern: cancel the `DispatchWorkItem` in the
response handler before updating `connectedCapabilities`. Use an `isCancelled` guard in the
timeout closure.

### Pitfall 5: Response handler matches wrong command byte

**What goes wrong:** `onNotification` receives ALL notifications. Without checking the response
command byte, the handler may process unrelated packets.

**How to avoid:** Check the parsed response opcode/command byte against the expected GET_FF_VALUE
response code before processing. Log and return on mismatch.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Swift XCTest (GooseSwiftTests target), Rust cargo test |
| Config file | GooseSwift.xcodeproj (Swift), Rust/core/Cargo.toml (Rust) |
| Quick run command (Swift) | `xcodebuild test -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO 2>&1 \| tail -20` |
| Full suite command (Rust) | `cd Rust/core && cargo test --locked 2>&1 \| tail -20` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FF-01 | GET_FF_VALUE sent after handshake; timeout fires at 3s | unit (Swift) | `xcodebuild test ... -only-testing GooseSwiftTests/FeatureFlagDiscoveryTests` | No — Wave 0 gap |
| FF-02 | Flags parsed, written via bridge, exposed in `connectedCapabilities` | unit (Rust round-trip already exists) | `cd Rust/core && cargo test feature_flags` | Yes — `feature_flags_bridge_tests.rs` |
| FF-02 | Empty flags shown as "None discovered" in Debug UI | manual / XCTest snapshot | manual | No |

### Wave 0 Gaps

- [ ] `GooseSwiftTests/FeatureFlagDiscoveryTests.swift` — unit test for timeout fallback and
  flag parsing; covers FF-01. Needs a mock `CoreBluetoothBLETransport` or stub bridge.
- Rust round-trip tests already exist in `Rust/core/tests/feature_flags_bridge_tests.rs`.

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Parse response bytes with explicit bounds checks before indexing |
| V4 Access Control | no | Local BLE only, no network boundary |
| V6 Cryptography | no | Flag values are UInt8 identifiers, not secrets |

No new network surface introduced. Feature flag values should be treated as untrusted device
data — validate that index and value bytes are within `UInt8` range before casting.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GET_FF_VALUE automatic post-handshake payload is zero-byte or "enumerate all" (not keyed like the debug menu path) | Research Area 2 | Wrong payload format → device doesn't respond; timeout fires; flags stay empty |
| A2 | The WHOOP responds to cmd 0x80 with a sequence of flag index/value pairs in the notification payload | Research Area 7 | Different response format → parse logic wrong; need protocol observation on device |
| A3 | `historicalDirectWriteBridge` is accessible in the transport extension file where GET_FF_VALUE send is implemented | Architecture Patterns | May need a separate bridge instance if it is private — check access level |

---

## Open Questions

1. **What is the exact GET_FF_VALUE (cmd 0x80) request payload for auto-discovery?**
   - What we know: Debug menu path uses a 32-byte key + revision byte 0x01 prefix.
   - What's unclear: The automatic post-handshake variant likely sends a different payload
     (zero bytes? a fixed "query all" key?). The Android APK decompile (`nh0.p` parser reference
     in the debug command detail) may contain the answer.
   - Recommendation: Check `re-assets/whoop-decompiled/` for the `nh0` class and the GET_FF_VALUE
     (0x80) handler to determine the correct request payload for auto-discovery mode.

2. **What is the response format for GET_FF_VALUE?**
   - What we know: The response arrives as a GATT notification. Flag data is index/value pairs.
   - What's unclear: Byte layout of the notification payload (offset of index, value, count,
     terminator if any).
   - Recommendation: Protocol observation on a real device, or decompile `nh0.p` response parser.

3. **Should GET_FF_VALUE fire for Gen4 devices too?**
   - What we know: D-02 says fallback is `[:]` for ALL DeviceKind.
   - What's unclear: Gen4 (WHOOP 4) firmware may not implement cmd 0x80; sending it would be
     harmless (timeout fires) but adds 3s latency to every Gen4 reconnect.
   - Recommendation: Send to all device kinds; the 3s timeout is the universal fallback.

---

## Environment Availability

Step 2.6: SKIPPED — no external dependencies beyond Swift/Xcode/Rust toolchain already
confirmed present in the project environment.

---

## Sources

### Primary (HIGH confidence)
- Direct source reads: `GooseBLETypes.swift:315–335`, `CoreBluetoothBLETransport+Commands.swift:897–1127`, `CoreBluetoothBLETransport+UserActions.swift:165–227`, `CoreBluetoothBLETransport+HistoricalCommands.swift:193–221`, `Rust/core/src/bridge/capabilities.rs` (full), `Rust/core/src/bridge/mod.rs` (grep), `MoreInfoViews.swift:115–137`, `MoreDebugViews.swift:1–113`, `GooseAppModel.swift:275–309`, `CoreBluetoothBLETransport+PeripheralDelegate.swift:226–311`

### Secondary (MEDIUM confidence)
- `Rust/core/src/commands.rs:893–927` — confirmed cmd numbers for feature flag family
- `Rust/core/tests/feature_flags_bridge_tests.rs` — confirmed round-trip tests exist and pass

### Tertiary (LOW confidence)
- A1, A2, A3 in Assumptions Log — payload format and response layout not confirmed from source

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all relevant files read directly
- Architecture: HIGH — insertion point, bridge call, timeout pattern all confirmed from source
- Payload/response format: LOW — protocol observation or APK decompile required

**Research date:** 2026-06-23
**Valid until:** 2026-07-23 (stable codebase; Rust bridge is locked)
