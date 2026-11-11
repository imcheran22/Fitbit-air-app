---
phase: 18-coach-multi-provider
plan: 05
subsystem: ui
tags: [swift, swiftui, coach, provider-picker, settings-sheet, ui, localization]

requires:
  - phase: 18-coach-multi-provider
    plan: 01
    provides: "CoachProvider protocol, CoachProviderRegistry, CoachChatModel"
  - phase: 18-coach-multi-provider
    plan: 02
    provides: "ClaudeCoachProvider (ClaudeCredentialStore)"
  - phase: 18-coach-multi-provider
    plan: 03
    provides: "CustomEndpointCoachProvider (CustomEndpointCredentialStore, validateBaseURL)"
  - phase: 18-coach-multi-provider
    plan: 04
    provides: "GeminiCoachProvider (isExchangingToken, handleRedirect, generateCodeVerifier), GeminiOAuthWebView"

provides:
  - "CoachSettingsSheet SwiftUI view — provider picker + per-provider config + model preset picker"
  - "CoachProviderPickerRow — SF Symbol icon + auth badge + active checkmark"
  - "CoachProviderConfigView — switches on activeProvider.id (ChatGPT/Claude/Gemini/Custom)"
  - "CoachModelPresetPickerView — Picker(.inline) over activeProvider.availablePresets"
  - "Gear icon ToolbarItem in CoachView opening CoachSettingsSheet via .large sheet"
  - "Active-provider indicator (principal toolbar) in CoachView nav bar"
  - "testRegistryExposesAllFourProviders re-enabled — XCTSkip removed"

affects:
  - 18-06-integration

tech-stack:
  added: []
  patterns:
    - "@Bindable var registry: CoachProviderRegistry — two-way binding into @Observable registry from sheet"
    - "ToolbarItem(placement: .principal) VStack for title + subtitle active-provider indicator"
    - ".sheet(isPresented: showingSettings) with .presentationDetents([.large]) + .presentationDragIndicator(.visible)"
    - "Switch on provider.id inside CoachProviderConfigView — plain String dispatch to typed config subviews"
    - "CustomEndpointCoachProvider.validateBaseURL() called inline for real-time URL hint"

key-files:
  created:
    - GooseSwift/CoachSettingsSheet.swift
  modified:
    - GooseSwift/CoachView.swift
    - GooseSwiftTests/CoachProviderRegistryTests.swift
    - GooseSwift.xcodeproj/project.pbxproj

key-decisions:
  - "CoachProfileMenu kept alongside gear icon — it provides New Conversation + Sign Out for ChatGPT; settings sheet handles per-provider config. No duplication as the two buttons serve different concerns."
  - "Switching on provider.id (String) in CoachProviderConfigView is simpler than a protocol method returning AnyView; keeps the view logic in the UI layer where it belongs."
  - "ClaudeConfigView uses ClaudeCredentialStore.save() directly — consistent with ClaudeCoachProvider internals; no new API needed."
  - "GeminiConfigView reads/writes GeminiCoachProvider.oauthClientIdKey UserDefaults key directly — provider owns the key constant; view reads the same key."
  - "WearableDescriptorTests build-for-testing failure is a pre-existing issue (confirmed by git stash test before any Wave 5 changes); deferred as out-of-scope."

requirements-completed: [COACH-05]

duration: ~35min
completed: 2026-06-06
---

# Phase 18 Plan 05: Coach Settings Sheet Summary

Provider picker UI — CoachSettingsSheet with per-provider config forms and model preset picker, reachable via gear icon in the Coach nav bar, with an active-provider indicator subtitle.

## Performance

- **Duration:** ~35 min
- **Started:** 2026-06-06T11:30:00Z
- **Completed:** 2026-06-06T12:05:00Z
- **Tasks:** 3 of 4 automated (Task 4 is a human-verify checkpoint)
- **Files modified:** 4

## Accomplishments

- `CoachSettingsSheet` (456 lines) created with `Section("Provider")`, `Section("Configuration")`, `Section("Model")` per UI-SPEC Component Inventory
- `CoachProviderPickerRow` renders SF Symbol per icon table, auth status badge (`checkmark.circle.fill` / `circle`), active checkmark, `.accessibilityAddTraits(.isSelected)` per UI-SPEC Accessibility
- `CoachProviderConfigView` switches on `activeProvider.id`:
  - **ChatGPT**: signed-in status + "Sign Out" button behind `.confirmationDialog` (T-18-16)
  - **Claude**: `SecureField` (masked) + "Save API Key" + "Remove Key" behind `.confirmationDialog` (T-18-14)
  - **Gemini**: Google Client ID `TextField` (stored in UserDefaults) + "Sign in with Google" presenting `GeminiOAuthWebView` + loading state via `isExchangingToken` + "Sign Out" behind `.confirmationDialog` (T-18-16)
  - **Custom**: Base URL + API Key `SecureField` + Model ID + "Save Endpoint" + inline "Must start with https://" hint via `validateBaseURL` (T-18-15)
- `CoachModelPresetPickerView`: `Picker(.inline)` over `activeProvider.availablePresets`; section hidden when empty (Custom has no presets)
- Gear icon `ToolbarItem(placement: .topBarTrailing)` in `CoachView` with `.accessibilityLabel("Coach settings")`
- `.sheet(isPresented: $showingSettings)` with `.presentationDetents([.large])` + `.presentationDragIndicator(.visible)` per UI-SPEC D-05
- Active-provider indicator as `ToolbarItem(placement: .principal)` — VStack "Coach" + `providerName`; hidden when `activeProvider == nil`
- `testRegistryExposesAllFourProviders` re-enabled: `XCTSkip` removed, asserts `count == 4` and exact id set
- All three STRIDE mitigations (T-18-14 SecureField, T-18-15 URL validation, T-18-16 confirmationDialog) implemented

## Task Commits

1. **Task 1: Re-enable four-provider registry test** — `60faadc` (feat)
2. **Task 2: CoachSettingsSheet with provider picker + config forms + preset picker** — `244b124` (feat)
3. **Task 3: Gear icon + active-provider indicator in CoachView** — `3190ab6` (feat)

## Files Created/Modified

- `GooseSwift/CoachSettingsSheet.swift` — 456 lines; CoachSettingsSheet + CoachProviderPickerRow + CoachProviderConfigView + CoachModelPresetPickerView + per-provider config views
- `GooseSwift/CoachView.swift` — gear icon ToolbarItem + principal VStack indicator + showingSettings sheet
- `GooseSwiftTests/CoachProviderRegistryTests.swift` — XCTSkip removed, real assertions on count == 4 and id set
- `GooseSwift.xcodeproj/project.pbxproj` — CoachSettingsSheet.swift registered (PBXBuildFile + PBXFileReference + PBXGroup + PBXSourcesBuildPhase)

## Decisions Made

- **CoachProfileMenu kept**: The existing `CoachProfileMenu` (model picker + New Conversation + Sign Out) coexists with the new gear icon. The settings sheet handles per-provider configuration; the profile menu handles ChatGPT-specific actions (model, conversation, sign-out). No duplication of function — the profile menu will be unified into the settings sheet in Wave 6.
- **String dispatch in CoachProviderConfigView**: Switching on `provider.id` (String) is simpler than adding a `configView()` protocol method returning `AnyView`. The config views are purely UI concerns; keeping them in the settings file avoids coupling the protocol to SwiftUI.
- **Worktree sync before start**: Merged `37e6d9d` (Wave 4 merge commit) to bring all Wave 1-4 files into the worktree before starting Wave 5 implementation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree missing Wave 1-4 files — merged 37e6d9d before starting**
- **Found during:** Initial setup
- **Issue:** Worktree branch was at `a6bf1e1` (research docs), before all wave merge commits. CoachProvider protocol, ClaudeCoachProvider, CustomEndpointCoachProvider, GeminiCoachProvider, and GeminiOAuthWebView were absent.
- **Fix:** `git merge 37e6d9d --no-edit` fast-forwarded the worktree to include all Wave 1-4 commits.
- **Files modified:** All Wave 1-4 files now present.
- **Impact:** No code changes required; working state restored before implementation.

**Total deviations:** 1 auto-fixed (Blocking — worktree sync)
**Impact on plan:** All tasks proceeded as planned after sync. No scope creep.

## Issues Encountered

- `xcodebuild build-for-testing` fails with `WearableDescriptorTests.swift:3:18: error: unable to resolve module dependency: 'GooseSwift'` — confirmed pre-existing before Wave 5 changes via `git stash` test. Deferred as out-of-scope (pre-existing issue not caused by this plan).
- iPhone 16 simulator not available — used iPhone 17 (same SDK, no behavioural difference).

## Checkpoint Pending

**Task 4** (`checkpoint:human-verify`) is the next step. The user must visually verify the settings sheet against the UI-SPEC before this plan is closed.

## Known Stubs

None — all UI components are wired to real data sources (registry, chat, provider Keychain/UserDefaults).

## Threat Flags

No new surface beyond what the plan's threat model covers. All three T-18-1x mitigations implemented:

| T-ID | Component | Mitigation |
|------|-----------|------------|
| T-18-14 | Claude/Custom API key fields | `SecureField` masked; on save key clears and writes only to Keychain |
| T-18-15 | Custom URL input | `CustomEndpointCoachProvider.validateBaseURL` inline hint |
| T-18-16 | Sign-out / remove-key | Both gated behind `.confirmationDialog` with explicit destructive confirmation |

## Self-Check: PASSED

- GooseSwift/CoachSettingsSheet.swift: FOUND (456 lines)
- GooseSwift/CoachView.swift: FOUND (modified)
- GooseSwiftTests/CoachProviderRegistryTests.swift: FOUND (XCTSkip removed)
- Commit 60faadc (Task 1): FOUND
- Commit 244b124 (Task 2): FOUND
- Commit 3190ab6 (Task 3): FOUND
- grep selectProvider CoachSettingsSheet.swift: 1 match
- grep SecureField CoachSettingsSheet.swift: 2 matches
- grep confirmationDialog CoachSettingsSheet.swift: 3 matches
- grep GeminiOAuthWebView CoachSettingsSheet.swift: 1 match
- grep gearshape CoachView.swift: 1 match
- grep CoachSettingsSheet CoachView.swift: 1 match
- grep XCTSkip CoachProviderRegistryTests.swift: 0 matches
- xcodebuild build: BUILD SUCCEEDED (zero errors)

---
*Phase: 18-coach-multi-provider*
*Completed: 2026-06-06*
