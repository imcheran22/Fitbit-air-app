# Phase 60: Band-First Sync - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace Goose's overnight BLE polling model with WHOOP's band-first sync model — iOS only, no server changes. The band stores data onboard; the app fetches it opportunistically on foreground entry and via BGAppRefreshTask, exactly as WHOOP does. Remove the overnight guard feature entirely.

**In scope:**
- Remove GooseAppModel+OvernightRun.swift (~815 lines) and all overnight guard state
- Remove overnight guard UI card from More tab
- Remove overnightRawSpool and overnight session directory from GooseAppModel
- Add GooseAppModel+BandFirstSync.swift with foreground sync trigger (scenePhase == .active)
- 30-minute cooldown guard stored in UserDefaults
- Register BGAppRefreshTask in Info.plist and implement handler (scan+connect, 20s timeout)
- Review and clean up GooseAppModel+Lifecycle.swift (overnightGuardActive dependencies)

**Out of scope:**
- Server-side APNs integration (device_tokens table, POST /v1/device-token, apns.py) — server remains backup only
- Silent push notifications from server to iOS
- iOS registerForRemoteNotifications / push handler
- APNs device token storage
- Watermark-based upload optimization (stretch goal, deferred)
- BTHR (Background Tracked Heart Rate) — not needed

</domain>

<decisions>
## Implementation Decisions

### Overnight Guard Removal
- **D-01:** Remove GooseAppModel+OvernightRun.swift completely — the overnight guard feature is deleted, not deprecated or hidden behind a flag.
- **D-02:** Remove overnight guard card/section from More tab entirely. No replacement UI in this phase.
- **D-03:** Remove overnightRawSpool from GooseAppModel and the overnight session directory from ApplicationSupport.
- **D-04:** Keep OvernightSQLiteMirrorQueue (no active use after removal, kept for potential future background insert utility).
- **D-05:** GooseAppModel+Lifecycle.swift handleBLEConnectionStateChange has overnightGuardActive dependencies — must be cleaned up as part of the overnight guard removal plan.

### Foreground Sync Trigger
- **D-06:** New dedicated method `triggerForegroundBLESync()` in a new file `GooseAppModel+BandFirstSync.swift`. Do NOT generalize `maybeScheduleMorningSleepSync()` — that method has a time-of-day gate and is sleep-import specific.
- **D-07:** Trigger condition: only fire if `ble.connectionState == "ready"` (already connected). No reconnect attempt from this path.
- **D-08:** Called from `handleAppLifecycleChange` when `phase == "active"` (the branch already exists in GooseAppModel+Lifecycle.swift).
- **D-09:** Cooldown: 30 minutes between foreground syncs.
- **D-10:** Last sync timestamp stored in UserDefaults with key `"goose.swift.lastHistorySyncAt"`. Persists across app launches — a kill+restart within 30 min does not trigger a redundant sync.

### BGAppRefreshTask
- **D-11:** Register identifier `"com.goose.swift.bg-sync"` in `Info.plist` under `BGTaskSchedulerPermittedIdentifiers`.
- **D-12:** BGAppRefreshTask handler: schedule next wakeup + attempt BLE scan+connect (device may not be connected in background).
- **D-13:** 20-second timeout for BLE scan+connect attempt in background. On timeout: cancel scan, call `completionHandler(false)`, schedule next refresh.
- **D-14:** Register `BGTask.expirationHandler` to handle OS revocation gracefully (cancel scan, call completionHandler).
- **D-15:** Same scan+connect+timeout behavior applies whether triggered by BGAppRefreshTask or (future) silent push — consistent background flow.

### Claude's Discretion
- BGAppRefreshTask scheduling interval: planner to choose a reasonable interval (e.g., 15 minutes minimum as enforced by iOS, practical value ~30 min). iOS may not honor the exact interval.
- Whether `triggerForegroundBLESync()` logs via `ble.record(...)` or OSLog: follow existing patterns in the file.
- Server has no changes in this phase — role: data backup only. No APNs integration, no device token registration, no push sending. (D-16 scope exclusion, no code needed)
- `goose-daily-ready` and `start-sync-data` push types are out of scope for this phase. The `start-sync-data` push was assessed as circular (server gets data FROM app). Deferred indefinitely. (D-17 scope exclusion, no code needed)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Ghidra Reverse Engineering Findings (primary source for band-first model)
- `.planning/ROADMAP.md` §Phase 60 — Full WHOOP binary analysis: confirmed string addresses, WHPBLEHistoricalDataManager behavior, foreground trigger, cooldown guard, SPN handler, BGAppRefreshTask pattern. MANDATORY read.

### Key Source Files to Modify
- `GooseSwift/GooseAppModel+OvernightRun.swift` — 815 lines to remove entirely
- `GooseSwift/GooseAppModel.swift` — ~50 `overnightGuard*` @Published properties to remove
- `GooseSwift/GooseAppModel+Lifecycle.swift` — `handleBLEConnectionStateChange` and `handleAppLifecycleChange` need cleanup + foreground trigger hook
- `GooseSwift/GooseAppModel+SleepSync.swift` — `maybeScheduleMorningSleepSync()` for reference (cooldown pattern) — do NOT modify
- `GooseSwift/GooseSwiftApp.swift` — BGTaskScheduler registration goes here (app launch)
- `GooseSwift/Info.plist` — Add `BGTaskSchedulerPermittedIdentifiers`

### Patterns to Follow
- `GooseSwift/RemoteServerPersistence.swift` — UserDefaults key naming pattern (`"goose.swift.*"`)
- `GooseSwift/GooseAppModel+SleepSync.swift` — cooldown guard pattern (check timestamp before acting)

### Project Constraints
- `.planning/PROJECT.md` §Constraints — No external iOS dependencies; URLSession only
- `GooseSwift/GooseSwift.entitlements` — verify `com.apple.developer.background-modes` includes `fetch` for BGAppRefreshTask

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GooseAppModel+Lifecycle.swift`: `handleAppLifecycleChange` already has an `active`/`foreground` branch — `triggerForegroundBLESync()` call goes here (line ~35 in the `else if phase == "active"` block).
- `GooseSwiftApp.swift`: scenePhase observation already wired (lines 5 + 27). BGTaskScheduler registration goes in the app init/onAppear.
- `GooseAppModel+SleepSync.swift`: `maybeScheduleMorningSleepSync()` is the reference implementation for a cooldown-guarded BLE sync — study its structure for `triggerForegroundBLESync()`.
- `RemoteServerPersistence.swift`: UserDefaults key pattern established — new key `"goose.swift.lastHistorySyncAt"` follows the same convention.
- `OvernightSQLiteMirrorQueue`: keep file but leave dormant (no callers after overnight guard removal).

### Established Patterns
- BLE commands go through `GooseBLEClient` — the foreground sync trigger calls `ble.sendHistoricalData()` (or equivalent command), not direct GATT writes.
- Cooldown guard pattern: read UserDefaults timestamp → compare to `Date()` → skip if within N minutes → execute and write new timestamp on success.
- Background task expiration: always register `BGTask.expirationHandler` before starting work.
- `ble.connectionState == "ready"` is the gate check before any BLE command (established throughout GooseAppModel).

### Integration Points
- `handleAppLifecycleChange("active")` → calls `triggerForegroundBLESync()` (new)
- `BGTaskScheduler.shared.register(forTaskWithIdentifier:)` in app init → new BGAppRefreshTask handler
- `GooseBLEClient` `sendHistoricalData` command → used by both foreground trigger and background task
- `overnightGuardActive` guard in `handleAppLifecycleChange` — REMOVE after overnight guard deletion (currently prevents sync during overnight recording; no longer needed)

</code_context>

<specifics>
## Specific Ideas

- WHOOP's cooldown guard logs: `"FETCH BLE DATA - Cancelled, last History Complete Event within %.fmin"` — Goose should log a similar OSLog message when skipping due to cooldown: e.g., `"foreground sync skipped — last sync within 30 min"`.
- WHOOP's foreground trigger logs: `"FETCH BLE DATA - Start"` and `"FETCH BLE DATA - Start From SPN"` — Goose uses `ble.record(source:title:body:)` for equivalent telemetry.
- The overnight guard UI was in the More tab and possibly ActivityView — check both when removing.
- `overnightGuardRangePollWorkItem` (DispatchWorkItem) is the specific 30s poll timer — confirmed target for removal in OvernightRun.swift.

</specifics>

<deferred>
## Deferred Ideas

- **Server-side APNs integration** — `goose-daily-ready` and `start-sync-data` push types from server. The user decided the server is backup-only for now. `start-sync-data` assessed as circular in a single-device self-hosted setup. If a home screen widget for daily metrics is added in a future phase, revisit `goose-daily-ready` payload.
- **Watermark-based upload optimization** — ROADMAP mentions this as a stretch goal (more efficient than `synced=0` scan). Deferred — `synced` flag is functionally equivalent.
- **BTHR (Background Tracked Heart Rate)** — documented in ROADMAP for reference but not relevant to this phase. Feature-flagged in WHOOP (`dwl_background_bthr`).

None — discussion stayed within phase scope otherwise.

</deferred>

---

*Phase: 60-band-first-sync-align-goose-ble-sync-architecture-with-whoop*
*Context gathered: 2026-06-11*
