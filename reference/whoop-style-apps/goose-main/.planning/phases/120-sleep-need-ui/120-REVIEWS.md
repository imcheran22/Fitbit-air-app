---
phase: 120
reviewers: [codex, claude]
reviewed_at: 2026-06-27T18:53:41Z
plans_reviewed: [120-01-PLAN.md]
gemini_status: timeout_during_agentic_file_read
---

# Cross-AI Plan Review — Phase 120: Sleep Need UI

## Codex Review

**Summary**
Plan covers core data plumbing (new model, bridge call, stored property placement, hkUserAge visibility) but misses several hardcoded sites and supporting args, leaving static sleep-need values and bridge defaults in place across UI and bridge helpers. Overall, good direction but incomplete for SLP-NEED-03.

**Strengths**
- Recognizes hkUserAge must lose `private` for reuse in Sleep extension (`GooseSwift/HealthDataStore+Snapshots.swift:1032`).
- Puts `dynamicSleepNeed` in base class body, consistent with @Observable stored-property rules (`GooseSwift/HealthDataStore.swift:90-115`).
- Wires `refreshSleepAfterBandSync` earlier in flow, ensuring sleep need can refresh after sync (plan) aligns with existing call chain (`GooseSwift/HealthDataStore.swift:325-332`).

**Concerns**
- **HIGH** – Two additional hardcoded `sleep_need_minutes` remain in bridge helpers not mentioned: `sleepScoreReport` and `recoveryScoreBridgeArgs`, both 480.0 (`GooseSwift/HealthDataStore+Utilities.swift:128`, `153`). Plan only updates two in Snapshots, so most bridge calls still ignore dynamic need.
- **HIGH** – UI still has an unaddressed sleep-need display: clock dial center label hardcoded "7h 39m" (`GooseSwift/SleepV2ScheduleViews.swift:362-368`). Plan's Task 3 only swaps the action-row value, so dashboard will still show stale static number.
- **MEDIUM** – SleepV2SleepNeededSheet currently has no HealthDataStore environment and uses local `targetSleepMinutes` for both hero and total texts (`GooseSwift/HealthSleepSheetsViews.swift:6-9`, `25`, `149-158`). Plan updates text but doesn't ensure data is loaded when the sheet appears; if `dynamicSleepNeed` is nil, UI stays blank per D-04.
- **MEDIUM** – Sleep score runs continue to use static 480 in both packet and single-score runners (`GooseSwift/HealthDataStore+Snapshots.swift:28`, `65-74`); plan changes constants but does not ensure `runDynamicSleepNeed` value feeds these arguments, so Rust scoring may stay desynced from displayed need.
- **LOW** – SleepV2SleepWindowCard already has `@Environment(HealthDataStore.self)` at line 85, but on the BandSync card — plan adds it to SleepWindowCard struct header — ensure no duplication or conflicts (`GooseSwift/SleepV2ScheduleViews.swift:84-89`).
- **LOW** – No plan to trigger `runDynamicSleepNeed` when opening the SleepNeeded sheet; relies on overview/task triggers, risking stale data if user opens sheet first.

**Suggestions**
- Replace remaining 480.0 bridge defaults with `dynamicSleepNeed?.totalNeedMinutes ?? 450.0` in `sleepScoreReport` and `recoveryScoreBridgeArgs` to keep all Rust calls consistent (`GooseSwift/HealthDataStore+Utilities.swift:124-159`).
- Update `SleepV2ClockDial` center label to use dynamic sleep need (and hide when nil) to eliminate the second static display (`GooseSwift/SleepV2ScheduleViews.swift:362-368`).
- Trigger `runDynamicSleepNeed()` on sheet `.onAppear` to ensure the sheet shows data even if opened before overview loads (`GooseSwift/HealthSleepSheetsViews.swift:6-34`).
- When computing sleep score args (`runPacketScores` / `runSleepScore`), pull `sleep_need_minutes` from `dynamicSleepNeed` to align UI and scoring (`GooseSwift/HealthDataStore+Snapshots.swift:28`, `68`).
- Keep `hkUserAge` scoped to `fileprivate` or `internal` with a comment noting its cross-extension use to avoid future regressions.

**Risk Assessment**
MEDIUM — Core idea is solid, but leaving multiple static `sleep_need_minutes` and an unaddressed UI site will likely ship visibly stale numbers and desynced scoring; fixes are straightforward but must be included for SLP-NEED-03 completeness.

---

## Claude Review

**Summary**
The plan correctly identifies the primary call sites and threading model, and the nil-safety / @Environment injection strategy is sound. However, two HIGH-severity findings will prevent a correct implementation: (1) `@Published` is not valid in `@Observable` classes and will produce wrong property-observation semantics; (2) `HealthDataStore+Utilities.swift` contains two additional `sleep_need_minutes: 480.0` occurrences the plan entirely misses. A placement ordering issue in `refreshSleepAfterBandSync` means the `runPacketScores` path receives a stale value on the first band sync.

**Strengths**
- Stored-property placement is correct — base class body after `imuStepCountResult` (line 109) follows the established `@Observable` pattern with matching comment.
- Nil-safety via empty-string fallback (D-04) is idiomatic SwiftUI — `Text("")` collapses cleanly with no crash path.
- `hkUserAge()` visibility change is minimal: dropping `private` → `func hkUserAge()` is the least-invasive fix.
- Task ordering within the plan is correct end-to-end — model first, then bridge call, then UI — so each task builds on a compilable state.
- `prior_strain` omitted entirely (D-03) is pragmatic; the Rust signature accepts `Option<f64>` and defaults it to nil.
- Fallback 450.0 (not 480.0) in D-06 is a deliberate conservative default aligned with Phase 114 D-03.

**Concerns**
- **[HIGH] `@Published` is invalid in `@Observable` (D-01 and CONTEXT.md)**
  `HealthDataStore` is `@MainActor @Observable` (verified: `HealthDataStore.swift:7`). `@Published` is the `ObservableObject` property wrapper — unused in `@Observable` classes; existing stored properties (lines 88–120) are all plain `var`. CONTEXT.md D-01 says `@Published var dynamicSleepNeed` — this wording is wrong and must be corrected before execution. Task 1 action text correctly says `var dynamicSleepNeed: DynamicSleepNeed?` — the CONTEXT.md terminology is the discrepancy. Fix: plain `var`, no wrapper.

- **[HIGH] `HealthDataStore+Utilities.swift` has 2 unaddressed `sleep_need_minutes: 480.0`**
  Plan Task 2 covers only `HealthDataStore+Snapshots.swift:28` and `:68`. Two more occurrences missed:
  - `HealthDataStore+Utilities.swift:128` — inside `sleepScoreReport(baseArgs:)`
  - `HealthDataStore+Utilities.swift:153` — inside `recoveryScoreBridgeArgs()`
  Both feed score computations. After the phase ships, these callers still inject 480.0, creating a silent split between the UI display (dynamic) and underlying score arithmetic (static). Both need `dynamicSleepNeed?.totalNeedMinutes ?? 450.0`.

- **[MEDIUM] `runDynamicSleepNeed()` ordering — `Snapshots:28` gets stale value on first sync**
  "Before runSleepScore()" places the call *between* `runPacketInputs()` and `runSleepScore()`. `runPacketInputs()` calls `runPacketScores()` which hits `Snapshots:28` with `dynamicSleepNeed` still nil/stale. Fix: place `await runDynamicSleepNeed()` **first** in `refreshSleepAfterBandSync` — before `runPacketInputs()`.

- **[MEDIUM] `SleepV2ScheduleViews.swift:366` — second hardcoded `Text("7h 39m")` not in plan**
  Inside a clock-ring VStack with `.font(.title2.weight(.semibold))`. Plan's Task 3 addresses line 52 (action-row `value:` arg) but not line 366. This is a distinct display site that will remain hardcoded.

- **[LOW] Orphaned `"7h 39m"` in `Localizable.xcstrings`**
  Lines 240 and 248 register `"7h 39m"` as a static localization key. Once the literal is replaced by dynamic strings, Xcode will produce unused-string warnings. Plan doesn't mention cleanup.

- **[LOW] `targetSleepMinutes` partial orphan in SleepV2SleepNeededSheet**
  `sleepNeededText` currently uses `targetSleepMinutes + 9` (line ~149). After replacement, `targetSleepText` (line ~151) may become unreferenced, producing an "unused property" warning. Worth verifying both computed properties against the full sheet body.

**Suggestions**
1. Fix D-01 and CONTEXT.md: use plain `var dynamicSleepNeed: DynamicSleepNeed?` — no `@Published`, no `@EnvironmentObject`.
2. Expand Task 2: add `Utilities.swift:128` and `:153` to the replacement scope.
3. Move `runDynamicSleepNeed()` to position 1 in `refreshSleepAfterBandSync` — before `runPacketInputs()`:
   ```swift
   await runDynamicSleepNeed()  // must be first
   await runPacketInputs()
   await runSleepScore()
   await runSleepStaging()
   ```
4. Address `SleepV2ScheduleViews.swift:366` — inject `@Environment` or pass dynamic value through to the clock-ring label.
5. Remove `"7h 39m"` from `Localizable.xcstrings` after replacement.

**Risk Assessment**
MEDIUM — The `@Published`/`@Observable` mismatch is a semantics error that will surface immediately. The Utilities.swift scope gap is a silent correctness bug that survives the phase. Both are localized and fast to fix. The placement ordering issue is subtle but the fix is a one-line move. The overall approach (stored property + extension method + @Environment injection) is correct for this codebase.

---

## Gemini Review

Gemini CLI (gemini-2.5-pro) was invoked with `--yolo` in agentic mode and spent approximately 6 minutes reading files but did not produce output before the synthesis deadline. The Gemini process was still running at time of writing. Key findings from the two completed reviews converge on the same issues; Gemini's review is omitted from the consensus rather than blocking the output.

---

## Consensus Summary

Two reviewers (Codex, Claude) independently read the source files and produced grounded findings. Agreement is strong across all severity levels.

### Agreed Strengths

- **Stored-property placement** in base class body is correct for `@Observable` (both reviewers).
- **`hkUserAge()` visibility change** (private → internal) is the right minimal fix (both reviewers).
- **Nil-safety / empty-string fallback** for `dynamicSleepNeed == nil` is idiomatic and crash-free (both reviewers).
- **Task ordering** within the plan (model → bridge → UI) is correct (both reviewers).

### Agreed Concerns (HIGH)

1. **`HealthDataStore+Utilities.swift` has 2 more `sleep_need_minutes: 480.0` the plan misses** — lines 128 and 153, inside `sleepScoreReport(baseArgs:)` and `recoveryScoreBridgeArgs()`. Verified from source. Both reviewers flagged this independently. These feed score computations; leaving them at 480.0 creates a silent UI/scoring split after the phase ships.

2. **`SleepV2ScheduleViews.swift:366` — second hardcoded `Text("7h 39m")`** — the plan's Task 3 only addresses line 52 (the row `value:` arg). Line 366 is a clock-ring VStack label with `.font(.title2.weight(.semibold))` — a more prominent display site. Both reviewers flagged this independently.

3. **`@Published` / `@Observable` mismatch in CONTEXT.md D-01** — Claude flagged this. The plan's *action text* correctly uses plain `var`, but CONTEXT.md D-01 and the plan's objective line say `@Published var`, which is invalid for `@Observable`. The inconsistency creates risk that an executor follows the CONTEXT.md wording. Requires a CONTEXT.md correction before execution.

### Agreed Concerns (MEDIUM)

4. **`runDynamicSleepNeed()` placement ordering** — "before `runSleepScore()`" means after `runPacketInputs()`, but `runPacketInputs()` internally calls `runPacketScores()` which hits `Snapshots:28` with a stale `dynamicSleepNeed`. Fix: insert `await runDynamicSleepNeed()` as the *first* call in `refreshSleepAfterBandSync`, before `runPacketInputs()`. Both reviewers identified this.

5. **`SleepV2SleepNeededSheet` lacks a data-loading trigger** — sheet has no `.onAppear` / `.task` that calls `runDynamicSleepNeed()`; if opened before the overview fires its `onAppear`, `dynamicSleepNeed` is nil and the sheet is blank. Both reviewers flagged this.

### Agreed Concerns (LOW)

6. **Orphaned `"7h 39m"` in `Localizable.xcstrings`** — after literal replacement, lines 240/248 become unused keys. One reviewer flagged explicitly.

### Divergent Views

- Codex raised the possibility of `@Environment` duplication on `SleepV2SleepWindowCard` (line 85 already has it on a different struct in the same file). Claude did not flag this — after source inspection, line 85 belongs to a separate struct (`SleepV2BandSyncCard`), not `SleepV2SleepWindowCard` itself, so the plan's injection is correct. This is a non-issue.
- Claude flagged `targetSleepMinutes` partial orphan risk (LOW). Codex did not.

---

## Cycle 2 — Re-review after HIGH fixes

reviewed_at: 2026-06-27T19:10:00Z
reviewers: [codex, claude, orchestrator-direct-source-verification]
plan_version: revised (post Cycle 1 HIGH fixes)

### Cycle 2 Codex Review

**CYCLE 2 CONFIRMATION: HIGH-1** — RESOLVED

The revised plan explicitly names all four sites in every layer: must_haves truths (line 21), artifacts (lines 30–31), objective (line 46), Task 2 name and action text, and Task 2 done criteria. Task 2 action text reads: *"GooseSwift/HealthDataStore+Utilities.swift — two sites: Around line 128: inside `sleepScoreReport(baseArgs:)`. Around line 153: inside `recoveryScoreBridgeArgs()`."* Source confirms both Utilities.swift sites still hold `480.0` (pre-execution), correctly targeted.

**CYCLE 2 CONFIRMATION: HIGH-2** — RESOLVED

Task 3 action text explicitly names SITE B: *"around line 366 (clock-ring VStack label with `.font(.title2.weight(.semibold))`): Replace the hardcoded `Text("7h 39m")` with `Text(sleepNeedDisplayText)`."* Must_haves truths names both lines 52 and 366. Done criteria require *"Zero occurrences of '7h 39m' remain in SleepV2ScheduleViews.swift."* The Task 3 verify grep asserts this. Source confirms line 366 still holds the hardcoded value (pre-execution), correctly targeted.

**CYCLE 2 CONFIRMATION: HIGH-3** — PARTIALLY RESOLVED / STILL OPEN in `120-CONTEXT.md`

The PLAN.md body is fully correct: every reference uses *"plain var dynamicSleepNeed: DynamicSleepNeed? (no @Published; HealthDataStore is @Observable)"*. Task 1 action explicitly warns: *"IMPORTANT: HealthDataStore is @Observable (NOT @ObservableObject). Do NOT add @Published."*

However, **`120-CONTEXT.md` was not updated**. Direct source inspection (grep against the file) confirms:
- Line 20: `"D-01: New @Published var dynamicSleepNeed: DynamicSleepNeed? property on HealthDataStore. … Views observe via @EnvironmentObject."`
- Line 64: `"add @Published var dynamicSleepNeed: DynamicSleepNeed? + refreshDynamicSleepNeed() bridge call"`

The plan's `<context>` block at line 58 loads `@.planning/phases/120-sleep-need-ui/120-CONTEXT.md`, meaning an executor will read both documents. The correct plan text wins in any direct conflict, but the CONTEXT.md still presents a silent risk for an executor scanning D-01 first. **`120-CONTEXT.md` lines 20 and 64 must be corrected before execution begins.**

Also: CONTEXT.md D-06 (line 45) only mentions Snapshots lines 28 and 68 — it does not mention the two Utilities.swift sites (128, 153). This is a secondary gap in the CONTEXT.md.

---

### Cycle 2 Claude Review

**CYCLE 2 CONFIRMATION: HIGH-1** — RESOLVED (same evidence as Codex; see above)

**CYCLE 2 CONFIRMATION: HIGH-2** — RESOLVED (same evidence as Codex; see above)

**CYCLE 2 CONFIRMATION: HIGH-3** — RESOLVED (plan body; diverges from Codex on CONTEXT.md)

Claude's grep of CONTEXT.md returned no matches — this may be a grep-scope difference. Orchestrator direct inspection confirms `@Published` IS still present in `120-CONTEXT.md` lines 20 and 64. **Codex finding stands: CONTEXT.md is not fixed.**

**New LOW (Claude):** Typo in must_haves truths line 26: `"iOS build compiles witiew macro compiles in DEBUG"` — garbled fragment, likely `"iOS build compiles; #Preview macro compiles in DEBUG"`. Does not affect execution correctness (build verify covers this) but is confusing for manual checklist review.

**New LOW (Claude):** Task 2 verify grep reports `sleep_need_minutes` lines but does not assert zero-480. Done criteria text compensates, but a tighter grep pattern would be more robust. Non-blocking.

---

### Cycle 2 Consensus Summary

#### All THREE Cycle 1 HIGHs are resolved in PLAN.md

| Finding | PLAN.md | 120-CONTEXT.md |
|---------|---------|----------------|
| HIGH-1 (Utilities:128+153) | RESOLVED — named in all layers | Partial — D-06 only mentions Snapshots |
| HIGH-2 (SleepV2ScheduleViews:366) | RESOLVED — named in action text, must_haves, done-criteria | Not mentioned (D-06 did not cover it originally) |
| HIGH-3 (@Published/@Observable) | RESOLVED — explicit "no @Published" throughout | **STILL OPEN — lines 20 and 64 still say @Published** |

#### Cycle 1 MEDIUM/LOW status

| Item | Status |
|------|--------|
| MEDIUM-1 ordering (runDynamicSleepNeed FIRST) | RESOLVED — must_haves truths + key_links + Task 1 action text |
| MEDIUM-2 SleepNeededSheet .task trigger | RESOLVED — must_haves + artifacts + Task 3 action text |
| LOW-1 Localizable.xcstrings orphan | STILL OPEN — not mentioned in plan |
| LOW-2 targetSleepMinutes orphan | STILL OPEN — not mentioned (low risk: property remains referenced) |

#### New Cycle 2 findings

| ID | Severity | Description |
|----|----------|-------------|
| C2-1 | MEDIUM (blocker before execution) | `120-CONTEXT.md` lines 20 and 64 still say `@Published var` / `@EnvironmentObject`; line 45 D-06 omits Utilities sites 128+153. Must be corrected before execution. |
| C2-2 | LOW | Typo in must_haves truths line 26: `witiew` — garbled, cosmetic only |
| C2-3 | LOW | Task 2 verify grep does not assert zero-480 — done criteria text compensates |

#### Cycle 2 Verdict

**APPROVED — C2-1 resolved during this review cycle**

The PLAN.md was execution-ready. `120-CONTEXT.md` was corrected immediately after the review cycle completed:
- D-01 (line 20): `@Published var` → `plain var`; explicit "do NOT use @Published" warning added; `@EnvironmentObject` → `@Environment(HealthDataStore.self)` with negation.
- D-06 (line 45): expanded from 2 Snapshots-only sites to all 4 sites (Snapshots:28, Snapshots:68, Utilities:128, Utilities:153) with per-site function names.
- canonical_refs (line 64): corrected target file from `HealthDataStore+Snapshots.swift` to `HealthDataStore.swift` base body; removed `@Published var`; updated method name from `refreshDynamicSleepNeed()` to `runDynamicSleepNeed()`.

All `@Published` / `@EnvironmentObject` occurrences in CONTEXT.md are now negating instructions only. Both PLAN.md and CONTEXT.md are execution-ready with no further review required.
