---
phase: 101-hps-telemetry-coach-crash-protocol-cleanup
plan: "02"
subsystem: coach
tags: [bug-fix, concurrency, swift, coach-tab]
dependency_graph:
  requires: []
  provides: [BUG-COACH-01-fix]
  affects: [GooseSwift/CoachChatModel.swift]
tech_stack:
  added: []
  patterns: [cancel-before-create Task pattern, Swift structured concurrency]
key_files:
  modified:
    - GooseSwift/CoachChatModel.swift
decisions:
  - "Used stored Task property (signInTask) matching existing sendTask pattern — minimal diff, consistent with codebase conventions"
  - "CancellationError caught silently, consistent with original anonymous Task behavior"
  - "No timeout wrapper added — cancel-before-create is sufficient to prevent stacking"
metrics:
  duration: "1 min"
  completed_date: "2026-06-21T14:18:13Z"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
status: complete
---

# Phase 101 Plan 02: Coach Freeze Fix (BUG-COACH-01) Summary

## One-Liner

Prevent Coach tab UI freeze on rapid sign-in taps by tracking and cancelling the previous `signInTask` before spawning a new one.

## What Was Built

Fixed `CoachChatModel.startOAuthSignIn()` so that repeated taps on "Connect Codex" no longer stack multiple device-code polling `Task` instances indefinitely.

**Root cause:** `startOAuthSignIn()` created an anonymous `Task { }` each invocation with no reference retained. Each task called `chatGPT.startOAuthSignIn()` which polls the Codex OAuth endpoint until approved — with no timeout. Rapid taps launched N parallel polling loops that never terminated, freezing the UI at "Waiting for approval."

**Fix — two additions to `GooseSwift/CoachChatModel.swift`:**

1. New stored property alongside `sendTask`:
   ```swift
   private var signInTask: Task<Void, Never>?
   ```

2. Cancel-before-create pattern in `startOAuthSignIn()`:
   ```swift
   signInTask?.cancel()
   signInTask = Task { [chatGPT, weak self] in ... }
   ```

At most one polling loop is active at any time. The prior task receives cooperative cancellation via `Task.cancel()`; the `catch is CancellationError` arm silently drops it (preserved from the original implementation).

## Verification

- `xcodebuild ... build` → **BUILD SUCCEEDED**, zero errors
- Code review: `signInTask?.cancel()` precedes `signInTask = Task { ... }` in `startOAuthSignIn()`
- Pattern consistent with existing `sendTask` cancellation in `startNewConversation()`, `signOut()`, and `cancelStreaming()`

### Simulator Verification (2026-06-21, autonomous)

Driven via XcodeBuildMCP UI automation on iPhone 17 Pro (iOS 26.5, UDID 95142C9B-50CA-421B-A74D-DD622C4ACF66):

1. App built (BUILD SUCCEEDED) and launched on booted simulator
2. Navigated to Coach tab (Treinador) — UI visible and responsive
3. Tapped "Iniciar sessão" → opened "Definições do Treinador" settings screen
4. Tapped "Iniciar sessão com ChatGPT" **4 times in rapid succession** (0.15s intervals)
5. UI remained fully responsive at 1s and 4s after the rapid taps — no freeze, no "Waiting for approval" hung state
6. Navigated back to Coach main screen — UI still fully responsive, all coach routes visible

**Result: PASS** — Rapid sign-in taps no longer cause UI freeze. The cancel-before-create pattern (`signInTask?.cancel()`) ensures at most one OAuth polling loop is active at any time.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced. The change reduces the DoS surface (T-101-02-01) by limiting concurrent OAuth poll loops to one, as planned.

## Self-Check: PASSED

- `GooseSwift/CoachChatModel.swift` modified: confirmed
- Commit `0c53ef4` exists: confirmed (`git log --oneline -1`)
