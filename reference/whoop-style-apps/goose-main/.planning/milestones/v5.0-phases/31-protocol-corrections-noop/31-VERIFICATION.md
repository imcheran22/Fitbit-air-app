---
status: passed
phase: 31
date: 2026-06-08
---

# Phase 31: Protocol Corrections (noop) — Verification

## Must-Haves

- [x] PROTO-01: Cole-Kripke scale corrected to 0.001 (was 1.0); wake threshold D >= 1.0 unchanged
- [x] PROTO-02: gravity2_x/y/z in V24History (f32 @ data[49,53,57]); gravity2_samples table (migration v19); insert_gravity2_batch + gravity2_samples_between bridge methods
- [x] PROTO-03: sleep staging graceful degradation when resp absent: no REM (3-class fallback); no hard error
- [x] cargo test green (128 passed, 0 failed)

## Requirements

- PROTO-01: ✅ Cole-Kripke exact weights [106,54,58,76,230,74,67] confirmed existing; scale=0.001 corrected
- PROTO-02: ✅ gravity2 triplet + table + bridge methods
- PROTO-03: ✅ resp-missing graceful degradation
