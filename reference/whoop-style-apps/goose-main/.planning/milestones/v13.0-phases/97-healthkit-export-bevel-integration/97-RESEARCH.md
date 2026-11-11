# Phase 97: HealthKit Export — Bevel Integration - Research

**Researched:** 2026-06-20
**Domain:** HealthKit write integration (Swift) + Rust bridge extension for data read
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Write to HealthKit **after each sync completes** — batched, not per-packet. Trigger points: end of `syncBandSleepHistory()` and after overnight capture guard cycle ends. Do NOT write per BLE packet.
- **D-02:** No real-time HR streaming to HealthKit. Only post-sync batches.
- **D-03:** **No backfill on first toggle-on.** When user enables the toggle, Goose starts writing new captures from that moment forward. No historical data from SQLite is written.
- **D-04:** `UserDefaults` key `"goose.healthkit.export.enabled"` gates all writes. Check this before every HealthKit write call.
- **D-05:** Write **RMSSD** to `HKQuantityTypeIdentifierHeartRateVariabilitySDNN`. Goose already computes RMSSD from BLE captures.
- **D-06:** Request HealthKit write permission on first toggle-on using `HKHealthStore.requestAuthorization(toShare:read:)`. Types to share: `.heartRate`, `.heartRateVariabilitySDNN`, `.oxygenSaturation`, `.sleepAnalysis`.
- **D-07:** Permission denied is handled gracefully — log via `ble.record(level:.error, ...)` and set toggle back to off. No crash.
- **D-08:** Toggle in More settings (`MoreView`) — existing Section("Apple Health"). Default off. Persist to `UserDefaults`.
- **D-09:** Toggle triggers `HKHealthStore.requestAuthorization` on first enable (if not already authorised).
- **D-10:** HealthKit source bundle ID is `com.goose.swift` — Health app will show source name "Goose". No additional configuration needed.
- **D-11:** All `HKHealthStore.save()` calls wrapped in do/catch per Phase 96 pattern. Errors logged with `ble.record(level:.error, source:"healthkit", title:type, body:"\(error)")`. Write failures are non-fatal.

### Claude's Discretion
- Name and file location of the new HK exporter type (`GooseHealthKitExporter` or extension on `HealthDataStore`).
- Whether to add a new `store.hr_samples_between` bridge method or query via existing `metrics.heart_rate_features` approach.
- Exact window for HR/SpO2 writes post-sync (same overnight window as sleep sync or a different lookback).

### Deferred Ideas (OUT OF SCOPE)
- Real-time HR streaming to HK (per BLE packet)
- Historical backfill of existing SQLite data
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HK-01 | WHOOP HR samples written to HealthKit (`HKQuantityTypeIdentifierHeartRate`) | hr_samples table verified; new bridge method `store.hr_samples_between` needed; HKQuantitySample write pattern documented |
| HK-02 | WHOOP HRV written to HealthKit (`HKQuantityTypeIdentifierHeartRateVariabilitySDNN`) | daily_recovery_metrics.hrv_rmssd_ms accessible via `metrics.daily_recovery_metrics` bridge; HRV is already stored in ms |
| HK-03 | WHOOP SpO2 written to HealthKit (`HKQuantityTypeIdentifierOxygenSaturation`) | spo2_samples table stores raw red/ir; `biometrics.spo2_from_raw` converts; new bridge `store.spo2_samples_between` needed |
| HK-04 | WHOOP sleep sessions written to HealthKit (`HKCategoryTypeIdentifierSleepAnalysis`) | external_sleep_sessions table + `store.external_sleep_sessions_between` Rust fn exists; bridge method needed |
| HK-05 | Toggle in More settings, opt-in, default off; permission requested on first enable; denied handled gracefully | MoreView Section("Apple Health") confirmed; requestAuthorization pattern from HealthKitFullImporter reusable |
</phase_requirements>

---

## Summary

Phase 97 writes four WHOOP data types to HealthKit: heart rate, HRV (RMSSD), SpO2, and sleep sessions. All writes are triggered post-sync (end of `syncBandSleepHistory()` in `GooseAppModel+SleepSync.swift`), gated by a `UserDefaults` toggle, and follow the Phase 96 do/catch error handling pattern.

The existing codebase has the full HealthKit *read* infrastructure in `HealthKitFullImporter.swift` and `HealthKitSleepImporter.swift`, which provide patterns to reuse directly. The entitlement `com.apple.developer.healthkit` is already granted. The `HKHealthStore.requestAuthorization` call pattern is established in `HealthKitFullImporter.importAll()`.

The critical gap is on the **Rust bridge read side**: there are no existing bridge methods to query `hr_samples` or `spo2_samples` by time range for post-sync export. `external_sleep_sessions_between` exists as a Rust store function but has no bridge method exposed yet. This means the plan requires: (1) adding two new Rust bridge methods (`store.hr_samples_between`, `store.spo2_samples_between`) and exposing `store.external_sleep_sessions_between`, OR (2) computing SpO2 from raw in Swift directly using stored daily values. The HRV path is the only one that has a fully working bridge already (`metrics.daily_recovery_metrics`).

**Primary recommendation:** Create a single `GooseHealthKitExporter.swift` file (not an extension on `HealthDataStore`) that owns all HK write logic. Add `store.hr_samples_between` and `store.spo2_samples_between` bridge methods to the Rust side. Call the exporter at the end of `syncBandSleepHistory()`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Toggle UI | Frontend (SwiftUI/MoreView) | — | Settings toggle lives in `MoreView` Section("Apple Health") |
| Toggle persistence | App state (UserDefaults) | — | `goose.healthkit.export.enabled` key; consistent with existing `goose.swift.*` pattern |
| HK permission request | App model (GooseHealthKitExporter) | — | HKHealthStore.requestAuthorization is an async call; must NOT be on @MainActor inline |
| HR/SpO2 data read | Rust bridge (store.hr_samples_between / store.spo2_samples_between) | — | Raw samples live in SQLite; bridge is the only read path |
| HRV data read | Rust bridge (metrics.daily_recovery_metrics) | — | hrv_rmssd_ms is in daily_recovery_metrics; existing bridge already exposes this |
| Sleep session read | Rust bridge (new store.external_sleep_sessions_between) | — | Store fn exists; bridge method missing |
| HK write | App model (GooseHealthKitExporter) | — | HKHealthStore.save() is async; background queue; non-fatal errors |
| Error logging | App model (ble.record pattern) | — | Phase 96 established pattern; same convention |

---

## Standard Stack

### Core (no new external dependencies — all existing)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| HealthKit | iOS SDK (built-in) | Write HK samples | Already imported via `#if canImport(HealthKit)` in MoreView; entitlement granted |
| Foundation | iOS SDK (built-in) | Date, UserDefaults | Universal |
| rusqlite | 0.37 (bundled) | SQLite reads for hr_samples, spo2_samples | Already in Cargo.toml; no new dep |

**No new package dependencies.** This phase is purely additive Swift + Rust code within the existing stack.

---

## Package Legitimacy Audit

> No new packages installed in this phase. All code uses existing SDK and Cargo dependencies.

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious SUS:** none

---

## Architecture Patterns

### System Architecture Diagram

```
syncBandSleepHistory() completes
        |
        v
UserDefaults.bool("goose.healthkit.export.enabled") == true?
        |YES
        v
GooseHealthKitExporter.exportAfterSleepSync(
    dbPath: String,
    deviceId: String,
    overnightStart: Double,
    overnightEnd: Double,
    bridge: GooseRustBridge
)
        |
        +-----> bridge.requestAsync("store.hr_samples_between", ...)
        |               --> [HKQuantitySample(.heartRate)] --> HKHealthStore.save()
        |
        +-----> bridge.requestAsync("metrics.daily_recovery_metrics", ...)
        |               --> [HKQuantitySample(.heartRateVariabilitySDNN)] --> HKHealthStore.save()
        |
        +-----> bridge.requestAsync("store.spo2_samples_between", ...)  [new bridge]
        |               --> biometrics.spo2_from_raw per sample
        |               --> [HKQuantitySample(.oxygenSaturation)] --> HKHealthStore.save()
        |
        +-----> bridge.requestAsync("store.external_sleep_sessions_between", ...)  [new bridge]
                        --> [HKCategorySample(.sleepAnalysis)] --> HKHealthStore.save()

All HKHealthStore.save() calls:
  - Dispatched on a background Task (NOT @MainActor)
  - Wrapped in do/catch
  - Errors: ble.record(level:.error, source:"healthkit", title:type, body:"\(error)")
  - Non-fatal — app continues
```

### Recommended Project Structure

New files:
```
GooseSwift/
├── GooseHealthKitExporter.swift    # New: all HK write logic; #if canImport(HealthKit) guard
Rust/core/src/bridge/
├── store.rs  (new, or added to capture.rs)  # store.hr_samples_between, store.spo2_samples_between, store.external_sleep_sessions_between
```

Modified files:
```
GooseSwift/
├── GooseAppModel+SleepSync.swift   # Add GooseHealthKitExporter call at end of syncBandSleepHistory()
├── MoreView.swift                  # Add Toggle to Section("Apple Health")
GooseSwift.xcodeproj/project.pbxproj  # Register GooseHealthKitExporter.swift
```

### Pattern 1: HKQuantitySample write (HR and HRV)

```swift
// Source: HealthKitFullImporter.swift pattern + Apple HealthKit docs [ASSUMED]
// Dispatch to background — never call HKHealthStore from @MainActor inline
let type = HKQuantityType(.heartRate)
let unit = HKUnit.count().unitDivided(by: .minute())
let sample = HKQuantitySample(
  type: type,
  quantity: HKQuantity(unit: unit, doubleValue: Double(bpm)),
  start: date,
  end: date
)
try await hkStore.save(sample)
```

```swift
// HRV — RMSSD in milliseconds
// Source: [ASSUMED] Apple docs for heartRateVariabilitySDNN
let type = HKQuantityType(.heartRateVariabilitySDNN)
let unit = HKUnit.secondUnit(with: .milli)
let sample = HKQuantitySample(
  type: type,
  quantity: HKQuantity(unit: unit, doubleValue: rmssdMs / 1000.0),  // HK expects seconds
  start: sessionStart,
  end: sessionEnd
)
try await hkStore.save(sample)
```

**Critical detail:** `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` expects the value in **seconds**, not milliseconds. The bridge returns `hrv_rmssd_ms` in milliseconds — divide by 1000 before writing. [ASSUMED — verify against Apple docs before implementation]

### Pattern 2: HKCategorySample write (sleep)

```swift
// Source: [ASSUMED] Apple docs for sleepAnalysis
// external_sleep_sessions has start_time_unix_ms and end_time_unix_ms
let type = HKCategoryType(.sleepAnalysis)
let sample = HKCategorySample(
  type: type,
  value: HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
  start: Date(timeIntervalSince1970: session.startUnixMs / 1000.0),
  end: Date(timeIntervalSince1970: session.endUnixMs / 1000.0)
)
try await hkStore.save(sample)
```

**Note:** Use `.asleepUnspecified` (iOS 16+) not the deprecated `.asleep` for multi-stage compatibility. [ASSUMED]

### Pattern 3: requestAuthorization (reuse from HealthKitFullImporter)

```swift
// Source: GooseSwift/HealthKitFullImporter.swift lines 40-51 [VERIFIED: codebase]
let store = HKHealthStore()
let shareTypes: Set<HKSampleType> = [
  HKQuantityType(.heartRate),
  HKQuantityType(.heartRateVariabilitySDNN),
  HKQuantityType(.oxygenSaturation),
  HKCategoryType(.sleepAnalysis),
]
try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
  store.requestAuthorization(toShare: shareTypes, read: []) { ok, err in
    if let err { cont.resume(throwing: err) } else { cont.resume() }
  }
}
```

### Pattern 4: UserDefaults toggle (per existing goose.swift.* namespace)

```swift
// Source: GooseSwift/GooseAppModel+SleepSync.swift line 8 + HealthDataStore.swift lines 117-125 [VERIFIED: codebase]
static let hkExportEnabledKey = "goose.healthkit.export.enabled"

// In MoreView.swift — add to Section("Apple Health"):
Toggle("Export to Apple Health", isOn: $hkExportEnabled)
  .onChange(of: hkExportEnabled) { _, newValue in
    if newValue {
      Task { await model.enableHealthKitExport() }
    }
  }
```

### Pattern 5: Rust bridge method addition

```rust
// Source: Rust/core/src/bridge/capture.rs lines 321-328 [VERIFIED: codebase]
// Pattern for store.hr_samples_between (new method in bridge/store.rs or bridge/capture.rs):
#[derive(Debug, Deserialize)]
struct HrSamplesBetweenArgs {
    database_path: String,
    device_id: String,
    start_ts: f64,  // Unix seconds (same as hr_samples.ts column)
    end_ts: f64,
}

// Return: { "rows": [{"ts": f64, "bpm": i64}, ...] }
// SQL: SELECT ts, bpm FROM hr_samples WHERE device_id=?1 AND ts>=?2 AND ts<?3 ORDER BY ts
```

The BRIDGE_METHODS constant is kept in sync by a test (`tests::bridge_methods_constant_matches_dispatcher`). Any new method must be added to the `BRIDGE_METHODS` array in `bridge/mod.rs` AND added to the match arm dispatcher. [VERIFIED: codebase — bridge/mod.rs lines 71-553]

### Pattern 6: MoreView toggle integration (existing Apple Health section)

The Section("Apple Health") at lines 51-74 of `MoreView.swift` currently has only one Button ("Import from Apple Health"). The new HK export toggle goes in this same section. [VERIFIED: codebase]

```swift
// In Section("Apple Health"):
Toggle("Export WHOOP data to Health", isOn: exportEnabled)
  .onChange(of: exportEnabled) { ... }
```

`exportEnabled` should be `@AppStorage("goose.healthkit.export.enabled") private var exportEnabled = false` — consistent with other `@AppStorage` keys in the view. [VERIFIED pattern: MoreView.swift lines 15-19]

### Pattern 7: Xcode project file registration

New Swift files must be registered in `project.pbxproj` with both a `PBXFileReference` entry and a `PBXBuildFile` entry. The pattern from existing HK files:

```
A10000000000000000000041 /* HealthKitFullImporter.swift in Sources */ = {isa = PBXBuildFile; fileRef = A20000000000000000000041 /* HealthKitFullImporter.swift */; };
A20000000000000000000041 /* HealthKitFullImporter.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = HealthKitFullImporter.swift; sourceTree = "<group>"; };
```

[VERIFIED: codebase — project.pbxproj grep]

### Anti-Patterns to Avoid

- **Calling HKHealthStore from @MainActor inline:** HKHealthStore operations are blocking/async. Always dispatch to a background `Task`. The `GooseRustBridge` architectural constraint (bridge is synchronous) applies equally — never call on @MainActor. [VERIFIED: CLAUDE.md architectural constraints]
- **Writing per BLE packet:** Decided against (D-02). Only post-sync batches.
- **Importing HealthKit without `#if canImport(HealthKit)`:** Existing codebase wraps all HealthKit in this guard (MoreView.swift line 6, HealthDataStore+Sleep.swift line 6). Must maintain the same guard in GooseHealthKitExporter.swift.
- **HRV in wrong unit:** Apple's `heartRateVariabilitySDNN` type expects seconds. `daily_recovery_metrics.hrv_rmssd_ms` is stored in milliseconds. Must divide by 1000.
- **Using deprecated sleep value `.asleep`:** Use `.asleepUnspecified` for iOS 16+.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SpO2 from raw | Custom photopletysmography algorithm | `biometrics.spo2_from_raw` bridge method | Already implemented with calibration in Rust |
| Authorization UI | Custom permission screen | `HKHealthStore.requestAuthorization` | System handles the auth sheet |
| HRV computation | Re-derive from RR intervals post-sync | Read `hrv_rmssd_ms` from `daily_recovery_metrics` | Already computed and stored by the nightly pipeline |
| Duplicate prevention | Custom dedup logic | HealthKit's source+device metadata deduplication | HK natively prevents exact-same-sample duplicates from the same source |

---

## Data Sources and Bridge Gap Analysis

### What exists today [VERIFIED: codebase]

| Data Type | SQLite Table | Columns | Bridge Method | Status |
|-----------|-------------|---------|---------------|--------|
| Heart rate | `hr_samples` | `device_id, ts (Unix s), bpm` | **None** — no read bridge | MISSING — must add |
| HRV RMSSD | `daily_recovery_metrics` | `hrv_rmssd_ms, date_key` | `metrics.daily_recovery_metrics` (start/end unix_ms args) | EXISTS |
| SpO2 | `spo2_samples` | `device_id, ts, red, ir, contact` | `biometrics.spo2_from_raw` (single sample) — no batch range | MISSING — must add |
| Sleep session | `external_sleep_sessions` | `sleep_id, start_time_unix_ms, end_time_unix_ms, source` | Store fn `external_sleep_sessions_between` exists in Rust but **no bridge method** | MISSING — must expose |

### New bridge methods required

1. **`store.hr_samples_between`** — args: `database_path, device_id, start_ts, end_ts` — returns `{"rows": [{"ts": f64, "bpm": i64}]}`
2. **`store.spo2_samples_between`** — args: `database_path, device_id, start_ts, end_ts` — returns raw red/ir rows; Swift side calls `biometrics.spo2_from_raw` per sample, OR Rust computes SpO2 inline
3. **`store.external_sleep_sessions_between`** — args: `database_path, start_time_unix_ms, end_time_unix_ms` — wraps existing `GooseStore::external_sleep_sessions_between`; returns `[{sleep_id, start_time_unix_ms, end_time_unix_ms, source}]`

**Alternative for SpO2:** Instead of returning raw red/ir per row and calling `biometrics.spo2_from_raw` from Swift N times, add inline SpO2 computation in `store.spo2_samples_between` so it returns `[{"ts": f64, "spo2_percent": f64}]` directly. This is cleaner and avoids N round-trips through FFI.

### HRV data path detail [VERIFIED: codebase]

`metrics.daily_recovery_metrics` bridge args are `start_time_unix_ms` and `end_time_unix_ms`. The overnight window is already computed in `GooseAppModel+SleepSync.swift` as `(overnightStart, overnightEnd)` in Unix seconds. Convert: `Int64(overnightStart * 1000)` → `start_time_unix_ms`. Each row has `hrv_rmssd_ms`, `date_key`. Only rows where `hrv_rmssd_ms != nil` should be written. Write one `HKQuantitySample` per row with `start = end = midnight of date_key`.

---

## Common Pitfalls

### Pitfall 1: HKHealthStore.save() batch vs. individual
**What goes wrong:** Saving samples one-by-one in a loop makes N HK write calls; can be slow and is not idiomatic.
**Why it happens:** Copy-paste from single-sample patterns.
**How to avoid:** Use `HKHealthStore.save(_ objects: [HKObject], withCompletion:)` to save all samples of a type in one call. [ASSUMED]
**Warning signs:** N individual `try await store.save(sample)` calls inside a loop.

### Pitfall 2: HRV unit mismatch (ms vs. s)
**What goes wrong:** Writing `hrv_rmssd_ms` (e.g., 42.5) directly to HealthKit as seconds produces readings of 42,500 ms — clearly wrong values shown in Health app.
**Why it happens:** Bridge stores ms; HK expects seconds for `heartRateVariabilitySDNN`.
**How to avoid:** Divide by 1000: `HKQuantity(unit: HKUnit.secondUnit(with: .milli), doubleValue: rmssdMs)` — actually use millisecond unit if available, OR divide by 1000 and use seconds unit. [ASSUMED — verify]
**Warning signs:** HRV readings in the Health app that are 1000x too large.

### Pitfall 3: #if canImport(HealthKit) guard missing
**What goes wrong:** Compilation fails on macOS simulators or non-HealthKit targets.
**Why it happens:** Forget to guard new file the same way as existing HK files.
**How to avoid:** Wrap the entire `GooseHealthKitExporter.swift` contents (or the import) in `#if canImport(HealthKit)`.
**Warning signs:** Build error on non-iOS target.

### Pitfall 4: spo2_samples are raw photopletysmography counts — not percentages
**What goes wrong:** Writing `red` or `ir` values directly to HK as `oxygenSaturation` produces values like 128000 (%). 
**Why it happens:** Mistaking raw PPG counts for computed SpO2 %.
**How to avoid:** Must pass through `biometrics.spo2_from_raw(red:ir:)` bridge before writing to HK. SpO2 samples where `spo2_from_raw` returns nil (low confidence) must be skipped.
**Warning signs:** SpO2 values outside [0.0, 1.0] range (HK expects a fraction, e.g. 0.97 for 97%).

### Pitfall 5: BRIDGE_METHODS constant out of sync with dispatcher
**What goes wrong:** A Cargo test `bridge_methods_constant_matches_dispatcher` fails if new bridge methods are added to the dispatcher but not to the `BRIDGE_METHODS` constant, or vice versa.
**Why it happens:** Adding match arm without updating the constant array.
**How to avoid:** Always update both: (1) the `BRIDGE_METHODS` constant in `bridge/mod.rs` and (2) the match arm in the dispatcher.
**Warning signs:** `cargo test` failure in Rust tests.

### Pitfall 6: Toggle onChange calling requestAuthorization on every toggle change
**What goes wrong:** `requestAuthorization` fires on every `onChange`, including when the toggle is turned off.
**Why it happens:** Naive onChange handler.
**How to avoid:** Only call `requestAuthorization` when `newValue == true`. When turning off, only update UserDefaults.

### Pitfall 7: Xcode project.pbxproj not updated
**What goes wrong:** New `GooseHealthKitExporter.swift` file is on disk but not compiled because it's not registered in the project.
**Why it happens:** Creating a Swift file via `Write` tool doesn't auto-register in Xcode.
**How to avoid:** Add both PBXFileReference and PBXBuildFile entries to `project.pbxproj`, and add the file reference to the GooseSwift group. Follow the exact pattern used for `HealthKitFullImporter.swift`.

---

## Code Examples

### GooseHealthKitExporter skeleton

```swift
// GooseSwift/GooseHealthKitExporter.swift
// Source: patterns from HealthKitFullImporter.swift [VERIFIED: codebase]

#if canImport(HealthKit)
import Foundation
import HealthKit

enum GooseHealthKitExporter {
  static let exportEnabledKey = "goose.healthkit.export.enabled"

  static var isExportEnabled: Bool {
    UserDefaults.standard.bool(forKey: exportEnabledKey)
  }

  // Called on first toggle-on. Returns true if auth succeeded.
  static func requestAuthorization() async throws {
    let store = HKHealthStore()
    let shareTypes: Set<HKSampleType> = [
      HKQuantityType(.heartRate),
      HKQuantityType(.heartRateVariabilitySDNN),
      HKQuantityType(.oxygenSaturation),
      HKCategoryType(.sleepAnalysis),
    ]
    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      store.requestAuthorization(toShare: shareTypes, read: []) { _, err in
        if let err { cont.resume(throwing: err) } else { cont.resume() }
      }
    }
  }

  // Main export entry point — called at end of syncBandSleepHistory()
  static func exportAfterSleepSync(
    dbPath: String,
    deviceId: String,
    startTs: Double,  // Unix seconds
    endTs: Double,
    bridge: GooseRustBridge,
    errorLogger: @escaping (String, String) -> Void
  ) async {
    guard isExportEnabled else { return }
    guard HKHealthStore.isHealthDataAvailable() else { return }
    let hkStore = HKHealthStore()
    // ... export each type, catching errors
  }
}
#endif
```

### Rust bridge method (hr_samples_between)

```rust
// Rust/core/src/bridge/capture.rs or a new bridge/store.rs
// Source: pattern from SyncBackfillStreamsArgs [VERIFIED: codebase]

#[derive(Debug, Deserialize)]
struct HrSamplesBetweenArgs {
    database_path: String,
    device_id: String,
    start_ts: f64,
    end_ts: f64,
}

fn hr_samples_between_bridge(args: HrSamplesBetweenArgs) -> GooseResult<serde_json::Value> {
    let store = GooseStore::open(&args.database_path)?;
    let conn = store.connection()?;
    let mut stmt = conn.prepare(
        "SELECT ts, bpm FROM hr_samples WHERE device_id=?1 AND ts>=?2 AND ts<?3 ORDER BY ts"
    )?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map(rusqlite::params![args.device_id, args.start_ts, args.end_ts], |row| {
            Ok(json!({"ts": row.get::<_, f64>(0)?, "bpm": row.get::<_, i64>(1)?}))
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(json!({"rows": rows}))
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `HKCategoryValueSleepAnalysis.asleep` | `.asleepUnspecified` (iOS 16+) | Avoids deprecation warning; correct for multi-stage sleep |
| Per-sample HK save | Batch `save(_ objects:)` | Single HK call per type |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `heartRateVariabilitySDNN` HK type expects seconds; must divide `hrv_rmssd_ms` by 1000 | Code Examples | HRV values written 1000x wrong; data corrupt in Health app |
| A2 | `HKCategoryValueSleepAnalysis.asleepUnspecified` is correct value for iOS 26 | Code Examples | Deprecation warning or compile error |
| A3 | Batch `HKHealthStore.save(_ objects:)` call signature is `([HKObject], withCompletion:)` | Pitfalls | Must use individual save calls instead |
| A4 | SpO2 HK unit is a fraction (0.0–1.0), not percent (0–100) | Pitfalls | Values written as e.g. 97.0 when HK expects 0.97 |
| A5 | `biometrics.spo2_from_raw` returns nil for low-confidence readings (not a hard error) | Architecture | Must handle nil/absent result per sample |

---

## Open Questions (RESOLVED)

1. **SpO2 bridge strategy: per-sample FFI roundtrip vs. inline Rust computation**
   - RESOLVED: Inline Rust computation in `store.spo2_samples_between` — returns `[{ts, spo2_percent}]` directly. Avoids N FFI round-trips. Plan 97-01 implements this.

2. **HRV: write one sample per day or one per overnight window?**
   - RESOLVED: Use sleep session start/end times as the HRV sample interval. Plan 97-02 uses sleep session timestamps for HRV HKQuantitySample date range.

---

## Environment Availability

> Step 2.6: All required capabilities are built into the iOS SDK. No external tools needed.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| HealthKit framework | HK write operations | Yes (entitlement already granted) | iOS 26 SDK | — |
| Rust toolchain | New bridge methods | Yes (Cargo.lock present) | MSRV 1.96 | — |
| Xcode 26.5 | Build | Yes (local) | 26.5 | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Rust `cargo test` (integration tests in `Rust/core/tests/`) |
| Config file | `Rust/core/Cargo.toml` |
| Quick run command | `cargo test -p goose-core --lib 2>&1 | tail -5` |
| Full suite command | `cargo test -p goose-core 2>&1 | tail -20` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HK-01 | `store.hr_samples_between` returns correct rows | unit (Rust) | `cargo test -p goose-core hr_samples_between` | ❌ Wave 0 |
| HK-03 | `store.spo2_samples_between` returns SpO2 % rows | unit (Rust) | `cargo test -p goose-core spo2_samples_between` | ❌ Wave 0 |
| HK-04 | `store.external_sleep_sessions_between` bridge returns sessions | unit (Rust) | `cargo test -p goose-core external_sleep_sessions_between_bridge` | ❌ Wave 0 |
| HK-05 | Bridge METHODS constant includes new methods | unit (Rust) | `cargo test -p goose-core bridge_methods_constant_matches_dispatcher` | ✅ (will auto-run) |
| HK-02 | HRV path: existing `metrics.daily_recovery_metrics` returns hrv_rmssd_ms | existing test | `cargo test -p goose-core daily_recovery` | ✅ |

### Sampling Rate
- **Per task commit:** `cargo test -p goose-core --lib 2>&1 | tail -5`
- **Per wave merge:** `cargo test -p goose-core 2>&1 | tail -20`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `Rust/core/tests/` — test for `store.hr_samples_between` bridge method
- [ ] `Rust/core/tests/` — test for `store.spo2_samples_between` bridge method
- [ ] `Rust/core/tests/` — test for `store.external_sleep_sessions_between` bridge method

*(Swift-side HK write cannot be unit tested without mocking HKHealthStore; verify via manual simulator test in UAT)*

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | HK auth is system-managed via `requestAuthorization` |
| V3 Session Management | No | No session concept |
| V4 Access Control | Yes | Toggle check (`isExportEnabled`) gates every write — no HK write without user opt-in |
| V5 Input Validation | Yes | Bridge data: `bpm` is `INTEGER`, `ts` is `REAL` — validated by SQLite schema; SpO2 `spo2_from_raw` returns nil on invalid input |
| V6 Cryptography | No | No crypto involved |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Writing stale/incorrect data to Health app | Tampering | Gate writes behind toggle check AND `HKHealthStore.isHealthDataAvailable()` check |
| HK permission prompt loop | DoS | Only call `requestAuthorization` on toggle-on, not on every app launch |
| Crash on HK permission denied | DoS | Wrap in do/catch; log error; set toggle back to off; no crash |

---

## Sources

### Primary (HIGH confidence)
- `GooseSwift/GooseAppModel+SleepSync.swift` — exact trigger point, overnightWindow, device_id, dbPath pattern [VERIFIED: codebase]
- `GooseSwift/HealthKitFullImporter.swift` — requestAuthorization pattern, HK store creation [VERIFIED: codebase]
- `GooseSwift/MoreView.swift` — Section("Apple Health") structure, @AppStorage pattern [VERIFIED: codebase]
- `Rust/core/src/store/mod.rs` — hr_samples schema (device_id, ts, bpm), spo2_samples schema (red, ir, contact) [VERIFIED: codebase]
- `Rust/core/src/store/sleep.rs` — external_sleep_sessions_between store fn exists [VERIFIED: codebase]
- `Rust/core/src/store/metrics.rs` — daily_recovery_metrics.hrv_rmssd_ms column confirmed [VERIFIED: codebase]
- `Rust/core/src/bridge/mod.rs` — BRIDGE_METHODS constant + dispatcher pattern + BRIDGE_METHODS test [VERIFIED: codebase]
- `GooseSwift.xcodeproj/project.pbxproj` — PBXBuildFile + PBXFileReference registration pattern [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- Apple HealthKit framework constants (HKQuantityTypeIdentifier names, unit conventions) [ASSUMED — training knowledge, verify with Apple docs before implementation]

### Tertiary (LOW confidence)
- HRV unit is seconds not milliseconds for heartRateVariabilitySDNN [ASSUMED]
- Batch save API signature [ASSUMED]
- asleepUnspecified correct for iOS 16+ [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Codebase facts (trigger points, schemas, bridge patterns): HIGH — directly verified in source
- HealthKit API details (unit conventions, batch save, sleep value enum): LOW/ASSUMED — not directly verifiable without Apple docs; must be confirmed during implementation
- Architecture (new file, bridge additions): HIGH — follows established patterns exactly

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (stable iOS SDK; 30-day window)
