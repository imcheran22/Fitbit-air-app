---
status: passed
phase: 35
date: 2026-06-08
---

# Phase 35: Cross-Project Review — Verification

## Review Agents Run

1. REVIEW-02 (Algorithmic divergences vs my-whoop) — complete
2. REVIEW-03 (Schema & API surface) — complete
3. REVIEW-01 (Functional gaps vs noop) — included in REVIEW_NOOP_GAPS.md

## Critical Fixes Applied

- MOTION_THRESHOLD 0.01→0.20 g (20x error; exercise detection had massive false positives)
- MIN_BEATS 2→20 for RMSSD (physiologically unreliable below 20 RR intervals)

Both fixed and committed. 128 tests green after fixes.

## Output Files

- REVIEW_MYWHOOP_DIVERGENCES.md — algorithm comparison with tolerance classification
- REVIEW_SCHEMA.md — SQLite vs TimescaleDB schema comparison
- REVIEW_NOOP_GAPS.md — functional gaps prioritised for v6.0

## v6.0 Candidate List (from reviews)

HIGH PRIORITY:
- Recovery score formula alignment with my-whoop (z-score + logistic vs linear weighted)
- EWMA Winsorisation and half-life correction (14-night from 0.10 alpha)
- MERGE_GAP_S 60→150 s to match my-whoop
- Sleep epoch resolution 1min→30s

MEDIUM PRIORITY:
- Apple Health bidirectional sync
- Journal/notes feature
- Sport classification for exercise sessions
- metricSeries EAV table (my-whoop TimescaleDB pattern)
