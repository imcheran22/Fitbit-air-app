# Phase 122: Stealth UI — Multi-AI Plan Review

**Date:** 2026-06-27
**Plan:** 122-01-PLAN.md
**Reviewers:** Codex · Gemini · Claude (parallel, independent)
**Consensus verdict:** APPROVE_WITH_NOTES

---

## Cycle Summary

| Metric | Value |
|--------|-------|
| Reviewers | 3 |
| Total raw findings | 23 |
| HIGH severity | 10 (across 8 distinct issues after dedup) |
| MED severity | 7 |
| LOW severity | 3 |
| INFO | 3 |
| Cross-reviewer consensus areas | stealthKey propagation (×3), MoreRoute exhaustiveness (×3), StealthMaskKey (×2) |
| Verdicts | APPROVE_WITH_NOTES × 3 |
| **Cycle verdict** | **APPROVE_WITH_NOTES** |

---

## HIGH Severity Findings (must fix before execution)

### H-1 — `replacingHealthMonitorSnapshot` silently drops stealthKey [Gemini · Claude]

**File:** `GooseSwift/HealthDataStore+Vitals.swift` ~line 603

`replacingHealthMonitorSnapshot` constructs `HealthMetricSnapshot(...)` with all 13 existing stored properties listed by name. After `stealthKey` is added to the struct with a default value of `""`, this call compiles without warning and silently drops the key — every live health-monitor snapshot override (10+ call sites) will have `stealthKey = ""`, causing the gate to never fire for those metrics.

**Fix:** Inside `replacingHealthMonitorSnapshot`, add `stealthKey: snapshot.stealthKey` to the `HealthMetricSnapshot(...)` constructor. The plan describes this fix at a high level but execution must apply it inside the helper body, not at callers.

---

### H-2 — `ScoreDateTimeline.datedSnapshot` — 3 constructors not in plan's 16-site list [Codex · Gemini]

**File:** `GooseSwift/HealthModels.swift` lines ~131, ~148, ~175

`datedSnapshot(from:date:calendar:)` constructs `HealthMetricSnapshot` in 3 separate branches (no-data, non-today date, base-score path). None of these are enumerated in the plan's 16-site list. These paths are called from the date-picker for sleep, recovery, and strain — exactly the metrics with stealth keys. On any selected date, the em-dash gate silently stops working.

**Fix:** Add `stealthKey: snapshot.stealthKey` to all three `HealthMetricSnapshot(...)` constructors inside `datedSnapshot`. The first two branches (lines ~131, ~148) are the ones most likely to be overlooked.

---

### H-3 — `snapshot()` factory in Utilities.swift has no `stealthKey` parameter [Codex]

**File:** `GooseSwift/HealthDataStore+Utilities.swift` ~line 993 (also ~line 1012)

The plan directs adding `stealthKey: "<value>"` to the 6 base entries in `StaticSnapshots.swift` via the `snapshot()` factory. But the factory itself does not currently accept a `stealthKey` parameter. If the factory constructs `HealthMetricSnapshot` internally, it must be extended to accept and forward `stealthKey: String = ""`. Without this, all 6 static base entries will be built with `stealthKey = ""` regardless of what is passed at the call site.

**Fix:** Add `stealthKey: String = ""` to the `snapshot()` factory signature and forward it through to `HealthMetricSnapshot(...)`. Then annotate the 6 base entries in `StaticSnapshots.swift` with the correct `stealthKey:` argument.

---

### H-4 — `HomeDashboardView.homeSnapshot` strain-to-percent conversion branch [Codex · Claude]

**File:** `GooseSwift/HomeDashboardView.swift` ~line 236

`HomeDashboardView` constructs a `HealthMetricSnapshot` directly (not via `replacingHealthMonitorSnapshot`) in the strain-to-percent conversion branch. This site is not covered by the helper fix (H-1). The constructed replacement snapshot will have `stealthKey = ""`, so any downstream call on it bypasses the gate.

**Fix:** Forward `stealthKey: snapshot.stealthKey` at this constructor site. If the snapshot does not correspond to a stealth-gated metric, use `stealthKey: ""` explicitly.

---

### H-5 — `MoreRouteStatus` struct field must be added before `statusKeyPath` switch arm [Claude]

**File:** `GooseSwift/MoreRouteModels.swift`

`statusKeyPath` returns `KeyPath<MoreRouteStatus, MoreStatusKind>`. The `.stealthMetrics` case must produce `\.stealthMetrics`, which requires `var stealthMetrics: MoreStatusKind` to already exist on `MoreRouteStatus`. If the executor adds the switch arm before the struct field, the build fails at the KeyPath site. **Execution order matters.**

**Fix:** Add `var stealthMetrics: MoreStatusKind` to `MoreRouteStatus` struct first, then wire the switch arms in `MoreRouteModels.swift`, then the `MoreView` destination switch, then the `MoreDataStore` initialisers.

---

### H-6 — `settingsRoutes` array is not a switch — compiler will not enforce inclusion [Codex · Claude]

**File:** `GooseSwift/MoreRouteModels.swift`

`static let settingsRoutes: [MoreRoute]` is a plain array literal. If `.stealthMetrics` is omitted here, the "Metrics Privacy" row never appears in More > Settings — yet every switch arm compiles cleanly and the build passes with zero errors. This is the only MoreRoute exhaustiveness location where the compiler provides no safety net.

**Fix:** Add `.stealthMetrics` to the `settingsRoutes` array. Verify explicitly in the post-build grep step:
```
grep -n "stealthMetrics" GooseSwift/MoreRouteModels.swift
```
Confirm the result includes both a switch arm AND the settingsRoutes array line.

---

### H-7 — `@AppStorage` key prefix mismatch in plan documentation [Claude]

**Scope:** Plan documentation only (no code written yet)

The plan summary documents `StealthStorage` keys as `"goose.stealth.*"` (e.g., `"goose.stealth.recovery_score"`). The actual keys in `GooseStealthMode.swift` use the prefix `"goose.swift.stealth.*"` (e.g., `"goose.swift.stealth.recovery_score"`). If the executor copies raw strings from plan prose, `@AppStorage` bindings will write to the wrong UserDefaults keys and the toggles will silently have no effect — `GooseStealthMode.isHidden` reads the correct key and will always return `false`.

**Fix:** Always use `@AppStorage(StealthStorage.recoveryScore)` (the constant), never a raw string literal. Do not treat plan prose key strings as authoritative.

---

### H-8 — Struct positional-caller audit required [Gemini]

**File:** All files constructing `HealthMetricSnapshot`

`HealthMetricSnapshot` has 13 `let` stored properties. The plan adds `var stealthKey: String = ""` as a 14th. Swift's synthesized memberwise initialiser will include this new field. Any call site using positional (non-keyword) arguments will fail to compile. The plan assumes all 16 enumerated call sites use keyword arguments — this must be verified before landing.

**Fix:** After adding the field, run:
```
grep -rn "HealthMetricSnapshot(" GooseSwift/ --include="*.swift"
```
Confirm every call site uses keyword arguments. This grep is already in the plan's verification step — it must be treated as a blocker, not a post-hoc check.

---

## MED Severity Findings (address or document)

### M-1 — Reactivity gap: toggle change does not immediately refresh dashboard [Gemini]

`GooseStealthMode.isHidden(metric:)` reads `UserDefaults.standard.bool(forKey:)` synchronously. `displayValue` is a computed property on a value-type struct — SwiftUI only re-evaluates it when the containing `@Published` snapshot is re-emitted. Toggling in `StealthMetricsView` updates UserDefaults immediately but `HealthDataStore` does not re-publish its snapshots. The dashboard is stale until the next natural refresh cycle (data poll or navigate-away/back).

**Options:**
1. Accept and document the deferred-update behaviour with a comment in `StealthMetricsView`.
2. Trigger a lightweight snapshot refresh on toggle change via `HealthDataStore` (e.g., call an invalidation method on `@EnvironmentObject`).
3. Publish a `@Published var stealthVersion: Int` on `HealthDataStore`, increment via `NotificationCenter` observer on the 6 UserDefaults keys.

The plan does not address this. Option 1 is acceptable for MVP; Option 3 is the cleanest long-term solution.

---

### M-2 — Date-picker chart bars leak true numeric score when metric is hidden [Gemini]

`ScoreDateTimeline.baseScorePercent(for:)` calls `firstNumber(in: snapshot.displayValue)` to derive chart bar height. When stealth is active, `displayValue` returns `"—"` (no digit), so `firstNumber` returns `nil` and falls back to `firstNumber(in: snapshot.value)` — the raw unmasked numeric string. This means the date-picker chart bars for sleep, recovery, and strain still render the true value even when the user has toggled the metric hidden. Only the text label is masked.

**Fix:** Make an explicit product decision: if chart bars should also be hidden, guard `baseScorePercent` against the stealth state. If text-only masking is intentional, add a comment documenting the by-design behaviour.

---

### M-3 — `MoreDataStore` default `@Published var routeStatus` initialiser [Gemini]

There are two `MoreRouteStatus(...)` initialisers in `MoreDataStore` — the inline default at the top of the file (`@Published var routeStatus = MoreRouteStatus(...)`) and `refreshRouteStatus` at line ~151. The plan lists both, but they are at different locations in the file. Adding `stealthMetrics:` to the struct causes a compile error at the inline default if it is missed.

**Fix:** Treat the inline default initialiser and `refreshRouteStatus` as two separate explicit checklist items during execution. Both take `stealthMetrics: .ready`.

---

### M-4 — `HealthDataStore+Utilities.swift:1012` direct constructor [Claude]

A direct `HealthMetricSnapshot(...)` constructor at line 1012 is in a utilities file separate from `+Snapshots` and `+Vitals` — easy to overlook in a "fix the data layer" mental model. Must be in the explicit post-execution grep.

---

## LOW Severity Findings

### L-1 — `StealthMask` lacks `Equatable` conformance [Codex]

`EnvironmentKey` does not require `Equatable`, so this compiles. But any future `onChange(of:)` or `equatable()` modifier on `stealthMask` will fail at that point.

**Fix (optional):** Add `extension StealthMask: Equatable {}` — trivial since `Set<String>` is already `Equatable`.

---

### L-2 — Stealth guard must be the very first statement in `displayValue` [Claude]

The existing `displayValue` has a `guard !unit.isEmpty` branch and a `unit == "%"` branch. If the stealth guard is inserted after these rather than before them, percentage metrics with `value = "--"` may bypass the stealth gate.

**Fix:** Place the stealth guard unconditionally as the very first statement in `displayValue`, before any other branching.

---

### L-3 — Preview-only `EnvironmentKey` creates split code path [Gemini]

`StealthMaskKey` is only used in `#Preview` blocks. Production reads `GooseStealthMode.isHidden` directly. A future developer may assume the environment key is the canonical code path.

**Fix:** Add a comment next to the `EnvironmentKey` declaration:
```swift
// Preview-only. Production code reads GooseStealthMode.isHidden(metric:) directly.
```

---

## INFO

| # | Finding |
|---|---------|
| I-1 | `var stealthKey: String = ""` is the correct declaration — synthesized memberwise init includes it with default; no compile risk for keyword-argument callers. (Codex) |
| I-2 | Three visually similar sentinels exist: `"--"` (no data), `"-"` (rare), `"—"` (stealth). Consider `static let stealthPlaceholder = "—"` on `HealthMetricSnapshot` for grep-discoverability. (Gemini) |
| I-3 | Plan prose says `enum GooseStealthMode` but actual declaration is `struct GooseStealthMode`. No code impact; update plan prose to avoid executor confusion. (Claude) |

---

## Individual Reviewer Summaries

### Codex — APPROVE_WITH_NOTES (HIGH confidence)
The plan's core model-layer gate and Settings UI are architecturally sound. Two HIGH-severity call sites not in the plan's 16-site enumeration — `ScoreDateTimeline.datedSnapshot` (3 branches in HealthModels.swift) and `HomeDashboardView.homeSnapshot` (strain-to-percent conversion) — will silently drop `stealthKey` and produce a broken feature that compiles cleanly. The `snapshot()` factory in Utilities.swift must also accept `stealthKey` or all 6 static base entries are built with an empty key. These three gaps must be fixed before execution.

### Gemini — APPROVE_WITH_NOTES (HIGH confidence)
The plan is architecturally sound and the 7-location MoreRoute checklist is complete. Two structural risks: (1) `replacingHealthMonitorSnapshot` silently drops the key — compiler won't warn due to the default value masking the missing argument; (2) the UserDefaults/reactivity gap means toggles do not immediately update the dashboard — a visible UX flaw that should either be fixed or documented. The `baseScorePercent`/chart leak is a subtle partial-masking issue requiring an explicit product decision.

### Claude — APPROVE_WITH_NOTES (HIGH confidence)
The plan's architecture holds up against the actual codebase. Three execution hazards: (1) `replacingHealthMonitorSnapshot` must have `stealthKey` forwarded inside its body — missing this silently breaks the gate for 10+ metric paths; (2) the `@AppStorage` keys in plan prose use the wrong prefix (`"goose.stealth.*"` vs. actual `"goose.swift.stealth.*"`) — must never be written as raw strings; (3) `settingsRoutes` is a plain array with no compiler enforcement — must be in the explicit post-build verification grep.

---

## Cycle 2 — Resolution Verification (2026-06-27)

**Reviewers:** Codex · Claude (parallel, independent)
**Scope:** Verify all 8 HIGH findings from Cycle 1 are addressed in the revised plan

---

### Cycle 2 Summary

| Metric | Value |
|--------|-------|
| Prior HIGHs to verify | 8 |
| RESOLVED | 8 |
| PARTIAL | 0 |
| UNRESOLVED | 0 |
| New HIGH findings | 0 |
| New MED findings | 2 |
| New LOW findings | 2 |
| **Cycle 2 verdict** | **APPROVED — clear to execute** |

---

### H-1 — `replacingHealthMonitorSnapshot` forwards stealthKey

**RESOLVED** (Codex · Claude)

Plan STEP E explicitly states: *"Add `stealthKey: snapshot.stealthKey` to this constructor call, inside the helper body. Do NOT add it only at the call sites."* The `must_haves` truth block echoes it. Verification grep targets `HealthDataStore+Vitals.swift` directly. No gap.

---

### H-2 — `ScoreDateTimeline.datedSnapshot` 3 branches covered

**RESOLVED** (Codex · Claude)

Plan STEP B explicitly names all three constructors: *"the no-data branch (~line 131), the non-today-date branch (~line 148), and the base-score path (~line 175)."* The `must_haves` truth enumerates all three. Verification grep requires count ≥ 4 in HealthModels.swift.

---

### H-3 — `settingsRoutes` literal array has explicit `.stealthMetrics` addition

**RESOLVED** (Codex · Claude)

Plan STEP 4 (Task 3) dedicates an entire step to this gap, flags it as having *"no compiler safety net,"* and specifies the exact before/after array literal change. Two independent verification greps confirm presence on the array line specifically.

---

### H-4 — `snapshot()` factory in Utilities.swift has `stealthKey` parameter

**RESOLVED** (Codex · Claude)

Plan STEP C adds `stealthKey: String = ""` to the factory signature and forwards it inside the body. It also calls out the second constructor at ~line 1012 for independent handling. Both the `must_haves` truth and done-criteria checklist confirm this.

---

### H-5 — `HomeDashboardView` strain branch covered

**RESOLVED** (Codex · Claude)

Plan STEP H is dedicated to the strain-to-percent branch at ~line 236 and explicitly identifies it as *"not covered by `replacingHealthMonitorSnapshot`."* The instruction to add `stealthKey: snapshot.stealthKey` at that constructor site is unambiguous. The step header labels it "H-4 fix" — a cosmetic mislabel (no execution risk; the body is correct and the file is in scope).

---

### H-6 — `MoreRouteStatus` field before switch arm ordering documented

**RESOLVED** (Codex · Claude)

The plan has a dedicated ORDERING CONSTRAINT block stating the struct field (STEP 1) *"must be first"* and explains that adding the switch arm before the field causes a build failure. The done-criteria checkbox explicitly names the ordering constraint.

---

### H-7 — No raw `"goose.stealth.*"` strings — only `StealthStorage` constants used

**RESOLVED** (Codex · Claude)

Two independent automated gates enforce this: (1) `StealthMetricsView` verify block requires `grep -v "^//" … | grep -c "goose\.stealth\."` to return 0; (2) Task 1 verify block requires `grep -c "goose\.swift\.stealth\.\|goose\.stealth\."` to return 0. The plan also distinguishes metric key suffixes (`"recovery_score"`) from `@AppStorage` keys.

---

### H-8 — All `HealthMetricSnapshot` call sites use keyword `stealthKey` argument

**RESOLVED** (Codex · Claude)

Plan STEP I labels the grep audit a *"blocker before marking Task 1 done"* and provides the exact command. The verify block adds a second pipe-grep that flags any call site missing `stealthKey`. The `must_haves` truth locks it. No gap.

---

### New Findings from Cycle 2

#### N-1 — STEP H mislabels the HomeDashboardView fix as "H-4 fix" [MED · Claude]

**File:** `122-01-PLAN.md` — STEP H header

The step header says "H-4 fix" but the concern is H-5 (HomeDashboardView strain branch). An executor reading only step headers could close H-4 twice and leave H-5 unchecked in a progress log. Low execution risk since the body is unambiguous, but worth correcting before execution.

**Recommended fix:** Change the STEP H header label from "H-4 fix" to "H-5 fix" or "H-4+H-5 fix."

---

#### N-2 — STEP C leaves `~line 1012` constructor treatment ambiguous [MED · Claude]

**File:** `122-01-PLAN.md` — Task 1 STEP C

The plan says: *"If outside [the factory], add `stealthKey: snapshot.stealthKey` (or `stealthKey: ""`)"*. The *"or `stealthKey: ""`"* creates a judgment call for the executor: if the site produces a user-visible snapshot for a stealth-gated metric, silently assigning `""` makes the gate a no-op without a compile-time signal.

**Recommended fix:** Mandate a read of the call site before deciding; specify the metric key or `""` explicitly in the plan.

---

#### N-3 — `StealthMask` type origin not cited [LOW · Codex]

Task 2 references `StealthMask.none` and `StealthMask(hidden: [...])` but does not state which file defines the type (Phase 119 output or a new file). If the type does not exist on disk, Task 2 fails to compile with no clear hook in the verify block.

**Recommended fix:** Add a pre-step to Task 2: read `GooseStealthMode.swift` and confirm `StealthMask` is defined there; if not, define it in Task 2.

---

#### N-4 — `StealthStorage` constant names assumed but not grep-verified [LOW · Codex]

The plan lists constants like `StealthStorage.recoveryScore`, `StealthStorage.strainScore`, etc., and instructs the executor to read `GooseStealthMode.swift` to confirm — but no done-criteria item or verification grep locks the actual constant names. A mismatch causes a silent compile error.

**Recommended fix:** Add a verification grep: `grep -n "static let" GooseSwift/GooseStealthMode.swift` must show all 6 expected constant names before Task 2 begins.

---

### Cycle 2 Reviewer Summaries

#### Codex — APPROVED (HIGH confidence)
All 8 HIGHs are explicitly resolved in the revised plan with specific step text, done-criteria entries, and automated grep gates. Two low-severity gaps found: `StealthMask` type origin and `StealthStorage` constant name verification. Neither blocks execution but both should be noted by the executor.

#### Claude — APPROVED (HIGH confidence)
All 8 HIGHs are closed with no ambiguity in the fix text. Two medium observations: the STEP H label mislabels H-5 as H-4 (cosmetic, low execution risk) and STEP C leaves the `~line 1012` constructor treatment open-ended (execution judgment call). Neither is a blocker, but N-2 in particular should be resolved by the executor with a read-before-decide step.

---

## Pre-Execution Checklist (additions to plan)

Before beginning Task 1 execution, add these items to the verification checklist:

- [ ] Audit `snapshot()` factory in `HealthDataStore+Utilities.swift` — add `stealthKey: String = ""` parameter and forward it
- [ ] Add `stealthKey: snapshot.stealthKey` to all 3 constructors in `ScoreDateTimeline.datedSnapshot` (HealthModels.swift lines ~131, ~148, ~175)
- [ ] Add `stealthKey: snapshot.stealthKey` to `HomeDashboardView.homeSnapshot` strain branch (~line 236)
- [ ] Add `stealthKey: snapshot.stealthKey` to `HealthDataStore+Utilities.swift:1012` direct constructor
- [ ] Execution order for MoreRoute: struct field → switch arms → settingsRoutes array → MoreView destination → MoreDataStore initialisers
- [ ] Verify `settingsRoutes` array contains `.stealthMetrics` via grep (not implied by zero-error build)
- [ ] Use `@AppStorage(StealthStorage.recoveryScore)` constants — never raw key strings from plan prose
- [ ] Stealth guard is first statement in `displayValue` — before `guard !unit.isEmpty`
- [ ] Decide: chart bar masking in `baseScorePercent` — intentional text-only or fix needed?
- [ ] Document or fix dashboard reactivity gap (toggle → UserDefaults → stale until next refresh)
