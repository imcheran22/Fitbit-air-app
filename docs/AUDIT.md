# M0 audit

Audit of the inherited repository against master prompt §5. Severity: **High** (breaks a release,
an invariant or data), **Medium** (wrong under some conditions), **Low** (hygiene). Status is the state
at the time of the last update; fixes reference their commit or test.

Baseline (2026-11-11): `:core:domain:test :core:analytics:test` green on the cloud JVM harness;
`./gradlew --continue :core:domain:test :core:analytics:test testDebugUnitTest :app:lintDebug
:app:assembleDebug :app:assembleRelease` green on GitHub Actions (run 7, JDK 21, ubuntu-latest).

| # | Lead (§5) | Finding | Severity | Evidence | Fix / status |
|---|---|---|---|---|---|
| A1 | `app/proguard-rules.pro` empty while release minifies | Confirmed empty. The library modules ship `consumer-rules.pro` with keep rules for SQLCipher (`net.zetetic.database.**`), kotlinx-serialization serializers in `core.data`/`core.network`, OkHttp platform `-dontwarn`s. App-level rules (Room generated `_Impl`, WorkManager workers instantiated by reflection, Compose) still have to be confirmed by a minified release launch. | High | file contents; consumer rules in `core/*/consumer-rules.pro` | App rules added with the `:app` module (M4); proof is the release smoke test (§11), tracked in `EVIDENCE.md` |
| A2 | Manifest has no activity, redirect, Health Connect plumbing, `INTERNET`, notifications | Confirmed: the manifest only sets `allowBackup=false`, label and RTL. | High | `app/src/main/AndroidManifest.xml` | Rewritten with the `:app` module (M4), including the Health Connect rationale filter and Android 14+ `VIEW_PERMISSION_USAGE` alias |
| A3 | `ARCHITECTURE.md` API facts unverified | The first session fetched and saved the Google Health API v4 discovery document (revision 20261109); API facts are re-derived from that file only, recorded in `API_VALIDATION.md`/`API_MAPPING.md`. | Medium | `docs/api-snapshots/google-health-v4-discovery-2026-11-11.json` | Re-derived during M3 |
| A4 | `core/database/schemas/` only `.gitkeep` | **Not reproduced**: schema export is on (`room { schemaDirectory(...) }`, `exportSchema = true`) and `1.json`, `2.json` are committed. Missing: a migration test for 1→2. | Medium | `core/database/build.gradle.kts`, `schemas/` | Migration test added with the next schema change (Takeout watermarks) |
| A5 | JDK / toolchain compatibility | CI (JDK 21) builds AGP 8.13.0, Kotlin 2.2.21, KSP 2.2.21-2.0.5, Room 2.8.3, SQLCipher 4.20.0 from scratch and green; sources/targets are Java 17. README says JDK 17+, which is correct for the targets but CI uses 21. | Low | CI run 7 | README states "JDK 17 or 21 (CI uses 21)" |
| A6 | Formulas vs `FORMULAS.md` | Delegated to the science review (Fable). Results appended in the section below. | - | - | See "Formula review" |
| A7 | Reconciler tie-breaks, watermark monotonicity, HR bucketing, window functions | `SourceReconciler` ranks the Takeout archive first; `SyncWatermarkDao.advance` only moves forward (`ApexDatabaseTest.watermarkOnlyMovesForwardAndFailuresLeaveItInPlace`); HR is bucketed per UTC minute in `HealthIngestor` (split-minute merge test in `DemoPipelineTest`). Rolling statistics are computed in SQL without window functions (`rollingStatsMatchHandComputedMeanAndSampleVariance`), so the bundled SQLite version does not matter. | Low | tests named | No change needed |
| A8 | Can the schema hold 5-minute HRV LF/HF, minute SpO2, minute skin temperature? | `metric_sample` is keyed by (metric type, timestamp) and stores any timestamped scalar, so minute SpO2, minute skin temperature and 5-minute RMSSD fit. LF/HF need their own `MetricType` values; HRV coverage is not stored. | Medium | `MetricSampleEntity`, `MetricType` | Handled by the Takeout engine (M3); additive only |
| A9 | Fitbit Web API in scope | Retired; not implemented (DECISIONS D1). | - | PROGRESS.md | Decided |
| A10 | Build environment | The cloud session cannot reach `dl.google.com` (Google Maven / Android SDK). | Medium (process) | proxy 403 | CI is the Android build gate (DECISIONS D2) |

## Formula review

Pending: written by the science review before M3 is marked done.
