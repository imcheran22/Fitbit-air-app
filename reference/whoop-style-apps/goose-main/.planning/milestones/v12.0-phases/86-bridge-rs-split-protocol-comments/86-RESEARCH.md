# Phase 86: bridge.rs Split + Protocol Comments - Research

**Researched:** 2026-06-15
**Domain:** Rust module reorganisation + WHOOP wire-protocol documentation
**Confidence:** HIGH (all findings verified directly from source files)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 — Namespace Grouping (5 files):**

| Target file | Namespaces |
|-------------|-----------|
| `Rust/core/src/bridge/metrics.rs` | `metrics.*`, `metric_series.*`, `exercise.*`, `biometrics.*`, `battery.*`, `calibration.*`, `openwhoop.*`, `diagnostics.*` |
| `Rust/core/src/bridge/sleep.rs` | `sleep.*`, `overnight.*`, `health_sync.*` |
| `Rust/core/src/bridge/capture.rs` | `capture.*`, `protocol.*`, `historical_sync.*`, `sync.*`, `ios.*` |
| `Rust/core/src/bridge/activity.rs` | `activity.*`, `workout.*`, `apple_daily.*`, `journal.*`, `timeline.*` |
| `Rust/core/src/bridge/debug.rs` | `debug.*`, `commands.*`, `core.*`, `settings.*`, `storage.*`, `store.*`, `export.*`, `upload.*`, `privacy.*`, `ui_coverage.*`, `device.*` |

- **D-02 — Dispatch via `pub(crate) fn dispatch_<domain>(method: &str, args: &serde_json::Value, db: &str) -> BridgeResult`** — no trait. Each domain file exposes one top-level dispatch function. bridge.rs (or bridge/mod.rs) calls these directly.
- **D-03 — Comment ALL non-obvious WHOOP wire-format decode sites** — not only the 3 in ROADMAP SC3. Every byte-offset parse site that is not self-evident from field names must carry: offset, data type, value interpretation, empirical verification date, source reference (Ghidra / BTSnoop).

### Claude's Discretion
- Exact line threshold for the new bridge.rs router (ROADMAP says ≤ 100 lines; aim for ≤ 80 to leave headroom)
- Whether to use `mod bridge { mod metrics; ... }` inline in bridge.rs or a separate `bridge/mod.rs`
- Order of domain function arguments (db path first vs. last — follow existing bridge helper conventions)
- Whether `BridgeResult` type alias is defined in `bridge/mod.rs` or kept in bridge.rs

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARCH-01 | bridge.rs split: thin router ≤ 100 lines + 5 domain handler files in `bridge/` subdirectory | Sections: Module Split Strategy, Critical Blocker (include_str!), Shared Utilities |
| COMM-01 | Protocol offset comments at all non-obvious WHOOP wire-format decode sites | Section: Wire-Format Decode Sites Inventory |
</phase_requirements>

---

## Summary

bridge.rs is a 11,186-line monolith with 152 registered bridge methods (verified in `BRIDGE_METHODS` array), 141 match arms in the dispatcher (verified by `grep -c`), and approximately 299 struct definitions plus ~130 private functions. The file has a clear internal structure: the dispatcher (`handle_bridge_request_inner`, lines 2337–3052) is only ~715 lines — the remaining ~8,100 lines are domain-specific `*_bridge` functions, shared utilities, and the test module. The split moves domain functions into 5 sub-files; the router (`bridge/mod.rs`) retains only the dispatcher shell, FFI entry points, and shared utilities.

The most important pre-planning discovery is a **critical self-referential test** at line 9846: `bridge_methods_constant_matches_dispatcher` uses `include_str!("bridge.rs")` to scan its own source for `"method.name" =>` arms and asserts the result matches `BRIDGE_METHODS`. After the split, `bridge.rs` becomes `bridge/mod.rs` and the match arms move to domain files — this test **will break** unless explicitly updated (the path becomes `include_str!("mod.rs")` and the scanner must either concatenate domain file sources or the test must be reconceived). This is the hardest correctness risk in the phase.

The `ios.*` namespace listed in D-01 under `capture.rs` does not exist as bridge methods — it is only a string constant value (`"ios.corebluetooth.raw_notification"`) used inside a `default_raw_notification_source()` helper. The `validation.*` namespace appears as legacy aliases in the dispatcher (3 arms using `"validation.local_health_manifest_scaffold" | "local_health.validation_manifest_scaffold"`) that are not registered in `BRIDGE_METHODS`; they belong in `debug.rs` with `local_health.*`.

**Primary recommendation:** Split bridge.rs by converting it to `bridge/mod.rs` (not keeping bridge.rs with inline `mod` declarations), which keeps `pub mod bridge;` in `lib.rs` unchanged. Update `include_str!("bridge.rs")` to a multi-file scan approach or simplify the test. Move all domain `*_bridge` functions and their `*Args` structs together — they have 1:1 co-location and no cross-domain sharing was found.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| FFI entry points (C ABI) | `bridge/mod.rs` | — | Must stay at the crate root of the bridge module; `#[unsafe(no_mangle)]` symbols are the stable ABI |
| Method routing / dispatch shell | `bridge/mod.rs` | — | Router is the only component Swift sees; must be the single entry point |
| Domain method implementations | `bridge/<domain>.rs` | — | Each domain file owns the full stack: struct defs + `*_bridge` fns + dispatch fn |
| Shared bridge utilities | `bridge/mod.rs` | — | `open_bridge_store`, `request_args`, `bridge_ok/error`, `register_built_in_definitions` used by ≥3 domains |
| Wire-format decode documentation | `protocol.rs` + `bridge/metrics.rs` | `bridge/capture.rs` | Decode sites are in protocol.rs (R22, V24/V18 bodies) and bridge/metrics.rs (battery Event-48, cmd26) |
| `BRIDGE_METHODS` constant | `bridge/mod.rs` | — | Consumed by `core.list_methods` RPC and the consistency test — must be co-located with the router |
| Consistency enforcement test | `bridge/mod.rs` (mod tests) | — | Must be updated to scan all domain files, not just self |

---

## Standard Stack

No new dependencies. All code uses existing crate imports. [VERIFIED: Rust/core/Cargo.toml]

**Relevant existing dependencies:**
- `serde_json 1.0` — all arg/result serialisation in domain functions
- `serde 1.0` — `#[derive(Deserialize)]` on every `*Args` struct
- `rusqlite 0.40` (bundled) — store access via `GooseStore`
- `thiserror 2.0` — `GooseError` used in all `GooseResult<T>` returns

**Rust edition / MSRV:** Edition 2024, `rust-version = "1.96"` [VERIFIED: Rust/core/Cargo.toml]

## Package Legitimacy Audit

No new packages are installed in this phase. Audit is not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
Swift (iOS) ──JSON──► goose_bridge_handle_json (FFI, #[no_mangle])
                              │  catch_unwind wrapper
                              ▼
                   handle_bridge_request_json
                              │ parse BridgeRequest
                              ▼
                   handle_bridge_request_inner   ◄── stays in bridge/mod.rs
                              │ match method prefix
                 ┌────────────┼────────────┬──────────────┬────────────┐
                 ▼            ▼            ▼              ▼            ▼
        dispatch_metrics  dispatch_sleep  dispatch_capture  dispatch_activity  dispatch_debug
        bridge/metrics.rs bridge/sleep.rs bridge/capture.rs bridge/activity.rs bridge/debug.rs
                 │            │            │              │            │
                 └────────────┴────────────┴──────────────┴────────────┘
                              │  shared utilities (in bridge/mod.rs)
                 open_bridge_store / request_args / bridge_ok / bridge_error
                              │
                              ▼
                         GooseStore (store.rs) → goose.sqlite
```

### Recommended Project Structure

```
Rust/core/src/
├── lib.rs                     # pub mod bridge; — UNCHANGED
├── bridge/                    # NEW directory (bridge.rs deleted)
│   ├── mod.rs                 # Router ≤ 80 lines: BRIDGE_METHODS, FFI, dispatcher shell,
│   │                          # shared utilities (open_bridge_store, request_args, etc.)
│   ├── metrics.rs             # 51 dispatch arms: metrics.*, calibration.*, battery.*, etc.
│   ├── sleep.rs               # 8 dispatch arms: sleep.*, overnight.*, health_sync.*
│   ├── capture.rs             # 9+3+2 dispatch arms: capture.*, protocol.*, historical_sync.*, sync.*
│   ├── activity.rs            # 14+3 dispatch arms: activity.*, workout.*, apple_daily.*, etc.
│   └── debug.rs               # 10+5+4+4+2+2+1+1 dispatch arms: debug.*, commands.*, etc.
└── [all other modules unchanged]
```

### Pattern 1: Domain Dispatch Function Signature

**What:** Each domain file exports a single `pub(crate) fn dispatch_<domain>` that owns the sub-match for its namespace group.

**When to use:** Called from the router match arm for the domain prefix.

```rust
// Source: Rust/core/src/bridge.rs (derived from existing dispatch pattern)
// In bridge/metrics.rs:
pub(crate) fn dispatch_metrics(
    request: &BridgeRequest,
) -> BridgeResponse {
    match request.method.as_str() {
        "metrics.goose_hrv_v0" => request_args::<HrvInput>(request)
            .and_then(|input| metric_result_to_value(goose_hrv_v0(&input)))
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        // ... 50 more arms
        _ => unreachable!("dispatch_metrics called with non-metrics method"),
    }
}
```

**Why `&BridgeRequest` not `(method, args, db)`:** The request ID is needed for every `bridge_ok`/`bridge_error` call, and `args` deserialization uses `request_args::<T>(request)` which takes `&BridgeRequest`. Passing the full request avoids threading 3 arguments and keeps the call site in mod.rs identical to what exists today.

### Pattern 2: Router in bridge/mod.rs

**What:** The router matches only on the namespace prefix, delegating the full method string to the domain dispatcher.

```rust
// In bridge/mod.rs (router section):
match request.method.as_str() {
    m if m.starts_with("metrics.") || m.starts_with("calibration.")
      || m.starts_with("exercise.") || m.starts_with("biometrics.")
      || m.starts_with("battery.") || m.starts_with("openwhoop.")
      || m.starts_with("diagnostics.") || m.starts_with("metric_series.") =>
        metrics::dispatch_metrics(&request),

    m if m.starts_with("sleep.") || m.starts_with("overnight.")
      || m.starts_with("health_sync.") =>
        sleep::dispatch_sleep(&request),

    // ... 3 more domain arms

    method => bridge_error(&request.request_id, "unknown_method",
        format!("unsupported bridge method: {method}")),
}
```

**Alternative:** Match specific method strings and forward — avoids the `starts_with` cost and keeps arms explicit. For 152 methods this is ~152 lines; prefix-match keeps the router short. Either approach compiles to the same code.

### Pattern 3: Protocol Offset Comment Format

```rust
// Source: 86-CONTEXT.md §Specific Ideas
// In bridge/metrics.rs (parse_event48_battery):
// offset 17: u16 LE, raw battery charge; battery_pct = raw / 10
//   raw ≤ 1100 guard (>110% would indicate sensor error)
//   empirically verified 2026-06-14 via Ghidra disassembly + BTSnoop capture
//   see: .planning/phases/84-gen4-battery/84-01-SUMMARY.md §Event-48 layout

// In protocol.rs (parse_r22_payload):
// payload[1]: u8, battery_pct direct (0–100); no scaling required
//   R22 is WHOOP 5.0 realtime handle (BLE characteristic 0x0022)
//   empirically verified via BTSnoop; field name confirmed in openwhoop reference
// payload[2..4]: u16 LE, hr_milli_bpm; hr_bpm = raw / 10.0
//   minimum payload guard: len ≥ 4 checked above
```

### Anti-Patterns to Avoid

- **Duplicating shared utilities into each domain file:** `open_bridge_store`, `bridge_ok`, `bridge_error`, `request_args`, `validate_no_traversal`, `metric_result_to_value`, and default-value helpers are used across 3+ domains. They stay in `bridge/mod.rs` and are accessed as `super::bridge_ok(...)` from domain files.
- **Moving BRIDGE_METHODS out of mod.rs:** The consistency test and `core.list_methods` RPC both reference `BRIDGE_METHODS`. It must remain in `mod.rs`.
- **Splitting domain functions from their Args structs:** Each `*Args` struct is used exclusively by its companion `*_bridge` function. Co-locate them in the same domain file to avoid orphaned type definitions.
- **Leaving `include_str!("bridge.rs")` unchanged:** After the split this will either not compile (file not found) or scan the wrong file. This is a CI-breaking bug if not updated.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Module reorganisation | Custom build script to merge files | Standard Rust `mod.rs` pattern | Compiler handles module resolution; no tooling needed |
| Cross-domain shared utilities | Duplicate helpers in each domain file | Keep in `bridge/mod.rs`, use `super::` | Duplication causes divergence; `super::` access is idiomatic |
| Consistency test scanner update | Hand-coded regex over all 5 files | Concatenate `include_str!` for each domain file | Straightforward Rust; no regex library needed |

---

## Critical Blocker: `include_str!("bridge.rs")` Self-Scanner Test

This is the highest-risk correctness issue in the phase.

**Location:** `Rust/core/src/bridge.rs`, line 9846, inside `mod tests { fn bridge_methods_constant_matches_dispatcher() }`

**What it does:** Reads the source of `bridge.rs` at compile time using `include_str!("bridge.rs")`, scans for `"method.name" =>` patterns between the `match request.method.as_str()` line and the `method => bridge_error(` catch-all, and asserts the found set equals `BRIDGE_METHODS`. This prevents `BRIDGE_METHODS` from drifting out of sync with the actual dispatcher.

**After the split:**
- `bridge.rs` is deleted; module root becomes `bridge/mod.rs`
- The dispatcher match arms move to `bridge/<domain>.rs` files
- `include_str!("bridge.rs")` will **fail to compile** (file not found) if left unchanged in `bridge/mod.rs`
- Even if fixed to `include_str!("mod.rs")`, the arms won't be there — they're in domain files

**Resolution options (planner must choose one):**

| Option | Pros | Cons |
|--------|------|------|
| **A. Scan all 5 domain files** — `include_str!("mod.rs")` + `include_str!("metrics.rs")` etc., concatenate strings, run existing scanner | Keeps test semantics identical | Test code is longer; must list all domain files explicitly |
| **B. Drop the dispatcher-scan test** — remove `bridge_methods_constant_matches_dispatcher`, keep only `bridge_methods_constant_is_sorted_and_unique` | Simplifies test module; the sorted/unique test still catches typos | Loses the cross-check between BRIDGE_METHODS and actual dispatcher arms |
| **C. Derive consistency from runtime** — replace compile-time scan with a test that calls `core.list_methods` and round-trips all 152 methods, asserting each returns not `unknown_method` | No source scanning; tests actual behaviour | Slower; needs temp DB for store-backed methods |

**Recommendation:** Option A (scan all domain files). It preserves the existing safety guarantee with minimal change — only the scanner setup changes, not its logic.

---

## Wire-Format Decode Sites Inventory (COMM-01)

All sites requiring protocol offset comments, verified by direct grep of source files. [VERIFIED: direct grep of Rust/core/src/bridge.rs and Rust/core/src/protocol.rs]

### Sites already documented (have comments — verify comment completeness)

| Site | File | Lines | Current Comment Quality |
|------|------|-------|------------------------|
| `parse_event48_battery` — Event-48 absolute offset 17 | `bridge.rs` | 388–410 | Full layout comment, all offsets documented. Adequate. |
| `parse_event48_battery_from_data` — data-body offset 5 | `bridge.rs` | 413–436 | Cross-references absolute offset 17. Adequate. |
| `parse_cmd26_battery` — payload[5..7] cmd26 response | `bridge.rs` | 440–460 | Has layout comment, all offsets named. Adequate. |
| `battery_parse_tests` helpers — build payloads at offset 17 | `bridge.rs` | 11055–11090 | Layout comment in test helper. Adequate. |

### Sites lacking adequate offset comments (require COMM-01 work)

**In `Rust/core/src/protocol.rs`:**

| Function | Line | Decode | Missing Comment |
|----------|------|--------|-----------------|
| `parse_r22_payload` | 696 | `payload[1]` → `battery_pct: u8` | Offset 1, unit, R22 characteristic context, verification date |
| `parse_r22_payload` | 697 | `u16::from_le_bytes([payload[2], payload[3]])` → `hr_milli_bpm` | Offsets 2–3, LE, hr_bpm = raw/10, min-length guard rationale |
| `parse_r22_payload` | 700–704 | `payload[4..=5]` → `extra: Option<[u8; 2]>` | Offsets 4–5, purpose unknown (empirical), conditional on len ≥ 6 |
| `reassemble_frame` Gen4 | 339 | `u16::from_le_bytes([frame[1], frame[2]])` → payload length | Frame header layout, Gen4 vs Gen5 divergence |
| `reassemble_frame` Gen5 | 341 | `u16::from_le_bytes([frame[2], frame[3]])` → payload length | Gen5 4-byte header offset |
| `reassemble_frame` Gen5 CRC | 353–354 | `u16::from_le_bytes([frame[6], frame[7]])` → CRC16 Modbus | Frame trailer position, CRC algorithm name |
| `parse_v24_body_summary` | 859–875 | 15+ field reads at offsets 53–75 | V24 history payload layout: gravity2, SpO2, skin_temp, resp_raw offsets |
| `parse_v18_body` | ~940 | `read_u16_le(data, 73)` → `skin_temp_raw` | Data-body relative offset, body starts at payload[3], degC formula |
| `parse_v18_body` | ~938 | `read_f32_le(data, 45)`, `49`, `53` → gravity axes | Body-relative offsets, f32 LE, units |
| `FrameReassembler::push` Gen4/Gen5 length | 57, 67 | `u16::from_le_bytes([buffer[1/2], buffer[2/3]])` | Stream reassembly length field position per generation |
| `parse_data_packet_body_summary` k10 | ~760–790 | IMU axis offsets `(name, offset)` array | K10 payload accelerometer/gyroscope layout |

**In `Rust/core/src/bridge.rs` (will move to domain files):**

| Function | Line | Decode | Missing Comment |
|----------|------|--------|-----------------|
| `insert_v24_biometric_batch_bridge` helpers | 3575–3640 | `spo2_from_raw_uncalibrated`: ratio-of-ratios formula R = red/ir | Formula source, SpO2 range gate 70–100 rationale |
| `skin_temp_celsius_from_raw` | ~3598 | `raw / 128.0` conversion, gate 5–45°C | LSB-per-degC derivation, gate values source |
| `resp_rate_bpm_zero_crossing` | ~3611 | Zero-crossing algorithm on `u16` window | Algorithm description, sampling rate assumption |

### Decode sites in protocol.rs that are adequately self-documenting

- `parse_data_packet_body_summary` offset constants: `data_offset: 1`, `3`, `5`, `12` — named via struct field names that explain their purpose (command_response, realtime_raw_data, etc.). Adequate.
- `history_hr_marker_offset`: returns `Option<usize>` with match on `packet_k` — self-documenting from field name.

---

## Common Pitfalls

### Pitfall 1: Moving `use crate::...` imports into domain files without adjustment

**What goes wrong:** Each `*_bridge` function in bridge.rs uses items imported at the top of bridge.rs. After moving functions to `bridge/metrics.rs`, the `use crate::metrics::...` statements at the top of the monolith are no longer in scope.

**Why it happens:** Developers copy function bodies but forget that `use` statements in the original file are not function-local.

**How to avoid:** For each domain file, derive the `use` imports by scanning the functions being moved and collecting every `crate::*` item they reference. The domain files will need their own `use` blocks. Helper functions in `bridge/mod.rs` (like `bridge_ok`, `request_args`) are accessed via `super::bridge_ok(...)`.

**Warning signs:** Compiler error `cannot find value/type/function in this scope` immediately after moving.

### Pitfall 2: `deny(clippy::unwrap_used)` fires on new code

**What goes wrong:** The domain dispatch functions contain `unwrap_or_else` on `GooseResult`, which is fine. But any new helper code added during the split that uses `.unwrap()` will fail `cargo clippy --lib`.

**Why it happens:** Phase 85 established `#![cfg_attr(not(test), deny(clippy::unwrap_used))]` in `lib.rs`. This applies to all modules in the crate, including the new `bridge/` submodules.

**How to avoid:** Use `?`, `.map_err(|e| GooseError::message(...))`, or `unwrap_or_else`. Do not add new `.unwrap()` calls. The existing `unwrap_or_else` pattern in the dispatcher is intentional and stays.

### Pitfall 3: Forgetting the Android/JNI entry point

**What goes wrong:** The Android JNI entry point at line 11167 (`pub extern "system" fn Java_com_goose_core_GooseBridge_handle`) is gated behind `#[cfg(target_os = "android")]` and lives at the bottom of bridge.rs. If not included in `bridge/mod.rs`, the Android build breaks silently on CI (which only tests ubuntu/macos).

**Why it happens:** The JNI section is far from the rest of the bridge structure and easy to miss in a large refactor.

**How to avoid:** Keep this block in `bridge/mod.rs`. It is a second FFI entry point, analogous to `goose_bridge_handle_json`, and belongs with the other `#[no_mangle]` symbols.

### Pitfall 4: `validation.*` alias arms not in BRIDGE_METHODS

**What goes wrong:** The dispatcher has 3 arms using `"validation.local_health_manifest_*"` as legacy aliases that are NOT in `BRIDGE_METHODS`. When moving arms to `bridge/debug.rs`, these alias arms must be included or the `bridge_methods_constant_matches_dispatcher` test will fail (it scans for `"name" =>` but skips `#[cfg(...)]`-prefixed lines; the aliases are not skipped).

**Why it happens:** The BRIDGE_METHODS constant only lists `"local_health.validation_manifest_*"` (not the validation.* aliases). The aliases are compiler-visible match arms.

**How to avoid:** Keep alias arms in `bridge/debug.rs` alongside their canonical counterparts. The consistency test `bridge_methods_constant_matches_dispatcher` extracts the method name from each arm: multi-name arms `"a" | "b" => {...}` will extract only `"a"` (the first quoted string on the line). Verify the scanner logic handles pipe-separated arms or explicitly list both names.

### Pitfall 5: `local_health.*` namespace grouping

**What goes wrong:** D-01 does not explicitly list `local_health.*` in any domain file. It lists `debug.rs` for 12 namespaces ending with `device.*`. The `local_health.*` methods (`local_health.validation_manifest_scaffold`, etc.) appear as aliases in the dispatcher.

**Why it happens:** D-01 was drafted against the original 33-namespace count but `local_health.*` was added as an alias for `validation.*`.

**How to avoid:** Put `local_health.*` / `validation.*` arms in `debug.rs` — they call `local_health_validation_*` functions which are conceptually debugging/tooling operations.

---

## Code Examples

### Verified pattern: module split via `mod.rs`

The existing codebase already uses this pattern for sub-crate modules. lib.rs declares `pub mod bridge;` and Rust resolves it to either `src/bridge.rs` (current) or `src/bridge/mod.rs` (after split). No change to `lib.rs` required. [VERIFIED: Rust/core/src/lib.rs]

```rust
// lib.rs — unchanged
pub mod bridge;  // resolves to bridge/mod.rs after bridge.rs is deleted
```

### Verified pattern: shared utility access from domain files

```rust
// In bridge/metrics.rs:
use super::{BridgeRequest, BridgeResponse, bridge_ok, bridge_error, request_args,
            open_bridge_store, metric_result_to_value};
use crate::{
    GooseResult,
    metrics::{HrvInput, goose_hrv_v0},
    // ... other crate items used by metrics domain
};
```

### Verified pattern: existing dispatch arm structure (unchanged per-arm)

Each arm in the domain dispatcher file keeps the existing chain pattern:

```rust
// Source: Rust/core/src/bridge.rs lines 2355–2380 (verified current pattern)
"metrics.goose_hrv_v0" => request_args::<HrvInput>(request)
    .and_then(|input| metric_result_to_value(goose_hrv_v0(&input)))
    .map(|value| bridge_ok(&request.request_id, value))
    .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
```

### Verified pattern: protocol offset comment format (from bridge.rs §Battery)

```rust
// Source: Rust/core/src/bridge.rs lines 388–400 (existing comment — reference for new sites)
/// Byte layout (absolute payload offsets, BAT-01):
///   0-1   packet_type + sequence
///   2-3   event_id (u16 LE)
///   4-7   timestamp_seconds (u32 LE)
///   ...
///   17-18 battery raw u16 LE; battery_pct = raw / 10
/// Guard: raw > 1100 rejected (battery_pct_raw > 110% indicates sensor error)
/// empirically verified 2026-06-14 via Ghidra + BTSnoop
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-file bridge.rs | `bridge/mod.rs` + domain files | This phase | Compiler resolves `pub mod bridge;` to `bridge/mod.rs` — zero lib.rs change |
| `include_str!("bridge.rs")` consistency test | Must scan domain files | This phase | Test update required — see Critical Blocker section |

**No deprecated Rust patterns identified.** Edition 2024, MSRV 1.96 — all patterns in bridge.rs are current.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `dispatch_<domain>(&request)` signature (passing full `&BridgeRequest`) is preferable to `(method, args, db)` | Architecture Patterns | Low — both compile; `&BridgeRequest` reduces call-site changes |
| A2 | The Android JNI block at line 11167 should stay in `bridge/mod.rs` | Common Pitfalls (Pitfall 3) | Medium — if moved to a domain file, Android builds may break |
| A3 | `validation.*` alias arms should go in `debug.rs` | Pitfall 5 | Low — grouping is aesthetic; the test passes regardless of which domain file hosts them |

**All structural claims about bridge.rs (line counts, function locations, BRIDGE_METHODS count, test scanner logic) were verified directly from source files.**

---

## Open Questions

1. **include_str! scanner update — which option?**
   - What we know: the test at line 9845 uses `include_str!("bridge.rs")` and will not compile after the split.
   - What's unclear: whether the team prefers Option A (multi-file scan), B (drop scan test), or C (runtime round-trip).
   - Recommendation: Option A — concatenate `include_str!` from all 5 domain files in the test; preserves the compile-time safety net.

2. **`local_health.*` namespace: D-01 does not list it**
   - What we know: dispatcher has 3 alias arms (`validation.* | local_health.*`) not in `BRIDGE_METHODS`. They call local health validation functions.
   - What's unclear: which domain file receives them (debug.rs assumed).
   - Recommendation: Put in `debug.rs`. The planner may adjust if grouping with capture makes more semantic sense.

3. **V24/V18 decode comment depth in protocol.rs**
   - What we know: `parse_v24_body_summary` and `parse_v18_body` have 15+ field reads at specific offsets. Some already have partial comments (skin_temp_raw has a degC formula note at line ~939).
   - What's unclear: whether D-03 requires a block comment at function level listing ALL offsets, or individual inline comments per read.
   - Recommendation: Function-level block comment listing all offsets (like the BAT-01 comment) plus inline comments at non-obvious reads. Avoids clutter while being comprehensive.

---

## Environment Availability

This phase is code/config-only within the Rust crate. No external dependencies beyond the existing Rust toolchain.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain | `cargo test`, `cargo clippy` | ✓ | MSRV 1.96 | — |
| cargo fmt | CI fmt check | ✓ | included with rustup | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Rust built-in test runner |
| Config file | `Rust/core/Cargo.toml` (no separate test config) |
| Quick run command | `cd Rust/core && cargo test --lib` |
| Full suite command | `cd Rust/core && cargo test` (lib + integration tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-01 | bridge.rs ≤ 100 lines after split | manual check / wc -l | `wc -l src/bridge/mod.rs` | ❌ Wave 0 (new file) |
| ARCH-01 | All 152 bridge methods still respond | integration | `cargo test bridge_` | ✅ bridge_tests.rs |
| ARCH-01 | BRIDGE_METHODS matches dispatcher | unit (in mod.rs) | `cargo test --lib bridge_methods_constant_matches_dispatcher` | ✅ (requires update) |
| ARCH-01 | cargo clippy passes | lint | `cargo clippy --lib --no-deps -- -D warnings` | ✅ CI |
| COMM-01 | Offset comments present at wire decode sites | manual review / grep | `grep "offset\|empirically verified" src/protocol.rs` | ❌ Wave 0 (new comments) |

### Sampling Rate

- **Per task commit:** `cargo test --lib` (unit + inline tests, ~5s)
- **Per wave merge:** `cargo test` (full suite including integration, ~60s)
- **Phase gate:** Full suite green on ubuntu-latest and macos-15 before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `Rust/core/src/bridge/mod.rs` — does not exist; created in Wave 1
- [ ] `Rust/core/src/bridge/metrics.rs` — does not exist; created in Wave 1
- [ ] `Rust/core/src/bridge/sleep.rs` — does not exist; created in Wave 1
- [ ] `Rust/core/src/bridge/capture.rs` — does not exist; created in Wave 1
- [ ] `Rust/core/src/bridge/activity.rs` — does not exist; created in Wave 1
- [ ] `Rust/core/src/bridge/debug.rs` — does not exist; created in Wave 1
- [ ] Update `include_str!("bridge.rs")` → multi-file scanner in mod.rs test module

---

## Security Domain

`security_enforcement` is not explicitly disabled. This phase introduces no new trust boundaries, no new external inputs, and no new error-handling paths. ASVS categories are not applicable — the change is purely structural (file reorganisation + documentation comments). The `catch_unwind` FFI safety net and the `deny(clippy::unwrap_used)` lint both continue to apply to all new code.

---

## Sources

### Primary (HIGH confidence — verified from source files)

- `Rust/core/src/bridge.rs` — line counts, function list, struct count, dispatcher structure, BRIDGE_METHODS array (152 entries), shared utilities, `include_str!` test scanner, wire decode sites at lines 388–460
- `Rust/core/src/lib.rs` — `pub mod bridge;` declaration, `deny(clippy::unwrap_used)` lint config
- `Rust/core/src/error.rs` — `GooseError`, `GooseResult<T>` types
- `Rust/core/src/protocol.rs` — R22 decode sites (lines 671–730), V24/V18 body decode sites, frame reassembly length fields
- `Rust/core/Cargo.toml` — edition 2024, rust-version 1.96, dependency list
- `.github/workflows/rust-core.yml` — CI: `cargo test --lib`, `cargo clippy --lib --no-deps -- -D warnings`, matrix: ubuntu-latest + macos-15
- `.planning/phases/86-bridge-rs-split-protocol-comments/86-CONTEXT.md` — locked decisions D-01, D-02, D-03

### Secondary (MEDIUM confidence)

- `Rust/core/tests/bridge_tests.rs` — confirmed integration tests import `goose_core::bridge::{BRIDGE_RESPONSE_SCHEMA, BridgeResponse, goose_bridge_free_string, goose_bridge_handle_json, handle_bridge_request_json}` — all must remain public in `bridge/mod.rs`
- `Rust/core/tests/exercise_detection_tests.rs` and `v24_biometric_bridge_tests.rs` — confirmed both use `goose_core::bridge::handle_bridge_request_json` — no changes needed to integration tests

---

## Metadata

**Confidence breakdown:**
- Structural analysis (line counts, function names, test scanner): HIGH — verified by direct grep and file read
- Wire-decode site inventory: HIGH — verified by grep across bridge.rs and protocol.rs
- Module split pattern: HIGH — verified against existing lib.rs + Rust language semantics
- Domain grouping alignment with D-01: HIGH — verified each namespace against BRIDGE_METHODS array

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (stable codebase — no fast-moving dependencies)
