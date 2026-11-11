# Phase 86: bridge.rs Split + Protocol Comments - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Split bridge.rs (11 186 lines, 33 method namespaces, ~699 match arms) into a thin routing layer (≤ 100 lines) + 5 domain handler files in a `bridge/` subdirectory. Add offset comments at every non-obvious WHOOP wire-format decode site throughout bridge.rs and the new domain files.

**Out of scope:** store.rs split (Phase 87), Swift changes, new bridge methods, behaviour changes.

</domain>

<decisions>
## Implementation Decisions

### Dispatch Mechanism (D-02)
- **D-02:** Dispatch via `pub(crate)` functions per domain — no `BridgeRouter` trait. Each domain file exposes one function: `pub(crate) fn dispatch_metrics(method: &str, args: &serde_json::Value, db: &str) -> BridgeResult`. bridge.rs calls these directly. ROADMAP says "or equivalent dispatch mechanism" — plain functions qualify. No trait overhead, idiomatic Rust.

### Namespace Grouping — 5 Files (D-01)
- **D-01:** 33 namespaces mapped to 5 domain files:

| Target file | Namespaces |
|-------------|-----------|
| `Rust/core/src/bridge/metrics.rs` | `metrics.*`, `metric_series.*`, `exercise.*`, `biometrics.*`, `battery.*`, `calibration.*`, `openwhoop.*`, `diagnostics.*` |
| `Rust/core/src/bridge/sleep.rs` | `sleep.*`, `overnight.*`, `health_sync.*` |
| `Rust/core/src/bridge/capture.rs` | `capture.*`, `protocol.*`, `historical_sync.*`, `sync.*`, `ios.*` |
| `Rust/core/src/bridge/activity.rs` | `activity.*`, `workout.*`, `apple_daily.*`, `journal.*`, `timeline.*` |
| `Rust/core/src/bridge/debug.rs` | `debug.*`, `commands.*`, `core.*`, `settings.*`, `storage.*`, `store.*`, `export.*`, `upload.*`, `privacy.*`, `ui_coverage.*`, `device.*` |

Planner may adjust attribution if cross-module dependencies force a different grouping — this mapping is the target, not a hard constraint.

### Protocol Comment Scope (D-03)
- **D-03:** Comment ALL non-obvious WHOOP wire-format decode sites — not only the 3 sites specified in ROADMAP SC3 (Event-48 battery, cmd 26 response, R22 battery_pct). Every byte-offset parse that is not self-evident from field names should carry: offset, data type, value interpretation, empirical verification date, source reference (Ghidra / BTSnoop). SEED-005 principle: comment WHY not WHAT; wire offsets are exactly that.

### Claude's Discretion
- Exact line threshold for the new bridge.rs router (ROADMAP says ≤ 100 lines; aim for ≤ 80 to leave headroom)
- Whether to use `mod bridge { mod metrics; ... }` inline in bridge.rs or a separate `bridge/mod.rs`
- Order of domain function arguments (db path first vs. last — follow existing bridge helper conventions)
- Whether `BridgeResult` type alias is defined in `bridge/mod.rs` or kept in bridge.rs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Success Criteria
- `.planning/ROADMAP.md` Phase 86 — 4 success criteria; note SC2 says "BridgeRouter trait (or equivalent)" → D-02 selects "equivalent" (plain functions)
- `.planning/REQUIREMENTS.md` — ARCH-01 (bridge.rs split), COMM-01 (protocol offset comments)

### Existing Rust Module Structure
- `Rust/core/src/bridge.rs` — current monolith (11 186 lines); read the BRIDGE_METHODS const array (lines 184–300 approx) for full namespace list before planning
- `Rust/core/src/lib.rs` — crate root; shows existing module declarations; new `mod bridge;` must be added here or kept as is if bridge.rs stays the crate root entry for the bridge module
- `Rust/core/src/error.rs` — `GooseError` + `GooseResult`; domain handlers return `GooseResult`

### Phase 85 Dependency (must be complete)
- `.planning/phases/85-rust-crash-safety/85-VERIFICATION.md` — confirms `deny(clippy::unwrap_used)` active; domain handler files inherit this lint automatically
- Phase 85 established: no `.unwrap()` in production code; all new handler code must use `?` or `.map_err()`

### Protocol Decode Reference (for COMM-01 comments)
- `.planning/phases/84-gen4-battery/84-01-SUMMARY.md` — Event-48 payload layout (offset 17 u16 LE /10, raw ≤ 1100 guard) and cmd 26 response layout (payload[2..4] u16 LE /10, count ≥ 4 guard) — empirically verified 2026-06-14
- `.planning/phases/83-protocol-architecture-refactor-gen4-gen5-capability-model/83-CONTEXT.md` — R22 battery_pct field and WireProtocol context

### Codebase Convention
- `CLAUDE.md` §Code Style — Rust Edition 2024, MSRV 1.96; no new dependencies without explicit approval

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GooseResult` / `GooseError` in `error.rs` — return type for all domain dispatch functions
- `bridge_error(method, code, message)` helper in bridge.rs — reuse in domain files for consistent error shaping
- `parse_args!(args, field)` or equivalent arg extraction macros in bridge.rs — carry into domain files

### Established Patterns
- Match-on-string-prefix dispatch: current bridge.rs matches `"activity.create_session"` etc. — domain functions continue this pattern within their namespace
- `database_path` arg convention: always extracted from args as `&str` and passed to store methods — preserve in domain functions
- `catch_unwind` at FFI entry in `goose_bridge_handle_json` (Phase 84) — stays in bridge.rs router, not duplicated in domain files

### Integration Points
- `Rust/core/src/lib.rs` — must declare `mod bridge` (or keep existing declaration if bridge.rs becomes `bridge/mod.rs`)
- Integration tests in `Rust/core/tests/` call bridge via the C FFI — no test changes needed if public symbol `goose_bridge_handle_json` is unchanged
- CI: `cargo test --locked` on ubuntu-latest and macos-15; `cargo clippy --lib`; both must pass

</code_context>

<specifics>
## Specific Ideas

- bridge.rs router should be read like a table of contents: `"activity.*" => dispatch_activity(method, args, db)` — instantly navigable
- Protocol offset comments format (per ROADMAP SC3): `// offset 17: u16 LE, battery_pct = raw / 10; raw ≤ 1100 guard; empirically verified 2026-06-14 via Ghidra + BTSnoop`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 86-bridge-rs-split-protocol-comments*
*Context gathered: 2026-06-15*
