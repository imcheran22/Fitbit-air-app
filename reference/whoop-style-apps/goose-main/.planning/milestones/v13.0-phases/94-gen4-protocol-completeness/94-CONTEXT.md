# Phase 94: Gen4 Protocol Completeness - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Rust-only fixes for WHOOP 4.0 (Gen4) protocol gaps:
1. **GEN4-06**: Parse `respiratory_rate_rpm` and `skin_temp_delta_c` from Gen4 data packet byte offsets — populate `MetricFeatures` fields that are currently `None` for Gen4 users.
2. **SYNC-07**: Fix packet47 page_sequence reassembly bug — Gen4 historical sync on service UUID `61080005` drops body rows; they must reach SQLite.

No Swift changes. All work in `Rust/core/src/`.

</domain>

<decisions>
## Implementation Decisions

### Gen4 Metric Display (GEN4-06)
- **D-01:** Display `respiratory_rate_rpm` and `skin_temp_delta_c` as-is in the Recovery dashboard — no caveat, no "WHOOP 4.0" source label, no feature flag. Same UI path as WHOOP 5.0 metrics.
- **D-02:** If byte offsets cannot be confirmed from code alone, researcher documents the most likely offsets from existing protocol.rs comments (skin_temp at offset 65 is already documented; researcher locates respiratory_rate offset). Executor reads from those offsets and converts with the documented formula.
- **D-03:** Existing NTC linearisation formula already in protocol.rs comments (line 928): `degC = (raw − 930) / 30 + 33`. Use this for skin_temp conversion.

### packet47 Reassembly Error Handling (SYNC-07)
- **D-04:** When page_sequence reassembly drops pages: **log a warning and continue with partial data**. Do not retry the BLE historical sync request. Do not discard the whole frame.
- **D-05:** Log format: record which `page_sequence` values were expected vs received; log at warning level via the existing Rust logging pattern.
- **D-06:** Persist whatever was successfully reassembled — partial packet47 body rows are better than no rows.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Gen4 Protocol
- `Rust/core/src/protocol.rs` — line 928 NTC skin_temp formula comment; Gen4 frame header layout (lines 419–443); `skin_temp_raw: Option<u16>` at line 290; `DeviceType::Gen4` variants
- `Rust/core/src/store/metrics.rs` — `respiratory_rate_rpm` and `skin_temperature_delta_c` SQLite upsert (lines 519–671); `MetricFeatures` struct fields

### Historical Sync / packet47
- `Rust/core/src/` — look for `page_sequence`, `packet47`, `61080005`, `historical_sync` — researcher locates the reassembly code
- GitHub issue #20 — Gen4 historical dropped (upstream reference)

### Requirements
- `.planning/REQUIREMENTS.md` §GEN4-06, SYNC-07
- `.planning/ROADMAP.md` §Phase 94

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `read_u16_le(data, offset)` — helper already used at line 1004 for skin_temp_raw; same pattern for respiratory_rate offset
- `skin_temp_raw` → `skin_temp_delta_c` conversion at line 928: `degC = (raw − 930) / 30 + 33` — already documented
- `respiratory_rate_rpm` field exists in `MetricFeatures` and `daily_recovery_metrics` SQLite table — just needs population from Gen4 parse path

### Established Patterns
- Rust `tracing::warn!()` or equivalent for the SYNC-07 warning log — consistent with existing logging pattern in the codebase
- `cargo test` with Bash timeout ≥180,000ms for cold compilation

### Integration Points
- Gen4 metric parse path is separate from Gen5; researcher must find where Gen4 data packets populate `MetricFeatures` and add the two missing fields
- packet47 reassembly touches the Gen4 historical sync path (service UUID `61080005`), not the Gen5 path

</code_context>

<specifics>
## Specific Ideas

- `skin_temp_raw` is already parsed at offset 65 in protocol.rs (line 1004). Researcher should check whether `respiratory_rate` is in the same data packet at a nearby offset.
- The `MetricFeatures` struct already has `respiratory_rate_rpm: Option<f32>` and `skin_temperature_delta_c: Option<f32>` — they just need to be populated from Gen4 data instead of remaining `None`.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 94-Gen4 Protocol Completeness*
*Context gathered: 2026-06-19*
