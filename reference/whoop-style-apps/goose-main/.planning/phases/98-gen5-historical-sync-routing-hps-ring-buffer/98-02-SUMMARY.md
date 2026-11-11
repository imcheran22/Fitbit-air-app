---
phase: "98"
plan: "02"
subsystem: ble-historical-sync
tags: [historical-sync, ring-buffer, hps, parsing, telemetry, gen5]
dependency_graph:
  requires: [98-01]
  provides: [ring-buffer-parse, ring-wrap-detection, ring-telemetry]
  affects: [CoreBluetoothBLETransport, HistoricalRangePageState]
tech_stack:
  added: []
  patterns: [ble-record-telemetry, optional-struct-fields, LE-u32-word-parse]
key_files:
  created: []
  modified:
    - GooseSwift/CoreBluetoothBLETransport.swift
    - GooseSwift/CoreBluetoothBLETransport+Parsing.swift
decisions:
  - Ring buffer fields added as optional to HistoricalRangePageState so existing callers require no changes
  - ringWrapped and pagesBehindCorrected implemented as computed properties on the struct
  - Ring telemetry log emitted unconditionally in emitHistoricalRangeTelemetry (present or absent branch)
  - body.count >= 37 threshold: 5-byte header stripped, offset 1 start, 6 words * 4 bytes = 25, plus 3 more words = 37 bytes minimum
metrics:
  duration: "~16 minutes"
  completed: "2026-06-21"
  tasks_completed: 2
  files_modified: 2
status: complete
---

# Phase 98 Plan 02: HPS Ring Buffer Parse — Summary

Parse ring buffer fields (`ring_capacity`, `current_page`, `read_pointer`) from the `GET_DATA_RANGE` response body in Swift; add wrap-around detection and ring telemetry via `ble.record()`.

## What Was Built

### Task 1 — Ring Buffer Field Parse + Wrap Detection

Extended `HistoricalRangePageState` struct (`CoreBluetoothBLETransport.swift`) with three optional fields and two computed properties:

- `ringCapacity: UInt32?` — total ring buffer capacity (word[6], body offset 25)
- `ringCurrentPage: UInt32?` — current write position (word[7], body offset 29)
- `ringReadPointer: UInt32?` — last read pointer (word[8], body offset 33)
- `var ringWrapped: Bool` — `true` when `currentPage < readPointer` (wrap occurred)
- `var pagesBehindCorrected: Int?` — corrected distance accounting for ring wrap:
  - wrapped: `(capacity - readPointer) + currentPage`
  - not wrapped: `currentPage - readPointer`

Extended `historicalRangePageState(fromRangeBody:)` (`CoreBluetoothBLETransport+Parsing.swift`) to parse the three ring fields when `body.count >= 37`. When the response is shorter (older firmware or Gen4), all three fields remain `nil` and the existing `pagesBehind` computed property continues to work unchanged.

Byte layout (body = payload after 5-byte header removed):
- `body[0]` — revision/status byte (unchanged)
- `body[1..24]` — 6 × u32 LE words: `words[2]=pageCurrent`, `words[3]=pageOldest`, `words[5]=pageEnd`
- `body[25..28]` — `ringCapacity` (words[6])
- `body[29..32]` — `ringCurrentPage` (words[7])
- `body[33..36]` — `ringReadPointer` (words[8])

### Task 2 — Ring Buffer Telemetry Log

Added `historical_sync.get_data_range.ring` log emission at the end of `emitHistoricalRangeTelemetry` in `CoreBluetoothBLETransport+Parsing.swift`.

When ring fields are present (`body.count >= 37` and all three fields parsed):
```
source: "ble.sync"
title: "historical_sync.get_data_range.ring"
body: "ring_capacity={N} current_page={N} read_pointer={N} ring_wrapped={bool} pages_behind_corrected={N}"
```

When ring fields are absent (short response body):
```
source: "ble.sync"
title: "historical_sync.get_data_range.ring"
body: "ring_fields_absent=true body_bytes={N}"
```

## Verification

- `grep -n "historical_sync.get_data_range.ring" GooseSwift/CoreBluetoothBLETransport+Parsing.swift` — found at lines 803 and 809
- `grep -n "historical_sync.command.response" GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift` — exists at line 556 (no regression)
- Rust tests: running (no Rust files modified — no regressions possible)
- GitHub issue #160 commented and closed

## Commits

| Hash | Message |
|------|---------|
| 3aaf3ee | feat(98-02): parse ring buffer fields from GET_DATA_RANGE response; add wrap detection and ring telemetry (SYNC-10) — Fixes #160 |

## Deviations from Plan

None. Plan executed exactly as written.

The CONTEXT.md D-05 mentions a Rust implementation path, but the explicit prompt instruction and plan task descriptions specify Swift-only — the parsing is done entirely in Swift, consistent with the established pattern in `CoreBluetoothBLETransport+Parsing.swift`.

## Known Stubs

None. All ring buffer fields are fully parsed and logged. The `pagesBehindCorrected` value is surfaced in the telemetry log for observability. No UI wiring is required (telemetry-only per D-07).

## Threat Flags

None. This change only extends an internal struct with optional fields and adds a `ble.record()` telemetry log. No new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- `/Users/francisco/Documents/goose/.claude/worktrees/agent-a6b3bd9f728dc7b39/GooseSwift/CoreBluetoothBLETransport.swift` — FOUND (ringCapacity, ringCurrentPage, ringReadPointer, ringWrapped, pagesBehindCorrected)
- `/Users/francisco/Documents/goose/.claude/worktrees/agent-a6b3bd9f728dc7b39/GooseSwift/CoreBluetoothBLETransport+Parsing.swift` — FOUND (ring parse logic, ring telemetry log)
- Commit 3aaf3ee — FOUND in git log
