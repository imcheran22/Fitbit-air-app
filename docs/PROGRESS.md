# Progress (cold-resume note)

Last updated: 2026-11-13. Branch `claude/fitbit-air-compatible-app-ykbju8`.
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
| M6 hardening, red team | done | `docs/REDTEAM.md`; critical/high gaps fixed tests-first (D7); diagnostics report (Data sources screen) |
| M7 docs and handoff | mostly done | `SETUP.md`, `VERIFICATION.md`, `API_VALIDATION.md`, `API_MAPPING.md`, `EVIDENCE.md`, `OPEN_POINTS.md`, `FORMULAS.md` |

| M8 feature parity (owner's Pulse prompt) | done, CI green on b2e5a7c | Detail screens (activity, body, stress, energy, fitness, monitor, trends + overlay, naps); goals, reports (image/PDF share), weekly plan; behaviours, quick log, food, blood pressure, breathe + spot HRV; live recorder (health FGS) + BLE strap; 3 Glance widgets; experimental health age (off by default). Dropped by the owner: coach multi-chat, translations (D14). Excluded: ECG (D11). Deferred: cycle (D12). |

Room schema is v4 (local logs, AutoMigration 3→4); `4.json` is committed.
Sync opens on app start (15 min throttle) and right after onboarding.

## Verification state
- CI green on 152fc2b and 2b70ed9: every unit and Robolectric test, lint, debug and release builds, and the
  emulator smoke job (release APK on API 34: launch, Demo mode, all four tabs, rotation, 200 % font,
  kill and relaunch, dark mode; screenshots in the `smoke-screens` artifact).
- APKs: CI artifact `apex-apks` (`app-debug.apk`, `app-release-unsigned.apk`); `smoke-apk` holds a copy signed with
  a throwaway CI key for the emulator only.

## Verification reviews (owner request, Opus): `docs/review/`
- `AI_AND_SCREENS.md`: bugs 1-8 **fixed** (78388f8).
- `DATA_FLOW_E2E.md`: items 1-3 **fixed**; 6-10 and 12 in progress (data-collection track); 4 (stored but unshown
  streams: history charts, steps), 11, 13, 14 open.
- `METRICS_ALIGNMENT.md` B1-B12 and `BEVEL_ALIGNMENT.md` do-next 1-12: in progress (scoring track, formula v3,
  D8; data-collection track for 4, 7, VO2 label, 12).
- The owner's Pulse main (cleaned) zip is in `reference/design/pulse-main-cleaned/` (read-only, includes the Bevel
  metric study); the Bevel review used it.

## Open for the owner (details in `docs/OPEN_POINTS.md`)
- Sleep Poor/Sufficient/Optimal bands (FORMULAS section 4 has proposals); whether manual-workout RPE feeds load.
- Citations in `EVIDENCE.md` are unverified.
- Everything marked `UNVERIFIED-NEEDS-REAL-BAND` / `...REAL-ACCOUNT`: run the diagnostics report on the phone and send it back.

## Next actions
1. Release pipeline test (release-request trigger), then the owner's sign-in setup (SETUP.md) and a signed build with the client ID.
2. Optional Opus gates (data integrity, privacy/release).
3. Real-device checks: sign-in client type, recorder on Android 14+, strap, widgets (OPEN_POINTS).
