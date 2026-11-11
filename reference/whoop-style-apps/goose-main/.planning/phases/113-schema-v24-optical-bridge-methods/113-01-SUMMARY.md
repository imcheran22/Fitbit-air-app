# Phase 113 — Plan 01 Summary

**Phase:** 113 — schema-v24-optical-bridge-methods
**Status:** Complete
**Date:** 2026-06-22

## What was built

Schema v24 migration plus the bridge surface for optical PPG channel storage
and capability feature flags.

- **Store (schema v24):** `CURRENT_SCHEMA_VERSION` 23 → 24. Four new tables for
  v20/v21 multi-channel optical samples, v26 waveform samples, and capability
  feature flags. New row types (`OpticalSampleRow`, `FeatureFlagRow`) and store
  methods: `insert_optical_samples`, `query_optical_between`,
  `upsert_feature_flags`, `get_feature_flags`.
- **Bridge methods:** `biometrics.insert_v20v21_batch`,
  `biometrics.insert_v26_batch`, `biometrics.optical_between`,
  `capabilities.get_feature_flags`, `capabilities.upsert_feature_flags`.
- **Tests:** round-trip integration tests for the optical channel and feature
  flag bridge methods.

## Verification

- Full `cargo test --locked` suite green (0 failed across all binaries).
- New round-trip tests pass.

## Commits

- `5068ffe` feat(store): schema v24 optical channel storage and capability feature flags
- `c83bdba` test(bridge): round-trip tests for optical channel and feature flag methods

## Incidental fixes (committed separately)

While running the verification gate, two unrelated pre-existing issues were
found and fixed so the gate could pass cleanly:

- `0d87d9c` fix(store): non-reentrant mutex deadlock in raw evidence compaction
  (a held connection lock re-acquired via a self-call).
- `1dbff73` fix(bridge): complete openwhoop snapshot fields; validate external
  sleep stages (out-of-parent-range and malformed summaries now rejected
  atomically).
