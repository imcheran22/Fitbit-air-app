---
phase: 92-export-auth-bug-fixes
plan: "01"
subsystem: export-pipeline
tags: [bug-fix, memory, rust-bridge, swift]
status: complete
completed: 2026-06-19T10:07:57Z
duration: "7m"
tasks_completed: 2
tasks_total: 2
files_modified:
  - Rust/core/src/bridge.rs
  - GooseSwift/MoreDataStore.swift
  - GooseSwift/MoreDataStore+Validation.swift
  - GooseSwift/GooseLocalDataExporter.swift
requires: []
provides:
  - manifest-by-reference-pipeline
  - validate-dedup
affects:
  - export-validation-sidecars
tech_stack:
  added: []
  patterns:
    - manifest-path-over-ffi
    - hoist-pure-computation
key_files:
  created: []
  modified:
    - Rust/core/src/bridge.rs
    - GooseSwift/MoreDataStore.swift
    - GooseSwift/MoreDataStore+Validation.swift
    - GooseSwift/GooseLocalDataExporter.swift
decisions:
  - Inlined manifest-to-disk write in performRawExport rather than changing writeRawValidationSidecars signature; added writeManifestToDisk() and writeValidationSidecarsAfterManifest() helpers instead
  - Both Rust structs use dual-optional fields (manifest + manifest_path) for backwards compatibility; existing callers passing manifest dict continue to work
  - validate() hoisted before do block in createBundle(); baseValidation binding reused in both paths — pure refactor, no behavior change
requirements:
  - BUG-EXP-01
  - BUG-EXP-03
---

# Phase 92 Plan 01: Fix Export OOM — Manifest By-Reference + validate() Dedup Summary

Release in-memory validation manifest dict after disk write; pass file path to downstream bridge calls. Remove redundant validate() call from createBundle().

## What Was Built

### Rust bridge: dual-optional manifest args (BUG-EXP-01, D-07)

`LocalHealthValidationManifestRunbookArgs` and `LocalHealthValidationManifestReviewArgs` in `Rust/core/src/bridge.rs` now accept either `manifest_path: Option<String>` (preferred — reads JSON from disk) or `manifest: Option<serde_json::Value>` (backwards-compatible fallback). Both fields are `Option` with `#[serde(default)]` so existing callers omitting either field continue to work.

Both bridge functions resolve the manifest at the top of the function body: if `manifest_path` is `Some`, read and parse the file; else use the in-memory dict; else return an error. The JSON response shape is unchanged.

### Swift: manifest by-reference pipeline (BUG-EXP-01, D-05, D-06)

`performRawExport` in `MoreDataStore.swift` was restructured:

1. `validation.local_health_manifest_scaffold` → `manifest` dict (unchanged)
2. `writeManifestToDisk(manifest:bundlePath:outputDirectory:)` → writes manifest JSON to disk, returns `manifestURL` — the in-memory dict is not referenced after this point
3. Guard that `manifestURL` is non-nil; throw descriptive NSError if sidecar write produced no path
4. `validation.local_health_manifest_review` called with `["manifest_path": manifestURL.path]`
5. `validation.local_health_manifest_runbook` called with `["manifest_path": manifestURL.path]` — runbook markdown extracted from `["markdown"]` key inline
6. `writeValidationSidecarsAfterManifest(manifestURL:review:reviewStatus:runbookMarkdown:)` writes review JSON and runbook MD alongside the already-written manifest

Two new helpers added to `MoreDataStore+Validation.swift`:
- `writeManifestToDisk(_:bundlePath:outputDirectory:) -> URL?` — writes only the manifest; returns the sidecar URL
- `writeValidationSidecarsAfterManifest(manifestURL:review:reviewStatus:runbookMarkdown:) -> RawValidationSidecarResult` — writes review + runbook files relative to the manifest URL

The existing `writeRawValidationSidecars` is unchanged (still used by other callers if any).

### Swift: remove redundant validate() in createBundle() (BUG-EXP-03, D-09)

`createBundle()` in `GooseLocalDataExporter.swift` previously called `validate()` twice with identical arguments: once inside the `do` block for the bundle JSON summary, and again after the `do/catch` block for `resultValidation`. Both calls are now replaced by a single `let baseValidation = validate(...)` hoisted before the `do` block. The result is reused in both paths via `sourceReadFailureIssues.reduce(baseValidation)`. Pure refactor — no behavior change.

## Verification Results

1. `cargo check` in `Rust/core` — zero errors
2. `grep -n "manifest_path" GooseSwift/MoreDataStore.swift` — 3 matches (comment + 2 bridge call args)
3. `grep -n "baseValidation" GooseSwift/GooseLocalDataExporter.swift` — 3 matches (let binding + 2 reduce calls)
4. Both Rust structs: `manifest: Option<serde_json::Value>` and `manifest_path: Option<String>`

## Commits

| Hash | Message |
|------|---------|
| `673fb9a` | fix(92-01): update manifest bridge args to accept manifest_path |
| `28fbb81` | fix(92-01): manifest by-reference pipeline + remove redundant validate() |

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Added writeManifestToDisk() and writeValidationSidecarsAfterManifest() helpers**
- **Found during:** Task 2
- **Issue:** The plan suggested either updating `rawValidationRunbookMarkdown`'s signature or inlining the bridge call; `writeRawValidationSidecars` writes manifest+review+runbook atomically, so restructuring `performRawExport` to use manifest_path required splitting the write into two phases
- **Fix:** Added two focused helpers to `MoreDataStore+Validation.swift` rather than changing the existing `writeRawValidationSidecars` signature, keeping existing callers intact
- **Files modified:** `GooseSwift/MoreDataStore+Validation.swift`

No other deviations — plan executed as specified.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The manifest file was already written to disk (app sandbox); path is now passed as a string argument over the FFI bridge. The Rust bridge validates the path by reading the file and returns a `GooseError::message` on failure — no crash or panic path.

## Known Stubs

None.

## Self-Check: PASSED

- `Rust/core/src/bridge.rs` modified: confirmed (struct fields + function bodies)
- `GooseSwift/MoreDataStore.swift` modified: confirmed (manifest_path in performRawExport)
- `GooseSwift/MoreDataStore+Validation.swift` modified: confirmed (two new helpers)
- `GooseSwift/GooseLocalDataExporter.swift` modified: confirmed (baseValidation hoisted)
- Commits `673fb9a` and `28fbb81`: confirmed in git log
- cargo check: zero errors
