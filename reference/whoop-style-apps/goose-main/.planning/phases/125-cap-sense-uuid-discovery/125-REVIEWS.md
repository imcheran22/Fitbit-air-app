---
phase: "125"
plan: "125-01"
review_cycle: 1
date: 2026-06-28
reviewers: [codex, claude]
verdict: BLOCK
high_count: 4
---

# Phase 125 — Cap Sense UUID Discovery: Multi-AI Plan Review

## Summary

Both reviewers independently read the source files
(`CoreBluetoothBLETransport+PeripheralDelegate.swift`,
`CoreBluetoothBLETransport+HistoricalHandlers.swift`,
`MoreDebugViews.swift`) and converged on the same two blocking issues.

**Verdict: BLOCK** — two HIGH findings must be resolved before execution.

---

## Convergent Findings (both reviewers agree)

### C-001 — DispatchQueue.main.async wrapper omitted [HIGH — BLOCK]

**Reviewers:** Codex (R-CODEX-001), Claude (R-CLAUDE-001)

**Problem:**
The plan instructs "Do NOT wrap isOnWrist assignment in
DispatchQueue.main.async." Both reviewers verified that the existing
`handleBodyLocationValue` at `HistoricalHandlers.swift:1084` — the only
other writer of `isOnWrist` from a notification path — always wraps its
assignment in `DispatchQueue.main.async { [weak self] in self?.isOnWrist =
newValue }`. The plan's instruction deviates from the established pattern.

The threading rationale is nuanced: `handlePeripheralValueUpdate` does run
on main by the time `handleCapSenseEventValue` is called (event packets are
pre-routed to main via `shouldDispatchNotificationSideEffectsToMain`).
However, the defensive async wrapper is codebase convention and ensures
correctness if the call site ever changes. Omitting it creates a maintenance
trap and a pattern inconsistency between the two co-existing `isOnWrist`
setters (D-04 "last-write wins" assumes both paths reach main via the same
mechanism).

**Fix:**
Replace the plan's Task 1 instruction with:

```swift
DispatchQueue.main.async { [weak self] in
  self?.isOnWrist = true   // or false
}
```

Update D-03 to read: "isOnWrist assignment wrapped in
DispatchQueue.main.async { [weak self] in } per codebase pattern, consistent
with handleBodyLocationValue."

---

### C-002 — [weak self] omitted from async closure [HIGH — BLOCK]

**Reviewers:** Codex (R-CODEX-002), Claude (R-CLAUDE-002)

**Problem:**
The plan instructs "Do NOT use [weak self] capture since method is called
synchronously on self." This reasoning is wrong: once the fix from C-001 is
applied, the closure escapes (it is dispatched asynchronously), making
`[weak self]` mandatory to prevent a retain cycle. Every `DispatchQueue.main.async`
block in the file uses `[weak self]` (lines 103, 116, 322, 339 in the
delegate; line 1090 in HistoricalHandlers). Omitting it here would be the
only exception in the codebase.

**Fix:**
Always use `[weak self]` inside the `DispatchQueue.main.async` closure,
exactly as `handleBodyLocationValue` does:

```swift
DispatchQueue.main.async { [weak self] in
  self?.isOnWrist = true
  self?.record(source: ..., title: ..., body: "STRAP_DETECTED isOnWrist=true")
}
```

---

## Divergent / Solo Findings

### D-001 — UUID guard breadth [MEDIUM]

**Reviewers:** Codex (R-CODEX-003 HIGH), Claude (R-CLAUDE-003 MEDIUM)

**Problem:**
`notificationCharacteristicIDs.contains(characteristic.uuid)` covers 6–8
UUIDs (fd4b0003/04/05/07 and 61080003/04/05/07). `handleCapSenseEventValue`
will execute its frame-parse loop on every notification from all of them,
not only fd4b0004 and 61080004. In practice the inner `V5PacketType.event`
check and the `eventType` switch cheaply discard non-matching frames, so
there is no crash or correctness bug today. However, the plan's rationale
("covers both fd4b0004 AND 61080004 for PUFFIN parity") needs to confirm
explicitly that 61080004 is the PUFFIN EVENTS_FROM_STRAP equivalent, not
just that it happens to be in the same set.

**Disposition:** MEDIUM — no code change required, but clarify in D-01 that
61080004 is the PUFFIN EVENTS_FROM_STRAP UUID. Optionally add a comment in
the implementation acknowledging the intentional broader guard.

---

### D-002 — UInt16 operator precedence [LOW — confirmed correct]

**Reviewers:** Codex (R-CODEX-005 MEDIUM), Claude (R-CLAUDE-004 LOW)

**Problem / Clarification:**
`UInt16(payload[2]) | UInt16(payload[3]) << 8` — Swift `<<` has higher
precedence than `|`, so this correctly evaluates as
`UInt16(payload[2]) | (UInt16(payload[3]) << 8)` (little-endian). Claude
confirmed this is identical to the expression at
`HistoricalHandlers.swift:363`. The expression is correct.

**Disposition:** Add explicit parentheses for defensive clarity:
`UInt16(payload[2]) | (UInt16(payload[3]) << 8)`. Not a bug, but reduces
ambiguity for future readers.

---

### D-003 — payload.count >= 4 guard [LOW — confirmed correct]

**Reviewers:** Codex (R-CODEX-004 MEDIUM), Claude (R-CLAUDE-005 LOW)

**Problem / Clarification:**
`payload.count >= 4` correctly protects `payload[2]` (requires count >= 3)
and `payload[3]` (requires count >= 4). Count == 4 covers both. The guard is
the minimum correct value. Confirmed safe.

**Disposition:** No change needed. Both reviewers confirm correct.

---

### D-004 — MoreInfoRow Optional<Bool> switch pattern [MEDIUM]

**Reviewer:** Claude (R-CLAUDE-006), not raised by Codex

**Problem:**
The plan's Task 2 instructs switching directly on `Optional<Bool>` inside the
`MoreInfoRow` initializer call. The existing `Section("WHOOP Event Signals")`
rows use ternary or pre-computed string values — not inline multi-case switch
expressions inside initializers. The plan is underspecified on where the
switch lives (computed var, local let, or inline expression).

**Fix:**
Implement as a local `let` before the `MoreInfoRow` call, or as a computed
property on the model:

```swift
let capSenseLabel: String = {
  switch model.ble.isOnWrist {
  case .some(true):  return "On wrist (fd4b0004)"
  case .some(false): return "Off wrist (fd4b0004)"
  case nil:          return "Unknown — no event received"
  }
}()
MoreInfoRow(title: "Cap Sense", value: capSenseLabel,
            status: model.ble.isOnWrist == nil ? .pending : .ready,
            systemImage: "sensor.tag.radiowaves.forward")
```

---

### D-005 — systemImage confirmed available [LOW — INFO]

**Reviewer:** Claude (R-CLAUDE-008)

"sensor.tag.radiowaves.forward" is already used at `MoreDebugViews.swift:40`
(Connection section). No availability concern for iOS 26.0. No change needed.

---

### D-006 — shouldDispatchNotificationSideEffectsToMain pre-routes events [MEDIUM — INFO]

**Reviewer:** Codex (R-CODEX-006)

`shouldDispatchNotificationSideEffectsToMain` already returns `true` for
`V5PacketType.event` frames, so fd4b0004 event notifications are dispatched
to main before `handlePeripheralValueUpdate` is called. This supports the
intent of D-03. The async wrapper recommended in C-001 will dispatch
main→main, which is a no-op (no deadlock, no double-dispatch). A `// SAFETY:`
comment noting this pre-condition is recommended.

---

### D-007 — D-04 co-existence interaction [MEDIUM]

**Reviewer:** Claude (R-CLAUDE-007)

D-04 accepts "last-write wins" between cmd 0x54 and cap sense paths. Once
both use `DispatchQueue.main.async`, a cap sense event arriving while a
0x54 response is in-flight could result in an out-of-order write. For a
debug-display-only property this is low risk. CAPSENSE-UUID.md should note
the interaction explicitly with rationale for accepting last-write-wins.

---

### D-008 — Documentation path is neutral [INFO — confirmed clean]

**Reviewers:** Codex (R-CODEX-009), Claude (R-CLAUDE-009)

`.planning/research/whoop-5/CAPSENSE-UUID.md` — path is project-neutral,
no RE/Ghidra/APK references. Clean.

---

## Required Plan Changes Before Execution

| # | Change | Severity |
|---|--------|----------|
| 1 | Remove "Do NOT wrap in DispatchQueue.main.async" — replace with async wrapper per C-001 | BLOCK |
| 2 | Remove "Do NOT use [weak self]" — add [weak self] to closure per C-002 | BLOCK |
| 3 | Clarify D-01 that 61080004 is PUFFIN EVENTS_FROM_STRAP equivalent (UUID guard rationale) | MEDIUM |
| 4 | Add explicit parentheses: UInt16(payload[2]) \| (UInt16(payload[3]) << 8) | LOW |
| 5 | Specify MoreInfoRow value string as local let / computed var, not inline switch | MEDIUM |
| 6 | Add SAFETY comment in handleCapSenseEventValue about event pre-routing to main | LOW |
| 7 | CAPSENSE-UUID.md: note D-04 last-write-wins rationale explicitly | LOW |

---

## CYCLE_SUMMARY

```
high_count: 4
verdict: BLOCK
blocking_findings: [C-001, C-002]
convergence: high (both reviewers independently identified both blocking issues)
resolution: update D-03 in plan — add DispatchQueue.main.async + [weak self]; then re-execute
```

---

---
phase: "125"
plan: "125-01"
review_cycle: 2
date: 2026-06-28
reviewers: [claude]
verdict: PASS
high_count: 0
---

# Phase 125 — Cap Sense UUID Discovery: Cycle 2 Re-Review

## Summary

Cycle 2 re-review verifies that the two blocking findings from cycle 1
(C-001, C-002) were correctly resolved in the updated plan before execution.
No new HIGH findings were found.

**Verdict: PASS** — safe to execute.

---

## C-001/C-002 Resolution Verification

### C-001 — DispatchQueue.main.async wrapper [was: HIGH BLOCK]

**Status:** RESOLVED

**Evidence:** Task 1 Step 2 explicitly mandates `DispatchQueue.main.async { [weak self] in ... }` for both case 10 and case 11, with exact code shown; D-03 (truths) cites HistoricalHandlers.swift:1084 as the reference; done criteria and verification item both gate on the pattern being present.

**Verdict:** PASS

---

### C-002 — [weak self] capture list [was: HIGH BLOCK]

**Status:** RESOLVED

**Evidence:** Plan states "[weak self] capture list is mandatory because the closure escapes (async dispatch). Every DispatchQueue.main.async block in this file uses [weak self] — this must not be the exception"; both case 10 and case 11 code examples show `{ [weak self] in`; key_links section calls out retain-cycle prevention explicitly.

**Verdict:** PASS

---

## Remaining Open Findings (from cycle 1)

| Finding | Status |
|---------|--------|
| D-001 UUID guard breadth [MEDIUM] | INFO — 61080004 named as PUFFIN parity in key_links; intent clear |
| D-002 UInt16 parentheses [LOW] | OPEN — parens not explicitly added in plan; no correctness bug |
| D-003 payload.count >= 4 guard [LOW] | CLOSED — confirmed correct |
| D-004 MoreInfoRow switch location [MEDIUM] | OPEN — Task 2 says "exhaustive switch" without specifying local let vs inline |
| D-005 systemImage availability [LOW/INFO] | CLOSED — confirmed available at iOS 26.0 |
| D-006 shouldDispatchNotificationSideEffectsToMain [MEDIUM] | CLOSED — plan instructs `// SAFETY:` comment; key_links notes safe no-op |
| D-007 D-04 last-write-wins rationale [LOW] | OPEN — CAPSENSE-UUID.md spec documents co-existence but lacks explicit "display-only, low-risk" rationale |
| D-008 Documentation path neutral [INFO] | CLOSED — confirmed clean |

---

## New Findings This Cycle

None.

---

## CYCLE_SUMMARY

```
high_count: 0
verdict: PASS
blocking_findings: []
convergence: both HIGH blockers independently resolved; plan now exactly replicates handleBodyLocationValue pattern at HistoricalHandlers.swift:1083-1084 for both case 10 and case 11; three non-blocking items remain (D-002 LOW, D-004 MEDIUM, D-007 LOW)
resolution: safe to execute; executor should implement D-004 as local let before MoreInfoRow to avoid ambiguous inline switch expression
```
