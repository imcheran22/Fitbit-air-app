# Phase 109: WHOOP MG Sync Fix - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Investigate and fix the root cause of WHOOP MG historical sync failure (issue #22). Harden MG detection beyond the name heuristic. Document the hardware gate explicitly. No real MG device available — verification is code analysis + safe-fallback annotation.

**In scope:** Root cause analysis of #22, MG sync routing fix, detection hardening, hardware gate documentation in code, issue #22 progress comment.
**Out of scope:** MG live HR display, MG-specific metrics, full regression test with real hardware (hardware-gated).

</domain>

<decisions>
## Implementation Decisions

### Approach (hardware gate)
- **D-01:** **Implement + document gate** — Fix the code, annotate `candidate_MG_advertisement_byte_unverified` with explicit comment explaining what would confirm it (advertisement service byte value), post progress comment on issue #22 with what's fixed and what remains hardware-gated.

### MG detection
- **D-02:** Current detection is `peripheral.name?.lowercased().contains(" mg")` — already annotated `candidate_MG_advertisement_byte_unverified`. This is the safe fallback. Do NOT remove or change the heuristic. If advertisement byte layout is confirmed via hardware observation in the future, update to a byte-based check.
- **D-03:** MG shares the Gen5 service UUID (`fd4b0001`) — cannot distinguish at scan time. Detection must remain post-GATT-connection, which is what the current code does.

### Root cause investigation for #22
- **D-04:** Root cause is likely sync routing: MG uses Gen5 protocol path but may be getting misrouted or lacking the correct sync response handler. Investigate by reading `CoreBluetoothBLETransport+HistoricalHandlers.swift` for MG-specific branches.
- **D-05:** Use neutral language in issue #22 comment — "protocol observation", "hardware testing", no BLE advertisement analysis framing.

### Claude's Discretion
- If no MG-specific code path is missing (detection already works, it's a routing bug), the fix is in the historical sync routing
- Comment added to `CoreBluetoothBLETransport+Commands.swift` should document: "MG sync tested only with name heuristic; confirm by running historical sync on physical MG device"

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### MG detection (current implementation)
- `GooseSwift/CoreBluetoothBLETransport+Commands.swift` lines ~1003-1058 — 3-way detection logic; `candidate_MG_advertisement_byte_unverified` annotation
- `GooseSwift/GooseAppModel.swift` lines ~314-317 — MG generation label wiring

### Sync routing
- `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift` — historical sync event handlers; check for MG-specific branches vs Gen5
- `GooseSwift/GooseBLEHistoricalManager.swift` — historical sync command dispatch

### Issue to comment
- GitHub issue #22 — "[MG] Sync Failed" — post progress comment in neutral language

</canonical_refs>

<code_context>
## Existing Code Insights

### Already done
- MG identified via `peripheral.name?.lowercased().contains(" mg")` → `deviceKind = "WHOOP_MG"`
- `DeviceCatalog.generationLabel` returns "MG" for `deviceKind == "WHOOP_MG"`
- `GooseAppModel` wires `deviceKind == "WHOOP_MG"` → `bleState.connectedDeviceGeneration = "MG"`
- UUID comment: "fd4b0001: MAVERICK (WHOOP MG) and GOOSE share this UUID family; cannot distinguish at scan time"

### Missing / to investigate
- Whether MG goes through the same historical sync path as Gen5
- Whether the "no packet bodies" failure is a routing issue or a missing sync command handler for MG
- No hardware-confirmed advertisement byte for MG — name heuristic is the only discriminator

</code_context>

<specifics>
## Specific Ideas

- Issue #22 comment: "MG detection relies on peripheral name heuristic (reliable on known hardware). Historical sync routing now follows the same path as Gen5. Full verification requires a physical MG device."
- Hardware gate comment in code: `// hardware_gate: MG sync verified via name heuristic only; advertisement byte layout unconfirmed without physical WHOOP MG device`

</specifics>

<deferred>
## Deferred Ideas

- MG advertisement byte confirmation — hardware-gated; defer to v15.0 or when physical MG device is available
- MG-specific metrics — out of scope

</deferred>

---

*Phase: 109-whoop-mg-sync-fix*
*Context gathered: 2026-06-21*
