# Phase 63: Network Monitor & Upload Gating - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Gate all outbound uploads on network reachability using NWPathMonitor, and implement exponential-backoff retry so uploads fail visibly rather than silently when offline. Matches WHOOP's WHPNetworkMonitor pattern. A GooseNetworkMonitor wraps NWPathMonitor and publishes isReachable: Bool to GooseAppModel. Upload is skipped when isReachable == false. Upload failures due to server error (5xx) use exponential backoff (1s, 2s, 4s, max 60s). Upload gated on non-empty device token (APNs must have registered). No new UI screens — the existing upload status in GooseAppModel is used.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at Claude's discretion — pure infrastructure phase.

Key constraints from ROADMAP:
- GooseNetworkMonitor wraps NWPathMonitor, publishes isReachable: Bool to GooseAppModel
- Upload not attempted when isReachable == false
- Queued work retried automatically when connectivity returns
- 5xx failures: exponential backoff 1s, 2s, 4s, max 60s with visible error state
- Upload gated on non-empty APNs device token (already stored in Keychain from Phase 60)
- No external dependencies — Network.framework only (already available on iOS 12+)

Preferred pattern:
- GooseNetworkMonitor as a dedicated final class (analog to GooseBLEBondingManager / GooseUploadWatermark)
- Combine publisher or callback pattern (consistent with GooseBLEClient.onConnectionStateChange)
- Backoff state lives in GooseUploadService (owns upload retry)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GooseUploadService.swift` — existing upload pipeline; add isReachable gate before URLSession calls
- `GooseAppModel+Upload.swift` — triggerManualUpload / triggerForegroundBLESync; add connectivity check
- `GooseBLEReconnect.swift` — analog for backoff pattern (ReconnectBackoff already in codebase)
- `GooseBLEBondingManager.swift` — analog for dedicated monitor class with callback

### Established Patterns
- `final class` for subsystem monitors
- `onStateChange: ((Bool) -> Void)?` callback (not Combine — consistent with existing patterns)
- `DispatchQueue` for NWPathMonitor delivery
- `goose.swift.network.*` would be the key namespace — but no UserDefaults needed here (runtime state only)

### Integration Points
- `GooseAppModel` — add `private(set) var isNetworkReachable: Bool` property
- `GooseAppModel+Upload.swift` — gate `triggerManualUpload` on `isNetworkReachable`
- `GooseUploadService.swift` — add exponential backoff for 5xx errors
- `GooseSwiftApp.swift` or `GooseAppModel.init` — start the monitor on launch

</code_context>

<specifics>
## Specific Ideas

Backoff implementation: simple `DispatchQueue.asyncAfter` with doubling delay, capped at 60s. Existing `ReconnectBackoff` in GooseBLEReconnect.swift is the analog — reuse its structure, not its instance.

APNs token gate: `GooseAppModel.apnsDeviceToken` (String?) — already stored from Phase 60 registration. Gate: `guard apnsDeviceToken != nil else { return }` before upload. Soft gate — log a warning, don't error.

</specifics>

<deferred>
## Deferred Ideas

- WHPAccountCanUploadDataStatusChanged equivalent (account authorisation gate) — Goose uses token auth, not account state
- Per-request retry with Retry-After header — stretch goal
- Offline queue persistence (SQLite) — current in-memory retry is sufficient for v9.0

</deferred>
