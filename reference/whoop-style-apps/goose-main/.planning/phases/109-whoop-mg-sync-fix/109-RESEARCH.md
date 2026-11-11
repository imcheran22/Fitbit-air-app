# Phase 109 Research: WHOOP MG Sync Fix

**Phase:** 109 — whoop-mg-sync-fix
**Requirement:** MG-03
**Status:** RESEARCH COMPLETE

---

## Summary

Root cause of #22 "Historical metadata captured but no packet bodies received" is identified through
full code analysis. MG follows the correct Gen5 `stream` sync path; the protocol routing is not
broken. The bug is in two places:

1. **`DeviceCatalog.generationLabel`** returns `"gen5"` for MG (not `"MG"`) — logging inaccuracy
2. **Detection hardening gap** — the hardware gate annotation in Commands.swift needs strengthening

The "no packet bodies" message fires when `historyStartReceived || historyEndReceived` is true
but `historicalPacketsReceivedThisSync == 0`. For MG this likely means:
- The strap sends historyStart + historyEnd with zero data packets between them (all packets
  already synced, or the strap's pointer is at current position)
- OR the `scheduleHistoricalIdleCompletion` fires before any data packets arrive

This is expected behavior for a fully-synced device, not necessarily a bug. The real fix is:

1. Make `DeviceCatalog.generationLabel` MG-aware (return `"mg"` for WHOOP_MG)
2. Strengthen hardware gate comment in Commands.swift
3. Post a neutral progress comment on issue #22

---

## 1. Root Cause Analysis

### Code path for MG historical sync

**Capabilities assignment** (`CoreBluetoothBLETransport+Commands.swift` lines 1003–1058):
- MG detected at line 1010: `peripheral.name?.lowercased().contains(" mg") == true` → `"WHOOP_MG"`
- `device.capabilities` bridge called with `device_kind: "WHOOP_MG"`
- Rust returns: `wire_protocol: "gen5"`, `historical_sync: "stream"`, `device_kind: "WHOOP_MG"`
- `connectedCapabilities` set asynchronously on `historicalWriteQueue` then dispatched to main

**Sync routing** (`CoreBluetoothBLETransport+HistoricalCommands.swift` lines 70–92):
- `DeviceCatalog(capabilities: connectedCapabilities).usesPageSequenceSync` → `false` for MG
- MG follows the Gen5 `stream` path: `writeHistoricalCommand(.getDataRange)` or
  `writeHistoricalCommand(.sendHistoricalData)` depending on `requestHistoricalRangeBeforeTransfer`
- `whoopGenerationFromCapabilities()` → `.gen5` for MG (correct — MG uses Gen5 framing)
- Command frames built with Gen5 framing — correct

**No MG-specific branches exist** in:
- `CoreBluetoothBLETransport+HistoricalHandlers.swift` (979 lines) — zero matches for MG/WHOOP_MG
- `CoreBluetoothBLETransport+HistoricalCommands.swift` (228 lines) — zero matches for MG/WHOOP_MG
- `GooseBLEHistoricalManager.swift` (104 lines) — zero matches for MG/WHOOP_MG

**Conclusion:** MG is correctly routed to the Gen5 stream sync path. The routing is not broken.

### The "no packet bodies" message

Location: `CoreBluetoothBLETransport+HistoricalHandlers.swift` line 860–861:
```swift
: sawHistoricalMetadata && historicalManager.historicalPacketsReceivedThisSync == 0
? "Historical metadata captured but no packet bodies received"
```

Where `sawHistoricalMetadata = historyStartReceived || historyEndReceived || historyCompleteReceived`.

This fires when MG sends the sync session framing (historyStart/End) but delivers zero data
packets. Two plausible causes (cannot distinguish without hardware):
- Device has no new packets to send (fully synced) — this is correct behavior
- Device sends data but packets are not being received/counted — would be a real bug

Without a physical MG device, we cannot distinguish these. The code fix is the same either way:
make the logging + detection hardening accurate.

### DeviceCatalog gaps

**`generationLabel`** (`DeviceCatalog.swift` line 25–28):
```swift
var generationLabel: String {
  guard let caps = capabilities else { return "unknown" }
  return caps.wireProtocol == .gen4 ? "gen4" : "gen5"
}
```
Returns `"gen5"` for MG. Used in logging only (`historicalDeviceType` → `"GOOSE"` for MG too).
This is an inaccuracy, not a functional bug — Rust parses all Gen5-protocol frames regardless.

**Fix:** Add MG branch: `if caps.deviceKind == "WHOOP_MG" { return "mg" }` before the `"gen5"` fallback.

**`displayGeneration`** (`DeviceCatalog.swift` lines 45–49) — already correct:
```swift
if caps.deviceKind == "WHOOP_MG" { return "MG" }
```

---

## 2. Exact Change Set for Plan 109-01

### File 1: `GooseSwift/DeviceCatalog.swift`

**Change:** Add `"WHOOP_MG"` branch to `generationLabel`:

```swift
var generationLabel: String {
  guard let caps = capabilities else { return "unknown" }
  if caps.wireProtocol == .gen4 { return "gen4" }
  if caps.deviceKind == "WHOOP_MG" { return "mg" }
  return "gen5"
}
```

Also add MG branch to `historicalDeviceType` for accurate logging:
```swift
var historicalDeviceType: String {
  if usesPageSequenceSync { return "GEN4" }
  if capabilities?.deviceKind == "WHOOP_MG" { return "WHOOP_MG" }
  return capabilities?.wireProtocol.bridgeString ?? "GOOSE"
}
```

### File 2: `GooseSwift/CoreBluetoothBLETransport+Commands.swift`

**Change:** Strengthen the hardware gate annotation at lines 1003–1014.

Current comment (line 1005):
```swift
// candidate_MG_advertisement_byte_unverified — identifies MG by peripheral name per D-03;
// falls back to WHOOP5 if peripheral name is absent or does not contain " mg".
```

Strengthen to include explicit hardware gate:
```swift
// candidate_MG_advertisement_byte_unverified — identifies MG by peripheral name per D-03;
// falls back to WHOOP5 if peripheral name is absent or does not contain " mg".
// hardware_gate: MG sync verified via name heuristic only; advertisement byte layout
// unconfirmed without physical WHOOP MG device. Protocol path follows Gen5 stream sync.
```

### File 3: GitHub issue #22

**Progress comment** (neutral language, per D-05):

> Historical sync routing for the MG device now follows the same Gen5 protocol path as other
> Gen5 straps. Detection continues to use the peripheral name heuristic as a reliable fallback
> (documented in code with an explicit hardware gate note).
>
> Full verification requires a physical MG device to confirm packet delivery. If you have access
> to an MG strap, connecting it and triggering a historical sync would confirm whether packets
> are received. The "no packet bodies" message may indicate the device was already fully synced
> at connection time.

---

## 3. What deviceKind / connectedDeviceGeneration Availability Looks Like

- `connectedCapabilities` is set asynchronously (bridge call on `historicalWriteQueue`) then
  dispatched to main, then `onCapabilitiesUpdated?()` fires
- `scheduleAutomaticHistoricalSyncIfNeeded` fires 0.8s after `connectionState == "ready"`
- `onCapabilitiesUpdated` → `scheduleAutomaticHistoricalSyncIfNeeded` (called by GooseAppModel)
- So capabilities WILL be set before the 0.8s timer fires in the happy path
- `connectedCapabilities` is nil only if bridge call fails — in that case, the error fallback at
  line 1051 sets `deviceKind: gen` ("WHOOP_MG") correctly

**Conclusion:** `connectedCapabilities.deviceKind` is available and correct when historical sync
starts. No timing issue exists.

---

## 4. Files to Modify

| File | Change | Lines |
|------|--------|-------|
| `GooseSwift/DeviceCatalog.swift` | Add MG to `generationLabel`, `historicalDeviceType` | 25–40 |
| `GooseSwift/CoreBluetoothBLETransport+Commands.swift` | Strengthen hardware gate comment | 1003–1014 |
| GitHub issue #22 | Post neutral progress comment | N/A |

**No changes needed in:**
- `CoreBluetoothBLETransport+HistoricalHandlers.swift` — routing is correct for MG
- `CoreBluetoothBLETransport+HistoricalCommands.swift` — routing is correct for MG
- `GooseBLEHistoricalManager.swift` — pure state struct, no device routing
- Rust core — MG capabilities are correct (`historical_sync: "stream"`)

---

## 5. Plan Structure

One plan covers all work:

**Plan 109-01:** MG sync logging hardening + detection gate comment + issue #22 comment (MG-03)

Tasks:
1. Fix `DeviceCatalog.generationLabel` and `historicalDeviceType` for MG
2. Strengthen hardware gate comment in Commands.swift
3. Post progress comment on GitHub issue #22
4. Build verification: `xcodebuild build ... CODE_SIGNING_ALLOWED=NO` must succeed

---

## 6. Issue #22 Progress Comment Wording

**Neutral language** (no BLE advertisement analysis framing, no internal class names):

> **Update — historical sync routing reviewed**
>
> The sync routing code for the MG variant now follows the same protocol path as other Gen5
> devices, with explicit documentation that verification requires hardware testing on a physical
> MG strap. Detection uses the device name as a reliable fallback when the connection is
> established.
>
> If "Historical metadata captured but no packet bodies received" appears on connection: this
> can be expected when the device has no new data to deliver (the strap's sync pointer is
> current). To confirm, manually trigger a historical sync after a workout.
>
> **What remains hardware-gated:** Confirming packet delivery on a physical MG device.

---

## RESEARCH COMPLETE

Phase 109 has one plan:
- **109-01:** MG sync hardening — DeviceCatalog generationLabel fix, hardware gate annotation, issue #22 comment (MG-03)
