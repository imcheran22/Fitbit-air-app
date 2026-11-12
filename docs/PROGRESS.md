# Progress (cold-resume note)

Last updated: 2026-11-12. Work is committed. Planning change: the build now runs in 7 stages (`docs/ROUTE_MAP.md`), no Fable, one model per stage chosen by the owner.
**Current stage: 1 (Lock the base).** Start with `/stage 1`.

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
1. `/stage 1` on Sonnet (low): full build, v1→v2 migration test, `AUDIT.md`, `DECISIONS.md`, `EVIDENCE.md`, `OPEN_POINTS.md`.
2. `/stage 2` on Sonnet: `:core:ui` kit, `:app` shell, Overview on Demo data, first debug APK.
3. `/stage 3` on Sonnet (takeout-engineer on Sonnet high, tests first): Health Connect, Takeout engine, replay; optional `/gate 3` on Opus.
