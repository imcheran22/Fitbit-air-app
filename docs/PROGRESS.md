# Progress (cold-resume note)

Last updated: 2026-11-12. Branch `claude/fitbit-air-compatible-app-ykbju8`; everything below is committed and pushed.
The build gate is GitHub Actions (`.github/workflows/android.yml`): this cloud session has no Android SDK.

## Done
| Milestone | State | Evidence |
|---|---|---|
| M0 audit and baseline | done | `docs/AUDIT.md`, `docs/DECISIONS.md` |
| M1 walking skeleton | done | Demo store through the real ingestor and pipeline; Overview on engine output |
| M2 `:core:ui` | done | tokens, components, shells, Canvas charts, component gallery, contrast test |
| M3 `:core:network` + `:core:data` | done | OAuth PKCE + Keystore token store, Google Health v4 client from the saved discovery document, Health Connect reader (read-only, change tokens), tri-source orchestrator, workers, Takeout ZIP engine (streaming, resume, per-file marks, D6), export/import/delete-all |
| M4 `:app` screens | done | all 21 routes in `docs/APP_CONTRACT.md`, process-death safe state, manifest with Health Connect rationale, `allowBackup=false` |
| M5 insights, alerts, coach | done | rule-based coach, alert ledger and scheduler, optional Ask Apex (own key, encrypted, preview, `AI_INTERPRETED`) |
| M6 hardening, red team | mostly done | `docs/REDTEAM.md`; the five critical/high gaps fixed tests-first (D7); diagnostics report (Data sources screen) for the known unknowns |
| M7 docs and handoff | mostly done | `SETUP.md`, `VERIFICATION.md`, `API_VALIDATION.md`, `API_MAPPING.md`, `EVIDENCE.md`, `OPEN_POINTS.md`, `FORMULAS.md` v2 |

Room schema is v3 (`takeout_file_mark`, AutoMigration 2→3); `core/database/schemas/.../3.json` is committed from the CI artifact.

## Verification state
- CI command: `./gradlew --continue :core:domain:test :core:analytics:test testDebugUnitTest lint :app:assembleDebug :app:assembleRelease`
  (the workflow prints a build-error summary and a test summary). Run 22 (commit 18ea6de): everything compiled, lint and
  both APKs built, 606/615 tests passed; the 9 failures were one Robolectric class booting the real Application, fixed in ecccdd0.
- APKs are uploaded by CI as the `apex-apks` artifact (`app/build/outputs/apk/debug/app-debug.apk`,
  `app/build/outputs/apk/release/app-release-unsigned.apk` unless signing env vars are set; see `SETUP.md`).
- Not done: launching the release APK on an emulator (spec section 13 item 4), screenshot tests light/dark.

## Open for the owner (details in `docs/OPEN_POINTS.md`)
- Sleep Poor/Sufficient/Optimal bands (FORMULAS section 4 has proposals); whether manual-workout RPE feeds load.
- Citations in `EVIDENCE.md` are unverified.
- Everything marked `UNVERIFIED-NEEDS-REAL-BAND` / `...REAL-ACCOUNT`: run the diagnostics report on the phone and send it back.

## Next three actions
1. Get CI fully green on the latest commit and record the run number here.
2. Add an emulator smoke job: install the release APK, start it, check it stays alive in Demo mode.
3. README status table and the final report (spec section 16).
