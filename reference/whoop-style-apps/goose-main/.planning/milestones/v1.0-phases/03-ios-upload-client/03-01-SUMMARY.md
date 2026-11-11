---
plan: 03-01
title: Rust bridge upload method + GooseUploadService
status: complete
completed_at: 2026-06-03
---

## What was built

Added `upload.get_recent_decoded_streams` to the Rust bridge and created `GooseUploadService.swift`.

### Rust bridge (bridge.rs)

- New `UploadGetRecentDecodedStreamsArgs` struct with `database_path`, `device_id`, `since_ts` (unix float)
- New `upload_get_recent_decoded_streams_bridge()` function that reads `decoded_frames` since `since_ts`, extracts biometric streams from `parsed_payload_json` (HR from NormalHistory/RawMotionK10, events from Event payloads), and returns `{hr, rr, events, battery, spo2, skin_temp, resp, gravity, frame_count}` in DecodedBatch-compatible format
- Helper functions `chrono_from_unix()`, `chrono_now()`, `days_to_ymd()` for ISO-8601 timestamp formatting without chrono dependency
- Dispatch registered in the method match block as `"upload.get_recent_decoded_streams"`

### GooseUploadService.swift

- `DispatchQueue(label: "com.goose.swift.upload", qos: .utility)` — never blocks @MainActor
- `URLSessionConfiguration.ephemeral` with `timeoutIntervalForRequest = 15`
- Three pre-condition guards: `uploadEnabled` (UserDefaults), server URL (UserDefaults), API token (Keychain)
- Calls `upload.get_recent_decoded_streams` via Rust bridge on the upload queue
- Skips empty batches (no biometric data to upload)
- Payload follows DecodedBatch contract: `device.id` (UUID string), `device.mac/name` (null), `streams`, `device_generation` ("4.0" for GEN4, "5.0" for GOOSE)
- Retry: 3 attempts, delays [1, 2, 4] seconds between retries
- `GooseUploadStatus` struct with `lastUploadTimestamp` and `pendingBatchCount` for Phase 4 FEED-03/04

### Xcode project

- `GooseUploadService.swift` registered in GooseSwift target (ID D20000000000000000000054)
- Phase 2 files `RemoteServerPersistence.swift` and `MoreRemoteServerViews.swift` also registered (were missing)

## Key files created/modified

- `Rust/core/src/bridge.rs` — +~200 lines (bridge method + helpers)
- `GooseSwift/GooseUploadService.swift` — new file (173 lines)
- `GooseSwift.xcodeproj/project.pbxproj` — 3 Swift files registered

## Verification results

- `cargo check` — zero errors, 6 pre-existing unused-variable warnings
- `xcodebuild ... build` — BUILD SUCCEEDED

## Self-Check: PASSED

All acceptance criteria met: method registered, structs present, queue label correct, guards implemented, Bearer auth, device_generation mapping, retry backoff.

## Deviations

- `row_to_json()` (SQLite) not used — SQLite bundled in rusqlite doesn't include `row_to_json`. Implemented direct extraction from `parsed_payload_json` (Rust's already-parsed `ParsedPayload` enum) instead. This is architecturally cleaner and type-safe.
- `store.immediate_transaction()` not used — queried frames directly via `store.decoded_frames_between()` which is the canonical store method, avoiding raw SQL.
