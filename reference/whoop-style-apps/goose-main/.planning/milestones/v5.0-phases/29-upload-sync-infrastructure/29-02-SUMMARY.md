---
phase: 29-upload-sync-infrastructure
plan: "02"
subsystem: rust-core
tags: [sync, upload, bridge, store, stream-tables, sql-injection-prevention]
dependency_graph:
  requires: [29-01]
  provides: [sync.mark_synced, sync.rows_pending_upload, sync.backfill_streams bridge RPCs]
  affects: [Rust/core/src/bridge.rs, Rust/core/src/store.rs]
tech_stack:
  added: []
  patterns: [allowlist-guarded SQL table interpolation, internally-tagged serde for ParsedPayload]
key_files:
  created: []
  modified:
    - Rust/core/src/bridge.rs
    - Rust/core/src/store.rs
decisions:
  - "serde_json::to_value(BackfillReport) not used — GooseError has no From<serde_json::Error>; used json!{} macro instead (infallible for plain struct)"
  - "ParsedPayload uses #[serde(tag = 'kind', rename_all = 'snake_case')] — internally tagged, not externally tagged; test fixture corrected from {'DataPacket':{...}} to {'kind':'data_packet',...}"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-08"
  tasks_completed: 2
  files_modified: 2
---

# Phase 29 Plan 02: Sync Bridge Methods + Prune Invariant + Tests Summary

**One-liner:** Three bridge RPCs (sync.mark_synced, sync.rows_pending_upload, sync.backfill_streams) with allowlist-guarded SQL interpolation, 9 passing tests, and a prune invariant ensuring synced=0 rows are never deleted.

## What Was Built

### Task 1: Store sync methods (already implemented in Plan 01)

The store methods `mark_synced_rows`, `rows_pending_upload`, `backfill_streams_from_decoded_frames`, and `prune_synced_stream_rows` were already present in `store.rs` from Plan 01. The 7-test `sync_methods_tests` module was also already present. However, two backfill tests were failing due to incorrect `ParsedPayload` JSON format (see Deviations).

### Task 2: Bridge dispatch — sync.mark_synced, sync.rows_pending_upload, sync.backfill_streams

Added to `bridge.rs`:
- `BackfillReport` added to store imports
- 3 entries in `BRIDGE_METHODS` sorted slice: `"sync.backfill_streams"`, `"sync.mark_synced"`, `"sync.rows_pending_upload"` (inserted between `store.insert_gravity_rows` and `timeline.from_decoded_frames`)
- 3 `#[derive(Debug, Deserialize)]` Args structs: `SyncMarkSyncedArgs`, `SyncRowsPendingUploadArgs`, `SyncBackfillStreamsArgs`
- 3 handler functions: `sync_mark_synced_bridge`, `sync_rows_pending_upload_bridge`, `sync_backfill_streams_bridge`
- 3 dispatch arms in `handle_bridge_request_inner` match block

## Test Results

```
test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 102 filtered out
test result: ok. 111 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

All `sync_methods_tests` pass. Full library suite green with no regressions.
`bridge_methods_constant_matches_dispatcher` and `bridge_methods_constant_is_sorted_and_unique` both pass.

## Security (T-29-03 Mitigation)

Stream name interpolation into SQL table names is guarded by `STREAM_ALLOWLIST` in `store.rs`. Both `mark_synced_rows` and `rows_pending_upload` reject unknown stream names with `Err(GooseError::message("unknown stream: {stream}"))` before any SQL is executed. The allowlist is a compile-time `const` slice: `["battery", "events", "gravity", "hr_samples", "resp_samples", "rr_intervals", "skin_temp_samples", "spo2_samples"]`.

## Prune Invariant

`prune_synced_stream_rows` executes `DELETE FROM {stream} WHERE synced=1 AND ts < ?1` — unsynced rows (synced=0) are structurally protected. `compact_raw_evidence_payloads_to_limit` does NOT touch stream tables; the invariant is documented via comment in `prune_synced_stream_rows`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ParsedPayload JSON format in test fixture**
- **Found during:** Task 1 test run — `test_sync_backfill_creates_hr_rows` and `test_sync_backfill_is_idempotent` failed
- **Issue:** The `insert_test_hr_frame` test helper constructed `parsed_payload_json` as `{"DataPacket":{...}}` (external tag format). However `ParsedPayload` uses `#[serde(tag = "kind", rename_all = "snake_case")]` (internal tag format), so `DataPacket` serialises as `{"kind":"data_packet", ...fields flat...}`.
- **Fix:** Changed the format string to `{"kind":"data_packet","packet_k":40,...}` (internally tagged)
- **Files modified:** `Rust/core/src/store.rs` (test helper `insert_test_hr_frame`)
- **Commit:** 0d325c4 (same commit as the bridge additions)

## Commits

| Hash | Description |
|------|-------------|
| 0d325c4 | feat(29-02): sync bridge methods + prune invariant + tests |

## Known Stubs

None — all three bridge methods delegate directly to fully-implemented store methods.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries beyond those declared in the plan's threat model.

## Self-Check: PASSED

- `Rust/core/src/bridge.rs` modified: verified (2 files changed, 499 insertions)
- `Rust/core/src/store.rs` modified: verified (bug fix in test helper)
- Commit 0d325c4 exists: verified via `git log --oneline -3`
- `sync.mark_synced` in BRIDGE_METHODS: verified (line 312)
- `sync.rows_pending_upload` in BRIDGE_METHODS: verified (line 313)
- `sync.backfill_streams` in BRIDGE_METHODS: verified (line 311)
- All 111 lib tests pass: verified
