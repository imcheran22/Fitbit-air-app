---
status: resolved
trigger: Swift 6 concurrency errors in GooseAppModel+NotificationPipeline.swift and HealthDataStore.swift — non-Sendable captures and @MainActor isolation violations
slug: swift6-concurrency-pipeline
created: 2026-06-03
updated: 2026-06-03
---

# Debug Session: swift6-concurrency-pipeline

## Symptoms

- **Expected**: GooseSwift builds without errors
- **Actual**: 20+ Swift concurrency errors across 3 files
- **When**: After Xcode 26 / iOS 26 SDK upgrade (stricter default concurrency checking)
- **Reproduction**: Build GooseSwift scheme in Xcode

## Error Summary

### GooseAppModel+NotificationPipeline.swift
- Line 204: Capture of 'aggregator' with non-Sendable type 'CaptureFrameEnqueueAggregator' in a '@Sendable' closure
- Line 412: Capture of 'ble' with non-Sendable type 'GooseBLEClient' in a '@Sendable' closure
- Lines 548-564: Converting @MainActor function values to non-isolated contexts; calling @MainActor static methods from nonisolated context
- Lines 680, 705: Calling @MainActor methods from nonisolated context
- Lines 768-769: @MainActor property mutated/referenced from nonisolated context

### HealthDataStore.swift
- Line 141: Capture of 'store' with non-Sendable type 'HeartRateSeriesStore' in a '@Sendable' closure
- Line 184: Capture of 'bridge' with non-Sendable type 'GooseRustBridge' in a '@Sendable' closure
- Lines 188-213: Calling @MainActor static methods from nonisolated context

### HealthDataStore+Snapshots.swift
- Lines 31, 80: Capture of 'bridge' with non-Sendable type 'GooseRustBridge' in a '@Sendable' closure
- Lines 65, 98: Calling @MainActor static method 'shortError' from nonisolated context

## Build Context

- SWIFT_VERSION = 5.0 (in project.pbxproj)
- SWIFT_STRICT_CONCURRENCY: not set (Xcode 26 default is stricter)
- iOS 26.0 deployment target
- Project uses @MainActor + DispatchQueue threading model

## Current Focus

hypothesis: Xcode 26 changed default SWIFT_STRICT_CONCURRENCY to 'targeted' (or higher), surfacing latent concurrency issues that previously compiled silently
test: Check if setting SWIFT_STRICT_CONCURRENCY=minimal suppresses all errors without fixing root cause
expecting: Yes — these are real structural issues. Proper fix: (1) mark non-Sendable types as @unchecked Sendable, (2) remove @MainActor from pure static utility functions, (3) dispatch MainActor property mutations correctly
next_action: Read affected files to map exact fix for each error category

## Evidence

- timestamp: 2026-06-03T20:31
  observation: Build succeeded after applying all fixes. xcodebuild reported BUILD SUCCEEDED with no errors.

## Eliminated Hypotheses

## Resolution
root_cause: Xcode 26 enables stricter Swift concurrency checking by default. The codebase had three categories of latent violation: (1) four final classes (GooseRustBridge, CaptureFrameEnqueueAggregator, HeartRateSeriesStore, GooseBLEClient) captured in @Sendable closures without Sendable conformance, despite having internal thread-safety via NSLock/DispatchQueue; (2) static methods on @MainActor classes called from nonisolated contexts — intValue, intString, healthPacketCaptureFamily, extractMovementPacket, extractWhoopEvent, extractWhoopDataSignal, frameSummary, extractHeartRate, captureEvidenceID, shortError, algorithmRows, preferenceRows and related helpers; (3) @MainActor properties (captureFrameRowBuildQueueDepth, frameReassemblyBuffers) mutated from nonisolated functions that use NSLock for protection.
fix: Category 1 — added @unchecked Sendable to GooseRustBridge, CaptureFrameEnqueueAggregator, HeartRateSeriesStore, GooseBLEClient (all have NSLock/DispatchQueue internal protection). Category 2 — added nonisolated keyword to all pure static utility methods called from nonisolated or @Sendable closure contexts. Category 3 — marked captureFrameRowBuildQueueDepth, captureFrameRowBuildQueueHighWatermark, and frameReassemblyBuffers as nonisolated(unsafe) (protected by NSLock and dedicated serial queues respectively); marked gooseFrames and frameReassemblyKey as nonisolated func.
verification: xcodebuild -project GooseSwift.xcodeproj -scheme GooseSwift -destination "generic/platform=iOS Simulator" -configuration Debug build — BUILD SUCCEEDED.
files_changed:
  - GooseSwift/GooseRustBridge.swift
  - GooseSwift/CaptureFrameWriteQueue.swift
  - GooseSwift/HeartRateSeriesStores.swift
  - GooseSwift/GooseBLEClient.swift
  - GooseSwift/GooseAppModel.swift
  - GooseSwift/GooseAppModel+ActivityTimeline.swift
  - GooseSwift/GooseAppModel+NotificationPipeline.swift
  - GooseSwift/GooseAppModel+PacketPublishing.swift
  - GooseSwift/HealthDataStore+Utilities.swift
