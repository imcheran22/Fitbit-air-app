# fitdash — design

Date: 2026-10-11
Status: approved in brainstorming, awaiting spec review

## Goal

A personal Android app that shows Health Connect data with Ultrahuman-level
UI: animated, calm, one glance in the morning. Built for Mayur's own daily
use first; open-sourced later.

Success for v1: Mayur opens it every morning instead of the Fitbit / Google
Health apps, and it shows everything his Fitbit Air writes to Health Connect.

## Decisions

| Topic | Decision |
|---|---|
| Data source | Health Connect only. No Fitbit Web API, no direct Bluetooth, no server. |
| Storage | None. Read Health Connect on every open, compute in memory. |
| Stack | Kotlin + Jetpack Compose, single app module (same stack as Postbaaz). |
| Layout | One long scrolling page. The hero at the top changes with time of day. |
| Hero visual | "Living orb": morphing, breathing gradient blob with the score inside. |
| Orb colour | Traffic light: red (0) → amber (50) → green (100), interpolated. |
| Breathing | Slower when the score is low (≈7s cycle at 15, ≈4s at 98). |
| Data coverage | Read every Health Connect record type; show only what has data. |

Out of scope for v1: accounts, cloud, local database, background sync,
widgets, notifications, settings screen, iOS, Play Store release.

## Screen: Today (the only screen)

### Hero (top)

- Before 16:00: **readiness** orb. Score number, band word (Recover /
  Steady / Primed), one sentence of advice, a "Based on …" line when inputs
  are missing.
- From 16:00: **activity** orb. Steps today against a fixed 9,000 goal,
  coloured by percentage of goal, with a short evening line.
- While loading: orb breathes in grey, then the colour and number count
  up in once data arrives.
- On scroll: hero translates and scales down and fades; a sticky mini
  header shows a colour dot and the score.

### Sections (below the hero)

Morning order: Sleep → Heart → Overnight vitals → Activity (yesterday) →
Week → generic cards → Data sources.

Evening order: Activity (today) → Readiness (this morning, compact) →
Sleep → Heart → Overnight vitals → Week → generic cards → Data sources.

Designed cards:

- **Sleep:** duration, sleep score, hypnogram (stages over the night) that
  draws in, deep / REM / light / awake totals. Without stages: duration
  bar only.
- **Heart:** last night's HRV and resting HR with deltas against baseline,
  14-day HRV trend line.
- **Overnight vitals:** SpO₂, respiratory rate, skin temperature, each as
  last night's value against its baseline.
- **Activity:** steps, hourly step bars, active minutes, distance, calories.
- **Week:** 7-day readiness bars coloured by score.

**Generic card** for every other record type with data in the last 30
days: type name, latest value with unit, 30-day sparkline.

**Data sources** (last section): every Health Connect record type with
"✓ data" or "no data" and the writing app's name. This replaces a separate
debug screen.

A card is shown only when its record types have data in the last 30 days.

### Motion

- Cards fade up and charts draw in when they scroll into view.
- Number count-up with ease-out on first render.
- Orb morph (≈9s) and breathe loops run continuously.
- Pull to refresh; reload on resume.

The HTML mockups in `.superpowers/brainstorm/` (today-feel, orb-colour,
long-scroll) are the visual reference.

## Readiness score

Baseline for each metric: median of the last 30 days, excluding today.
Requires at least 7 nights with data; before that the orb is grey and shows
"Calibrating · night N of 7".

| Component | Weight | Mapping (clamped 0–100) |
|---|---|---|
| HRV (last night) | 40% | baseline → 70; +15% → 100; −15% → 30; linear |
| Resting HR | 30% | baseline → 70; −5 bpm → 100; +5 bpm → 30; linear |
| Sleep | 30% | `min(hours / 8, 1) × 100`; if stages exist, adjust by up to ±10 based on deep + REM share vs baseline share |

- A missing component is dropped and the remaining weights are rescaled to
  sum to 100%. The hero shows "Based on …" listing what was used.
- If no component is available, the hero shows the no-data state.
- Bands: < 40 Recover, 40–69 Steady, ≥ 70 Primed.
- Sleep score shown on the Sleep card is the sleep component alone.

This is a personal, transparent heuristic, not a medical measure. The
numbers are constants in one file so they can be tuned after a few weeks of
real data.

## Architecture

```
Fitbit band → Fitbit app → Health Connect → fitdash
                                              ├─ health/  HealthReader → HealthSnapshot
                                              ├─ metrics/ pure Kotlin calculations
                                              └─ ui/      ViewModel + Compose
```

### `health/`

- `HealthReader`: the only class that uses `HealthConnectClient`. Checks SDK
  availability and granted permissions, reads the last 30 days of every
  readable record type, and returns a `HealthSnapshot`.
- `HealthSnapshot`: plain Kotlin data classes (sleep sessions with stages,
  HRV samples, resting HR, heart rate, SpO₂, respiratory rate, skin
  temperature, steps, distance, calories, exercise, plus a generic list of
  `(type, time, value, unit, sourceApp)` for every other type). No Health
  Connect classes leak out of this package.

### `metrics/`

Pure Kotlin, no Android dependencies, unit tested.

- `Baselines`: 30-day medians per metric, nights-of-data count.
- `Readiness`: the score above, returns score, band, components used.
- `SleepSummary`, `ActivitySummary`, `VitalsSummary`.
- `CardPlan`: given a snapshot and the hour of day, returns the hero mode
  and the ordered list of cards to show.

### `ui/`

- `TodayViewModel`: loads the snapshot, runs `metrics/`, exposes a single
  `TodayUiState` (`Loading`, `NeedsHealthConnect`, `NeedsPermission`,
  `NoData`, `Ready`).
- Composables: `TodayScreen` (long scroll with collapsing hero), `Orb`,
  `SleepCard`, `HeartCard`, `VitalsCard`, `ActivityCard`, `WeekCard`,
  `GenericMetricCard`, `DataSourcesSection`, `Hypnogram`, `Sparkline`.

minSdk matches Postbaaz (26) unless the Health Connect client library
requires higher; check when scaffolding.

## States and errors

| State | Screen |
|---|---|
| Health Connect not installed / needs update | Message and a button to install or update it |
| No permissions granted | Welcome screen with "Grant access" (requests all read permissions in one go) |
| Some permissions granted | Normal page; cards without access stay hidden; Data sources shows "no access" |
| Fewer than 7 nights | Grey "Calibrating" orb; other cards still shown |
| Permissions granted but no data | Hint to enable Health Connect sync in the Fitbit app |
| Read fails | Keep previous state, show a small retry banner |

## Testing

- Unit tests for everything in `metrics/` using fixture snapshots: normal
  night, missing HRV, fewer than 7 nights, no sleep stages, no data,
  morning vs evening card plan.
- Compose `@Preview`s with fake `TodayUiState` for every state.
- Manual check on Mayur's phone with real Fitbit Air data, including
  reading the Data sources section to confirm what the Fitbit writes.

## Later (not v1)

Local cache + WorkManager sync, home-screen widget, morning notification,
settings (step goal, units), Fitbit Web API fallback if HRV / stages are
missing from Health Connect, F-Droid / Play release.
