# Phase 119: Stealth Mode (Rust + Swift core) - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure Swift data/logic layer phase. Delivers the stealth infrastructure that Phase 122 (Stealth UI) builds on top of.

Two types + one protocol site:
1. **`GooseStealthMode`** — query type; `isHidden(metric:)` reads `StealthStorage` UserDefaults keys
2. **`StealthStorage`** — enum with `static let` UserDefaults key constants for 6 metrics
3. **`StealthMask`** — value type; built from `GooseStealthMode`; passed into `CoachLocalToolContext.build()`; replaces hidden metric values with `"hidden_by_user"` sentinel

**No Rust work.** "Rust + Swift core" in the phase name means non-UI layer, not actual Rust code. All SCs are Swift.

Requirements in scope: STEALTH-01, STEALTH-02
Out of scope: STEALTH-03 (toggle UI settings list — Phase 122), STEALTH-04 (dashboard "—" rendering — Phase 122)

</domain>

<decisions>
## Implementation Decisions

### File placement
- **D-01:** All three types live in a single new file: `GooseSwift/GooseStealthMode.swift`. Follows naming convention (GooseHealthKitExporter, GooseBLEClient). No new extension files needed.

### StealthStorage — UserDefaults keys
- **D-02:** `StealthStorage` is an enum (case-less, key namespace only) with 6 `static let` string constants following the `"goose.swift.*"` project convention:
  ```swift
  enum StealthStorage {
    static let recoveryScore = "goose.swift.stealth.recovery_score"
    static let strainScore   = "goose.swift.stealth.strain_score"
    static let hrvRmssd      = "goose.swift.stealth.hrv_rmssd"
    static let restingHr     = "goose.swift.stealth.resting_hr"
    static let sleepPerf     = "goose.swift.stealth.sleep_performance"
    static let stressScore   = "goose.swift.stealth.stress_score"
  }
  ```
  Default value (key absent) = not hidden (false). No migration needed.

### GooseStealthMode — query type
- **D-03:** `GooseStealthMode` is a struct (or enum) with a single static method:
  ```swift
  struct GooseStealthMode {
    static func isHidden(metric: String) -> Bool {
      UserDefaults.standard.bool(forKey: keyFor(metric: metric))
    }
  }
  ```
  Accepts the same metric string keys used in `StealthStorage` (`"recovery_score"`, etc.). Returns `false` for unknown metrics.

### StealthMask — value type
- **D-04:** `StealthMask` is a struct carrying `hidden: Set<String>` and exposing `isHidden(_ metric: String) -> Bool`:
  ```swift
  struct StealthMask {
    let hidden: Set<String>
    func isHidden(_ metric: String) -> Bool { hidden.contains(metric) }
    static let none = StealthMask(hidden: [])
  }
  ```
  Built from `GooseStealthMode` at the call site before passing to `CoachLocalToolContext.build()`.

### CoachLocalToolContext.build() integration
- **D-05:** `build()` gains a new `mask: StealthMask = .none` parameter (default preserves existing callers). Inside, before emitting any of the 6 metric values, check `mask.isHidden(metric)` and substitute `"hidden_by_user"` if true. The metric key is still present in the JSON — only the value is masked.
  The 6 metric keys in the Coach JSON are: `"recovery"`, `"strain"`, `"hrv_rmssd"`, `"resting_hr"`, `"sleep_performance"`, `"stress_score"` (match the existing keys in `CoachLocalToolContext.swift`).

### Sentinel value
- **D-06:** Sentinel string is `"hidden_by_user"` (lowercase, snake_case — matches STEALTH-02 spec verbatim).

### Claude's Discretion
- `StealthMask` is built once per Coach session start, not re-read on every token
- `GooseStealthMode` reads `UserDefaults.standard` directly (no DI) — consistent with existing UserDefaults usage in the codebase
- No `@Published` state for hidden set — Phase 122 handles reactivity in the settings UI
- No persistence migration needed — false default covers new installs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary files to modify
- `GooseSwift/CoachLocalToolContext.swift` — add `mask: StealthMask = .none` param, apply masking logic to 6 metric values
- *(new)* `GooseSwift/GooseStealthMode.swift` — create with `StealthStorage`, `GooseStealthMode`, `StealthMask`

### Pattern references
- `GooseSwift/CoreBluetoothBLETransport.swift` lines 359–369 — `static let` UserDefaults key pattern to follow in `StealthStorage`
- `GooseSwift/GooseHealthKitExporter.swift` — file structure and naming convention to follow for `GooseStealthMode.swift`

### Requirements
- `.planning/REQUIREMENTS.md` §Stealth Mode (#167) — STEALTH-01, STEALTH-02

</canonical_refs>

<code_context>
## Existing Code Insights

- `CoachLocalToolContext.static func build(` at line 5 of `CoachLocalToolContext.swift` — currently emits `"sleep"`, `"recovery"`, `"strain"` sub-dicts. Masking is applied to values within those dicts for individual metric scores.
- `CoachLocalToolContext` is consumed by `CoachChatModel.swift` and `ChatGPTCoachProvider.swift` — both must pass the mask when calling `build()`. Coach still receives full unmasked data for recommendations per STEALTH-02.
- No existing stealth/hidden code anywhere in the Swift codebase — clean slate.

</code_context>
