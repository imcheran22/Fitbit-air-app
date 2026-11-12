# Google Health API to Apex mapping

Snapshot revision 20261109. Unit and field names are from the discovery schemas. "Day" = civil date in the user's zone.
Mapping to `MetricType` is the intended use by the data layer; the network module only returns DTOs.

| Data type (path id) | Kind / filter | Fields | Unit | Timestamp semantics | Apex MetricType |
|---|---|---|---|---|---|
| `heart-rate` | sample, `sample_time.physical_time` | `beatsPerMinute` (int64 string) | bpm | `sampleTime.physicalTime` UTC + `utcOffset` | raw sample for HEART_RATE_AVG/MIN/MAX, sleeping HR |
| `daily-resting-heart-rate` | daily, `.date` | `beatsPerMinute`, metadata.calculationMethod | bpm | `date` | RESTING_HEART_RATE |
| `daily-heart-rate-variability` | daily | `averageHeartRateVariabilityMilliseconds`, `deepSleepRootMeanSquare...Milliseconds`, `entropy`, `nonRemHeartRateBeatsPerMinute` | ms, bpm | `date` | HRV_RMSSD, HRV_DEEP_SLEEP_RMSSD, SLEEPING_HEART_RATE (non-REM HR, Google provenance) |
| `heart-rate-variability` | sample | `rootMeanSquareOfSuccessiveDifferencesMilliseconds`, `standardDeviationMilliseconds`, metadata LF/HF power | ms | `sampleTime` | HRV_SLEEP_SAMPLES (stream `hrv-sleep`): mean RMSSD of the samples inside the night's asleep stages (AWAKE and RESTLESS excluded), one value on the day the sleep ended. Computed in `GoogleHealthApiSource` + `GoogleHealthMapper.hrvDuringSleep` because it needs the night's stages. Read with `dataSourceFamily=google-wearables`. Never written to HRV_RMSSD |
| `daily-oxygen-saturation` | daily | `averagePercentage`, `lowerBoundPercentage`, `upperBoundPercentage` | % | `date` | SPO2_AVG, SPO2_LOWER_BOUND, SPO2_UPPER_BOUND |
| `oxygen-saturation` | sample | `percentage` | % | `sampleTime` | SpO2 samples |
| `daily-respiratory-rate` | daily | `breathsPerMinute` (main sleep) | brpm | `date` | RESPIRATORY_RATE |
| `respiratory-rate-sleep-summary` | sample | full/light/rem/deep stats | brpm | `sampleTime` | RESPIRATORY_RATE (per sleep) |
| `daily-sleep-temperature-derivations` | daily | `nightlyTemperatureCelsius`, `baselineTemperatureCelsius`, `relativeNightlyStddev30dCelsius` | deg C | `date` | SKIN_TEMP_NIGHTLY; SKIN_TEMP_DEVIATION = nightly - baseline (computed, both inputs must be present) |
| `sleep` | session, `interval.end_time` | `interval`, `stages[]` (AWAKE/LIGHT/DEEP/REM/ASLEEP/RESTLESS), `summary` (minutes*), `metadata.mainSleep/nap/processed` | min | stage times UTC + offsets | SLEEP_DURATION (minutesAsleep), TIME_IN_BED (minutesInSleepPeriod), SLEEP_DEEP/REM/LIGHT/AWAKE (stagesSummary), SLEEP_LATENCY (minutesToFallAsleep); efficiency derived |
| `exercise` | session, `interval.civil_start_time` | `exerciseType`, `interval`, `activeDuration`, `metricsSummary` (kcal, distanceMillimeters, steps, avg HR, zone durations) | mm, kcal, s | UTC + offsets | workout rows; distance mm to m |
| `steps` | interval, `interval.start_time` | `count` | steps | interval start/end | STEPS (sum; reconcile for totals) |
| `distance` | interval | `millimeters` | mm | interval | DISTANCE (m) |
| `floors` | interval | `count` | floors | interval | FLOORS |
| `active-energy-burned` / `basal-energy-burned` | interval | `kcal` | kcal | interval | CALORIES_ACTIVE / CALORIES_TOTAL (active + basal) |
| `active-zone-minutes` | interval | `activeZoneMinutes`, `heartRateZone` | min | interval | ACTIVE_ZONE_MINUTES |
| `active-minutes` | interval | per-level `activeMinutes` | min | interval | LIGHTLY/MODERATELY/VERY_ACTIVE_MINUTES (LIGHT/MODERATE/VIGOROUS) |
| `sedentary-period` | interval | interval only | min (duration) | interval | SEDENTARY_MINUTES |
| `daily-vo2-max` | daily | `vo2Max`, `cardioFitnessLevel`, `estimated` | ml/kg/min | `date` | VO2_MAX; rows with `estimated == true` are written with ESTIMATED provenance, others DIRECT_SENSOR_GOOGLE_HEALTH_API |
| `vo2-max`, `run-vo2-max` | sample | `vo2Max` / `runVo2Max` | ml/kg/min | `sampleTime` | VO2_MAX (finer) |
| `weight`, `body-fat` | sample | `weightGrams`, `percentage` | g (to kg), % | `sampleTime` | WEIGHT, BODY_FAT |
| `daily-heart-rate-zones`, `time-in-heart-rate-zone` | daily / interval | zone min/max bpm; zone interval | bpm | date / interval | TRIMP inputs |
| `pairedDevices` | list | deviceVersion, deviceType, batteryLevel, lastSyncTime, features | - | `lastSyncTime` UTC | device/freshness diagnostics |
| `identity` | get | `healthUserId`, `legacyUserId` | - | - | sign-in check |

Notes: all numbers stay missing when absent (null DTO fields); provenance for every point is `dataSource.platform` /
`recordingMethod` (map to `SyncSource` GOOGLE/FITBIT_WEB_API as appropriate). `dataSourceFamily=google-wearables`
excludes manual entries and is sent for `heart-rate` and `heart-rate-variability` only (never for `sleep`, which does not accept it); `reconcile` returns one merged stream.
