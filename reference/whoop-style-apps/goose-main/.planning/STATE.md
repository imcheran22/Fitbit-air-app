---
gsd_state_version: 1.0
milestone: v17.0
milestone_name: Algorithm Depth & Noop Feature Parity
status: planning
last_updated: "2026-06-28T12:00:00.000Z"
last_activity: 2026-06-28
progress:
  total_phases: 11
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-21)

**Core value:** The user captures WHOOP data on iPhone and it is automatically persisted on their personal server — without depending on external infrastructure. Metrics align with WHOOP from the same raw data.
**Current focus:** v15.0 — Protocol Depth, Algorithms & UX

## Current Position

Phase: 140 (next) — roadmap defined, not yet planned
Plan: —
Status: Roadmap created (11 phases, 140–150)
Last activity: 2026-06-28 — v17.0 roadmap created

## Performance Metrics

**Velocity:**

- Total plans completed: 27 (v13.0 complete)
- Average duration: —
- Total execution time: —

**Recent Trend:**

- Last 5 plans: Phase 97 P03, Phase 97 P02, Phase 97 P01, Phase 96 P02, Phase 95 P02
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v14.0 scope: Android port (#169) is the headline feature — `android/` Kotlin/Compose + JNI bridge to existing `libgoose_core.so`; CI APK step already stubbed in `android-core.yml`
- v14.0 scope: Historical sync bugs grouped by generation — Gen5 routing (Phase 98), Gen4 reassembly (Phase 99); SEED-003/004 already completed in v12.0 (bridge/, store/, BLESessionCoordinator actor)
- v14.0 scope: BLE reliability in Phase 100 (MTU 247 + LE 2M PHY + off-wrist detection)
- v14.0 scope: P2/P3 issues (#164 Harvard sleep, #165 feature flags, #166 body composition, #167 stealth mode, #168 PIP upload) deferred to v15.0
- SEED-003/004 status: largely completed in v12.0 (phases 83-91) — bridge/ directory exists, store/ split done, BLESessionCoordinator actor live, DeviceCatalog wired; only 38 unwraps remain (ARCH-11 in Phase 110)
- MG detection: `peripheral.name?.lowercased().contains(" mg")` used in v13.0; advertisement byte layout unconfirmed (D-03); Phase 109 to harden
- [Phase ?]: GET_FF_VALUE (cmd 0x80) wired into BLE handshake after sendGetBodyLocationAndStatus on every reconnect with 3s timeout fallback (FF-01, D-01, D-02)
- [Phase ?]: DeviceCapabilities uses custom Decodable init(from:) with decodeIfPresent so feature_flags absence defaults to empty dict (D-02)
- [Phase ?]: pendingFeatureFlagDeviceID captured at send time to guard disconnect race in GET_FF_VALUE response handler (T-115-03)
- [Phase ?]: realtime_frames has no FK to devices — realtime PIP path does not pre-register devices
- [Phase ?]: captured_at TIMESTAMPTZ (not TEXT) enables TimescaleDB partitioning; psycopg casts ISO8601 automatically
- [Phase 120]: dynamicSleepNeed stored as plain var on HealthDataStore base body (@Observable — no @Published); runDynamicSleepNeed() called FIRST in refreshSleepAfterBandSync; sleep_need_minutes fallback is 450.0 (not 480.0) at all four sites; SleepV2ClockDial required its own @Environment injection (separate struct from SleepV2SleepWindowCard)
- [Phase ?]: D-01: UUID fd4b0004 (EVENTS_FROM_STRAP) is cap sense characteristic — already subscribed, no new subscription
- [Phase ?]: D-03: handleCapSenseEventValue wraps isOnWrist in DispatchQueue.main.async matBodyLocationValue pattern

### Roadmap Evolution

- v17.0 Phases 140–150 defined 2026-06-28: Baselines EWMA (140, keystone), HRVAnalyzer (141), StrainScorer (142), RecoveryScorer+DaytimeStress (143), Visual Components (144), Sleep UI (145), Workout UI (146), Data Exploration (147), BLE Protocol Expansion (148), R22 Deep Stream Unlock (149, gated/high-risk), Strap Notification Mirroring (150); 30/30 requirements mapped; start at 140 leaves 127–139 for v16.0 Android milestone
- v14.0 Phases 98–111 defined 2026-06-20: historical sync (98-99), BLE reliability (100), telemetry+crash+protocol (101), Gen4 metrics (102), Android port (103-107), battery (108), MG (109), code health (110), comments (111)
- v15.0 Phases 112–126 defined 2026-06-22: optical protocol (112-113), Harvard sleep need (114), feature flags (115), body composition (116), Android parity (117), PIP queue (118), stealth mode (119), sleep need UI (120), body composition UI (121), stealth UI (122), real-device validation (123), PIP server (124), cap sense (125), wake-window RE-gated (126)
- v13.0 Phases 92–97 shipped 2026-06-20 (all complete)

### Pending Todos

- Build Android UI 1-to-1 parity with iOS app (2026-06-26)

### Blockers/Concerns

- HAP-04 (Phase 73, wake-window): protocol-analysis-gated — do not write implementation tasks until BLE capture of `STRAP_DRIVEN_ALARM_EXECUTED` and protocol analysis of `SetAlarmInfoCommandPacketRev4` are complete
- Phase 66 (Cap Sense): hardware-gated — requires real WHOOP 5.x device; deferred indefinitely
- Hardware gate reminder: ALG-HRV-04, ALG-SLP-04, SLP-SYNC real-device remain deferred (hardware gate)
- WHOOP MG (Phase 109): MG advertisement byte layout not yet confirmed — Phase 109 must resolve or document safe fallback

## Deferred Items

Items deferred from previous milestones:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| debug_session | ble-api-misuse-state-restore | awaiting_human_verify | v8.0 close |
| debug_session | rust-ci-linux-test-failures | investigating | v10.0 close |
| hardware_gate | Phase 51 — VAL-HRV-01, VAL-SLP-01, SLP-SYNC real-device | blocked | v7.0 close |
| hardware_gate | Phase 66 — CAPSENSE-01 on-wrist detection | blocked | v9.0 close |
| re_gate | Phase 73 — HAP-04 wake-window engine | re_required | v10.0 roadmap |
| verification_gap | Phase 22 — ALG-HRV-04 RMSSD parity (≥5 real sessions) | human_needed | v5.0 close |
| verification_gap | Phase 26 — ALG-SLP-04 4-class staging validation | human_needed | v5.0 close |
| uat_gap | Phase 73 — 73-UAT.md | partial | v10.0 close |
| deferred_v15 | #164 Harvard sleep need model | pending_v15 | v14.0 scope |
| deferred_v15 | #165 GET_FF_VALUE feature flags | pending_v15 | v14.0 scope |
| deferred_v15 | #166 body composition history table | pending_v15 | v14.0 scope |
| deferred_v15 | #167 UI stealth mode metric hiding | pending_v15 | v14.0 scope |
| deferred_v15 | #168 PIP upload separate data pipeline | pending_v15 | v14.0 scope |
| Phase 100 P01 | 15 min | 2 tasks | 2 files |
| Phase 101 P02 | 1 min | 1 tasks | 1 files |
| Phase 101 P03 | 5 min | 1 tasks | 1 files |
| Phase 101 P01 | 30 min | 2 tasks | 6 files |
| Phase 102 P01 | 92 min | 5 tasks | 2 files |
| Phase 103 P01 | 90 min | 7 tasks | 27 files |
| Phase 104 P01 | 90 min | 7 tasks | 11 files |
| Phase 105 P01 | 25 min | 6 tasks | 1 files |
| Phase 106 P01 | 45 min | 10 tasks | 13 files |
| Phase 107 P01 | 8 min | 4 tasks | 1 files |
| Phase 109 P01 | 8 min | 4 tasks | 2 files |
| Phase 108 P01 | 25 min | 5 tasks | 4 files |
| Phase 110 P01 | 5 min | 2 tasks | 1 files |
| Phase 110 P02 | 20 min | 1 tasks | 1 files |
| Phase 110 P03 | 3 min | 2 tasks | 0 files |
| Phase 112 P112-02 | 12 min | 2 tasks | 6 files |
| Phase 115 P01 | 26 min | 2 tasks | 6 files |
| Phase 115 P02 | 10 min | 1 tasks | 1 files |
| Phase 115 P02 | 15 min | 2 tasks | 1 files |
| Phase 117 P01 | 20 min | 2 tasks | 2 files |
| Phase 118 P02 | 4 min | 2 tasks | 4 files |
| Phase 118 P03 | 3 min | 3 tasks | 5 files |
| Phase 120 P01 | 16 min | 3 tasks | 7 files |
| Phase 121 P01 | 7 min | 4 tasks | 7 files |
| Phase 125 P125-01 | 15 | 2 tasks | 3 files |
| Phase 126 P126-01 | 3 min | 6 tasks | 1 files |

## Quick Tasks Completed

| Date | Slug | Description | Commit |
|------|------|-------------|--------|
| 2026-06-11 | ci-cleanup-add-dependabot | Remove rust-core-ci.yml (duplicate); add dependabot.yml + swift-build.yml | f629dd7 |
| 2026-06-13 | 260613-owu | Wrap HealthPreviewRouteHost in #if DEBUG to fix Release build CI on v10.0 tag | d6b7d1f |

## Session Continuity

Last session: 2026-06-28T01:29:54.167Z
Stopped at: Phase 118 context gathered
Resume file: .planning/phases/118-pip-realtime-queue/118-CONTEXT.md
Next action: /gsd-discuss-phase 112

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
