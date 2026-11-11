# Phase 102: Gen4 Undecoded Metrics - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire Gen4 V24 historical packet bytes into `respiratory_rate_rpm`, `skin_temperature_delta_c`, and Gen4-specific HRV path in the recovery metrics pipeline. Promote metrics that have confirmed scales. Close issue #21 with a detailed status comment.

**In scope:** `respiratory_rate`, `skin_temp_delta_c` from V24 (packet_k=24) frames; Gen4 RR intervals → separate HRV computation path; issue #21 close.
**Out of scope:** SpO2 (calibration curve required, fundamentally blocked); Gen5 pipeline changes; new SQLite schema columns (already exist).

</domain>

<decisions>
## Implementation Decisions

### Skin Temperature
- **D-01:** Promote `skin_temperature_delta_c` using protocol-verified formula: `delta_c = (raw_u16 − 930) / 30.0`. This converts the NTC raw value to a delta from 33°C baseline (i.e., `degC = delta_c + 33.0`). Anchor: raw=930 → 33°C (verified against hardware captures).
- **D-02:** The prior implausible spread concern (24–45°C) in issue #21 was noted without the formula applied. With the formula, values should narrow. Promote unconditionally — the formula is hardware-verified.

### RR Intervals → HRV
- **D-03:** Keep a **separate Gen4 HRV computation path** — do not reuse the Gen5 pipeline directly. Gen4 V24 frames deliver RR intervals (ms) at body offsets 16–23 (4× u16 LE, zero-padded). Wire these into a Gen4-specific RMSSD path to avoid format divergence risk.

### Issue #21
- **D-04:** **Close issue #21** this phase. Post a detailed comment covering: what decodes (HRV from RR intervals, respiratory rate, skin temp with confirmed formula), and what stays permanently blocked (SpO2 — requires factory calibration curve, not implementable without reference device). Mark resolved.

### Claude's Discretion
- Whether to share the `rr_intervals_ms` extraction code between V24 parsers (parse_v24_body_summary and the V18-style parser at line ~1052) or keep them separate — follow existing code structure.
- respiratory_rate field wiring: if it already flows from V24 bytes to MetricFeatures in existing code, skip re-implementing; verify and document.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol analysis (skin temp formula, byte offsets)
- Byte offsets confirmed via hardware capture analysis: skin_temp_raw at V24 body offset 65 (u16 LE), rr_intervals_ms at offsets 16–23 (4× u16 LE), rr_count at offset ~14. Formula: `delta_c = (raw_u16 − 930) / 30.0`.

### Protocol parsing
- `Rust/core/src/protocol.rs` lines ~939–1043 — `parse_v24_body_summary` (packet_k=24); `DataPacketBodySummary` struct with `rr_intervals_ms: Vec<u16>` and `skin_temp_raw: Option<u16>`

### Store layer
- `Rust/core/src/store/metrics.rs` lines ~519–800 — `respiratory_rate_rpm` and `skin_temperature_delta_c` columns already in `daily_recovery_metrics`; existing upsert logic

### HRV computation reference
- `Rust/core/src/bridge/capture.rs` lines ~327, ~825 — existing `hr_samples` and `rr_intervals` pipeline; `min_rr_intervals_to_compute: 2` gate

### Issue to close
- GitHub issue #21 — [Gen4] Undecoded recovery metrics on WHOOP 4.0

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `parse_v24_body_summary` already extracts `rr_intervals_ms` and `skin_temp_raw` — just not connected to MetricFeatures
- `daily_recovery_metrics.skin_temperature_delta_c` column exists — no schema migration needed
- `daily_recovery_metrics.respiratory_rate_rpm` column exists — same

### Established Patterns
- Bridge method dispatch: follow 5-location pattern (BRIDGE_METHODS, struct, dispatcher arm, bridge fn, SUMMARY output)
- MetricFeatures population: trace from `DataPacketBodySummary` → MetricFeatures → store upsert; same path as Gen5

### Integration Points
- V24 parse output (`DataPacketBodySummary.skin_temp_raw`) → apply formula → `MetricFeatures.skin_temperature_delta_c`
- V24 parse output (`DataPacketBodySummary.rr_intervals_ms`) → Gen4 RMSSD fn → `MetricFeatures.hrv_rmssd_ms`
- Verify `respiratory_rate_rpm` already flows; if not, find the respiratory_raw field and apply scale

</code_context>

<specifics>
## Specific Ideas

- Skin temp formula (hardware-verified): `delta_c = (raw_u16 as f64 − 930.0) / 30.0` — store directly as `skin_temperature_delta_c`
- RR intervals in V24: offsets 16–23, 4× u16 LE, zero-padded if rr_count < 4 (rr_count at offset ~14)
- Issue #21 close comment: use neutral language only — "protocol observation", "hardware testing", "BLE capture analysis"

</specifics>

<deferred>
## Deferred Ideas

- SpO2 decode — permanently blocked without factory calibration curve; no implementation possible without reference device
- Skin temp absolute value display (show °C on UI) — out of scope for this phase; only store the delta

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 102-gen4-undecoded-metrics*
*Context gathered: 2026-06-21*
