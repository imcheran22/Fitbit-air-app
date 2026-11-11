# Progress (cold-resume note)

Last updated: 2026-11-11. Nothing is committed yet; all work is in the working tree.

## Done and verified
- **M0 audit (read-through):** `:core:domain`, `:core:analytics`, `:core:database` read in full. Engines and DAOs are sound; no defects found that needed a fix. `docs/AUDIT.md` not written yet.
- **Reality gate (partial):** Google Health API v4 discovery document fetched and saved to
  `docs/api-snapshots/google-health-v4-discovery-2026-11-11.json` (revision 20261109). Endpoints, filter
  syntax, scopes and the schemas of heart-rate, HRV, SpO2, respiratory rate, skin temperature, sleep,
  exercise, steps, VO2 max and paired devices were read from it. `api.fitbit.com` now answers with a
  Google-style 401, so the legacy Fitbit Web API is treated as retired and is **not** being implemented.
- **Additive changes to finished modules:** `SyncSource.FITBIT_TAKEOUT_ARCHIVE`, `DataProvenance.SYNTHETIC_DEMO`,
  archive ranked first in `SourceReconciler`, database schema v2 (`workout.perceivedExertion`, auto-migration),
  `ApexDatabaseFactory.createDemo`, a few DAO read/count/delete methods.
- **`:core:ui`:** theme foundation (tokens, type, fonts, contrast test).
- **`:core:data` (walking skeleton core), 9 tests green** (`./gradlew :core:data:testDebugUnitTest`, Robolectric):
  `model/Observations.kt`, `ingest/HealthIngestor.kt`, `settings/Settings.kt`, `source/HealthSource.kt`,
  `source/DemoSource.kt`, `pipeline/DailyIntelligencePipeline.kt`, `store/ApexStores.kt`,
  `sync/TriSourceSyncOrchestrator.kt`, `coach/RuleBasedCoachEngine.kt`, `repository/AthleteRepository.kt`.
  Tests cover: demo data through the real ingestor, database and pipeline; calibration; missing data stays
  missing; idempotent re-ingest; finer heart rate never overwritten by coarser; split-minute merge;
  implausible values rejected; coach numerals bound to slots; deterministic replay.

## Not started
- `:core:network` (OAuth PKCE, token store, Google Health client) — build file cleaned, no Kotlin yet.
- `:core:data`: Health Connect source, Google Health source, Takeout engine, workers, export/delete, alerts.
- `:core:ui` components, shells and charts.
- `:app`: Application, DI, manifest, navigation, every screen, proguard rules.
- Docs: AUDIT, DECISIONS, EVIDENCE, OPEN_POINTS, SETUP, VERIFICATION, API_VALIDATION, API_MAPPING, REDTEAM;
  FORMULAS.md evidence grading.
- Emulator: system image exists but no AVD is created.

## Not yet re-run after the latest changes
Full build (`:core:domain:test :core:analytics:test testDebugUnitTest :app:assembleDebug`) and the database
migration test for schema v2.

## Next three actions
1. Run the full build; add a v1→v2 migration test; write `docs/AUDIT.md` and `docs/DECISIONS.md`.
2. Build `:core:ui` components (ScoreDial, cards, rows, charts, glass tab bar) and the `:app` shell with
   Overview on Demo data; produce a debug APK and look at it on an emulator.
3. Health Connect source, then the Takeout engine, then the Google Health client.
