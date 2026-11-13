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
   type the Cloud project accepts, and that no client secret is required.
2. Which data type needs which scope (`GoogleHealthDataType.scopeCandidates` is inference, used only for wording a 403).
3. Exact 403 body / `WWW-Authenticate` format; parsed tolerantly, scope only used if a `googlehealth.*.readonly` URL appears.
4. Rate limits: the default 150 requests/hour budget is a cautious assumption; rate-limit header names are guesses
   (`RateLimit-*`, `X-RateLimit-*`, `Fitbit-Rate-Limit-*`).
5. Whether a Fitbit Air returns heart rate at 1-second or 1-minute resolution, and HRV/SpO2 sample data (vs daily only).
6. "Testing" publishing status expires refresh tokens after 7 days (Google OAuth policy); confirm the project's status.
7. Data retention/history depth and review/verification requirements for the sensitive health scopes.
8. Whether `heart-rate-variability` samples (RMSSD, plus LF/HF in `metadata`) exist for an Air, and their cadence.
   The `hrv-sleep` stream (HRV_SLEEP_SAMPLES) is empty until they do. Whether `google-wearables` returns only the Air.
