# Phase 121: Body Composition UI + HealthKit Import - Research

**Researched:** 2026-06-27
**Domain:** SwiftUI section card, HealthKit import, Swift Charts sparkline, @Observable HealthDataStore extension
**Confidence:** HIGH — all findings verified directly against project source files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: New `HealthBodyCompositionSection` in the Health tab (`HealthDashboardViews.swift`), following the existing section pattern (`HealthActivityOverviewSection`, `HealthVitalsPreviewSection`). Section card shows: last logged weight + date, weight sparkline (7-day), "Log" button → opens `BodyCompositionEntrySheet`, "Import from Health" button.
- D-02: Sheet with three optional numeric fields: weight (mandatory for save), body fat % (optional), muscle mass kg (optional). "Confirm" taps `body_composition.upsert` bridge with `source='manual'`. Sheet dismisses on success.
- D-03: User-triggered via "Import from Health" button in `HealthBodyCompositionSection`. No automatic polling. Reads `HKQuantityTypeIdentifierBodyMass` + `HKQuantityTypeIdentifierBodyFatPercentage`. Writes with `source='healthkit'` and `INSERT OR REPLACE` semantics (handled by the Rust `upsert` method's UNIQUE constraint).
- D-04: Follow `Locale.current.measurementSystem`. Metric → kg. Imperial (US) → lbs (1 kg = 2.20462 lbs). Convert for display only; all bridge calls use kg. Format: `"%.1f kg"` or `"%.1f lbs"`. If locale is indeterminate, default to kg.
- D-05: Inline weight sparkline within the `HealthBodyCompositionSection` card. Uses Swift Charts (`Chart` + `.lineMark`). Renders last 7 days of history from `body_composition.history_between`. Chart absent (view hidden) when history is empty. Follows Swift Charts pattern from `SleepV2BevelTrendViews.swift`.
- D-06: Bridge calls dispatched off-main-thread via `Task { await ... }` or the existing bridge async pattern. `@Observable` HealthDataStore (not @ObservableObject). Published via a new `var bodyCompositionHistory: [BodyCompositionRow]` plain stored property (same @Observable pattern as `dynamicSleepNeed`).
- D-07: New Swift files: `BodyCompositionEntrySheet.swift` + `HealthBodyCompositionSection.swift` (or combined into one file). Both require Xcode `project.pbxproj` registration at 4 locations each.

### Claude's Discretion
- `BodyCompositionRow` local Swift struct (weight_kg, body_fat_pct, muscle_mass_kg, source, date)
- HealthKit authorization: request HKQuantityTypeIdentifierBodyMass + BodyFatPercentage before import
- Sparkline Y-axis: weight only (most meaningful metric); body fat shown as text below
- No trend chart for body fat % or muscle mass in this phase — weight only

### Deferred Ideas (OUT OF SCOPE)
- BODY-01 (Phase 116, done), stealth UI (Phase 122)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BODY-02 | Manual body composition logging (weight, body fat %, muscle mass) via entry sheet | D-02; bridge args fully verified in Rust source |
| BODY-03 | HealthKit weight history import (user-triggered) + display in Health tab section | D-01, D-03, D-05; HK authorization pattern verified in HealthKitFullImporter.swift |
</phase_requirements>

---

## Summary

Phase 121 is a pure Swift UI + HealthKit phase. The Rust bridge layer (`body_composition.upsert` and `body_composition.history_between`) is already complete from Phase 116. This phase adds the presentation layer: a new `HealthBodyCompositionSection` card in the Health tab, a `BodyCompositionEntrySheet` for manual logging, a user-triggered HealthKit import flow, and a 7-day weight sparkline using the project's custom CoreGraphics chart renderer.

The Health tab (`HealthView.swift`) is a `LazyVStack` that renders sections in order: `HealthDashboardStatusHeader` → `HealthActivityOverviewSection` → `HealthVitalsPreviewSection` → `HealthRouteShortcutSection`. The new `HealthBodyCompositionSection` slots in after `HealthVitalsPreviewSection` and before `HealthRouteShortcutSection`. `HealthView` already has both `@Environment(GooseAppModel.self)` and `@Environment(HealthDataStore.self)` injected — no new environment additions needed.

**Important chart finding:** `SleepV2BevelTrendViews.swift` does NOT use the `Swift Charts` framework (`import Charts`). It implements a fully custom CoreGraphics chart using `Path`, `GeometryReader`, and `ZStack`. The sparkline in this phase must follow that same pattern — not `Chart { LineMark(...) }` from Swift Charts — to stay consistent with the codebase and avoid adding a new framework dependency.

**Primary recommendation:** Two new files (`HealthBodyCompositionSection.swift`, `BodyCompositionEntrySheet.swift`), one new stored property on `HealthDataStore`, one new extension (`HealthDataStore+BodyComposition.swift`), and four pbxproj registration edits per new file. No Rust changes.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Body composition entry form | Frontend (SwiftUI sheet) | — | Pure UI input, dismisses on bridge success |
| HK authorization + query | Frontend (SwiftUI task) | — | Runs off-main-thread via async Task |
| Bridge call (upsert/history) | Rust core via GooseRustBridge | — | All persistence goes through FFI bridge |
| Section card + sparkline | Frontend (SwiftUI view) | — | Display-only, reads from HealthDataStore |
| State holding (bodyCompositionHistory) | HealthDataStore (@Observable) | — | Matches all other health state ownership |

---

## Standard Stack

### Core (all already present in project — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SwiftUI | iOS 26.0 SDK | Section card, entry sheet, buttons | Project-wide UI framework |
| HealthKit | iOS 26.0 SDK | Query body mass + body fat % samples | Already used in HealthKitFullImporter |
| Foundation | iOS 26.0 SDK | Date, Locale, NumberFormatter | Universal |
| CoreGraphics / Path | iOS 26.0 SDK | Custom sparkline (via GeometryReader + Path) | Project chart pattern — NOT Swift Charts |

No new packages. No SPM additions. No import Charts.

**Installation:** None required — all frameworks already linked in `GooseSwift.xcodeproj`.

---

## Package Legitimacy Audit

> No new external packages are introduced in this phase. All frameworks are Apple system frameworks already present in the project. This section is not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
HealthView (LazyVStack)
  ├── HealthDashboardStatusHeader
  ├── HealthActivityOverviewSection
  ├── HealthVitalsPreviewSection
  ├── HealthBodyCompositionSection  ← NEW
  │     ├── last weight + date label
  │     ├── WeightSparklineView (7-day, CoreGraphics Path)
  │     ├── body fat % text (if available)
  │     ├── [Log] button → BodyCompositionEntrySheet (sheet)
  │     └── [Import from Health] button → async HK import task
  └── HealthRouteShortcutSection

BodyCompositionEntrySheet (sheet)
  ├── weight TextField (mandatory)
  ├── body fat % TextField (optional)
  ├── muscle mass TextField (optional)
  └── [Confirm] → bridge.request("body_composition.upsert", source="manual")
                → on success: dismiss + reload history

HealthDataStore (extension: +BodyComposition)
  ├── var bodyCompositionHistory: [BodyCompositionRow]  (stored on base class)
  ├── func loadBodyCompositionHistory() async           (calls history_between)
  └── func importBodyCompositionFromHealthKit() async   (HK query → upsert loop)
```

### Recommended Project Structure

```
GooseSwift/
├── HealthBodyCompositionSection.swift   # NEW — section card + sparkline view
├── BodyCompositionEntrySheet.swift      # NEW — manual entry form sheet
├── HealthDataStore+BodyComposition.swift # NEW — loadHistory + HK import methods
├── HealthDataStore.swift                # MODIFIED — add bodyCompositionHistory stored property
├── HealthDashboardViews.swift           # NO CHANGE — section struct defined in HealthBodyCompositionSection.swift
└── HealthView.swift                     # MODIFIED — add HealthBodyCompositionSection() call
```

### Pattern 1: HealthDataStore stored property addition (D-06)

The `@Observable` macro forbids stored properties in Swift extensions — they must live in the base class body. Every existing property follows this pattern with a comment explaining the constraint.

**Verified pattern** from `HealthDataStore.swift` lines 112–113:

```swift
// Source: GooseSwift/HealthDataStore.swift (verified directly)

// Dynamic sleep need from sleep.compute_need bridge (SLP-NEED-03).
// Stored here because Swift extensions cannot add stored properties to @Observable classes.
var dynamicSleepNeed: DynamicSleepNeed?
```

Apply the same pattern for body composition:

```swift
// Body composition history from body_composition.history_between bridge (BODY-02, BODY-03).
// Stored here because Swift extensions cannot add stored properties to @Observable classes.
var bodyCompositionHistory: [BodyCompositionRow] = []
```

[VERIFIED: GooseSwift/HealthDataStore.swift]

### Pattern 2: HealthDataStore extension async bridge call

Verified pattern from `HealthDataStore+Sleep.swift` `runDynamicSleepNeed()`:

```swift
// Source: GooseSwift/HealthDataStore+Sleep.swift (verified directly)

func runDynamicSleepNeed() async {
  let db = databasePath
  do {
    let report = try await bridge.requestAsync(method: "sleep.compute_need", args: bridgeArgs)
    // parse report fields ...
    self.dynamicSleepNeed = DynamicSleepNeed(...)
  } catch {
    self.dynamicSleepNeed = nil
  }
}
```

Body composition history equivalent:

```swift
// Source: pattern from HealthDataStore+Sleep.swift
func loadBodyCompositionHistory() async {
  let db = databasePath
  let df = Self.isoDateFormatter  // yyyy-MM-dd
  let end = df.string(from: Date())
  let start = df.string(from: Date().addingTimeInterval(-7 * 24 * 60 * 60))
  do {
    let result = try await bridge.requestAsync(
      method: "body_composition.history_between",
      args: ["database_path": db, "start_date": start, "end_date": end]
    )
    let rows = (result["rows"] as? [[String: Any]]) ?? (result as? [[String: Any]]) ?? []
    self.bodyCompositionHistory = rows.compactMap { BodyCompositionRow(from: $0) }
  } catch {
    // leave existing history; caller logs error
  }
}
```

[VERIFIED: GooseSwift/HealthDataStore+Sleep.swift]

### Pattern 3: HealthKit authorization — additive type set

`HealthKitFullImporter.readTypes()` builds a `Set<HKObjectType>` from a fixed list. Body mass types are NOT currently in the list. The import for body composition must either:

a) Add `HKQuantityTypeIdentifierBodyMass` and `HKQuantityTypeIdentifierBodyFatPercentage` to a **separate authorization call** made on-demand when the user taps "Import from Health", OR
b) Call `requestAuthorization` before each import (HealthKit deduplicates — safe to call multiple times).

The standalone on-demand pattern is preferred because `HealthKitFullImporter.importAll()` is already called from elsewhere and its type set should not change silently.

```swift
// Source: pattern from HealthKitFullImporter.swift (verified)

static func requestBodyCompositionAuth() async throws {
  let store = HKHealthStore()
  var types = Set<HKObjectType>()
  if let t = HKObjectType.quantityType(forIdentifier: .bodyMass) { types.insert(t) }
  if let t = HKObjectType.quantityType(forIdentifier: .bodyFatPercentage) { types.insert(t) }
  try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
    store.requestAuthorization(toShare: [], read: types) { ok, err in
      if let err { cont.resume(throwing: err) } else { cont.resume() }
    }
  }
}
```

[VERIFIED: GooseSwift/HealthKitFullImporter.swift]

### Pattern 4: Custom CoreGraphics sparkline (NOT Swift Charts)

`SleepV2BevelTrendViews.swift` — the canonical sparkline reference — uses `GeometryReader` + manual `Path` construction + `ZStack`. There is no `import Charts` anywhere in the file. The project's chart system is entirely hand-rolled.

The weight sparkline must follow the same approach:

```swift
// Source: GooseSwift/SleepV2BevelTrendViews.swift (verified — custom Path renderer)

struct WeightSparklineView: View {
  let points: [Double]   // weight_kg values, oldest to newest
  let tint: Color

  var body: some View {
    GeometryReader { proxy in
      let plot = CGRect(x: 0, y: 4, width: proxy.size.width, height: proxy.size.height - 4)
      ZStack(alignment: .topLeading) {
        trendLine(in: plot)
          .stroke(tint, style: StrokeStyle(lineWidth: 2.4, lineCap: .round, lineJoin: .round))
        envelopePath(in: plot)
          .fill(tint.opacity(0.15))
      }
    }
  }

  private func trendLine(in plot: CGRect) -> Path {
    Path { path in
      let domain = valueDomain
      for (index, value) in points.enumerated() {
        let pt = chartPoint(index: index, value: value, plot: plot, domain: domain)
        if index == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
      }
    }
  }

  private var valueDomain: (min: Double, max: Double) {
    let lo = points.min() ?? 0
    let hi = points.max() ?? 1
    let pad = max((hi - lo) * 0.3, 0.5)
    return (lo - pad, hi + pad)
  }

  private func chartPoint(index: Int, value: Double, plot: CGRect, domain: (min: Double, max: Double)) -> CGPoint {
    let x = plot.minX + plot.width * CGFloat(index) / CGFloat(max(points.count - 1, 1))
    let normalized = (value - domain.min) / max(domain.max - domain.min, 1)
    let y = plot.maxY - plot.height * CGFloat(normalized)
    return CGPoint(x: x, y: y)
  }

  private func envelopePath(in plot: CGRect) -> Path {
    let domain = valueDomain
    let spread = max((domain.max - domain.min) * 0.08, 0.2)
    return Path { path in
      for (i, v) in points.enumerated() {
        let pt = chartPoint(index: i, value: v + spread, plot: plot, domain: domain)
        if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
      }
      for (i, v) in points.enumerated().reversed() {
        path.addLine(to: chartPoint(index: i, value: v - spread, plot: plot, domain: domain))
      }
      path.closeSubpath()
    }
  }
}
```

[VERIFIED: GooseSwift/SleepV2BevelTrendViews.swift]

### Pattern 5: HealthView section insertion point

`HealthView.swift` `body` `LazyVStack` — verified section order:

```swift
// Source: GooseSwift/HealthView.swift (verified directly)

LazyVStack(alignment: .leading, spacing: 22) {
  HealthDashboardStatusHeader(...)
  HealthActivityOverviewSection(...)
  HealthVitalsPreviewSection(snapshots: cachedVitalSnapshots)
  // ← INSERT HealthBodyCompositionSection() HERE
  HealthRouteShortcutSection(title: "Explore Health", snapshots: ...)
}
```

`HealthView` already has `@Environment(HealthDataStore.self) private var healthStore` — the section reads from it directly via `@Environment`.

[VERIFIED: GooseSwift/HealthView.swift]

### Pattern 6: Section card visual style

All sections use `.healthDashboardSurface(tint:, tintOpacity:)` or `.healthCardSurface()` modifiers. The existing `HealthDashboardMetricCard` is the closest structural match (icon header, value, subtitle, tint-colored surface). `HealthBodyCompositionSection` should use the same `.healthDashboardSurface(tint: .blue, tintOpacity: 0.08)` surface modifier (body/scale icon in blue is the conventional iOS pattern).

[VERIFIED: GooseSwift/HealthDashboardViews.swift]

### Anti-Patterns to Avoid

- **import Charts:** Do not add `import Charts`. The project uses custom CoreGraphics Path charts exclusively. Adding the Charts framework would be a new dependency inconsistent with the codebase.
- **@Published or @ObservableObject:** `HealthDataStore` is `@Observable` (Observation framework, Swift 5.9+), not `ObservableObject`. Use plain `var` stored properties — no `@Published` wrapper.
- **Extension stored property:** Cannot add `var bodyCompositionHistory` in an extension file — it must be in the base `HealthDataStore.swift` class body. The codebase documents this constraint with a standard comment on every such property.
- **HKHealthStore.isHealthDataAvailable() check skipped:** `HealthKitFullImporter` always guards with this check first. The body composition import must do the same — HealthKit is unavailable on iPads without iPhone pairing.
- **Calling bridge on @MainActor inline:** The bridge is synchronous; always dispatch to a background `Task` (bridge.requestAsync pattern). The extension `runDynamicSleepNeed()` is the reference.

---

## Bridge Args Reference (Verified)

### body_composition.upsert

```
Source: Rust/core/src/bridge/body_composition.rs (verified directly)
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `database_path` | String | YES | Always `healthStore.databasePath` |
| `date` | String | YES | ISO date string `"yyyy-MM-dd"` |
| `source` | String | YES | `"manual"` or `"healthkit"` |
| `weight_kg` | f64 | NO (Option) | nil omitted from JSON |
| `bmi` | f64 | NO (Option) | Not used in this phase |
| `body_fat_pct` | f64 | NO (Option) | percent value e.g. `22.5` |
| `muscle_mass_kg` | f64 | NO (Option) | kg value |
| `water_pct` | f64 | NO (Option) | Not used in this phase |

The Rust struct uses `Option<f64>` for all body metrics — they can each be independently omitted. The `date` field is a required `String` (not `Date`). The Rust `upsert` uses SQLite `INSERT OR REPLACE` semantics.

### body_composition.history_between

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `database_path` | String | YES | `healthStore.databasePath` |
| `start_date` | String | YES | ISO date `"yyyy-MM-dd"` |
| `end_date` | String | YES | ISO date `"yyyy-MM-dd"` |

Returns a JSON array where each element has: `date`, `source`, `weight_kg` (nullable), `bmi` (nullable), `body_fat_pct` (nullable), `muscle_mass_kg` (nullable), `water_pct` (nullable).

[VERIFIED: Rust/core/src/bridge/body_composition.rs]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HealthKit authorization | Custom permission UI | `HKHealthStore.requestAuthorization(toShare:read:)` | System sheet required by Apple |
| SQLite upsert | INSERT/UPDATE logic | `body_composition.upsert` bridge | Already implemented in Phase 116 |
| Unit conversion display | Custom formatter | `Locale.current.measurementSystem` + multiply by 2.20462 | Already decided (D-04) |
| Weight chart | Swift Charts `Chart { LineMark }` | Custom `Path` + `GeometryReader` | Project pattern; no import Charts |

---

## Common Pitfalls

### Pitfall 1: bridge.requestAsync returns top-level array, not dict with "rows" key

**What goes wrong:** `body_composition.history_between` returns a bare JSON array (`[{...}, ...]`), not a dict with a `"rows"` key. Treating the result as `[String: Any]` and reading `result["rows"]` returns nil.

**Why it happens:** The Rust bridge wraps the return in `bridge_ok` which wraps in `{ok, result, timing}`. The Swift `requestAsync` unwraps the outer envelope and returns `result` directly. For history_between, `result` is the array itself.

**How to avoid:** Cast `result` as `[[String: Any]]` directly. Check Rust source — `Ok(serde_json::json!(result))` where `result` is `Vec<serde_json::Value>` confirms this.

**Warning signs:** `bodyCompositionHistory` always empty even after upserts.

[VERIFIED: Rust/core/src/bridge/body_composition.rs]

### Pitfall 2: Swift Charts import — not present in project

**What goes wrong:** Adding `import Charts` and using `Chart { LineMark(...) }` compiles but introduces a new framework dependency inconsistent with the project's established chart pattern.

**Why it happens:** D-05 says "follows Swift Charts pattern from SleepV2BevelTrendViews.swift" — but that file uses CoreGraphics Path, not the Charts framework. The naming is ambiguous.

**How to avoid:** Use the `GeometryReader` + `Path` pattern extracted from `SleepV2BevelTrendViews.swift`. Do not add `import Charts`.

[VERIFIED: GooseSwift/SleepV2BevelTrendViews.swift — no import Charts present]

### Pitfall 3: Stored property in extension fails at compile time

**What goes wrong:** Adding `var bodyCompositionHistory: [BodyCompositionRow] = []` inside a Swift extension on `HealthDataStore` causes a compile error: "Extensions must not contain stored properties."

**Why it happens:** The `@Observable` macro and Swift itself prohibit stored properties in extensions on classes.

**How to avoid:** Add the property directly inside `final class HealthDataStore { }` in `HealthDataStore.swift`, with the standard comment.

[VERIFIED: GooseSwift/HealthDataStore.swift — all stored properties are in base class body]

### Pitfall 4: Missing HealthKit entitlement for new type identifiers

**What goes wrong:** Querying `HKQuantityTypeIdentifier.bodyMass` without including it in the authorization request silently returns no samples.

**Why it happens:** HealthKit requires explicit per-type authorization. The current `HealthKitFullImporter.readTypes()` does not include `.bodyMass` or `.bodyFatPercentage`.

**How to avoid:** Call `requestAuthorization` with these types before the first query. The app already has `com.apple.developer.healthkit` entitlement, so no entitlement change needed — just add the types to the authorization request.

[VERIFIED: GooseSwift/HealthKitFullImporter.swift readTypes() + GooseSwift/GooseSwift.entitlements]

### Pitfall 5: pbxproj UUID collision

**What goes wrong:** If the next UUID slot is already occupied, the build silently fails or Xcode reports a reference error.

**How to avoid:** The last two E2 UUIDs in the project are `E2000000000000000000017` and `E2000000000000000000018`. The next two available slots are `E1/E2000000000000000000019` (for file 1) and `E1/E200000000000000000001A` (for file 2). Always verify: `grep 'E[12]00000000000000000001[9A]' project.pbxproj` must return empty before use.

[VERIFIED: GooseSwift.xcodeproj/project.pbxproj]

---

## Runtime State Inventory

> Not applicable — this is a greenfield UI addition. No renames, no migrations. No runtime state affected.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| HealthKit framework | D-03 HK import | ✓ | iOS 26.0 SDK | Skip import button if `!HKHealthStore.isHealthDataAvailable()` |
| Rust bridge (body_composition.*) | D-02, D-03 upsert + history | ✓ | Phase 116 complete | — |
| GooseRustBridge.requestAsync | All bridge calls | ✓ | Present in HealthDataStore+Sleep.swift | — |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | XCTest (Swift) — `GooseSwiftTests/` target |
| Config file | `GooseSwift.xcodeproj` (no separate config file) |
| Quick run command | `xcodebuild test -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' -derivedDataPath /tmp/goose-test CODE_SIGNING_ALLOWED=NO 2>&1 \| grep -E 'error:|PASS|FAIL'` |
| Full suite command | Same — 69 tests in 16 files |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| BODY-02 | Manual entry sheet saves weight via bridge upsert | Manual (sheet UI) | Simulator tap test | ❌ Wave 0 |
| BODY-03 | HK import button queries body mass + persists to bridge | Manual (requires HK data) | Manual only | ❌ Wave 0 |
| BODY-02 | BodyCompositionRow decodes from bridge JSON response | Unit | `xcodebuild test ... -only-testing:GooseSwiftTests/BodyCompositionTests` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `GooseSwiftTests/BodyCompositionTests.swift` — unit tests for `BodyCompositionRow` JSON decoding and unit conversion (kg → lbs)
- [ ] No test for UI interaction — manual simulator verification sufficient per project pattern

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Weight/BF% inputs validated as positive numeric before bridge call; reject negative, zero, or non-numeric values |
| V4 Access Control | yes | HealthKit authorization system sheet — no custom access control needed |
| V2 Authentication | no | Local device data only |
| V6 Cryptography | no | No secrets involved |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Injected bridge args with NaN/Inf | Tampering | Validate Double.isFinite before passing to bridge |
| HealthKit auth denial (user taps "Don't Allow") | Denial of Service | Handle auth failure gracefully, show error label, no crash |

---

## Pbxproj Registration Reference

The two new files require 4 pbxproj locations each. Next available UUID slots (verified empty):

| File | PBXBuildFile UUID | PBXFileReference UUID |
|------|-------------------|-----------------------|
| `HealthBodyCompositionSection.swift` | `E1000000000000000000019` | `E2000000000000000000019` |
| `BodyCompositionEntrySheet.swift` | `E100000000000000000001A` | `E200000000000000000001A` |
| `HealthDataStore+BodyComposition.swift` | `E100000000000000000001B` | `E200000000000000000001B` |

Anchor for group insertion: adjacent to `HealthDashboardViews.swift` (in group) and `HealthDataStore+Sleep.swift` (for extension file).

Validation command after all edits:
```bash
grep -c 'HealthBodyCompositionSection.swift' GooseSwift.xcodeproj/project.pbxproj  # expect 4
grep -c 'BodyCompositionEntrySheet.swift' GooseSwift.xcodeproj/project.pbxproj      # expect 4
grep -c 'HealthDataStore+BodyComposition.swift' GooseSwift.xcodeproj/project.pbxproj # expect 4
```

[VERIFIED: GooseSwift.xcodeproj/project.pbxproj — E1/E2...018 is last used]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `bridge.requestAsync` returns `[[String: Any]]` directly for history_between (bare array, not wrapped in "rows" key) | Pitfall 1 / Bridge Args | If wrong, history always empty; fix by reading correct key |
| A2 | `HealthDataStore` has a `isoDateFormatter` or equivalent for `"yyyy-MM-dd"` formatting | Pattern 2 code example | If absent, create a local `DateFormatter` with `"yyyy-MM-dd"` format in the extension |

**If A2 is wrong:** `HealthDataStore+Sleep.swift` uses `Self.hkDateFormatter` (a `nonisolated static let` with `dateFormat = "yyyy-MM-dd"`). Use that.

---

## Open Questions

1. **`bridge.requestAsync` exact return shape for array-valued methods**
   - What we know: Rust `bridge_ok` wraps result in `{ok, result, timing_ms}`. Swift `requestAsync` unwraps to `result`. For `history_between`, `result` is the array.
   - What's unclear: Whether Swift `requestAsync` returns `[String: Any]` always (requiring cast to `[[String: Any]]`) or can return typed results.
   - Recommendation: Check `GooseRustBridge.requestAsync` signature; cast result with `as? [[String: Any]] ?? []`.

2. **Single file or two files for section + sheet (D-07)**
   - CONTEXT.md says "or combined into one file". Recommendation: two files — `HealthBodyCompositionSection.swift` and `BodyCompositionEntrySheet.swift` — for consistency with project naming (each file = one primary type) and easier pbxproj management.

---

## Sources

### Primary (HIGH confidence — verified against project source files)
- `GooseSwift/HealthView.swift` — section insertion point, environment variables available
- `GooseSwift/HealthDataStore.swift` — @Observable pattern, stored property placement, all existing properties
- `GooseSwift/HealthDataStore+Sleep.swift` — bridge.requestAsync pattern, dynamicSleepNeed exact template
- `GooseSwift/HealthKitFullImporter.swift` — authorization pattern, existing type set (body mass types absent)
- `GooseSwift/SleepV2BevelTrendViews.swift` — chart renderer (custom Path, NOT Swift Charts)
- `GooseSwift/HealthDashboardViews.swift` — section view pattern, surface modifiers
- `Rust/core/src/bridge/body_composition.rs` — exact bridge arg structs and return format
- `GooseSwift.xcodeproj/project.pbxproj` — UUID slots, last registered files

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions — locked by user in discuss phase

---

## Metadata

**Confidence breakdown:**
- Bridge args: HIGH — read directly from Rust source, all field names and Option/required status verified
- HealthView insertion point: HIGH — read directly from source, exact LazyVStack child order confirmed
- @Observable stored property pattern: HIGH — verified against 10+ existing properties with same comment
- HealthKit authorization pattern: HIGH — verified against existing `requestAuthorization` call in HealthKitFullImporter
- Chart pattern (CoreGraphics, NOT Swift Charts): HIGH — confirmed no `import Charts` in SleepV2BevelTrendViews.swift
- pbxproj UUID slots: HIGH — grep confirmed E1/E2...018 is last used

**Research date:** 2026-06-27
**Valid until:** 2026-07-27 (stable iOS/Swift codebase)
