---
status: resolved
trigger: "Export crash on all presets — any selection crashes after 2–3 seconds on large databases (> 100 MB)"
created: 2026-06-14
updated: 2026-06-20
resolution: "Fixed in v13.0 Phase 92 (BUG-EXP-01..04) — manifest by-reference in validation pipeline; runFullRawExport defaults fixed; sqlite button disabled at 20 MB."
issue: "https://github.com/tigercraft4/goose/issues/155"
reporter: "@andrii-tropin (Discussion #128)"
---

## Symptoms

- **Reported by:** @andrii-tropin (Discussion #128, comment 17298820)
- Any export preset (Frames & Metrics, Full Diagnostic, Include Database, Custom) crashes ~2–3s after tap
- Crash is silent — no error message, instant kill (memory-pressure termination by OS)
- Distinct from PR #145 OOM fix (SQLite excluded from defaults, includeRawBytes off)
- Reporter's database: 181 MB export archive confirmed from decoded files

## Root Cause (primary)

`performRawExport` runs three sequential Rust bridge calls after `export.raw_timeframe` completes.
The second and third calls pass the full manifest dictionary as a bridge argument:

**`GooseSwift/MoreDataStore.swift` ~line 560**
```swift
let manifest = try bridge.request(
    method: "validation.local_health_manifest_scaffold",
    args: validationManifestArgs
)
let review = try bridge.request(
    method: "validation.local_health_manifest_review",
    args: ["manifest": manifest]    // ← full dict serialised to JSON again
)
let runbook = try bridge.request(
    method: "validation.local_health_manifest_runbook",
    args: ["manifest": manifest]    // ← full dict serialised to JSON again
)
```

For a 130+ MB database:
1. `manifest_scaffold` returns a large dictionary held in memory
2. `GooseRustBridge.request()` serialises `["manifest": manifest]` to JSON before sending to Rust
3. The intermediate JSON allocation on top of the held dict exhausts iOS budget ~2–3s in
4. OS kills process (memory-pressure termination — no crash log)

## Additional Bugs

### Bug 1 — `runFullRawExport()` bypasses PR #145 defaults
**`GooseSwift/MoreDataStore+Validation.swift:82`**
```swift
func runFullRawExport() {
    includeRawBytes = true                       // overrides PR #145 default
    selectedRawFamilies = Set(Self.rawFamilies)  // includes sqlite family
    runRawExport()
}
```

### Bug 2 — `validate()` called twice in `createBundle()`
**`GooseLocalDataExporter.swift:543` and `:578`**
First call result is shadowed and discarded; second call result is used.
Each call invokes `GooseRustBridge().request(method: "storage.check", ...)` — doubles bridge work.

### Bug 3 — "Include Database" button not disabled at OOM-risk sizes
**`GooseSwift/MoreRawExportViews.swift:79`**
`fetchSQLiteDBSizeLabel()` returns "(130MB — OOM risk)" for files > 20 MB but button is never `.disabled`.

### Bug 4 — WAL/SHM trio exported without checkpoint
**`GooseLocalDataExporter+FileSystem.swift` — `shouldIncludeFile`**
Full export includes `goose.sqlite`, `goose.sqlite-wal`, `goose.sqlite-shm` without prior
`PRAGMA wal_checkpoint(FULL)`. The exported main file is missing WAL-only transactions.

## Evidence from Export

- Archive: 181 MB decoded (3 × zip), schema `goose.local-data-export.v1`
- `goose.sqlite` dominant file size
- `goose-ble-live.log`: 2.9 MB
- `hrv-samples.json`: 161 samples
- Crash timing 2–3s matches manifest_scaffold → manifest_review serialisation window

## Fix Direction

1. **Primary:** Make review/runbook calls lazy (on-demand, not auto) — or pass manifest ID not full object
2. **Bug 1:** Guard `runFullRawExport()` with same size check as `fetchSQLiteDBSizeLabel()`
3. **Bug 2:** Remove the first redundant `validate()` call inside the `do { }` block at line 543
4. **Bug 3:** Add `.disabled(store.sqliteDBExceedsOOMThreshold)` to "Include Database" button
5. **Bug 4:** Call `storage.checkpoint` via Rust bridge before exporting SQLite trio

## Related

- Issue #155: https://github.com/tigercraft4/goose/issues/155
- Issue #154: BLE auth failure (same reporter)
- PR #145: Partial fix (SQLite excluded from defaults)
- Discussion #128: https://github.com/tigercraft4/goose/discussions/128
