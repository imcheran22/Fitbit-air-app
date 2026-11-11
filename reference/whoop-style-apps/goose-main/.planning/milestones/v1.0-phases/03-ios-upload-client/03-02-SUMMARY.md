---
plan: 03-02
title: GooseAppModel+Upload.swift — hook + Info.plist mDNS
status: complete
completed_at: 2026-06-03
---

## What was built

Wired `GooseUploadService` into `GooseAppModel`'s lifecycle and BLE capture pipeline.

### GooseAppModel.swift changes

- `let uploadService = GooseUploadService(databasePath: HealthDataStore.defaultDatabasePath())` alongside other background services
- `@Published var uploadLastTimestamp: Date? = nil` — for Phase 4 feed display
- `@Published var uploadPendingBatchCount: Int = 0` — for Phase 4 feed display
- `var lastNotificationEvent: GooseNotificationEvent?` — stores last BLE event for deviceID access in upload hook
- `configureUploadService()` called at end of `init()` before refresh calls

### GooseAppModel+Upload.swift (new file)

- `configureUploadService()`: sets `uploadService.onStatusUpdate` callback to update `@Published` properties on `@MainActor`
- `triggerUpload(for:deviceEvent:)`: checks `result.pass && errorDescription == nil`, computes `sinceTimestamp = now - 30s`, dispatches `uploadService.upload(deviceID:deviceType:sinceTimestamp:)`

### GooseAppModel+NotificationPipeline.swift changes

- `importCapturedFrames(_:event:)`: saves `lastNotificationEvent = event` (available at frame import point)
- `handleCaptureFrameWriteResult(_:)`: after successful `capture.import.ok` log, calls `triggerUpload(for: result, deviceEvent: event)` when `result.pass && errorDescription == nil && lastNotificationEvent != nil`

### Info.plist

- Added `NSLocalNetworkUsageDescription`: "Goose usa a rede local para enviar dados WHOOP ao servidor pessoal"
- Added `NSBonjourServices`: `["_http._tcp."]`
- `NSAllowsLocalNetworking: true` already present — not duplicated
- `NSAllowsArbitraryLoads` NOT added (not needed)

## Key files created/modified

- `GooseSwift/GooseAppModel+Upload.swift` — new (23 lines)
- `GooseSwift/GooseAppModel.swift` — +5 lines (uploadService, @Published, lastNotificationEvent, init call)
- `GooseSwift/GooseAppModel+NotificationPipeline.swift` — +5 lines (lastNotificationEvent + triggerUpload hook)
- `GooseSwift/Info.plist` — +6 lines (mDNS keys)

## Verification results

- `xcodebuild ... build` — BUILD SUCCEEDED (zero errors, zero warnings)

## Self-Check: PASSED

All acceptance criteria met: configureUploadService defined and called, triggerUpload defined and hooked, guard conditions verified, onStatusUpdate configured, Info.plist keys present.
