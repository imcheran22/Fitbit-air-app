---
name: stress-trends-screens
description: Three SwiftUI screens with no algorithm work — Stress/ANS view (algo already in Rust), Long-range Trends dashboard, Manual Workout Entry sheet
metadata:
  type: seed
  trigger_condition: when planning v10.0 milestone scope
  planted_date: 2026-06-11
---

## Idea

Implement three SwiftUI screens that are **pure presentation** — the underlying algorithms and data already exist in the Goose Rust core. These are among the fastest paths to visible feature improvements.

## Screen 1 — Stress / ANS View — delta additions only

**Partially built.** `StressV2OverviewPage` exists in `GooseSwift/HealthRecoveryStressViews.swift`. The base stress view is not missing.

**Algorithm reference (corrected):** `goose_stress_v0` at `Rust/core/src/metrics.rs:2434` uses `heart_rate_elevation_score`, `hrv_suppression_score`, and `motion_adjusted_hr` with a 0.60 weight — not the logistic/exp z-score formula previously cited here.

**What's still genuinely absent** (re-scoped from building a full screen to adding missing tiles):
- "Calm Time" stat: percentage of last 30 days where stress score < 40 — not in current view
- Baseline-delta tiles: RHR and HRV shown with Δ vs 30-day personal baseline — current tiles show raw values only
- W/M/3M/6M/1Y/ALL range selector on the trend chart

**Effort: 0.5 days.** Additive only — do not rewrite the existing screen.

## Screen 2 — Long-range Trends Dashboard

Multi-range, multi-metric trend view. Reference: `Strand/Screens/TrendsView.swift` (17KB). Goose has `HealthDataStore+Trends.swift` and individual trend views per metric; what's missing is a unified dashboard.

**UI elements:**
- Hero Recovery area chart (fixed 0-100 scale, always at top)
- Small-multiples grid: HRV, RHR, Daily Strain — each with auto-padded ±12% span
- Per-card footer: mean / peak / low / active days in selected window
- Time windows anchored to **today's local date** (not latest record): W / M / 3M / 6M / 1Y / ALL
- Empty-window handling: auto-widen to next populated range + "sparse — widened to [range]" caption
- YearHeatStrip (seeded in `noop-feature-import.md`) — recovery heatmap at bottom

**Prerequisite:** `metricSeries` table (seeded in `journal-workout-datastore.md`) for clean per-key range queries.

**Effort: 3 days.**

## Screen 3 — Manual Workout Entry Sheet

Auto-detection by `PassiveActivityDetector` has false positives and false negatives. Users need a way to log missed workouts and correct detected ones. Reference: `Strand/Screens/ManualWorkoutSheet.swift` (9.6KB).

**Fields (5-field sheet, presented as a `.sheet`):**
- Sport (picker: Running, Cycling, Strength, HIIT, Swimming, Yoga, Other…)
- Start time (DatePicker, max: now)
- Duration (1–1440 minutes, Stepper)
- Avg HR (25–250 bpm, optional)
- Calories (0–20000 kcal, optional)

**Key patterns from NOOP:**
- `WorkoutSource.preservingCaptured`: when editing a strap-detected session, keep the real captured strain hidden — never overwrite real strain with a user estimate
- `saveManualWorkout(replacing: existingSession?)`: on sport/start change, delete old row by natural key before inserting new

Entry point: "Add workout" button in the Fitness/Activity tab; long-press on a detected session to "Edit".

**Prerequisite:** `workout` table (seeded in `journal-workout-datastore.md`).

**Effort: 1.5 days.**

## Implementation order

1. Stress view (self-contained, zero prerequisites)
2. Manual Workout Entry sheet (after `workout` table exists)
3. Trends dashboard (after `metricSeries` table exists, YearHeatStrip component)

## Files to create

- `GooseSwift/HealthStressViews.swift` — Stress/ANS screen (gauge, trend chart, tiles)
- `GooseSwift/FitnessManualWorkoutSheet.swift` — workout entry/edit sheet
- `GooseSwift/HealthTrendsDashboardView.swift` — long-range trends dashboard
- (update) `GooseSwift/HealthDataStore+StressEnergy.swift` — add `runStressV0()` if not present

## Related seeds

- `journal-workout-datastore.md` — `workout` + `metricSeries` tables are prerequisites
- `noop-feature-import.md` — YearHeatStrip component for Trends bottom section
