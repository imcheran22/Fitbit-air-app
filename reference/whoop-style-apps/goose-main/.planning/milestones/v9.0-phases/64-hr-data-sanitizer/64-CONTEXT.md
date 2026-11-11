# Phase 64: HR Data Sanitizer - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Add a Swift-side HR spike filter between raw BLE notification bytes and HeartRateSeriesStore, matching WHOOP's WHPHeartRateDataSanitizer. Filters HR samples outside a configurable valid range (25–220 BPM) before they enter HeartRateSeriesStore. Spike samples logged via OSLog and counted in a debug counter. Live HR display never shows a value outside the valid range. Thresholds are static let constants, not magic numbers. WHPHeartRateDecimator2 (decimation) is a stretch goal — out of scope.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at Claude's discretion — pure infrastructure phase.

Key constraints from ROADMAP:
- GooseHRSanitizer type filters HR samples outside 25–220 BPM
- Spike samples logged (OSLog) and counted in a debug counter visible in More > Debug
- Live HR display never shows a value outside the valid range
- Thresholds are `static let` constants (not hard-coded literals)
- No external dependencies

Preferred implementation:
- GooseHRSanitizer as a simple value-type struct or static enum with a `sanitize(_ bpm: Int) -> Int?` function — returns nil for out-of-range values
- Debug counter as an @Published property on GooseAppModel or as a simple atomic counter
- Integration point: wherever HeartRateSeriesStore.append / liveHeartRateBPM is set

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `HeartRateSeriesStore.shared` — singleton where HR samples land; sanitizer gates before append
- `GooseAppModel` — owns liveHeartRateBPM; gate before setting it
- `MoreDebugViews.swift` — already shows debug counters; add spikeCount here
- `GooseBLEClient+Parsing.swift` — where BLE HR notifications are parsed into BPM values

### Established Patterns
- `static let` for configuration constants on the owning type
- OSLog `logger.warning` for out-of-range values (consistent with bond loss logging)
- `@Published private(set) var` for observable counters on GooseAppModel

### Integration Points
- `GooseBLEClient+Parsing.swift` OR the call sites that feed liveHeartRateBPM — insert sanitizer here
- `GooseAppModel` — add `private(set) var hrSpikeCount: Int = 0`
- `MoreDebugViews.swift` — display hrSpikeCount

</code_context>

<specifics>
## Specific Ideas

`GooseHRSanitizer` as a zero-dependency struct with `static let minBPM = 25` and `static let maxBPM = 220`. The `sanitize(_ bpm: Int) -> Int?` method returns nil for out-of-range. Simple, testable, no coupling to GooseAppModel.

</specifics>

<deferred>
## Deferred Ideas

- WHPHeartRateDecimator2 (decimation) — stretch goal, out of scope for v9.0
- Per-session spike statistics — out of scope

</deferred>
