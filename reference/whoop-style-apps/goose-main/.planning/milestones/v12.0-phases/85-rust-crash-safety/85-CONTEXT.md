# Phase 85: Rust Crash Safety - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate all 133 production `.unwrap()` calls from the Rust crate and enforce the
`deny(clippy::unwrap_used)` lint so future code cannot reintroduce them. Every former
`.unwrap()` site returns `Result<_, GooseError>` with a specific error variant or a
descriptive `GooseError::message(...)`.

**Key finding:** `catch_unwind` at the FFI bridge entry point (`goose_bridge_handle_json`)
is **already implemented** (added in Phase 84, bridge.rs lines 3101–3119). SC2 of the
ROADMAP success criteria is already satisfied — no new work needed there.

**Scope:**
- 133 production `.unwrap()` calls in: `bridge.rs` (46), `store.rs` (62), `metrics.rs` (11),
  `capabilities.rs` (8), `openwhoop_reference.rs` (3), `step_discovery.rs` (1),
  `exercise_detection.rs` (1), `energy_rollup.rs` (1).
- Add `#![cfg_attr(not(test), deny(clippy::unwrap_used))]` to `lib.rs` from the start
  (Plan 1), with per-module `#[allow(clippy::unwrap_used)]` on unconverted modules.
  Each subsequent plan removes the allow from its module.
- Convert test code `.unwrap()` → `.expect("descriptive message")` for clearer test panics.
- Gate plan confirms zero clippy violations + `cargo test --locked` passes.

**Out of scope:** New GooseError variants beyond the existing 5; bridge.rs structural
split (Phase 86); store.rs structural split (Phase 87); any Swift changes.

</domain>

<decisions>
## Implementation Decisions

### GooseError Variants (D-02)
- **D-02:** Use `GooseError::message(format!("..."))` for all `.unwrap()` sites that do
  not fit the existing variants (`Io`, `Json`, `Hex`, `Sqlite`). No new GooseError variants
  added — the existing 5 variants are sufficient. Sites in `store.rs` that call
  `row.get(N)` already return `rusqlite::Error` which maps to `GooseError::Sqlite` via
  the `#[from]` impl.

### Test Code (D-03)
- **D-03:** Convert test `.unwrap()` to `.expect("descriptive message")` for clearer
  panic messages in test failures. This is outside the `deny` gate (which is
  `cfg_attr(not(test), ...)`) but improves debuggability.

### Deny Attribute Strategy (D-04)
- **D-04:** Add `#![cfg_attr(not(test), deny(clippy::unwrap_used))]` to `lib.rs` in
  **Plan 1** (not the gate plan). Each unconverted module gets `#[allow(clippy::unwrap_used)]`
  at the top of the file. Each subsequent plan removes the allow from its module after
  converting. The gate plan (Plan 6) confirms all allows have been removed.
  This approach is more disciplined — the lint is active from day 1 and the allow list
  visibly shrinks with each plan.

### Existing Allow List (D-05)
- **D-05:** Keep `clippy::unnecessary_unwrap` in the existing `#![allow(...)]` block in
  `lib.rs`. It is a different lint (fires when `.unwrap()` is called after `is_some()`
  — i.e., unnecessary safety), not related to banning all unwraps. Do not remove it.

### catch_unwind (D-06)
- **D-06:** The `catch_unwind` wrapping `goose_bridge_handle_json` is already implemented
  (Phase 84). ROADMAP SC2 is already satisfied. The planning agent must NOT add a plan
  to implement catch_unwind — only verify it exists in the gate plan.

### Claude's Discretion
- **Plan structure (D-01):** 1 plan per module, 6 plans total (bridge.rs, store.rs, metrics.rs, capabilities.rs, small files, gate) — the planner chose this breakdown; executors follow the existing plan files.
- Exact error message text for each `.unwrap()` site (descriptive context per call site)
- Whether Option `.unwrap()` sites use `.ok_or_else(|| GooseError::message(...))` or
  `.ok_or(GooseError::message(...))` based on performance context
- Whether to use `?` propagation or explicit `map_err` chains per site
- Module-level allow placement (file-top vs. `#[allow]` on specific impl blocks)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Success Criteria
- `.planning/REQUIREMENTS.md` — ARCH-03 (the Phase 85 requirement): 133 unwrap() → Result,
  deny(clippy::unwrap_used), catch_unwind gate
- `.planning/ROADMAP.md` Phase 85 section — 3 success criteria with exact wording;
  note SC2 (catch_unwind) is already satisfied

### Existing Error Infrastructure
- `Rust/core/src/error.rs` — GooseError enum with 5 variants (Message, Io, Json, Hex, Sqlite)
  + GooseResult type alias; read this before planning any new error conversions

### Bridge Entry Point (already has catch_unwind)
- `Rust/core/src/bridge.rs` lines 3081–3119 — `goose_bridge_handle_json` with catch_unwind
  already implemented; verify it exists in the gate plan but do NOT reimplement

### Crate Configuration
- `Rust/core/src/lib.rs` lines 1–17 — existing `#![allow(...)]` block; Plan 1 adds
  `deny(clippy::unwrap_used)` here while preserving `unnecessary_unwrap` in the allow list

### Target Files (by unwrap count)
- `Rust/core/src/store.rs` — 62 unwraps (Plan 2)
- `Rust/core/src/bridge.rs` — 46 unwraps (Plan 1)
- `Rust/core/src/metrics.rs` — 11 unwraps (Plan 3)
- `Rust/core/src/capabilities.rs` — 8 unwraps (Plan 4)
- `Rust/core/src/openwhoop_reference.rs` — 3 unwraps (Plan 5)
- `Rust/core/src/energy_rollup.rs`, `exercise_detection.rs`, `step_discovery.rs` — 1 each (Plan 5)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GooseError::message(format!("..."))` — use for all sites that don't map to Io/Json/Hex/Sqlite
- `GooseError::Sqlite(#[from] rusqlite::Error)` — `store.rs` `row.get(N)` calls already
  propagate via `?` once the function signature returns `GooseResult`
- `GooseResult<T>` type alias — use in all converted function signatures

### Established Patterns
- `capture_sanitize.rs` and `capture_correlation.rs` already use `GooseError` correctly
  (map_err, ?, GooseError::message) — use as reference for the conversion pattern
- `#[cfg_attr(not(test), deny(...))]` — existing pattern in Rust ecosystem; mirrors the
  project's existing `#![allow(...)]` approach for graduated lint adoption

### Integration Points
- Each converted module must compile with `cargo build` before the next plan runs
- Gate plan runs `cargo clippy -- -D warnings` equivalent to confirm zero violations
- `cargo test --locked` must pass after Plan 6 (all 128 existing tests green)

</code_context>

<specifics>
## Specific Ideas

- Plans are per-module so each diff is reviewable independently
- Deny attribute added in Plan 1 with per-module allows — allows shrink progressively
- Test code converted to `.expect("message")` (not subject to the deny lint but improves
  test failure readability)
- Gate plan (Plan 6) is a verification-only plan: no production code changes, only
  confirms the lint and test suite pass

</specifics>

<deferred>
## Deferred Ideas

- **New GooseError variants** (e.g., `ParseError`, `IndexError`) — not needed for this
  phase; GooseError::message is sufficient and avoids variant explosion. Deferred.
- **cargo clippy -D warnings for CI** — enforcing the deny lint in CI config is out of
  scope for Phase 85 (which focuses on source changes only). Future milestone.

</deferred>

---

*Phase: 85-Rust Crash Safety*
*Context gathered: 2026-06-14*
