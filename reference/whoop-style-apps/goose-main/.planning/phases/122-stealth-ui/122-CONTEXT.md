# Phase 122: Stealth UI - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure Swift UI phase. Phase 119 (Stealth Mode core) is complete — `GooseStealthMode`, `StealthStorage`, `StealthMask` already exist in `GooseStealthMode.swift`.

This phase adds:
1. **Settings UI** — More tab → Section("Settings") → "Metrics Privacy" NavigationLink → `StealthMetricsView` with 6 toggles
2. **Dashboard rendering** — Health tab metric cards call `GooseStealthMode.isHidden(metric:)` and show `"—"` for hidden metrics
3. **Preview pattern** — Custom `EnvironmentKey` for `StealthMask` so `#if DEBUG` previews don't hit UserDefaults

Requirements in scope: STEALTH-03, STEALTH-04
Out of scope: Coach masking (Phase 119, done), Rust changes (none)

</domain>

<decisions>
## Implementation Decisions

### Settings nav path
- **D-01:** New `NavigationLink` row inside `Section("Settings")` in `MoreView.swift`. Label: "Metrics Privacy". Destination: new `StealthMetricsView`. Adds to `MoreRoute` enum as `.stealthMetrics`. No new file section needed — reuses existing More tab infrastructure.

### StealthMetricsView structure
- **D-02:** `StealthMetricsView` — new file `GooseSwift/StealthMetricsView.swift`. List with one section, 6 rows. Each row: `Toggle(metricDisplayName, isOn: binding)` where binding is `@AppStorage(StealthStorage.<key>)`. Metric display names: "Recovery Score", "Strain Score", "HRV (RMSSD)", "Resting HR", "Sleep Performance", "Stress Score". No navigation within the view — flat list only.

### Preview EnvironmentKey pattern
- **D-03:** New `EnvironmentKey`:
  ```swift
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
  Views that need stealth read `@Environment(\.stealthMask)` in `#if DEBUG` previews only. Production code continues to call `GooseStealthMode.isHidden(metric:)` directly (no performance overhead from environment reads at runtime).

### Dashboard "—" rendering scope
- **D-04:** Health tab metric cards only. The 6 metrics are rendered in `HealthDashboardViews.swift` (the `HealthDashboardMetricCard` / section views). Each render site wraps the metric value text with: `GooseStealthMode.isHidden(metric: "<metric_key>") ? "—" : formattedValue`. The `"—"` is an em dash, not a hyphen.

### Metric keys at render sites
- **D-05:** Match the storage suffix form used in `StealthStorage`: `"recovery_score"`, `"strain_score"`, `"hrv_rmssd"`, `"resting_hr"`, `"sleep_performance"`, `"stress_score"`. These are passed to `GooseStealthMode.isHidden(metric:)` verbatim.

### File placement
- **D-06:** New file `GooseSwift/StealthMetricsView.swift` (settings view + EnvironmentKey extension). Requires pbxproj registration at 4 locations. MoreRoute enum change in existing `MoreRouteModels.swift`.

### Claude's Discretion
- `@AppStorage(StealthStorage.<key>)` bindings update UserDefaults immediately — no explicit save needed
- Toggle animation is the default SwiftUI Toggle style — no custom styling
- `GooseStealthMode.isHidden(metric:)` reads `UserDefaults.standard` synchronously — safe to call at render time
- Preview wraps with `.environment(\.stealthMask, StealthMask(hidden: ["recovery_score"]))` to show masked state in canvas

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary files to create/modify
- *(new)* `GooseSwift/StealthMetricsView.swift` — toggle list + EnvironmentKey extension
- `GooseSwift/MoreView.swift` — add NavigationLink to Section("Settings") + MoreRoute case
- `GooseSwift/MoreRouteModels.swift` — add `.stealthMetrics` case + view dispatch
- `GooseSwift/HealthDashboardViews.swift` — add `isHidden` checks at 6 metric render sites
- `GooseSwift.xcodeproj/project.pbxproj` — 4-location registration for StealthMetricsView.swift

### Infrastructure from Phase 119 (already exists)
- `GooseSwift/GooseStealthMode.swift` — `GooseStealthMode.isHidden(metric:)`, `StealthStorage`, `StealthMask`
- All 6 metric keys: `StealthStorage.recoveryScore`, `.strainScore`, `.hrvRmssd`, `.restingHr`, `.sleepPerf`, `.stressScore`

### Requirements
- `.planning/REQUIREMENTS.md` §Stealth Mode (#167) — STEALTH-03, STEALTH-04

</canonical_refs>

<code_context>
## Existing Code Insights

- `MoreView.swift:97` — `Section("Settings")` is the insertion point for the new NavigationLink
- `MoreRouteModels.swift` — `MoreRoute` enum and view dispatch; add `.stealthMetrics` case
- `HealthDashboardViews.swift` — `HealthDashboardMetricCard` renders metric values; research must find the exact lines for all 6 metrics
- Phase 119 verification confirmed: `GooseStealthMode.swift` exists with all three types

</code_context>
