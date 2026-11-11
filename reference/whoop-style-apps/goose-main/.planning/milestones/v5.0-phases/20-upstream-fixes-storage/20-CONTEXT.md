# Phase 20: Upstream Fixes & Storage - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Apply 5 Gen4 historical sync correctness fixes from upstream PR #26 review (SYNC-01–05) and eliminate the `body_hex` field duplication in cached parsed-payload JSON for K10/K21 frames (PERF-05). All fixes are surgical and independent — no user-facing behavior changes.

**SYNC-01:** `AppShellView.swift` — `onHistoricalSyncCompleted` closure captures `healthStore` weakly + `.onDisappear` cleanup (retain cycle fix).
**SYNC-02:** `GooseBLEClient+HistoricalHandlers.swift` — all `gen4HistoricalPageSeq` increments use wrapping arithmetic (`&+=`).
**SYNC-03:** `GooseBLETypes.swift` — `buildGen4CommandFrame` 4-byte padding confirmed or documented.
**SYNC-04:** `GooseBLEClient.swift` — `activeDeviceGeneration` has queue-confinement doc comment.
**SYNC-05:** `GooseBLEClient+Parsing.swift` — UUID normalised to lowercase before `hasPrefix("61080002")`. (Note: line 359 already uses `lower.hasPrefix("61080001")` — may already be done; verify.)
**PERF-05:** `Rust/core/src/protocol.rs` — add `body_hex` assertions to K10/K21 tests in `protocol_tests.rs` first, then exclude `body_hex` from `parse_frame_batch` for K10/K21 frames.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure/fixes phase. Fixes are surgical: minimal diffs, no refactoring, no new abstractions. Each fix addressed independently. K10/K21 `body_hex` assertions must be added to tests BEFORE the exclusion is applied (test-first).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GooseBLEClient+HistoricalHandlers.swift` — historical sync handler; look for gen4HistoricalPageSeq increments
- `GooseBLEClient+Parsing.swift:359` — already uses `lower.hasPrefix("61080001")` for Gen4 detection; check `hasPrefix("61080002")` for command UUID
- `Rust/core/src/protocol.rs:515` — `body_hex: hex::encode(&payload[13.min(payload.len())..])` is the field to conditionally exclude for K10/K21

### Established Patterns
- Swift fixes: minimal `[weak self]`/`[weak x]` capture lists; `dispatchPrecondition` for queue confinement comments
- Rust: conditional field via `if matches!(frame_type, K10 | K21) { None } else { Some(body_hex) }` pattern

### Integration Points
- `cargo test -p goose-core` must pass before and after PERF-05
- `xcodebuild` must pass after all SYNC-* fixes

</code_context>

<specifics>
## Specific Ideas

- SYNC-05 may already be partially done — `lower.hasPrefix("61080001")` exists at `GooseBLEClient+Parsing.swift:359`. Verify whether the command UUID prefix `"61080002"` also uses lowercase before proceeding.
- PERF-05: add K10/K21 `body_hex` assertions FIRST (test-first order), then apply exclusion. This matches the success criterion order.
- Research confirms `protocol.rs:515` is the exact location of `body_hex` field construction.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped; all fixes are in scope and unambiguous.

</deferred>
