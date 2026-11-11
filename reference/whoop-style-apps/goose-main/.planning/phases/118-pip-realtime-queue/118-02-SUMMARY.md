---
phase: 118-pip-realtime-queue
plan: "02"
subsystem: swift-realtime-queue
tags: [swift, realtime, ble, queue, pip]
dependency_graph:
  requires: ["118-01"]
  provides: ["RealtimePIPQueue", "always-on-realtime-enqueue"]
  affects: ["GooseAppModel", "GooseAppModel+NotificationPipeline"]
tech_stack:
  added: []
  patterns: ["NSLock + DispatchQueue @unchecked Sendable write queue", "fire-and-forget backpressure enqueue"]
key_files:
  created:
    - GooseSwift/RealtimePIPQueue.swift
  modified:
    - GooseSwift/GooseAppModel.swift
    - GooseSwift/GooseAppModel+NotificationPipeline.swift
    - GooseSwift.xcodeproj/project.pbxproj
decisions:
  - "RealtimePIPQueue owns its own GooseRustBridge, NSLock, and DispatchQueue — fully isolated from CaptureFrameWriteQueue (D-02)"
  - "enqueue is fire-and-forget (no completion callback) — realtime is best-effort"
  - "realtimePIPFrames() static helper added to NotificationPipeline to map frames to RealtimePIPFrame before the importCapturedFrames guard"
  - "realtimePIPQueue.enqueue called BEFORE importCapturedFrames in handleNotificationIngestResult — always-on per D-01"
metrics:
  duration: "~4 minutes"
  completed: "2026-06-26T18:50:12Z"
  tasks_completed: 2
  files_changed: 4
status: complete
---

# Phase 118 Plan 02: Swift RealtimePIPQueue class + always-on wiring — Summary

**One-liner:** RealtimePIPQueue — isolated NSLock/DispatchQueue/GooseRustBridge write queue wired unconditionally before the capture-session guard in the BLE notification pipeline.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create RealtimePIPQueue.swift | df143bf | GooseSwift/RealtimePIPQueue.swift |
| 2 | Wire realtimePIPQueue into GooseAppModel + always-on enqueue | 154c091 | GooseAppModel.swift, GooseAppModel+NotificationPipeline.swift, project.pbxproj |

## What Was Built

### Task 1 — RealtimePIPQueue.swift

New file at `GooseSwift/RealtimePIPQueue.swift` (109 lines). Structural twin of `CaptureFrameWriteQueue`:

- `final class RealtimePIPQueue: @unchecked Sendable`
- Private `DispatchQueue(label: "com.goose.swift.realtime-pip-write", qos: .utility)`
- Private `NSLock` guarding `pendingRows`, `queuedRowCount`, `isWriting`
- Own `private let rust = GooseRustBridge()` — never shared
- `enqueue(frames: [RealtimePIPFrame])` — fire-and-forget; applies same backpressure (drops frames beyond `maxQueuedRows`) independently of `CaptureFrameWriteQueue` (D-02)
- `flushNext()` loops over batches; for each frame calls `rust.request(method: "realtime.insert_frame", args: [database_path, device_uuid, frame_hex, captured_at])`
- Errors logged via `OSLog` without crashing (best-effort realtime)
- No `storage.compact_raw_evidence` call (realtime_frames, not raw_evidence)

### Task 2 — GooseAppModel wiring

`GooseAppModel.swift`:
- Added 3 static constants: `realtimePIPQueueMaxRows = 2048`, `realtimePIPBatchMaxRows = 128`, `realtimePIPCoalesceDelay = 0.05` (mirroring capture queue values)
- Added `let realtimePIPQueue = RealtimePIPQueue(...)` immediately after `captureFrameWriteQueue`

`GooseAppModel+NotificationPipeline.swift`:
- Added `realtimePIPFrames(for:event:deviceUUID:)` static helper — maps `[NotificationFrame]` + event to `[RealtimePIPFrame]` using `Self.captureTimestampFormatter` (same ISO8601 formatter as capture path)
- In `handleNotificationIngestResult`: added `realtimePIPQueue.enqueue(frames: realtimeFrames)` BEFORE the `importCapturedFrames(frames, event: event)` call — above the capture-session guard at line 170 (D-01 always-on)

`project.pbxproj`:
- Registered `RealtimePIPQueue.swift` at all 4 required locations (UUIDs E1/E2-000000000000000000018)

### Build Verification

`xcodebuild build ... CODE_SIGNING_ALLOWED=NO` → **BUILD SUCCEEDED**

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

T-118-03 (Denial of Service — unbounded queue growth): mitigated by `maxQueuedRows` backpressure in `enqueue()`, independent of the capture queue accounting (D-02 satisfied). No new unmodeled threat surface introduced.

## Known Stubs

None. The queue is fully wired: frames flow from BLE notification → `realtimePIPQueue.enqueue` → `realtime.insert_frame` bridge method (implemented in 118-01) → `realtime_frames` SQLite table.

## Self-Check: PASSED

- `GooseSwift/RealtimePIPQueue.swift` — FOUND
- Commit `df143bf` — FOUND
- Commit `154c091` — FOUND
- `grep -c RealtimePIPQueue.swift project.pbxproj` → 4 — PASSED
- BUILD SUCCEEDED — PASSED
