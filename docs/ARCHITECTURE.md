# Architecture and data-access analysis

Last reviewed: 11 November 2026.

## 1. Where Fitbit data can legitimately be read from

A Fitbit tracker talks to the phone over an encrypted, proprietary Bluetooth protocol that only
Google's own app (Google Health, formerly the Fitbit app) can speak. No third-party app can read
the tracker directly. Once the Google Health app has synced the tracker, the data is reachable in
two authorised places, and this app uses both:

| Route | What it is | Role here |
|---|---|---|
| **Google Health API** | REST API at `https://health.googleapis.com/v4`, Google OAuth 2.0 | Primary source for everything the wearable records |
| **Android Health Connect** | On-device store shared between apps | Source for other devices (scales, cuffs, glucose meters, food logs) and a second copy of basic wearable data |

### The Fitbit Web API is gone

The legacy Fitbit Web API (`api.fitbit.com`), including the "Personal" application type that
allowed intraday access, was retired by Google at the end of October 2026 (Google's developer
notices give 30 October; its status page says requests are answered with HTTP 410 Gone). Old
Fitbit tokens do not carry over. Everything in the original specification that
referred to Fitbit endpoints maps onto the Google Health API instead.

### What the Google Health API exposes

Taken from Google's machine-readable API description
(`https://health.googleapis.com/$discovery/rest?version=v4`, revision 20261109). All data is read
with `GET /v4/users/me/dataTypes/{type}/dataPoints`, filtered by time range and paginated.

| Need | Data type | Notes |
|---|---|---|
| Continuous heart rate | `heart-rate` | Individual samples with timestamp; up to 10,000 per page |
| Resting heart rate | `daily-resting-heart-rate` | One per day, with the calculation method |
| HRV (nightly) | `daily-heart-rate-variability` | Average RMSSD, deep-sleep RMSSD, non-REM heart rate |
| HRV (samples) | `heart-rate-variability` | RMSSD samples |
| SpO2 | `daily-oxygen-saturation`, `oxygen-saturation` | Nightly average with bounds; validated samples |
| Breathing rate | `daily-respiratory-rate`, `respiratory-rate-sleep-summary` | Nightly average; per-stage statistics |
| Skin temperature | `daily-sleep-temperature-derivations` | Nightly temperature, 30-day baseline and spread |
| Sleep | `sleep` | Sessions with stage segments (awake, light, deep, REM), summary minutes, main-sleep flag |
| Workouts | `exercise` | Type, duration, heart rate, calories, distance, zone durations |
| Activity | `steps`, `distance`, `floors`, `active-zone-minutes`, `activity-level`, `sedentary-period`, `total-calories`, `active-energy-burned` | Intervals; daily totals via `dailyRollUp` |
| VO2 max | `daily-vo2-max`, `run-vo2-max` | Value plus a flag when Google itself considers it an estimate |
| Body | `weight`, `body-fat`, `height` | |
| Other | `blood-glucose`, `hydration-log`, `nutrition-log`, `menstrual-period` | Only if the user records them |
| Devices | `users/me/pairedDevices` | Model, battery, last sync time |

Scopes are grouped by area, read-only variants are enough:
`googlehealth.activity_and_fitness.readonly`, `googlehealth.health_metrics_and_measurements.readonly`,
`googlehealth.sleep.readonly`, `googlehealth.profile.readonly`, `googlehealth.settings.readonly`.
Apex requests only the first three (activity, health metrics, sleep); settings is needed only for `pairedDevices.list`, which nothing calls yet.

### What is not available

- **Google's own scores.** Readiness, sleep score, stress score and cardio load are not data
  types in the API. This app does not need them: it computes its own recovery, strain, sleep and
  load figures from the underlying measurements, and labels them as derived.
- **Raw sensor waveforms** (PPG, accelerometer). Only processed metrics are exposed.
- **Direct Bluetooth access** to the tracker.

### Open points to settle in Phase 3

These could not be confirmed from primary documentation in this phase (Google's developer site
was not reachable from the build environment) and will be verified against a real account:

1. **Sign-in for a single personal user.** Google OAuth with PKCE is supported for installed
   apps. Google classifies the `googlehealth.*` scopes as restricted. A Google Cloud project in
   "Testing" status with the owner added as a test user normally works without the verification
   review, but Google may limit refresh-token lifetime for such projects, which would mean
   signing in again periodically. To be measured.
2. **Sampling interval actually returned** for `heart-rate` from a Fitbit Air (the device samples
   every 2 seconds; the API may return finer or coarser points). The database folds whatever
   arrives into one-minute buckets, so the storage design does not depend on the answer.
3. **Rate limits.**
4. **What the Google Health app writes to Health Connect** for a Fitbit Air. Reports agree on
   steps, heart rate, sleep stages and exercise; they disagree on HRV, SpO2 and skin temperature.
   The Google Health API is the primary source precisely so that this does not matter.

### Fitbit Air capabilities

Screenless band released May 2026: optical heart rate (2-second sampling), red and infrared
SpO2 sensors, skin-temperature sensor, 3-axis accelerometer and gyroscope, no GPS, about seven
days of battery. It records everything this app's scores need: heart rate, HRV, SpO2, breathing
rate, skin temperature and sleep stages. Skin temperature and SpO2 are not offered in every
country; the analytics re-weight around a missing sensor (see FORMULAS.md).

## 2. Module graph

```
:app ──► :core:ui ──► :core:domain
  │
  ├────► :core:data ──► :core:database ──► :core:domain
  │           │──────► :core:network ───► :core:domain
  │           └──────► :core:analytics ─► :core:domain
  └────► :core:analytics
```

`:core:domain` and `:core:analytics` are pure Kotlin with no Android dependency, so the science
is testable on any JVM in seconds. Android-specific code (Room, Keystore, Health Connect,
WorkManager, Compose) lives in the other modules.

## 3. Data model

SQLite via Room, encrypted with SQLCipher. The passphrase is random, generated on first run and
stored only wrapped by a hardware-backed Android Keystore key.

| Table | Key | Purpose |
|---|---|---|
| `daily_biometric_summary` | (metricType, epochDay) | One value per metric per civil day, measured or derived, each with its provenance |
| `intraday_heart_rate` | timestampEpochMillis | Heart rate in one-minute buckets (avg, min, max, count) |
| `metric_sample` | (metricType, timestampEpochMillis) | Timestamped samples of any other metric |
| `sleep_session` | id | Sessions with summary minutes |
| `sleep_stage_segment` | (sessionId, startEpochMillis) | Hypnogram segments, deleted with their session |
| `workout` | id | Exercise sessions plus the load this app computes for them |
| `sync_watermark` | (source, stream) | How far each stream of each source has been ingested |
| `takeout_file_mark` | (category, fileKey) | Per-file watermarks of the Takeout archive import (schema v3) |

Schema v4 adds nine **local-only** tables for the logging and coaching features. None is ever synced to a network
service; they are part of the encrypted file, of the JSON/CSV export (`behaviourDefs`, `behaviourEntries`, `quickLogs`,
`goals`, `foodLogs`, `bloodPressure`, `breatheSessions`, `coachThreads`, `coachMessages`), of the importer (rows with
an unknown kind, a refused provenance or an invalid value are quarantined by reason) and are removed with the database
file by "Delete all my data". Access goes through `LocalExtras` (`core/data/.../extras/`, see `APP_CONTRACT.md`).

| Table | Key | Index | Purpose |
|---|---|---|---|
| `behaviour_def` | id | sortOrder | Custom behaviours (YES_NO or SCALE_0_4). A row whose id is a built-in factor id (`journal_alcohol`, ...) is only an override of its name, order or archived flag: the five built-in journal factors keep their values in `daily_biometric_summary` |
| `behaviour_entry` | (epochDay, behaviourId) | epochDay, behaviourId | One value of a custom behaviour per civil day. Always `USER_REPORTED`, no free text |
| `quick_log` | id | epochMillis | WATER_ML, MOOD, SYMPTOM, NOTE entries; `numericValue`, `label`, `text` (at most 500 characters) are nullable |
| `goal` | id | createdAtEpochMillis | DAILY_STEPS, DAILY_SLEEP_MINUTES, WEEKLY_ACTIVE_MINUTES, WEEKLY_AZM, WEEKLY_RECOVERED_DAYS targets; progress is computed elsewhere, never stored |
| `food_log` | id | epochMillis | Meals; kcal and macros nullable (missing stays missing); `source` MANUAL / AI_ESTIMATE / HEALTH_CONNECT with the matching provenance (`USER_REPORTED` / `AI_INTERPRETED` / `IMPORTED_HEALTH_CONNECT`) |
| `blood_pressure_reading` | id | epochMillis | Systolic and diastolic in mmHg, pulse nullable, source MANUAL / HEALTH_CONNECT with provenance |
| `breathe_session` | id | startMillis | Planned and completed seconds, pattern key, average heart rate only when measured |
| `coach_thread` | id | updatedAtEpochMillis | Conversation (topic GENERAL / RECOVERY / SLEEP / WORKOUT / ACTIVITY) |
| `coach_message` | id | threadId (foreign key, cascade delete), createdAtMillis | USER messages are `USER_REPORTED`; COACH replies are `AI_INTERPRETED` (a model) or `MATHEMATICALLY_DERIVED` (the rules); `unverifiedNumerals` is a comma list or null |

Enums of these tables are stored by stable storage key (`entity/ExtrasKinds.kt`), like the domain enums. Migration 3 to 4
is a Room `AutoMigration` (new tables only); `ApexDatabaseMigrationTest` upgrades real v1, v2 and v3 files.

The daily table is "tall" (a row per metric per day) rather than one wide row per day. A day's
values come from different places, and a tall row gives each value exactly one truthful
provenance; new metrics need no migration; and one SQL query serves the rolling statistics of
every metric.

### Provenance

`DIRECT_SENSOR_GOOGLE_HEALTH_API`, `IMPORTED_HEALTH_CONNECT`, `IMPORTED_FILE_ARCHIVE`,
`USER_REPORTED`, `MATHEMATICALLY_DERIVED`, `AI_INTERPRETED`, `ESTIMATED`, `UNAVAILABLE`.
(`DIRECT_SENSOR_GOOGLE_HEALTH_API` replaces the specification's `DIRECT_SENSOR_FITBIT_API`;
`USER_REPORTED` is added for values the user types in.)

### When two sources describe the same thing

`SourceReconciler` decides on every write, so totals are never counted twice:

1. Observed data beats estimates.
2. A value the user typed in beats an automatic reading.
3. Between automatic sources, the finer sampling resolution wins.
4. Otherwise the wearable's own metrics prefer the Google Health API, and third-party device
   metrics (weight, blood pressure, glucose, nutrition) prefer Health Connect.
5. Same source: the newer write wins.

### Syncing after long gaps

Each stream keeps a watermark: "everything up to this instant is stored". A sync asks for
everything after the watermark in bounded windows and advances it only after a window is written.
If the phone's Bluetooth was off for two days, the next sync simply has a longer gap to walk; if
a sync is interrupted, the next one resumes from the last completed window. The watermark can
only move forward.

## 4. Toolchain

Gradle 8.14.3, Android Gradle Plugin 8.13, Kotlin 2.2.21, KSP, Room 2.8, compile SDK 36,
minimum SDK 28 (the oldest Android version Health Connect supports). Versions are pinned in
`gradle/libs.versions.toml`.
