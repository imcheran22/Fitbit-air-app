---
phase: 83-protocol-architecture-refactor-gen4-gen5-capability-model
plan: 05
subsystem: protocol
tags: swift, ble, device-capabilities, wire-protocol, type-safety

requires:
  - phase: 83-04
    provides: connectedCapabilities property on GooseBLEClient; wireProtocol computed property on GooseNotificationEvent; bridgeString helper on WireProtocol

provides:
  - Zero activeDeviceGeneration references across all GooseSwift/ files
  - Zero rustDeviceType references across all GooseSwift/ files
  - HistoricalHandlers/HistoricalCommands/DebugAndSync guard sites use connectedCapabilities?.historicalSync == .pageSequence
  - Parsing.swift reset uses connectedCapabilities = nil; wire-level checks use connectedCapabilities?.wireProtocol
  - NotificationPipeline reassembly uses wireProtocol == .gen4; HR bypass uses wireProtocol == .hrMonitor
  - All bridge arg pass-throughs use wireProtocol.bridgeString

affects: 83-06 (full test gate — all consumer files now use typed API)

tech-stack:
  added: []
  patterns:
    - "connectedCapabilities?.historicalSync == .pageSequence for gen4 historical protocol guards"
    - "connectedCapabilities?.wireProtocol == .gen4 for byte-level frame header guards"
    - "event.wireProtocol == .gen4 / .hrMonitor for enum-typed reassembly checks"
    - "wireProtocol.bridgeString for canonical device_type strings passed to Rust bridge"

key-files:
  created: []
  modified:
    - GooseSwift/GooseBLEClient+HistoricalHandlers.swift
    - GooseSwift/GooseBLEClient+HistoricalCommands.swift
    - GooseSwift/GooseBLEClient+Parsing.swift
    - GooseSwift/GooseBLEClient+DebugAndSync.swift
    - GooseSwift/GooseAppModel+NotificationPipeline.swift
    - GooseSwift/GooseAppModel+Upload.swift
    - GooseSwift/OvernightRawNotificationSpool.swift
    - GooseSwift/OvernightSQLiteMirrorQueue.swift
    - GooseSwift/MovementPacketSamples.swift

key-decisions:
  - "HistoricalHandlers switch default case uses wireProtocol.bridgeString ?? 'GOOSE' — never MAVERICK — so Gen5 frames carry 'GOOSE' which is accepted by parse_device_type() (HIGH-1 constraint from plan)"
  - "Wire-level guards in Parsing.swift use wireProtocol (byte-level decision); historical-protocol guards in HistoricalHandlers/Commands/DebugAndSync use historicalSync (protocol decision) — separation matches plan design intent"
  - "DebugAndSync line 399 description uses map { .gen4 ? 'gen4' : 'gen5' } ?? 'unknown' — preserves human-readable label in log strings without bridgeString"

requirements-completed:
  - PROTO-01
  - PROTO-03

duration: 18min
completed: 2026-06-14
---

# Phase 83-05: Replace remaining activeDeviceGeneration and rustDeviceType callers

**All 9 remaining Swift files migrated to typed connectedCapabilities/wireProtocol API; zero string-based device-type comparisons remain in GooseSwift/**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-14T14:58:00Z
- **Completed:** 2026-06-14T15:16:53Z
- **Tasks:** 2/2
- **Files modified:** 9

## Accomplishments

- Replaced 6 activeDeviceGeneration guard sites in GooseBLEClient+HistoricalHandlers.swift with connectedCapabilities?.historicalSync == .pageSequence checks; switch default uses wireProtocol.bridgeString ?? "GOOSE" (HIGH-1 constraint met — never writes "MAVERICK")
- Replaced 3 sites in GooseBLEClient+HistoricalCommands.swift: 2 pageSequence guards + whoopGenerationFromCapabilities() frame-build call
- Replaced 5 sites in GooseBLEClient+Parsing.swift: reset to nil; 2 wireProtocol guards; 2 switch connectedCapabilities?.wireProtocol statements
- Replaced 3 sites in GooseBLEClient+DebugAndSync.swift: description log string, 2 pageSequence guards
- Replaced 6 sites in GooseAppModel+NotificationPipeline.swift: 2 wireProtocol == .gen4 reassembly checks, HR_MONITOR bypass to .hrMonitor, 2 bridge arg bridgeString, cache key bridgeString
- Replaced 1 site each in Upload, OvernightRawNotificationSpool, OvernightSQLiteMirrorQueue, MovementPacketSamples (2 sites) with wireProtocol.bridgeString

## Task Commits

1. **Task 1: Replace guard sites in GooseBLEClient extensions** — `8597c56` (feat)
2. **Task 2: Replace rustDeviceType consumers in pipeline and ancillary files** — `a5b53f2` (feat)

## Files Created/Modified

- `GooseSwift/GooseBLEClient+HistoricalHandlers.swift` — 6 sites: switch on historicalSync; 4 boolean guards on historicalSync
- `GooseSwift/GooseBLEClient+HistoricalCommands.swift` — 2 pageSequence guards; 1 whoopGenerationFromCapabilities() frame build
- `GooseSwift/GooseBLEClient+Parsing.swift` — connectedCapabilities = nil reset; 2 wireProtocol != .gen4 guards; 2 switch on wireProtocol
- `GooseSwift/GooseBLEClient+DebugAndSync.swift` — description log string; 2 pageSequence guards
- `GooseSwift/GooseAppModel+NotificationPipeline.swift` — 2 wireProtocol == .gen4 reassembly; wireProtocol == .hrMonitor bypass; 2 bridgeString bridge args; bridgeString cache key
- `GooseSwift/GooseAppModel+Upload.swift` — deviceType arg uses wireProtocol.bridgeString
- `GooseSwift/OvernightRawNotificationSpool.swift` — device_type dict value uses wireProtocol.bridgeString
- `GooseSwift/OvernightSQLiteMirrorQueue.swift` — device_type dict value uses wireProtocol.bridgeString
- `GooseSwift/MovementPacketSamples.swift` — 2 log string interpolations use wireProtocol.bridgeString

## Decisions Made

- HistoricalHandlers switch default writes `connectedCapabilities?.wireProtocol.bridgeString ?? "GOOSE"` — never hardcodes "MAVERICK". This satisfies the HIGH-1 constraint: post-migration parse_device_type() rejects "MAVERICK", so Gen5 historical frames must carry "GOOSE".
- Wire-level guards (byte-level header decisions) use `wireProtocol`; historical-protocol guards (sync protocol decisions) use `historicalSync`. This distinction matches the plan's design intent and 83-CONTEXT.md D-08.
- DebugAndSync description string uses `map { .gen4 ? "gen4" : "gen5" } ?? "unknown"` rather than bridgeString — preserves a lowercase human-readable label in log output (not a Rust bridge arg, so bridgeString casing is irrelevant here).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all replacements wire to the real typed API from Plan 83-04.

## Threat Flags

No new security surface introduced. T-83-09 mitigation confirmed: wireProtocol.bridgeString produces "GEN4", "GOOSE", or "HR_MONITOR" — all accepted by parse_device_type(). T-83-08 (nil connectedCapabilities during historical sync) handled by optional chaining evaluating to nil/false — Gen5 default path taken silently, which is the documented safe default.

## Self-Check: PASSED

- Zero rustDeviceType in GooseSwift/: confirmed (0 matches)
- Zero activeDeviceGeneration in GooseSwift/: confirmed (0 matches)
- wireProtocol == .gen4 in NotificationPipeline: lines 829, 841
- wireProtocol == .hrMonitor in NotificationPipeline: line 720
- connectedCapabilities = nil in Parsing: line 548
- Commits 8597c56 and a5b53f2 verified in git log

---
*Phase: 83-protocol-architecture-refactor-gen4-gen5-capability-model*
*Completed: 2026-06-14*
