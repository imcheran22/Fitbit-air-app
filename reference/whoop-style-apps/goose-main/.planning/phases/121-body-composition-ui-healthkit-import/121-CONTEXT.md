# Phase 121: Body Composition UI + HealthKit Import - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Swift UI + HealthKit phase. Rust bridge (`body_composition.upsert` + `body_composition.history_between`) is complete from Phase 116 — no Rust changes needed.

Requirements in scope: BODY-02, BODY-03
Out of scope: BODY-01 (Phase 116, done), stealth UI (Phase 122)

</domain>

<decisions>
## Implementation Decisions

### Entry point placement
- **D-01:** New `HealthBodyCompositionSection` in the Health tab (`HealthDashboardViews.swift`), following the existing section pattern (`HealthActivityOverviewSection`, `HealthVitalsPreviewSection`). Section card shows: last logged weight + date, weight sparkline (7-day), "Log" button → opens `BodyCompositionEntrySheet`, "Import from Health" button.

### BodyCompositionEntrySheet
- **D-02:** Sheet with three optional numeric fields: weight (mandatory for save), body fat % (optional), muscle mass kg (optional). "Confirm" taps `body_composition.upsert` bridge with `source='manual'`. Sheet dismisses on success.

### HealthKit import trigger
- **D-03:** User-triggered via "Import from Health" button in `HealthBodyCompositionSection`. No automatic polling. Reads `HKQuantityTypeIdentifierBodyMass` + `HKQuantityTypeIdentifierBodyFatPercentage`. Writes with `source='healthkit'` and `INSERT OR REPLACE` semantics (handled by the Rust `upsert` method's UNIQUE constraint).

### Weight display units
- **D-04:** Follow existing `UnitSystem` user preference stored in MoreProfileViews (check for existing `unitSystem` UserDefaults key). Metric → kg. Imperial → lbs (factor: × 2.20462). Convert for display only; bridge always receives kg. Format: `"%.1f kg"` or `"%.1f lbs"`. Do NOT use `Locale.current.measurementSystem` — `.us` vs `.usSystem` Swift API is unreliable; use stored preference instead.

### Trend chart / sparkline
- **D-05:** Inline weight sparkline within the `HealthBodyCompositionSection` card. Uses CoreGraphics `GeometryReader + Path + ZStack` — NOT Swift Charts (Charts framework is not linked; `import Charts` will cause a linker error). Follows the existing custom chart pattern in `SleepV2BevelTrendViews.swift`. Renders last 7 days from `body_composition.history_between`. Chart absent (hidden) when history is empty. Y-axis inversion required: `y = plot.maxY - CGFloat(normalized) * plot.height`.

### Bridge call pattern
- **D-06:** Bridge calls dispatched off-main-thread via `Task { await ... }` or the existing bridge async pattern. `@Observable` HealthDataStore (not @ObservableObject). Published via a new `var bodyCompositionHistory: [BodyCompositionRow]` plain stored property (same @Observable pattern as `dynamicSleepNeed`).

### New files needed
- **D-07:** New Swift files: `BodyCompositionEntrySheet.swift` + `HealthBodyCompositionSection.swift` (or combined into one file). Both require Xcode `project.pbxproj` registration at 4 locations each.

### Claude's Discretion
- `BodyCompositionRow` local Swift struct (weight_kg, body_fat_pct, muscle_mass_kg, source, date)
- HealthKit authorization: request HKQuantityTypeIdentifierBodyMass + BodyFatPercentage before import
- Sparkline Y-axis: weight only (most meaningful metric); body fat shown as text below
- No trend chart for body fat % or muscle mass in this phase — weight only

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary files to create/modify
- *(new)* `GooseSwift/BodyCompositionEntrySheet.swift` — entry form sheet (or combined)
- *(new)* `GooseSwift/HealthBodyCompositionSection.swift` — Health tab section + sparkline
- `GooseSwift/HealthDashboardViews.swift` — add `HealthBodyCompositionSection` instance
- `GooseSwift.xcodeproj/project.pbxproj` — register both new files (4 locations each)

### Pattern references
- `GooseSwift/HealthDataStore+Snapshots.swift` — existing @Observable stored property pattern (plain var)
- `GooseSwift/SleepV2BevelTrendViews.swift` — Swift Charts usage pattern to follow
- `GooseSwift/HealthDashboardViews.swift` — existing section pattern (HealthActivityOverviewSection)
- `GooseSwift/GooseStealthMode.swift` — recent new file, Xcode registration pattern

### Rust bridge
- `Rust/core/src/bridge/body_composition.rs` — `body_composition.upsert` args, `body_composition.history_between` args
- Bridge `upsert` args: `{database_path, date, weight_kg, body_fat_pct?, muscle_mass_kg?, water_pct?, source}`
- Bridge `history_between` args: `{database_path, start_date, end_date}`

### Requirements
- `.planning/REQUIREMENTS.md` §Body Composition History (#166) — BODY-02, BODY-03

</canonical_refs>

<code_context>
## Existing Code Insights

- `HealthDataStore` is `@MainActor @Observable` — add plain `var bodyCompositionHistory: [BodyCompositionRow]` (no @Published)
- `SleepV2BevelTrendViews.swift` has Swift Charts usage to reference for the sparkline
- `HealthKitFullImporter.swift` handles other HealthKit types — check its authorization pattern for body mass query
- No existing body composition HealthKit import code — clean slate
- Xcode project.pbxproj: register new files at 4 locations (PBXBuildFile, PBXFileReference, PBXGroup children, PBXSourcesBuildPhase)

</code_context>
