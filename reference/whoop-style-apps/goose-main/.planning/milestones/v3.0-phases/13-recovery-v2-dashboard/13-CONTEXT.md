---
phase: 13
name: Recovery V2 Dashboard
date: 2026-06-05
status: discussed
---

# Phase 13 Context — Recovery V2 Dashboard

## Domain

Populate `RecoveryV2OverviewPage` with live bridge data by auto-triggering `store.runPacketScores()` on appear and on new data arrival. The dashboard UI and all data methods already exist — only the trigger is missing.

## What Already Exists (do not re-implement)

- `RecoveryV2OverviewPage` — complete dashboard with hero score, HRV, RHR, respiratory rate, SpO2, wrist temp, 7-day trend
- `recoveryScoreDisplayValue()` → `packetScoreReports["recovery"]["score_result"]["output"]["score_0_to_100"]` with HealthKit fallback
- `recoveryHRVDisplayText()` / `recoveryRestingHRDisplayText()` → bridge + fallback chain
- `recoveryTrendRowsForV2()` → uses `packetScoreReports["recovery"]["daily"]` array for 7-day trend
- `runPacketScores()` → runs `metrics.recovery_score_from_features` on `packetInputQueue.async`, stores result in `packetScoreReports["recovery"]`
- `loadBridgeCatalogsIfNeeded()` → must be called before first `runPacketScores()` to ensure algorithm definitions are loaded

**Root cause of missing data:** `RecoveryV2OverviewPage` has no `onAppear` call to `runPacketScores()`. Data exists in SQLite but computation was never triggered.

## Decisions

### D-01: Trigger runPacketScores() on appear + on packetImportRevision change

**Locked:** In `RecoveryV2OverviewPage`, add:

```swift
.onAppear {
  store.loadBridgeCatalogsIfNeeded()
  store.runPacketScores()
}
.onChange(of: model.packetImportRevision) { _, _ in
  store.runPacketScores()
}
```

Place after the existing `ZStack` modifiers (`.navigationTitle`, etc.). Pattern matches `HealthSleepOverviewViews.swift` which calls `loadBridgeCatalogsIfNeeded()` on appear.

### D-02: ProgressView while computing

**Locked:** Show a `ProgressView()` when `store.packetScoreStatus.hasPrefix("Extracting")`. Replace hero score with spinner inline:

```swift
if store.packetScoreStatus.hasPrefix("Extracting") {
  ProgressView().tint(palette.accent)
}
```

Show ONLY in the hero area (not full-screen). When `packetScoreStatus` no longer has the prefix, render `SleepV2Hero` normally.

## Canonical Refs

- `GooseSwift/HealthRecoveryStressViews.swift` lines 1-200 — `RecoveryV2OverviewPage` (target file for D-01, D-02)
- `GooseSwift/HealthDataStore+Snapshots.swift` lines 7-100 — `runPacketScores()` implementation
- `GooseSwift/HealthDataStore+CoachSummaries.swift` lines 424-435 — `recoveryScoreDisplayValue()`
- `GooseSwift/HealthSleepOverviewViews.swift` — pattern for `loadBridgeCatalogsIfNeeded()` + `runPacketScores()` on appear (follow this pattern)
- `GooseSwift/HealthDataStore.swift` line 125 — `loadBridgeCatalogsIfNeeded()`
- `GooseAppModel.swift` line 10 — `@Published var packetImportRevision: Int` (onChange trigger)

## Success Criteria

1. Opening Recovery V2 dashboard triggers `runPacketScores()` — hero score updates from 0 to real bridge value
2. When new WHOOP packets arrive (`packetImportRevision` increments), score refreshes automatically
3. While computing, a `ProgressView` appears in the hero area
4. HRV and RHR values show real numbers (not "--") when bridge data is available
5. 7-day trend rows populate from `packetScoreReports["recovery"]["daily"]`
