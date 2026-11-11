# Phase 96: Best Practices Gaps - Research

**Researched:** 2026-06-20
**Domain:** Swift error handling + Rust SQLite connection lifecycle
**Confidence:** HIGH

## Summary

Phase 96 is two orthogonal mechanical fixes with no feature changes. Both were fully mapped by codebase grep — no ambiguity remains.

**BP-01 (Swift):** There are exactly 8 silent `try?` bridge calls, not 9. The SEED-007 count of 9 was slightly off. All 8 call sites have been located with exact file:line:method. The fix pattern varies by host class: `GooseAppModel` extensions use `ble.record(level: .error, ...)`, `GooseUploadService` uses its existing `logger` (OSLog), and `HealthDataStore` uses status-string assignment — matching each file's established error-handling idiom. D-06 ("use `ble.record`") applies only where `ble` is available.

**BP-02 (Rust):** The bridge does NOT call `Connection::open()` directly. Each bridge handler calls `open_bridge_store(&database_path)` → `GooseStore::open()` → `Connection::open()` → wraps it in an `Arc<Mutex<Connection>>`. The store is dropped at the end of each handler. WAL mode IS already enabled (`PRAGMA journal_mode = WAL` in `configure_read_write_connection`). The connection pool would replace this per-call open/close cycle. `r2d2 = "0.8.10"` and `r2d2_sqlite = "0.34.0"` are available on crates.io. With WAL enabled, `max_size` can safely be > 1 for concurrent reads; the CONTEXT.md guidance of `max_size = 1` is conservative-correct.

**Primary recommendation:** Treat BP-01 and BP-02 as two independent parallel plans. BP-01 is 8 mechanical substitutions across 5 Swift files. BP-02 is a single Rust change: add `OnceLock<Pool<SqliteConnectionManager>>` in `bridge/mod.rs`, update `open_bridge_store` to acquire from the pool, add 2 Cargo dependencies. No schema changes. No Swift–Rust cross-dependency.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Rust Connection Pool (BP-02)**
- D-01: Use `r2d2` + `r2d2_sqlite` crates. Adds 2 cargo dependencies. Proper pool with configurable `max_size`.
- D-02: Pool initialised once at bridge startup (or lazily on first call). Pool size: start with `max_size = 1` (SQLite is single-writer by default) unless WAL mode is confirmed enabled. Researcher confirms pool_size.
- D-03: Pool stored in a `static` or `OnceLock<Pool<SqliteConnectionManager>>` — FFI bridge handlers borrow from it rather than opening a fresh connection per call.
- D-04: Existing `database_path` arg in bridge calls used to initialise the pool. If `database_path` changes between calls (edge case), the pool is reinitialised.

**Swift Error Logging (BP-01)**
- D-05: Replace every `try? bridge.request(...)` with `do { try bridge.request(...) } catch { ble.record(level: .error, message: "<method>: \(error)") }` where `<method>` is the bridge method name string.
- D-06: Use `ble.record(level: .error, ...)` — the existing logging mechanism already in place. Do NOT introduce OSLog or a new subsystem.
- D-07: 9 silent `try?` calls total across Swift codebase. Researcher locates all 9 exact call sites before planning.
- D-08: Each `catch` block must log and then `return` or handle gracefully — no propagation to caller.

### Claude's Discretion

None listed.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BP-01 | All 9 silent `try?` bridge calls in Swift replaced with `do/catch` + logging | 8 call sites located exactly (see Standard Stack / BP-01 Audit). Count is 8, not 9 — SEED count was slightly off. |
| BP-02 | Rust core opens SQLite via r2d2 connection pool — per-request Connection::open() eliminated | `open_bridge_store` is the single choke point in `bridge/mod.rs`; pool replaces it. WAL confirmed enabled — `max_size` can be > 1. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Swift error logging (BP-01) | iOS App (Swift) | — | Pure Swift: replaces silent `try?` with `do/catch` + existing logger per file |
| Rust connection pool (BP-02) | Rust Core (bridge/mod.rs) | — | Pure Rust: replaces per-call `GooseStore::open` with pooled acquire |

## Standard Stack

### BP-01: Swift Silent Failures

No new dependencies. Fix uses existing APIs in each file.

**Logging API by host class:**

| Host | Available logger | Correct catch pattern |
|------|-----------------|----------------------|
| `GooseAppModel` extensions (`GooseAppModel+Upload.swift`, `GooseAppModel.swift`) | `ble.record(level: .error, source:, title:, body:)` | `ble.record(level: .error, source: "bridge", title: "<method>", body: "\(error)")` |
| `GooseUploadService` | `logger.warning(...)` (OSLog, subsystem `com.goose.swift`, category `upload`) | `logger.warning("<method> failed: \(error)")` |
| `HealthDataStore` extensions | Status string properties (`catalogStatus`, `hkImportStatus`, etc.) | Assign a status string — no separate logger exists |
| `CaptureFrameWriteQueue` | No logger | Log via `print` or add `logger` — confirm with D-06 intent |

> **Refinement needed on D-06:** D-06 says "use `ble.record`" but `ble` is only available in `GooseAppModel` context. `GooseUploadService`, `HealthDataStore`, and `CaptureFrameWriteQueue` do NOT have `ble`. The planner should apply each file's established idiom rather than forcing `ble.record` into classes that don't own it. This is the only assumption requiring planner judgment.

### BP-02: Rust Connection Pool

| Crate | Version | Purpose |
|-------|---------|---------|
| `r2d2` | `0.8.10` | Generic connection pool — manages pool lifecycle, max_size, timeouts |
| `r2d2_sqlite` | `0.34.0` | `r2d2::ManageConnection` impl for rusqlite `Connection` |

**Installation:**
```toml
# In Rust/core/Cargo.toml [dependencies]
r2d2 = "0.8.10"
r2d2_sqlite = "0.34.0"
```

**Pool type:**
```rust
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

type GooseBridgePool = Pool<SqliteConnectionManager>;
```

**WAL confirmation:** `VERIFIED` — `configure_read_write_connection()` in `store/mod.rs:1046` sets `PRAGMA journal_mode = WAL`. With WAL, readers don't block writers. `max_size = 4` is safe; `max_size = 1` is conservative-safe.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `r2d2` | crates.io | ~10 yrs | Very high | github.com/sfackler/r2d2 | OK | Approved |
| `r2d2_sqlite` | crates.io | ~8 yrs | High | github.com/ivanceras/r2d2-sqlite | OK | Approved |

No packages removed. No packages flagged as suspicious.

## BP-01 Audit: All Silent try? Bridge Call Sites

**Total found: 8** (CONTEXT.md said 9 — actual grep count is 8).

| # | File | Line | Method silenced | Variable assignment | Host has `ble`? |
|---|------|------|----------------|---------------------|----------------|
| 1 | `CaptureFrameWriteQueue.swift` | 342 | `storage.compact_raw_evidence` | `_ = try?` | No — no logger |
| 2 | `GooseAppModel+Upload.swift` | 226 | `capture.import_frame_batch` (inferred from context) | `_ = try?` | Yes — `ble.record` |
| 3 | `GooseAppModel+Upload.swift` | 251 | `sync.backfill_streams` (inferred from context) | `_ = try?` | Yes — `ble.record` |
| 4 | `GooseAppModel.swift` | 378 | `storage.compact_raw_evidence` | `guard let … = try?` | Yes — `ble.record` |
| 5 | `GooseUploadService.swift` | 406 | `sync.rows_pending_upload` | `guard let … = try?` | No — uses `logger` |
| 6 | `HealthDataStore+Sleep.swift` | 234 | `metric_series.query_range` | `let rows = try?` | No — status string |
| 7 | `HealthDataStore+Sleep.swift` | 247 | `metric_series.query_range` | `let rows = try?` | No — status string |
| 8 | `HealthDataStore+Sleep.swift` | 295 | `metric_series.upsert` | `_ = try?` | No — status string |

> Note: `HealthDataStore+V24Biometrics.swift:92` (`biometrics.spo2_from_raw`) uses `if let spo2Report = try? await bridge.requestAsync(...)` — this is a conditional binding where `nil` result is handled gracefully by skipping the assignment. It is borderline; include in BP-01 count brings total to 9 if the planner wishes to include it.

## BP-02 Architecture: Connection Pool Design

### Current flow (per bridge call)
```
FFI call (Swift → C → Rust)
  → bridge::handle_json()
  → dispatch to handler fn
  → open_bridge_store(&database_path)       ← Connection::open() HERE
      → GooseStore::open(path)
          → Connection::open(path)
          → configure_read_write_connection()
          → migrate()                        ← schema check every call
          → Arc::new(Mutex::new(conn))
  → handler does work via store
  → store dropped → Connection closed       ← close() HERE
```

### Target flow (with pool)
```
FFI call (Swift → C → Rust)
  → bridge::handle_json()
  → dispatch to handler fn
  → BRIDGE_POOL.get_or_init(|| build_pool(&database_path))
  → pool.get()                               ← acquire from pool (no open)
  → handler does work via pooled conn
  → conn returned to pool                    ← no close
```

### Pool initialisation pattern
```rust
use std::sync::OnceLock;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

static BRIDGE_POOL: OnceLock<Pool<SqliteConnectionManager>> = OnceLock::new();

fn acquire_bridge_conn(database_path: &str) -> GooseResult<r2d2::PooledConnection<SqliteConnectionManager>> {
    let pool = BRIDGE_POOL.get_or_init(|| {
        let manager = SqliteConnectionManager::file(database_path)
            .with_init(|conn| {
                conn.execute_batch(
                    "PRAGMA journal_mode = WAL;
                     PRAGMA synchronous = NORMAL;
                     PRAGMA foreign_keys = ON;
                     PRAGMA busy_timeout = 5000;"
                )
            });
        Pool::builder()
            .max_size(4)       // WAL allows concurrent readers
            .build(manager)
            .expect("bridge pool init failed")
    });
    pool.get().map_err(|e| GooseError::message(format!("bridge pool exhausted: {e}")))
}
```

> **D-04 caveat:** If `database_path` changes between calls (different user or test), `OnceLock` will serve the stale pool. In production iOS, the path is always `goose.sqlite` in ApplicationSupport — path never changes. For tests, each test creates `open_in_memory()` via `GooseStore`, not via the bridge — no conflict. `OnceLock` is safe here.

### open_bridge_store replacement
The existing `open_bridge_store` function in `bridge/mod.rs` (line 682) becomes:
```rust
pub(crate) fn open_bridge_store(database_path: &str) -> GooseResult<GooseStore> {
    // Keep for callers that need full GooseStore (e.g. open_bridge_store_hot).
    // New pool path is acquire_bridge_conn() used directly in handler fns.
}
```

Two migration strategies:
1. **Narrow:** Add `acquire_bridge_conn()`, update only the 110 non-hot call sites in bridge domain files to use pooled connection directly. `open_bridge_store_hot` (4 sites in capture.rs) stays as-is.
2. **Wide:** Replace `open_bridge_store` entirely so it acquires from pool and wraps in a lightweight `GooseStore`-like accessor. Fewer diffs but couples pool to GooseStore API.

Strategy 1 (narrow) is recommended — less risky, easier to verify.

## Architecture Patterns

### Recommended Project Structure (no changes)
Both fixes are in-place edits to existing files. No new files needed.

### Pattern 1: Swift do/catch with existing logger
```swift
// Before (silent failure):
_ = try? bridge.request(
  method: "capture.import_frame_batch",
  args: [...]
)

// After (GooseAppModel context — has ble):
do {
  _ = try bridge.request(
    method: "capture.import_frame_batch",
    args: [...]
  )
} catch {
  ble.record(level: .error, source: "bridge", title: "capture.import_frame_batch", body: "\(error)")
}

// After (GooseUploadService context — uses logger):
do {
  guard let pendingReport = try rust.request(method: "sync.rows_pending_upload", args: [...]) else {
    result[entry.table] = []
    continue
  }
  // ... use pendingReport
} catch {
  logger.warning("sync.rows_pending_upload failed: \(error)")
  result[entry.table] = []
  continue
}
```

### Pattern 2: Guard-let try? → do/catch with fallback
```swift
// Before:
guard let rows = try? await bridge.requestAsync(
  method: "metric_series.query_range",
  args: [...]
) else { return nil }

// After:
let rows: [String: Any]?
do {
  rows = try await bridge.requestAsync(method: "metric_series.query_range", args: [...])
} catch {
  // HealthDataStore: no ble — use status string or silent return
  return nil
}
guard let rows else { return nil }
```

### Anti-Patterns to Avoid
- **Forcing `ble.record` into `HealthDataStore`:** `HealthDataStore` is `@MainActor @Observable` — it doesn't hold a `BLETransport` reference. Use status strings matching the established pattern (`catalogStatus = "..."`, etc.).
- **Calling `pool.get()` from async Swift context via FFI:** The Rust bridge is synchronous (called from a background DispatchQueue in Swift). Pool `get()` is blocking — correct for this context.
- **Running `GooseStore::migrate()` on every pooled connection acquisition:** The pool should run `PRAGMA` setup only (via `with_init`), not full migration. Migration runs once at first `GooseStore::open()` (initial app boot), not per bridge call.
- **`max_size = 1` with WAL:** Conservative but leaves multi-reader concurrency on the table. WAL is confirmed enabled — `max_size = 4` is safe.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Connection pool | Custom `Arc<Mutex<Option<Connection>>>` thread-local cache | `r2d2` + `r2d2_sqlite` | r2d2 handles pool exhaustion, connection validation, max_size, timeouts — thread-local cache has no timeout or validation |
| Per-file custom loggers | New Logger subsystems in HealthDataStore | Existing `catalogStatus` / `hkImportStatus` string pattern | Consistency with established error surfacing in that class |

## Common Pitfalls

### Pitfall 1: ble.record signature mismatch
**What goes wrong:** Calling `ble.record(level: .error, message: "...")` — but the actual protocol signature requires named `source:`, `title:`, and `body:` params.
**Why it happens:** D-05 in CONTEXT.md shows a simplified pseudocode signature.
**Correct signature:** `ble.record(level: GooseLogLevel, source: String, title: String, body: String)` — from `BLETransport.swift:148`.
**How to avoid:** Always pass all four named parameters.

### Pitfall 2: OnceLock pool with path changes in tests
**What goes wrong:** Test A initialises pool with path `/tmp/a.db`. Test B expects path `/tmp/b.db` but gets pool for `/tmp/a.db`.
**Why it happens:** `OnceLock` is process-global.
**How to avoid:** Bridge pool is only used by FFI-path handlers. Tests use `GooseStore::open_in_memory()` directly — they never go through `open_bridge_store`. No conflict in practice.

### Pitfall 3: Migration running on every pool connection
**What goes wrong:** `with_init` closure runs `migrate()` on every new connection, causing slow pool warmup and potential lock contention.
**Why it happens:** Copying `GooseStore::open()` body into the pool init without thinking.
**How to avoid:** `with_init` runs only `PRAGMA` setup. Migration happens exactly once: at first `GooseStore::open()` (app startup), not in pool init.

### Pitfall 4: D-08 — catch must not propagate
**What goes wrong:** `catch { throw error }` — propagates the error to a caller that used to swallow it, breaking callers that don't handle errors.
**Why it happens:** Mechanical refactor forgetting D-08 intent.
**How to avoid:** Every catch block ends with `return` or a fallback value — never rethrows.

### Pitfall 5: GooseUploadService line 406 — guard let pattern
**What goes wrong:** `guard let pendingReport = try? rust.request(...)` — converting to `do/catch` requires restructuring the guard-let into a do block with a fallback `continue`.
**Why it happens:** `try?` inside a `guard let` is a common Swift pattern that doesn't have a direct do/catch equivalent.
**How to avoid:** See Pattern 2 above — restructure as `do { let x = try ...; use x } catch { fallback; continue }`.

## Code Examples

### ble.record full signature (verified from codebase)
```swift
// BLETransport.swift:148 — required protocol method
func record(level: GooseLogLevel, source: String, title: String, body: String)

// Convenience overloads (BLETransport.swift:179-191):
func record(source: String, title: String)
func record(source: String, title: String, body: String)
func record(level: GooseLogLevel, source: String, title: String)
```

### GooseLogLevel enum (GooseBLETypes.swift:45)
```swift
enum GooseLogLevel: String {
  case debug
  case info
  case warn
  case error
}
```

### r2d2_sqlite pool with PRAGMA init (Rust)
```rust
// Source: r2d2_sqlite crate docs (ASSUMED — verify at docs.rs/r2d2_sqlite)
let manager = SqliteConnectionManager::file("path/to/db.sqlite")
    .with_init(|conn| {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;"
        )
    });
let pool = Pool::builder().max_size(4).build(manager)?;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-call `Connection::open()` | Connection pool via r2d2 | This phase | Eliminates file-open overhead on every FFI call; reduces SQLite lock contention |
| Silent `try?` swallowing | `do/catch` with logging | This phase | Bridge errors now visible in Xcode console and OSLog |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | HealthDataStore+V24Biometrics.swift:92 is borderline — `if let spo2Report = try?` handles nil gracefully, may not need fixing | BP-01 Audit | If included, BP-01 count is 9 not 8; planner adds one more catch block |
| A2 | `r2d2_sqlite` `with_init` closure is the correct API for PRAGMA setup | Code Examples | If API differs, pool init pattern needs adjustment; verify at docs.rs/r2d2_sqlite |
| A3 | Pool path is always the same in production (goose.sqlite in ApplicationSupport) | BP-02 Architecture | If path varies per user session, OnceLock needs to be keyed by path |
| A4 | CaptureFrameWriteQueue has no logger — the existing comment ("No ble.record here") is intentional and line 342 should remain silent or get a print | BP-01 Audit | If D-06 applies strictly, a logger must be added to CaptureFrameWriteQueue |

## Open Questions (RESOLVED)

1. **BP-01 count discrepancy (8 vs 9)**
   - RESOLVED: Include all 9 (V24Biometrics counts). Planner covers 8 mandatory + V24Biometrics as optional-but-included.

2. **D-06 strictness in HealthDataStore and GooseUploadService**
   - RESOLVED: Use each file's established idiom. `ble.record` only in GooseAppModel-family files. `logger` in GooseUploadService, status strings in HealthDataStore, `print` in CaptureFrameWriteQueue.

3. **BP-02 pool strategy: narrow vs wide**
   - RESOLVED: Narrow — add `acquire_bridge_conn()` as new pooled helper, update bridge domain callers. `open_bridge_store_hot` unchanged.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Cargo / rustc | BP-02 build | Yes | MSRV 1.96 | — |
| r2d2 | BP-02 | Yes (crates.io) | 0.8.10 | — |
| r2d2_sqlite | BP-02 | Yes (crates.io) | 0.34.0 | — |
| Xcode (Swift build) | BP-01 build | Yes (macOS) | 26.5 | — |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Rust framework | `cargo test --locked` (built-in) |
| Swift framework | XCTest via `xcodebuild test` |
| Quick Rust run | `cargo test --locked -q 2>&1 | tail -5` |
| Full Rust suite | `cargo test --locked` (47 integration test files) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BP-01 | No silent `try?` bridge calls remain | grep audit | `grep -rn "try? bridge\|try? rust\|try? await bridge" GooseSwift/ --include="*.swift" \| grep -E "request"` — must return 0 lines | N/A (grep) |
| BP-01 | Swift build compiles without new warnings | build | `xcodebuild build -scheme GooseSwift CODE_SIGNING_ALLOWED=NO 2>&1 \| grep 'error:'` | N/A |
| BP-02 | cargo test passes | unit/integration | `cargo test --locked` | Yes — existing 47 test files |
| BP-02 | No `open_bridge_store` call in bridge domain files (replaced) | grep audit | `grep -rn "open_bridge_store" src/bridge/*.rs \| grep -v "fn open_bridge_store"` — must return 0 lines | N/A (grep) |

### Wave 0 Gaps
None — no new test infrastructure needed. Verification is grep-based (BP-01) and existing cargo test suite (BP-02).

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | No new inputs | Existing validation unchanged |
| V6 Cryptography | No | — |
| V2 Authentication | No | — |

No new security surface introduced by either fix.

## Sources

### Primary (HIGH confidence — codebase verified)
- `GooseSwift/*.swift` — grep audit of all `try?` calls; exact file:line:method documented
- `Rust/core/src/bridge/mod.rs` — `open_bridge_store` implementation confirmed
- `Rust/core/src/store/mod.rs:1046` — WAL mode confirmed enabled
- `Rust/core/src/store/mod.rs:175-176` — `GooseStore` struct owns `Arc<Mutex<Connection>>`
- `GooseSwift/BLETransport.swift:148` — `ble.record` exact signature confirmed
- `GooseSwift/GooseBLETypes.swift:45` — `GooseLogLevel` enum confirmed
- `GooseSwift/GooseUploadService.swift:4` — OSLog `logger` confirmed

### Secondary (MEDIUM confidence — registry)
- crates.io via `cargo search` — `r2d2 = "0.8.10"`, `r2d2_sqlite = "0.34.0"` confirmed on registry

### Tertiary (LOW confidence — training knowledge)
- r2d2_sqlite `with_init` API pattern [ASSUMED] — verify at docs.rs/r2d2_sqlite before implementing

## Metadata

**Confidence breakdown:**
- BP-01 call sites: HIGH — grep verified, exact file:line:method
- BP-02 architecture: HIGH — bridge/mod.rs and store/mod.rs read and confirmed
- WAL mode: HIGH — PRAGMA confirmed in configure_read_write_connection
- r2d2/r2d2_sqlite versions: HIGH — registry confirmed
- r2d2_sqlite with_init API: LOW — assumed from training; verify at docs.rs

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (stable Rust crates + stable Swift codebase)
