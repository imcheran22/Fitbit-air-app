# Phase 117: Android Optical Routing - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Android Kotlin phase. Delivers OPT-04: Android WhoopBleClient forwards packet_k 20, 21, and 26 frames to GooseBridge.safeHandle(), achieving parity with iOS v15.0 optical decode path.

**Current state (from code audit):**
- Gen5/MG path: ALL notifications → `importFrame(value, frameSource)` → `GooseBridge.safeHandle()` — NO packet_k filtering exists
- Android subscribes to ALL characteristics with CCCD automatically
- Routing is correct IF optical frames reach Android at all

**Real gap (to verify):** Does WHOOP 5 send optical packets passively on existing notification characteristic, OR only after Android sends specific BLE commands?
iOS sends: ENABLE_OPTICAL_DATA (commandNumber: 107) and TOGGLE_OPTICAL_MODE (commandNumber: 108) in its handshake sequence.
If Android doesn't send these commands, the device may not emit optical packets regardless of subscription state.

**Researcher must determine:**
1. Does Android currently send cmd 107 (ENABLE_OPTICAL_DATA) and/or cmd 108 (TOGGLE_OPTICAL_MODE) in the Gen5 handshake?
2. If not: add them after the existing handshake commands in WhoopBleClient
3. If yes: the routing already works and the phase just needs a JVM test

Requirements in scope: OPT-04
Out of scope: optical parsing (done in Phase 112/Rust), iOS changes, Rust changes

</domain>

<decisions>
## Implementation Decisions

### Routing Decision
- **D-01:** No new routing code needed in handleNotification or importFrame — Gen5/MG already passes ALL frames through. If optical data doesn't arrive, the fix is at the command level (enable optical mode), not the routing level.

### Command Gap
- **D-02:** If Android doesn't already send ENABLE_OPTICAL_DATA (cmd 107) in the Gen5 handshake, add it after the existing handshake commands. Follow iOS pattern: send after authentication.

### Test
- **D-03:** Add a JVM unit test verifying that a synthetic frame with packet_k=20 (or 21 or 26) bytes passes through `importFrame` to `GooseBridge.safeHandle()` without filtering.

### Claude's Discretion
- Which specific command bytes and payload to use for cmd 107/108 — researcher to find in iOS codebase
- Whether to add both 107 and 108, or just 107 — researcher to determine based on iOS handshake sequence

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Android Code
- `android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt` lines 379-414 — `handleNotification` (Gen5 ALL-frames path confirmed)
- `android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt` lines 240-248 — CCCD subscription (all characteristics)
- `android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt` lines 502-519 — `importFrame` and `GooseBridge.safeHandle()` call

### iOS Reference (command bytes)
- `GooseSwift/CoreBluetoothBLETransport.swift` lines 607-630 — ENABLE_OPTICAL_DATA (cmd 107) and TOGGLE_OPTICAL_MODE (cmd 108) command sequence for WHOOP 5

### Requirements
- `.planning/REQUIREMENTS.md` §Optical Protocol Decode — OPT-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Key finding
Gen5 handleNotification passes ALL bytes through without packet_k inspection. If WHOOP 5 emits optical frames on its notification characteristic, Android already routes them correctly via importFrame → GooseBridge.safeHandle.

### What might be missing
The ENABLE_OPTICAL_DATA / TOGGLE_OPTICAL_MODE command sequence that tells the device to start emitting optical packets. iOS sends these; Android may not.

### Established Pattern
- Android BLE commands: `buildCommandFrame(sequence, command.toByte(), data)` → write to command characteristic
- Handshake sequence: search WhoopBleClient for where authentication commands are sent to find insertion point

</code_context>

<specifics>
## Specific Ideas

- If cmd 107 is needed: send after initial handshake, before historical sync starts (same as iOS)
- JVM test: mock importFrame call, verify synthetic packet_k=20 frame bytes are forwarded

</specifics>

<deferred>
## Deferred Ideas

- Optical data UI display (Phase 120/121)
- Separate optical characteristic subscription (if data comes on different characteristic — unlikely given all-CCCD pattern)

</deferred>

---

*Phase: 117-Android Optical Routing*
*Context gathered: 2026-06-24*
