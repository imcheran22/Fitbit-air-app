---
phase: 21-imu-data-foundation
reviewed: 2026-06-06T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - Rust/core/src/protocol.rs
  - Rust/core/src/bridge.rs
  - Rust/core/src/store.rs
  - Rust/core/src/fixtures.rs
  - Rust/core/tests/protocol_tests.rs
  - Rust/core/tests/bridge_tests.rs
  - Rust/core/tests/store_tests.rs
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase 21: IMU Data Foundation — Code Review Report

**Reviewed:** 2026-06-06
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

This milestone adds `I16SeriesSummary::full_samples`, the `gravity` SQLite table (schema v15), K10 LSB-to-g conversion in the upload bridge, deferred K21 extraction, and fixture array-subset comparison semantics.

The implementation is largely sound. The parser, LSB conversion value, K21 deferral, and `BRIDGE_METHODS` sort order are all correct. Two blockers and three warnings were found.

---

## Critical Issues

### CR-01: `gravity` table has no PRIMARY KEY or UNIQUE constraint — duplicate rows silently accumulate

**File:** `Rust/core/src/store.rs:1418`

**Issue:** The `gravity` table is declared without a PRIMARY KEY or a UNIQUE constraint on `(device_id, ts)`. The `insert_gravity_rows` method (`store.rs:6060`) uses a plain `INSERT INTO gravity` with no conflict clause. Calling `upload.get_recent_decoded_streams` twice (or re-importing a K10 frame) inserts duplicate rows for the same `(device_id, ts)` pairs. On a live iOS device, where frames are imported on every BLE notification and the upload bridge is polled periodically, this produces an ever-growing `gravity` table with unbounded duplicates. The query path (`gravity_rows_between`) returns all rows ordered by ts, so consumers receive duplicated samples without any indication of duplication.

The three store-level gravity tests all work against a single insertion, so they cannot detect this.

**Fix:** Add a UNIQUE constraint to the table DDL and use `INSERT OR IGNORE` in the store method:

```sql
-- store.rs table DDL (inside v15 migration block)
CREATE TABLE IF NOT EXISTS gravity (
    device_id TEXT NOT NULL,
    ts        REAL NOT NULL,
    x         REAL NOT NULL,
    y         REAL NOT NULL,
    z         REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (device_id, ts)
);
```

```rust
// store.rs insert_gravity_rows
let changed = self.conn.execute(
    "INSERT OR IGNORE INTO gravity (device_id, ts, x, y, z) VALUES (?1, ?2, ?3, ?4, ?5)",
    params![device_id, ts, x, y, z],
)?;
```

Because `ts` is a `REAL` (f64), floating-point duplicates from the same frame source will collide exactly (both sides derive it from the same `timestamp_seconds` integer), so `OR IGNORE` is the correct conflict resolution.

---

### CR-02: All gravity samples in a K10 frame are assigned the same base timestamp — per-sample offsets are lost

**File:** `Rust/core/src/bridge.rs:3191`

**Issue:** The K10 IMU packet carries 100 accelerometer samples at a known hardware rate (50 Hz for WHOOP 4/5). The extraction loop assigns every sample the single frame-level `ts_base` (derived from `timestamp_seconds`):

```rust
gravity.push(json!({
    "ts": ts_base,   // same for all 100 samples in the frame
    "x": xs[i] as f64 / IMU_LSB_PER_G,
    ...
}));
```

This means 100 consecutive gravity rows share identical `ts` values. Any consumer that tries to reconstruct a time series, compute cadence, or join against other streams cannot distinguish the samples. The server's `POST /v1/ingest-decoded` endpoint almost certainly expects monotonically increasing timestamps.

The impact is compounded by CR-01: if the same batch is inserted twice, the deduplication key `(device_id, ts)` collapses all 100 rows to a single row (after CR-01 is fixed), discarding 99 of 100 samples.

**Fix:** Compute per-sample timestamps using the hardware sample rate. The ICM-45686 runs at 50 Hz in WHOOP mode:

```rust
const K10_SAMPLE_RATE_HZ: f64 = 50.0;

for i in 0..n {
    let sample_ts = ts_base + (i as f64) / K10_SAMPLE_RATE_HZ;
    gravity.push(json!({
        "ts": sample_ts,
        "x": xs[i] as f64 / IMU_LSB_PER_G,
        "y": ys[i] as f64 / IMU_LSB_PER_G,
        "z": zs[i] as f64 / IMU_LSB_PER_G,
    }));
}
```

If the exact hardware rate is not yet confirmed, the per-sample offset should still be applied using whatever rate is documented (even if approximate), and the rate constant should be exposed alongside `IMU_LSB_PER_G` with a matching rationale comment. Emitting 100 rows with identical timestamps is never correct.

Note: The bridge tests (`bridge_k10_gravity_extraction_lsb_to_g_conversion`, `bridge_k10_gravity_row_count_and_base_ts`) both assert `ts == 0.0` for all rows against a zero-filled frame header, so they do not detect the collision. A test with a real timestamp would expose the issue.

---

## Warnings

### WR-01: `gravity_rows_between` bridge omits `device_id` from the returned rows

**File:** `Rust/core/src/bridge.rs:3322`

**Issue:** The JSON serialization of `gravity_rows_between` results maps each `GravityRow` to `{"ts", "x", "y", "z"}` — `device_id` is dropped:

```rust
.map(|r| json!({"ts": r.ts, "x": r.x, "y": r.y, "z": r.z}))
```

A caller that queries multiple devices in sequence and aggregates results cannot identify which rows belong to which device. The omission may be intentional for the current single-device case, but it is inconsistent with the `GravityRow` struct (which carries `device_id`) and creates a breaking API change once multi-device support is added (plan v3.0). The bridge contract should be stable.

**Fix:** Include `device_id` in the output:

```rust
.map(|r| json!({"device_id": r.device_id, "ts": r.ts, "x": r.x, "y": r.y, "z": r.z}))
```

---

### WR-02: `rr`, `battery`, `spo2`, `skin_temp`, `resp` are declared `let` (not `let mut`) but always empty — dead code shipped as stub

**File:** `Rust/core/src/bridge.rs:3121`

**Issue:** Five stream accumulators are declared without `mut`, are never populated, and are always included in the response as empty arrays:

```rust
let rr: Vec<serde_json::Value> = Vec::new();
let battery: Vec<serde_json::Value> = Vec::new();
let spo2: Vec<serde_json::Value> = Vec::new();
let skin_temp: Vec<serde_json::Value> = Vec::new();
let resp: Vec<serde_json::Value> = Vec::new();
```

This is not a compile error because `serde_json::json!` consumes them by reference. However, if future code attempts to add `rr.push(...)` it will fail to compile (immutable). This is a maintainability trap. Additionally, they add vacuous keys to every API response, increasing payload size and potentially confusing server-side consumers that check for non-empty arrays.

**Fix:** Either mark them `mut` (accepting they are stubs for future use and documenting that explicitly), or remove them from the response until implemented. If left as stubs, add a `// TODO(IMU-xx):` comment so the intent is clear:

```rust
let mut rr: Vec<serde_json::Value> = Vec::new(); // TODO: extract from RR-interval packets
```

---

### WR-03: `compare_expected_json_subset` array semantics comment is misleading — arrays still require exact length match

**File:** `Rust/core/src/fixtures.rs:587`

**Issue:** The comment at line 587 states:

> Arrays use element-wise subset semantics so that new optional fields added to structs (e.g. `I16SeriesSummary::full_samples`) do not break existing fixture expectations.

This is misleading. The code immediately checks `actual_arr.len() != expected_arr.len()` and fails if they differ (lines 597-603). The "subset" semantics only apply to the _contents_ of each array element when they are objects — not to the array length. An existing fixture that lists an `axes` array with 3 elements will still fail if the parser now returns 4 axes.

The comment's stated motivation ("new optional fields added to structs") is addressed at the _object_ level (recursive `compare_expected_json_subset` for objects ignores keys absent from `expected`), not at the array level. The comment incorrectly implies arrays are length-tolerant when they are not.

**Fix:** Rewrite the comment to accurately describe what the code does:

```rust
// Arrays are compared element-by-element with exact length matching.
// Within each element, object comparison uses subset semantics: keys
// present in `actual` but absent from `expected` are silently ignored.
// This allows new optional fields (e.g. I16SeriesSummary::full_samples)
// to be added to struct serializations without breaking existing fixtures
// that omit those fields from their expected object.
```

---

## Info

### IN-01: `IMU_LSB_PER_G` constant lacks citation for the value 3900

**File:** `Rust/core/src/bridge.rs:3078`

**Issue:** The comment says "research-confirmed ~3900 LSB per g" but does not cite the source (capture session ID, datasheet section, or GitHub issue). The constant is load-bearing for all gravity values persisted to SQLite and uploaded to the server. If it is wrong, all stored gravity data is silently miscalibrated.

**Fix:** Add an inline reference to the empirical evidence that confirmed 3900:

```rust
/// WHOOP accelerometer scale factor (ICM-45686 at ±16 g full-scale, confirmed
/// empirically from capture session <id>; see also planning/21-02-PLAN.md).
/// Divide each raw i16 sample by this constant to obtain acceleration in g.
const IMU_LSB_PER_G: f64 = 3900.0;
```

---

_Reviewed: 2026-06-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
