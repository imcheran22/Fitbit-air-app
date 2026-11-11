---
name: whoop5-v18-historical-decode
description: WHOOP 5.0 v18 per-second historical packet decode + stale-clock dedup — the main completeness gap in historical offload for WHOOP 5.0 users
metadata:
  type: seed
  trigger_condition: when planning v10.0 milestone scope
  planted_date: 2026-06-11
---

## Idea

Decode the WHOOP 5.0 v18 historical body format properly and add stale-clock deduplication — the two concrete gaps that prevent full biometric offload completeness for WHOOP 5.0 users.

## The gap

`Rust/core/src/protocol.rs:566-579` groups versions `7 | 9 | 12 | 18` into a single `NormalHistory` arm that only extracts an HR-present marker. For WHOOP 4.0 (v7/v9/v12) this is fine — those are parsed elsewhere. But **v18 is WHOOP 5.0's rich per-second biometric block**, and it's currently silently discarded.

Confirmed via cross-reference with `NoopApp/noop` — `Packages/WhoopProtocol/Sources/WhoopProtocol/Interpreter.swift` decodes v18 with explicit field offsets.

## v18 field layout (WHOOP 5.0 — NOT the V24+4 shift)

All offsets absolute from payload start:

| Offset | Type | Field | Notes |
|---|---|---|---|
| 15 | u32 LE | unix timestamp | epoch seconds |
| 22 | u8 | hr | BPM |
| 23 | u8 | rr_count | number of R-R intervals following |
| 24 + i×2 | u16 LE × rr_count | rr[i] | milliseconds |
| 41 | f32 LE | dynamic_acceleration | gate: 0.0..8.0 g |
| 45 | f32 LE | gravity_x | |
| 49 | f32 LE | gravity_y | |
| 53 | f32 LE | gravity_z | |
| 57 | u16 LE | step_motion_counter | cumulative steps |
| 63 | u8 | motion_wear_quality | gate: 0..2 |
| 73 | u16 LE | skin_temp_raw | conversion: `degC = raw / 128.0` (AS6221 sensor), gate: 5..45°C |

**Skin temperature conversion is the only client-side transform.** All other fields are direct values.

Feed into existing tables: `skin_temp_samples`, `resp_samples`, `step_counter_samples`, `gravity2_samples`, `rr_interval_samples`.

## v26 PPG (low priority — skip for now)

v26 contains 24×i16 PPG waveform samples at offset 27, stride 2. NOOP itself skips this — not biometric data, just the raw optical waveform. Leave as `NormalHistory` marker unless a specific use case emerges.

## Stale-clock dedup (finding 1.2)

When `|wallClockRef - deviceClockRef| > 86400s` (strap RTC lost), the epoch→wall-clock offset conversion produces wildly wrong timestamps that create duplicate rows on re-sync.

Fix: in the historical timestamp converter, snap timestamps to a 300s grid when the offset exceeds 86400s. Also: EVENT (type-48) timestamps are native RTC unix seconds — they must **bypass** the device-epoch→wall-clock offset entirely.

Location: `Rust/core/src/historical_sync.rs` (timestamp converter).
~20 lines. Prevents time-series corruption on resets/battery replacements.

## Implementation plan

1. In `protocol.rs`: split `18` out of the `7 | 9 | 12 | 18` arm → `parse_v18_body(payload)` returning typed fields
2. Feed parsed v18 fields into existing store inserts (`insert_skin_temp_sample`, `insert_rr_interval`, etc.)
3. In `historical_sync.rs`: add 86400s threshold check → 300s grid snap; add type-48 timestamp bypass
4. Add fixture with a real v18 frame from BTSnoop (or synthesised) to `tests/protocol_tests.rs`

## Files to modify

- `Rust/core/src/protocol.rs` — `parse_v18_body()` function, arm split
- `Rust/core/src/historical_sync.rs` — timestamp converter (stale-clock + event bypass) — **but also check `store.rs` and `step_counter.rs`**: the epoch→wall-clock conversion spans at least three files; confirm all sites before implementing to avoid partial fixes
- `Rust/core/tests/protocol_tests.rs` — v18 fixture test

## Open questions

- Confirm v18 frame arrives on WHOOP 5.0 historical offload (should be handle `0x0022` or via puffin channel during `HISTORY_STREAM_START`). Verify with BTSnoop during next historical sync.
- Check whether `rr_count` is bounded (likely ≤4 per second) — add guard.

## Related seeds

- `smart-alarm-strap-haptic.md` — WHOOP 5.0 protocol work; shares puffin frame context
- `noop-feature-import.md` — NOOP source reference for field offsets
