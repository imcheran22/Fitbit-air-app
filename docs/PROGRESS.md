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
- CI run for 152fc2b: **green**: every unit and Robolectric test, lint, debug and release builds, and the
  emulator smoke job (release APK on API 34: launch, Demo mode, all four tabs, rotation, 200 % font,
  kill and relaunch, dark mode; screenshots in the `smoke-screens` artifact).
- Later commits (sync resume fix) need their CI run checked.
- APKs: CI artifact `apex-apks` (`app-debug.apk`, `app-release-unsigned.apk`); `smoke-apk` holds a copy signed with
  a throwaway CI key for the emulator only.

## Verification reviews (owner request, Opus): `docs/review/`
- `AI_AND_SCREENS.md`: coach and Ask Apex pass (model ID, request format, no logging, preview = payload,
  degrades offline, numbers bound). Bugs 1-8 listed there. **Fixes are half done in
  `docs/review/wip-ai-screens-fixes.patch`** (journal day key, profile recompute, coach units/wording,
  numeral check, payload). Apply with `git apply docs/review/wip-ai-screens-fixes.patch`, finish, test, commit.
- `DATA_FLOW_E2E.md`: broken links 1-2 (capped runs never advanced; oldest data first) are **fixed** in the sync
  resume commit. Items 3-14 open (live HR provenance, stored-but-unshown streams, GH heart-rate source family,
  HC nightly readings, scope trim, VO2 max estimated label, Takeout coverage).
- `METRICS_ALIGNMENT.md`: bugs B1-B12 open (B1 recovery renormalisation and B2 partly worn days are high),
  plus ranked Pulse alignment gaps (stress, energy bank, etc.).
- Pulse "cleaned" zip from the owner's Drive (42 MB) could not be fetched (private, Drive tool limit 10 MB);
  reviews used `reference/design/pulse-mobile-main`.

## Open for the owner (details in `docs/OPEN_POINTS.md`)
- Sleep Poor/Sufficient/Optimal bands (FORMULAS section 4 has proposals); whether manual-workout RPE feeds load.
- Citations in `EVIDENCE.md` are unverified.
- Everything marked `UNVERIFIED-NEEDS-REAL-BAND` / `...REAL-ACCOUNT`: run the diagnostics report on the phone and send it back.

## Next actions (agents paused by the weekly usage limit until Nov 17, 18:00 UTC)
1. Apply and finish `wip-ai-screens-fixes.patch` (AI_AND_SCREENS bugs 1-8), tests first; CI green.
2. METRICS_ALIGNMENT B1, B2, B5, B9 and DATA_FLOW 3, 6, 7, 12 (tests first, Sonnet; science items on the science-reviewer).
3. Re-run CI including the smoke job; then the final report with APK paths.
