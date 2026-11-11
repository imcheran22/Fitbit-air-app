---
phase: 20-upstream-fixes-storage
plan: 01
subsystem: ble
tags: [swift, corebluetooth, gen4, historical-sync, wrapping-arithmetic]

# Dependency graph
requires: []
provides:
  - "SYNC-01: historical-sync callbacks confirmed weak-capture, documented in GooseAppModel.swift"
  - "SYNC-02: three Gen4 per-sync counters use wrapping addition (GooseBLEClient+HistoricalHandlers.swift)"
  - "SYNC-03: buildV5CommandFrame 4-byte padding documented in GooseBLEClient+Parsing.swift"
  - "SYNC-04: connectedDeviceGeneration has main-actor confinement comment in GooseAppModel.swift"
  - "SYNC-05: Gen4 UUID lowercase before hasPrefix confirmed + documented in GooseBLEClient+Parsing.swift"
affects: [phase 21, gen4-historical-sync, ble-parsing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wrapping arithmetic (&+=) on monotonic per-sync counters to prevent overflow traps on long syncs"
    - "SYNC-tagged comments to link source annotations back to upstream PR review items"

key-files:
  created: []
  modified:
    - GooseSwift/GooseAppModel.swift
    - GooseSwift/GooseBLEClient+HistoricalHandlers.swift
    - GooseSwift/GooseBLEClient+Parsing.swift

key-decisions:
  - "SYNC-01: AppShellView.swift unchanged — healthStore is a @State value type, no closure capture, no teardown needed"
  - "SYNC-05: no code change — both Gen4 prefix comparisons (61080001 service via generation(from:), 61080002 command via isCommandUUID) already lowercased before hasPrefix"

patterns-established:
  - "Per-sync counters that can grow unboundedly during a long sync use &+= (wrapping) not += (trapping)"
  - "Queue-confinement comments above @MainActor properties identify which thread owns read/write access"

requirements-completed: [SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05]

# Metrics
duration: 25min
completed: 2026-06-06
---

# Phase 20 Plan 01: Gen4 Historical-Sync Correctness Fixes Summary

**Five Gen4 sync correctness fixes from upstream PR #26 applied: weak-capture documentation, wrapping arithmetic on three per-sync counters, 4-byte frame padding comment, main-actor confinement comment, and Gen4 UUID lowercase confirmation.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-06T21:12:00Z
- **Completed:** 2026-06-06T21:37:00Z
- **Tasks:** 4 (3 code/doc + 1 build gate)
- **Files modified:** 3

## Accomplishments
- SYNC-01 + SYNC-04: confirmed `onHistoricalSyncProgress` and `onHistoricalRangeTelemetry` already use `[weak self]`; added intent comments documenting the retain-cycle protection; added 3-line main-actor confinement comment on `connectedDeviceGeneration`
- SYNC-02: converted all three Gen4 historical per-sync increment sites to wrapping arithmetic (`&+= 1`) — `historicalPacketsReceivedThisSync`, `historicalRangePendingResponses`, `coalescedHistoricalSyncProgressCallbackCount`
- SYNC-03 + SYNC-05: added 3-line padding-rationale comment above `buildV5CommandFrame` padding block; replaced defensive comment in `generation(from:)` with explicit SYNC-05 annotation confirming both Gen4 prefix paths (61080001 service, 61080002 command) use lowercased strings
- Build gate: `xcodebuild` iPhone 17 simulator — BUILD SUCCEEDED with no new warnings

## Task Commits

Each task was committed atomically:

1. **Task 1: SYNC-01 + SYNC-04 — weak capture + confinement comment** - `b6a25c9` (fix)
2. **Task 2: SYNC-02 — wrapping arithmetic on per-sync counters** - `9d26124` (fix)
3. **Task 3: SYNC-03 + SYNC-05 — padding doc + UUID lowercase confirmed** - `2f38f87` (fix)
4. **Task 4: build gate** — no code changes; BUILD SUCCEEDED confirmed

## Files Created/Modified
- `GooseSwift/GooseAppModel.swift` — SYNC-01 intent comments on both ble.onHistoricalSyncProgress/onHistoricalRangeTelemetry assignments; SYNC-04 queue-confinement comment on connectedDeviceGeneration
- `GooseSwift/GooseBLEClient+HistoricalHandlers.swift` — three counter increments converted from `+= 1` to `&+= 1` (SYNC-02)
- `GooseSwift/GooseBLEClient+Parsing.swift` — 3-line padding rationale comment in buildV5CommandFrame (SYNC-03); SYNC-05 comment replacing defensive comment in generation(from:) (SYNC-05)

## Decisions Made
- SYNC-01: `AppShellView.swift` unchanged. `healthStore` is a `@State` value type passed to child views as a value — not a closure capture. No `.onDisappear` teardown is needed or appropriate. Branch: already-satisfied + documented.
- SYNC-05: no code change required. `generation(from:)` (Parsing.swift:358) lowercases before `hasPrefix("61080001")`. `WearableDescriptor.isCommandUUID` (GooseBLETypes.swift:18) lowercases before `hasPrefix(commandCharacteristicPrefix)` where `commandCharacteristicPrefix = "61080002"` for Gen4. Both paths already correct. Branch: already-satisfied + documented.
- SYNC-02 decrement check: no `historicalRangePendingResponses -= 1` exists in the file; the counter is reset with `= 0` at two sites (lines 606, 642) after sync completes. No wrapping decrement needed or applied.

## Deviations from Plan

None — plan executed exactly as written. All five SYNC requirements addressed as planned. SYNC-01 and SYNC-05 were already-satisfied in the fork; the plan anticipated this and directed documentation-only treatment. SYNC-02 was a real code change (three wrapping conversions). SYNC-03 and SYNC-04 were documentation additions.

## Issues Encountered
- iPhone 16 simulator not available; build used iPhone 17 simulator (iOS 26.5, arm64, id 605684A8). BUILD SUCCEEDED with no new warnings.

## SYNC-05 Verification Evidence

| Path | UUID Prefix | Comparison |
|------|-------------|------------|
| `GooseBLEClient+Parsing.swift:359` | `61080001` (service) | `lower.hasPrefix(...)` where `lower = uuid.uuidString.lowercased()` |
| `GooseBLETypes.swift:18` | `61080002` (command, via `commandCharacteristicPrefix`) | `uuid.uuidString.lowercased().hasPrefix(...)` |
| `GooseBLETypes.swift:76` | `610800` (rustDeviceType Gen4 check) | `characteristicUUID.lowercased().hasPrefix(...)` |

No raw `hasPrefix("61080001")` or `hasPrefix("61080002")` against non-lowercased strings found anywhere in `GooseSwift/`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Gen4 historical-sync correctness foundation clean; ready for Phase 20 Plan 02 (PERF-05: body_hex exclusion in Rust protocol parser)
- No blockers

---
*Phase: 20-upstream-fixes-storage*
*Completed: 2026-06-06*
