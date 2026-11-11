# Phase 97: HealthKit Export — Bevel Integration - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Write WHOOP biometric data to HealthKit so Bevel and other apps can read it. Four new data types exported:
- **HR** — heart rate samples from WHOOP BLE capture
- **HRV** — RMSSD values from Goose's existing HRV pipeline
- **SpO2** — blood oxygen from decoded frames
- **Sleep sessions** — sleep stages via HKCategoryTypeIdentifierSleepAnalysis

Controlled by a toggle in More settings (default **off**). HK permission requested on first toggle-on. Write errors logged gracefully — no crash. Existing HealthKit *read* functionality unaffected.

Depends on Phase 96 (bridge error handling in place — HK write errors follow same do/catch pattern).

</domain>

<decisions>
## Implementation Decisions

### Write Timing (HK-01, HK-02, HK-03, HK-04)
- **D-01:** Write to HealthKit **after each sync completes** — batched, not per-packet. Trigger points: end of `syncBandSleepHistory()` (band sleep sync) and after overnight capture guard cycle ends. Do NOT write per BLE packet.
- **D-02:** No real-time HR streaming to HealthKit. Only post-sync batches.

### Historical Backfill (HK-01..HK-04)
- **D-03:** **No backfill on first toggle-on.** When user enables the toggle, Goose starts writing new captures from that moment forward. No historical data from SQLite is written. Simplest, no duplicate risk.
- **D-04:** `UserDefaults` key `"goose.healthkit.export.enabled"` gates all writes. Check this before every HealthKit write call.

### HRV Metric (HK-02)
- **D-05:** Write **RMSSD** to `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` (Apple's HRV type). Bevel and the WHOOP app both use RMSSD. Goose already computes RMSSD from BLE captures.

### Permissions (HK-05)
- **D-06:** Request HealthKit write permission on first toggle-on using `HKHealthStore.requestAuthorization(toShare:read:)`. Types to share: `.heartRate`, `.heartRateVariabilitySDNN`, `.oxygenSaturation`, `.sleepAnalysis`.
- **D-07:** Permission denied is handled gracefully — log via `ble.record(level:.error, ...)` and set toggle back to off. No crash.

### Settings Toggle (HK-05)
- **D-08:** Toggle in More settings (`MoreView`) — existing section for HealthKit. Default off. Persist to `UserDefaults`.
- **D-09:** Toggle triggers `HKHealthStore.requestAuthorization` on first enable (if not already authorised).

### Data Source Label
- **D-10:** HealthKit source bundle ID is `com.goose.swift` — Health app will show source name "Goose". No additional configuration needed.

### Error Handling (HK-05)
- **D-11:** All `HKHealthStore.save()` calls wrapped in do/catch per Phase 96 pattern. Errors logged with `ble.record(level:.error, source:"healthkit", title:type, body:"\(error)")`. Write failures are non-fatal — app continues.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### HealthKit Integration (existing)
- `GooseSwift/GooseSwift.entitlements` — `com.apple.developer.healthkit` entitlement (already granted)
- `GooseSwift/MoreView.swift` — More settings view — where the new toggle goes
- `GooseSwift/HealthDataStore.swift` + `HealthDataStore+Sleep.swift` — existing HK read integration; pattern to reuse for writes
- `GooseSwift/GooseAppModel.swift` + `GooseAppModel+OvernightRun.swift` — sync trigger points (band sleep sync, overnight guard)

### Requirements
- `.planning/REQUIREMENTS.md` §HK-01..HK-05
- `.planning/ROADMAP.md` §Phase 97
- GitHub issue #109 — Bevel integration

### Error Handling Pattern (from Phase 96)
- `GooseSwift/GooseAppModel+Upload.swift` — `ble.record(level:.error, ...)` pattern to reuse

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `HKHealthStore` already imported in `HealthDataStore.swift` — existing HK infrastructure
- `UserDefaults` pattern: `goose.swift.*` key namespace, `@Published` property in relevant store
- `ble.record(level:.error, source:title:body:)` — error logging from Phase 96
- `syncBandSleepHistory()` in `GooseAppModel+OvernightRun.swift` — trigger point for post-sync write

### Established Patterns
- `HKCategoryTypeIdentifierSleepAnalysis` with `HKCategoryValueSleepAnalysisAsleep` — existing sleep import uses this type; write path follows same schema
- All HK operations are async; dispatch to background queue before calling HKHealthStore

### Integration Points
- Toggle in `MoreView.swift` → `UserDefaults` → gates all HK write calls
- Post-sync trigger: add HK write call at end of `syncBandSleepHistory()` and overnight guard completion
- HR data: read from SQLite via bridge `heart_rate.*` query after sync, write to HK as `HKQuantitySample`

</code_context>

<specifics>
## Specific Ideas

- HK write helper: `GooseHealthKitExporter` (or extension on `HealthDataStore`) — single point for all HK write operations
- Permission check: `HKHealthStore().authorizationStatus(for: .heartRate) == .sharingAuthorized` before writing
- Sleep session: write each `external_sleep_sessions` row as a `HKCategorySample` covering the session time range

</specifics>

<deferred>
## Deferred Ideas

- Real-time HR streaming to HK (per BLE packet) — deferred, not in scope
- Historical backfill of existing SQLite data — deferred, not in scope

</deferred>

---

*Phase: 97-HealthKit Export — Bevel Integration*
*Context gathered: 2026-06-20*
