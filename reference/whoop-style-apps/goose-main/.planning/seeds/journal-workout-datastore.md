---
name: journal-workout-datastore
description: Four missing SQLite tables — journal (daily Y/N behaviours), workout (sport-tagged log), appleDaily (HealthKit provenance), metricSeries (schema-free escape hatch)
metadata:
  type: seed
  trigger_condition: when planning v10.0 milestone scope
  planted_date: 2026-06-11
---

## Idea

Add four missing tables to `goose.sqlite` that unlock: recovery-behaviour correlation (journal), sport-tagged workout history (workout), clean HealthKit vs strap provenance separation (appleDaily), and schema-free metric storage for the Metric Explorer (metricSeries).

These are pure schema migrations — no algorithm or BLE work. Each table is a prerequisite for higher-level features.

## Verified gap

Checked against `Rust/core/src/store.rs` and `bridge.rs`. None of these tables currently exist. Sources: `NoopApp/noop` `Packages/WhoopStore/.../Database.swift` (v8/v9 migrations) and Ghidra `WhoopJournal` module (`JournalBehaviorTracker{Tag,Time,Value,Magnitude,History}`).

## Table 1 — `journal`

Daily behaviour tracking per recovery cycle. Prerequisite for the Correlation Engine.

**Merged from `journal-behaviour-tracking.md` (Ghidra RE, 2026-06-11).** WHOOP's `WhoopJournal` framework (39+ classes):
- `JournalBehaviorTracker` / `JournalTrackedBehavior` / `JournalDraftService` / `JournalCalendarModule`
- One entry per recovery cycle in WHOOP's model — Goose uses day-key for simpler joins

**Fixed behaviour set** (WHOOP's known categories):
`alcohol` (units) · `caffeine` (mg) · `stress` (1–5) · `illness` (bool) · `supplements` (bool) · `sleep_environment` (bool)

**Migration note:** `CoachView.swift:747–892` already has `tags: [String]` stored in UserDefaults. This is the existing UI entry point — it must migrate to SQLite, not be replaced.

```sql
CREATE TABLE journal (
  deviceId  TEXT NOT NULL,
  day       TEXT NOT NULL,    -- YYYY-MM-DD; join on daily_recovery_metrics.date_key
  behaviour TEXT NOT NULL,    -- "alcohol" | "caffeine" | "stress" | "illness" | ...
  value     REAL NOT NULL,    -- 1.0 for boolean yes; units/mg/level for quantitative
  notes     TEXT,
  PRIMARY KEY (deviceId, day, behaviour)
);
```

Bridge methods: `journal.upsert` · `journal.list_for_day` · `journal.range(startDay, endDay)`.
UI: extend existing tags picker in Coach tab; add calendar browse.

## Table 2 — `workout`

Sport-tagged workout log with source provenance. Goose has `activity_sessions`, `exercise_sessions`, `activity_labels` (auto-detected, calibration), but no unified queryable workout log with sport identity and per-workout notes.

```sql
CREATE TABLE workout (
  deviceId   TEXT NOT NULL,
  startTs    INTEGER NOT NULL,  -- unix seconds
  sport      TEXT NOT NULL,     -- "running", "cycling", "strength", etc.
  source     TEXT NOT NULL,     -- "detected" | "manual" | "apple" | "csv"
  endTs      INTEGER NOT NULL,
  durationS  INTEGER NOT NULL,
  energyKcal REAL,
  avgHr      INTEGER,
  maxHr      INTEGER,
  strain     REAL,
  distanceM  REAL,
  zonesJSON  TEXT,   -- JSON array of {zone:1..5, seconds:N}
  notes      TEXT,
  PRIMARY KEY (deviceId, startTs, sport)
);
```

PK includes `sport` so strap-detected + Apple-imported entries can coexist for the same timestamp. `source` enables dedup in queries between `PassiveActivityDetector` and HealthKit.

Backs: Manual Workout Entry sheet (seed stress-trends-screens.md), HR-zone breakdown, WHOOP CSV import workouts (seed noop-feature-import.md).

## Table 3 — `appleDaily`

Provenance-separated HealthKit daily cache. Goose imports body mass from HealthKit but has no dedicated daily cache — Apple-sourced and strap-sourced numbers risk overwriting each other. Critical for the FastAPI/TimescaleDB backend where strap-truth vs phone-truth must stay distinguishable.

```sql
CREATE TABLE appleDaily (
  deviceId    TEXT NOT NULL,
  day         TEXT NOT NULL,   -- YYYY-MM-DD
  steps       INTEGER,
  activeKcal  REAL,
  basalKcal   REAL,
  vo2max      REAL,
  avgHr       INTEGER,
  maxHr       INTEGER,
  walkingHr   REAL,
  weightKg    REAL,
  PRIMARY KEY (deviceId, day)
);
```

`HealthKitFullImporter.swift` writes here instead of to the mixed daily tables. Bridge methods: `apple_daily.upsert(...)` + `apple_daily.get(deviceId, day)`.

## Table 4 — `metricSeries` (schema-free escape hatch)

Goose's daily tables are fixed-column — adding a new metric = a migration. A generic key/value table avoids per-metric ALTERs and directly backs the seeded Metric Explorer (which needs to enumerate arbitrary metrics).

```sql
CREATE TABLE metricSeries (
  deviceId TEXT NOT NULL,
  day      TEXT NOT NULL,   -- YYYY-MM-DD
  key      TEXT NOT NULL,   -- metric identifier, e.g. "goose.stress.v0"
  value    REAL NOT NULL,
  PRIMARY KEY (deviceId, day, key)
);
CREATE INDEX idx_metric_series_key ON metricSeries (deviceId, key, day);
```

Bridge methods: `metric_series.upsert(deviceId, day, key, value)` + `metric_series.list_keys(deviceId)` + `metric_series.range(deviceId, key, startDay, endDay)`.

Computed metrics (stress, readiness, strain, recovery) write a copy here for Explorer queries without touching the authoritative typed tables.

## Implementation order

1. `metricSeries` — smallest, unblocks Metric Explorer
2. `journal` — unblocks Correlation Engine (already seeded)
3. `workout` — unblocks Manual Workout Entry + WHOOP CSV import workouts
4. `appleDaily` — unblocks clean HealthKit provenance + backend upload separation

## Files to modify

- `Rust/core/src/store.rs` — `run_migrations()`, table creates, insert/query helpers
- `Rust/core/src/bridge.rs` — new `method` dispatch arms per table
- `GooseSwift/HealthKitFullImporter.swift` — write to `appleDaily` instead of mixed tables

## Related seeds

- `noop-feature-import.md` — Correlation Engine + WHOOP CSV import depend on `journal` + `workout`
- `stress-trends-screens.md` — Manual Workout Entry depends on `workout` table
