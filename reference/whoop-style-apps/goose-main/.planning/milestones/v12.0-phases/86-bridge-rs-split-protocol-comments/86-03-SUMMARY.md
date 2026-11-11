---
phase: "86"
plan: "03"
subsystem: bridge
tags: [rust, bridge, refactor, debug-domain, activity-domain]
completed: "2026-06-15"
duration_minutes: 45
---

# Phase 86 Plan 03: Fill activity.rs + debug.rs Domain Handlers Summary

Filled the two remaining stub domain dispatchers introduced in the Phase 86 bridge split.

## What Was Done

**activity.rs** (804 lines, previously uncommitted from a prior agent session):
- Staged and committed the full activity domain dispatch covering: `workout.upsert`, `apple_daily.upsert`, `metric_series.*`, `activity.*`, `journal.upsert`, `timeline.from_decoded_frames`

**debug.rs** (replaced 9-line stub with full implementation):
- `export.*` — `export.raw_timeframe`, `export.validate_bundle`
- `validation.*` / `local_health.*` — manifest scaffold, runbook, review (aliased arms)
- `privacy.*` — `privacy.lint`
- `ui_coverage.*` — `ui_coverage.audit`
- `workout.*` — `workout.upsert` (routed here per namespace; also in activity domain for legacy compat)
- `commands.*` — 10 arms: evidence_template, definitions, validate_evidence, evidence_from_emulator_log, promote_local_frame_matches, direct_send_gate, direct_send_preflight, capture_plan, list_validation_records, import_validation_records
- `debug.*` — 5 arms: start_session, start_command, finish_command, record_event, session_snapshot
- `device.*` — `device.capabilities`
- `store.*` — 6 arms: ewma_baseline_fold_history, ewma_baseline_update, gravity_rows_between, gravity2_samples_between, insert_gravity_rows, insert_gravity2_batch
- `settings.*` — 4 arms: apply_default_algorithm_preferences, set/get/list_algorithm_preference
- `storage.*` — `storage.check`, `storage.compact_raw_evidence`
- `upload.*` — `upload.get_recent_decoded_streams`, `upload.get_raw_frames_for_upload`

## Files Changed

- `Rust/core/src/bridge/activity.rs` — committed 804 lines (from prior agent)
- `Rust/core/src/bridge/debug.rs` — replaced 9-line stub with ~820-line implementation
- `Rust/core/src/bridge/mod.rs` — formatting only (cargo fmt)

## Import Fixes Required

The original bridge.rs used private module-level helpers. For debug.rs:
- `debug_session` → `debug_ws` (actual module name)
- `privacy` → `privacy_lint`
- `storage` → `storage_check`
- `settings::AlgorithmPreferenceRecord` → `store::AlgorithmPreferenceRecord`
- `commands::CommandValidationRecord` → `store::CommandValidationRecord`
- `protocol::DeviceCapabilities/DeviceKind` → `capabilities::DeviceCapabilities/DeviceKind`
- `upload::*` helpers → inlined private helpers (iso8601_to_unix, chrono_from_unix, chrono_now, days_to_ymd, ymd_to_days)
- `ui_coverage::default_ui_coverage_map_path` (private) → inlined local fn

## Test Results

```
test result: ok. 151 passed; 0 failed; 0 ignored; 0 measured
```

## Commit

`aa7e066` — feat(86): fill activity.rs + debug.rs domain handlers

## Self-Check: PASSED

- `Rust/core/src/bridge/debug.rs` exists and is non-stub
- `Rust/core/src/bridge/activity.rs` exists and committed
- Commit `aa7e066` confirmed in git log
- 151 lib tests pass, 0 failures
