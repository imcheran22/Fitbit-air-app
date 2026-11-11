# Deferred Items — Phase 115

## Out-of-Scope Pre-existing Issues

### GooseSwiftTests target fails to compile (pre-existing, not caused by Phase 115)

**Files:** `GooseSwiftTests/ClaudeProviderTests.swift`, `GooseSwiftTests/CustomEndpointProviderTests.swift`

**Errors:** Main-actor isolation violations — `@MainActor` methods called from non-isolated sync context.

**Why deferred:** These errors existed before Phase 115 started (confirmed via `git diff --name-only HEAD` — only 3 files modified by this plan, neither is ClaudeProviderTests or CustomEndpointProviderTests). The test target build failure prevents running `-only-testing:GooseSwiftTests/GooseBLETypesTests`. The main GooseSwift app build succeeds cleanly.

**Verification used:** Main app `BUILD SUCCEEDED` + code review confirms `featureFlags` field, custom `init(from:)` with `decodeIfPresent`, and memberwise initialiser with `featureFlags: [:]` default compile correctly.

**Resolution:** Future phase or maintainer fix for Swift 6 strict concurrency in those two test files.
