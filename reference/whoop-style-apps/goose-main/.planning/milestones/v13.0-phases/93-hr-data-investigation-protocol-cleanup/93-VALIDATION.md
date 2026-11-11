---
phase: 93
phase-slug: hr-data-investigation-protocol-cleanup
date: 2026-06-19
---

# Phase 93 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Rust: `cargo test` |
| Config file | `Rust/core/Cargo.toml` |
| Quick run | `cd Rust/core && cargo test --lib 2>&1 \| tail -10` |
| Full suite | `cargo test --locked --manifest-path Rust/core/Cargo.toml 2>&1 \| tail -20` |

## Sampling Rate

- **Per task commit:** `cd Rust/core && cargo check 2>&1 | grep -E '^error' | head -5`
- **Per wave:** `cd Rust/core && cargo test --locked 2>&1 | tail -20`
- **Phase gate:** `cargo test --locked` passes clean — zero test failures

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | Wave 0? |
|--------|----------|-----------|-------------------|---------|
| BUG-HR-01 | R22Whoop5Hr frames produce HR features | unit | `cargo test -- r22_heart_rate` | New test needed |
| PROTO-08 | PacketType enum round-trips all known byte values | unit | `cargo test -- packet_type_from_u8` | New test needed |
| PROTO-09 | Unknown packet_k produces warning string, not silent None | unit | `cargo test -- unknown_packet_k_warning` | New test needed |
| PROTO-10 | data_packet_domain values all have parse arms | compile-time | Verified by PROTO-09 Unknown catch-all | No gap |
| PROTO-11 | CommandDefinition registry in sync with dispatch | unit | `cargo test -- commands_definitions_serialises_without_error` | New test needed |
| All | Full regression | integration | `cargo test --locked --manifest-path Rust/core/Cargo.toml` | Existing |

## Wave 0 Requirements (New Tests)

Each plan executor must write the following new tests:

- **93-01:** `Rust/core/tests/` or `src/store/metrics.rs` inline — `heart_rate_plan_from_row` with `DataPacketBodySummary::R22Whoop5Hr` fixture produces a non-None `HeartRatePlan`
- **93-02:** `Rust/core/src/protocol.rs` or `tests/` — `PacketType::from(0u8)` through `PacketType::from(255u8)` round-trips correctly; `Unknown(x).0 as u8 == x`
- **93-03:** `Rust/core/src/protocol.rs` or `tests/` — unknown `packet_k` value produces `DataPacketBodySummary::Unknown { packet_k }` not None; `commands_definitions_serialises_without_error` asserts all `COMMAND_DEFINITIONS` serialise to JSON

## Validation Sign-Off

```
[ ] cargo test --locked passes clean (0 failures)
[ ] BUG-HR-01: r22_heart_rate test passes
[ ] PROTO-08: packet_type_from_u8 round-trip test passes
[ ] PROTO-09: unknown_packet_k_warning test passes
[ ] PROTO-10: No remaining gap (covered by Unknown catch-all — compile-time)
[ ] PROTO-11: commands_definitions_serialises_without_error test passes
[ ] grep -c "PACKET_TYPE_" Rust/core/src/protocol.rs returns 0
```
