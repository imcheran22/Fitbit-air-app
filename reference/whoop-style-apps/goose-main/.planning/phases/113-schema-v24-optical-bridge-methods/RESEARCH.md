# Phase 113: Schema v24 + Optical Bridge Methods — Research

**Researched:** 2026-06-22
**Domain:** Rust / SQLite schema migration + bridge method registration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Single migration block: bump `CURRENT_SCHEMA_VERSION = 24` in `Rust/core/src/store/mod.rs`, append all four `CREATE TABLE IF NOT EXISTS` DDL statements and the `INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (24)` + `PRAGMA user_version = 24` pair in one transaction block — matching the pattern of migrations 22 and 23.
- **D-02:** Update the existing `test_schema_version_is_N` test (if present) to assert version 24.
- **D-03 / D-04:** `optical_channel_samples` schema as specified (see column definitions below).
- **D-05:** `INSERT OR IGNORE` on duplicate (device_id, ts, packet_k, channel_index).
- **D-06 / D-07:** `device_feature_flags` schema as specified (WITHOUT ROWID, PRIMARY KEY).
- **D-08:** `body_composition_history` schema as specified — no bridge methods this phase.
- **D-09:** `realtime_frames` schema as specified — no bridge methods this phase.
- **D-10:** `biometrics.insert_v20v21_batch` — batch insert optical channel samples for v20/v21 packets.
- **D-11:** `biometrics.insert_v26_batch` — batch insert PPG waveform (channel_index=0).
- **D-12:** `biometrics.optical_between` — range query on optical_channel_samples.
- **D-13:** `capabilities.get_feature_flags` — query device_feature_flags by device_id.
- **D-14:** `capabilities.upsert_feature_flags` — upsert device_feature_flags rows.
- **D-15:** All new method strings added to `BRIDGE_METHODS` in alphabetical order; `bridge_methods_constant_matches_dispatcher` test must pass.
- **D-16:** One round-trip integration test per new method in `Rust/core/tests/` using `GooseStore::open_in_memory().expect(...)` + `.migrate()`.

### Claude's Discretion
- Bridge implementations go in: optical methods → `bridge/capture.rs`; capabilities methods → new `bridge/capabilities.rs`.
- Wave plan: single plan (sequential schema then bridge).

### Deferred Ideas (OUT OF SCOPE)
- Bridge methods for `body_composition_history` → Phase 116
- Bridge methods for `realtime_frames` → Phase 118
- Android parity (OPT-04) → Phase 117
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPT-03 | `optical_channel_samples` SQLite table (schema v24); bridge methods `biometrics.insert_v20v21_batch` + `biometrics.insert_v26_batch` + range query; `BRIDGE_METHODS` updated; `cargo test --locked` passes | Migration append location (line 1882), dispatch pattern in metrics.rs, insert/query bridge pattern from v24_biometric_bridge_tests.rs |
| FF-03 | `device_feature_flags` SQLite table (schema v24); bridge method `capabilities.get_feature_flags`; `BRIDGE_METHODS` updated | Same migration block; new `bridge/capabilities.rs` file needed; routing arm in mod.rs |
| BODY-01 (schema only) | `body_composition_history` table created in v24 migration | DDL appended in same migration block, no bridge methods |
| PIP-02 (schema only) | `realtime_frames` table created in v24 migration | DDL appended in same migration block, no bridge methods |
</phase_requirements>

---

## Summary

Phase 113 is a pure Rust phase. It has two sequential concerns: (1) a single SQLite migration that bumps schema from v23 to v24 and creates four tables, and (2) five new bridge methods for two of those tables. The gate is `cargo test --locked` green.

The codebase pattern is fully established and consistent. Every prior migration appends DDL + `INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (N)` + `PRAGMA user_version = N` inside a single `execute_batch` string. The bridge dispatch is split across domain files (`metrics.rs`, `capture.rs`, `sleep.rs`, `activity.rs`, `debug.rs`). Biometrics methods currently route to `metrics::dispatch_metrics`. Capabilities methods have no existing domain file — a new `bridge/capabilities.rs` must be created and a routing arm added in `mod.rs`.

**Primary recommendation:** Write store methods first (new table DDL + insert/query), then wire bridge methods in the domain files, then write integration tests. The `bridge_methods_constant_matches_dispatcher` compile-time test catches any mismatch between `BRIDGE_METHODS` and actual dispatch arms — run `cargo test` once to verify.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema migration (DDL) | Rust / SQLite store | — | All schema owned by `store/mod.rs` `init_schema` |
| Bridge dispatch routing | `bridge/mod.rs` | domain files | `mod.rs` routes by namespace prefix; domain file handles match arms |
| optical_channel_samples insert | `bridge/metrics.rs` (biometrics.*) | `store/mod.rs` store method | biometrics.* routes to dispatch_metrics |
| optical_channel_samples query | `bridge/metrics.rs` (biometrics.*) | `store/mod.rs` store method | same routing |
| device_feature_flags CRUD | new `bridge/capabilities.rs` | `store/mod.rs` store method | capabilities.* has no domain file yet |
| Integration tests | `Rust/core/tests/` | — | auto-discovered, no Cargo.toml registration needed |

---

## 1. Migration Block — Exact Location

**File:** `Rust/core/src/store/mod.rs`
**Line 23:** `pub const CURRENT_SCHEMA_VERSION: i64 = 23;` — change to `24`. [VERIFIED: codebase grep]

**Migration append point:** [VERIFIED: codebase read]

The current migration block is a single raw string passed to `execute_batch`. It ends at:

```
line 1880:    INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (23);
line 1881:    PRAGMA user_version = 23;
line 1882:    "#,   ← closing delimiter of the raw string
line 1883: )?;
```

New DDL goes **inside** the raw string, inserted between line 1881 and line 1882. The pattern to replicate (from migration 23, lines 1865–1881):

```rust
            CREATE TABLE IF NOT EXISTS sync_telemetry (
                ...
            );
            CREATE INDEX IF NOT EXISTS idx_sync_telemetry_session
                ON sync_telemetry(session_id);

            INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (23);
            PRAGMA user_version = 23;
```

The new migration 24 block appends immediately after `PRAGMA user_version = 23;`, before the closing `"#`:

```rust
            -- (4 new CREATE TABLE blocks here)
            INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (24);
            PRAGMA user_version = 24;
```

**Test impact:** `store_schema_version_tests.rs` uses `CURRENT_SCHEMA_VERSION` as a constant (not a literal). The tests are `open_existing_current_rejects_stale_schema_version` and `open_existing_current_rejects_future_schema_version`. Both derive their version from the constant — no literal `23` to update. [VERIFIED: codebase read]

**In-store tests:** `store/mod.rs` lines 4003–4004 and 4644–4645 and 4792 reference `CURRENT_SCHEMA_VERSION` comparatively (`assert_eq!(version, CURRENT_SCHEMA_VERSION, ...)`). These automatically reflect the bumped constant. [VERIFIED: codebase grep]

---

## 2. Column Definitions — All Four Tables

All DDL verified against CONTEXT.md decisions D-03 through D-09. [VERIFIED: CONTEXT.md]

### optical_channel_samples (OPT-03, D-04)

```sql
CREATE TABLE IF NOT EXISTS optical_channel_samples (
    device_id TEXT NOT NULL,
    ts REAL NOT NULL,
    packet_k INTEGER NOT NULL,
    version INTEGER NOT NULL,
    channel_index INTEGER NOT NULL,
    samples_json TEXT NOT NULL,
    captured_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(device_id, ts, packet_k, channel_index)
);
CREATE INDEX IF NOT EXISTS idx_optical_channel_samples_device_ts
    ON optical_channel_samples(device_id, ts);
```

Insert semantics: `INSERT OR IGNORE` (idempotent). `samples_json` stores a JSON array of integers (i32 for v20, i16 for v21/v26).

### device_feature_flags (FF-03, D-07)

```sql
CREATE TABLE IF NOT EXISTS device_feature_flags (
    device_id TEXT NOT NULL,
    flag_index INTEGER NOT NULL,
    flag_value INTEGER NOT NULL,
    discovered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY(device_id, flag_index)
) WITHOUT ROWID;
```

Insert semantics: `INSERT OR REPLACE` (latest value wins).

### body_composition_history (BODY-01 schema only, D-08)

```sql
CREATE TABLE IF NOT EXISTS body_composition_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    weight_kg REAL,
    bmi REAL,
    body_fat_pct REAL,
    muscle_mass_kg REAL,
    water_pct REAL,
    source TEXT NOT NULL CHECK(source IN ('manual','healthkit','scale')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(source, date)
);
```

No bridge methods in this phase.

### realtime_frames (PIP-02 schema only, D-09)

```sql
CREATE TABLE IF NOT EXISTS realtime_frames (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_uuid TEXT NOT NULL,
    frame_hex TEXT NOT NULL,
    captured_at TEXT NOT NULL DEFAULT 'realtime_pip',
    synced INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_realtime_frames_device_captured
    ON realtime_frames(device_uuid, captured_at);
```

No bridge methods in this phase.

---

## 3. BRIDGE_METHODS Array — Insertion Points

**File:** `Rust/core/src/bridge/mod.rs`
**Array:** `BRIDGE_METHODS` at line 47, ending at line 206. [VERIFIED: codebase read]

Current biometrics entries (lines 65–67):
```rust
    "biometrics.insert_v24_batch",
    "biometrics.spo2_from_raw",
    "biometrics.v24_between",
```

**New entries to insert (alphabetical order within biometrics group):**

```rust
    "biometrics.insert_v20v21_batch",   // inserts before insert_v24_batch
    "biometrics.insert_v24_batch",      // existing
    "biometrics.insert_v26_batch",      // inserts after insert_v24_batch
    "biometrics.optical_between",       // inserts after insert_v26_batch
    "biometrics.spo2_from_raw",         // existing
    "biometrics.v24_between",           // existing
```

The `capabilities.*` namespace does not yet exist. New entries go between `"calibration.*"` and `"capture.*"` alphabetically:

```
    "calibration.list_labels",          // existing (line ~72)
    "capabilities.get_feature_flags",   // NEW
    "capabilities.upsert_feature_flags",// NEW
    "capture.arrival_plan",             // existing
```

**Routing arm for `capabilities.*`** must be added to the dispatch block in `mod.rs` (lines 517–575). Pattern follows the existing domain prefix routing:

```rust
    if method.starts_with("capabilities.") {
        return capabilities::dispatch_capabilities(&request);
    }
```

Insert this arm after the `metrics` block (line 529) and before the `sleep` block (line 532), since `capabilities` < `capture` alphabetically but after `biometrics` which is already in metrics. Placement: between line 529 and 531 to preserve readability.

**New module declaration** in `mod.rs`: add `mod capabilities;` alongside the existing domain module declarations.

---

## 4. Dispatch Pattern — Exact Rust Syntax

**Source:** `Rust/core/src/bridge/metrics.rs` lines 381–396. [VERIFIED: codebase read]

```rust
pub(crate) fn dispatch_metrics(request: &BridgeRequest) -> BridgeResponse {
    match request.method.as_str() {
        // ... existing arms ...
        "biometrics.insert_v24_batch" => request_args::<InsertV24BatchArgs>(request)
            .and_then(insert_v24_biometric_batch_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "biometrics.v24_between" => request_args::<V24BetweenArgs>(request)
            .and_then(v24_biometric_samples_between_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "biometrics.spo2_from_raw" => request_args::<Spo2FromRawArgs>(request)
            .and_then(spo2_from_raw_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        _ => unreachable!(
            "dispatch_metrics called with non-metrics method: {}",
            request.method
        ),
    }
}
```

**Template for new optical arms** (add to `dispatch_metrics` match):

```rust
        "biometrics.insert_v20v21_batch" => request_args::<InsertV20V21BatchArgs>(request)
            .and_then(insert_v20v21_batch_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "biometrics.insert_v26_batch" => request_args::<InsertV26BatchArgs>(request)
            .and_then(insert_v26_batch_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "biometrics.optical_between" => request_args::<OpticalBetweenArgs>(request)
            .and_then(optical_between_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
```

**Template for capabilities.rs** (new file, new `dispatch_capabilities` function):

```rust
pub(crate) fn dispatch_capabilities(request: &BridgeRequest) -> BridgeResponse {
    match request.method.as_str() {
        "capabilities.get_feature_flags" => request_args::<GetFeatureFlagsArgs>(request)
            .and_then(get_feature_flags_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "capabilities.upsert_feature_flags" => request_args::<UpsertFeatureFlagsArgs>(request)
            .and_then(upsert_feature_flags_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        _ => unreachable!(
            "dispatch_capabilities called with non-capabilities method: {}",
            request.method
        ),
    }
}
```

---

## 5. Args Struct Patterns

**Source pattern:** `InsertV24BatchArgs` at `bridge/metrics.rs` lines 1401–1413. [VERIFIED: codebase read]

```rust
#[derive(Debug, Deserialize)]
struct InsertV24BatchArgs {
    database_path: String,
    device_id: String,
    #[serde(default)]
    spo2: Vec<Spo2RawArg>,
    // ...
}
```

**New args structs for optical methods:**

```rust
#[derive(Debug, Deserialize)]
struct OpticalChannelArg {
    index: u8,
    samples: Vec<i64>, // JSON numbers; store serializes as TEXT
}

#[derive(Debug, Deserialize)]
struct OpticalPacketArg {
    ts: f64,
    packet_k: u8,
    version: u8,
    channels: Vec<OpticalChannelArg>,
}

#[derive(Debug, Deserialize)]
struct InsertV20V21BatchArgs {
    database_path: String,
    device_id: String,
    packets: Vec<OpticalPacketArg>,
}

#[derive(Debug, Deserialize)]
struct V26PacketArg {
    ts: f64,
    packet_k: u8,   // always 26
    version: u8,    // always 26
    ppg: Vec<i64>,
    num_channels: u8,
}

#[derive(Debug, Deserialize)]
struct InsertV26BatchArgs {
    database_path: String,
    device_id: String,
    packets: Vec<V26PacketArg>,
}

#[derive(Debug, Deserialize)]
struct OpticalBetweenArgs {
    database_path: String,
    device_id: String,
    packet_k: u8,
    start_ts: f64,
    end_ts: f64,
}
```

**Capabilities args structs:**

```rust
#[derive(Debug, Deserialize)]
struct GetFeatureFlagsArgs {
    database_path: String,
    device_id: String,
}

#[derive(Debug, Deserialize)]
struct FeatureFlagArg {
    index: u8,
    value: u8,
}

#[derive(Debug, Deserialize)]
struct UpsertFeatureFlagsArgs {
    database_path: String,
    device_id: String,
    flags: Vec<FeatureFlagArg>,
}
```

---

## 6. Store Method Return Type Rule (Critical Pitfall)

**Source:** CONTEXT.md code_context + cs:s1-369 rule. [VERIFIED: CONTEXT.md + project skill]

When the store method returns `Vec<NamedStruct>`, map with **struct field access**:

```rust
// CORRECT — struct field access
.map(|rows| {
    rows.iter()
        .map(|r| serde_json::json!({
            "ts": r.ts,
            "packet_k": r.packet_k,
            "version": r.version,
            "channel_index": r.channel_index,
            "samples_json": r.samples_json,
        }))
        .collect::<Vec<_>>()
})
```

Do NOT use tuple destructuring `|(ts, packet_k, ...)|` — that only works for `Vec<(...)>` tuples and causes `E0308: mismatched types` at compile time.

**Before implementing the bridge map lambda:** check the actual return type of the store method. If `optical_channel_samples` query returns a named struct, use field access. If it returns tuples (like some existing V24 methods), tuple destructuring is correct for those.

---

## 7. Integration Test Convention

**Source:** `sync_telemetry_round_trip.rs` and `v24_biometric_bridge_tests.rs`. [VERIFIED: codebase read]

**Test store creation pattern:**
```rust
let store = GooseStore::open_in_memory().expect("open in-memory store");
// migrate() is called automatically by open_in_memory — tables are created
```

Note: `open_in_memory()` calls `migrate()` internally. No separate `.migrate()` call needed.

**File naming convention:** `<feature>_round_trip.rs` for store-level tests (e.g., `optical_channel_round_trip.rs`, `feature_flags_round_trip.rs`). Bridge-level tests use `<feature>_bridge_tests.rs` (e.g., `optical_bridge_tests.rs`). Both patterns exist in the codebase.

**No Cargo.toml registration needed.** The Cargo.toml has no `[[test]]` sections. Rust auto-discovers all `.rs` files in `tests/`. [VERIFIED: Cargo.toml tail read]

**Existing test files relevant to this phase:**
- `v24_biometric_bridge_tests.rs` — bridge-level pattern to replicate
- `sync_telemetry_round_trip.rs` — store-level round-trip pattern
- `store_schema_version_tests.rs` — uses `CURRENT_SCHEMA_VERSION` constant (no literal to update)

**Tests to write:**
- `optical_channel_bridge_tests.rs` — round-trip via bridge JSON for all 3 optical methods
- `feature_flags_bridge_tests.rs` — round-trip via bridge JSON for get/upsert

---

## 8. Tests That Assert Literal Version Numbers

**Result: NONE.** [VERIFIED: codebase grep]

`store_schema_version_tests.rs` uses only `CURRENT_SCHEMA_VERSION` (the constant) to compute `stale_version = CURRENT_SCHEMA_VERSION - 1` and `future_version = CURRENT_SCHEMA_VERSION + 1`. No literal `23` appears in any test file. Bumping the constant in `store/mod.rs` line 23 is the only change needed — no test string-replacement required.

The in-store tests at lines 4003–4004, 4644–4645, and 4792 of `store/mod.rs` also reference the constant comparatively and auto-update with the bump.

---

## Architecture Patterns

### Migration Append Pattern

The migration is one `execute_batch` raw string. All DDL for a new schema version goes inside that string, after the previous version's `PRAGMA user_version = N;` and before the closing `"#`.

```rust
// After PRAGMA user_version = 23; (line 1881), before "#, (line 1882):

            CREATE TABLE IF NOT EXISTS optical_channel_samples ( ... );
            CREATE INDEX IF NOT EXISTS idx_optical_channel_samples_device_ts
                ON optical_channel_samples(device_id, ts);

            CREATE TABLE IF NOT EXISTS device_feature_flags ( ... ) WITHOUT ROWID;

            CREATE TABLE IF NOT EXISTS body_composition_history ( ... );

            CREATE TABLE IF NOT EXISTS realtime_frames ( ... );
            CREATE INDEX IF NOT EXISTS idx_realtime_frames_device_captured
                ON realtime_frames(device_uuid, captured_at);

            INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (24);
            PRAGMA user_version = 24;
```

### New Bridge Domain File Pattern

`capabilities.rs` is a new file in `Rust/core/src/bridge/`. Structure mirrors `capture.rs`:

1. `use` imports: `super::{BridgeRequest, BridgeResponse, bridge_ok, bridge_error, request_args}` + store imports
2. Args structs with `#[derive(Debug, Deserialize)]`
3. `pub(crate) fn dispatch_capabilities(request: &BridgeRequest) -> BridgeResponse { match ... }`
4. Private implementation functions

### acquire_bridge_conn Pattern

All bridge functions that need database access call:
```rust
let store = acquire_bridge_conn(&args.database_path)?;
```
This is already imported/available in `metrics.rs` and `capture.rs`. The same import must be added to `capabilities.rs`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| JSON serialization of samples array | Custom serializer | `serde_json::to_string(&vec)` for insert, `serde_json::from_str` for query |
| SQLite migration transactions | Manual BEGIN/COMMIT | The existing `execute_batch` block — SQLite wraps it in a transaction |
| Test database setup | Temp file + schema init | `GooseStore::open_in_memory()` — already migrates to current schema |
| Bridge error/ok wrapping | Custom response struct | `bridge_ok` / `bridge_error` helpers already in `bridge/mod.rs` |

---

## Common Pitfalls

### Pitfall 1: Tuple Destructuring on Named Struct Return
**What goes wrong:** Bridge map lambda uses `|(ts, channel_index, samples_json)|` but store method returns `Vec<OpticalSampleRow>`.
**Why it happens:** `E0308 mismatched types` — tuple destructuring only works for `Vec<(...)>`.
**How to avoid:** Check actual store method return type before writing the lambda. Use `|r| serde_json::json!({ "ts": r.ts, ... })`.

### Pitfall 2: BRIDGE_METHODS Out of Alphabetical Order
**What goes wrong:** `bridge_methods_must_be_sorted` test panics.
**Why it happens:** Inserting a new string without checking sort order.
**How to avoid:** Insert `biometrics.insert_v20v21_batch` before `biometrics.insert_v24_batch`; `capabilities.*` between `calibration.*` and `capture.*`.

### Pitfall 3: Dispatch Arm Missing from mod.rs Routing
**What goes wrong:** `bridge_methods_constant_matches_dispatcher` test panics ("Methods in BRIDGE_METHODS with no dispatch arm").
**Why it happens:** Adding `capabilities.*` to `BRIDGE_METHODS` but not adding the `starts_with("capabilities.")` arm in `mod.rs`.
**How to avoid:** Add the routing arm AND declare `mod capabilities;` in `mod.rs`.

### Pitfall 4: WITHOUT ROWID + AUTOINCREMENT Conflict
**What goes wrong:** Compile or runtime error if `WITHOUT ROWID` is used with `AUTOINCREMENT`.
**Why it happens:** SQLite disallows `AUTOINCREMENT` on `WITHOUT ROWID` tables.
**How to avoid:** `device_feature_flags` uses `PRIMARY KEY(device_id, flag_index)` only — no AUTOINCREMENT, no id column. This is already correct in D-07.

### Pitfall 5: open_for_testing Does Not Exist
**What goes wrong:** Compile error.
**Why it happens:** Assumed method from other codebases.
**How to avoid:** Always use `GooseStore::open_in_memory().expect(...)`. [VERIFIED: project skill + codebase grep]

---

## Protocol Types Available from Phase 112

**Source:** `Rust/core/src/protocol.rs`. [VERIFIED: codebase grep]

The following types are available for use in bridge and store implementations:

```rust
// Optical channel variant from V20/V21 packets
DataPacketBodySummary::V20V21OpticalMultiChannel {
    version: u8,
    channels: Vec<OpticalChannel>,
    warnings: Vec<String>,
}

// PPG waveform variant from V26 packets
DataPacketBodySummary::V26PpgWaveform {
    ppg_channel: u8,   // optical channel id 1–26
    unix_ts: u32,
    samples: Vec<i16>, // 24 samples at 24 Hz
    warnings: Vec<String>,
}

// OpticalChannel struct
pub struct OpticalChannel {
    pub index: u8,
    pub samples_i32: Option<Vec<i32>>,  // v20 only: 50 samples
    pub samples_i16: Option<Vec<i16>>,  // v21 only: 100 samples
}
```

Test fixtures available:
- `parse_v20v21_optical_body_for_test(packet_k, payload)` — returns `(Option<DataPacketBodySummary>, Vec<String>)`
- `parse_v26_ppg_body_for_test(payload)` — returns `(Option<DataPacketBodySummary>, Vec<String>)`

Bridge implementations that receive pre-parsed data (via the JSON args structs, not raw protocol) do not need to call these parsers. The parsers are relevant only to tests that synthesize payloads.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Rust built-in test runner (cargo test) |
| Config file | `Rust/core/Cargo.toml` (no `[[test]]` entries — auto-discovery) |
| Quick run command | `cd Rust/core && cargo test --locked optical` |
| Full suite command | `cd Rust/core && cargo test --locked` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPT-03 | `biometrics.insert_v20v21_batch` inserts rows | integration | `cargo test --locked --test optical_channel_bridge_tests` | No — Wave 0 |
| OPT-03 | `biometrics.insert_v26_batch` inserts as channel_index=0 | integration | `cargo test --locked --test optical_channel_bridge_tests` | No — Wave 0 |
| OPT-03 | `biometrics.optical_between` returns inserted rows in range | integration | `cargo test --locked --test optical_channel_bridge_tests` | No — Wave 0 |
| FF-03 | `capabilities.upsert_feature_flags` inserts/replaces rows | integration | `cargo test --locked --test feature_flags_bridge_tests` | No — Wave 0 |
| FF-03 | `capabilities.get_feature_flags` returns rows for device_id | integration | `cargo test --locked --test feature_flags_bridge_tests` | No — Wave 0 |
| BODY-01 | `body_composition_history` table exists after migration | integration | `cargo test --locked --test store_schema_version_tests` | Yes |
| PIP-02 | `realtime_frames` table exists after migration | integration | `cargo test --locked --test store_schema_version_tests` | Yes |
| All | `BRIDGE_METHODS` sorted and matches dispatch | compile-time | `cargo test --locked bridge_methods_constant_matches_dispatcher` | Yes |
| All | `BRIDGE_METHODS` sorted + unique | compile-time | `cargo test --locked bridge_methods_must_be_sorted` | Yes |

### Sampling Rate
- **Per task commit:** `cd Rust/core && cargo test --locked 2>&1 | tail -5`
- **Per wave merge:** `cd Rust/core && cargo test --locked`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `Rust/core/tests/optical_channel_bridge_tests.rs` — covers OPT-03 bridge round-trip
- [ ] `Rust/core/tests/feature_flags_bridge_tests.rs` — covers FF-03 bridge round-trip

*(store_schema_version_tests.rs already validates migration — it will pass once the constant is bumped, as it uses `CURRENT_SCHEMA_VERSION` dynamically)*

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — pure Rust/SQLite, no CLI tools, services, or runtimes beyond cargo and rustc).

---

## Security Domain

This phase writes to a local SQLite database with no network exposure. The bridge is called only from Swift FFI on the same device.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | `serde_json::from_str` + typed Rust structs; samples are stored as opaque TEXT, no eval |
| V6 Cryptography | no | No encryption at rest in this layer |
| V2 Authentication | no | Local FFI — no auth boundary |
| V4 Access Control | no | Single-user device app |

No new threat patterns beyond existing bridge surface.

---

## Sources

### Primary (HIGH confidence)
- `Rust/core/src/store/mod.rs` — migration block location (lines 1838–1882), `CURRENT_SCHEMA_VERSION` (line 23)
- `Rust/core/src/bridge/mod.rs` — `BRIDGE_METHODS` array (lines 47–206), domain routing block (lines 517–575)
- `Rust/core/src/bridge/metrics.rs` — dispatch arm boilerplate (lines 381–397), `InsertV24BatchArgs` pattern (lines 1401–1413)
- `Rust/core/tests/sync_telemetry_round_trip.rs` — `open_in_memory()` test pattern
- `Rust/core/tests/store_schema_version_tests.rs` — confirms no literal version numbers
- `Rust/core/tests/v24_biometric_bridge_tests.rs` — bridge test structure to replicate
- `Rust/core/src/protocol.rs` — `OpticalChannel` struct fields (lines 344–353), variant definitions (lines 324–341)
- `Rust/core/Cargo.toml` — no `[[test]]` sections, auto-discovery confirmed

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions D-01 through D-16 — locked decisions from discuss-phase
- Project skill cs:s1-369 — bridge method recipe (authoritative project knowledge)
- Project skill cs:s1-113 — `open_in_memory()` pattern, no literal version update needed

---

## Metadata

**Confidence breakdown:**
- Migration location and pattern: HIGH — verified against codebase read
- BRIDGE_METHODS insertion points: HIGH — verified against full array listing
- Dispatch pattern: HIGH — exact code read from metrics.rs
- Test conventions: HIGH — read from two existing test files
- Schema DDL: HIGH — verified verbatim from CONTEXT.md decisions D-03 through D-09
- Args struct naming: MEDIUM — follows established pattern but new structs will be written fresh

**Research date:** 2026-06-22
**Valid until:** 2026-07-22 (stable codebase, no fast-moving dependencies)
