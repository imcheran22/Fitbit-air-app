# Phase 86 — Nyquist Validation

**Phase:** 86 — bridge-rs-split-protocol-comments
**Date:** 2026-06-18
**Validator:** gsd-validate-phase (adversarial)
**Overall Status:** FILLED (2/2 gaps resolved, 0 escalated)

---

## Requirements Under Test

| ID | Requirement |
|----|-------------|
| ARCH-01 | `bridge.rs` monolith split into `bridge/` directory with 5 domain files; routing-only `mod.rs` |
| COMM-01 | Protocol offset comments at wire-decode sites in `protocol.rs` and `bridge/` files |

---

## Gap Analysis

### ARCH-01 — bridge/ directory structure and routing

**Gap type:** Structural verification (no prior automated test existed)
**Test type:** Smoke / filesystem + unit test execution

**Verification steps executed:**

1. Checked `Rust/core/src/bridge/` exists and contains `mod.rs`, `metrics.rs`, `sleep.rs`, `capture.rs`, `activity.rs`, `debug.rs`.
2. Confirmed `Rust/core/src/bridge.rs` does NOT exist (monolith deleted).
3. Confirmed `mod.rs` dispatches to all 5 domain files via `dispatch_*()` functions at lines 515, 523, 532, 542, 561.
4. Ran `cargo test --lib bridge` — 10/10 pass including `bridge_methods_constant_matches_dispatcher`, which mechanically asserts every method in `BRIDGE_METHODS` is reachable through the domain dispatcher.

**File sizes (lines):**

| File | Lines |
|------|-------|
| `bridge/mod.rs` | 1,229 |
| `bridge/metrics.rs` | 4,256 |
| `bridge/sleep.rs` | 955 |
| `bridge/capture.rs` | 1,549 |
| `bridge/activity.rs` | 804 |
| `bridge/debug.rs` | 2,027 |

**Routing function `handle_bridge_request_inner`:** spans lines 456–584 (129 lines), of which ~90 are pure prefix-routing arms delegating to domain dispatchers. Shared infrastructure (BRIDGE_METHODS constant, shared structs, battery parsing, utility helpers, tests) accounts for the remaining 1,100 lines in mod.rs per design decisions BAT-01/BAT-02 and D-02.

**Automated command:** `cd Rust/core && cargo test --lib bridge`
**Result:** 10 passed, 0 failed

**Status: FILLED — green**

---

### COMM-01 — Protocol offset comments at decode sites

**Gap type:** Content verification (no prior automated test existed)
**Test type:** Static analysis (grep counts + spot-check)

**Verification steps executed:**

1. Counted offset/byte comment markers per file:
   - `protocol.rs`: 28 matching lines (`// offset`, `// Byte`, `// byte`, `offset N`)
   - `bridge/mod.rs`: 15 matching lines
   - `bridge/metrics.rs`: 0 (`offset` keyword) — uses `empirically verified`, `formula source`, `slope:` markers instead (4 matches)

2. Spot-checked key decode sites:
   - `bridge/mod.rs` lines 241–265: Event-48 battery layout — absolute payload offset 17, data body offset 5, derivation documented, guard rationale documented.
   - `bridge/mod.rs` lines 286–334: Cmd26 response layout — per-byte field table, guard `< 7`, sanity guard `> 1000` documented.
   - `protocol.rs` lines 718–730: HR/battery packet fields — `offset 1: u8, battery_pct`, `offsets 2–3: u16 LE, hr_milli_bpm`, `offsets 4–5: unknown`.
   - `protocol.rs` lines 991–1000: V24 payload — `offsets 45/49/53: f32 LE × 3, gravity_x/y/z`, `offset 73: u16 LE, skin_temp_raw`.
   - `bridge/metrics.rs`: SpO2 formula with source reference (`openwhoop reference + Ghidra V24 disassembly 2026-06-14`), empirical verification date, temperature coefficient with LSB-per-°C slope.

3. All three ROADMAP-specified SC3 sites (Event-48, Cmd26, V24 biometric offsets) carry comments with byte offsets, data type, and empirical verification date or source reference.

**Offset comment counts (grep):**

| File | `offset/byte` markers | `empirically verified` / source markers |
|------|-----------------------|-----------------------------------------|
| `protocol.rs` | 28 | 11 |
| `bridge/mod.rs` | 15 | 3 |
| `bridge/metrics.rs` | 0 | 4 |

**Status: FILLED — green**

---

## Test Execution Summary

| Test | Command | Result |
|------|---------|--------|
| Bridge unit tests (10 tests) | `cd Rust/core && cargo test --lib bridge` | 10/10 green |
| Domain file existence | `ls Rust/core/src/bridge/` | 6 files present |
| Monolith deleted | `ls Rust/core/src/bridge.rs` | file not found (expected) |
| Offset comment presence | `grep -c "// offset..." protocol.rs bridge/mod.rs bridge/metrics.rs` | 28 / 15 / 4 markers |

**Note on pre-existing failure:** `cargo test --locked` (full suite) has one pre-existing failure in `tests/ios_healthkit_boundary_tests.rs::ios_health_metric_display_filters_forbidden_metric_sources`. This failure predates Phase 86, was not introduced by any Phase 86 commit, and is unrelated to bridge splitting or protocol comments. It is not a Phase 86 regression.

---

## Verification Map

| Requirement | Automated Command | Status |
|-------------|------------------|--------|
| ARCH-01 — bridge/ split + dispatcher | `cd Rust/core && cargo test --lib bridge` | green |
| COMM-01 — offset comments present | `grep -c "// offset\|empirically verified" Rust/core/src/protocol.rs Rust/core/src/bridge/mod.rs Rust/core/src/bridge/metrics.rs` | green |

---

## Files Verified (read-only)

- `Rust/core/src/bridge/mod.rs`
- `Rust/core/src/bridge/metrics.rs`
- `Rust/core/src/bridge/sleep.rs`
- `Rust/core/src/bridge/capture.rs`
- `Rust/core/src/bridge/activity.rs`
- `Rust/core/src/bridge/debug.rs`
- `Rust/core/src/protocol.rs`
