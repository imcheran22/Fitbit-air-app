# Phase 123 — Validation Artifact

**Date:** 2026-06-28
**Status:** Partial — proxy fixtures complete; real-device sessions hardware-gated

## Proxy Validation Coverage

### HRV Algorithm (VAL-HRV-04 — proxy)

| Session | Label | RR Count | Delta |
|---------|-------|----------|-------|
| 1 | fixture.hrv.session1 (baseline) | ≥20 | report.pass |
| 2 | low_hrv_high_stress | ≥30 | report.pass |
| 3 | high_hrv_well_recovered | ≥30 | report.pass |
| 4 | bradycardic_resting | ≥30 | report.pass |
| 5 | long_window_moderate | ≥30 | report.pass |
| 6 | young_age_bracket | ≥30 | report.pass |
| 7 | older_age_bracket | ≥30 | report.pass |

- **Comparison function:** `compare_hrv_goose_to_reference`
- **Fields compared:** mean_nn_ms, rmssd_ms, sdnn_ms, pnn50_fraction (4 fields)
- **Tolerance:** zero delta (report.pass = true)
- **Ectopic filter:** Lipponen-Tarvainen ±20% local median — fixtures designed to stay within filter boundary

### Sleep Staging Algorithm (VAL-SLP-04 — proxy)

| Session | Version | Label | Delta |
|---------|---------|-------|-------|
| 1 | v0 | baseline (existing) | report.pass |
| 2 | v0 | baseline v1 (existing) | report.pass |
| 3 | v0 | baseline v2 (existing) | report.pass |
| 4 | v0 | deep_heavy_low_disturbance | report.pass |
| 5 | v0 | short_session_fragmented | report.pass |
| 6 | v0 | long_session_low_efficiency | report.pass |
| 7 | v1 | rem_heavy | report.pass |

- **Comparison functions:** `compare_sleep_goose_to_reference` (v0), `compare_sleep_v1_goose_to_reference` (v1)
- **Fields compared:** 7 per report
- **fragmentation_index_per_hour denominator:** sleep_duration_minutes (not time_in_bed_minutes)
- **SleepV1:** sleep_permission_granted: true; wake_after_sleep_onset_minutes explicit (= TIB - sleep_duration)

## cargo test --locked Result

```
test result: ok. 19 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

## Hardware-Gated Items (SC-1, SC-2)

SC-1 and SC-2 from the ROADMAP require ≥7 **real** WHOOP 5 overnight sessions:
- **SC-1 (VAL-HRV-04 real):** RMSSD delta ≤1ms on ≥7 real sessions — **deferred: no device at execution time**
- **SC-2 (VAL-SLP-04 real):** 4-class staging concordance ≥70% on ≥7 real sessions — **deferred: no device at execution time**

These items will be closed when the WHOOP 5 device is available for overnight data collection.

## Incidental Fix

During Phase 123 execution, issue #188 (metrics never populate after historical sync) was diagnosed and fixed in `GooseAppModel+HealthCapture.swift`. Committed at `ddc881f`. The historical sync terminal path now runs the full pipeline (sleep need → inputs → scores) instead of only runPacketInputs().
