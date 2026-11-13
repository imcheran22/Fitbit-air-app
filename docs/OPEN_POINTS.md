# Open points

Things that cannot be settled offline. Each one names what is assumed, how the code stays correct under the
other answers, and the step that confirms it. Other areas append their own sections below.

## Takeout archive import (`core/data/.../takeout`, `worker/TakeoutImport*`)

Status: `UNVERIFIED-NEEDS-REAL-ACCOUNT` unless stated. Nothing here was checked against a real export; every
name and shape below comes from the brief and from third-party descriptions. The inspector's redacted layout
report (Diagnostics) is the first thing to send back after the first real import: it shows which entry names
matched and which did not, with no personal content.

1. **File names and folders.** Classic layout (`Global Export Data/heart_rate-YYYY-MM-DD.json`,
   `steps-`, `sleep-`, `exercise-N.json`, `resting_heart_rate-`, `Heart Rate Variability/...`,
   `Oxygen Saturation (SpO2)/Minute SpO2 - ...`, `Temperature/Device Temperature - ...`, `Computed Temperature - ...`) and
   the Google per-data-type CSV layout (`heart_rate_YYYY-MM-DD.csv`, `daily_*.csv`). Matching is on the last path
   segment, case-insensitive, so a renamed folder still matches; a renamed file does not. Confirm: first real import,
   read the "unknown patterns" list.
2. **Time zone of timestamps without an offset.** Classic files are read as the device's wall clock in the zone the
   phone has at import time; Google-layout files as UTC; a timestamp with `Z` or an offset is always taken as
   written. Consequences to check: (a) an owner who travelled gets wrong instants for days recorded in another zone
   (the export does not say which zone applied); (b) a classic file that starts inside the repeated hour of a
   clock-back night cannot tell the first pass from the second and takes the first. Confirm: compare a window of
   imported heart rate with the same window from Health Connect (the overlap probe in §9.7), record the result in
   `API_VALIDATION.md`, then set `TakeoutTimeConfig.classicRules` per category. Tests cover both rules.
3. **Steps granularity.** The classic steps file is assumed to list every minute, including zeros. If zero minutes
   are omitted, the parser writes a silent stretch of up to 16 hours between two readings of the same file as
   zero-step buckets, so interior days still get a total (the first and last day of a file never do, since the file
   may start after or end before midnight; a gap of a day or more is a band that was off and stays missing). Confirm:
   first real import, `stepDayTotalsWritten` in the report, and that no day shows a total for a day the band was off.
4. **Heart-rate shape and confidence.** `{"dateTime","value":{"bpm","confidence"}}`, confidence 0 to 3; points with
   confidence 0 or below are dropped and counted. If the real scale differs (for example 1 to 3 with 0 absent),
   nothing breaks, but the dropped count will show it.
5. **Units and meaning, stored raw and unused by scores until confirmed:** HRV `low_frequency` / `high_frequency`
   (new metrics `HRV_LOW_FREQUENCY`, `HRV_HIGH_FREQUENCY`, unit assumed ms squared); `Device Temperature` and
   `Computed Temperature` (absolute versus deviation is decided per value by range, never assumed); exercise distance
   (stored only when its unit is stated) and elevation (never stored: unit unknown); `rmssd` of the daily summary versus
   the details file.
6. **Sleep.** `levels.data` / `levels.shortData`, `mainSleep`, `logId` as a stable id (`takeout:sleep:<logId>`). A night
   that also arrives from Health Connect is de-duplicated by overlap in the ingestor, not by id. Confirm with a night
   present in both sources.
7. **ZIP details.** Entries written with a data descriptor (streamed archives) are tested; ZIP64 (entries over 4 GB or
   more than 65,535 entries) and `STORED` entries with a data descriptor (which `ZipInputStream` cannot read) are not,
   because the generator in tests cannot produce them. Such an entry is reported as a truncated part, never a crash.
   `.tgz` exports are reported as unsupported. Confirm: first real archive of each kind.
8. **Cost.** Every recognised entry is decompressed twice (inspection computes size and CRC-32, import parses). A
   multi-gigabyte archive therefore takes about twice the read time. Measure on the phone; if too slow, the inspection
   pass can be limited to the planner's needs.
9. **Resume trust.** A resumed file skips the first `committedRows` rows its mark recorded, which relies on the same
   bytes giving the same rows in the same order. If a later app version changes a parser's output for an unchanged
   file, the resume of a file interrupted across that upgrade would skip the wrong rows. Mitigation if it matters:
   force full re-import after upgrading a parser.

9a. **New routes (calories, distance, active zone minutes, minutes per level, VO2 max, weight, Google exercise and
    sleep).** File names, columns, units and day-total coverage rules are listed in `API_VALIDATION.md` (Takeout archive
    routes). Specific to confirm on the first real archive: (a) classic `distance-*.json` is centimetres per minute;
    (b) classic `calories-*.json` is total energy including BMR; (c) whether AZM `total_minutes` already counts cardio
    and peak double; (d) whether the classic active-minutes files hold one entry per day or per minute; (e) the real
    column names of `UserExercises_*.csv` and `UserSleepStages_*.csv` (guessed; a wrong guess shows up as
    SCHEMA_MISMATCH in the report, never as wrong numbers); (f) whether a Google-layout `distance` column states a
    unit in its header; (g) that Google-layout files carry `Z` instants, not local times. Sparse series (distance,
    active energy, AZM, minutes per level) get a day total only on days the steps series covers completely.
9b. **Resume trust for the new parsers** is the same as item 9: a resumed file skips the first
    `committedRows` rows, which relies on the same bytes giving the same rows in the same order. The zero-fill of silent
    step stretches changes the rows a steps file yields compared with the previous app version, so an interrupted steps
    import resumed across that upgrade could skip the wrong rows: force a full re-import after upgrading.

### Things that need a device or CI (no Android SDK was available when this was written)

10. `TakeoutRoomBindings.kt`, `TakeoutImportWorker.kt`, `TakeoutImportScheduler.kt` were compiled only against
    hand-written stubs of Room, WorkManager and the Android framework (the plain-JVM engine and the state mapping were
    compiled and tested for real). Run `./gradlew :core:data:testDebugUnitTest :core:database:testDebugUnitTest`.
    `TakeoutRoomBindingsRobolectricTest` (real ingestor, real Room, cancel-and-resume, watermark forward-only, step total
    reconciliation, demo refusal) has never been executed.
11. **Schema export `3.json`** is generated by the first build (`room { schemaDirectory }`) and must be committed
    next to `1.json` and `2.json`. `ApexDatabaseMigrationTest` (1 to 3 and 2 to 3, rows survive, new table works) has not
    been run.
12. Foreground service of type `dataSync` on a device: start from the picker, background the app, confirm the
    notification shows "File X of Y" and no values; kill the process mid-import and confirm WorkManager restarts it and the
    engine resumes from the marks. Android 15 limits `dataSync` foreground services to about six hours per 24; an import
    that long would be stopped by the system and resumed by WorkManager.
13. **Persisted URI.** The picked content URIs are part of the work's input so an import can resume after process
    death, so WorkManager keeps them until the work is pruned (`TakeoutImportScheduler.cancel` prunes). The brief says to
    persist nothing about the URI beyond the session; this is the unavoidable cost of resuming by itself. Decide whether
    to prune finished work on a timer.

## Ingest bounds and sync recovery (`core/data/.../ingest`, `sync/SyncResumePlan.kt`)

Status: `UNVERIFIED-NEEDS-REAL-ACCOUNT` unless stated. The Room-backed tests for these run on CI only (no Android SDK in the cloud session).

1. **Floor of 2010-01-01.** Assumed no real Fitbit or Health Connect record is older. A real archive that holds
   older weight or sleep logs would have them counted as `rejected`. Confirm with the first import report's
   rejected count; lower `ObservationBounds.MIN_EPOCH_MILLIS` if genuine older data shows up.
2. **Split night.** Both parts of a night split by a long awake period that clear 180 minutes are reduced to the
   longer one as main sleep; the shorter is a nap and is not scored. Whether the real Google/Fitbit sleep log splits
   nights, and how the owner expects them scored (merge versus longest), needs a real account with such a night.
3. **Main-sleep floor of 180 minutes asleep** is the existing constant (`MAIN_SLEEP_MIN_MINUTES`); it is now also
   enforced against a source flag. A genuine short main sleep (night shift worker, 2 h 50 min) becomes a nap.
4. **Owed-replay mark in `cursorToken`.** Not visible to the user; disconnecting a source (`deleteForSource`) drops
   its mark with the row. Confirm once on a device by cancelling a first 90-day backfill (Data Sources, then kill
   the app) and checking that the days from the first windows have scores after the next sync.

## Google band-only heart rate, sleep-stage HRV, estimated VO2, Health Connect night values

Status: `UNVERIFIED-NEEDS-REAL-ACCOUNT`.

1. **`google-wearables` returns only the Air.** Confirm on a real account that the `heart-rate` minutes no longer
   include phone or Health Connect samples (compare a day with and without the filter in a debug build).
2. **`heart-rate-variability` samples for an Air.** If the API returns none, `HRV_SLEEP_SAMPLES` stays empty (no value
   is invented). Confirm cadence and that LF/HF `metadata` is present.
3. **Meaning of `estimated` on `daily-vo2-max`** for a band without GPS. If Google marks every row estimated, the
   VO2 max shows as ESTIMATED throughout; confirm and decide whether the label is still right.
4. **`nonRemHeartRateBeatsPerMinute`** is stored as SLEEPING_HEART_RATE (Google provenance, outranks the derived
   value). Confirm it is a mean over the night's non-REM sleep and not a lowest value.
5. **Health Connect night stamp.** The 2-minute allowance after sleep end (`HealthConnectMapper.NIGHT_END_GRACE_MS`) is
   from Pulse; confirm when the Fitbit/Google app stamps HRV, SpO2 and respiratory rate on an Air.
6. **Health Connect read lead.** The 24 h look-back on heart-rate reads relies on the platform returning interval records
   by start time; confirm on the owner's Android version.

## Fitbit Air device status and background reads (G-air)
- Confirm on a real account that `pairedDevices.list` returns the Air with `deviceType=TRACKER`, a readable `deviceVersion`,
  `batteryLevel` and `lastSyncTime`. Missing values show as "Not available". An existing sign-in needs one "Sign in again"
  to grant `settings.readonly`; until then the row says to reconnect.
- A Health Connect read refused in the background with the record permission granted is recorded as `FAILED` with the code
  `HealthConnectBackgroundReadException` (the orchestrator is not owned by this change); the screen shows "reads when the app is open".
  A distinct `SyncStatus` would need an orchestrator change.

## Formula version 4 wiring: stress, energy, heart-rate dip, journal (data layer)

Status: logic and tests are in place; everything marked "confirm" needs real data. No Google endpoint, field or scope was added.

1. **Journal factors have no screen yet.** The journal tab stores only the fatigue and soreness ratings. The data layer now stores five yes/no
   factors (`MetricType.JOURNAL_*`, written by `AthleteRepository.saveJournalFactors`) and computes the 90-day associations
   (`journal(day)` / `DayAnalysis.journalEffects`); the factor list (`JournalDay.FACTORS`) is a design choice the owner may change.
3. **Calibration choices without validation** (all in `docs/FORMULAS.md` section 8): stress logistic constants and 5 bpm sigma floor, energy rates,
   the 10 % dipper threshold, zone 4 as the minimum peak for heart-rate recovery, 5 days per arm for journal effects. Confirm by reading a week of
   the owner's own data against how the days felt; change the constants in code, bump `ANALYTICS_ALGORITHM_VERSION`.
4. **FRIEND norms and fitness-age curve are transcriptions** from the Pulse reference and unchecked against the paper (`EVIDENCE.md`); the HUNT
   regression is not in the code. Confirm against Kaminsky 2015 Table 2 before the category is shown as more than context.
5. **Demo steps and activity are synthetic.** The demo store now emits minute step samples and activity, body and vitals series; they exist only
   so every screen has something to show and are labelled `SYNTHETIC_DEMO`.
