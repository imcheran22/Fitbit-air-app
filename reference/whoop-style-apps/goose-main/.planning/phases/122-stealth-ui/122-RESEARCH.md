# Phase 122: Stealth UI — Research

**Researched:** 2026-06-27
**Domain:** SwiftUI navigation patterns, EnvironmentKey, HealthMetricSnapshot render architecture
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: New `NavigationLink` row inside `Section("Settings")` in `MoreView.swift`. Label: "Metrics Privacy". Destination: new `StealthMetricsView`. Adds to `MoreRoute` enum as `.stealthMetrics`. No new file section needed — reuses existing More tab infrastructure.
- D-02: `StealthMetricsView` — new file `GooseSwift/StealthMetricsView.swift`. List with one section, 6 rows. Each row: `Toggle(metricDisplayName, isOn: binding)` where binding is `@AppStorage(StealthStorage.<key>)`. Metric display names: "Recovery Score", "Strain Score", "HRV (RMSSD)", "Resting HR", "Sleep Performance", "Stress Score". No navigation within the view — flat list only.
- D-03: New `EnvironmentKey`: `StealthMaskKey` with `defaultValue = StealthMask.none`, and `extension EnvironmentValues { var stealthMask: StealthMask }`. Views read `@Environment(\.stealthMask)` in `#if DEBUG` previews only. Production code calls `GooseStealthMode.isHidden(metric:)` directly.
- D-04: Health tab metric cards only. Each render site wraps the metric value text with: `GooseStealthMode.isHidden(metric: "<metric_key>") ? "—" : formattedValue`. The `"—"` is an em dash, not a hyphen.
- D-05: Metric keys passed to `GooseStealthMode.isHidden(metric:)` are: `"recovery_score"`, `"strain_score"`, `"hrv_rmssd"`, `"resting_hr"`, `"sleep_performance"`, `"stress_score"`.
- D-06: New file `GooseSwift/StealthMetricsView.swift`. Requires pbxproj registration at 4 locations. MoreRoute enum change in existing `MoreRouteModels.swift`.

### Claude's Discretion
- `@AppStorage(StealthStorage.<key>)` bindings update UserDefaults immediately — no explicit save needed
- Toggle animation is the default SwiftUI Toggle style — no custom styling
- `GooseStealthMode.isHidden(metric:)` reads `UserDefaults.standard` synchronously — safe to call at render time
- Preview wraps with `.environment(\.stealthMask, StealthMask(hidden: ["recovery_score"]))` to show masked state in canvas

### Deferred Ideas (OUT OF SCOPE)
- Coach masking (Phase 119, done)
- Rust changes (none)
</user_constraints>

## Summary

Phase 122 is a pure Swift UI phase layered on top of Phase 119's completed data/logic layer (`GooseStealthMode.swift`). There are two independent work streams: (1) a Settings navigation entry in the More tab that routes to a new `StealthMetricsView` toggle list, and (2) a "—" rendering gate added to the Health tab's metric card display values for the 6 targeted metrics.

The More tab uses a compile-time route table: `MoreRoute` enum cases determine which rows appear in each section, and `MoreView.destination(for:)` dispatches to concrete view types. Adding `.stealthMetrics` requires changes to five locations across two files (`MoreRouteModels.swift` + `MoreView.swift`) plus the `MoreRouteStatus` struct and `MoreDataStore` initialiser that carry the per-route status badge.

The Health tab renders metrics through `HealthMetricSnapshot.displayValue`, which is a computed property on a value type that combines `value` + `unit` fields. The 6 targeted metrics are populated by `healthMonitorSnapshots()` (for `resting-hr` / `resting-hrv` / `health-sleep`) and `landingSnapshots()` (for `recovery` / `strain` / `stress`). Because `displayValue` is called generically inside shared card components (`HealthVitalsPreviewCard`, `HealthTodayFocusCard`, `HealthMetricCard`, `HealthRouteShortcutCard`), the stealth gate cannot be inserted at the component level without a snapshot identifier. The correct insertion point — consistent with D-04 — is inside `displayValue` on `HealthMetricSnapshot`, guarded by a new `stealthKey: String` field populated at snapshot build time.

**Primary recommendation:** Add `stealthKey: String` to `HealthMetricSnapshot`, populate it for the 6 metrics at their snapshot build sites, and compute the stealth guard inside `displayValue`. This is the only approach that satisfies D-04 ("each render site wraps the metric value text") without duplicating the guard across every card component.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Settings toggle list (StealthMetricsView) | Frontend (SwiftUI view) | UserDefaults (AppStorage) | UI-only; no server or bridge call needed |
| Metric privacy check at render time | Frontend (SwiftUI view layer) | — | `GooseStealthMode.isHidden` reads UserDefaults synchronously; safe at render |
| Stealth state persistence | Storage (UserDefaults) | — | `@AppStorage` bindings write immediately; no custom save path |
| EnvironmentKey for preview injection | Frontend (SwiftUI environment) | — | Preview-only; production code bypasses environment and calls `isHidden` directly |
| MoreRoute navigation dispatch | Frontend (More tab coordinator) | — | `MoreView.destination(for:)` switch handles all route → view mapping |

## Standard Stack

### Core (no new dependencies)
This phase installs zero external packages. All required infrastructure is already present:

| Component | Location | Purpose |
|-----------|----------|---------|
| `GooseStealthMode` | `GooseSwift/GooseStealthMode.swift` | `isHidden(metric:)` query; reads UserDefaults |
| `StealthStorage` | `GooseSwift/GooseStealthMode.swift` | UserDefaults key constants for 6 metrics |
| `StealthMask` | `GooseSwift/GooseStealthMode.swift` | Value type for preview injection |
| `MoreRoute` | `GooseSwift/MoreRouteModels.swift` | Navigation route enum with static route arrays |
| `HealthMetricSnapshot` | `GooseSwift/HealthModels.swift` | Value type; `displayValue` computed property |

## Package Legitimacy Audit

> SKIPPED — this phase creates zero new file dependencies and installs no packages.

## Architecture Patterns

### System Architecture Diagram

```
MoreView (More tab)
  └── Section("Settings")
        └── NavigationLink(.stealthMetrics)
              └── StealthMetricsView
                    ├── Toggle("Recovery Score")   @AppStorage(StealthStorage.recoveryScore)
                    ├── Toggle("Strain Score")     @AppStorage(StealthStorage.strainScore)
                    ├── Toggle("HRV (RMSSD)")      @AppStorage(StealthStorage.hrvRmssd)
                    ├── Toggle("Resting HR")       @AppStorage(StealthStorage.restingHr)
                    ├── Toggle("Sleep Performance") @AppStorage(StealthStorage.sleepPerf)
                    └── Toggle("Stress Score")     @AppStorage(StealthStorage.stressScore)

HealthView (Health tab)
  ├── HealthVitalsPreviewSection(cachedVitalSnapshots)
  │     └── HealthVitalsPreviewCard(snapshot) → snapshot.displayValue ← stealth gate
  ├── HealthTodayFocusSection / HealthRouteShortcutSection
  │     └── HealthTodayFocusCard / HealthRouteShortcutCard → snapshot.displayValue ← stealth gate
  └── HealthMonitorView
        └── HealthMetricCard(snapshot) → snapshot.displayValue ← stealth gate

HealthMetricSnapshot.displayValue  ← GATE POINT
  if stealthKey.isEmpty → existing value+unit logic
  if GooseStealthMode.isHidden(metric: stealthKey) → return "—"
  else → existing value+unit logic
```

### Recommended Project Structure

No new directories. Files to create/modify:

```
GooseSwift/
├── StealthMetricsView.swift         ← NEW (toggle list + EnvironmentKey extension)
├── MoreRouteModels.swift            ← MODIFY (.stealthMetrics case + 5 additions)
├── MoreView.swift                   ← MODIFY (destination switch + settingsRoutes array)
├── MoreDataStore.swift              ← MODIFY (routeStatus init + refreshRouteStatus)
└── HealthModels.swift               ← MODIFY (stealthKey field + displayValue guard)
GooseSwift.xcodeproj/
└── project.pbxproj                  ← MODIFY (4-location registration for StealthMetricsView.swift)
```

Note: `HealthDataStore+Snapshots.swift` and `HealthDataStore+StaticSnapshots.swift` require population of `stealthKey` at snapshot build sites for the 6 metrics (see "Metric Snapshot Build Sites" below).

---

## MoreView.swift — Section("Settings") Analysis

**File:** `GooseSwift/MoreView.swift`

The Section("Settings") block at **line 97–99** renders via `routeRows(MoreRoute.settingsRoutes)`:

```swift
// MoreView.swift:97–99
Section("Settings") {
  routeRows(MoreRoute.settingsRoutes)
}
```

`routeRows` (line 138–146) is a generic `ForEach` over `[MoreRoute]` that emits `NavigationLink(value: route)` for each element. The `destination(for:)` switch (line 149–189) handles the actual view routing.

Current `settingsRoutes` (MoreRouteModels.swift line 119):
```swift
static let settingsRoutes: [MoreRoute] = [.privacy, .remoteServer]
```

**What to add:**
1. New case `.stealthMetrics` in `MoreRoute` enum
2. `title`, `subtitle`, `systemImage`, `statusKeyPath` entries in the switch statements
3. `.stealthMetrics` appended to `settingsRoutes` array
4. Case in `MoreView.destination(for:)` returning `StealthMetricsView()`
5. `stealthMetrics: MoreStatusKind` field in `MoreRouteStatus` struct
6. Initial value for `stealthMetrics` in `MoreDataStore.routeStatus` init (`.ready`)
7. `stealthMetrics: .ready` in `MoreDataStore.refreshRouteStatus(ble:model:)`

---

## MoreRouteModels.swift — Complete Modification Map

**File:** `GooseSwift/MoreRouteModels.swift` — 185 lines [VERIFIED: read]

### Enum case (after `.metricExplorer`, line 21)
```swift
case stealthMetrics
```

### title switch (after `.metricExplorer` case, line 44)
```swift
case .stealthMetrics: String(localized: "Metrics Privacy")
```

### subtitle switch (after `.metricExplorer` case, line 68)
```swift
case .stealthMetrics: String(localized: "Hide individual metrics from the Health dashboard")
```

### systemImage switch (after `.metricExplorer` case, line 91)
```swift
case .stealthMetrics: "eye.slash"
```

### statusKeyPath switch (after `.metricExplorer` case, line 114)
```swift
case .stealthMetrics: \.stealthMetrics
```

### settingsRoutes array (line 119)
```swift
static let settingsRoutes: [MoreRoute] = [.privacy, .remoteServer, .stealthMetrics]
```

### MoreRouteStatus struct (after `metricExplorer` field, line 145)
```swift
var stealthMetrics: MoreStatusKind
```

---

## MoreDataStore.swift — Required Changes

**File:** `GooseSwift/MoreDataStore.swift`

### routeStatus init (line 12–31) — add field
```swift
// In the MoreRouteStatus(...) initializer at init time, add:
stealthMetrics: .ready
```

### refreshRouteStatus (line 151–171) — add field
```swift
// In the MoreRouteStatus(...) initializer inside refreshRouteStatus, add:
stealthMetrics: .ready
```

---

## GooseStealthMode.swift — Infrastructure Confirmed

**File:** `GooseSwift/GooseStealthMode.swift` — 69 lines [VERIFIED: read]

All three required types exist and are correct:

| Type | Confirmed |
|------|-----------|
| `StealthStorage` — 6 key constants | `recoveryScore`, `strainScore`, `hrvRmssd`, `restingHr`, `sleepPerf`, `stressScore` |
| `GooseStealthMode.isHidden(metric:)` | Dispatches string keys: `"recovery_score"`, `"strain_score"`, `"hrv_rmssd"`, `"resting_hr"`, `"sleep_performance"`, `"stress_score"` |
| `StealthMask` | `hidden: Set<String>`, `isHidden(_:)`, `static let none` |

---

## HealthDashboardViews.swift — Render Architecture

**File:** `GooseSwift/HealthDashboardViews.swift` — 639 lines [VERIFIED: read]

### Key finding: there are NO per-metric render sites in this file.

All metric values render generically through shared card components, all reading `snapshot.displayValue`:

| Component | Lines | Used by |
|-----------|-------|---------|
| `HealthTodayFocusCard` | 79–115 | `HealthTodayFocusSection` (ForEach over snapshots) |
| `HealthVitalsPreviewCard` | 237–268 | `HealthVitalsPreviewSection` (ForEach over snapshots) |
| `HealthRouteShortcutCard` | 289–317 | `HealthRouteShortcutSection` (ForEach over snapshots) |
| `HealthMetricCard` | 417–453 | `HealthCardGroup`, `HealthMonitorView` (ForEach over snapshots) |
| `HealthDashboardMetricCard` | 173–214 | Activity section — Steps, Active Calories, Heart Rate only (NOT one of the 6 stealth metrics) |

**Conclusion:** The stealth gate cannot be inserted inline at a specific line in `HealthDashboardViews.swift` for each of the 6 metrics because there is no per-metric line — only generic `snapshot.displayValue`. The CONTEXT.md phrase "each render site" refers conceptually to where each metric's value text is shown; the implementation gate must live at `HealthMetricSnapshot.displayValue`.

### Correct implementation approach (satisfies D-04)

Add a `stealthKey: String` field to `HealthMetricSnapshot` (default `""`), and modify `displayValue`:

```swift
// HealthModels.swift — HealthMetricSnapshot
struct HealthMetricSnapshot: Identifiable {
  // ... existing fields ...
  let stealthKey: String  // "" for non-stealth metrics; one of the 6 keys for stealth metrics

  var displayValue: String {
    if !stealthKey.isEmpty && GooseStealthMode.isHidden(metric: stealthKey) {
      return "—"
    }
    guard !unit.isEmpty else { return value }
    if unit == "%" {
      let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmedValue.isEmpty, trimmedValue != "--" else { return trimmedValue }
      return trimmedValue.hasSuffix("%") ? trimmedValue : "\(trimmedValue)%"
    }
    return "\(value) \(unit)"
  }
}
```

This satisfies D-04 ("wraps the metric value text") while keeping `HealthDashboardViews.swift` unchanged.

---

## Metric Snapshot Build Sites — All 6 Metrics

Because `HealthMetricSnapshot` gains a new `stealthKey` field, every existing call site that constructs a snapshot must either supply `stealthKey: ""` (default, for non-stealth snapshots) OR the correct metric key for the 6 targets. Since `HealthMetricSnapshot` is a struct with positional members, adding a field with a default value is cleanest.

**Recommended approach:** Add `stealthKey: String = ""` to `HealthMetricSnapshot`. Existing call sites compile without changes; only the 6 target sites need explicit population.

### The 6 target snapshot build sites

| Metric | Stealth Key | Snapshot ID | Build Location |
|--------|-------------|-------------|----------------|
| recovery_score | `"recovery_score"` | `"recovery"` (baseLandingSnapshots) + live in `recoverySnapshot()` | `HealthDataStore+StaticSnapshots.swift:10`, `HealthDataStore+Snapshots.swift:468–521` |
| strain_score | `"strain_score"` | `"strain"` (baseLandingSnapshots) + live in `strainSnapshot()` | `HealthDataStore+StaticSnapshots.swift:11`, `HealthDataStore+Snapshots.swift:344–396` |
| sleep_performance | `"sleep_performance"` | `"sleep"` (baseLandingSnapshots) + `"health-sleep"` (baseHealthMonitorSnapshots) + live in `sleepSnapshot()` / `sleepHealthMonitorSnapshot()` | `HealthDataStore+StaticSnapshots.swift:9,27`, `HealthDataStore+Snapshots.swift:358–465` |
| stress_score | `"stress_score"` | `"stress"` (baseLandingSnapshots) + live in `stressSnapshot()` | `HealthDataStore+StaticSnapshots.swift:12`, `HealthDataStore+Snapshots.swift` (stressSnapshot) |
| hrv_rmssd | `"hrv_rmssd"` | `"resting-hrv"` (baseHealthMonitorSnapshots) + live in `packetBackedHealthMonitorSnapshot` | `HealthDataStore+StaticSnapshots.swift:24` |
| resting_hr | `"resting_hr"` | `"resting-hr"` (baseHealthMonitorSnapshots) + live in `packetBackedHealthMonitorSnapshot` + live HR derived | `HealthDataStore+StaticSnapshots.swift:23` |

**Important — static snapshots are templates.** `baseHealthMonitorSnapshots` and `baseLandingSnapshots` are `static let` arrays used as bases; they are mutated by live methods. Setting `stealthKey` on the static base propagates to all derived copies that copy fields with `id: snapshot.id, ..., stealthKey: snapshot.stealthKey` if the copy pattern is used. However, the live snapshot builder methods (`recoverySnapshot`, `strainSnapshot`, `sleepSnapshot`, etc.) explicitly construct new `HealthMetricSnapshot` instances — those also need `stealthKey` populated.

**Planner action required:** Enumerate every `HealthMetricSnapshot(...)` call in `HealthDataStore+Snapshots.swift` that produces one of the 6 metrics, and add `stealthKey: "<key>"`. This is the same pattern as the `sleep_need_minutes` audit — do not assume the static base is the only location.

---

## EnvironmentKey Pattern

**Finding:** No existing `EnvironmentKey` usage was found anywhere in the GooseSwift source tree (zero results for `grep -rn "EnvironmentKey"`). This is the first custom environment key in the project.

**Pattern to use** (standard SwiftUI, from CONTEXT.md D-03):

```swift
// GooseSwift/StealthMetricsView.swift — place at bottom of file
struct StealthMaskKey: EnvironmentKey {
  static let defaultValue = StealthMask.none
}

extension EnvironmentValues {
  var stealthMask: StealthMask {
    get { self[StealthMaskKey.self] }
    set { self[StealthMaskKey.self] = newValue }
  }
}
```

`StealthMaskKey` and the `EnvironmentValues` extension live in `StealthMetricsView.swift`. This is consistent with the project pattern of placing supporting types in the same file as the view that uses them (e.g., `GooseStealthMode.swift` contains all three stealth types).

**Usage in previews (DEBUG only):**
```swift
#Preview {
  StealthMetricsView()
    .environment(\.stealthMask, StealthMask(hidden: ["recovery_score"]))
}
```

Production views do NOT read `@Environment(\.stealthMask)` — they call `GooseStealthMode.isHidden(metric:)` directly (via `displayValue`).

---

## pbxproj Registration Pattern

**Template from `GooseStealthMode.swift`** (the most recent comparable new file added in Phase 119):

```
PBXBuildFile section:
  A10000000000000000000044 /* GooseStealthMode.swift in Sources */ = {isa = PBXBuildFile; fileRef = A20000000000000000000044; };

PBXFileReference section:
  A20000000000000000000044 /* GooseStealthMode.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = GooseStealthMode.swift; sourceTree = "<group>"; };

PBXGroup (GooseSwift group, ~line 670):
  A20000000000000000000044 /* GooseStealthMode.swift */,

PBXSourcesBuildPhase (main target sources, ~line 1074):
  A10000000000000000000044 /* GooseStealthMode.swift in Sources */,
```

For `StealthMetricsView.swift`: generate two new UUIDs following the project's `A1...` / `A2...` convention, add entries at the same 4 locations. The new file is main-target only (no test target entry needed unless a test file `GooseStealthModeTests.swift`-style parallel is created — not required by this phase).

---

## StealthMetricsView.swift — Structure

New file at `GooseSwift/StealthMetricsView.swift`. Full structure:

```swift
import SwiftUI

struct StealthMetricsView: View {
  @AppStorage(StealthStorage.recoveryScore) private var hideRecovery = false
  @AppStorage(StealthStorage.strainScore)   private var hideStrain = false
  @AppStorage(StealthStorage.hrvRmssd)      private var hideHRV = false
  @AppStorage(StealthStorage.restingHr)     private var hideRestingHR = false
  @AppStorage(StealthStorage.sleepPerf)     private var hideSleep = false
  @AppStorage(StealthStorage.stressScore)   private var hideStress = false

  var body: some View {
    List {
      Section {
        Toggle("Recovery Score", isOn: $hideRecovery)
        Toggle("Strain Score", isOn: $hideStrain)
        Toggle("HRV (RMSSD)", isOn: $hideHRV)
        Toggle("Resting HR", isOn: $hideRestingHR)
        Toggle("Sleep Performance", isOn: $hideSleep)
        Toggle("Stress Score", isOn: $hideStress)
      } footer: {
        Text("Hidden metrics show — on the Health dashboard.")
      }
    }
    .listStyle(.insetGrouped)
    .gooseListBackground()
    .navigationTitle("Metrics Privacy")
    .navigationBarTitleDisplayMode(.inline)
  }
}

// MARK: - EnvironmentKey

struct StealthMaskKey: EnvironmentKey {
  static let defaultValue = StealthMask.none
}

extension EnvironmentValues {
  var stealthMask: StealthMask {
    get { self[StealthMaskKey.self] }
    set { self[StealthMaskKey.self] = newValue }
  }
}
```

**Style notes:**
- 2-space indentation (project convention)
- `.gooseListBackground()` — same modifier used by all `List`-based More views
- `.insetGrouped` listStyle — matches `MoreView` and all detail views
- `private var hide*` naming — booleans prefixed with a verb (`hide`) following project boolean conventions (`isScanning`, etc. — this uses `hide` not `is` since it's a toggle action name)
- No `Label(_, systemImage:)` on toggles — plain text labels consistent with `MorePrivacyView` style

---

## Common Pitfalls

### Pitfall 1: Missing MoreRouteStatus field causes compile error
**What goes wrong:** Adding `.stealthMetrics` to `MoreRoute` enum without adding `stealthMetrics: MoreStatusKind` to `MoreRouteStatus` struct causes exhaustiveness error in `routeStatus` init in `MoreDataStore`.
**Why it happens:** `MoreRouteStatus` is a plain struct with positional fields; `MoreDataStore` initialises it with all fields by name.
**How to avoid:** Add the field to `MoreRouteStatus` struct AND both `MoreRouteStatus(...)` initialisers in `MoreDataStore` (init at line 12 and `refreshRouteStatus` at line 151).
**Warning signs:** `error: missing argument for parameter 'stealthMetrics' in call`

### Pitfall 2: HealthMetricSnapshot struct initialiser breaks all existing call sites
**What goes wrong:** Adding `stealthKey: String` as a non-defaulted field breaks every existing `HealthMetricSnapshot(...)` call in the codebase (many sites in `HealthDataStore+Snapshots.swift`, `HealthDataStore+StaticSnapshots.swift`, `HealthDataStore+ActivitySnapshots.swift`, etc.).
**Why it happens:** Swift struct initialisers are positional and explicit — no default means all callers must supply the field.
**How to avoid:** Add `stealthKey: String = ""` with a default value. Existing call sites compile unchanged; only the 6 target sites supply an explicit value.
**Warning signs:** `error: missing argument for parameter 'stealthKey' in call` at dozens of sites.

### Pitfall 3: Static snapshot base not propagating stealthKey to live copies
**What goes wrong:** `stealthKey` is set on the static `baseLandingSnapshots` / `baseHealthMonitorSnapshots` entry, but live builder methods (`recoverySnapshot()`, `strainSnapshot()`, etc.) construct entirely new `HealthMetricSnapshot(...)` instances without forwarding the field.
**Why it happens:** Live builders do not copy all fields from the base — they selectively override value, status, freshness, source, trend. `stealthKey` would be silently dropped.
**How to avoid:** Explicitly add `stealthKey: "<key>"` to EVERY `HealthMetricSnapshot(...)` constructor call in the live builder methods for the 6 metrics. Do not rely on the static base to propagate it.
**Warning signs:** Toggle appears to work in Settings but metric still shows value on dashboard.

### Pitfall 4: Em dash vs hyphen
**What goes wrong:** Using `"-"` (hyphen) instead of `"—"` (em dash) for the hidden value.
**Why it happens:** Easy keyboard shortcut confusion.
**How to avoid:** The string literal is `"—"` (Unicode U+2014). Copy from D-04 verbatim.

### Pitfall 5: destination(for:) switch non-exhaustive
**What goes wrong:** Adding `.stealthMetrics` to the enum without adding a case to `MoreView.destination(for:)` causes a compile-time exhaustiveness error.
**Why it happens:** `MoreView.destination(for:)` is a `switch route` with no `default` — all cases must be handled.
**How to avoid:** Add `case .stealthMetrics: StealthMetricsView()` to the switch.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UserDefaults persistence for toggles | Custom storage class | `@AppStorage(StealthStorage.<key>)` | Already wired; immediate persistence, no save call |
| Environment value injection | Custom property wrapper | SwiftUI `EnvironmentKey` + `EnvironmentValues` extension | Standard pattern; works with `#Preview` `.environment()` modifier |
| Toggle UI | Custom UIKit control | SwiftUI `Toggle` | Matches all existing More tab UI |

---

## Validation Architecture

Framework: XCTest (`GooseSwiftTests/` target, 69 tests, 16 files).

| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| STEALTH-03 | Toggles persist on Settings → Metrics Privacy screen | Manual UI | `@AppStorage` persistence is not mockable without dependency injection; verify via simulator |
| STEALTH-04 | Hidden metric shows `"—"` on Health dashboard | Manual UI | Drive simulator: enable toggle, switch to Health tab, verify card shows em dash |

No automated test file is required for this phase — the logic under test (`GooseStealthMode.isHidden`) already has `GooseStealthModeTests.swift` from Phase 119. The Phase 122 additions are pure SwiftUI rendering; verify via XcodeBuildMCP simulator screenshots.

### Quick build check
```bash
xcodebuild -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' build CODE_SIGNING_ALLOWED=NO 2>&1 | grep 'error:'
```

---

## Sources

### Primary (HIGH confidence — verified by reading source files)
- `GooseSwift/MoreView.swift` — full file read; Section("Settings") at line 97–99, routeRows pattern at 138–146, destination switch at 149–189
- `GooseSwift/MoreRouteModels.swift` — full file read; all enum cases, switch exhaustion, settingsRoutes array at line 119, MoreRouteStatus struct at line 127–146
- `GooseSwift/MoreDataStore.swift` — lines 1–180 read; routeStatus init at line 12–31, refreshRouteStatus at line 150–171
- `GooseSwift/GooseStealthMode.swift` — full file read; all 3 types confirmed
- `GooseSwift/HealthDashboardViews.swift` — full file read; no per-metric render sites; all cards use `snapshot.displayValue` generically
- `GooseSwift/HealthModels.swift` — lines 1–140 read; `HealthMetricSnapshot` struct and `displayValue` at lines 61–89
- `GooseSwift/HealthDataStore+StaticSnapshots.swift` — full file read; all 6 metric snapshot IDs and static base arrays confirmed
- `GooseSwift/HealthView.swift` — full file read; `cachedVitalSnapshots = Array(healthStore.healthMonitorSnapshots().prefix(4))` at line 101
- `GooseSwift.xcodeproj/project.pbxproj` — GooseStealthMode.swift registration pattern confirmed at 4 locations

## Metadata

**Confidence breakdown:**
- MoreRoute navigation pattern: HIGH — full source read, all switch cases verified
- HealthMetricSnapshot render architecture: HIGH — confirmed by reading HealthDashboardViews.swift; zero per-metric lines exist
- stealthKey field approach: HIGH — only viable option given the generic card architecture
- pbxproj 4-location pattern: HIGH — verified from GooseStealthMode.swift template

**Research date:** 2026-06-27
**Valid until:** 2026-07-27 (stable iOS/SwiftUI codebase)
