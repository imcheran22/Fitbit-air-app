---
phase: 18-coach-multi-provider
plan: 02
subsystem: coach
tags: [swift, anthropic, claude, keychain, sse, streaming, coach-provider]

requires:
  - phase: 18-coach-multi-provider
    plan: 01
    provides: "CoachProvider protocol, CoachProviderRegistry, CoachChatModel, CoachModelPreset Claude cases"

provides:
  - "ClaudeCoachProvider conforming to CoachProvider with Anthropic Messages API SSE streaming"
  - "ClaudeKeychain enum (service com.goose.swift.claude, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly)"
  - "ClaudeCredentialStore internal facade for testable Keychain access"
  - "ClaudeProviderError (missingAPIKey, invalidResponse)"
  - "extractClaudeDelta() internal SSE parser for content_block_delta/text_delta events"
  - "Real assertions in CoachKeychainTests and ClaudeProviderTests (no more XCTSkip)"

affects:
  - 18-05-CoachSettingsSheet
  - 18-06-integration

tech-stack:
  added: []
  patterns:
    - "ClaudeKeychain enum following RemoteServerKeychain pattern: baseQuery + save (SecItemDelete+SecItemAdd) + load + delete"
    - "ClaudeCredentialStore internal enum facade — allows @testable import GooseSwift to call Keychain in tests"
    - "AsyncStream wrapping SSE: URLSession.shared.bytes(for:) + bytes.lines async iteration inside AsyncStream { continuation in Task { ... } }"
    - "extractClaudeDelta(from:) internal method (not private) enabling unit testing without mocks"

key-files:
  created:
    - GooseSwift/ClaudeCoachProvider.swift
  modified:
    - GooseSwift.xcodeproj/project.pbxproj
    - GooseSwiftTests/CoachKeychainTests.swift
    - GooseSwiftTests/ClaudeProviderTests.swift

key-decisions:
  - "extractClaudeDelta marked as func (not private func) so tests can call it directly via @testable import — no mock/protocol needed"
  - "ClaudeCredentialStore internal enum added as thin facade over ClaudeKeychain to enable testability without making ClaudeKeychain itself public"
  - "isAuthenticated uses (try? ClaudeKeychain.load()) != nil — double optional collapse to Bool, no crash on Keychain error"
  - "send() throws ClaudeProviderError.missingAPIKey before building AsyncStream — error surfaces to caller before stream creation"

requirements-completed: [COACH-02, COACH-03]

duration: 20min
completed: 2026-06-06
---

# Phase 18 Plan 02: ClaudeCoachProvider Summary

**ClaudeCoachProvider streaming Anthropic Messages API via SSE with API key in Keychain (com.goose.swift.claude); real Keychain roundtrip and SSE delta extraction tests replacing Wave 1 XCTSkip stubs**

## Performance

- **Duration:** 20 min
- **Started:** 2026-06-06T10:40:00Z
- **Completed:** 2026-06-06T11:00:00Z
- **Tasks:** 2 (Task 1: ClaudeKeychain + Keychain test; Task 2: ClaudeCoachProvider SSE + ClaudeProviderTests)
- **Files modified:** 4

## Accomplishments

- `ClaudeCoachProvider` fully conforms to `CoachProvider` protocol with `id = "claude"`, three presets, `isAuthenticated`, `signOut()`, and `send()` returning `AsyncStream<String>`
- `ClaudeKeychain` enum stores API key in Keychain service `com.goose.swift.claude` with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` (T-18-04 mitigation)
- SSE streaming implemented via `URLSession.shared.bytes(for:)` + `bytes.lines`, following existing `OpenAIResponsesClient` pattern
- `extractClaudeDelta(from:)` correctly parses `content_block_delta`/`text_delta` SSE events and rejects all other event types
- `CoachKeychainTests.testClaudeKeychainRoundtrip` replaces XCTSkip with real save/load/delete/nil assertions
- `ClaudeProviderTests` replaces XCTSkip with 5 assertions: valid delta extraction + 4 nil cases + preset count/membership
- All tests green: CoachKeychainTests, ClaudeProviderTests, CoachProviderTests, CoachProviderRegistryTests

## Task Commits

1. **Task 1: ClaudeKeychain helper + Keychain roundtrip test** - `3bac5d8` (feat)
2. **Task 2: ClaudeCoachProvider SSE streaming + ClaudeProviderTests real assertions** - `6e83b38` (feat)

## Files Created/Modified

- `GooseSwift/ClaudeCoachProvider.swift` - ClaudeKeychain enum, ClaudeCredentialStore facade, ClaudeProviderError, ClaudeCoachProvider (180 lines)
- `GooseSwift.xcodeproj/project.pbxproj` - ClaudeCoachProvider.swift registered in PBXBuildFile, PBXFileReference, PBXGroup, PBXSourcesBuildPhase
- `GooseSwiftTests/CoachKeychainTests.swift` - testClaudeKeychainRoundtrip XCTSkip replaced with real assertions; tearDown cleanup
- `GooseSwiftTests/ClaudeProviderTests.swift` - testClaudeDeltaExtraction + testAvailablePresets with real assertions

## Decisions Made

- **`extractClaudeDelta` visibility**: Made `func` (not `private func`) so test target can call it directly via `@testable import GooseSwift`. This avoids needing mock protocols just to test SSE parsing.
- **`ClaudeCredentialStore` facade**: Added thin internal enum wrapping `ClaudeKeychain` so test code calls `ClaudeCredentialStore.save/load/delete` — keeping `ClaudeKeychain` as the canonical implementation without exposing implementation details.
- **`send()` error before stream**: `ClaudeProviderError.missingAPIKey` is thrown synchronously before the `AsyncStream` is created, so the caller receives it as a thrown error rather than a silent stream closure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree missing Wave 1 files — merged 90ce321 before starting**
- **Found during:** Initial setup
- **Issue:** The worktree was branched from `a6bf1e1` (research docs commit), before the Wave 1 merge commit `9759f08`. The `CoachProvider` protocol, `CoachModelPreset` Claude cases, test stubs, and `project.pbxproj` additions from Wave 1 were absent.
- **Fix:** `git merge 90ce321 --no-edit` fast-forwarded the worktree branch to include all Wave 1 commits (fc03708, a023c4b, ed000c6, a202681, and the merge/tracking commits).
- **Files modified:** All Wave 1 files now present in worktree
- **Impact:** No code changes required; working state restored.

**Total deviations:** 1 auto-fixed (Blocking — worktree sync)
**Impact on plan:** All tasks proceeded as planned after sync. No scope creep.

## Issues Encountered

- Wave 1 worktree sync required before implementation could begin (see deviation above)
- iPhone 16 simulator not available — used iPhone 17 for all tests (same SDK, no behavioural difference)

## Known Stubs

None — all Wave 2 test assertions are real. `testCustomEndpointKeychainRoundtrip` retains XCTSkip (Wave 3 scope, not Wave 2).

## Threat Flags

None — implementation fully covers T-18-04 (API key only in Keychain, never UserDefaults or logs) and T-18-06 (extractClaudeDelta and send() never interpolate the key into error strings). T-18-05 satisfied by URLSession ATS enforcement of https.

## Self-Check: PASSED

- GooseSwift/ClaudeCoachProvider.swift: FOUND
- GooseSwiftTests/CoachKeychainTests.swift: FOUND (XCTSkip replaced)
- GooseSwiftTests/ClaudeProviderTests.swift: FOUND (XCTSkip replaced)
- Commit 3bac5d8 (Task 1): FOUND
- Commit 6e83b38 (Task 2): FOUND
- grep com.goose.swift.claude ClaudeCoachProvider.swift: 1 match
- grep kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly: 1 match
- grep api.anthropic.com/v1/messages: 1 match
- grep anthropic-version: 1 match
- grep UserDefaults ClaudeCoachProvider.swift: 0 matches
- Tests CoachKeychainTests + ClaudeProviderTests: PASSED

---
*Phase: 18-coach-multi-provider*
*Completed: 2026-06-06*
