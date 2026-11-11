# Research — Phase 112: Optical Protocol Decode (v20/v21/v26)

**Source:** Milestone research (SUMMARY.md + ARCHITECTURE.md + FEATURES.md)
**Date:** 2026-06-22

## Summary

Pure Rust protocol.rs changes. Hardware-verified byte layouts. No new dependencies, no schema changes, no Swift changes.

## v26 Layout (88B) — confirmed

| Bytes | Field |
|-------|-------|
| 8/9 | type 47 / version 26 |
| 10, 13, 14 | 0x80 / 0x84 / 0x01 constants |
| 11 | per-record counter (+1/s) |
| 12 | ppg_channel u8 (1–26) |
| 15–18 | unix u32 LE |
| 19–22 | 0x000147AE constant |
| 27–74 | 24× LE-i16 PPG waveform |
| 84–87 | CRC32 |

## v20 Layout (2140B) — confirmed

Five channel blocks. Presence byte 0x19=active, 0x00=empty.
Presence bytes at offsets: 0x1a, 0x1c0, 0x366, 0x50c, 0x6b2.
Each block: 10 channel slots (two 50-sample i32 channels each).

## v21 Layout (1244B) — confirmed

Descriptor (100, 100, 3) near @22.
Three 100-sample i16 channels at @28 / @228 / @428.

## Implementation pattern

Follow `parse_v18_body()` and `parse_v24_body()` in protocol.rs exactly:
- New parse functions in protocol.rs
- New variants on DataPacketBodySummary enum
- Match arms in `parse_data_packet_body_summary()`
- Update `data_packet_domain()` for packet_k 20/21/26
- Synthetic fixtures in protocol_tests.rs
- cargo test --locked must pass

## Risk

Medium: presence-byte interpretation for v20 channel blocks needs careful testing with synthetic fixtures. Low for v26 (fixed layout, no conditionals).
