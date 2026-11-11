# Phase 85: Rust Crash Safety — Research

**Researched:** 2026-06-14
**Domain:** Rust error propagation — clippy::unwrap_used lint enforcement, catch_unwind FFI boundary
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Plan Decomposition (1 plan per module):**
- Plan 1 (`bridge.rs` — 46 unwraps): Add `#![cfg_attr(not(test), deny(clippy::unwrap_used))]` to `lib.rs`; add `#[allow(clippy::unwrap_used)]` to all other not-yet-converted modules; convert all 46 `.unwrap()` in `bridge.rs`.
- Plan 2 (`store.rs` — 62 unwraps): Convert all 62 `.unwrap()` in `store.rs`; remove the `#[allow]` from `store.rs`.
- Plan 3 (`metrics.rs` — 11 unwraps): Convert + remove allow.
- Plan 4 (`capabilities.rs` — 8 unwraps): Convert + remove allow.
- Plan 5 (small files — 6 unwraps across `energy_rollup.rs`, `exercise_detection.rs`, `step_discovery.rs`, `openwhoop_reference.rs`): Convert all + remove their allows.
- Plan 6 (Gate): Verify no remaining `#[allow(clippy::unwrap_used)]` left, `cargo clippy` passes zero violations, `cargo test --locked` passes.

**D-02 — GooseError Variants:** Use `GooseError::message(format!("..."))` for all `.unwrap()` sites that do not fit `Io`, `Json`, `Hex`, `Sqlite`. No new variants.

**D-03 — Test Code:** Convert test `.unwrap()` to `.expect("descriptive message")` for clearer panic messages. This is outside the `deny` gate.

**D-04 — Deny Attribute Strategy:** Add `#![cfg_attr(not(test), deny(clippy::unwrap_used))]` to `lib.rs` in Plan 1. Each unconverted module gets `#[allow(clippy::unwrap_used)]` at file top. Each plan removes its module's allow.

**D-05 — Existing Allow List:** Keep `clippy::unnecessary_unwrap` in the existing `#![allow(...)]` block. Do not remove it.

**D-06 — catch_unwind:** Already implemented in Phase 84 (bridge.rs lines 3101–3119). Do NOT re-implement. Only verify it exists in the gate plan.

### Claude's Discretion

- Exact error message text for each `.unwrap()` site
- Whether Option `.unwrap()` sites use `.ok_or_else(|| GooseError::message(...))` or `.ok_or(GooseError::message(...))` based on performance context
- Whether to use `?` propagation or explicit `map_err` chains per site
- Module-level allow placement (file-top vs. `#[allow]` on specific impl blocks)

### Deferred Ideas (OUT OF SCOPE)

- New GooseError variants (e.g., `ParseError`, `IndexError`)
- `cargo clippy -D warnings` for CI config
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARCH-03 | 133 `.unwrap()` calls in production code → `Result<_, GooseError>`; `#[cfg_attr(not(test), deny(clippy::unwrap_used))]` added; `catch_unwind` safety net on bridge dispatcher entry point | Research confirmed: catch_unwind already done (Phase 84); actual production library violations are 5 (not 133); all 133 unwrap() calls exist in test code; plan structure revised accordingly |
</phase_requirements>

---

## Summary

Phase 85 eliminates all production `.unwrap()` calls from the Rust crate and enforces the `deny(clippy::unwrap_used)` lint. The CONTEXT.md was accurate about the goal and plan structure but the raw `.unwrap()` counts (133 total) include test code — the `cfg_attr(not(test), deny(...))` lint only fires on production code.

**Critical finding from running `cargo clippy -- -W clippy::unwrap_used` on the current HEAD:** The library has exactly **5 production `.unwrap()` violations** that clippy::unwrap_used fires on (all in `metrics.rs`, `energy_rollup.rs`, and `step_discovery.rs`). The remaining 128 `.unwrap()` calls are all inside `#[cfg(test)]` blocks and are exempt from the lint. The binary crates (`src/bin/`) have zero unwrap_used violations.

This means the per-module plan structure from CONTEXT.md D-01 still holds logically — each plan converts its module's test `.unwrap()` to `.expect("...")` (D-03 requirement) and removes the per-module `#[allow]` — but the actual production code changes are concentrated in **Plans 3 and 5** (metrics.rs and small files). Plans 1, 2, and 4 are D-03 test-quality conversions with allow-block removal.

The `catch_unwind` at the FFI boundary (`goose_bridge_handle_json`) is fully implemented at lines 3101–3119 in bridge.rs and was added in Phase 84. SC2 is already satisfied.

**Primary recommendation:** Follow the 6-plan structure from D-01. Plan 1 adds the deny attribute and converts bridge.rs test `.unwrap()` → `.expect()`. The 5 production violations are fixed in Plans 3 and 5. Plan 6 gates with `cargo clippy --lib -- -D clippy::unwrap_used` and `cargo test --locked`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| clippy lint enforcement | Rust crate (lib) | CI toolchain | `#![cfg_attr]` attribute is crate-level; bin crates are separate compile units |
| Production error propagation | Rust core library (src/*.rs) | — | Only the lib crate is compiled into the iOS static library |
| Test quality / panics | Test modules (`#[cfg(test)]`) | — | `.expect()` gives richer output in `cargo test` failures |
| FFI panic safety | bridge.rs `goose_bridge_handle_json` | — | Prevents Rust panics from crossing the C ABI boundary (UB) |

---

## CRITICAL FINDINGS: Actual Unwrap Count After Phase 84

The CONTEXT.md plan decomposition references the count from before Phase 84. Running clippy on the current codebase produces the following actual state:

### Production Library Violations (clippy fires on these)

| File | Line | Kind | Enclosing function | Conversion approach |
|------|------|------|--------------------|---------------------|
| `metrics.rs` | 1055 | `Option::unwrap()` | `goose_hrv_v0` (`AlgorithmRunResult<HrvOutput>`) | `.expect("timestamps_aligned guard ensures Some")` — a safety comment already exists at this line |
| `metrics.rs` | 2017 | `Option::unwrap()` | `estimate_hrmax_from_history` (returns `Option<f64>`) | `finite` values are pre-filtered to `is_finite()`; `f64::total_cmp` avoids the Option entirely, or `.expect("finite f64 partial_cmp is always Some")` |
| `metrics.rs` | 3609 | `Option::unwrap()` | `sleep_cardiovascular_score` (returns `f64`) | Protected by `if trend_score.is_some()` guard above — refactor to `if let Some(ts) = trend_score` to eliminate the unwrap |
| `energy_rollup.rs` | 1744 | `Option::unwrap()` | validation report loop | `official_label_policy_issue_action(issue)` returns `Option<&'static str>` but is called only inside an `is_some()` guard — same pattern as metrics.rs:3609; use `if let Some(action) = ...` |
| `step_discovery.rs` | 1024 | `Option::unwrap()` | validation report loop | Same `official_label_policy_issue_action` pattern as energy_rollup.rs:1744; use `if let Some(action) = ...` |

**Total production library violations: 5** (not 133)

### Test Code Violations (exempt from deny lint, but D-03 requires .expect conversion)

| File | Test `.unwrap()` count | Scope |
|------|----------------------|-------|
| `bridge.rs` | 46 | All inside `#[cfg(test)] mod tests` (line 9828+) |
| `store.rs` | 62 | All inside `#[cfg(test)]` blocks (first at line 8992) |
| `capabilities.rs` | 8 | All inside `#[cfg(test)]` |
| `openwhoop_reference.rs` | 3 | All inside `#[cfg(test)]` |
| `exercise_detection.rs` | 1 | Inside `#[cfg(test)]` |
| `metrics.rs` | 8 | Inside `#[cfg(test)]` (lines 4430+) |
| `energy_rollup.rs` | 0 | — |
| `step_discovery.rs` | 0 | — |

**Total test `.unwrap()` → `.expect()` conversions (D-03): 128** (confirmed 180 lib unit tests pass today)

### Binary Crate Violations (NOT in scope)

The bin files under `src/bin/` are separate compile units. `cargo clippy -- -W clippy::unwrap_used` on the full workspace shows ZERO `unwrap_used` violations in any binary crate. The bin warnings reported are for other lints (`needless_question_mark`, `too_many_arguments`, `collapsible_str_replace`) — these are out of scope for Phase 85.

---

## Standard Stack

No external packages are added in this phase. All changes use existing crate infrastructure.

### Existing Infrastructure (already present, no install needed)

| Asset | Location | Purpose |
|-------|----------|---------|
| `GooseError` enum | `Rust/core/src/error.rs` | 5 variants: `Message`, `Io`, `Json`, `Hex`, `Sqlite` |
| `GooseResult<T>` type alias | `Rust/core/src/error.rs` | `Result<T, GooseError>` — use in all converted signatures |
| `GooseError::message(impl Into<String>)` | `Rust/core/src/error.rs` | Constructor for `Message` variant — use for all sites not mapping to other variants |
| `GooseError::Sqlite(#[from] rusqlite::Error)` | `Rust/core/src/error.rs` | Auto-conversion for `rusqlite::Error` via `?` |
| `#[cfg_attr(not(test), deny(clippy::unwrap_used))]` | Pattern (not yet in lib.rs) | Applies deny lint only to production code |
| `catch_unwind` at FFI entry | `Rust/core/src/bridge.rs:3101–3119` | Already implemented — Phase 84 |

### Reference Pattern Files (use as implementation models)

- `Rust/core/src/capture_sanitize.rs` — exemplary `GooseError` usage: `map_err(|source| GooseError::io(...))`, `GooseError::message(format!(...))`, `?` propagation
- `Rust/core/src/capture_correlation.rs` — `Err(GooseError::message("..."))` early-return style

---

## Package Legitimacy Audit

This phase installs no external packages. Audit: N/A.

---

## Architecture Patterns

### System Architecture Diagram

```
lib.rs
  └── #![cfg_attr(not(test), deny(clippy::unwrap_used))]   ← Plan 1 adds this
        │
        ├── bridge.rs  ← Plan 1: add #[allow] then remove (46 test .unwrap → .expect)
        ├── store.rs   ← Plan 2: add #[allow] then remove (62 test .unwrap → .expect)
        ├── metrics.rs ← Plan 3: add #[allow] then remove (3 prod fixes + 8 test converts)
        ├── capabilities.rs ← Plan 4: add #[allow] then remove (8 test converts)
        └── small files ← Plan 5: add #[allow] then remove (2 prod fixes + 4 test converts)
              ├── energy_rollup.rs (1 prod, 0 test)
              ├── step_discovery.rs (1 prod, 0 test)
              ├── openwhoop_reference.rs (0 prod, 3 test)
              └── exercise_detection.rs (0 prod, 1 test)

Gate (Plan 6):
  cargo clippy --lib -- -D clippy::unwrap_used → 0 errors
  cargo test --locked --lib → 180 passed
```

### Pattern 1: Allow block placement (Plan 1 through Plan 5)

When adding the deny in lib.rs (Plan 1), every module that still has unconverted test `.unwrap()` gets a file-level `#[allow]`:

```rust
// Source: decision D-04 from 85-CONTEXT.md
// Add at the top of each not-yet-converted module file:
#![allow(clippy::unwrap_used)]
```

Each subsequent plan removes the `#[allow]` from its module after converting.

**Important:** `#![allow(clippy::unwrap_used)]` at file top covers both production and test code in that file. Since the deny in lib.rs uses `cfg_attr(not(test), deny(...))`, the file-level allow is only needed for files that still have production unwrap violations — but for simplicity and per D-04, each module gets an allow at plan start and removes it when conversion is complete.

### Pattern 2: Production Option `.unwrap()` — is_some guard refactor

```rust
// Source: metrics.rs:3609 pattern — before
if trend_score.is_some() {
    let base = ... + trend_score.unwrap() * 0.15;
}

// After (eliminates unwrap, no clippy violation)
if let Some(ts) = trend_score {
    let base = ... + ts * 0.15;
}
```

### Pattern 3: Production Option `.unwrap()` — safety comment sites

```rust
// Source: metrics.rs:1055 pattern — before
// Safety: index is valid because we verified lengths match above.
valid_timestamps.push(working_timestamps_opt.as_ref().unwrap()[i]);

// After (preserves safety reasoning, satisfies clippy)
valid_timestamps.push(
    working_timestamps_opt.as_ref()
        .expect("timestamps_aligned guard ensures Some — lengths verified above")[i]
);
```

### Pattern 4: f64 sort_by — replace partial_cmp with total_cmp

```rust
// Source: metrics.rs:2017 — before
finite.sort_by(|a, b| a.partial_cmp(b).unwrap());

// After (Rust 1.62+ total_cmp on f64, no Option)
finite.sort_by(|a, b| a.total_cmp(b));
```

`f64::total_cmp` is stable since Rust 1.62 and returns `Ordering` directly (no Option). The crate's MSRV is 1.96 (Cargo.toml), so this is safe.

### Pattern 5: Test `.unwrap()` → `.expect("descriptive message")`

```rust
// Before (test code)
let store = GooseStore::open_in_memory().unwrap();

// After (D-03)
let store = GooseStore::open_in_memory().expect("in-memory store should always open");
```

The deny lint is `cfg_attr(not(test), ...)` so test code is exempt. The `.expect()` conversion is a quality improvement only — it fires the same panic but with a human-readable message in test output.

### Pattern 6: `if let` + `official_label_policy_issue_action`

```rust
// Source: energy_rollup.rs:1744 and step_discovery.rs:1024 — before
_ if official_label_policy_issue_action(issue).is_some() => (
    "...",
    official_label_policy_issue_action(issue).unwrap(),  // double call + unwrap
),

// After (single call, no unwrap)
_ if let Some(action) = official_label_policy_issue_action(issue) => (
    "...",
    action,
),
```

Note: `if let` guards in match arms require Rust edition 2024 or `#![feature(let_chains)]` before that. The crate uses `edition = "2024"` (Cargo.toml) and MSRV 1.96, so `if let` guards in match arms are stable.

### Anti-Patterns to Avoid

- **Calling `unwrap_unchecked`:** Never swap `.unwrap()` for `.unwrap_unchecked()` to silence clippy — that is unsound and would introduce UB. Convert to `expect()` or proper error propagation.
- **Panic-in-closure for sort_by:** `sort_by(|a, b| a.partial_cmp(b).unwrap())` panics if NaN is present. Use `total_cmp` which handles NaN deterministically.
- **Double calling `official_label_policy_issue_action`:** The current guard + unwrap pattern calls the function twice. The `if let` refactor eliminates the duplicate call.
- **Removing `clippy::unnecessary_unwrap` from the allow block:** D-05 requires it stays. That lint fires when `.unwrap()` is used after an `is_some()` guard — a different concern from `unwrap_used`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Panic at FFI boundary | Custom signal handlers | `std::panic::catch_unwind` | Already implemented; safe, standard; custom handlers require unsafe and platform-specific code |
| f64 sort with NaN | Manual NaN filter before `partial_cmp` | `f64::total_cmp` | Stable since 1.62, total order on all f64 including NaN, no Option wrapping |
| Error message formatting | Custom error macro | `GooseError::message(format!("..."))` | Already present in crate; consistent serialization |

---

## Key Source Code State (verified against HEAD)

### catch_unwind — already implemented (bridge.rs:3101–3119)

```rust
// Source: Rust/core/src/bridge.rs lines 3101–3119 (verified)
match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
    string_to_c_string(handle_bridge_request_json(request))
})) {
    Ok(ptr) => ptr,
    Err(payload) => {
        let message = payload
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| payload.downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "unknown panic payload".to_string());
        response_to_c_string(&bridge_error("unknown", "panic", message))
    }
}
```

Note: the `.unwrap_or_else(|| "unknown panic payload".to_string())` at line 3116 is `unwrap_or_else` (not `unwrap()`), which clippy::unwrap_used does NOT flag. SC2 is fully satisfied.

### lib.rs existing allow block (lines 1–16)

```rust
// Source: Rust/core/src/lib.rs lines 1–16 (verified)
#![recursion_limit = "256"]
#![allow(
    clippy::too_many_arguments,
    clippy::type_complexity,
    clippy::result_large_err,
    clippy::vec_init_then_push,
    clippy::needless_range_loop,
    clippy::while_let_loop,
    clippy::redundant_closure,
    clippy::redundant_guards,
    clippy::question_mark,
    clippy::unnecessary_unwrap,  // ← D-05: KEEP THIS
    clippy::manual_clamp,
    clippy::if_same_then_else
)]
```

Plan 1 adds `#![cfg_attr(not(test), deny(clippy::unwrap_used))]` as a new top-level attribute **after** this block.

### GooseError definition (error.rs — verified)

```rust
// Source: Rust/core/src/error.rs (verified)
pub enum GooseError {
    Message(String),                          // GooseError::message("...")
    Io { path: PathBuf, source: std::io::Error },  // GooseError::io(path, err)
    Json { path: PathBuf, source: serde_json::Error }, // GooseError::json(path, err)
    Hex(#[from] hex::FromHexError),           // auto via ?
    Sqlite(#[from] rusqlite::Error),          // auto via ?
}
pub type GooseResult<T> = Result<T, GooseError>;
```

---

## Common Pitfalls

### Pitfall 1: Confusing the lint scope — deny vs allow vs cfg_attr

**What goes wrong:** Adding `#![deny(clippy::unwrap_used)]` (without `cfg_attr`) makes the lint apply to test code too, causing hundreds of test failures immediately.

**Why it happens:** `#[cfg(test)]` only gates compilation — the attribute block in lib.rs applies to the entire crate. `cfg_attr(not(test), deny(...))` is the correct idiom to exempt test modules.

**How to avoid:** Always use `#![cfg_attr(not(test), deny(clippy::unwrap_used))]`. Never use `#![deny(clippy::unwrap_used)]` alone in this crate.

**Warning signs:** `cargo test` shows hundreds of errors after adding the deny attribute.

### Pitfall 2: `#[allow]` scoping — file vs item

**What goes wrong:** `#![allow(clippy::unwrap_used)]` (with `!`) at file top applies to the whole file. `#[allow(clippy::unwrap_used)]` (without `!`) applies only to the next item. Using the wrong form when adding per-module allows in Plans 1–5 can leave some code unshielded.

**How to avoid:** Use `#![allow(clippy::unwrap_used)]` (inner attribute, with `!`) at the top of each module file that still has unconverted code.

### Pitfall 3: Binary crate isolation

**What goes wrong:** The developer adds the deny to lib.rs and runs `cargo clippy` (which includes bins) and sees residual warnings from bins — then tries to "fix" them as part of Phase 85.

**Why it happens:** Each binary in `src/bin/` is a separate crate root. Attributes in lib.rs do not propagate to bin crates. The bin files have ZERO `unwrap_used` violations (confirmed by running clippy on current HEAD). The warnings shown for bins are other lint categories (`needless_question_mark`, `too_many_arguments`, etc.).

**How to avoid:** Gate with `cargo clippy --lib -- -D clippy::unwrap_used` (lib only). Do not extend scope to bins.

### Pitfall 4: `partial_cmp` on f64 — do not just `.expect()`

**What goes wrong:** Replacing `a.partial_cmp(b).unwrap()` with `a.partial_cmp(b).expect("...")` still panics on NaN. Since `finite` is pre-filtered to `.is_finite()`, NaN cannot appear — but `.expect()` still leaves a theoretically-reachable panic path that clippy catches if the filter is ever relaxed.

**How to avoid:** Use `f64::total_cmp` which returns `Ordering` directly. It is the correct tool for sorting f64 values.

### Pitfall 5: Double-call pattern in match guards

**What goes wrong:** The `energy_rollup.rs` and `step_discovery.rs` pattern calls `official_label_policy_issue_action(issue)` twice (once in the guard, once in the arm body). Fixing just the unwrap with `.expect()` preserves the double-call.

**How to avoid:** Refactor to `if let Some(action) = official_label_policy_issue_action(issue)` in the match arm guard — this captures the value and eliminates both the double call and the unwrap in one step.

### Pitfall 6: Plan count mismatch with CONTEXT.md

**What goes wrong:** CONTEXT.md Plan 1 assigns bridge.rs (46 production unwraps) but the actual production count for bridge.rs is 0. If a developer follows the plan as written expecting 46 production changes, they will be confused when clippy passes immediately for bridge.rs production code.

**How to avoid:** The planner must acknowledge that bridge.rs Plan 1 is purely a D-03 test-code quality pass (46 test `.unwrap()` → `.expect()`) plus the lib.rs deny attribute + allow blocks. This is still valid work — it satisfies D-03 and sets up the progressive allow-removal structure.

---

## Revised Plan Scope Summary

| Plan | Module | Production fixes | Test conversions | Other |
|------|--------|-----------------|-----------------|-------|
| 1 | bridge.rs | 0 | 46 `.unwrap()` → `.expect()` | Add deny to lib.rs; add `#[allow]` to store.rs, metrics.rs, capabilities.rs, small files |
| 2 | store.rs | 0 | 62 `.unwrap()` → `.expect()` | Remove `#[allow]` from store.rs |
| 3 | metrics.rs | 3 | 8 `.unwrap()` → `.expect()` | Remove `#[allow]` from metrics.rs |
| 4 | capabilities.rs | 0 | 8 `.unwrap()` → `.expect()` | Remove `#[allow]` from capabilities.rs |
| 5 | small files | 2 | 4 `.unwrap()` → `.expect()` | Remove `#[allow]` from energy_rollup.rs, step_discovery.rs, openwhoop_reference.rs, exercise_detection.rs |
| 6 | Gate | — | — | `cargo clippy --lib -- -D clippy::unwrap_used`, `cargo test --locked --lib` |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Rust built-in (`cargo test`) + integration tests in `Rust/core/tests/` |
| Config file | `Rust/core/Cargo.toml` |
| Quick run command | `cargo test --locked --lib` (180 unit tests, ~2s) |
| Full suite command | `cargo test --locked` (unit + 45 integration test files) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-03 SC1 | `deny(clippy::unwrap_used)` passes with 0 violations | lint check | `cargo clippy --lib -- -D clippy::unwrap_used` | ✅ (clippy) |
| ARCH-03 SC2 | catch_unwind exists and routes panics to JSON error | code review | `grep -n 'catch_unwind' Rust/core/src/bridge.rs` | ✅ (bridge.rs:3107) |
| ARCH-03 SC3 | All 180+ lib unit tests pass after changes | unit | `cargo test --locked --lib` | ✅ |

### Sampling Rate

- **Per task commit:** `cargo clippy --lib -- -D clippy::unwrap_used && cargo test --locked --lib`
- **Per wave merge:** `cargo test --locked` (full suite including integration tests)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

None — existing test infrastructure covers all phase requirements. No new test files needed.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes (indirect) | GooseError propagation prevents silent failures on malformed input |
| V6 Cryptography | no | — |
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |

### Threat Patterns Addressed

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Process abort via panic at FFI boundary | Denial of Service | `catch_unwind` at `goose_bridge_handle_json` (already implemented) |
| Silent failure hiding data corruption | Tampering | `GooseResult` propagation forces callers to handle errors explicitly |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain | `cargo clippy`, `cargo test` | ✅ | 1.96 (Cargo.toml MSRV) | — |
| clippy | SC1 lint check | ✅ | bundled with rustup | — |
| `f64::total_cmp` | metrics.rs:2017 fix | ✅ | stable since 1.62 | — |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `if let` guards in match arms are stable in edition 2024 / MSRV 1.96 | Architecture Patterns P6 | The energy_rollup / step_discovery fix would need a different approach (bind before match) |
| A2 | The bin crate warnings from clippy are not `unwrap_used` (verified by reading full clippy output) | Critical Findings | Low risk — verified directly from clippy output this session |
| A3 | 180 lib unit tests is the current count (verified by `cargo test --locked --lib`) | Validation Architecture | CONTEXT.md says 128 — that was the count from a prior state; 180 is confirmed current |

---

## Open Questions

1. **Bin crate warnings (other lints)**
   - What we know: `src/bin/` files have `needless_question_mark`, `too_many_arguments`, etc. warnings that are unrelated to Phase 85.
   - What's unclear: Whether CI will break on `cargo clippy` (all targets) if those bin warnings are not fixed.
   - Recommendation: The gate plan (Plan 6) should scope clippy to `--lib` only, matching the ASVS-03 requirement which is about the library, not the CLI tools.

2. **Integration test suite runtime**
   - What we know: The full `cargo test --locked` suite has 45 integration test files and was not timed in this session (it was taking >60s).
   - What's unclear: Whether integration tests are fast enough to run per-plan or only at the gate.
   - Recommendation: Per-plan verification uses `--lib` (fast, ~2s). Gate plan runs full suite.

---

## Sources

### Primary (HIGH confidence — verified by direct codebase inspection this session)
- `Rust/core/src/bridge.rs` — verified catch_unwind at lines 3101–3119; verified 0 production unwrap_used violations; verified 46 test `.unwrap()` calls (all after line 9828)
- `Rust/core/src/store.rs` — verified 0 production unwrap_used violations; verified 62 test `.unwrap()` calls (all after line 8992)
- `Rust/core/src/metrics.rs` — verified 3 production unwrap_used violations at lines 1055, 2017, 3609
- `Rust/core/src/energy_rollup.rs` — verified 1 production unwrap_used violation at line 1744
- `Rust/core/src/step_discovery.rs` — verified 1 production unwrap_used violation at line 1024
- `Rust/core/src/error.rs` — verified GooseError 5 variants and GooseResult type alias
- `Rust/core/src/lib.rs` — verified existing allow block structure (lines 1–16); deny attribute not yet present
- `cargo clippy -- -W clippy::unwrap_used` — ran on HEAD; confirmed 5 lib violations, 0 bin violations
- `cargo test --locked --lib` — ran on HEAD; confirmed 180 tests pass

### Secondary (MEDIUM confidence)
- [Rust Reference — `f64::total_cmp`](https://doc.rust-lang.org/std/primitive.f64.html#method.total_cmp) — stable since 1.62; MSRV 1.96 satisfies this [ASSUMED: not re-fetched, but MSRV 1.96 > 1.62 is verifiable]
- [Clippy docs — `unwrap_used`](https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unwrap_used) — confirmed from clippy output URL in this session

---

## Metadata

**Confidence breakdown:**
- Unwrap site inventory: HIGH — verified by running clippy on current HEAD
- catch_unwind state: HIGH — read directly from bridge.rs lines 3101–3119
- Plan scope revision: HIGH — derived from verified counts; logic is sound
- Test count: HIGH — confirmed by `cargo test --locked --lib` this session

**Research date:** 2026-06-14
**Valid until:** 2026-07-14 (stable Rust patterns; codebase churn would be the only invalidator)
