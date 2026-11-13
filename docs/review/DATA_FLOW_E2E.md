# Data flow end to end: Fitbit Air to every screen

Read-only review, 2026-11-12, against commit `587dac2`. No code was changed. Paths below are relative to the repo root.
Abbreviations: GH = Google Health API v4, HC = Health Connect, TO = Takeout archive, Ing = `HealthIngestor`,
Pipe = `DailyIntelligencePipeline`, Repo = `AthleteRepository`.

How this was checked:
- I read every hop listed below.
- The request URLs were built by the real `GoogleHealthApiClient` against a MockWebServer (JVM probe in a private
  scratch copy of `jvm-network`) and compared with `docs/api-snapshots/google-health-v4-discovery-2026-11-11.json`
  (revision 20261109). They match the discovery document: path, `dataPoints` / `dataPoints:reconcile`, the
  `filter` field names (snake_case), the literal formats and `pageSize`:

  ```
  /v4/users/me/dataTypes/heart-rate/dataPoints?filter=heart_rate.sample_time.physical_time >= "…Z" AND … < "…Z"&pageSize=10000
  /v4/users/me/dataTypes/steps/dataPoints:reconcile?filter=steps.interval.start_time >= "…Z" AND …&pageSize=10000
  /v4/users/me/dataTypes/daily-heart-rate-variability/dataPoints?filter=daily_heart_rate_variability.date >= "2026-03-28" AND … < "2026-03-30"
  /v4/users/me/dataTypes/sleep/dataPoints?filter=sleep.interval.end_time >= "…Z" AND …&pageSize=25
  /v4/users/me/dataTypes/exercise/dataPoints?filter=exercise.interval.civil_start_time >= "2026-03-27T00:00:00" AND …&pageSize=25
  ```
- I compared every DTO field name in `core/network/.../GoogleHealthDtos.kt` with the schemas. All of them match,
  including `dataPointName` on `ReconciledDataPoint`, the int64-as-string values, `gainMillimeters`,
  `activeMinutesByActivityLevel` and `heartRateZoneDurations`. I found no unit or field-name mismatch.
- I simulated the watermark walk with a short script that copies `SyncResumePlan.readPlan` and the orchestrator
  loop exactly. The inputs are the app's settings: 90-day backfill, 36 h overlap, `maxWindowsPerStream = 3`
  (`AppContainer.kt:126`) and one run every 30 minutes. See Broken links 1 and 2.

## Common hops (all streams)

| hop | file:line | status | note |
|---|---|---|---|
| Sign-in (PKCE S256, offline access, 4 read scopes) | `core/network/.../auth/GoogleHealthAuthConfig.kt:16-24,49-72` | OK | The scope strings match the discovery document word for word. `settings.readonly` is requested, but its only use (`listPairedDevices`) is never called (Broken link 9). |
| Redirect back into the app | `app/src/main/AndroidManifest.xml:92-106`, `app/build.gradle.kts:61` | OK | The redirect scheme is fixed when the app is built. A client ID pasted later in Settings with a different scheme is caught and explained (SETUP.md). |
| Sync right after sign-in | `app/.../di/AuthController.kt:128` | OK | Calls `SyncScheduler.syncNow`. Skipped in Demo mode. |
| Sync when the app opens | `app/.../MainActivity.kt:73-84` | OK | At most once every 15 minutes, only after onboarding and never in Demo mode. |
| Background sync | `app/.../di/AppContainer.kt:181-191`, `core/data/.../worker/SyncScheduler.kt:341-352` | OK | Periodic, about every 30 minutes on a network connection, after onboarding, when not in Demo mode and with background sync on (on by default). |
| Sync after Health Connect access is granted | none | missing | No sync starts when the owner grants Health Connect permissions. Data waits for the next app open or periodic run. |
| Worker | `core/data/.../worker/BiometricSyncWorker.kt:238-270` | OK | Writes to the real store only, then calls `notifyChanged()` so the screens re-read. |
| Orchestrator | `core/data/.../sync/TriSourceSyncOrchestrator.kt:65-148` | broken | The watermark only moves forward after a commit, and an owed replay is recorded. But the oldest data is read first, the overlap is subtracted even from a PARTIAL watermark, and the Health Connect heart-rate stream never catches up (Broken links 1 and 2). |
| Ingestor | `core/data/.../ingest/HealthIngestor.kt:89,172,201,225,322` | OK | Heart rate goes into one-minute buckets, where a bucket with more samples wins. Daily values go through `SourceReconciler`. Sleeps and workouts are matched by overlap. Plausibility limits apply. Samples (`:201`) are keyed by (metric, time) with no source ranking. |
| Source ranking | `core/domain/.../SourceReconciler.kt:27-76` | OK / see 10 | GH is preferred for anything the wearable records; HC is preferred for BODY, but HC never delivers BODY data (Broken link 10). |
| Pipeline | `core/data/.../pipeline/DailyIntelligencePipeline.kt:153-336` | OK | Reads daily HRV, RHR or sleeping HR, respiratory rate, skin temperature deviation, SpO2 average, VO2 max and steps; the main sleep session; heart-rate minutes for strain and peak HR; and workouts. |
| Repository | `core/data/.../repository/AthleteRepository.kt:135-264, 332-346` | partial | The screens get only the metrics listed in `TREND_METRICS` and the five monitor metrics (Broken link 4). |

## Per stream

### Heart rate, intraday
| hop | file:line | status | note |
|---|---|---|---|
| GH type and filter | `core/network/.../GoogleHealthDataTypes.kt:43,113-125` | OK | `heart-rate`, `heart_rate.sample_time.physical_time`, RFC 3339 UTC. |
| GH stream | `core/data/.../source/GoogleHealthApiSource.kt:105,176-183` | broken | 24 h windows, 3 per run. Today arrives only after about 60 runs (Broken link 1). |
| GH request | `GoogleHealthApiSource.kt:272-278` | risky | No `dataSourceFamily` is sent, so all sources come back. Heart rate from the phone or from Health Connect is averaged into the band's minutes (Broken link 6). |
| GH mapper | `core/data/.../googlehealth/GoogleHealthMapper.kt:105-131` | OK | Points are trimmed to [from, to). Duplicates at the same instant are removed. Descending page order is harmless (`MinuteLedger` keeps the boundary minute). |
| HC stream | `core/data/.../source/HealthConnectSource.kt:70,224-232` | broken | 12 h windows times 3 per run equals the 36 h overlap, so the window walk never moves (Broken link 2). Reads have no lead before the window (Broken link 8). |
| HC SDK | `core/data/.../healthconnect/HealthConnectDataSource.kt:139` | OK | `HeartRateRecord` samples are in bpm. |
| TO | `takeout/TakeoutEntryRouter.kt:31,43` → `HeartRateJsonStreamParser` / `HeartRateCsvParser` | OK | Points with confidence 0 or below are dropped. Classic files are read as local wall-clock time (OPEN_POINTS T2). |
| Ingestor and DB | `HealthIngestor.kt:89-159` → `intraday_heart_rate` | OK | Window edges are not on whole minutes, so a minute split across two windows is replaced, not merged. It fixes itself on the next overlap re-read (Broken link 11). |
| Pipeline | `DailyIntelligencePipeline.kt:227-256,354-358` | OK | Feeds strain, workout TRIMP, observed peak HR and sleeping HR. |
| Repo and screens | `AthleteRepository.kt:141-163,209-225` → Overview live HR, HeartRateDay, Strain | broken | The live HR value on Overview has no provenance (Broken link 3). |

### Resting heart rate
| hop | file:line | status | note |
|---|---|---|---|
| GH | `GoogleHealthDataTypes.kt:53`; `GoogleHealthApiSource.kt:108`; `GoogleHealthMapper.kt:153-159` | OK | `daily-resting-heart-rate`, filter on `.date`, value `beatsPerMinute`. `calculationMethod` is ignored. |
| HC | `HealthConnectSource.kt:72` (latest value per day); `HealthConnectDataSource.kt:140` | OK | |
| TO | `TakeoutEntryRouter.kt:30,46` → `RestingHeartRateJsonParser` / `DailyCsvParser` | OK | |
| Ingestor → Pipeline → screens | `HealthIngestor.kt:172` → `DailyIntelligencePipeline.kt:176-180` → Overview monitor, Recovery, Trends | OK | Falls back to sleeping HR when RHR is missing. |

### HRV (RMSSD, LF/HF)
| hop | file:line | status | note |
|---|---|---|---|
| GH daily | `GoogleHealthApiSource.kt:109`; `GoogleHealthMapper.kt:160-167` | OK | `averageHeartRateVariabilityMilliseconds` → HRV_RMSSD and `deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds` → HRV_DEEP_SLEEP_RMSSD, both in ms. |
| GH samples and LF/HF | `GoogleHealthDataTypes.kt:44`; `GoogleHealthDtos.kt:96-107`; `GoogleHealthMapper.kt:217-240` | missing | The type, the DTO (including `lowFrequencyPower` and `highFrequencyPower`) and the mapper exist, but no stream uses them. LF/HF never comes from GH (Broken link 5). |
| HC | `HealthConnectSource.kt:73`; `HealthConnectMapper.kt:123-157` | risky | The nightly mean uses only readings inside [sleep start, sleep end]. Pulse found that Fitbit stamps the nightly value at or just after the end (Broken link 7). |
| TO details | `TakeoutEntryRouter.kt:35` → `parsers/HrvDetailsCsvParser.kt:53-60` | OK | RMSSD, LF and HF are stored as 5-minute samples. The LF/HF unit is unverified. |
| TO daily | `TakeoutEntryRouter.kt:36,47` → `DailyCsvParser.kt:25-27` | OK | |
| Pipeline | `DailyIntelligencePipeline.kt:175,349-353` | OK | Uses daily RMSSD. It derives a nightly mean from samples when no observed daily value exists. LF/HF and deep-sleep RMSSD are not used. |
| Screens | Overview monitor, Recovery, Trends | partial | HRV_RMSSD is shown. HRV_DEEP_SLEEP_RMSSD and LF/HF are stored but not shown (Broken link 4). |

### SpO2
| hop | file:line | status | note |
|---|---|---|---|
| GH daily | `GoogleHealthApiSource.kt:110`; `GoogleHealthMapper.kt:168-176` | OK | Average, lower bound and upper bound, in %. |
| GH samples | `GoogleHealthDataTypes.kt:45` | missing | `oxygen-saturation` is never read (Broken link 5). |
| HC | `HealthConnectSource.kt:74`; `HealthConnectMapper.kt:160-167` | risky | Nightly mean, min and max inside the main sleep. Same end-of-sleep window issue (Broken link 7). |
| TO | `TakeoutEntryRouter.kt:38-39,45,48` | OK | Minute samples are stored but never used by the pipeline. |
| Pipeline → screens | `DailyIntelligencePipeline.kt:183` → Overview monitor, Trends | partial | Only SPO2_AVG is shown. The lower and upper bounds are stored but not shown. |

### Respiratory rate
| hop | file:line | status | note |
|---|---|---|---|
| GH | `GoogleHealthApiSource.kt:111`; `GoogleHealthMapper.kt:177-183` | OK | `daily-respiratory-rate`, in breaths per minute. `respiratory-rate-sleep-summary` (stats per stage) is not read. |
| HC | `HealthConnectSource.kt:75` | risky | Same end-of-sleep window issue (Broken link 7). |
| TO | `TakeoutEntryRouter.kt:37,49` | OK | |
| Pipeline → screens | `DailyIntelligencePipeline.kt:181` → Overview monitor, Recovery, Trends | OK | |

### Skin temperature
| hop | file:line | status | note |
|---|---|---|---|
| GH | `GoogleHealthApiSource.kt:112`; `GoogleHealthMapper.kt:184-196` | OK | Nightly value in °C. Deviation = nightly minus baseline, only when both exist. |
| HC | `HealthConnectSource.kt:76,84-89`; `HealthConnectMapper.kt:180-198` | OK | Only where the platform supports the feature. Mean of the deltas against the device baseline. |
| TO | `TakeoutEntryRouter.kt:40-41,50` | OK | Whether a value is absolute or a deviation is decided by its range. |
| Pipeline → screens | `DailyIntelligencePipeline.kt:182` → Overview monitor, Trends | partial | The deviation is shown. SKIN_TEMP_NIGHTLY is stored but not shown. |

### Sleep sessions and stages
| hop | file:line | status | note |
|---|---|---|---|
| GH | `GoogleHealthApiSource.kt:106,185-192`; `GoogleHealthMapper.kt:409-455` | OK | Filtered on `sleep.interval.end_time`, page size 25, no `dataSourceFamily` (the discovery document forbids it for sleep). Stages are clamped to the session. Unknown stages are dropped. Uses `mainSleep` and `nap`. Last night arrives after about 3 runs on a first sync (Broken link 1). |
| HC | `HealthConnectSource.kt:71,233-236`; `HealthConnectMapper.kt:66-104` | OK | HC has no nap flag; duration decides. |
| TO | `TakeoutEntryRouter.kt:33` → `SleepJsonParser` | OK | Classic layout only. The Google layout has no route for sleep. |
| Ingestor and DB | `HealthIngestor.kt:225-318` → `sleep_session`, `sleep_stage_segment` | OK | Sessions overlapping by more than half are treated as the same night. One main sleep per day. |
| Pipeline | `DailyIntelligencePipeline.kt:163-222,361-375` | OK | Sleep score, need, debt and consistency. The day's SLEEP_* rows are written from the session. |
| Screens | Sleep (hypnogram, history), Overview, Recovery | OK | |

### Steps
| hop | file:line | status | note |
|---|---|---|---|
| GH | `GoogleHealthApiSource.kt:114,238-245`; `GoogleHealthMapper.kt:277-384` | OK | Read through `reconcile` for whole civil days with a margin. Duplicates are removed; totals per day. Today's total arrives after about 5 runs on a first sync (Broken link 1). |
| HC | `HealthConnectSource.kt:77`; `HealthConnectMapper.kt:206-226` | OK | One source app per day, never summed across apps. |
| TO | `TakeoutEntryRouter.kt:32,44` → `StepsParsers.kt:25-65` → `TakeoutZipImporter.kt:254-276` | OK / unverified | A day total is written only when all of the day's 15-minute buckets are present (OPEN_POINTS T3). |
| Pipeline → screens | `DailyIntelligencePipeline.kt:332` → `StateMappers.kt:126-127`, Trends | OK | |

### Distance, floors, calories, active zone minutes, active minutes, sedentary time
| hop | file:line | status | note |
|---|---|---|---|
| GH | `GoogleHealthApiSource.kt:115-120`; `GoogleHealthMapper.kt:293-347,390-405` | OK | Distance is converted from mm to m. Total calories are written only when both active and basal energy exist. |
| HC | `HealthConnectSource.kt:78-79` | partial | Total calories and floors are read. There is no daily distance stream although READ_DISTANCE is requested (distance is used only to fill in workouts). Health Connect has no AZM record type. |
| TO | none | missing | No route for calories, distance, AZM or active minutes. |
| Pipeline / Repo / screens | none | **not shown** | Stored in `daily_biometric_summary`, but never read by the pipeline or the repository, so no screen shows them (Broken link 4). |

### Exercise and workouts
| hop | file:line | status | note |
|---|---|---|---|
| GH | `GoogleHealthApiSource.kt:107,194-201`; `GoogleHealthMapper.kt:460-492` | OK | Filtered on `civil_start_time`, widened by a day on each side, then trimmed to the window. Distance and elevation are converted from mm to m. There is no maximum HR in the API summary. |
| HC | `HealthConnectSource.kt:81,268-282`; `HealthConnectMapper.kt:235-275` | OK | HR, calories, distance and steps are filled in only from the same source app, split by overlap. |
| TO | `TakeoutEntryRouter.kt:34` → `ExerciseJsonParser` | OK | |
| Ingestor → Pipeline | `HealthIngestor.kt:322-376` → `DailyIntelligencePipeline.kt:245-256` | OK | TRIMP and strain are computed per workout from the stored HR minutes. |
| Screens | Strain list (`StrainScreen.kt:211`), WorkoutDetail | partial | Shown: type, duration, average and max HR, TRIMP, strain, RPE. **Not shown:** calories, distance, steps, AZM and elevation (Broken link 4). |

### VO2 max
| hop | file:line | status | note |
|---|---|---|---|
| GH | `GoogleHealthApiSource.kt:113`; `GoogleHealthMapper.kt:197-203` | risky | `daily-vo2-max` is stored as MEASURED. The `estimated` flag and `cardioFitnessLevel` are dropped (Broken link 12). |
| HC | `HealthConnectSource.kt:80` | OK | |
| Pipeline → screens | `DailyIntelligencePipeline.kt:296-302` → Health (Fitness), Trends | OK | When there is no observed value, the HR-ratio estimate is labelled ESTIMATED. |

### Weight and body fat
| hop | file:line | status | note |
|---|---|---|---|
| GH | `GoogleHealthApiSource.kt:121-122,212-220`; `GoogleHealthMapper.kt:243-265` | OK | Grams are converted to kg. Values typed in by hand are labelled USER_REPORTED. Stored only as samples (`metric_sample`). |
| HC | none | missing | No Weight or BodyFat stream, although the reconciler prefers HC for BODY (Broken link 10). |
| Pipeline / screens | none | **not shown** | Never turned into daily values, never read, no BMI (Broken link 4). |

## 1. Broken links, ranked by severity

1. **High. A first sync reads the oldest data first, so today's data is missing for a day or more.**
   `TriSourceSyncOrchestrator.kt:89-108` walks forward from now minus 90 days. Each run covers at most 3 windows
   (`AppContainer.kt:126`), and `SyncResumePlan.kt:18-22` subtracts the 36 h overlap even from a PARTIAL watermark.
   Simulated runs needed before a stream reaches today:

   | stream | runs needed |
   |---|---|
   | GH heart rate | about 60 |
   | GH steps, distance, calories, AZM | 5 |
   | GH sleep and exercise | 3 |
   | HC nightly HRV, SpO2, respiratory rate | 12 |
   | GH daily values | 1 |

   Until then the screens show no strain ("no heart-rate data"), no live HR, no sleeping HR and no last night's sleep.
   With Doze, 60 periodic runs is several days.
   Smallest fix (test first): (a) in `readPlan`, apply the overlap only when the stored status is SUCCESS. A PARTIAL
   watermark is exactly where committed data ends, so resume there. (b) When the stream is further behind than
   `maxWindowsPerStream x window`, also pull the newest window `[end - window, end)` without moving the watermark.
   Writes are idempotent upserts, so this is safe.
2. **High. The Health Connect heart-rate window walk never advances.** `HealthConnectSource.kt:70` uses 12 h
   windows. Three per run is 36 h, which equals `overlapMillis` (`TriSourceSyncOrchestrator.kt:60`). Every run
   re-reads from the 90-day floor, and the forward-only watermark stays about 88.5 days behind forever (simulated).
   - What still arrives: records written after the first change token (through the change catch-up,
     `HealthConnectSource.kt:184-194`).
   - What is lost: the 90-day history, and everything written before the first sync, such as the morning of the
     install day. It is also lost for good if the change token expires (about 30 days).
   - Who is hit hardest: an owner without a Google client ID, for whom Health Connect is the only live source.

   Fix (1a) is enough. Otherwise use a 24 h window for this stream. Add an orchestrator test with a 12 h window and
   `maxWindowsPerStream = 3`. No test sets `maxWindowsPerStream` today.
3. **Medium-high. The live heart rate on Overview has no provenance.** `ui/overview/OverviewMapping.kt:141` reads
   `a.provenance[MetricType.HEART_RATE_AVG]`. Nothing ever writes a HEART_RATE_AVG daily row: the only references
   are in Plausibility. The label is therefore always null, against the "provenance next to every number" rule.
   Fix: add `provenance` to `HeartRateTick`, fill it from `IntradayHeartRateEntity.provenance`
   (`AthleteRepository.kt:163`) and use it at `OverviewMapping.kt:141`.
4. **Medium. Data is stored but never read or shown.** No pipeline field, repository flow or screen reads:
   - CALORIES_TOTAL and CALORIES_ACTIVE, DISTANCE, FLOORS, ACTIVE_ZONE_MINUTES, LIGHTLY / MODERATELY /
     VERY_ACTIVE_MINUTES, SEDENTARY_MINUTES;
   - WEIGHT and BODY_FAT (samples only);
   - SKIN_TEMP_NIGHTLY, SPO2_LOWER_BOUND and SPO2_UPPER_BOUND, HRV_DEEP_SLEEP_RMSSD (it has a label but appears in no
     monitor or trend list), HRV_LOW_FREQUENCY and HRV_HIGH_FREQUENCY, Takeout minute SpO2;
   - workout `caloriesKcal`, `distanceMeters`, `steps`, `activeZoneMinutes` and `elevationGainMeters` (not in
     `ui/workout/WorkoutDetailScreen.kt`).

   The seven GH day-total streams take about half of each run's request budget for data nobody sees.
   Fix: add the activity metrics to `AthleteRepository.TREND_METRICS` (`:332-346`), add an activity row to Strain,
   and add the workout fields to WorkoutDetail. Otherwise drop the streams until a screen needs them.
5. **Medium. Data the API offers is defined in code but never fetched.**
   - Types defined but with no `Spec` in `GoogleHealthApiSource.kt:104-123`: `heart-rate-variability` (RMSSD
     samples plus LF/HF in `metadata`), `oxygen-saturation`, `respiratory-rate-sleep-summary`, `vo2-max`,
     `daily-heart-rate-zones`, `time-in-heart-rate-zone` (`GoogleHealthDataTypes.kt:44-47,59,70`).
   - `GoogleHealthMapper.samples()` (`:217`) is dead code.
   - As a result LF/HF reaches the store only through Takeout, and the pipeline's sample-based nightly HRV
     (`DailyIntelligencePipeline.kt:349`) never gets GH input.
   - Fix: add a `hrv-samples` SAMPLE stream (24 h window) through `mapper.samples` that also emits
     HRV_LOW_FREQUENCY and HRV_HIGH_FREQUENCY.
6. **Medium. GH heart rate mixes in every source.** `GoogleHealthApiSource.kt:272-278` sends no `dataSourceFamily`
   for `heart-rate`, so the default `all-sources` includes data synced from Health Connect and from other devices,
   and it is averaged into the band's minutes. Fix: `dataSourceFamily = DataSourceFamily.GOOGLE_WEARABLES` for
   HEART_RATE (and HRV samples). The discovery document allows this on `list` for every type except sleep and food.
   Fixed: `GoogleHealthApiSource.read` takes a `family`; the `heart-rate` stream (and the new `hrv-sleep` HRV read) send `dataSourceFamily=users/me/dataSourceFamilies/google-wearables`, sleep and daily streams send none. Test `heartRateRequestCarriesTheWearablesFamilyAndSleepDoesNot`. Needs a real band to confirm (OPEN_POINTS).
7. **Medium. Health Connect nightly readings may miss the night's value.** `HealthConnectMapper.kt:134` keeps only
   readings within `start..end` of the main sleep. Pulse (`health/sync.ts`, IMPORT_VERSION 9) found that Fitbit
   stamps its one nightly HRV value up to 2 minutes after the sleep ends, so HC HRV (and possibly SpO2 and
   respiratory rate) would be empty. Fix: end the window at `endEpochMillis + 2 min`, with a test. Needs a real band
   to confirm.
   Fixed: `HealthConnectMapper.nightlyValues` now accepts readings up to `NIGHT_END_GRACE_MS` (2 min) after the sleep end (HRV, SpO2 and respiratory rate). Test `a nightly reading stamped up to two minutes after the sleep ends still belongs to the night`.
8. **Medium. Health Connect heart-rate reads have no lead before the window.** `HealthConnectSource.kt:224-232`
   reads `[from, to)` and keeps only the samples inside it. Health Connect returns an interval record only to reads
   whose range contains the record's start (Pulse `READ_LEAD_S`, citing the AOSP read clause). The samples of a
   `HeartRateRecord` that crosses a window edge are therefore dropped, and the next window never receives that
   record. Fix: read from `from - 24 h` and keep filtering samples to `[from, to)`.
   Fixed: `HealthConnectSource` heart-rate reads start `READ_LEAD` (24 h) before the window; samples are still kept to [from, to). Test `heart rate reads start a day before the window and samples are still kept to the window`.
9. **Low-medium. A scope is requested for calls that are never made.** `GoogleHealthAuthConfig.kt:24` requests
   `googlehealth.settings.readonly` for `listPairedDevices`, which is never called. `getIdentity` is never called
   either. Fix: either show the Air's `lastSyncTime` and battery on Data sources (a cheap check of how fresh the
   data is), or drop the scope.
   Fixed: `settings.readonly` is no longer in `GoogleHealthAuthConfig.READ_SCOPES` (three data scopes remain; the constant stays for the first `pairedDevices` caller). SETUP.md, ARCHITECTURE.md and API_VALIDATION.md updated. Test `onlyTheThreeScopesThatCallsUseAreRequested`.
10. **Low-medium. Source ranking for BODY points to a source that is never read.** `SourceReconciler.kt:48`
    prefers HC for BODY, but HC has no Weight or BodyFat stream (`HealthConnectSource.kt:69-82`). READ_DISTANCE is
    granted but there is no daily distance stream, and ActiveCaloriesBurned is never read. Fix: add the HC
    Weight, BodyFat and Distance streams, or remove the preference and the permission.
    Fixed: BODY (weight, body fat) now prefers the Google Health API in `SourceReconciler.preferredSource`, since that is the only source read; EXTERNAL_HEALTH keeps Health Connect. Test `body metrics prefer the Google Health API...`. The unused READ_DISTANCE permission is not touched.
11. **Low. Window edges are not on whole minutes.** The orchestrator's `floor = end - 90 d` and `to` are not
    whole minutes, so a minute split across two windows is replaced instead of merged (`MinuteLedger` has forgotten
    it). It fixes itself on the next overlap re-read. Fix: round `floor` and window ends down to the minute.
    Fixed: `TriSourceSyncOrchestrator` rounds `end`, `floor` and every window start and end down to the whole minute (`SyncResumePlan.floorToMinute` / `windowEnd` / `newestWindowStart`). The edge also hurt after a capped run, where a new session resumes at the watermark and has no ledger. Tests `everyWindowEdgeIsAWholeMinute...`, `aHeartRateMinuteIsNeverSplitAcrossTwoWindows` (JVM) and `aHeartRateMinuteSplitAcrossAWindowEdgeAndTwoRunsIsMergedNotReplaced` (Robolectric, CI only).
12. **Low. A modelled VO2 max is labelled MEASURED.** `GoogleHealthMapper.kt:197-203` drops `estimated` and
    `cardioFitnessLevel`. Fitbit's cardio-fitness value for a band without GPS is a model estimate. Fix: send rows
    with `estimated == true` in a batch with ESTIMATED provenance.
    Fixed: the `vo2-max` stream splits rows with `estimated == true` into a batch with ESTIMATED provenance (`GoogleHealthMapper.dailyVo2Max`). Tests `vo2MaxIsSplitByTheEstimatedFlag`, `estimatedVo2RowsAreSentWithEstimatedProvenance...`.
13. **Low. Background and permission edges.**
    - A Health Connect read refused in the background (READ_HEALTH_DATA_IN_BACKGROUND absent or unsupported) is
      recorded as PERMISSION_MISSING (`HealthConnectSource.kt:122-125`) although the record permission is granted.
      The Data sources screen then says the wrong thing.
    - No sync starts after the Health Connect permission grant.
    - During a backfill a run needs about 100 or more requests against the assumed budget of 150 per hour (20
      reserved). RATE_LIMITED stops the whole source (`TriSourceSyncOrchestrator.kt:119-122`), so the last streams
      (weight, body fat, sedentary, active minutes) wait longest.
14. **Low. Takeout coverage.** No route exists for calories, distance, AZM, active minutes, VO2 max or weight
    (`TakeoutEntryRouter.kt:28-51`). The Google-layout export has no route for sleep or exercise. Step day totals
    depend on minutes with zero steps being present (OPEN_POINTS T3).
    Fixed: routes and parsers for calories, active energy, distance, AZM, minutes per level (classic JSON and Google `activity_level`), VO2 max, weight (Google `weight.csv`), and the Google-layout exercise and sleep CSVs, all with IMPORTED_FILE_ARCHIVE provenance and per-file marks (`TakeoutMoreRoutesTest`, 25 tests; 250,000-row calories file in a 40 MB heap). Day totals are generalised (`TakeoutDayTotals`); step totals no longer need zero-step minutes (silent stretches up to 16 h inside one file are zeros). Not done: classic `weight-*.json` (unit not stated), and the Google exercise and sleep column names are guesses, flagged in `API_VALIDATION.md` and OPEN_POINTS 14. Needs `:app` to name the new `TakeoutCategory` values (see report).

I found no endpoint, filter, page-token, field-name, unit or time-format mismatch against the discovery document.

## 2. Fitbit Air specifics

What the Air records (ARCHITECTURE.md "Fitbit Air capabilities", API_VALIDATION #5, still to be verified): optical
HR (2 s sampling), HRV, SpO2, skin temperature, breathing rate, sleep stages, steps, accelerometer and gyroscope.
It has no GPS, no screen and no barometer is listed.

| Air output | Requested | Handled end to end | Note |
|---|---|---|---|
| HR | GH `heart-rate`, HC HeartRate, TO | yes, with Broken links 1, 2, 6 and 8 | Stored as one-minute buckets, so the API's resolution does not matter. |
| RHR | GH daily, HC, TO | yes | |
| HRV | GH daily only, HC, TO | daily RMSSD yes; samples and LF/HF from GH no (5) | |
| SpO2 | GH daily, HC, TO | yes (average only shown) | Not offered in every country. The pipeline works around a missing value. |
| Breathing rate | GH daily, HC, TO | yes | |
| Skin temperature | GH daily derivations, HC (where the feature exists), TO | yes | Not offered in every country. |
| Sleep and stages | GH, HC, TO | yes | |
| Steps | GH, HC, TO | yes (Broken link 1 for today) | |
| Distance | GH (estimated from steps, no GPS) | stored, not shown | |
| Calories, AZM, active and sedentary minutes | GH | stored, not shown | |
| Exercise | GH, HC, TO | yes | No GPS, so distance in workouts is estimated. |
| VO2 max | GH daily, HC | yes, but labelled MEASURED (12) | No GPS, so `run-vo2-max` will never appear (it is correctly not requested). |

Requested although the Air will never produce it:
- GH `floors` and HC FloorsClimbed (no barometer);
- `weight` and `body-fat` (logged by hand or by a scale only);
- HC VO2 max, perhaps.

All of these degrade correctly. An empty or 404 answer counts as a completed window
(`GoogleHealthApiSource.kt:284`, `GoogleHealthApiClient.kt:265`) and no row is written, so the value stays
missing. The UI shows "no data" (`MetricState.Unavailable`) or, for floors and weight, nothing at all. A 403 on a
type is recorded per stream as PERMISSION_MISSING and does not fail the run. No unsupported type turns into an
error. The cost is request budget (Broken link 4): floors alone is 3 requests per run during a backfill and 1 to 2
per run afterwards.

## 3. What needs a real account or band (cannot be verified from code)

1. The OAuth client type and whether Google accepts the custom-scheme redirect. Whether the refresh token expires
   after 7 days while the project is in "Testing" status.
2. Which data type needs which scope, and what a 403 body looks like.
3. The real quota and rate-limit header names (the 150 per hour budget is an assumption). How many requests a
   first backfill really takes.
4. The `heart-rate` sampling interval and page count per day from an Air. Whether samples for
   `heart-rate-variability` (with LF/HF), `oxygen-saturation` and `respiratory-rate-sleep-summary` exist for the
   Air or only daily values do.
5. Whether `daily-vo2-max` is returned for a band without GPS, and its `estimated` flag. Whether skin temperature
   and SpO2 are offered in the owner's country.
6. What the Google Health or Fitbit app writes to Health Connect for an Air: its origin package (the
   `com.fitbit.FitbitMobile` assumption at `HealthConnectMapper.kt:285`), the length of its `HeartRateRecord`s
   (this sets the size of Broken link 8), and when the nightly HRV, SpO2 and respiratory-rate values are stamped
   (Broken link 7).
7. Whether Health Connect really filters interval records by start time on the owner's Android version (Broken
   link 8). Whether READ_HEALTH_DATA_IN_BACKGROUND is available.
8. That `all-sources` really mixes heart rate from Health Connect or the phone into `heart-rate` (Broken link 6).
   That `google-wearables` returns only the Air.
9. Whether Takeout file names and columns match (OPEN_POINTS T1 to T6), and whether a real night that arrives from
   both GH and HC is merged into one.
10. How fast a first sync reaches today on a real phone under Doze: count the runs until the Overview shows live HR
    and strain after a fresh sign-in.
