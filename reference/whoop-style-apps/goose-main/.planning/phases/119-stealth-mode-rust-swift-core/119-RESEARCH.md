# Phase 119: Stealth Mode (Rust + Swift core) - Research

**Researched:** 2026-06-26
**Domain:** Swift value types, UserDefaults, CoachLocalToolContext masking
**Confidence:** HIGH

## Summary

Phase 119 delivers three pure-Swift types in one new file (`GooseStealthMode.swift`) and a
single modification to `CoachLocalToolContext.swift`. All decisions are locked in CONTEXT.md;
research focuses on confirming the exact call sites, metric key strings, and project patterns
so the planner can write precise tasks without ambiguity.

The most important finding: `CoachLocalToolContext` does **not** emit the 6 metric names as
top-level keys in a flat dict. Scores live inside `loadStats["scores"]` under short keys
(`"recovery"`, `"strain"`, `"sleep"`, `"stress"`). HRV RMSSD and Resting HR are not emitted
as named keys at all — they flow through `healthMonitorSnapshots()` → `vitals()` where each
snapshot is a dict with `"id"`, `"title"`, `"value"`, etc. The CONTEXT.md D-05 lists 6 metric
keys to mask; the planner must reconcile these with the actual JSON structure (see Architecture
Patterns below).

The codebase has exactly two call sites for `CoachLocalToolContext.build()`, both in
`CoachChatModel.swift` — both need the `mask:` parameter. No other files call it.

**Primary recommendation:** The planner should create two plans: Plan A creates
`GooseStealthMode.swift` and registers it in `project.pbxproj` (4 locations); Plan B patches
`CoachLocalToolContext.swift` and both call sites in `CoachChatModel.swift`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: All three types in one file: `GooseSwift/GooseStealthMode.swift`
- D-02: `StealthStorage` is a caseless enum with 6 `static let` string constants
  using `"goose.swift.stealth.{metric_name}"` convention
- D-03: `GooseStealthMode` is a struct with `static func isHidden(metric: String) -> Bool`
  reading `UserDefaults.standard.bool(forKey:)`; returns false for unknown metrics
- D-04: `StealthMask` is a struct with `hidden: Set<String>`, `isHidden(_ metric: String) -> Bool`,
  and `static let none = StealthMask(hidden: [])`
- D-05: `build()` gains `mask: StealthMask = .none`; inside, check `mask.isHidden(metric)` before
  emitting any of the 6 metric values; substitute `"hidden_by_user"` if true; key is preserved
- D-06: Sentinel string is `"hidden_by_user"`

### Claude's Discretion
- `StealthMask` is built once per Coach session start, not re-read on every token
- `GooseStealthMode` reads `UserDefaults.standard` directly (no DI)
- No `@Published` state for hidden set — Phase 122 handles reactivity
- No persistence migration needed — false default covers new installs

### Deferred Ideas (OUT OF SCOPE)
- STEALTH-03: Settings toggle UI list — Phase 122
- STEALTH-04: Dashboard "—" rendering — Phase 122
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STEALTH-01 | `GooseStealthMode.isHidden(metric:)` + `StealthStorage` enum with `static let` UserDefaults keys for 6 metrics | Confirmed UserDefaults bool(forKey:) pattern; caseless enum with static let is established in codebase (`RemoteServerStorage`, `CoreBluetoothBLETransport.DefaultsKey`) |
| STEALTH-02 | `StealthMask` value type passed into `CoachLocalToolContext.build()`; hidden metric values replaced with `"hidden_by_user"` sentinel; Coach still receives full unmasked data | Confirmed two call sites in CoachChatModel.swift; confirmed build() signature; metric JSON structure mapped |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stealth preference storage | iOS app (UserDefaults) | — | Per-user setting, device-local, no server sync needed |
| Stealth query (isHidden) | iOS app model layer | — | Pure UserDefaults read, no UI dependency |
| Coach context masking | iOS app model layer (CoachLocalToolContext) | — | Applied at context-build time, before JSON serialisation |
| Toggle UI (Phase 122) | iOS UI layer | UserDefaults write | Out of scope for this phase |

## Standard Stack

No external packages. Pure Swift + Foundation.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Foundation | iOS 26 SDK | UserDefaults, Set, String | Already imported everywhere |
| XCTest | iOS 26 SDK | Unit tests for pure value types | Existing test target |

## Package Legitimacy Audit

No external packages introduced in this phase.

## Architecture Patterns

### System Architecture Diagram

```
CoachChatModel.swift
  │
  ├── toolContextProvider closure (line 116)
  │     └── CoachLocalToolContext.build(healthStore:appModel:healthState:mask:)
  │                                                                      ↑
  └── buildSystemPrompt() (line 163)                                StealthMask
        └── CoachLocalToolContext.build(healthStore:appModel:healthState:mask:)
                                                                         ↑
                                                              built from GooseStealthMode
                                                              (reads UserDefaults)
```

### Recommended Project Structure

```
GooseSwift/
├── GooseStealthMode.swift     ← NEW: StealthStorage, GooseStealthMode, StealthMask
├── CoachLocalToolContext.swift ← MODIFIED: mask param + masking logic
├── CoachChatModel.swift        ← MODIFIED: pass mask at both build() call sites
GooseSwiftTests/
└── GooseStealthModeTests.swift ← NEW: unit tests for all three types
```

### Pattern 1: Caseless Enum as Key Namespace (UserDefaults)

Established by `RemoteServerStorage` and `CoreBluetoothBLETransport.DefaultsKey`:

```swift
// Source: GooseSwift/RemoteServerPersistence.swift (lines 4-7), confirmed in codebase
enum RemoteServerStorage {
  static let serverURL    = "goose.remote.serverURL"
  static let uploadEnabled = "goose.remote.uploadEnabled"
}

// Usage pattern (GooseUploadService.swift line 86):
UserDefaults.standard.bool(forKey: RemoteServerStorage.uploadEnabled)
```

Apply same pattern for `StealthStorage`:

```swift
// Source: confirmed pattern from codebase
enum StealthStorage {
  static let recoveryScore = "goose.swift.stealth.recovery_score"
  static let strainScore   = "goose.swift.stealth.strain_score"
  static let hrvRmssd      = "goose.swift.stealth.hrv_rmssd"
  static let restingHr     = "goose.swift.stealth.resting_hr"
  static let sleepPerf     = "goose.swift.stealth.sleep_performance"
  static let stressScore   = "goose.swift.stealth.stress_score"
}
```

`[VERIFIED: codebase grep — RemoteServerPersistence.swift, CoreBluetoothBLETransport.swift]`

### Pattern 2: Static Bool Toggle Read

```swift
// Source: GooseSwift/GooseHealthKitExporter.swift (lines 19-21)
static var isExportEnabled: Bool {
  UserDefaults.standard.bool(forKey: exportEnabledKey)
}
```

`bool(forKey:)` returns `false` when the key is absent — no explicit default needed.
`[VERIFIED: codebase grep — GooseHealthKitExporter.swift, GooseUploadService.swift]`

### Pattern 3: File Structure — GooseHealthKitExporter.swift model

```swift
// Source: GooseSwift/GooseHealthKitExporter.swift
// Header comment block explaining purpose, entry points, threading, error handling
// enum GooseFoo { ... }  (caseless enum for namespace)
// MARK: - Section Name
// static methods only; no instance state
```

`GooseStealthMode.swift` follows the same shape:
- File-level comment explaining purpose and threading
- Three types in order: `StealthStorage`, `GooseStealthMode`, `StealthMask`
- No instance state on any type

`[VERIFIED: codebase — GooseHealthKitExporter.swift read directly]`

### Pattern 4: CoachLocalToolContext.build() — exact current signature

```swift
// Source: GooseSwift/CoachLocalToolContext.swift (lines 4-9)
@MainActor
enum CoachLocalToolContext {
  static func build(
    healthStore: HealthDataStore,
    appModel: GooseAppModel,
    healthState: HealthState
  ) -> [String: Any]
```

New signature after Phase 119:

```swift
  static func build(
    healthStore: HealthDataStore,
    appModel: GooseAppModel,
    healthState: HealthState,
    mask: StealthMask = .none
  ) -> [String: Any]
```

`[VERIFIED: codebase — CoachLocalToolContext.swift read directly]`

### Critical Finding: Metric Key Mapping in Coach JSON

The CONTEXT.md D-05 lists 6 metrics to mask. Their actual locations in the Coach JSON output:

| D-05 metric name | Actual JSON path in build() output | JSON key |
|------------------|------------------------------------|---------|
| `recovery` | `tools.load_stats.scores.recovery` | `"recovery"` |
| `strain` | `tools.load_stats.scores.strain` | `"strain"` |
| `sleep_performance` | `tools.load_stats.scores.sleep` | `"sleep"` |
| `stress_score` | `tools.load_stats.scores.stress` | `"stress"` |
| `hrv_rmssd` | `tools.load_stats.vitals[n].value` where `id == "health-monitor"` | via `snapshot()` |
| `resting_hr` | `tools.load_stats.vitals[n].value` where `id == "resting-hr"` | via `snapshot()` |

The scores dict (`"recovery"`, `"strain"`, `"sleep"`, `"stress"`) is straightforward to mask
by key name. The vitals snapshots are trickier — they pass through `healthMonitorSnapshots()`
and are formatted by `snapshot()` using `snapshot.id` as the identifier, not a metric string.

**Recommended masking approach for planner:**

For scores (keys `"recovery"`, `"strain"`, `"sleep"`, `"stress"`):
```swift
// Inside loadStats(), in the "scores" dict:
"recovery": mask.isHidden("recovery") ? "hidden_by_user" : healthStore.recoveryFeatureScoreSummary(),
"strain":   mask.isHidden("strain")   ? "hidden_by_user" : healthStore.strainFeatureScoreSummary(),
"sleep":    mask.isHidden("sleep")    ? "hidden_by_user" : healthStore.sleepFeatureScoreSummary(),
"stress":   mask.isHidden("stress")   ? "hidden_by_user" : healthStore.stressFeatureScoreSummary(),
```

For hrv_rmssd and resting_hr — vitals go through `healthMonitorSnapshots()` → `snapshot()`.
The `snapshot()` helper emits `"value": snapshot.displayValue`. To mask these:
- Pass `mask` into `vitals()` helper (already private static)
- Inside `vitals()`, after building the rows array, walk the rows and replace `.value` for
  snapshot IDs `"health-monitor"` (hrv) and `"resting-hr"` (resting HR) if masked

OR: pass `mask` into `snapshot()` as an optional parameter and apply there.

The planner should choose the approach that keeps `snapshot()` generic. The simplest
correct approach: post-process `rows` in `vitals()` before returning:

```swift
private static func vitals(
  healthStore: HealthDataStore,
  appModel: GooseAppModel,
  mask: StealthMask
) -> [[String: Any]] {
  var rows = healthStore.healthMonitorSnapshots(...).map(snapshot)
  // apply hrv mask
  if mask.isHidden("hrv_rmssd"),
     let i = rows.firstIndex(where: { ($0["id"] as? String) == "health-monitor" }) {
    rows[i]["value"] = "hidden_by_user"
  }
  // apply resting_hr mask
  if mask.isHidden("resting_hr"),
     let i = rows.firstIndex(where: { ($0["id"] as? String) == "resting-hr" }) {
    rows[i]["value"] = "hidden_by_user"
  }
  // live heart rate row inserted at 0 — not masked (it's live, not a stored metric)
  rows.insert([...], at: 0)
  return rows
}
```

`[VERIFIED: codebase — CoachLocalToolContext.swift read directly; HealthDataStore+Snapshots.swift confirmed snapshot IDs "resting-hr" (line 284) and "health-monitor" (line 234)]`

### Pattern 5: XCTest unit test structure for pure Swift types

```swift
// Source: GooseSwiftTests/GooseBLETypesTests.swift (confirmed in codebase)
import XCTest
import CoreBluetooth      // only when needed; omit if type-under-test has no framework deps
@testable import GooseSwift

final class GooseStealthModeTests: XCTestCase {

  // MARK: - StealthMask tests

  func testStealthMask_none_isHiddenReturnsFalse() {
    XCTAssertFalse(StealthMask.none.isHidden("recovery"))
  }

  func testStealthMask_hiddenSet_returnsTrue() {
    let mask = StealthMask(hidden: ["recovery", "strain"])
    XCTAssertTrue(mask.isHidden("recovery"))
    XCTAssertTrue(mask.isHidden("strain"))
    XCTAssertFalse(mask.isHidden("sleep"))
  }

  func testStealthMask_unknownMetric_returnsFalse() {
    let mask = StealthMask(hidden: ["recovery"])
    XCTAssertFalse(mask.isHidden("totally_unknown_key"))
  }

  // MARK: - StealthStorage key constants

  func testStealthStorage_keyFormat() {
    XCTAssertEqual(StealthStorage.recoveryScore, "goose.swift.stealth.recovery_score")
    XCTAssertEqual(StealthStorage.strainScore,   "goose.swift.stealth.strain_score")
    XCTAssertEqual(StealthStorage.hrvRmssd,      "goose.swift.stealth.hrv_rmssd")
    XCTAssertEqual(StealthStorage.restingHr,     "goose.swift.stealth.resting_hr")
    XCTAssertEqual(StealthStorage.sleepPerf,     "goose.swift.stealth.sleep_performance")
    XCTAssertEqual(StealthStorage.stressScore,   "goose.swift.stealth.stress_score")
  }

  // MARK: - GooseStealthMode.isHidden UserDefaults integration

  func testGooseStealthMode_absentKey_returnsFalse() {
    // Uses a unique key that will never be set
    XCTAssertFalse(GooseStealthMode.isHidden(metric: "nonexistent_metric"))
  }

  func testGooseStealthMode_setKeyTrue_returnsTrue() {
    let key = StealthStorage.recoveryScore
    UserDefaults.standard.set(true, forKey: key)
    XCTAssertTrue(GooseStealthMode.isHidden(metric: "recovery_score"))
    UserDefaults.standard.removeObject(forKey: key)  // cleanup
  }
}
```

`[VERIFIED: codebase — GooseBLETypesTests.swift pattern confirmed; no mocks needed for value types]`

### Pattern 6: Xcode project.pbxproj registration (new Swift file)

Adding `GooseStealthMode.swift` requires edits at **exactly 4 locations** in
`GooseSwift.xcodeproj/project.pbxproj`:

1. `PBXBuildFile` stanza — `E1...UUID` referencing the file
2. `PBXFileReference` stanza — `E2...UUID` declaring the file
3. `PBXGroup` children list — inserts filename into the source group
4. `PBXSourcesBuildPhase` files list — adds `E1...UUID` to compile sources

Use an adjacent file (e.g. `CaptureFrameWriteQueue.swift`) as the UUID anchor.
Verify with: `grep -c 'GooseStealthMode.swift' project.pbxproj` — expected: `4`.

`[VERIFIED: codebase rule cs:s1-448 — confirmed in prior phase work on this project]`

### Anti-Patterns to Avoid

- **Using string literals at call sites instead of StealthStorage constants:** Phase 122
  will need to read and write the same keys; always route through `StealthStorage`.
- **Reading UserDefaults inside `@MainActor` synchronously in a hot path:** `isHidden()` is
  a single `bool(forKey:)` call and is fast; this is not a concern at this scale.
- **Calling `CoachLocalToolContext.build()` with mask from a background queue:** `build()` is
  `@MainActor`; mask must be constructed on whatever thread calls `build()` — which is already
  `@MainActor` in both call sites.
- **Modifying `snapshot()` to accept a mask:** Keep `snapshot()` generic. Apply masking in
  `vitals()` by post-processing the rows array, not inside the serialisation helper.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Key-absent default for bool | Custom default-value wrapper | `UserDefaults.standard.bool(forKey:)` | Returns `false` when absent — correct default is already the system default |
| Metric set lookup | Linear search | `Set<String>.contains()` | O(1) lookup; `StealthMask.hidden` is already a `Set<String>` per D-04 |

## Call Site Inventory — CoachLocalToolContext.build()

Both call sites are in `GooseSwift/CoachChatModel.swift`. Both must pass the mask.

**Call site 1 — line 116** (inside `toolContextProvider` closure for ChatGPTCoachProvider):

```swift
// Current (CoachChatModel.swift line 116):
return CoachLocalToolContext.build(healthStore: healthStore, appModel: appModel, healthState: healthState)

// After Phase 119 — mask is built from GooseStealthMode at session start and captured in closure:
return CoachLocalToolContext.build(healthStore: healthStore, appModel: appModel, healthState: healthState, mask: mask)
```

**Call site 2 — line 163** (inside `buildSystemPrompt()`):

```swift
// Current (CoachChatModel.swift line 163):
let context = CoachLocalToolContext.build(healthStore: healthStore, appModel: appModel, healthState: healthState)

// After Phase 119:
let context = CoachLocalToolContext.build(healthStore: healthStore, appModel: appModel, healthState: healthState, mask: mask)
```

The `mask` value at both sites is built once per `send()` invocation from
`GooseStealthMode` before `sendTask` is created. The planner should decide whether to build
the mask in `send()` and pass it down, or build it inside `buildSystemPrompt()` and the
closure independently (both are acceptable since `StealthMask` is a cheap value type).

`[VERIFIED: codebase — CoachChatModel.swift lines 100–175 read directly]`

## Common Pitfalls

### Pitfall 1: Mask metric name mismatch

**What goes wrong:** `StealthStorage` keys use `"goose.swift.stealth.recovery_score"` but
`CoachLocalToolContext` uses `"recovery"` (short form) as the JSON key. If
`mask.isHidden("recovery_score")` is tested against the Coach JSON key `"recovery"`, nothing
is masked.

**Why it happens:** The 6 metric names in CONTEXT.md D-02 (`recovery_score`, `strain_score`,
etc.) are the UserDefaults key suffixes — they are NOT the JSON keys emitted by
`CoachLocalToolContext`. The JSON keys are `"recovery"`, `"strain"`, `"sleep"`, `"stress"`.

**How to avoid:** Define the `StealthMask.hidden` set contents using the same short strings
that `CoachLocalToolContext` checks — i.e., when building a mask from `GooseStealthMode`,
map from the storage key suffix to the Coach JSON key. Example:

```swift
// Build mask at call site — map storage key suffixes to Coach JSON keys
var hidden = Set<String>()
if GooseStealthMode.isHidden(metric: "recovery_score")  { hidden.insert("recovery") }
if GooseStealthMode.isHidden(metric: "strain_score")    { hidden.insert("strain") }
if GooseStealthMode.isHidden(metric: "sleep_performance") { hidden.insert("sleep") }
if GooseStealthMode.isHidden(metric: "stress_score")    { hidden.insert("stress") }
if GooseStealthMode.isHidden(metric: "hrv_rmssd")       { hidden.insert("hrv_rmssd") }
if GooseStealthMode.isHidden(metric: "resting_hr")      { hidden.insert("resting_hr") }
let mask = StealthMask(hidden: hidden)
```

`isHidden(metric:)` accepts the storage-suffix form (`"recovery_score"`); `StealthMask.hidden`
stores the Coach-JSON-key form (`"recovery"`). This mapping lives at the call site.

**Warning signs:** Unit tests pass for `StealthMask` in isolation but Coach JSON still shows
unmasked values end-to-end.

### Pitfall 2: Missing Xcode project registration

**What goes wrong:** `GooseStealthMode.swift` is created on disk but not added to
`project.pbxproj`. Build succeeds only if another already-compiled file imports nothing from
the new file; the Swift compiler will report "cannot find type 'StealthMask' in scope" at the
`CoachLocalToolContext.swift` edit site.

**Why it happens:** This project has no SPM manifest at root; files must be manually
registered in `project.pbxproj` at 4 locations (see Pattern 6 above).

**How to avoid:** After writing the file, immediately run `grep -c 'GooseStealthMode.swift'
GooseSwift.xcodeproj/project.pbxproj` and confirm count is `4`.

### Pitfall 3: vitals row mutation after insert

**What goes wrong:** `vitals()` inserts the live-heart-rate row at index 0 _after_ building
the snapshots. If masking is applied after the insert, the index arithmetic for
`"health-monitor"` and `"resting-hr"` may be off by one.

**How to avoid:** Apply masking to `rows` _before_ the `rows.insert(...)` at index 0.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | XCTest (iOS 26 SDK) |
| Config file | GooseSwiftTests/ target in GooseSwift.xcodeproj |
| Quick run command | `xcodebuild test -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing GooseSwiftTests/GooseStealthModeTests CODE_SIGNING_ALLOWED=NO 2>&1 | grep -E 'passed|failed|error:'` |
| Full suite command | `xcodebuild test -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO 2>&1 | grep -E 'passed|failed|error:'` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STEALTH-01 | `StealthStorage` key constants correct format | unit | `GooseStealthModeTests/testStealthStorage_keyFormat` | Wave 0 |
| STEALTH-01 | `GooseStealthMode.isHidden` returns false for absent key | unit | `GooseStealthModeTests/testGooseStealthMode_absentKey_returnsFalse` | Wave 0 |
| STEALTH-01 | `GooseStealthMode.isHidden` returns true when UserDefaults set | unit | `GooseStealthModeTests/testGooseStealthMode_setKeyTrue_returnsTrue` | Wave 0 |
| STEALTH-02 | `StealthMask.none` — no metrics hidden | unit | `GooseStealthModeTests/testStealthMask_none_isHiddenReturnsFalse` | Wave 0 |
| STEALTH-02 | `StealthMask` with populated set returns correct booleans | unit | `GooseStealthModeTests/testStealthMask_hiddenSet_returnsTrue` | Wave 0 |
| STEALTH-02 | `StealthMask` unknown metric returns false | unit | `GooseStealthModeTests/testStealthMask_unknownMetric_returnsFalse` | Wave 0 |

### Wave 0 Gaps

- [ ] `GooseSwiftTests/GooseStealthModeTests.swift` — covers all STEALTH-01 and STEALTH-02 unit tests

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes (metric key lookup) | `Set<String>.contains()` — no user-supplied key reaches UserDefaults write path |
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no (local toggle only) | — |
| V6 Cryptography | no | — |

**Threat patterns:**

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unexpected metric key in `isHidden` | Tampering | Returns `false` for unknown keys — safe default; no crash path |
| UserDefaults key collision with another module | Tampering | Namespaced under `"goose.swift.stealth.*"` — no collisions with existing keys |

## Environment Availability

This phase is code/config changes only — no external dependencies beyond the existing Xcode
toolchain.

Step 2.6: SKIPPED (no external tools, services, or CLIs required beyond existing Xcode build).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Snapshot ID for HRV snapshots is `"health-monitor"` | Architecture Patterns / Critical Finding | Wrong ID means HRV masking is silently no-op; verify with `grep -n '"health-monitor"' HealthDataStore+Snapshots.swift` |
| A2 | Snapshot ID for resting HR is `"resting-hr"` | Architecture Patterns / Critical Finding | Wrong ID means resting HR masking is silently no-op; verify with `grep -n '"resting-hr"' HealthDataStore+Snapshots.swift` |

Both A1 and A2 are derived from direct codebase reads of `HealthDataStore+Snapshots.swift`
lines 234 and 284 respectively — confidence is HIGH but listed for explicit planner awareness.

## Open Questions

1. **Mapping approach for `GooseStealthMode.isHidden(metric:)` argument**
   - What we know: The method accepts a metric string. StealthStorage keys use `"recovery_score"`
     suffix; Coach JSON uses `"recovery"`.
   - What's unclear: Should `isHidden(metric:)` accept the storage-suffix form (e.g.
     `"recovery_score"`) or the Coach-JSON-key form (e.g. `"recovery"`)? The CONTEXT.md D-03
     shows it accepts `"recovery_score"` etc. but D-05 says mask is checked with the Coach
     JSON key.
   - Recommendation: `isHidden(metric:)` accepts the storage-suffix form. The call site in
     `CoachChatModel` builds `StealthMask.hidden` using Coach-JSON-key form. The translation
     happens once, at mask-construction time. This is the cleanest separation.

## Sources

### Primary (HIGH confidence)
- Codebase direct reads: `CoachLocalToolContext.swift` (full file), `CoachChatModel.swift`
  (lines 100-175), `CoreBluetoothBLETransport.swift` (lines 350-380),
  `RemoteServerPersistence.swift`, `GooseHealthKitExporter.swift` (lines 1-55),
  `GooseBLETypesTests.swift` (full), `HealthDataStore+Snapshots.swift` (grep),
  `.planning/config.json`

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions — authored by the discuss-phase agent based on user input

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no packages, pure Swift
- Architecture (call sites): HIGH — verified by direct grep + file reads
- Metric key mapping: HIGH — verified by reading CoachLocalToolContext.swift in full
- Pitfalls: HIGH — derived directly from codebase structure
- Test patterns: HIGH — existing test file read directly

**Research date:** 2026-06-26
**Valid until:** Stable — only invalidated if CoachLocalToolContext.swift is refactored
