---
phase: 113
slug: schema-v24-optical-bridge-methods
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-22
---

# Phase 113 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust built-in test runner (cargo test) |
| **Config file** | `Rust/core/Cargo.toml` (no `[[test]]` entries — auto-discovery) |
| **Quick run command** | `cd Rust/core && cargo test --locked optical` |
| **Full suite command** | `cd Rust/core && cargo test --locked` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** `cd Rust/core && cargo test --locked 2>&1 | tail -5`
- **After wave completion:** `cd Rust/core && cargo test --locked`
- **Phase gate:** Full suite green before verification

---

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPT-03 | `biometrics.insert_v20v21_batch` inserts rows into `optical_channel_samples` | integration | `cargo test --locked --test optical_channel_bridge_tests` | No — Wave 0 |
| OPT-03 | `biometrics.insert_v26_batch` inserts rows as channel_index=0 | integration | `cargo test --locked --test optical_channel_bridge_tests` | No — Wave 0 |
| OPT-03 | `biometrics.optical_between` returns rows in ts range | integration | `cargo test --locked --test optical_channel_bridge_tests` | No — Wave 0 |
| FF-03 | `capabilities.upsert_feature_flags` inserts and replaces rows | integration | `cargo test --locked --test feature_flags_bridge_tests` | No — Wave 0 |
| FF-03 | `capabilities.get_feature_flags` returns rows for device_id | integration | `cargo test --locked --test feature_flags_bridge_tests` | No — Wave 0 |
| BODY-01 | `body_composition_history` table exists after schema v24 migration | integration | `cargo test --locked --test store_schema_version_tests` | Yes (after bump) |
| PIP-02 | `realtime_frames` table exists after schema v24 migration | integration | `cargo test --locked --test store_schema_version_tests` | Yes (after bump) |
| All | `BRIDGE_METHODS` sorted, unique, matches dispatcher | compile-time | `cargo test --locked bridge_methods_constant_matches_dispatcher` | Yes |

---

## Wave 0 Gaps (must be created during execution)

- [ ] `Rust/core/tests/optical_channel_bridge_tests.rs` — covers OPT-03 round-trip (insert_v20v21_batch, insert_v26_batch, optical_between)
- [ ] `Rust/core/tests/feature_flags_bridge_tests.rs` — covers FF-03 round-trip (upsert_feature_flags, get_feature_flags)

*`store_schema_version_tests.rs` already uses `CURRENT_SCHEMA_VERSION` constant dynamically — will validate BODY-01 and PIP-02 tables automatically once the migration block is appended and the constant is bumped to 24.*

---

## Security Domain

Local SQLite, no network exposure. Bridge called only from Swift FFI on-device.

| ASVS Category | Applies | Control |
|---------------|---------|---------|
| V5 Input Validation | yes | `serde_json::from_str` + typed Rust structs; samples stored as opaque TEXT |
| V6 Cryptography | no | No encryption at rest in this layer |
| V2 Authentication | no | Local FFI — no auth boundary |
| V4 Access Control | no | Single-user device app |
