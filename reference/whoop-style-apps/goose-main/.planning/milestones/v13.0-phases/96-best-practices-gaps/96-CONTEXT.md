# Phase 96: Best Practices Gaps - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Two orthogonal best-practice fixes:
1. **BP-01 (Swift):** Replace all 9 silent `try?` bridge calls with `do/catch` + `ble.record(level:.error, ...)`. Failures must be logged, not swallowed.
2. **BP-02 (Rust):** Replace per-request `Connection::open()` in bridge handlers with a `r2d2 + r2d2_sqlite` connection pool. Eliminates reconnect overhead on every bridge call.

No new features. No schema changes.

</domain>

<decisions>
## Implementation Decisions

### Rust Connection Pool (BP-02)
- **D-01:** Use `r2d2` + `r2d2_sqlite` crates. Adds 2 cargo dependencies. Proper pool with configurable `max_size`.
- **D-02:** Pool initialised once at bridge startup (or lazily on first call) — not per-request. Pool size: start with `max_size = 1` (SQLite is single-writer by default) unless WAL mode is confirmed enabled. Researcher confirms pool_size.
- **D-03:** Pool stored in a `static` or `OnceLock<Pool<SqliteConnectionManager>>` — FFI bridge handlers borrow from it rather than opening a fresh connection per call.
- **D-04:** Existing `database_path` arg in bridge calls used to initialise the pool. If `database_path` changes between calls (edge case), the pool is reinitialised.

### Swift Error Logging (BP-01)
- **D-05:** Replace every `try? bridge.request(...)` with `do { try bridge.request(...) } catch { ble.record(level: .error, message: "<method>: \(error)") }` where `<method>` is the bridge method name string (e.g., `"metrics.daily_recovery"`).
- **D-06:** Use `ble.record(level: .error, ...)` — the existing logging mechanism already in place. Do NOT introduce OSLog or a new subsystem.
- **D-07:** 9 silent `try?` calls total across Swift codebase. Researcher locates all 9 exact call sites before planning.
- **D-08:** Each `catch` block must log and then `return` or handle gracefully — no propagation to caller (matches existing pattern where `try?` was used).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Swift (BP-01)
- `GooseSwift/*.swift` — search `try?` in all Swift files for the 9 silent bridge call sites
- `GooseSwift/GooseBLEClient.swift` or equivalent — `ble.record(level:message:)` logging method signature
- `.planning/REQUIREMENTS.md` §BP-01

### Rust (BP-02)
- `Rust/core/Cargo.toml` — add `r2d2` and `r2d2_sqlite` dependencies
- `Rust/core/src/bridge/` — locate per-request `Connection::open()` calls in all bridge domain files
- `Rust/core/src/store/mod.rs` — existing GooseStore pattern (connection ownership)
- `.planning/REQUIREMENTS.md` §BP-02
- `.planning/seeds/SEED-007-swift-rust-best-practices-gaps.md` — original seed with context

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ble.record(level: .error, message: ...)` — existing logging API; no new infrastructure needed
- `GooseRustBridge.request(method:args:)` — bridge call pattern; surrounds with `do/catch`
- `r2d2` and `r2d2_sqlite` — standard Rust crates; `r2d2_sqlite` wraps rusqlite's `Connection`

### Established Patterns
- Existing `do/try/catch` usage in Swift for network calls — same pattern for bridge calls
- Rust bridge handlers currently call `Connection::open(&database_path)?` inside each function — this is the pattern to replace

### Integration Points
- BP-01 is Swift-only; BP-02 is Rust-only. No cross-language changes.
- Both plans can run in parallel (different files, different languages).

</code_context>

<specifics>
## Specific Ideas

- Log format: `"metrics.daily_recovery: \(error)"` — method name first, then error description. Searchable in Xcode console.
- r2d2 `max_size = 1` safe default: SQLite without WAL mode is single-writer. If WAL mode enabled (check pragmas), can increase to 4-8 for concurrent readers.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 96-Best Practices Gaps*
*Context gathered: 2026-06-20*
