---
name: noop-feature-import
description: NoopApp/noop feature import analysis — Breathe, Interval Timer, WHOOP CSV import, YearHeatStrip, Notification thresholds, Metric Explorer, Correlation Engine
metadata:
  type: seed
  trigger_condition: when planning v10.0 milestone scope
  planted_date: 2026-06-11
---

## Idea

Port a curated set of features from the open-source `NoopApp/noop` project into Goose. NOOP is a macOS/Android/iOS WHOOP companion app that independently reverse-engineered the same protocol — and explicitly credits Goose (`b-nnett/goose`) for WHOOP 5.0 BLE work. Their analytics packages (StrandAnalytics), import utilities (StrandImport), and UI screens (Strand/Screens/) are a validated reference and partial port source.

**Source:** `https://github.com/NoopApp/noop` — PolyForm Noncommercial license (personal use allowed).

## What Goose already has (do NOT re-implement)

| NOOP feature | Goose equivalent |
|---|---|
| ReadinessEngine (ACWR, monotony, HRV z-score) | `HealthDataStore+Readiness.swift` + `metrics.goose_readiness_v1` in Rust |
| HealthKit XML importer | `HealthKitFullImporter.swift` + `HealthKitSleepImporter.swift` (uses API, not XML export) |
| Sleep trends + insights | `SleepV2InsightViews.swift`, `HealthSleepTrendViews.swift`, `SleepV2BevelTrendViews.swift` |
| Sparkline chart | `HealthSparkline` in `HealthChartPrimitives.swift` |
| Stress charts | `HealthDataStore+StressEnergy.swift` + `HealthStressCharts.swift` |
| WhoopProtocol package (BLE parsing) | Goose Rust core — Goose is the cited source for WHOOP 5.0 |
| StrandAnalytics algorithms (HRV, recovery, strain, sleep) | Goose Rust core — more mature |

## Features worth porting — prioritised

### Tier 1 — Implement first (highest value, bounded scope)

#### 1. Buzz wire-up — shared prerequisite for Breathe + Intervals + Alarm
**Source:** `HapticPayloads.swift` in NOOP (fully reverse-engineered, confirmed on hardware)

Add `func buzz(loops: UInt8)` to `GooseBLEClient+Commands.swift`:
- Payload: `[0x01, 0x2F, 0x98, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, loops]`
- Command: `0x13` (RUN_HAPTIC_PATTERN_MAVERICK)
- Frame: `puffinCommandFrame(cmd: 0x13, seq:, payload:)` — Goose already knows this format
- File: `GooseSwift/GooseBLEClient+Commands.swift`
- Effort: ~2 hours

#### 2. Breathe screen — HRV haptic biofeedback
**Source:** `Strand/Screens/BreathingView.swift` (18KB, pure SwiftUI, no external deps)

3 breath presets: Relax 4-6, Coherence 5.5, Box 4-4. Animated orb expands/contracts with breath phase. Live RMSSD computed from rolling R-R buffer. Haptic cues: 1 buzz inhale, 2 buzzes exhale.

Adaptation needed:
- Replace `model.buzz(loops:)` → `bleClient.buzz(loops:)` via `GooseAppModel`
- Replace `live.rr` → R-R intervals from `WhoopDataSignalPipeline` / live BLE stream
- Replace `StrandDesign` components with Goose equivalents (cards, pills, font)
- Remove `live.bonded` → use `GooseAppModel.connectionState`

**Depends on:** buzz wire-up (above)
**Effort:** 2 days

#### 3. Interval Timer — silent haptic HIIT timer
**Source:** `Strand/Screens/IntervalTimerView.swift` (15KB, pure SwiftUI)

Configurable work/rest/rounds. Haptic patterns: 3 loops (WORK start), 1 loop (REST start), countdown 1 loop × 3 at last 3 seconds, 5 loops (session complete). Falls back to visual-only without strap bonded.

Adaptation: same as Breathe — replace `model.buzz()` and `StrandDesign` refs.

**Depends on:** buzz wire-up (above)
**Effort:** 1 day

#### 4. WHOOP CSV import
**Source:** `StrandImport/WhoopExportImporter.swift` (16.8KB) + `StrandImport/CSVParsing.swift` (19.7KB)

Parses WHOOP official app export ZIP: `physiological_cycles.csv`, `sleeps.csv`, `workouts.csv`, `journal_entries.csv`. Header-name-driven parser tolerant to WHOOP 4/5/MG variations.

Adaptation needed:
- Replace GRDB persistence with Rust bridge calls (`bridge.import_whoop_cycle_row`, etc. — new bridge methods to create)
- Add file picker UI in MoreView or DataSources screen
- Show progress + row count

**No prerequisites.** Works independently of buzz/haptic.
**Effort:** 2-3 days

### Tier 2 — Next milestone additions

#### 5. YearHeatStrip — calendar heatmap
**Source:** `StrandDesign/YearHeatStrip.swift` (11.5KB, pure SwiftUI, iOS-compatible)

GitHub-contributions-style heatmap for any `[(Date, Double)]` series. Can display recovery score, strain, sleep duration across a full year. No AppKit dependencies.

**Effort:** 0.5 days (near-direct port)

#### 6. Notification thresholds UI
**Source:** `Strand/Screens/NotificationSettingsView.swift` (13.7KB)

Per-metric configurable alert thresholds (HR above X, HRV below Y, etc.). Toggle on/off per metric. Complements the v9.0 notifications phase (`GooseAppModel+NotificationPipeline.swift`).

**Effort:** 1-2 days

#### 7. Hypnogram component
**Source:** `StrandDesign/Hypnogram.swift` (11KB, SwiftUI)

Sleep stage visualisation (Wake/REM/Light/Deep) as a stepped timeline chart. Goose has sleep staging in Rust — the visualisation layer is the gap.

**Effort:** 1 day (component) + existing staging data already available via bridge

### Tier 3 — Data exploration (larger scope, plan as dedicated phase)

#### 8. Metric Explorer + Compare
**Source:** `Strand/Screens/MetricExplorerView.swift` (28KB) + `CompareView.swift` (33KB)

Ad-hoc exploration of any metric over time; overlay two metrics on a shared timeline. Requires a dynamic metric catalog exposed via bridge.

**Effort:** 5-7 days

#### 9. Correlation Engine + Insights
**Source:** `StrandAnalytics/CorrelationEngine.swift` (7.6KB) + `InsightsView.swift` (26.8KB) + `BehaviorInsights.swift` (9.7KB)

Pearson r, OLS regression, lagged correlations. "Strain yesterday → HRV today?" type insights derived from the user's own history. Algorithm best ported to Rust alongside existing analytics.

**Effort:** 2 days (Rust algorithm) + 3 days (UI)

### Skip entirely

| Feature | Reason |
|---|---|
| AutomationsView | macOS-only (lock Mac, Shortcuts URL scheme) |
| Apple Health XML importer | Goose uses HealthKit API — XML export importer is a regression |
| GRDB/WhoopStore | Goose uses Rust+rusqlite — replacing is a regression |
| StrandAnalytics Swift | Goose has equivalent algorithms in Rust, more complete |

## Open questions

- R-R interval stream availability: confirm `WhoopDataSignalPipeline` publishes RR intervals as a live `@Published` value accessible to the Breathe view
- WHOOP CSV import bridge methods: decide whether to add `import_whoop_csv_*` bridge methods or parse CSV entirely in Swift and batch-insert via existing bridge methods

## Related seeds

- `smart-alarm-strap-haptic.md` — smart alarm feature; shares the buzz wire-up prerequisite and puffin frame format
