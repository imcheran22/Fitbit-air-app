---
phase: 18-coach-multi-provider
verified: 2026-06-06T13:48:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "COACH-06 migration: cold-launch on device/simulator with existing ChatGPT OAuth token in Keychain. Verify ChatGPT is active provider, no re-auth required, conversation history intact, reply streams."
    expected: "ChatGPT immediately shows as the active provider with Signed-in status. Sending a message produces a streaming reply without any sign-in prompt."
    why_human: "Cannot verify Keychain token presence or streaming behavior without running on a device."
  - test: "Claude streaming: open Coach settings, select Claude, enter a valid Anthropic API key, tap Save API Key, send a message. Verify streaming response arrives."
    expected: "Key saves to Keychain (isAuthenticated badge updates), message produces a streaming reply from the Anthropic Messages API."
    why_human: "Requires live Anthropic API key and network call."
  - test: "Custom endpoint streaming: open Coach settings, select Custom, enter a valid HTTPS base URL + API key + model ID, tap Save Endpoint, send a message. Verify streaming response arrives."
    expected: "isAuthenticated badge updates, message produces streaming reply from the custom OpenAI-compatible endpoint."
    why_human: "Requires a live external endpoint with API key."
  - test: "Gemini streaming (if Google Cloud credentials available): open Coach settings, select Gemini, enter a Google OAuth Client ID, tap 'Sign in with Google', complete OAuth flow in WKWebView, send a message."
    expected: "OAuth completes, isAuthenticated badge shows Signed-in, message produces streaming reply from Google Generative Language API."
    why_human: "Requires Google Cloud Console OAuth client configuration and network call."
  - test: "Provider switching: switch between two authenticated providers mid-session, start a new conversation. Verify the correct provider backend responds and no cross-provider credential leakage."
    expected: "Each provider's backend answers (Claude via Anthropic, ChatGPT via OpenAI). No API key from one provider is sent to another."
    why_human: "Requires live credentials for at least two providers."
  - test: "ChatGPT sign-in button in settings sheet: tap the gear icon, select ChatGPT provider in the not-signed-in state. Tap 'Sign in with ChatGPT'. Verify the sign-in flow launches."
    expected: "The sign-in flow initiates (device code flow or redirect to CoachSignInScreen)."
    why_human: "Button action is currently empty in CoachSettingsSheet — the sign-in only works via the chat sheet's CoachSignInScreen path. This may be a usability gap."
  - test: "UI-SPEC visual review: compare the CoachSettingsSheet against the 18-UI-SPEC.md design specification."
    expected: "Provider picker rows, config forms, model preset picker, and gear icon placement match the approved design."
    why_human: "Visual appearance cannot be verified programmatically."
---

# Phase 18: Coach Multi-Provider Verification Report

**Phase Goal:** Coach tab supports multiple AI providers and user-configured custom endpoints
**Verified:** 2026-06-06T13:48:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `CoachProvider` protocol exists — any conforming type can serve as the AI backend | ✓ VERIFIED | `GooseSwift/CoachProviderProtocol.swift` — protocol with 6 members: `id`, `displayName`, `isAuthenticated`, `availablePresets`, `send(messages:systemPrompt:preset:) async throws -> AsyncStream<String>`, `signOut()` |
| 2 | User can configure at least two providers (OpenAI + Claude) with named accounts in Keychain | ✓ VERIFIED | `ChatGPTCoachProvider` uses `CodexSelfContainedAuthKeychain` (existing). `ClaudeCoachProvider` stores key in `com.goose.swift.claude` Keychain service. D-03 locked one account per provider (not multi-account — intentional scope reduction) |
| 3 | User can enter a custom OpenAI-compatible endpoint (base URL + API key + model) and use it for chat | ✓ VERIFIED | `CustomEndpointCoachProvider` implements URL validation via `RemoteServerURLValidator.validate()`, Keychain storage (`com.goose.swift.custom-endpoint`), UserDefaults for baseURL/modelID, and SSE streaming to `{baseURL}/v1/chat/completions` |
| 4 | Provider picker UI in More/Coach settings shows configured accounts with add/remove/select | ✓ VERIFIED | `CoachSettingsSheet` opens via gear icon in `CoachView` nav bar. `CoachProviderPickerRow` shows all 4 providers with auth badge and active checkmark. `CoachProviderConfigView` switches on provider.id to render per-provider forms. WARNING: ChatGPT "Sign in with ChatGPT" button in the settings sheet has an empty action body — sign-in only works via the chat sheet's CoachSignInScreen path |
| 5 | Existing single OpenAI key is automatically migrated to a named account on first launch | ✓ VERIFIED | `CoachView.onAppear` calls `chat.refreshAuth()` → `ChatGPTCoachProvider.refreshAuth()` → `authClient.storedAuth(refreshIfNeeded: true)` which reads existing `CodexSelfContainedAuthKeychain` token. No explicit migration needed — the Keychain entry is unchanged. Confirmed by SUMMARY: "existing Keychain token works without any user action (COACH-06)" |
| 6 | Streaming responses work for all supported providers | ✓ VERIFIED (human needed for live confirmation) | All 4 providers implement `send()` returning `AsyncStream<String>` wrapping SSE via `URLSession.bytes(for:)`. Test suite green (`** TEST SUCCEEDED **` per 18-06-SUMMARY). Live confirmation requires API keys |

**Score:** 6/6 truths verified (automated checks pass; human confirmation needed for live streaming)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `GooseSwift/CoachProviderProtocol.swift` | CoachProvider protocol + CoachProviderRegistry | ✓ VERIFIED | 45 lines; protocol + @MainActor @Observable registry with all 4 providers |
| `GooseSwift/CoachChatModel.swift` | @Observable @MainActor coordinator | ✓ VERIFIED | 271 lines; routes send() through registry.activeProvider |
| `GooseSwift/ChatGPTCoachProvider.swift` | ChatGPT conformance | ✓ VERIFIED | 299 lines; full tool-call loop + SSE streaming |
| `GooseSwift/ClaudeCoachProvider.swift` | Claude conformance + Keychain | ✓ VERIFIED | 195 lines; Anthropic Messages API SSE + ClaudeKeychain |
| `GooseSwift/CustomEndpointCoachProvider.swift` | Custom endpoint conformance | ✓ VERIFIED | 243 lines; OpenAI Chat Completions SSE + URL validation + Keychain |
| `GooseSwift/GeminiCoachProvider.swift` | Gemini conformance + OAuth PKCE | ✓ VERIFIED | 319 lines; OAuth PKCE + token refresh + streamGenerateContent SSE |
| `GooseSwift/GeminiOAuthWebView.swift` | WKWebView OAuth interceptor | ✓ VERIFIED | 74 lines; intercepts `gooseswift://` redirect, extracts auth code |
| `GooseSwift/CoachSettingsSheet.swift` | Provider picker UI | ✓ VERIFIED | 459 lines; provider picker + per-provider config views + model preset picker |
| `GooseSwiftTests/CoachProviderTests.swift` | COACH-01 conformance tests | ✓ VERIFIED | 47 lines; iterates all 4 providers, compile-time AsyncStream<String> assertion, no XCTSkip |
| `GooseSwiftTests/ClaudeProviderTests.swift` | Claude Keychain + SSE delta tests | ✓ VERIFIED | Present; real Keychain roundtrip and extractClaudeDelta tests |
| `GooseSwiftTests/CustomEndpointProviderTests.swift` | Custom URL validation + SSE tests | ✓ VERIFIED | Present; URL validation and extractCustomDelta tests |
| `GooseSwiftTests/GeminiProviderTests.swift` | Gemini PKCE + SSE delta tests | ✓ VERIFIED | Present; PKCE helper and extractGeminiDelta tests |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `CoachView` | `CoachSettingsSheet` | `showingSettings` state + `.sheet` | ✓ WIRED | CoachView line 12/49/61/63 — gear icon sets showingSettings=true, sheet renders CoachSettingsSheet |
| `CoachView` | `CoachProviderRegistry` | `@State private var registry` | ✓ WIRED | CoachView line 7/17 — registry created in explicit init, passed to CoachSettingsSheet and CoachChatModel |
| `CoachChatModel.send()` | `registry.activeProvider.send()` | `provider.send(messages:systemPrompt:preset:)` | ✓ WIRED | CoachChatModel line 131 — dispatches to registry.activeProvider |
| `CoachSettingsSheet` | `CoachProviderRegistry.selectProvider(id:)` | `CoachProviderPickerRow.onSelect` | ✓ WIRED | CoachSettingsSheet line 18 — tap triggers selectProvider, persists to UserDefaults |
| `ClaudeConfigView` | `ClaudeCredentialStore.save()` | `saveClaudeKey()` | ✓ WIRED | CoachSettingsSheet line 262 — calls provider.saveAPIKey() which calls ClaudeKeychain.save() |
| `GeminiConfigView` | `GeminiCoachProvider.handleRedirect()` | `GeminiOAuthWebView.onCode` | ✓ WIRED | CoachSettingsSheet line 350/352 — OAuth code triggers handleRedirect → GeminiKeychain.save() |
| `CustomEndpointConfigView` | `CustomEndpointCoachProvider.saveEndpoint()` | `saveCustomEndpoint()` | ✓ WIRED | CoachSettingsSheet line 426/427 — saves baseURL, modelID, and API key |
| `CoachView.onAppear` | `ChatGPTCoachProvider.refreshAuth()` | `chat.refreshAuth()` | ✓ WIRED | CoachView line 89/93 — triggers on appear, reads existing Keychain token (COACH-06) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `CoachSettingsSheet` | `registry.allProviders` | `CoachProviderRegistry.init()` instantiates all 4 providers | Yes — 4 concrete provider instances | ✓ FLOWING |
| `CoachSettingsSheet` | `registry.activeProvider?.isAuthenticated` | Each provider reads Keychain/storedAuth on init | Yes — Keychain reads at init | ✓ FLOWING |
| `CoachChatModel.send()` | `stream` delta text | `provider.send()` → SSE URLSession bytes loop | Yes — real HTTP SSE | ✓ FLOWING (requires API key for live test) |
| `CoachProviderRegistry.activeProvider` | `storedID` from UserDefaults | `UserDefaults.standard.string(forKey: activeProviderDefaultsKey)` | Yes — real UserDefaults | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CoachProvider protocol members accessible | `grep -c "var id\|var displayName\|var isAuthenticated\|var availablePresets\|func send\|func signOut" GooseSwift/CoachProviderProtocol.swift` | 6 | ✓ PASS |
| All 4 providers registered in registry | `grep -c "ChatGPTCoachProvider\|ClaudeCoachProvider\|CustomEndpointCoachProvider\|GeminiCoachProvider" GooseSwift/CoachProviderProtocol.swift` | 4 | ✓ PASS |
| AsyncStream<String> return type in all providers | `grep -rc "AsyncStream<String>" GooseSwift/` | 7 matches across protocol + 4 providers | ✓ PASS |
| No XCTSkip remaining in coach tests | `grep -c "XCTSkip" GooseSwiftTests/CoachProviderTests.swift` | 0 | ✓ PASS |
| Test suite status | Per 18-06-SUMMARY: `** TEST SUCCEEDED **` with zero failures | All tests pass | ✓ PASS |
| ChatGPT sign-in button wired in settings | `grep -A3 "Sign in with ChatGPT" GooseSwift/CoachSettingsSheet.swift` | Empty action body | ⚠ WARNING |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| COACH-01 | 18-01, 18-06 | CoachProvider protocol abstracts the AI provider | ✓ SATISFIED | Protocol in CoachProviderProtocol.swift; conformance tests in CoachProviderTests.swift iterate all 4 providers |
| COACH-02 | 18-02, 18-03, 18-04 | Multiple named accounts per provider stored in Keychain | ✓ SATISFIED (D-03 scope) | Each provider has distinct Keychain service namespace; D-03 locked to one account per provider — intentional scope reduction from original requirement |
| COACH-03 | 18-02, 18-04 | At least one additional provider supported (Claude API by Anthropic) | ✓ SATISFIED | ClaudeCoachProvider + GeminiCoachProvider both implemented |
| COACH-04 | 18-03 | User-configured custom endpoint (OpenAI Chat Completions-compatible) | ✓ SATISFIED | CustomEndpointCoachProvider with HTTPS URL validation, Keychain API key, UserDefaults baseURL/modelID |
| COACH-05 | 18-05 | Provider picker UI in More/Coach settings | ✓ SATISFIED | CoachSettingsSheet opened via gear icon in CoachView; provider picker + per-provider config + model preset picker |
| COACH-06 | 18-01 | Existing single OpenAI key migrated automatically | ✓ SATISFIED | No migration code needed — existing CodexSelfContainedAuthKeychain is read by refreshAuth() on CoachView.onAppear |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `GooseSwift/CoachSettingsSheet.swift` | 186-188 | Empty button action for ChatGPT sign-in | ⚠ Warning | Users tapping "Sign in with ChatGPT" from the settings sheet get no response. Sign-in works via the chat sheet's CoachSignInScreen path only. Not a BLOCKER because the existing flow still works, but the settings sheet is misleading. |

### Human Verification Required

### 1. COACH-06 Migration Smoke Test

**Test:** Cold-launch the app on a device or simulator that has an existing ChatGPT OAuth token in Keychain (from before Phase 18). Open the Coach tab.
**Expected:** ChatGPT is the active provider (shown in nav bar subtitle), the provider row shows "Signed in", no re-authentication required. Send a message and confirm it streams.
**Why human:** Cannot verify Keychain token presence or streaming behavior from static code analysis.

### 2. Claude Streaming End-to-End

**Test:** Open Coach settings → select Claude → enter a valid Anthropic API key (starts with `sk-ant-`) → tap "Save API Key" → close settings → open chat → send a message.
**Expected:** The auth badge updates to "Signed in", the message produces a streaming reply from the Anthropic Messages API (`api.anthropic.com/v1/messages`).
**Why human:** Requires a live Anthropic API key.

### 3. Custom Endpoint Streaming End-to-End

**Test:** Open Coach settings → select Custom → enter a valid HTTPS base URL (e.g. `https://api.openai.com`) + API key + model ID (e.g. `gpt-4o`) → tap "Save Endpoint" → send a message.
**Expected:** The auth badge shows "Signed in", streaming reply arrives from `{baseURL}/v1/chat/completions`.
**Why human:** Requires a live endpoint.

### 4. Gemini OAuth + Streaming

**Test:** Create an OAuth 2.0 Client ID in Google Cloud Console (type: iOS, bundle `com.goose.swift`), enable Generative Language API. Open Coach settings → select Gemini → enter Client ID → tap "Sign in with Google" → complete OAuth in the WKWebView sheet → send a message.
**Expected:** OAuth completes, "Signed in" shows, streaming reply from Google Generative Language API arrives.
**Why human:** Requires Google Cloud credentials (OAuth Client ID). If unavailable, record as "deferred — no Client ID".

### 5. Provider Switching

**Test:** Authenticate two or more providers. Switch between them via the picker. Start a new conversation after each switch. Send the same message.
**Expected:** Each provider answers from its own backend. No API key from one provider is sent to another.
**Why human:** Requires live credentials for multiple providers simultaneously.

### 6. ChatGPT Sign-In Button in Settings Sheet

**Test:** Open Coach settings when ChatGPT is the active provider and not signed in. Tap the "Sign in with ChatGPT" button.
**Expected:** The sign-in flow initiates.
**Actual (from code):** The button action is empty (`{}`). Sign-in only works via the chat sheet (opening the chat when not signed in shows `CoachSignInScreen`).
**Why human:** This is a usability gap — the button is present but non-functional from the settings sheet. Confirm whether this is acceptable or requires a fix.

### 7. UI-SPEC Conformance

**Test:** Compare the rendered CoachSettingsSheet against `18-UI-SPEC.md`.
**Expected:** Provider picker rows, per-provider config forms, model preset picker, and gear icon placement match the approved design.
**Why human:** Visual appearance cannot be verified programmatically.

### Gaps Summary

No blocking gaps. All 6 success criteria pass automated verification. One warning identified:

**ChatGPT sign-in button (settings sheet):** The "Sign in with ChatGPT" button in `CoachSettingsSheet.ChatGPTConfigView` has an empty action body. The sign-in flow works via the existing chat sheet path (`CoachSignInScreen`) but the settings sheet button is non-functional. This is a usability issue — users expect the button to work. The fix is to wire the button to `chat.startOAuthSignIn()` or to dismiss and open the chat sheet.

This does not block phase completion because:
1. The sign-in flow is still accessible via the chat sheet
2. D-05 specifies that per-provider configuration lives in the settings sheet, but the ChatGPT sign-in mechanism (OAuth device flow) was already implemented in `CoachChatModel.startOAuthSignIn()` before Phase 18

Human verification items 1-7 above must be confirmed before marking this phase fully verified.

---

_Verified: 2026-06-06T13:48:00Z_
_Verifier: Claude (gsd-verifier)_
