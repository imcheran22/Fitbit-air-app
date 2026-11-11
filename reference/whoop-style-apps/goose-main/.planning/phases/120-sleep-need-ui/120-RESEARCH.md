# Phase 120: Sleep Need UI - Research

**Researched:** 2026-06-26
**Domain:** SwiftUI / HealthDataStore — sleep need display
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Property placement:** New `var dynamicSleepNeed: DynamicSleepNeed?` on `HealthDataStore` (stored property in base class body). Bridge call lives in `HealthDataStore+Sleep.swift`.

**D-02 — Swift result type:**
```swift
struct DynamicSleepNeed {
  let totalNeedMinutes: Double
  let baseNeedMinutes: Double
  let debtAdjustmentMinutes: Double
  let strainAdjustmentMinutes: Double
}
```
Nil when bridge returns an error or no history exists.

**D-03 — Bridge args:** `prior_strain: nil`. `age_years` from `OnboardingStorage.dateOfBirth` UserDefaults key; if absent pass `age_years: nil`.

**D-04 — Display format:** `"\(h)h \(m)m recommended tonight"`. When minutes == 0: `"\(h)h recommended tonight"`. Label hidden when `dynamicSleepNeed == nil`.

**D-05 — Breakdown row:** Always-visible flat row below main label, shown only when `dynamicSleepNeed != nil`. Single compact Text: `"Base 7.5h · Debt +15m · Strain +0m"`. No disclosure group.

**D-06 — Fallback replacement:** Replace `480.0` in `HealthDataStore+Snapshots.swift` lines 28 and 68 with `dynamicSleepNeed?.totalNeedMinutes ?? 450.0`.

**D-07 — UI change sites:** `sleepNeededText` in `HealthSleepSheetsViews.swift` line 149 is primary. Also check `HealthSleepOverviewViews.swift`.

### Claude's Discretion
- Bridge call dispatched to background queue; result published `@MainActor`
- `refreshDynamicSleepNeed()` called alongside other `HealthDataStore.refresh*()` methods
- `#Preview` macro provides a static `DynamicSleepNeed` value (no bridge call in preview)
- No new Xcode project.pbxproj registration needed if added to existing extension file

### Deferred Ideas (OUT OF SCOPE)
- Rust changes (Phase 114 complete)
- Body composition UI (Phase 121)
- Stealth UI (Phase 122)
</user_constraints>

---

## Summary

Phase 120 is a pure Swift UI phase. The Rust bridge method `sleep.compute_need` already exists (shipped in Phase 114). This phase wires the Swift side: adds a `dynamicSleepNeed` stored property on `HealthDataStore`, calls the bridge in the existing `HealthDataStore+Sleep.swift` extension, and updates two display sites.

The codebase investigation reveals four files that require changes and one additional file that also carries a hardcoded sleep-need value that was not in the original plan: `SleepV2ScheduleViews.swift` line 52 shows `"7h 39m"` hardcoded directly in the `SleepV2SleepWindowCard` body (the tappable card on the Sleep overview that opens the sheet). This is a **third display site** and must be updated alongside the sheet.

The `SleepV2SleepNeededSheet` currently has no access to `HealthDataStore` — it receives only a `SleepV2Palette`. To render `dynamicSleepNeed` in the sheet it must gain `@Environment(HealthDataStore.self)` access (already the pattern in `SleepV2BandSyncCard` in the same file).

**Primary recommendation:** Follow the `runRecoveryV1` / `RecoveryV1Result` pattern exactly — stored property declared in `HealthDataStore.swift` base body, logic in the domain extension, bridge called async on background queue, result assigned on `@MainActor`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Bridge call + result parsing | HealthDataStore (model) | — | All bridge calls live in HealthDataStore extensions; never in views |
| Stored property | HealthDataStore.swift base body | — | Swift @Observable prohibits stored properties in extensions |
| Refresh trigger | HealthDataStore refresh method | onAppear in SleepV2OverviewPage | Consistent with every other metric (runSleepStaging, runRecoveryV1) |
| Display — sheet | HealthSleepSheetsViews.swift | — | SleepV2SleepNeededSheet owns the detailed view |
| Display — card | SleepV2ScheduleViews.swift | — | SleepV2SleepWindowCard hardcodes "7h 39m" — third update site |
| Fallback injection | HealthDataStore+Snapshots.swift | — | Lines 28 and 68 pass sleep_need_minutes to the score algorithm |

---

## Standard Stack

No external packages. All changes use existing project infrastructure:
- Swift / SwiftUI — existing
- `GooseRustBridge` (`bridge.requestAsync`) — existing
- `@Observable` macro — existing
- `UserDefaults.standard` — existing (OnboardingStorage.dateOfBirth)

---

## Architecture Patterns

### Pattern 1: Stored property declared in base class body (not extension)

`HealthDataStore` uses `@Observable` (not `@Published`/`ObservableObject`). Swift requires stored properties to be declared in the primary type body, not in extensions.

Existing examples in `HealthDataStore.swift`:
```swift
// Lines 89–109 — same pattern to follow
var recoveryV1Result: RecoveryV1Result?
var readinessResult: ReadinessResult?
var sleepStagingResult: SleepStagingResult?
var imuStepCountResult: IMUStepCountResult?
```

Comment convention (verbatim from codebase):
```swift
// Dynamic sleep need from sleep.compute_need bridge (SLP-NEED-03).
// Stored here because Swift extensions cannot add stored properties to @Observable classes.
var dynamicSleepNeed: DynamicSleepNeed?
```

**File:** `GooseSwift/HealthDataStore.swift` — add after `imuStepCountResult` around line 109.

### Pattern 2: Result struct declared in the domain extension file

```swift
// Source: GooseSwift/HealthDataStore+StagingSleep.swift lines 4–15 (SleepStagingResult pattern)
// MARK: - DynamicSleepNeed
struct DynamicSleepNeed {
  let totalNeedMinutes: Double
  let baseNeedMinutes: Double
  let debtAdjustmentMinutes: Double
  let strainAdjustmentMinutes: Double
}
```

Declared at the top of `HealthDataStore+Sleep.swift` before the `extension HealthDataStore` block.

### Pattern 3: Async bridge call in extension

Exact model from `HealthDataStore+Recovery.swift` lines 55–126 (`runRecoveryV1`):

```swift
// Source: GooseSwift/HealthDataStore+Recovery.swift lines 55–126
func runDynamicSleepNeed() async {
  let db = databasePath

  // Read age from UserDefaults — reuse hkUserAge() already in Snapshots
  let ageYears: UInt8? = hkUserAge().map { UInt8(min($0, 120)) }

  var bridgeArgs: [String: Any] = ["database_path": db]
  if let age = ageYears {
    bridgeArgs["age_years"] = age
  }
  // prior_strain: nil per D-03 — omitted from args (Rust uses serde default)

  do {
    let report = try await bridge.requestAsync(
      method: "sleep.compute_need",
      args: bridgeArgs
    )
    let total = Self.doubleValue(report["total_need_minutes"])
    let base = Self.doubleValue(report["base_need_minutes"])
    let debt = Self.doubleValue(report["debt_adjustment_minutes"])
    let strain = Self.doubleValue(report["strain_adjustment_minutes"])
    guard let total else {
      self.dynamicSleepNeed = nil
      return
    }
    self.dynamicSleepNeed = DynamicSleepNeed(
      totalNeedMinutes: total,
      baseNeedMinutes: base ?? 450,
      debtAdjustmentMinutes: debt ?? 0,
      strainAdjustmentMinutes: strain ?? 0
    )
  } catch {
    self.dynamicSleepNeed = nil
  }
}
```

`bridge.requestAsync` is already async and can be called directly. Assignment to `self.dynamicSleepNeed` happens on `@MainActor` because `HealthDataStore` is `@MainActor`.

### Pattern 4: hkUserAge() reuse

`hkUserAge()` is a `private` method on `HealthDataStore+Snapshots.swift` (lines 1032–1037). Since `runDynamicSleepNeed()` will be in `HealthDataStore+Sleep.swift`, which is in the same module and same type, it can call `self.hkUserAge()` directly — Swift extensions on the same type share private members within the same file **only**. Because `hkUserAge` is `private` (not `internal`), it cannot be called from a different extension file.

**Resolution:** Change `private func hkUserAge()` to `func hkUserAge()` (drop `private`) in `HealthDataStore+Snapshots.swift`, or duplicate the 5-line implementation in `HealthDataStore+Sleep.swift`. The cleanest approach is to make it `internal` (remove `private`). [VERIFIED: Swift access control rules — methods on @Observable classes in extensions]

### Pattern 5: Refresh trigger call site

`SleepV2OverviewPage.onAppear` (line 144–148 in `HealthSleepOverviewViews.swift`) already calls:
```swift
.onAppear {
  Task { await healthStore.loadBridgeCatalogsIfNeeded() }
  startBandSleepSyncIfReady()
  Task { await healthStore.runSleepStaging() }
}
```

Add a fourth task:
```swift
Task { await healthStore.runDynamicSleepNeed() }
```

No separate `refreshAll()` method exists — each metric is triggered from the relevant `onAppear` or `refreshSleepAfterBandSync`.

`refreshSleepAfterBandSync` (HealthDataStore.swift lines 325–331) calls `runPacketInputs()`, `runSleepScore()`, `runSleepStaging()` after a band sync. Add `await runDynamicSleepNeed()` there too, so sleep need updates whenever band data arrives.

### Pattern 6: sleepNeededText update (HealthSleepSheetsViews.swift)

Current implementation (line 149–151):
```swift
private var sleepNeededText: String {
  Self.durationText(targetSleepMinutes + 9)
}
```

`SleepV2SleepNeededSheet` must gain `@Environment(HealthDataStore.self)` access. Pattern from `SleepV2BandSyncCard` (same file, line 85):
```swift
@Environment(HealthDataStore.self) private var healthStore
```

After adding store access, `sleepNeededText` changes to consume `dynamicSleepNeed.totalNeedMinutes` per D-04:
```swift
private var sleepNeededText: String {
  guard let need = healthStore.dynamicSleepNeed else { return "" }
  let h = Int(need.totalNeedMinutes / 60)
  let m = Int(need.totalNeedMinutes.truncatingRemainder(dividingBy: 60))
  return m == 0 ? "\(h)h recommended tonight" : "\(h)h \(m)m recommended tonight"
}
```

`sleepNeededText` is used in **two** places in the sheet (lines 25 and 114 — both `Text(sleepNeededText)`). Both update automatically since they read the same computed property.

The "Total" row at line 114 also shows `sleepNeededText`. The sheet should hide itself (or show empty) when `dynamicSleepNeed == nil` per D-04 ("Label absent (view hidden) when dynamicSleepNeed == nil"). Wrap the large body VStack with `.opacity(healthStore.dynamicSleepNeed == nil ? 0 : 1)` or use an `if let` guard.

### Pattern 7: Breakdown row (D-05)

New compact `Text` below the hero label in `SleepV2SleepNeededSheet`. Show only when `dynamicSleepNeed != nil`:
```swift
if let need = healthStore.dynamicSleepNeed {
  Text(breakdownText(need))
    .font(.caption.weight(.medium))
    .foregroundStyle(palette.secondaryText)
}

private func breakdownText(_ need: DynamicSleepNeed) -> String {
  let baseH = need.baseNeedMinutes / 60
  let debtM = Int(need.debtAdjustmentMinutes)
  let strainM = Int(need.strainAdjustmentMinutes)
  let debtStr = debtM >= 0 ? "+\(debtM)m" : "\(debtM)m"
  let strainStr = strainM >= 0 ? "+\(strainM)m" : "\(strainM)m"
  return String(format: "Base %.1fh · Debt %@ · Strain %@", baseH, debtStr, strainStr)
}
```

### Pattern 8: Third display site — SleepV2SleepWindowCard

`SleepV2ScheduleViews.swift` line 52 has a hardcoded value:
```swift
SleepV2ScheduleActionRow(
  palette: palette,
  systemImage: "moon.stars.fill",
  title: "Tonight's sleep needed",
  value: "7h 39m",   // <-- hardcoded, NOT from any store
  action: onSleepNeeded
)
```

`SleepV2SleepWindowCard` currently takes no store — only `palette`, `onWakeTap`, `onSleepNeeded`. It must gain either:
- A new `sleepNeedLabel: String` parameter passed from `SleepV2OverviewPage` (simpler, no environment dependency), OR
- `@Environment(HealthDataStore.self)` directly in the card (consistent with `SleepV2BandSyncCard` pattern in the same file)

The second approach is more consistent with the codebase. `SleepV2OverviewPage` already injects environment.

The `value` string for the card should match D-04 format. When `dynamicSleepNeed == nil`, show `"--"` or the sheet trigger could be hidden.

### Pattern 9: Fallback replacement in HealthDataStore+Snapshots.swift

Lines 27–34 (`runPacketScores`) and lines 67–74 (`runSleepScore`) both have:
```swift
"sleep_need_minutes": 480.0,
```

Replace with:
```swift
"sleep_need_minutes": dynamicSleepNeed?.totalNeedMinutes ?? 450.0,
```

Both methods are `async` and called on `@MainActor`; accessing `self.dynamicSleepNeed` is safe.

---

## Rust Bridge — Verified Args and Return Shape

From `Rust/core/src/bridge/sleep.rs` lines 163–180: [VERIFIED: direct source read]

**Args struct:**
```rust
struct SleepComputeNeedArgs {
    database_path: String,
    #[serde(default)] age_years: Option<u8>,
    #[serde(default)] prior_strain: Option<f64>,
}
```

**Return JSON:**
```json
{
  "schema": "goose.sleep-need-result.v1",
  "base_need_minutes": <f64>,
  "debt_adjustment_minutes": <f64>,
  "strain_adjustment_minutes": <f64>,
  "total_need_minutes": <f64>
}
```

Swift key names to read: `"total_need_minutes"`, `"base_need_minutes"`, `"debt_adjustment_minutes"`, `"strain_adjustment_minutes"`. All snake_case, all `f64` (map to `Double` in Swift via `Self.doubleValue()`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Async bridge dispatch | Custom queue + completion | `bridge.requestAsync` (already async) |
| Age calculation | Custom DateComponents math | `hkUserAge()` in HealthDataStore+Snapshots.swift:1032 |
| Duration formatting | Custom string formatter | `Self.durationText()` already in HealthSleepSheetsViews.swift:157 |
| Double extraction from bridge dict | Manual casting | `Self.doubleValue()` utility in HealthDataStore+Utilities.swift |

---

## Common Pitfalls

### Pitfall 1: Stored property in extension
**What goes wrong:** Adding `var dynamicSleepNeed` inside `extension HealthDataStore` causes a compiler error: "Extensions must not contain stored properties."
**Why it happens:** `@Observable` macro requires stored properties in the primary type declaration.
**How to avoid:** Declare in `HealthDataStore.swift` base body alongside `recoveryV1Result`, `sleepStagingResult`, etc.

### Pitfall 2: Calling hkUserAge() across extension files
**What goes wrong:** `hkUserAge()` is `private` in `HealthDataStore+Snapshots.swift`. Calling it from `HealthDataStore+Sleep.swift` gives "inaccessible due to 'private' protection level".
**How to avoid:** Change `private func hkUserAge()` → `func hkUserAge()` (internal) in Snapshots. Alternatively inline the 5-line implementation.

### Pitfall 3: sleepNeededText returns empty and view collapses
**What goes wrong:** When `dynamicSleepNeed == nil`, `sleepNeededText` returns `""`. A `Text("")` still takes up layout space in some contexts.
**How to avoid:** Per D-04 "label absent (view hidden) when nil" — use `if let need = healthStore.dynamicSleepNeed` guard or `.opacity(healthStore.dynamicSleepNeed == nil ? 0 : 1)` on the containing VStack.

### Pitfall 4: Forgetting the SleepV2SleepWindowCard "7h 39m" hardcode
**What goes wrong:** Sheet updates correctly but the card on the main Sleep overview still shows "7h 39m". Users see inconsistency.
**How to avoid:** Update `SleepV2ScheduleViews.swift` line 52 — this is the **third display site** not mentioned in original CONTEXT.md D-07.

### Pitfall 5: UInt8 overflow on age
**What goes wrong:** `hkUserAge()` returns `Double`. Casting directly to `UInt8` crashes if value > 255 or is negative.
**How to avoid:** `UInt8(min(max(age, 0), 120))` before passing.

---

## Files to Modify (Complete List)

| File | Change | Notes |
|------|--------|-------|
| `GooseSwift/HealthDataStore.swift` | Add `var dynamicSleepNeed: DynamicSleepNeed?` stored property | After line 109, following imuStepCountResult pattern |
| `GooseSwift/HealthDataStore+Sleep.swift` | Add `DynamicSleepNeed` struct + `runDynamicSleepNeed()` method | Top of file before extension block |
| `GooseSwift/HealthDataStore+Snapshots.swift` | Replace `480.0` with `dynamicSleepNeed?.totalNeedMinutes ?? 450.0` at lines 28 and 68 | Also change `hkUserAge()` from `private` to `internal` |
| `GooseSwift/HealthDataStore.swift` | Add `await runDynamicSleepNeed()` to `refreshSleepAfterBandSync` | Line ~328 |
| `GooseSwift/HealthSleepSheetsViews.swift` | Add `@Environment(HealthDataStore.self)` + update `sleepNeededText` + add breakdown row | Lines 6–160 area |
| `GooseSwift/SleepV2ScheduleViews.swift` | Replace hardcoded `"7h 39m"` with dynamic value in `SleepV2SleepWindowCard` | Line 52 |
| `GooseSwift/HealthSleepOverviewViews.swift` | Add `Task { await healthStore.runDynamicSleepNeed() }` in `.onAppear` | Line ~147 |

**HealthSleepOverviewViews.swift** has no sleep-need display of its own — it only triggers `showingSleepNeededSheet = true` when the card is tapped, and the card (`SleepV2SleepWindowCard`) is in `SleepV2ScheduleViews.swift`. The overview file needs only the onAppear trigger addition.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | XCTest (Swift) |
| Config file | GooseSwiftTests/ target in GooseSwift.xcodeproj |
| Quick run command | `xcodebuild test -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:GooseSwiftTests 2>&1 | grep -E 'error:|passed|failed'` |
| Full suite command | Same with no `-only-testing` filter |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| SLP-NEED-03 | `dynamicSleepNeed` populated from bridge | Unit | Mock bridge response; assert struct fields |
| SLP-NEED-03 | nil when bridge errors | Unit | Bridge throws; assert `dynamicSleepNeed == nil` |
| SLP-NEED-03 | Display format h/m | Unit | Assert `"7h 30m recommended tonight"` from 450 min |
| SLP-NEED-03 | Display format h-only | Unit | Assert `"8h recommended tonight"` from 480 min |
| SLP-NEED-03 | Fallback 450 replaces 480 | Unit | Verify sleepArgs["sleep_need_minutes"] == 450.0 when nil |
| SLP-NEED-03 | Breakdown text format | Unit | Assert `"Base 7.5h · Debt +15m · Strain +0m"` |

No UI automation tests required for this phase — logic is pure value transformation testable with unit tests.

---

## Environment Availability

Step 2.6: SKIPPED — no external dependencies. All changes are Swift source edits using existing project infrastructure (GooseRustBridge, UserDefaults, existing bridge method).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `hkUserAge()` is `private` and cannot be called cross-extension | Pitfall 2 / Pattern 4 | If it's `internal`, no change needed to Snapshots |
| A2 | SleepV2SleepWindowCard "7h 39m" is fully hardcoded (not driven by any property) | Pattern 8 | If it already reads from store, the fix is simpler |

Note: A1 and A2 were directly verified by reading source — both confirmed. Assumptions log is empty (all claims verified from source). The table above is retained for completeness but both items resolved to VERIFIED state.

---

## Sources

### Primary (HIGH confidence — direct source read)
- `GooseSwift/HealthDataStore.swift` lines 1–144 — @Observable class structure, stored property pattern
- `GooseSwift/HealthDataStore+Sleep.swift` lines 1–354 — existing sleep extension structure
- `GooseSwift/HealthDataStore+Recovery.swift` lines 37–126 — runRecoveryV1 pattern to follow
- `GooseSwift/HealthDataStore+StagingSleep.swift` lines 4–55 — SleepStagingResult/runSleepStaging pattern
- `GooseSwift/HealthDataStore+Snapshots.swift` lines 1–100, 1025–1037 — hkUserAge(), 480.0 fallbacks
- `GooseSwift/HealthSleepSheetsViews.swift` lines 1–160 — SleepV2SleepNeededSheet, sleepNeededText
- `GooseSwift/HealthSleepOverviewViews.swift` lines 1–220 — onAppear trigger sites, sheet presentation
- `GooseSwift/SleepV2ScheduleViews.swift` lines 1–82 — SleepV2SleepWindowCard hardcoded "7h 39m"
- `Rust/core/src/bridge/sleep.rs` lines 163–181 — SleepComputeNeedArgs, return JSON shape

### Secondary (MEDIUM confidence)
- `GooseSwift/OnboardingPersistence.swift` line 8 — `OnboardingStorage.dateOfBirth` = `"goose.swift.profile.dateOfBirth"`

---

## Metadata

**Confidence breakdown:**
- File locations and line numbers: HIGH — read directly from source
- Bridge return shape: HIGH — read from Rust source
- hkUserAge() access modifier: HIGH — grep confirmed `private func hkUserAge()`
- SleepV2SleepWindowCard hardcode: HIGH — read directly, no store injection present

**Research date:** 2026-06-26
**Valid until:** 2026-07-26 (stable codebase)
