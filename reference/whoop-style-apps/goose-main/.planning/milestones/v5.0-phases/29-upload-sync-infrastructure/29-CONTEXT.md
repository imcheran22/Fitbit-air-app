# Phase 29: Upload Sync Infrastructure - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Add per-row `synced` flag to all 8 stream tables (creating the 4 missing ones: hr_samples, rr_intervals, events, battery) and add synced to existing ones (spo2_samples, skin_temp_samples, resp_samples, gravity). Implement a two-namespace cursor table (upload tracking vs pull tracking). Add prune invariant (only delete synced=1 rows). Expose 3 bridge methods for Swift upload machinery. Schema migration v18.

Note: The existing upload pipeline (upload.get_recent_decoded_streams) extracts streams on-the-fly from decoded_frames. Phase 29 adds parallel dedicated stream tables that the upload pipeline will populate via sync.backfill_streams — the BLE pipeline is NOT changed in this phase.

</domain>

<decisions>
## Implementation Decisions

### Schema Design
- Migration v18 (current = v17 from Phase 28)
- Create 4 NEW stream tables with synced column:
  - hr_samples (device_id TEXT, ts REAL, bpm INTEGER, synced INTEGER NOT NULL DEFAULT 0, UNIQUE(device_id, ts))
  - rr_intervals (device_id TEXT, ts REAL, interval_ms INTEGER, synced INTEGER NOT NULL DEFAULT 0, UNIQUE(device_id, ts))
  - events (device_id TEXT, ts REAL, event_id INTEGER, event_name TEXT, synced INTEGER NOT NULL DEFAULT 0, UNIQUE(device_id, ts))
  - battery (device_id TEXT, ts REAL, level_pct INTEGER, synced INTEGER NOT NULL DEFAULT 0, UNIQUE(device_id, ts))
- Add `synced INTEGER NOT NULL DEFAULT 0` column (ALTER TABLE) to 4 EXISTING tables:
  - spo2_samples, skin_temp_samples, resp_samples, gravity
  - Existing rows receive DEFAULT 0 automatically via ALTER TABLE ADD COLUMN
- cursor table: upload_cursors (namespace TEXT NOT NULL, stream TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (namespace, stream))
  - Two namespaces: "highwater" (upload tracking, WHERE synced=0) and "read" (server-pull tracking, ts > highwater)

### Prune Invariant
- Modify compact_raw_evidence / prune logic to add guard WHERE synced = 1 for stream tables
- Unsynced rows (synced=0) are NEVER pruned regardless of age — invariant enforced in store

### Bridge API
- sync.mark_synced(stream, row_ids): Vec<i64> → marks specific rows as synced=1
- sync.rows_pending_upload(stream, limit): returns rows WHERE synced=0 ORDER BY ts LIMIT limit
- sync.backfill_streams(device_id, start_ts, end_ts): extracts from decoded_frames into the new stream tables (population bridge)

### Claude's Discretion
- Exact column ordering in new tables
- Index strategy (all tables get index on device_id, ts)
- Whether backfill_streams uses one transaction or batches

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `spo2_samples`, `skin_temp_samples`, `resp_samples` tables (Phase 27) — just need synced column
- `gravity` table (Phase 21) — just needs synced column
- `upload_get_recent_decoded_streams_bridge` in bridge.rs — source for backfill_streams logic
- `immediate_transaction` in store.rs — for atomic operations
- `compact_raw_evidence` in bridge.rs — needs synced guard added
- Phase 27 pattern for INSERT OR IGNORE + UNIQUE(device_id, ts)

### Established Patterns
- ALTER TABLE ... ADD COLUMN for adding synced to existing tables (safe, idempotent via IF NOT EXISTS workaround)
- Bridge dispatch pattern from Phase 27/28
- storage_check.rs required_columns — needs updating for new tables

### Integration Points
- store.rs:943 migration block — add v18 ALTER TABLE statements and new table DDL
- bridge.rs:2178 handle_bridge_request — add sync.* dispatch arms
- storage_check.rs required_columns — add hr_samples, rr_intervals, events, battery; update existing 4

</code_context>

<specifics>
## Specific Ideas

- ALTER TABLE syntax: `ALTER TABLE spo2_samples ADD COLUMN synced INTEGER NOT NULL DEFAULT 0` — SQLite supports this safely; existing rows get DEFAULT 0
- SQLite doesn't support `ALTER TABLE ADD COLUMN IF NOT EXISTS` — wrap in try_execute or use `PRAGMA table_info` check pattern
- For upload cursors: cursor reads use `SELECT value FROM upload_cursors WHERE namespace=? AND stream=?`; cursor writes use `INSERT OR REPLACE INTO upload_cursors`
- rows_pending_upload per stream: `SELECT * FROM hr_samples WHERE synced=0 ORDER BY ts LIMIT ?`
- mark_synced: `UPDATE hr_samples SET synced=1 WHERE rowid IN (...)`

</specifics>

<deferred>
## Deferred Ideas

- Bidirectional sync (server → device) — not in scope
- Conflict resolution — out of scope
- Change BLE pipeline to write directly to stream tables — deferred; backfill bridge is the interim approach

</deferred>
