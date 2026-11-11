# Phase 121 — Multi-AI Plan Review

**Phase:** 121 — Body Composition UI + HealthKit Import
**Plan:** 121-01-PLAN.md
**Reviewers:** Codex · Gemini · Claude-Reviewer (parallel, independent)
**Date:** 2026-06-27

---

## Cycle 2 — Revised Plan Re-Review

**Date:** 2026-06-27
**Reviewers:** Codex (parallel agent) · Claude-Reviewer (parallel agent + direct codebase verification)
**Scope:** Confirm all 5 cycle-1 HIGH findings resolved; check for new issues.

---

### F-01 — import Charts gate

**Status: RESOLVED (Codex + Claude-Reviewer — FULL convergence)**

CONTEXT.md D-05 now reads:
> "NOT Swift Charts (Charts framework is not linked; `import Charts` will cause a linker error)"

PLAN.md Task 3 action block states explicitly: "NO import Charts — sparkline is CoreGraphics Path only (per D-05). Build will fail with a linker error if Charts is imported."

Task 3 `<verify>` runs `grep 'import Charts' GooseSwift/HealthBodyCompositionSection.swift` as an automated gate. Task 3 `<done>` criteria require that grep returns empty. Codebase grep across all of GooseSwift/ confirms zero existing `import Charts` occurrences — the framework is not linked.

The residual note in CONTEXT.md "Existing Code Insights" that says "SleepV2BevelTrendViews.swift has Swift Charts usage to reference for the sparkline" is stale/misleading but harmless — SleepV2BevelTrendViews.swift does NOT import Charts (confirmed: only `import SwiftUI` found, no `Chart` or `lineMark` symbols). D-05 is authoritative and correct.

---

### F-02 — UnitSystem stored preference

**Status: RESOLVED (Codex + Claude-Reviewer — FULL convergence)**

Both CONTEXT.md D-04 and PLAN.md Task 2 and Task 3 explicitly ban Locale detection:
- D-04: "Do NOT use `Locale.current.measurementSystem` — `.us` vs `.usSystem` Swift API is unreliable; use stored preference instead."
- Task 2 action: "Do NOT use `Locale.current.measurementSystem`. Do NOT use `.us` or `.usSystem`"
- Task 3 action: "Do NOT use Locale for unit detection."

Plan uses `@AppStorage(OnboardingStorage.unitSystem) private var unitSystemRaw = MoreProfileUnitSystem.imperial.rawValue`, matching the live codebase pattern in MoreProfileViews.swift line 92. Codebase verification: `OnboardingStorage.unitSystem` resolves to `"goose.swift.profile.unitSystem"` (OnboardingPersistence.swift line 9). `MoreProfileUnitSystem` enum is at MoreProfileViews.swift line 464 with `.metric` and `.imperial` cases. The plan's derivation pattern `MoreProfileUnitSystem(rawValue: unitSystemRaw) ?? .imperial` is identical to the live code.

Task 3 `<done>` gate: "displayWeight() converts to lbs on imperial unit system; uses stored preference (not Locale)." Task 2 `<done>` gate: "Uses @AppStorage(OnboardingStorage.unitSystem) — no Locale.current.measurementSystem reference."

---

### F-03 — hkDateFormatter access modifier

**Status: RESOLVED (Codex + Claude-Reviewer — FULL convergence)**

PLAN.md Task 1 Step 0 states verbatim:
> "In `HealthDataStore+Sleep.swift`, find the line: `private nonisolated static let hkDateFormatter: DateFormatter` — Change `private` to `internal` (or remove the keyword entirely — bare `nonisolated static let` is internal by default)."

Codebase confirms the declaration still exists as `private` at line 340 of HealthDataStore+Sleep.swift — confirming the prerequisite is required and correctly identified. The `must_haves.key_links` entry reinforces: "hkDateFormatter is internal (not private) in HealthDataStore+Sleep.swift so HealthDataStore+BodyComposition.swift can access it — F-03 fix." Verification step 1 greps for absence of `private nonisolated static let hkDateFormatter`.

---

### F-04 — requestValueAsync bare array

**Status: RESOLVED (Codex + Claude-Reviewer — FULL convergence)**

PLAN.md Task 1 action contains the explicit critical note:
> "CRITICAL (F-04): Call `bridge.requestValueAsync` (NOT `bridge.requestAsync`). The Rust `body_composition.history_between` method returns a bare JSON array `[[...]]`. `bridge.requestAsync` returns `[String: Any]` and silently returns `[:]` when the result is an array — history would always be empty."

`must_haves.truths` entry: "loadBodyCompositionHistory() uses bridge.requestValueAsync cast as [[String: Any]] — NOT bridge.requestAsync (per D-06, F-04)."

Codebase confirms `GooseRustBridge.requestValueAsync` (line 99) returns `async throws -> Any`, while `requestAsync` (line 103) returns `async throws -> [String: Any]` and would silently drop the bare array. The `<behavior>` TDD block includes: "loadBodyCompositionHistory() populates bodyCompositionHistory with 7 rows when bridge returns 7-element bare array (uses requestValueAsync, not requestAsync)." Automated verification step 3 greps for `requestValueAsync` in the new extension file.

---

### F-05 — y-inversion formula explicitly in Task 3

**Status: RESOLVED (Codex + Claude-Reviewer — FULL convergence)**

PLAN.md Task 3 now includes the formula inline with a comment explaining the CoreGraphics coordinate system:

```swift
let normalized = (value - domain.min) / max(domain.max - domain.min, 0.001)
let x = plot.minX + CGFloat(index) / CGFloat(max(points.count - 1, 1)) * plot.width
let y = plot.maxY - CGFloat(normalized) * plot.height   // y=0 is TOP in CoreGraphics
return CGPoint(x: x, y: y)
```

CONTEXT.md D-05 also states: "Y-axis inversion required: `y = plot.maxY - CGFloat(normalized) * plot.height`." Automated verification step 6 greps for `plot.maxY - CGFloat(normalized)`. Task 3 `<done>` criteria: "WeightSparklineView uses GeometryReader + Path (CoreGraphics) only with y-inversion formula `y = plot.maxY - CGFloat(normalized) * plot.height`."

---

### New Findings — Cycle 2

#### N-01 — MEDIUM: Swift 6 actor-isolation syntax gap in importBodyCompositionFromHealthKit

**Convergence:** Codex + Claude-Reviewer (independent, same finding)

Task 1 correctly describes the threading intent: "collect (date, value) tuples off-actor inside continuation, upsert on-actor after continuation resumes." However, the plan does not give the executor the explicit Swift 6 call-site syntax for the actor switch. Without explicit guidance, an executor may write the upsert call inside the HKSampleQuery completion handler before `continuation.resume`, which is off-actor and will fail Swift 6 strict concurrency with an actor-isolation error.

**Fix:** Task 1 action should add a code skeleton:
```swift
// Inside HKSampleQuery completion handler (off-actor): collect tuples, then resume
continuation.resume(returning: collectedTuples)
// After continuation resumes (back on @MainActor):
for (date, value) in tuples { await upsertBodyComposition(...) }
```

#### N-02 — HIGH: HKSampleQuery multi-fire continuation — double-resume crash risk

**Convergence:** Claude-Reviewer (unique)

The plan instructs collecting tuples "inside the continuation body" and resuming after collection. However, `HKSampleQuery` completion handlers fire multiple times — once per batch — before a final `nil` samples call signals completion. Using a single `withCheckedContinuation` that resumes on the first batch call and then receives subsequent batch callbacks will crash with "continuation resumed more than once" (resuming a Swift continuation twice is undefined behaviour and triggers a fatal error).

**Fix (required):** Task 1 must explicitly state: "Accumulate samples across all completion handler invocations into a `var results` array. Resume the continuation only when `samplesOrNil == nil` (the terminal nil call signalling HealthKit has no more results), passing the full accumulated array." The canonical pattern in `HealthKitFullImporter.swift` must be verified to confirm it uses this accumulation approach.

#### N-03 — HIGH: importError state variable is dead code — error from import is never surfaced to UI

**Convergence:** Claude-Reviewer (unique)

Task 3 declares `@State private var importError: String? = nil` and renders it in the layout. Task 3's button action is: `Task { await healthStore.importBodyCompositionFromHealthKit(); isImporting = false }`. However, `importBodyCompositionFromHealthKit()` is specified as `async` with no `throws` — and Task 3 never assigns `importError`. The state variable is unreachable dead code; import errors are silently swallowed with no user feedback.

**Fix (required):** Either (a) change `importBodyCompositionFromHealthKit()` to `throws`, and update the Task 3 button Task to `do { try await ...; isImporting = false } catch { importError = error.localizedDescription; isImporting = false }`, or (b) specify that the function signals errors via a `HealthDataStore` property that the section observes. Neither path is currently defined in the plan.

#### N-04 — LOW: Stale "Existing Code Insights" note in CONTEXT.md

CONTEXT.md "Existing Code Insights" states: "SleepV2BevelTrendViews.swift has Swift Charts usage to reference for the sparkline." Codebase verification shows SleepV2BevelTrendViews.swift only imports SwiftUI — no `import Charts`, no `Chart`, no `lineMark`. The note is factually wrong. D-05 is authoritative and correct. The stale note could confuse an executor who reads the insights section before D-05.

**Fix:** Correct the insight to: "SleepV2BevelTrendViews.swift uses GeometryReader + Path (CoreGraphics, no Charts) — follow that pattern."

#### N-05 — LOW: pbxproj UUID collision guard is advisory-only

Task 4 instructs the executor to grep for free UUID slots and states "Must return empty." If non-empty (a prior partial execution already added these UUIDs), there is no hard-stop or fallback instruction. Low severity on a fresh worktree.

**Fix:** Add: "If the grep returns non-empty, abort pbxproj edits and report collision to operator before proceeding."

---

### Cycle 2 — Reviewer Raw Verdicts

| Reviewer | Verdict | Key reasoning |
|----------|---------|---------------|
| Codex | CONVERGED (5/5 HIGHs resolved) | N-01 (actor isolation syntax) raised as new MEDIUM; no compile blocker if intent is followed correctly |
| Claude-Reviewer | NEEDS_REPLAN | N-02 (HKSampleQuery multi-fire continuation — double-resume crash) and N-03 (importError dead code) are new blocking correctness issues |

---

### Cycle 2 — Cycle Summary

| Metric | Value |
|--------|-------|
| Prior HIGH findings confirmed resolved | 5 / 5 |
| New HIGH findings | 2 (N-02 HKSampleQuery double-resume · N-03 importError dead code) |
| New MEDIUM findings | 1 (N-01 — Swift 6 actor isolation syntax gap) |
| New LOW findings | 2 (N-04 stale CONTEXT note · N-05 pbxproj advisory) |
| Reviewer verdicts | Codex: CONVERGED · Claude-Reviewer: NEEDS_REPLAN |
| **Synthesized verdict** | **NEEDS_REPLAN** |

All five cycle-1 HIGH findings are fully resolved. However two new HIGH findings were introduced by Claude-Reviewer: N-02 (HKSampleQuery multi-fire continuation — resuming before the nil-terminal call will crash at runtime), and N-03 (importError state variable is unreachable dead code — import errors are silently swallowed with no UI feedback). Both are runtime correctness bugs requiring plan amendments before execution.

**Required amendments before Cycle 3 / execution:**

| Amendment | Task | Finding |
|-----------|------|---------|
| Add explicit HKSampleQuery accumulation pattern: accumulate in `var results`, resume only on nil terminal call | Task 1 | N-02 |
| Define error propagation path: either `importBodyCompositionFromHealthKit() throws` + Task 3 button catch, or HealthDataStore error property | Task 1 + Task 3 | N-03 |
| Add code skeleton for post-continuation upsert loop showing explicit @MainActor context | Task 1 | N-01 |
| Correct CONTEXT.md stale insight note about SleepV2BevelTrendViews.swift | CONTEXT.md | N-04 |

---

---

## Cycle 3 — Re-Review of N-02 and N-03 Fixes

**Date:** 2026-06-27
**Reviewer:** Claude-Reviewer (direct codebase verification + plan audit)
**Scope:** Confirm N-02 and N-03 resolved in revised plan; scan for new issues introduced by the amendments.

---

### N-02 — HKSampleQuery multi-fire fix

**Status: NOT_RESOLVED — new HIGH introduced by the fix**

The revised plan added an explicit `results == nil` accumulation pattern as the N-02 fix:

```swift
var accumulated: [HKQuantitySample] = []
let query = HKSampleQuery(...) { _, results, error in
    if let batch = results as? [HKQuantitySample] {
        accumulated.append(contentsOf: batch)
    }
    if results == nil {
        continuation.resume(returning: accumulated)  // ONLY here
    }
}
```

**This fix is factually incorrect.** `HKSampleQuery` is a one-shot query — its completion handler fires exactly once, delivering either a non-nil results array (success) or nil results + non-nil error (failure). The `results == nil` terminal-call sentinel pattern belongs to `HKAnchoredObjectQuery`, not `HKSampleQuery`.

**Codebase evidence:** Every existing `HKSampleQuery` usage in this project (HealthKitFullImporter.swift, HealthKitSleepImporter.swift) calls `continuation.resume()` directly in the callback on the non-nil `samples` result — never gated on `results == nil`. Representative patterns:

```swift
// HealthKitSleepImporter.swift line 101-102
let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, ...) { _, samples, _ in
    continuation.resume(returning: samples?.first as? HKQuantitySample)
}

// HealthKitFullImporter.swift (multi-sample query)
let q = HKSampleQuery(sampleType: type, predicate: pred, limit: 10_000, ...) { _, samples, _ in
    let pts = (samples as? [HKQuantitySample] ?? []).map { ... }
    cont.resume(returning: pts)
}
```

**Impact of the plan's `results == nil` guard:** On a successful query, `results` is non-nil, so the `if results == nil` branch is never entered, `continuation.resume()` is never called, and `importBodyCompositionFromHealthKit()` hangs indefinitely. The HealthKit import button becomes unresponsive with no error shown.

**Correct fix:** Use the canonical codebase pattern — resume inside the non-nil branch, return empty on nil/error:

```swift
let query = HKSampleQuery(sampleType: sampleType, predicate: nil,
    limit: HKObjectQueryNoLimit, sortDescriptors: [sortDescriptor]) { _, results, _ in
    continuation.resume(returning: (results as? [HKQuantitySample]) ?? [])
}
store.execute(query)
```

No accumulation loop is needed — `HKSampleQuery` delivers all results in the single callback invocation. The `accumulated` var and multi-batch logic should be removed entirely. This also eliminates the original N-02 "double-resume" concern (which cannot occur on a one-shot query).

**Required plan amendment:** Replace the `results == nil` pattern in Task 1 with the canonical single-callback resume used consistently throughout this codebase.

---

### N-03 — importState enum / error surfacing fix

**Status: RESOLVED**

The revised plan correctly defines:
- `var importState: ImportState = .idle` stored on `HealthDataStore` (base class, not extension — correct for `@Observable`)
- Nested `enum ImportState { case idle; case importing; case failed(String) }`
- `importBodyCompositionFromHealthKit()` is non-throwing; sets `.importing` on entry, `.idle` on success, `.failed(error.localizedDescription)` on catch
- `HealthBodyCompositionSection` derives error display from `healthStore.importState`: `if case .failed(let message) = healthStore.importState` shows `Text(message).foregroundStyle(.red)`
- The old dead `@State var importError: String?` is explicitly noted as replaced

All three layers (store property, function transitions, UI observation) are present and consistent. STRIDE threat T-121-08 and the success criterion both reinforce the path. N-03 is genuinely resolved.

---

### New Findings — Cycle 3

#### C3-N-01 — HIGH: HKSampleQuery `results == nil` pattern causes silent import hang on success

Detailed above under N-02. The attempt to fix the fictitious multi-fire double-resume risk introduced a real correctness bug: `continuation.resume()` is gated on `results == nil` (the failure/empty branch of a one-shot query), so successful imports never resume the continuation and the async function hangs indefinitely.

**Severity: HIGH** — silent runtime hang, not a crash. No error shown, button remains disabled, import never completes.

**Fix:** Remove the accumulation loop and `results == nil` gate. Resume directly in the callback on `(results as? [HKQuantitySample]) ?? []`. Match the pattern used in all existing HealthKitFullImporter.swift and HealthKitSleepImporter.swift query sites.

---

### Cycle 3 — Reviewer Raw Verdicts

| Reviewer | Verdict | Key reasoning |
|----------|---------|---------------|
| Claude-Reviewer | NEEDS_REPLAN | N-02 fix introduced a new HIGH: HKSampleQuery is one-shot; `results == nil` gate prevents continuation from ever resuming on success — import hangs permanently |

---

### Cycle 3 — Cycle Summary

| Metric | Value |
|--------|-------|
| N-02 confirmed resolved | NO — fix is factually incorrect; new HIGH introduced |
| N-03 confirmed resolved | YES |
| New HIGH findings | 1 (C3-N-01 — HKSampleQuery hang on success) |
| New MEDIUM/LOW findings | 0 |
| **Synthesized verdict** | **NEEDS_REPLAN** |

**Required amendment before Cycle 4 / execution:**

| Amendment | Task | Finding |
|-----------|------|---------|
| Replace `results == nil` accumulation pattern with single-shot callback resume: `continuation.resume(returning: (results as? [HKQuantitySample]) ?? [])` | Task 1 | C3-N-01 |
| Remove `var accumulated` array and multi-batch append logic | Task 1 | C3-N-01 |
| Update success criteria and STRIDE T-121-07 to reflect one-shot callback semantics | Task 1 / threat model | C3-N-01 |

---

## Cycle Summary

| Metric | Value |
|--------|-------|
| HIGH findings | 5 |
| MEDIUM findings | 3 |
| LOW findings | 4 |
| Total findings | 12 |
| Reviewer verdicts | Codex: NEEDS_REPLAN · Gemini: CONVERGED · Claude-Reviewer: NEEDS_REPLAN |
| **Synthesized verdict** | **NEEDS_REPLAN** |

Three HIGH findings are guaranteed compile failures (F-01, F-02, F-03, F-04, F-05). Execution must not proceed until the plan amendments below are applied.

---

## HIGH Findings

### F-01 — CONTEXT.md D-05 contradicts PLAN.md on sparkline implementation

**Convergence:** FULL (Codex + Gemini + Claude-Reviewer)
**Risk:** Risk 1 — Charts import gate

CONTEXT.md line 32 (`D-05`) says: *"Uses Swift Charts (Chart + .lineMark). Follows Swift Charts pattern from SleepV2BevelTrendViews.swift."*

PLAN.md must_haves truth says: *"Sparkline uses GeometryReader + Path (no import Charts)"*

`grep 'import Charts'` across GooseSwift/ returns zero results. Charts is not linked in the project. If the executor follows CONTEXT.md, the build fails with a missing framework linker error.

**Fix:** Update CONTEXT.md D-05 to:
> D-05: Inline weight sparkline using GeometryReader + Path (CoreGraphics only — no import Charts). View hidden when bodyCompositionHistory is empty. Renders last 7 days of weight_kg values from body_composition.history_between.

PLAN.md must_haves is authoritative and correct — preserve it unchanged.

---

### F-02 — `Locale.MeasurementSystem == .us` is the wrong Swift case

**Convergence:** PARTIAL (Codex + Claude-Reviewer; Gemini cleared using wrong API surface)
**Risk:** Risk 5 — Locale conversion

PLAN.md must_haves truth uses `Locale.current.measurementSystem == .us`. Swift `Locale.MeasurementSystem` (iOS 16+) has three cases: `.metric`, `.uk`, `.usSystem`. The `.us` case belongs to the deprecated `NSLocale` ObjC enum. The codebase has zero uses of `measurementSystem` — this is untested new API territory. At iOS 26 target this will either fail to compile (ambiguous member) or silently never match.

Additionally, the codebase already has a user-persisted `UnitSystem` enum (`.metric` / `.imperial`) used throughout `MoreProfileViews.swift`. A user in the US who set the app to metric would see lbs despite their preference if locale auto-detection is used.

**Fix (preferred):** Reuse the existing `UnitSystem` stored preference from `MoreProfileViews.swift` instead of `Locale.current.measurementSystem`. Update all plan references accordingly.

**Fix (minimal):** Replace all occurrences of `== .us` with `== .usSystem` in the plan if Locale auto-detection is retained. Confirm at build time.

---

### F-03 — `hkDateFormatter` is `private` — invisible from sibling extension file

**Convergence:** UNIQUE (Claude-Reviewer only)
**Risk:** Risk 2 — Compile error in new extension

PLAN.md Task 1 instructs: *"Use Self.hkDateFormatter (nonisolated static let already present in HealthDataStore+Sleep.swift)"*

`HealthDataStore+Sleep.swift:340`:
```swift
private nonisolated static let hkDateFormatter: DateFormatter = {
```

Swift `private` is file-scoped. A `private` symbol in `HealthDataStore+Sleep.swift` is completely invisible to `HealthDataStore+BodyComposition.swift`, even though both extend the same type. This is a guaranteed compile error: *"use of unresolved identifier 'hkDateFormatter'"*.

**Fix:** Add a prerequisite step to PLAN.md Task 1:
> **Prerequisite:** In `HealthDataStore+Sleep.swift:340`, change `private nonisolated static let hkDateFormatter` to `internal nonisolated static let hkDateFormatter`. This makes the formatter accessible to all HealthDataStore extensions.

---

### F-04 — `bridge.requestAsync` silently drops bare array result from `history_between`

**Convergence:** PARTIAL (Codex; confirmed by reading GooseRustBridge.swift)
**Risk:** Risk 2 — history_between return format

`GooseRustBridge.requestAsync()` is implemented as:
```swift
func requestAsync(method: String, args: [String: Any] = [:]) async throws -> [String: Any] {
    try await requestValueAsync(...) as? [String: Any] ?? [:]
}
```

When Rust returns a bare JSON array (`[[...]]`), the `as? [String: Any]` cast fails silently and returns `[:]`. PLAN.md Pitfall 1 correctly identifies that `history_between` returns a bare array (not wrapped in a `"rows"` key), but Task 1's action body calls `bridge.requestAsync` — which will always yield empty history with no error or crash.

**Fix:** In Task 1, replace:
```swift
try await bridge.requestAsync(method: "body_composition.history_between", ...)
```
with:
```swift
let rows = try await bridge.requestValueAsync(method: "body_composition.history_between",
                                              args: [...]) as? [[String: Any]] ?? []
```

Add a TDD behavior row: *"when bridge returns a bare 7-element array, bodyCompositionHistory has 7 elements"* to force this path into the test suite.

---

### F-05 — Sparkline y-coordinate inversion not specified — silent rendering bug

**Convergence:** UNIQUE (Gemini only)
**Risk:** Risk 1 — CoreGraphics sparkline correctness

PLAN.md Task 3 defers `chartPoint()` implementation to *"read SleepV2BevelTrendViews.swift for the full implementation"* with the body elided as `{ ... }`. In SwiftUI `Path`, y=0 is at the top of the coordinate space. Without the explicit formula, an executor may write:
```swift
let y = plot.minY + (normalized * plot.height)  // WRONG — inverts chart
```
producing a sparkline where heavier weights appear lower than lighter ones.

**Fix:** Add the `chartPoint` formula explicitly in PLAN.md Task 3 — do not delegate this to a reference file:
```swift
private func chartPoint(index: Int, value: Double, plot: CGRect,
                        domain: (min: Double, max: Double)) -> CGPoint {
  let normalized = (value - domain.min) / max(domain.max - domain.min, 0.001)
  let x = plot.minX + CGFloat(index) / CGFloat(max(points.count - 1, 1)) * plot.width
  let y = plot.maxY - CGFloat(normalized) * plot.height  // y=0 is TOP in CoreGraphics
  return CGPoint(x: x, y: y)
}
```

---

## MEDIUM Findings

### F-06 — Unit system should use existing stored preference, not Locale auto-detection

**Convergence:** PARTIAL (Codex + Gemini)

Partially overlaps F-02. The codebase-level argument: `MoreProfileViews.swift` uses a persisted `unitSystem` enum for all unit display decisions. Using `Locale.current.measurementSystem` for body composition display creates an inconsistency where the body composition card might show lbs while every other unit in the app shows kg.

**Fix:** Read the `unitSystem` UserDefaults key used by `MoreProfileViews.swift` and pass it into `displayWeight()`. This is the correct fix that also resolves F-02.

---

### F-07 — Thread safety: upsert calls inside HKSampleQuery continuation body risk Swift 6 actor violation

**Convergence:** UNIQUE (Gemini)

PLAN.md describes calling `await upsertBodyComposition(...)` inside the `HKSampleQuery` `withCheckedContinuation` completion handler. `HealthDataStore` is `@MainActor @Observable`. The HKSampleQuery callback runs on an arbitrary background queue. Calling `await upsertBodyComposition` inside the off-actor continuation body (before the continuation resumes) risks a Swift 6 strict concurrency actor isolation violation.

**Fix:** Restructure Task 1 to explicitly:
1. Collect all `(date, value)` tuples into a local array *inside* the continuation body (off-actor — data collection only)
2. Resume the continuation with that array
3. Call `await upsertBodyComposition(...)` in a loop *after* the continuation resumes on the `@MainActor` calling context

Add a comment to this effect in the plan's code stubs.

---

### F-08 — CONTEXT.md D-01 names wrong file for HealthView insertion point

**Convergence:** UNIQUE (Codex)

CONTEXT.md D-01 says the new section goes in `HealthDashboardViews.swift`. PLAN.md `files_modified` correctly lists `HealthView.swift`. Both anchor structs (`HealthVitalsPreviewSection` at line 34, `HealthRouteShortcutSection` at line 36) are confirmed in `HealthView.swift`.

**Fix:** Update CONTEXT.md D-01 to say `HealthView.swift` instead of `HealthDashboardViews.swift`.

---

## LOW Findings

### F-09 — Info.plist NSHealth keys already present; no edits needed

**Convergence:** FULL (Codex + Gemini + Claude-Reviewer)

Both `NSHealthShareUsageDescription` (line 40) and `NSHealthUpdateUsageDescription` (line 42) already exist in `GooseSwift/Info.plist` from Phase 97. No new entries are needed. The plan correctly omits `Info.plist` from `files_modified`.

**Fix:** Add an explicit note in PLAN.md Task 1: *"Info.plist: both NSHealth* keys already present from Phase 97 — do NOT add or modify."* Add to verify gate: `grep 'toShare: \[\]' GooseSwift/HealthDataStore+BodyComposition.swift` to assert read-only import stays read-only.

---

### F-10 — pbxproj UUID slots 019/01A/01B are confirmed free

**Convergence:** FULL (Codex + Claude-Reviewer)

Last used E-series slot is `E1/E2000000000000000000018` (RealtimePIPQueue.swift). Slots 019, 01A, 01B are free. The plan's pre-check grep instruction is correct.

**Fix:** None required. UUID assignments are safe.

---

### F-11 — bodyFatPercentage HK authorization and fraction conversion are correct

**Convergence:** FULL (Codex + Gemini + Claude-Reviewer)

`bodyFatPercentage` is not in any existing HK auth scope. The new `requestAuthorization` call for both `bodyMass` + `bodyFatPercentage` is required and correctly included. BF% ÷ fraction × 100 conversion is correct (`HKUnit.percent()` returns 0–1 range).

**Fix (enhancement):** Add a runtime guard before the multiply: `guard value >= 0.0 && value <= 1.0 else { continue }` to reject malformed HealthKit samples.

---

### F-12 — `loadBodyCompositionHistory()` belongs in existing `.onAppear` Task block

**Convergence:** UNIQUE (Codex)

`HealthView.swift` uses `.onAppear { Task { ... } }` at lines 72–78 — there is no `.task` modifier anywhere in the file. PLAN.md Task 4 instructs adding a `.task` modifier which would create a second lifecycle hook.

**Fix:** Update PLAN.md Task 4: add `await healthStore.loadBodyCompositionHistory()` inside the existing `.onAppear` Task block at line 74, not as a new `.task` modifier.

---

## Required Plan Amendments Before Execution

The following changes must be applied before `gsd-execute-phase` is invoked:

| Amendment | File | Finding |
|-----------|------|---------|
| Fix D-05: replace Swift Charts with GeometryReader+Path | 121-CONTEXT.md | F-01 |
| Fix D-01: HealthDashboardViews.swift → HealthView.swift | 121-CONTEXT.md | F-08 |
| Change `.us` → `.usSystem` OR adopt existing UnitSystem preference | 121-01-PLAN.md | F-02, F-06 |
| Add prerequisite: change `hkDateFormatter` from `private` to `internal` in HealthDataStore+Sleep.swift | 121-01-PLAN.md Task 1 | F-03 |
| Replace `bridge.requestAsync` with `bridge.requestValueAsync` + `[[String:Any]]` cast for history_between | 121-01-PLAN.md Task 1 | F-04 |
| Add explicit `chartPoint` y-inversion formula | 121-01-PLAN.md Task 3 | F-05 |
| Restructure HKSampleQuery continuation: collect off-actor, upsert on-actor | 121-01-PLAN.md Task 1 | F-07 |
| Add `.onAppear` Task block note (not new `.task`) | 121-01-PLAN.md Task 4 | F-12 |
| Add Info.plist no-touch note + toShare:[] verify gate | 121-01-PLAN.md | F-09 |
| Add BF% range guard before ×100 multiply | 121-01-PLAN.md Task 1 | F-11 |

---

## Reviewer Raw Verdicts

| Reviewer | Verdict | Key reasoning |
|----------|---------|---------------|
| Codex | NEEDS_REPLAN | CONTEXT/PLAN sparkline contradiction; requestAsync silent drop; Locale.us wrong case; UnitSystem consistency |
| Gemini | CONVERGED | Architecture sound; sparkline y-inversion not specified; thread-safety pattern ambiguous |
| Claude-Reviewer | NEEDS_REPLAN | hkDateFormatter private access = compile error; Locale.usSystem wrong case = compile error; CONTEXT D-05 contradicts PLAN |

**Synthesized:** NEEDS_REPLAN — 5 HIGH findings including 3 guaranteed compile errors (F-02, F-03, F-04) and 1 guaranteed linker error if CONTEXT.md is followed (F-01). Apply all Required Plan Amendments before re-running execute-phase.
