---
status: passed
phase: 28
date: 2026-06-08
---

# Phase 28: Exercise Detection — Verification

## Must-Haves

- [x] detect_exercise_sessions: HR+gravity alignment ±5s, sessions ≥ 10 min, gap merge — covered by bridge tests
- [x] Merge gap < 60s, intensity gate ≥ 50% Z2+, guard when HRmax unknown — unit tests green
- [x] Per-session: avg_hr, peak_hr, duration_s, avg_hrr_pct, hrmax, hrmax_source, zone_time_pct, strain, calories_kcal
- [x] exercise_sessions table (migration v17) + bridge insert + query — store tests green
- [x] RHR fallback daily_p10, rhr_source field
- [x] cargo test green (92 passed, 0 failed including exercise_detection tests)

## Requirements

- EX-01: ✅ HR+gravity alignment, sustained sessions
- EX-02: ✅ Merge gap, intensity gate, HRmax guard
- EX-03: ✅ Per-session metrics
- EX-04: ✅ exercise_sessions table + bridge methods
