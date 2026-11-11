# Phase 110: Code Health — Unwraps + Connection Pool + Bot Audit - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Three independent tracks: (1) eliminate naked `.unwrap()` from Rust production code, (2) replace per-request `Connection::open()` with an r2d2 connection pool, (3) verify and close bot audit findings from issue #59.

**In scope:** `grep -rn '\.unwrap()' Rust/core/src/` → 0 in production; r2d2 pool in Rust bridge; issue #59 audit findings resolved.
**Out of scope:** Test code unwraps (exempt), Swift side, Android.

</domain>

<decisions>
## Implementation Decisions

### Connection pool
- **D-01:** Use **r2d2** crate — already attempted in v13.0 (rusqlite downgraded 0.40→0.39 for r2d2 compatibility). Check if r2d2 is already in Cargo.toml; add if not. Pool size: 4 connections (sensible default for mobile SQLite).
- **D-02:** Replace `GooseStore::open()` per-request call in bridge dispatcher with pool checkout. Pass pool reference through bridge context.

### Unwrap replacement strategy
- **D-03:** `expect("invariant: …")` for calls that are logically infallible (e.g. mutex lock, known-good literals, post-validation data). `?` for error-propagation paths. Never silent `.unwrap()`.
- **D-04:** `#[cfg_attr(not(test), deny(clippy::unwrap_used))]` already in crate — verify it passes after replacements.

### Bot audit (#59)
- **D-05:** Read issue #59 to extract exact findings. Verify each against HEAD. Fix genuine bugs; document false positives; close #59.
- **D-06:** Neutral language in issue #59 comment — no audit tool names.

### Claude's Discretion
- Whether r2d2 is already in Cargo.toml (check before adding)
- Wave ordering: unwraps first (1 plan), then pool (1 plan), then bot audit (1 plan) — or combine if simple

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Rust crate config
- `Rust/core/Cargo.toml` — check for r2d2 and rusqlite versions
- `Rust/core/src/store/mod.rs` — GooseStore::open(); connection management
- `Rust/core/src/bridge/mod.rs` — dispatcher; per-request store open() calls

### Existing clippy gate
- `Rust/core/src/lib.rs` — `#[cfg_attr(not(test), deny(clippy::unwrap_used))]`

### Bot audit
- GitHub issue #59 — bot audit findings to verify and close

</canonical_refs>

<code_context>
## Existing Code Insights

### Unwrap status
- `clippy::unwrap_used` deny is already in lib.rs for non-test code
- Phase 85 (Rust Crash Safety) fixed most unwraps in bridge.rs/store.rs — remaining 38 noted in SEED-004
- Run `grep -rn '\.unwrap()' Rust/core/src/ --include='*.rs'` to get current count

### Connection pool
- GooseStore wraps `Arc<Mutex<Connection>>` — single connection with mutex
- r2d2 would replace the mutex with a pool of connections
- v13.0 downgraded rusqlite from 0.40 to 0.39 specifically for r2d2 compat

</code_context>

<specifics>
## Specific Ideas

- r2d2 pool init: `r2d2::Pool::builder().max_size(4).build(manager)?`
- expect format: `expect("invariant: GooseStore mutex not poisoned")` — describes the safety assumption
- Bot audit #59: likely `let_chains`, `partial_plan_state` completeness, `EnergyCaptureValidationReport` — verify each finding in HEAD

</specifics>

<deferred>
## Deferred Ideas

- Async connection pool (deadpool) — synchronous bridge doesn't need it
- Android connection pool — separate concern

</deferred>

---

*Phase: 110-code-health-unwraps-connection-pool-bot-audit*
*Context gathered: 2026-06-21*
