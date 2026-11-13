# API validation (Google Health API v4)

Dated 2026-11-11. Source: `docs/api-snapshots/google-health-v4-discovery-2026-11-11.json`
(discovery revision **20261109**, `https://health.googleapis.com/$discovery/rest?version=v4`).
`:core:network` was written only from this document and Google's OAuth 2.0 installed-app conventions.

## Decision: legacy Fitbit Web API not implemented
`api.fitbit.com` answers with a Google-style 401: the legacy API is retired. Master prompt 7.1 items 1, 4, 5
(Fitbit config, `Fitbit-Rate-Limit-*` tracker, `FitbitWebApiService`) are replaced by Google equivalents:
`GoogleHealthAuthConfig`, provider-neutral `RateLimitTracker` (it also parses `Fitbit-Rate-Limit-*` if ever seen),
`GoogleHealthApiClient`.

## Verified against the snapshot
- Base URL `https://health.googleapis.com/`, paths `v4/users/{user}/dataTypes/{type}/dataPoints`,
  `.../dataPoints:reconcile`, `v4/users/{user}/identity`, `v4/users/{user}/pairedDevices`.
- Query parameters of `list`/`reconcile`: `pageSize` (default 1440, max 10000; 25/25 for `exercise` and `sleep`),
  `pageToken`, `filter` (AIP-160, operators `>=`, `<`, `AND`), `dataSourceFamily`
  (`users/{user}/dataSourceFamilies/{all-sources|google-wearables|google-sources|self-sources}`).
  Response: `dataPoints[]`, `nextPageToken` (empty when complete); results are ordered by start time descending.
- Filter fields: `{type}.interval.start_time`, `{type}.sample_time.physical_time`, `{type}.date` (daily),
  `exercise.interval.civil_start_time`, `sleep.interval.end_time`; type name is snake_case in filters, kebab-case in paths.
- Read scopes (verbatim): `googlehealth.health_metrics_and_measurements.readonly`, `googlehealth.activity_and_fitness.readonly`,
  `googlehealth.sleep.readonly`, `googlehealth.settings.readonly` (needed by `pairedDevices.list`), all under
  `https://www.googleapis.com/auth/`. Write scopes exist and are never requested; `OAuthProviderConfig` rejects them.
- Every DTO field name/type/enum in `GoogleHealthDtos.kt` comes from the schemas (HeartRate, DailyRestingHeartRate,
  DailyHeartRateVariability, HeartRateVariability, DailyOxygenSaturation, OxygenSaturation, DailyRespiratoryRate,
  RespiratoryRateSleepSummary, DailySleepTemperatureDerivations, DailyVO2Max, VO2Max, RunVO2Max, Sleep, Exercise,
  Steps, Distance, Floors, Active*, Weight, BodyFat, PairedDevice, Identity). int64 values are JSON strings.
- `ReconciledDataPoint` uses `dataPointName` where `DataPoint` uses `name`; both are read.
- `sleep` does not support `dataSourceFamily` on list (use `reconcile`).
- `dataSourceFamily` (query parameter, `users/{user}/dataSourceFamilies/{all-sources|google-wearables|google-sources}`;
  default `all-sources`, `google-wearables` = Google and Fitbit tracker devices, excludes manual data): verified in the
  snapshot for `list` and `reconcile`. Apex sends `google-wearables` on the `heart-rate` and `heart-rate-variability`
  list calls only, so phone or Health Connect heart rate is not averaged into the band's minutes.
- `DailyHeartRateVariability.nonRemHeartRateBeatsPerMinute` and `DailyVO2Max.estimated` are in the snapshot schemas
  (the former is on the daily HRV type, not on `sleep`). Apex stores the first as SLEEPING_HEART_RATE and labels rows
  with `estimated == true` ESTIMATED. What Google means by `estimated` for a band without GPS is unverified.
- Scopes requested: the three data scopes plus `googlehealth.settings.readonly`, which `pairedDevices.list` needs.
  The caller is `FitbitAirStatusReader` (Data sources "Fitbit Air" row), on demand, cached in memory, not in Room.
  Verified against the discovery document: `GET v4/{+parent}/pairedDevices`, `PairedDevice` fields `deviceVersion`,
  `deviceType` (TRACKER | SCALE), `batteryLevel` (int32), `batteryStatus` (High | Medium | Low | Empty), `lastSyncTime`
  (google-datetime). Unverified: that a Fitbit Air reports `deviceType=TRACKER` and a useful `deviceVersion`
  (OPEN_POINTS G-air).
- No quota is published in the document.

## Verified by tests only (mock server, not Google)
OAuth PKCE S256 (RFC 7636 appendix B vector), state check, token exchange/refresh classification, single-flight refresh,
401/403/404/429/5xx handling, tolerant parsing, pagination termination. 97 JVM tests.

## Unverified: needs the real account (see OPEN_POINTS)
1. OAuth client type and custom-scheme redirect `com.googleusercontent.apps.<prefix>:/oauth2redirect`: Google restricts
   custom URI schemes for Android-type clients (opt-in toggle) and uses them for iOS-type clients. Confirm which client
   type the Cloud project accepts, and that no client secret is required. Google's native-app page (read 2026-11-13) says custom URI schemes are no longer supported on Android clients;
   the app supports both styles (`apex.oauthClientType`, default `ios`), see OPEN_POINTS "Sign-in client type".
2. Which data type needs which scope (`GoogleHealthDataType.scopeCandidates` is inference, used only for wording a 403).
3. Exact 403 body / `WWW-Authenticate` format; parsed tolerantly, scope only used if a `googlehealth.*.readonly` URL appears.
4. Rate limits: the default 150 requests/hour budget is a cautious assumption; rate-limit header names are guesses
   (`RateLimit-*`, `X-RateLimit-*`, `Fitbit-Rate-Limit-*`).
5. Whether a Fitbit Air returns heart rate at 1-second or 1-minute resolution, and HRV/SpO2 sample data (vs daily only).
6. "Testing" publishing status expires refresh tokens after 7 days (Google OAuth policy); confirm the project's status.
7. Data retention/history depth and review/verification requirements for the sensitive health scopes.
8. Whether `heart-rate-variability` samples (RMSSD, plus LF/HF in `metadata`) exist for an Air, and their cadence.
   The `hrv-sleep` stream (HRV_SLEEP_SAMPLES) is empty until they do. Whether `google-wearables` returns only the Air.

## Takeout archive routes (`core/data/.../takeout`)
Nothing here was checked against a real archive. Names and columns come from the reference repos
(`reference/fitbit-google-health/fitbit-analytics-main`: `discover.py`, `parsers/*.py`, `tests/make_fixtures.py`, written
against one real Fitbit Air export; `docs/API_MAPPING.md` for the API's own units) and every row stays
**UNVERIFIED-NEEDS-REAL-ARCHIVE** until the first real import's redacted layout report is checked. All rows are written
with `IMPORTED_FILE_ARCHIVE` provenance. "Day total" means the importer's rule in `TakeoutDayTotals.kt`: dense series
(steps, total calories) need every 15-minute bucket of the day; sparse series (distance, active energy, AZM, minutes per level)
need the steps series to cover the day completely and at least one row of their own.

| Data | Layout and file | Columns read (first match wins) | Stored as | Status |
|---|---|---|---|---|
| Calories | classic `calories-DATE.json`; Google `calories_DATE.csv` | `dateTime`/`value`; `timestamp`/`calories` | `CALORIES_TOTAL` buckets and day total | UNVERIFIED-NEEDS-REAL-ARCHIVE. Classic value assumed kcal per minute including BMR (total, not active). |
| Active energy | Google `active_energy_burned_DATE.csv` | `timestamp`/`kilocalories` (or `kcal`) | `CALORIES_ACTIVE` buckets and day total | UNVERIFIED-NEEDS-REAL-ARCHIVE |
| Distance | classic `distance-DATE.json`; Google `distance_DATE.csv` | `value` (centimetres per minute, from fitbit-analytics' note); `distance_millimeters`, `_centimeters`, `_meters`, `_kilometers` | `DISTANCE` (m) buckets and day total | Classic unit UNVERIFIED. A Google header without a unit (`distance`) is **not read** (schema mismatch), never guessed. |
| Active zone minutes | classic `Active Zone Minutes - DATE.csv`; Google `active_zone_minutes_DATE.csv` | `date_time`/`timestamp`, `total_minutes` (zone column ignored) | `ACTIVE_ZONE_MINUTES` buckets and day total | UNVERIFIED-NEEDS-REAL-ARCHIVE. Whether `total_minutes` already weights cardio and peak double is unknown; it is summed as written. |
| Minutes per level | classic `sedentary_minutes-`, `lightly_active_minutes-`, `moderately_active_minutes-`, `very_active_minutes-DATE.json`; Google `activity_level_DATE.csv` | `dateTime`/`value` (one entry per day, or per minute: both summed per day); `timestamp`/`level` (one row = one minute) | `SEDENTARY_MINUTES`, `LIGHTLY_`, `MODERATELY_`, `VERY_ACTIVE_MINUTES`: classic as daily values, Google as buckets plus day total | UNVERIFIED-NEEDS-REAL-ARCHIVE. Level labels matched by `sedentary`, `light`, `moderate`, `vigorous`/`very`. In an intraday classic file the first and last day are not stored (may be partial). |
| VO2 max | classic `demographic_vo2_max-DATE.json` | `value.demographicVO2Max`, else `value.filteredDemographicVO2Max` | `VO2_MAX` daily value | UNVERIFIED-NEEDS-REAL-ARCHIVE (nested shape is from `discover.py`). It is Fitbit's model estimate; the archive does not say so per row, so no ESTIMATED label. No Google-layout file is known. |
| Weight | Google `weight.csv` | `timestamp`; `weight_grams` (or `_kilograms`, `_kg`, `_pounds`, `_lbs`) | `WEIGHT` (kg) daily value, last weigh-in of the local day | UNVERIFIED-NEEDS-REAL-ARCHIVE. Classic `weight-DATE.json` is **not routed**: it is written in the account's own unit and does not state it. A bare `weight` header is not read. |
| Exercise | Google `UserExercises_DATE.csv` (classic `exercise-N.json` existed) | `start_time`, `end_time` or `duration_*`, `exercise_id`, `exercise_type`, `calories`, `average_heart_rate`, `steps`, `distance_<unit>` | workout row `takeout:exercise:<id or start>` | **Column names are a guess**: no reference documents this file's columns. A file without a start and an end or duration is reported as a schema mismatch. |
| Sleep | Google `UserSleepStages_DATE.csv` (classic `sleep-DATE.json` existed) | `start_time`, `end_time` or `duration_*`, `stage`, optional `sleep_id` | sleep row `takeout:sleep:<id or start>` with stages; rows grouped by id, else by a gap above one hour | **Column names and the stage-interval shape are a guess** (`discover.py` calls the file "stage-transition events"). A file without start, stage and end/duration is a schema mismatch. |
| Steps | classic `steps-DATE.json`; Google `steps_DATE.csv` | unchanged | `STEPS` buckets and day total | Whether zero-step minutes are listed is UNVERIFIED; day totals no longer depend on it (a silent stretch up to 16 h inside one file is zero steps). |

Not routed on purpose: `calories_in_heart_rate_zone_*`, `time_in_heart_rate_zone_*`, `altitude-*`, `speed_*`, `cardio_load_*`,
GPS, sleep and readiness scores (different quantities, or no MetricType; see `discover.py`'s ignore list for the same reasons).
