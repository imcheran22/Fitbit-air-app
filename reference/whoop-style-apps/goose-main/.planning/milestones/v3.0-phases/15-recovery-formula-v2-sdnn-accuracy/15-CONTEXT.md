---
phase: 15
name: Recovery Formula V2 (SDNN Accuracy)
date: 2026-06-05
status: discussed
---

# Phase 15 Context — Recovery Formula V2 (SDNN Accuracy)

## Domain

Fix `hkRecoveryScore()` in `HealthDataStore+Snapshots.swift`: the variable `hkHRVRmssdMs` stores Apple Watch SDNN values (not RMSSD), and divides them by 1.2 (population SDNN→RMSSD approximation). This division is inaccurate because the ratio varies per individual. Use SDNN directly and update the population baseline.

Reference: [OKKHALIL3 review comment — PR #5](https://github.com/b-nnett/goose/pull/5#discussion_r3359064144)

## Decisions

### D-01: Rename hkHRVRmssdMs → hkHRVSDNNMs everywhere

**Locked:** Rename the `@Published var hkHRVRmssdMs: Double?` on `HealthDataStore` to `hkHRVSDNNMs`. Update all 3 call sites:
- `HealthDataStore+Sleep.swift` line 186: `if let v = result.hrvRmssdMs { hkHRVSDNNMs = v }`
- `HealthKitFullImporter.swift` line 7: rename `var hrvRmssdMs` → `var hkHRVSDNNMs`
- `HealthDataStore+Snapshots.swift` line 823: `guard let sdnn = hkHRVSDNNMs, sdnn > 5`
- `HealthDataStore+CoachSummaries.swift`: any read of `hkHRVRmssdMs`

The UI display label "HRV" stays unchanged — only the internal Swift variable name changes.

### D-02: Remove the /1.2 SDNN→RMSSD conversion

**Locked:** In `hkRecoveryScore()` (`HealthDataStore+Snapshots.swift`):
- Line 824: remove `let rmssdEquiv = sdnn / 1.2` — use `let sdnnValue = sdnn` (or just use `sdnn` directly)
- Line 829: remove `/ 1.2` from `hkHRVHistory.dropLast(1).suffix(60).map { $0.sdnn / 1.2 }` → `map { $0.sdnn }`
- Replace all references to `rmssdEquiv` in the function with `sdnn` (or rename to `sdnnMs`)

### D-03: Update population baseline from 40.0 to 50.0

**Locked:** Line 832: `hrvBaseline = 40.0` → `hrvBaseline = 50.0`

50 ms is the population average SDNN for healthy adults. 40 ms was the RMSSD equivalent — incorrect for SDNN.

### D-04: No changes to Rust goose_recovery_v0

The Rust `goose_recovery_v0` receives `hrv_rmssd_ms` from the Swift side via `metric_features.rs`. The Rust field name `hrv_rmssd_ms` is a naming issue but the computation is correct (it just uses the value proportionally vs. baseline). Leave Rust unchanged — this phase fixes only the Apple Watch HealthKit path in Swift.

## Canonical Refs

- `GooseSwift/HealthDataStore+Snapshots.swift` lines 810-870 — `hkRecoveryScore()` target function
- `GooseSwift/HealthDataStore.swift` — `@Published var hkHRVRmssdMs` declaration to rename
- `GooseSwift/HealthDataStore+Sleep.swift` line 186 — read site
- `GooseSwift/HealthKitFullImporter.swift` lines 7, 85 — `hrvRmssdMs` field
- `GooseSwift/HealthDataStore+CoachSummaries.swift` — any `hkHRVRmssdMs` reads

## Success Criteria

1. `hkHRVRmssdMs` no longer exists in any Swift file (renamed to `hkHRVSDNNMs`)
2. `/ 1.2` does not appear in `hkRecoveryScore()` (removed from both lines)
3. Population baseline is 50.0 ms (not 40.0)
4. `cargo test -p goose-core` passes (no Rust changes)
5. Xcode builds without errors
