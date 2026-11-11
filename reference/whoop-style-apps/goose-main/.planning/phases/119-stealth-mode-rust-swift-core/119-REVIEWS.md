# Phase 119-01 — Plan Reviews

**Reviewers:** Codex, Gemini, Claude (parallel, independent)
**Date:** 2026-06-26
**Plan file:** `119-01-PLAN.md`

---

## CYCLE_SUMMARY

```yaml
high_count: 0
actionable_non_high_count: 3
verdict: CONVERGED
```

All three reviewers agree: no HIGH findings, no blockers. Plan is sound. Proceed to execute.

---

## Reviewer Verdicts

| Reviewer | HIGH | MEDIUM | LOW | Verdict |
|----------|------|--------|-----|---------|
| Codex    | 0    | 0      | 2   | CONVERGED |
| Claude   | 0    | 1      | 2   | CONVERGED |
| Gemini   | 0    | 1      | 4   | CONVERGED |

---

## Risk Assessment (per review prompt)

### RISK 1 — Metric Key Translation Mismatch
**PASS (all three reviewers)**

The plan correctly maps all 6 storage-suffix keys to their Coach-JSON-key equivalents at mask-construction time in CoachChatModel:
- `"recovery_score"` → `"recovery"`
- `"strain_score"` → `"strain"`
- `"sleep_performance"` → `"sleep"`
- `"stress_score"` → `"stress"`
- `"hrv_rmssd"` → `"hrv_rmssd"` (same)
- `"resting_hr"` → `"resting_hr"` (same)

CoachLocalToolContext checks `mask.isHidden("hrv_rmssd")` → snapshot id `"health-monitor"` and `mask.isHidden("resting_hr")` → snapshot id `"resting-hr"`. The two-level indirection (mask key ≠ snapshot id) is correctly handled in vitals() by searching on snapshot.id.

**Gemini flag (MEDIUM):** Gemini noted the snapshot ID indirection (`"health-monitor"` vs `"hrv_rmssd"`) as a potential mismatch risk, but this is by design and correctly specified in the plan. The executor must be careful to search on snapshot id, not metric name. No change to plan required — the plan already spells this out explicitly.

### RISK 2 — Vitals Masking Order
**PASS (all three reviewers)**

Plan explicitly requires masking applied to `var rows` BEFORE `rows.insert(liveHR, at: 0)`. Claude additionally confirmed that the live-HR row uses id `"live-heart-rate"` (not `"health-monitor"` or `"resting-hr"`), so even if masking were accidentally applied after the insert, `firstIndex(where:)` on the live-HR row would not match either mask check. Belt-and-suspenders safety. Order constraint is still required by spec.

### RISK 3 — pbxproj 4-Location Registration
**PASS (all three reviewers)**

Plan names all 4 locations: PBXBuildFile, PBXFileReference, PBXGroup children, PBXSourcesBuildPhase. Verification grep included.

### RISK 4 — StealthMask.none Default
**PASS (all three reviewers)**

`mask: StealthMask = .none` default preserves all existing callers. `static let none = StealthMask(hidden: [])` correctly produces false for all `isHidden()` calls.

### RISK 5 — D-05 Key Discrepancy
**PASS (all three reviewers)**

Plan uses actual Coach JSON keys `"sleep"` and `"stress"` (short form), not the D-05 long forms `"sleep_performance"` and `"stress_score"`. Scores dict at CoachLocalToolContext lines 35-40 confirmed.

---

## Findings

### MEDIUM Findings (2)

**MEDIUM-1 | GooseSwift.xcodeproj/project.pbxproj | Test file pbxproj registration**
*Reviewer: Claude*

`GooseStealthModeTests.swift` also needs registration in the GooseSwiftTests target — PBXBuildFile, PBXFileReference, PBXGroup under GooseSwiftTests, and the test target PBXSourcesBuildPhase. The plan's Task 1 action describes only `GooseStealthMode.swift` (4 locations in main target). Without registering the test file, `xcodebuild test -only-testing GooseSwiftTests/GooseStealthModeTests` will fail to compile.

**Mitigation:** The plan's verification step (`xcodebuild test -only-testing GooseSwiftTests/GooseStealthModeTests`) will immediately surface this if the executor misses it. Executor should proactively register both files. No replan required — the verification loop catches it.

**MEDIUM-2 | GooseSwift/CoachLocalToolContext.swift | Snapshot ID indirection clarity**
*Reviewer: Gemini*

The two-step indirection (mask key `"hrv_rmssd"` → snapshot id `"health-monitor"`, mask key `"resting_hr"` → snapshot id `"resting-hr"`) is correct but non-obvious. An executor reading only Task 2's behavior block might implement `mask.isHidden("health-monitor")` instead of `mask.isHidden("hrv_rmssd")`.

**Mitigation:** Plan explicitly states the correct form in the Task 2 action and in the RESEARCH.md vitals pattern. No replan required — executor must follow the action block, not infer from behavior assertions.

---

### LOW Findings (4, de-duped)

**LOW-1 | GooseSwift/GooseStealthMode.swift | keyFor() empty-string fallback**
*Reviewers: Codex, Gemini (agreement)*

`keyFor()` returning `""` for unknown metrics relies on `UserDefaults.bool(forKey: "")` returning false by convention. This is functionally safe (the empty key is never written) but non-idiomatic. A cleaner implementation would return `nil` from `keyFor()` and short-circuit to `false` explicitly.

**Assessment:** Safe as specified. Low risk. Executor may improve if discretion allows.

**LOW-2 | GooseSwiftTests/GooseStealthModeTests.swift | tearDown coverage**
*Reviewer: Codex*

Plan uses `defer { UserDefaults.standard.removeObject(forKey: key) }` in the integration test. A `tearDown()` removing all six stealth keys would be more defensive against test-order pollution if more tests are added later.

**Assessment:** Acceptable as specified for 7 tests in a new file. Low risk.

**LOW-3 | GooseSwift/CoachLocalToolContext.swift | mask threading through loadStats()**
*Reviewer: Claude*

The chain `build() → loadStats() → vitals()` means `mask` must be threaded through `loadStats()` signature as well. Plan says "pass mask down to loadStats() and vitals()" which is correct, but the intermediate `loadStats()` signature update is implicit. Executor must update both `loadStats()` and `vitals()` signatures, not just `build()`.

**Assessment:** Covered by "Read CoachLocalToolContext.swift fully before editing" instruction. Low risk.

**LOW-4 | GooseSwiftTests/GooseStealthModeTests.swift | No combined-mask test**
*Reviewer: Claude*

No test exercises multiple metrics hidden simultaneously (e.g. `hidden: ["recovery", "strain"]`). `Set<String>` is correct by construction so combined masking works without a dedicated test, but a multi-metric test would increase confidence.

**Assessment:** Cosmetic. The `-only-testing` xcodebuild run catches real failures. Low risk.

---

## Per-Reviewer Raw Summaries

### Codex
> "The high-risk areas are covered: the storage-suffix to Coach JSON translation is explicit, sleep/stress use the actual JSON keys, vitals masking happens before live HR insertion, the default StealthMask.none preserves callers, and the pbxproj four-location registration plus grep check is included."
> `verdict: CONVERGED, high_count: 0, actionable_non_high_count: 2`

### Claude
> "Plan sound. The one actionable finding (test file pbxproj registration) is caught by the xcodebuild test -only-testing GooseSwiftTests/GooseStealthModeTests verification step — executor will hit it immediately and fix inline. Proceed to execute."
> `verdict: CONVERGED, high_count: 0, actionable_non_high_count: 1`

### Gemini
> All risks pass. Snapshot ID indirection flagged as MEDIUM but acknowledged as by-design.
> `verdict: CONVERGED, high_count: 0, actionable_non_high_count: 5`

---

## Executor Notes

1. **Register both Swift files in pbxproj:** `GooseStealthMode.swift` (main target, 4 locations) AND `GooseStealthModeTests.swift` (test target, 4 locations).
2. **Thread mask through loadStats() signature** — not only build() and vitals().
3. **Vitals masking BEFORE rows.insert(liveHR, at: 0)** — already in plan, just confirming.
4. **Snapshot ID lookup:** use `($0["id"] as? String) == "health-monitor"` for hrv_rmssd, `"resting-hr"` for resting_hr — do not search by metric name.
