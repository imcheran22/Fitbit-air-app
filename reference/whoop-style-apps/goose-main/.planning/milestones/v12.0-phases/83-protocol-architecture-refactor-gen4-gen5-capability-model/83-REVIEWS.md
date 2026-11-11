---
phase: 83
reviewers: [gemini, codex]
reviewed_at: 2026-06-14T04:00:00Z
plans_reviewed: [83-01-PLAN.md, 83-02-PLAN.md, 83-03-PLAN.md, 83-04-PLAN.md, 83-05-PLAN.md, 83-06-PLAN.md]
---

# Cross-AI Plan Review — Phase 83

## Gemini Review

Here is the structured feedback on the Phase 83 implementation plans based on a review of the codebase and the proposed `83-*-PLAN.md` documents.

### 1. Plan Quality & Architecture
**Rating: Excellent**
- **Logical Phasing:** The breakdown into 6 plans across 4 waves is perfectly sequenced. By establishing the Rust foundational types (Plan 01) and DB migration (Plan 02) in Wave 1 before altering the bridge boundary (Plan 03) and Swift types (Plan 04/05), the plan guarantees that the codebase remains compilable at each boundary step.
- **Strict Separation of Concerns:** Moving the `DeviceCapabilities` definition entirely to Rust (D-05) ensures that the Swift client remains a thin, capability-driven UI layer rather than hardcoding generation-specific logic.

### 2. Completeness Verification
**Rating: Very Good (with one minor gap)**
- **Coverage:** The plans correctly target all 24 occurrences of `activeDeviceGeneration` and 12 occurrences of `rustDeviceType` across the Swift layer.
- **Oversight Identified:** In `GooseBLEClient+HistoricalHandlers.swift` (lines 80-82), there is currently an explicit mapping:
  ```swift
  switch activeDeviceGeneration {
  case .gen4: deviceType = "GEN4"
  case .gen5: deviceType = "MAVERICK"
  }
  ```
  While **Plan 05** correctly dictates that there should be *"Zero occurrences of activeDeviceGeneration across all Swift files"*, it does not explicitly detail how this specific `MAVERICK` string assignment for the `capture.import_frame_batch` bridge argument will be refactored. The compiler will catch this because `activeDeviceGeneration` is removed, but for complete safety, Plan 05 should explicitly specify that this assignment must be updated to use `connectedCapabilities?.wireProtocol.bridgeString ?? "GOOSE"`.

### 3. Risks & Mitigations
- **Runtime Desync Risk (Bridge Validation vs Swift Payloads):**
  **Plan 03 (Wave 2)** updates `parse_device_type()` to strictly reject `MAVERICK` and `PUFFIN` with a `GooseError`. **Plan 05 (Wave 3)** updates the Swift code to stop sending `MAVERICK`.
  *Risk:* If these waves are executed but not shipped together in the exact same application update, Gen 5 syncs will fail and throw bridge errors.
  *Mitigation:* The wave structure handles this well for the autonomous execution sequence. Just ensure that the entire phase is committed/merged atomically as a single PR.
- **SQLite Migration Overhead:**
  **Plan 02** introduces `UPDATE decoded_frames SET device_type = 'GOOSE' WHERE device_type IN ('MAVERICK', 'PUFFIN');`.
  *Risk:* Because `decoded_frames` is the largest table in the database, this migration might take a moment on startup for users with months of data.
  *Mitigation:* Ensure this query utilizes the existing indices effectively. SQLite handles this robustly, but it's worth noting that the app will block on launch during this schema upgrade.

### Conclusion
The plans are robust, structurally sound, and adhere tightly to the stateless bridge invariants documented in `CLAUDE.md` and `83-CONTEXT.md`. Addressing the minor gap regarding the `MAVERICK` string assignment in `HistoricalHandlers` during Plan 05 execution will ensure a flawless compilation and runtime transition.

---

## Codex Review

**Summary**

The plans are well decomposed and mostly follow the phase boundary, but are not execution-ready yet. The largest issue is that the migration/rejection story does not actually prevent new `MAVERICK` rows: Plan 05 keeps writing `"MAVERICK"` for Gen5 historical direct-write frames, while Plan 03 only rejects `MAVERICK` in `parse_device_type()`, not in `capture.import_frame_batch`. There are also Swift compile and behavior risks around a `private` helper used across files and `connectedCapabilities == nil` silently falling back to Gen5 behavior.

**Strengths**

- Clear wave ordering: Rust foundation, migration, bridge, Swift adoption, final gate.
- Good respect for the stateless Rust bridge constraint; no reassembly state moves into Rust.
- The bridge method plan correctly accounts for `BRIDGE_METHODS` drift tests.
- Migration is simple and idempotent at the SQL level.
- Verification includes both structural grep checks and full Rust test execution.
- The plans correctly preserve `WhoopGeneration` for command frame construction instead of deleting it.

**Concerns**

- **HIGH: New `MAVERICK` rows will still be written after migration.**
  Plan 05 keeps Gen5 historical direct-write frames as `"MAVERICK"` in `GooseBLEClient+HistoricalHandlers.swift:80`. Those frames go through `capture.import_frame_batch`, whose input deserializes `device_type` directly as `DeviceType` in `capture_import.rs:76`, then persists via `device_type_name()` in `store.rs:8918`. Plan 03's `parse_device_type()` rejection does not cover that path.

- **HIGH: The Swift helper visibility will not compile as planned.**
  Plan 04 defines `private func whoopGenerationFromCapabilities()` in `GooseBLEClient+Commands.swift`, then uses it from `Haptics`, `UserActions`, and `HistoricalCommands`. In Swift, `private` is file-scoped here, so other files cannot call it.

- **HIGH: `connectedCapabilities == nil` is not a safe default for Gen4.**
  Plan 04 says nil is safe, but `whoopGenerationFromCapabilities()` defaults to `.gen5`. If the bridge call fails after GATT discovery, Gen4 devices can receive Gen5 command frames. Optional historical guards also mostly fall into the Gen5/stream path when nil.

- **MEDIUM: Swift `WireProtocol` re-conflates identity and protocol.**
  Adding `.hrMonitor` to `WireProtocol` solves string comparisons, but it violates the stated model: wire protocol is Gen4/Gen5, while HR monitor is a device kind/class. This may cause future confusion and drift from the Rust `WireProtocol { Gen4, Gen5 }`.

- **MEDIUM: Puffin mapping is inconsistent with an existing canonical helper.**
  Plan 01 maps `DeviceType::Puffin` to `DeviceKind::Whoop5`, but `openwhoop_reference.rs:166` currently maps Puffin to `None` and has a test asserting that. The plan should explicitly update or preserve that behavior.

- **MEDIUM: `DeviceCapabilities` roundtrip tests may not compile as specified.**
  Plan 01 asks for serialize/deserialize equality tests, but the proposed Rust `DeviceCapabilities` derive list omits `PartialEq`.

- **MEDIUM: Migration tests need more precise setup.**
  `decoded_frames` has an FK to `raw_evidence`, and `open_in_memory()` appears to migrate automatically. The test plan should say whether it inserts legacy rows after an initial migration, inserts required raw evidence rows, then calls `migrate()` again.

- **LOW: Some verification commands are brittle or invalid.**
  Plan 03's combined `cargo test` filter command is not valid cargo usage. Plan 06's `xcodebuild` destination `iPhone 16` may not exist locally, and grepping only the tail of build output can miss warnings.

**Suggestions**

- Change Gen5 historical direct-write `device_type` from `"MAVERICK"` to `"GOOSE"` in Plan 05, or explicitly normalize it before insert. Add a regression test proving `capture.import_frame_batch` no longer stores `MAVERICK`/`PUFFIN`.
- Decide where canonical rejection belongs. If external bridge inputs must reject deprecated names, `capture.import_frame_batch` cannot keep deserializing directly into `DeviceType` without a stricter parser or bridge-layer normalization.
- Move `whoopGenerationFromCapabilities()` to `internal` visibility, or make it an internal computed property on `GooseBLEClient`.
- Do not silently default nil capabilities to Gen5 for command writes. Either block generation-specific commands until capabilities are loaded, or set capabilities deterministically from the Rust bridge and log/fail if the bridge call fails.
- Keep Swift types separated: `DeviceKind { whoop4, whoop5, hrMonitor }`, `WireProtocol { gen4, gen5 }`, and a bridge string derived from device kind, not wire protocol.
- Update `openwhoop_reference.rs` and its tests if Puffin is intentionally reclassified as Gen5-family, or keep Puffin out of `DeviceKind::Whoop5` and document why.
- Strengthen the phase gate with:
  - `rg -n '"MAVERICK"|"PUFFIN"' GooseSwift Rust/core/src` review of production write paths.
  - A Rust bridge test for `capture.import_frame_batch` with deprecated types.
  - Separate cargo test filter invocations.
  - `xcodebuild -showdestinations` or a generic simulator destination before building.

**Risk Assessment**

Overall risk: **HIGH** until the `MAVERICK` write path, Swift helper visibility, and nil-capabilities fallback are fixed. The phase is conceptually sound, but those issues can either break the iOS build or make the DB migration success criteria false immediately after release. After those are corrected, the remaining risk drops to **MEDIUM/LOW** because the refactor is well scoped and heavily verifiable.

---

## Consensus Summary

### Agreed Strengths
- Wave ordering is correct and sound: Rust types → DB migration → Bridge → Swift cleanup → Gate
- Stateless bridge invariant preserved throughout; no Rust state mutation
- `WhoopGeneration` correctly preserved for frame construction (not deleted)
- Migration SQL is idempotent and simple

### Agreed Concerns

**HIGH — MAVERICK write path via `capture.import_frame_batch` not closed**
Both reviewers independently identified that `GooseBLEClient+HistoricalHandlers.swift` writes `"MAVERICK"` for Gen5 frames going into `capture.import_frame_batch`. Plan 03's `parse_device_type()` rejection does not intercept this path (different Rust function). Plan 05 must explicitly change this to `connectedCapabilities?.wireProtocol.bridgeString ?? "GOOSE"` or `"GOOSE"` directly. A regression test for `capture.import_frame_batch` rejecting legacy type strings is needed.

**HIGH (Codex only) — Swift helper `private` scope breaks multi-file use**
`whoopGenerationFromCapabilities()` defined as `private` in `GooseBLEClient+Commands.swift` will not compile when called from `Haptics.swift`, `UserActions.swift`, `HistoricalCommands.swift`. Must be `internal` (the default) or moved to `GooseBLEClient.swift` body.

**HIGH (Codex only) — nil `connectedCapabilities` unsafe for Gen4 command writes**
nil silently defaults to Gen5 behavior. Gen4 devices that fail the bridge call after GATT discovery will receive Gen5 command frames. Needs explicit handling: block commands until capabilities are loaded, or make the bridge call mandatory with error logging.

### Divergent Views
- Gemini focused on structural soundness (positive) and the MAVERICK/HistoricalHandlers gap as a minor completeness issue. Did not review individual plan task bodies due to prompt size.
- Codex reviewed plan task bodies in detail, finding the `private` visibility bug and nil-capabilities risk as additional HIGH severity issues.
- Gemini flagged SQLite migration startup overhead as a low-risk note; Codex did not mention this.
- Codex flagged the `hrMonitor` in `WireProtocol` as a design concern (MEDIUM); Gemini did not review this.

### Priority Actions Before Execute

1. **Fix MAVERICK write path in Plan 05** — explicit replacement of the `HistoricalHandlers.swift:80` switch with `connectedCapabilities?.wireProtocol.bridgeString ?? "GOOSE"`; add `capture.import_frame_batch` regression test
2. **Fix Swift helper visibility** — change `private func whoopGenerationFromCapabilities()` to `internal` or move to `GooseBLEClient.swift`
3. **Fix nil capabilities fallback** — block generation-specific BLE commands until `connectedCapabilities` is loaded, with OSLog warning on nil access
4. **Add `PartialEq` to `DeviceCapabilities` derive** — required for roundtrip equality tests in Plan 01
5. **Fix `cargo test` filter syntax in Plan 03** — use separate `--test` invocations, not combined filter
