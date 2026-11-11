---
phase: 62-upload-watermark-per-sensor
plan: 02
subsystem: infra
tags: [swift, upload, watermark, userdefaults, persistence, crash-safe]

# Dependency graph
requires:
  - 62-01 (GooseUploadWatermark store: WatermarkType enum + static read/write/clear operations)
provides:
  - Watermark-gated sinceTimestamp resolution in performUpload (decodedStreams) and uploadRawFrames (rawFrames)
  - Atomic watermark writes on confirmed 2xx only — never on failure
  - clearAllUploadWatermarks() reset path for logout / device swap
affects:
  - GooseUploadService upload pipeline (crash-safe resume from last confirmed point)
  - GooseAppModel+Upload.swift (reset entry point for device swap)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Watermark gate: GooseUploadWatermark.watermark(for:) ?? callerFallback inside the service, not at call site"
    - "Atomic write after success: update(.decodedStreams) after markStreamsSynced; update(.rawFrames) after 2xx guard"
    - "Independent watermarks per type — rawFrames and decodedStreams advance separately"
    - "clearAllUploadWatermarks resets both watermark keys and lastUploadAt for device-swap safety"

key-files:
  created: []
  modified:
    - GooseSwift/GooseUploadService.swift
    - GooseSwift/GooseAppModel+Upload.swift

key-decisions:
  - "effectiveSince computed inside performUpload and uploadRawFrames (not at call site) — RESEARCH Pitfall 2"
  - "decodedStreams watermark written after markStreamsSynced and before uploadRawFrames call — correct ordering"
  - "rawFrames watermark written immediately after the 2xx guard in uploadRawFrames — independently of decoded path"
  - "clearAllUploadWatermarks not wired to transient disconnect events — only explicit reset entry point (Pitfall 4)"
  - "lastUploadAt = nil in clearAllUploadWatermarks so session-fallback uses default lookback after reset"

requirements-completed: [UPLOAD-WM-01]

# Metrics
duration: 20min
completed: 2026-06-11
---

# Phase 62 Plan 02: Upload Watermark Pipeline Wiring Summary

**Watermark-gated sinceTimestamp in GooseUploadService with independent per-type atomic writes on 2xx and a clearAllUploadWatermarks reset path in GooseAppModel**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-11T13:30:00Z
- **Completed:** 2026-06-11T13:50:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Modified `GooseUploadService.performUpload`: reads `GooseUploadWatermark.watermark(for: .decodedStreams) ?? sinceTimestamp` as `effectiveSince`; uses it for `captureAllPendingRowIDs`, decoded-stream fetch, and `uploadRawFrames` call; writes `update(.decodedStreams, to: Date())` inside the `uploadSucceeded` branch after `markStreamsSynced`
- Modified `GooseUploadService.uploadRawFrames`: reads `GooseUploadWatermark.watermark(for: .rawFrames) ?? sinceTimestamp` as `effectiveSince`; uses it for the raw frames Rust bridge query; writes `update(.rawFrames, to: Date())` immediately after the 2xx guard — independent of the decoded-streams watermark
- Added `clearAllUploadWatermarks()` to `GooseAppModel+Upload.swift`: calls `GooseUploadWatermark.clearAllWatermarks()` and resets `lastUploadAt = nil`; not wired to transient disconnect events
- Simulator build: BUILD SUCCEEDED with no errors or warnings

## Task Commits

Each task was committed atomically:

1. **Task 1: Gate sinceTimestamp on watermark and write on success** — `d982887` (feat)
2. **Task 2: Add clearAllUploadWatermarks and verify simulator build** — `2d6351c` (feat)

## Files Created/Modified

- `GooseSwift/GooseUploadService.swift` — effectiveSince resolution in both upload methods; watermark writes on 2xx only
- `GooseSwift/GooseAppModel+Upload.swift` — clearAllUploadWatermarks() reset helper

## Decisions Made

- `effectiveSince` is computed inside `performUpload` and `uploadRawFrames`, not at call sites in `GooseAppModel+Upload.swift` — the persisted watermark must override any session-only caller hint (RESEARCH Pitfall 2)
- `decodedStreams` watermark is written after `markStreamsSynced` and before the `uploadRawFrames` call so a raw-frames timeout does not retroactively invalidate the decoded watermark
- `rawFrames` watermark is written immediately after the 2xx guard in `uploadRawFrames` — the two types are independent (RESEARCH Pitfall 3)
- `clearAllUploadWatermarks()` is intentionally NOT wired into `GooseBLEClient+CentralDelegate.swift` bond-state transitions; those fire on every ordinary disconnect/BT-off, which would incorrectly wipe progress (RESEARCH Pitfall 4)
- `lastUploadAt = nil` included in `clearAllUploadWatermarks()` so the session-level fallback also resets after a logout/device-swap

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None. `clearAllUploadWatermarks()` is an exposed method ready for wiring to a deliberate logout/device-swap UI action in a future phase.

## Threat Flags

No new network endpoints, auth paths, or trust-boundary changes introduced. The watermark values are internal `Date` objects stored in UserDefaults under the app sandbox and are never exposed via the network or user input.

## Known Stubs

None. All watermark reads/writes are fully wired; no placeholders or TODOs remain.

## Self-Check

- [x] GooseUploadWatermark.watermark(for:) called exactly 2 times in GooseUploadService.swift: FOUND (grep -c = 2)
- [x] GooseUploadWatermark.update(.decodedStreams) inside success branch: FOUND (line 163)
- [x] GooseUploadWatermark.update(.rawFrames) after 2xx guard: FOUND (line 227)
- [x] func clearAllUploadWatermarks in GooseAppModel+Upload.swift: FOUND
- [x] GooseUploadWatermark.clearAllWatermarks() called in clearAllUploadWatermarks: FOUND
- [x] Commit d982887 exists: FOUND
- [x] Commit 2d6351c exists: FOUND
- [x] Simulator build: BUILD SUCCEEDED

## Self-Check: PASSED

---
*Phase: 62-upload-watermark-per-sensor*
*Completed: 2026-06-11*
