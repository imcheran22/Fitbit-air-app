# Phase 18: Coach Multi-Provider — Research

**Researched:** 2026-06-06
**Domain:** Swift/SwiftUI multi-provider AI protocol architecture, SSE streaming, Keychain, OAuth 2.0 via WKWebView
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Four providers — ChatGPT (existing OAuth), Claude (Anthropic API key + Keychain), Gemini (Google OAuth 2.0 via WKWebView), Custom (user-configured base URL + API key)
- **D-02:** Auth per provider — ChatGPT: `CodexSelfContainedAuthClient` (unchanged); Claude: API key in Keychain `service: "com.goose.swift.claude"`, `account: "api-key"`; Gemini: OAuth 2.0 via WKWebView, token in Keychain `service: "com.goose.swift.gemini"`, `account: "oauth-token"`; Custom: API key in Keychain `service: "com.goose.swift.custom-endpoint"`, `account: "api-key"`, base URL + model ID in UserDefaults
- **D-03:** One account per provider. No multi-account management. ChatGPT migration automatic (already in Keychain).
- **D-04:** Model presets — ChatGPT: `gpt55Low/Medium/High`; Claude: `claudeOpus48`, `claudeSonnet46`, `claudeHaiku45`; Gemini: `gemini25Pro`, `gemini25Flash`; Custom: single preset using user model ID
- **D-05:** Provider picker in Coach tab via gear icon → `CoachSettingsSheet`
- **D-06:** `CoachProvider` protocol with `send(messages:systemPrompt:preset:) async throws -> AsyncStream<String>` + `signOut()`
- **D-07:** `@Observable final class CoachProviderRegistry` with `activeProvider`, `allProviders`, persists `goose.coach.activeProviderId` in UserDefaults; `OpenAICoachChatModel` → renamed to `CoachChatModel`
- **D-08:** No external dependencies. URLSession only. No Google Sign-In SDK.

### Claude's Discretion

None stated — all decisions are locked.

### Deferred Ideas (OUT OF SCOPE)

None stated.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COACH-01 | `CoachProvider` protocol with `send(messages:systemPrompt:) async throws -> AsyncStream<String>` | D-06 locked; protocol shape and `AsyncStream` pattern documented in §Architecture Patterns |
| COACH-02 | One Keychain credential per provider, namespaced by provider service key (e.g. `com.goose.swift.claude` / `com.goose.swift.custom-endpoint` / `com.goose.swift.gemini`). D-03 locks one-account-per-provider — multi-account support is out of scope. | D-03 locks one account per provider; Keychain pattern from `CodexSelfContainedAuthKeychain` and `RemoteServerKeychain` documented |
| COACH-03 | At least one additional provider supported (Claude API by Anthropic) | Claude Messages API + SSE verified via official docs; model IDs confirmed |
| COACH-04 | User-configured custom endpoint (OpenAI Chat Completions-compatible SSE) | Same SSE pattern as ChatGPT, `data: [DONE]` sentinel; standard OpenAI Chat Completions format documented |
| COACH-05 | Provider picker UI in Coach settings sheet | UI-SPEC approved; gear icon + `CoachSettingsSheet` component inventory documented |
| COACH-06 | Existing single OpenAI key migrated to named account on first launch | D-03: no Keychain migration needed — ChatGPT auth already in `com.goose.swift.codex` Keychain, `CoachProviderRegistry` picks it up automatically via `ChatGPTCoachProvider` wrapping existing `CodexSelfContainedAuthClient` |
</phase_requirements>

---

## Summary

Phase 18 adds a `CoachProvider` protocol that abstracts the AI backend behind a uniform `send(messages:systemPrompt:preset:) async throws -> AsyncStream<String>` interface. The existing `OpenAICoachChatModel` (still `ObservableObject` after Phase 17 deliberately left it out of scope) is refactored into `CoachChatModel` (`@Observable @MainActor`) that delegates to the active provider via `CoachProviderRegistry`. Three new providers join the existing ChatGPT one: `ClaudeCoachProvider` (Anthropic Messages API + API key Keychain), `CustomEndpointCoachProvider` (OpenAI Chat Completions SSE + API key Keychain), and `GeminiCoachProvider` (Google generative language API + OAuth 2.0 via WKWebView).

The SSE streaming pattern is already established in `OpenAIResponsesClient.swift` — `URLSession.bytes(for:)` + `bytes.lines` async iteration + SSE line parsing. Each new provider reuses this pattern with provider-specific event shapes. Claude uses `event: content_block_delta / delta.type == "text_delta"` events; Gemini uses `data:` JSON lines with `candidates[0].content.parts[0].text`; Custom uses OpenAI-compatible `data: {json}` lines with `choices[0].delta.content` and `data: [DONE]` sentinel. All Keychain operations follow the established `SecItemAdd/SecItemCopyMatching` pattern from `CodexEmbeddedAuth.swift` and `RemoteServerPersistence.swift`.

The Gemini OAuth flow is the most novel component — WKWebView presenting `https://accounts.google.com/o/oauth2/v2/auth` with PKCE, intercepting the redirect via `WKNavigationDelegate`, extracting the authorization code, and exchanging it for tokens via `https://oauth2.googleapis.com/token`. CryptoKit (already imported in the project) provides SHA256 for PKCE code challenge generation. A critical prerequisite is that the user must supply a Google Cloud OAuth 2.0 Client ID — this is not bundled in the app and must be entered in the Gemini config panel of `CoachSettingsSheet`.

**Primary recommendation:** Start Wave 1 by converting `OpenAICoachChatModel` → `CoachChatModel` (`@Observable @MainActor`) and introducing `CoachProvider` + `CoachProviderRegistry` before writing any provider implementations. This decouples the UI refactor from the API work and gives each subsequent wave a stable protocol to implement against.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Provider protocol + registry | Model (`CoachChatModel`, `CoachProviderRegistry`) | — | State coordination; providers are owned by the registry |
| ChatGPT streaming | `ChatGPTCoachProvider` (wraps existing `OpenAIResponsesClient`) | — | Existing logic unchanged, isolated behind protocol |
| Claude streaming (SSE) | `ClaudeCoachProvider` | — | API client with URLSession; isolated from UI |
| Gemini streaming (SSE) | `GeminiCoachProvider` | — | API client + OAuth token management |
| Gemini OAuth WKWebView | `GeminiCoachProvider` (presents `GeminiOAuthWebView`) | View layer (SwiftUI sheet) | Auth flow is provider-owned; view is a thin wrapper |
| Custom endpoint streaming | `CustomEndpointCoachProvider` | — | API client with user-configured URL |
| Keychain (API keys, tokens) | Provider-specific Keychain helpers | — | Each provider owns its own Keychain namespace |
| Provider picker UI | `CoachSettingsSheet` (new SwiftUI view) | `CoachView` (presents the sheet) | UI-SPEC approved; gear icon in nav bar |
| Active provider indicator | `CoachView` principal toolbar item | — | Reads `CoachProviderRegistry.activeProvider.displayName` |
| Conversation persistence | `CoachConversationStore` (existing) | `CoachChatModel` | Unchanged; provider-agnostic message storage |
| Tool context injection | `CoachChatModel` (builds `systemPrompt`) | — | `CoachLocalToolContext.build()` result serialised into system prompt for non-ChatGPT providers |

---

## Standard Stack

### Core (all native — no packages)

| Component | Framework | Purpose | Pattern |
|-----------|-----------|---------|---------|
| `@Observable` | Swift Observation (Xcode 26.5 / Swift 6.3.2) | `CoachChatModel`, `CoachProviderRegistry` state | `@MainActor @Observable final class` |
| SSE streaming | Foundation / URLSession | All 4 providers | `URLSession.bytes(for:)` + `bytes.lines` async iteration |
| Keychain | Security framework | API keys + OAuth tokens | `SecItemAdd/CopyMatching/Delete` — existing project pattern |
| WKWebView | WebKit | Gemini OAuth authorization page | `WKNavigationDelegate` intercepts redirect |
| CryptoKit | CryptoKit | PKCE `code_challenge` SHA256 | `SHA256.hash(data:)` — already used in project |
| `URLComponents` | Foundation | Custom endpoint URL validation | `scheme == "https"` check — same as `RemoteServerURLValidator` |
| `String(localized:)` | Foundation | All UI strings | Phase 14 convention |
| XCTest | XCTest | Unit tests in `GooseSwiftTests/` | Existing test target |

### No External Dependencies

Per D-08 and CLAUDE.md: zero `import` statements for third-party libraries. No Google Sign-In SDK, no Anthropic SDK, no package manager additions.

---

## Package Legitimacy Audit

> Not applicable — Phase 18 installs zero external packages. All capabilities use native iOS frameworks (URLSession, Security, WebKit, CryptoKit). No `npm view`, `pip index versions`, or `slopcheck` runs required.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| — | — | — | — | — | — | — |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
User input (CoachComposer)
        │
        ▼
CoachChatModel (@Observable @MainActor)
  ├── builds systemPrompt via CoachLocalToolContext.build()
  ├── appends user message to messages[]
  └── calls registry.activeProvider?.send(messages:systemPrompt:preset:)
              │
              ▼
    ┌─────────────────────────────────────────────┐
    │           CoachProviderRegistry              │
    │  activeProvider: (any CoachProvider)?        │
    │  allProviders: [ChatGPT, Claude, Custom, Gemini] │
    └─────────┬───────────────────────────────────┘
              │ dispatches to active provider
    ┌─────────┼─────────────────────────────┐
    │         │                             │
    ▼         ▼                             ▼
ChatGPT    Claude                        Gemini / Custom
Provider   Provider                      Provider
(OpenAI    (POST /v1/messages            (POST streamGenerateContent
Responses  + SSE content_block_delta)    + SSE candidates[0].content.parts[0].text
API)
    │         │                             │
    └────────►└─────────────────────────────┘
              │
              ▼
    AsyncStream<String>  ─── yielded text deltas ──► CoachChatModel
              │
              ▼
    messages[assistantIndex].text += delta
              │
              ▼
    @Observable publishes change ──► CoachChatScreen re-renders
```

### Recommended File Structure

```
GooseSwift/
├── CoachChatTypes.swift          # MODIFIED: extend CoachModelPreset with new cases
├── CoachChatModel.swift          # NEW: renamed from OpenAICoachChat.swift, @Observable
├── CoachProviderTypes.swift      # NEW: CoachProvider protocol + CoachProviderRegistry
├── ChatGPTCoachProvider.swift    # NEW: wraps existing CodexSelfContainedAuthClient + OpenAIResponsesClient
├── ClaudeCoachProvider.swift     # NEW: Anthropic Messages API + SSE + Keychain
├── ClaudeKeychainStore.swift     # NEW: Keychain helper for Claude API key
├── CustomEndpointCoachProvider.swift  # NEW: OpenAI Chat Completions + Keychain
├── CustomEndpointKeychainStore.swift  # NEW: Keychain helper for custom API key
├── GeminiCoachProvider.swift     # NEW: OAuth WKWebView + streamGenerateContent SSE
├── GeminiKeychainStore.swift     # NEW: Keychain helper for Gemini OAuth token
├── GeminiOAuthWebView.swift      # NEW: WKWebView SwiftUI wrapper + NavigationDelegate
├── CoachSettingsSheet.swift      # NEW: full settings sheet with all subviews
├── CoachView.swift               # MODIFIED: gear icon, @State chat, principal indicator
└── CoachChatScreen.swift         # MODIFIED: chat type from ObservableObject → @Observable
```

Alternative: Keychain helpers can be enums inside each provider file rather than separate files, matching the `CodexSelfContainedAuthKeychain` pattern.

### Pattern 1: CoachProvider Protocol — AsyncStream Wrapping SSE

**What:** Each provider's `send()` returns an `AsyncStream<String>` by wrapping the `URLSession.bytes` SSE loop inside an `AsyncStream` continuation.

**When to use:** All provider implementations. The stream yields text deltas; the caller (`CoachChatModel`) appends them to the assistant message.

```swift
// Source: Design based on existing OpenAIResponsesClient.swift SSE pattern + Swift Concurrency docs
func send(
  messages: [CoachChatMessage],
  systemPrompt: String,
  preset: CoachModelPreset
) async throws -> AsyncStream<String> {
  let request = try buildRequest(messages: messages, systemPrompt: systemPrompt, preset: preset)
  return AsyncStream { continuation in
    Task {
      do {
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode) else {
          continuation.finish()
          return
        }
        for try await line in bytes.lines {
          try Task.checkCancellation()
          if let delta = extractTextDelta(from: line) {
            continuation.yield(delta)
          }
        }
        continuation.finish()
      } catch {
        continuation.finish()
      }
    }
  }
}
```

**Cancellation:** `CoachChatModel` calls `sendTask?.cancel()` which propagates via `Task.checkCancellation()` inside the provider's inner Task.

### Pattern 2: Claude Messages API SSE Event Parsing

**What:** Claude SSE events have `event:` name lines followed by `data:` JSON lines. The text delta is in `data.delta.text` when `data.type == "content_block_delta"` and `data.delta.type == "text_delta"`.

```swift
// Source: Verified at platform.claude.com/docs/en/api/messages-streaming
// SSE line format:
// event: content_block_delta
// data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

private func extractClaudeDelta(from line: String) -> String? {
  guard line.hasPrefix("data:") else { return nil }
  let jsonString = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
  guard let data = jsonString.data(using: .utf8),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        obj["type"] as? String == "content_block_delta",
        let delta = obj["delta"] as? [String: Any],
        delta["type"] as? String == "text_delta",
        let text = delta["text"] as? String else { return nil }
  return text
}
```

### Pattern 3: Gemini streamGenerateContent SSE Parsing

**What:** Gemini SSE events are `data:` JSON lines containing a full `GenerateContentResponse`. Text is nested at `candidates[0].content.parts[0].text`. Stream closes naturally (no `[DONE]` sentinel).

```swift
// Source: Verified at ai.google.dev/api/generate-content + ai.google.dev/gemini-api/docs/text-generation
// Endpoint: POST .../v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse
// Auth: Authorization: Bearer {oauthToken}
// SSE line: data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}

private func extractGeminiDelta(from line: String) -> String? {
  guard line.hasPrefix("data:") else { return nil }
  let jsonString = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
  guard let data = jsonString.data(using: .utf8),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let candidates = obj["candidates"] as? [[String: Any]],
        let first = candidates.first,
        let content = first["content"] as? [String: Any],
        let parts = content["parts"] as? [[String: Any]],
        let text = parts.first?["text"] as? String else { return nil }
  return text
}
```

### Pattern 4: Custom Endpoint (OpenAI Chat Completions) SSE

**What:** Standard OpenAI Chat Completions streaming — `data: {json}` lines, `choices[0].delta.content`, terminates with `data: [DONE]`.

```swift
// Source: OpenAI Chat Completions API spec (standard format used by all compatible providers)
private func extractCustomDelta(from line: String) -> String? {
  guard line.hasPrefix("data:") else { return nil }
  let jsonString = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
  if jsonString == "[DONE]" { return nil }  // signals end-of-stream, handled by loop termination
  guard let data = jsonString.data(using: .utf8),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let choices = obj["choices"] as? [[String: Any]],
        let delta = choices.first?["delta"] as? [String: Any],
        let content = delta["content"] as? String else { return nil }
  return content
}
```

### Pattern 5: Gemini OAuth 2.0 via WKWebView + PKCE

**What:** Presents Google authorization page in a WKWebView, intercepts the redirect to `gooseswift://oauth/gemini`, extracts the authorization code, exchanges it for tokens.

```swift
// Source: developers.google.com/identity/protocols/oauth2/native-app
// Auth endpoint: https://accounts.google.com/o/oauth2/v2/auth
// Token endpoint: https://oauth2.googleapis.com/token
// Redirect URI: gooseswift://oauth/gemini  (already registered in Info.plist URL schemes)
// Scope: https://www.googleapis.com/auth/generative-language

// PKCE code verifier (random 43-128 char base64url string):
let codeVerifier = generateCodeVerifier()  // 43+ random bytes, base64url encoded

// PKCE code challenge (S256):
import CryptoKit
let challengeData = Data(SHA256.hash(data: Data(codeVerifier.utf8)))
let codeChallenge = challengeData.base64EncodedString()
  .replacingOccurrences(of: "+", with: "-")
  .replacingOccurrences(of: "/", with: "_")
  .replacingOccurrences(of: "=", with: "")

// WKNavigationDelegate intercepts redirect:
func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
             decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
  if let url = action.request.url, url.scheme == "gooseswift" {
    decisionHandler(.cancel)
    // Extract code from url.query, complete OAuth flow
  } else {
    decisionHandler(.allow)
  }
}
```

**Critical prerequisite:** Google OAuth requires a `client_id` registered in Google Cloud Console. The user must create a GCP project, enable the Gemini API, and create an OAuth 2.0 Client ID (type: iOS, bundle ID: `com.goose.swift`). This client ID is entered in the Gemini config panel — it is NOT bundled in the app (unlike the ChatGPT `app_EMoamEEZ73f0CkXaXp7hrann` client ID which is embedded).

### Pattern 6: @Observable CoachChatModel (Phase 17 migration applied)

**What:** `OpenAICoachChatModel` (still `ObservableObject` — deliberately left out of Phase 17) is renamed to `CoachChatModel` and converted to `@Observable @MainActor` as part of Wave 1.

```swift
// Pattern: same as GooseAppModel / HealthDataStore (Phase 17)
@MainActor @Observable
final class CoachChatModel {
  private(set) var messages: [CoachChatMessage] = []
  private(set) var streamState: CoachStreamState = .idle
  private(set) var errorMessage: String?
  // ... (no @Published needed with @Observable)
}

// In CoachView — @StateObject → @State:
@State private var chat = CoachChatModel()

// In CoachChatScreen — @ObservedObject → direct parameter (no wrapper):
struct CoachChatScreen: View {
  var chat: CoachChatModel  // @Observable, no wrapper needed
  // if $ binding needed: @Bindable var chat: CoachChatModel
}

// In CoachProfileMenu → replaced by CoachSettingsSheet
```

### Pattern 7: Claude Messages API Request Format

```swift
// Source: Verified at platform.claude.com/docs/en/api/messages-streaming
// Headers: x-api-key, anthropic-version: 2023-06-01, content-type, accept: text/event-stream
// Body:
{
  "model": "claude-opus-4-8",  // or claude-sonnet-4-6, claude-haiku-4-5-20251001
  "max_tokens": 4096,
  "system": "<systemPrompt with CoachLocalToolContext serialised as JSON>",
  "messages": [
    {"role": "user", "content": "user message"},
    {"role": "assistant", "content": "assistant reply"},
    ...
  ],
  "stream": true
}
```

### Pattern 8: Gemini Message Format

```swift
// Source: ai.google.dev/api/generate-content
// Gemini uses "model" role instead of "assistant" for historical turns
// Convert CoachChatMessage.Role.assistant → "model" for Gemini
{
  "systemInstruction": {
    "parts": [{"text": "<systemPrompt>"}]
  },
  "contents": [
    {"role": "user", "parts": [{"text": "user message"}]},
    {"role": "model", "parts": [{"text": "assistant reply"}]},
    ...
  ]
}
```

### Anti-Patterns to Avoid

- **Calling `CoachRustBridge` from `@MainActor` inline**: The anti-pattern established in CLAUDE.md. `CoachChatModel` builds system prompt on main actor using `CoachLocalToolContext.build()` (which is already `@MainActor`) — this is fine. Provider `send()` calls use `URLSession.shared.bytes(for:)` which is async and does not block main thread.
- **Creating a new bridge instance per-request**: Each provider should hold no Rust bridge. Context is serialised into `systemPrompt` string before `send()` is called.
- **Storing API keys in UserDefaults**: API keys go in Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`). Only non-secret config (base URL, model ID, active provider ID) goes in UserDefaults.
- **Using `NSURLSession` `dataTask` instead of `bytes(for:)`**: SSE streaming requires `URLSession.bytes(for:)` + `bytes.lines` (established pattern in `OpenAIResponsesClient`). `dataTask` buffers the entire response.
- **Hardcoding Google OAuth client ID**: The Gemini OAuth `client_id` must be user-supplied (unlike ChatGPT). Bundle it in the app only if this is the user's own personal app with their own GCP project.
- **Using loopback redirect URI for Gemini OAuth**: Google deprecated loopback IP for mobile apps. Use the `gooseswift://` custom URL scheme as redirect URI.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE parsing | Custom byte-by-byte parser | `URLSession.bytes(for:).lines` async sequence | Already validated in `OpenAIResponsesClient`; handles chunking, backpressure |
| Keychain CRUD | Custom NSData wrapper | `SecItemAdd/CopyMatching/Delete` with `kSecClassGenericPassword` | Established pattern in `CodexEmbeddedAuth.swift` + `RemoteServerPersistence.swift` |
| PKCE challenge | Manual base64 | `CryptoKit.SHA256.hash(data:)` + base64url encoding | Already imported; one-liner |
| OAuth redirect interception in WKWebView | URL polling or JS bridge | `WKNavigationDelegate.decidePolicyFor:decisionHandler:` | Standard iOS pattern for OAuth in WKWebView |
| `AsyncStream` error propagation | Custom error channel | `AsyncThrowingStream<String, Error>` | If error needs to propagate through stream; but simpler to `finish()` and throw separately |
| JSON encoding for request bodies | `JSONEncoder` | `JSONSerialization.data(withJSONObject:)` | Providers use mixed-type dicts (`[String: Any]`); matches existing `OpenAIResponsesClient` pattern |

**Key insight:** Every low-level capability in this phase already has a reference implementation in the codebase. The work is protocol composition and API adaptation, not infrastructure.

---

## Runtime State Inventory

> Omit — this is not a rename/refactor/migration phase. The only "migration" is that `CoachProviderRegistry` reads the existing ChatGPT Keychain token via `ChatGPTCoachProvider` wrapping `CodexSelfContainedAuthClient` — no data migration required.

---

## Common Pitfalls

### Pitfall 1: ObservableObject vs @Observable for CoachChatModel

**What goes wrong:** Forgetting that `OpenAICoachChatModel` was deliberately left as `ObservableObject` in Phase 17. If Phase 18 Wave 1 converts it to `@Observable`, all call sites (`CoachView`, `CoachChatScreen`, `CoachProfileMenu`) need updating simultaneously — specifically `@StateObject` → `@State`, `@ObservedObject` → no wrapper, and `@Bindable` where `$` binding is needed.

**Why it happens:** Phase 17 SUMMARY explicitly lists `OpenAICoachChatModel` as out-of-scope.

**How to avoid:** Wave 1 converts the class and all call sites in the same commit. Use `@Bindable var chat: CoachChatModel` in `CoachChatScreen` if `$draft` binding is passed through the chat object; or keep `$draft` as a separate `@State` in `CoachView` (current pattern — preferred).

**Warning signs:** `@Published` remaining in `CoachChatModel`, or `@StateObject` remaining in `CoachView`.

### Pitfall 2: Gemini OAuth client_id is user-supplied, not bundled

**What goes wrong:** Implementing `GeminiCoachProvider` with a hardcoded `client_id` that only works for one Google Cloud project. Other users cannot use the provider.

**Why it happens:** ChatGPT's `client_id` (`app_EMoamEEZ73f0CkXaXp7hrann`) is hardcoded in `CodexEmbeddedAuth.swift` — devs may assume the same pattern.

**How to avoid:** The Gemini config panel in `CoachSettingsSheet` must include a `TextField` for the Google OAuth Client ID. Store it in UserDefaults (`goose.coach.gemini.clientId`). The `GeminiCoachProvider` reads it at sign-in time.

**Warning signs:** Gemini OAuth flow hardcoded to a specific `client_id` string.

### Pitfall 3: Gemini OAuth scope — generative-language vs cloud-platform

**What goes wrong:** Using `https://www.googleapis.com/auth/generative-language.retriever` (semantic retrieval scope) instead of `https://www.googleapis.com/auth/generative-language` (generate content scope), resulting in 403 errors from `streamGenerateContent`.

**Why it happens:** Google OAuth docs show `generative-language.retriever` for the Semantic Retrieval API sample. The CONTEXT.md correctly specifies `generative-language` (without `.retriever`).

**How to avoid:** Use `scope=https://www.googleapis.com/auth/generative-language` exactly as specified in CONTEXT.md D-02. This scope covers `generateContent` and `streamGenerateContent`.

**Warning signs:** 403 responses from Gemini API after successful OAuth token acquisition.

### Pitfall 4: CoachProvider.send() — Tool calls only work for ChatGPT

**What goes wrong:** Expecting Claude/Gemini/Custom to execute local tool calls (like `load_stats`, `get_activities`) via function calling. The Anthropic and Gemini APIs do support tool calling, but the CoachProvider protocol returns `AsyncStream<String>` — no tool call interleaving is possible through this interface.

**Why it happens:** The existing `OpenAICoachChatModel` has a 2-loop tool call flow unique to the ChatGPT backend API (not Chat Completions). The protocol abstracts this away.

**How to avoid:** `CoachChatModel` builds a full `systemPrompt` by serialising `CoachLocalToolContext.build()` as JSON before calling `send()`. Claude/Gemini/Custom receive all local context in the system prompt. ChatGPT continues to use tool calls internally within `ChatGPTCoachProvider` — invisible to the protocol.

**Warning signs:** Claude provider returning empty or generic answers because context was not injected into system prompt.

### Pitfall 5: WKWebView sheet lifecycle — OAuth token not persisted before dismissal

**What goes wrong:** The WKWebView sheet is dismissed by `WKNavigationDelegate` detecting the redirect, but the token exchange (POST to `oauth2.googleapis.com/token`) hasn't completed before the sheet disappears, leaving `isAuthenticated = false`.

**Why it happens:** Intercepting the redirect cancels the WKWebView navigation and triggers sheet dismissal immediately.

**How to avoid:** Do NOT dismiss the sheet in `decidePolicyFor`. Cancel the WKWebView navigation, keep the sheet open, show a `ProgressView`, complete the token exchange asynchronously, save to Keychain, then dismiss the sheet. The `GeminiCoachProvider` should expose `@Observable` state: `isExchangingToken: Bool`.

**Warning signs:** User signs in but is immediately shown "Not signed in" status.

### Pitfall 6: Custom endpoint URL validation — http vs https

**What goes wrong:** Allowing `http://` URLs for custom endpoints (security risk, also App Transport Security blocks non-local HTTP).

**Why it happens:** Users may try to use local dev servers or corporate internal endpoints.

**How to avoid:** Use `RemoteServerURLValidator.validate(_:)` pattern — already validates `https://` for public hostnames, allows `http://` only for RFC 1918 private IPs and `.local`/`localhost`. Apply the same logic to custom endpoint URL validation (or reuse the existing validator).

**Warning signs:** URLSession errors for `http://` external URLs at runtime.

### Pitfall 7: @Observable + @StateObject confusion in CoachView

**What goes wrong:** After converting `CoachChatModel` to `@Observable`, leaving `@StateObject` in `CoachView` causes a compile error in Swift 6 — `@StateObject` requires `ObservableObject`.

**How to avoid:** `@State private var chat = CoachChatModel()` (no `@StateObject`). This is exactly the pattern established by Phase 17 for `GooseAppModel` in `GooseSwiftApp.swift`.

---

## Code Examples

### Claude Messages API — Full Request

```swift
// Source: Verified at platform.claude.com/docs/en/api/messages-streaming (curl example)
var request = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
request.httpMethod = "POST"
request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
request.timeoutInterval = 180

let body: [String: Any] = [
  "model": preset.modelID,           // "claude-opus-4-8" | "claude-sonnet-4-6" | "claude-haiku-4-5-20251001"
  "max_tokens": 4096,
  "system": systemPrompt,
  "stream": true,
  "messages": messages.map { ["role": $0.role.claudeRoleString, "content": $0.text] }
]
request.httpBody = try JSONSerialization.data(withJSONObject: body)
```

### Gemini streamGenerateContent — Full Request

```swift
// Source: Verified at ai.google.dev/api/generate-content
let modelID = preset.geminiModelID   // "gemini-2.5-pro" | "gemini-2.5-flash"
let url = URL(string: "https://generativelanguage.googleapis.com/v1beta/models/\(modelID):streamGenerateContent?alt=sse")!

var request = URLRequest(url: url)
request.httpMethod = "POST"
request.setValue("Bearer \(oauthToken)", forHTTPHeaderField: "Authorization")
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
request.timeoutInterval = 180

let body: [String: Any] = [
  "systemInstruction": ["parts": [["text": systemPrompt]]],
  "contents": messages.map {
    ["role": $0.role.geminiRoleString,   // "user" | "model"
     "parts": [["text": $0.text]]]
  }
]
request.httpBody = try JSONSerialization.data(withJSONObject: body)
```

### Keychain Helper — API Key (Claude / Custom pattern)

```swift
// Source: Pattern from CodexEmbeddedAuth.swift (CodexSelfContainedAuthKeychain) and RemoteServerPersistence.swift
enum ClaudeKeychain {
  private static let service = "com.goose.swift.claude"   // per D-02
  private static let account = "api-key"

  static func save(_ key: String) throws {
    let data = Data(key.utf8)
    let query = baseQuery()
    SecItemDelete(query as CFDictionary)
    var attrs = query
    attrs[kSecValueData as String] = data
    attrs[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(attrs as CFDictionary, nil)
    guard status == errSecSuccess else { throw ClaudeKeychainError.saveFailed(status) }
  }

  static func load() throws -> String? {
    var query = baseQuery()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status != errSecItemNotFound else { return nil }
    guard status == errSecSuccess, let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  static func delete() throws { /* SecItemDelete pattern */ }

  private static func baseQuery() -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword,
     kSecAttrService as String: service,
     kSecAttrAccount as String: account]
  }
}
```

### CoachModelPreset Extension

```swift
// Extend existing enum — adding cases while preserving all existing cases
// Source: CoachChatTypes.swift analysis
extension CoachModelPreset {
  // New cases to add:
  // case claudeOpus48
  // case claudeSonnet46
  // case claudeHaiku45
  // case gemini25Pro
  // case gemini25Flash
  // (custom preset uses a separate mechanism — CoachProvider.availablePresets returns dynamic preset)

  var claudeModelID: String? {
    switch self {
    case .claudeOpus48: return "claude-opus-4-8"         // VERIFIED: platform.claude.com/docs/en/docs/about-claude/models/overview
    case .claudeSonnet46: return "claude-sonnet-4-6"     // VERIFIED: platform.claude.com/docs/en/docs/about-claude/models/overview
    case .claudeHaiku45: return "claude-haiku-4-5-20251001"  // VERIFIED: platform.claude.com/docs/en/docs/about-claude/models/overview
    default: return nil
    }
  }

  var geminiModelID: String? {
    switch self {
    case .gemini25Pro: return "gemini-2.5-pro"    // VERIFIED: ai.google.dev/gemini-api/docs/models
    case .gemini25Flash: return "gemini-2.5-flash" // VERIFIED: ai.google.dev/gemini-api/docs/models
    default: return nil
    }
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ObservableObject` + `@Published` for chat model | `@Observable @MainActor` | Phase 17 established pattern; Phase 18 applies to `CoachChatModel` | Per-property tracking, no `objectWillChange` broadcast |
| Single hardcoded ChatGPT provider | `CoachProvider` protocol + `CoachProviderRegistry` | Phase 18 | UI decoupled from backend; new providers without UI changes |
| Tool call interleaving via ChatGPT Responses API | System prompt context injection for non-ChatGPT providers | Phase 18 | ChatGPT retains tool calls; Claude/Gemini/Custom use serialised context in system prompt |
| `@StateObject` for `ObservableObject` | `@State` for `@Observable` classes | Phase 17 established pattern | Simpler, no wrapper, correct Swift 6 semantics |

**Deprecated/outdated:**
- `OpenAICoachChatModel`: replaced by `CoachChatModel` in Wave 1. File `OpenAICoachChat.swift` → `CoachChatModel.swift`.
- `CoachProfileMenu` (inline menu in CoachView toolbar): replaced by gear icon → `CoachSettingsSheet`. The model picker logic migrates into `CoachSettingsSheet`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Gemini OAuth scope `https://www.googleapis.com/auth/generative-language` covers `streamGenerateContent` | Architecture Patterns §5, Common Pitfalls §3 | 403 errors; switch to `cloud-platform` scope or API key auth instead | [ASSUMED] — CONTEXT.md specifies this scope; Google OAuth docs page visited shows `.retriever` for a different API; full `generative-language` scope is documented in CONTEXT.md but not confirmed via an authoritative Google streaming endpoint doc |
| A2 | Gemini `gemini-2.5-flash` and `gemini-2.5-pro` are stable model IDs (no date suffix needed) | Code Examples, Standard Stack | If preview-only, stable IDs change; wave 4 may ship with wrong model strings | [VERIFIED: ai.google.dev/gemini-api/docs/models] — page confirms dateless stable format |
| A3 | Google OAuth PKCE is required for iOS installed app flow | Architecture Patterns §5 | Without PKCE, Google may reject the auth request | [CITED: developers.google.com/identity/protocols/oauth2/native-app] — PKCE documented as recommended for installed apps |
| A4 | `CoachModelPreset` enum is safe to extend with new cases without breaking existing `rawValue` persistence in UserDefaults | Architecture Patterns §6, Code Examples | If `rawValue` strategy conflicts, old users get wrong preset on upgrade | [VERIFIED: codebase] — enum is `String` rawValue with explicit raw strings, adding new cases is safe |
| A5 | Gemini OAuth `client_id` must be user-supplied (not bundled) | Common Pitfalls §2 | If a shared/bundled client_id is acceptable, UX is simpler | [ASSUMED] — Google's OAuth terms require each app to register its own Client ID; no bundled Gemini client_id exists in the repo |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

> Note: A1 needs validation at Wave 4 execution time. If the Gemini API returns 403 with `generative-language` scope, the fallback is to add `cloud-platform` scope to the OAuth request.

---

## Open Questions (RESOLVED)

1. **Gemini OAuth `client_id` origin**
   - What we know: Google OAuth 2.0 requires a client_id registered in Google Cloud Console. ChatGPT's client_id is bundled (`app_EMoamEEZ73f0CkXaXp7hrann`). Gemini's is not.
   - What's unclear: Should the app prompt the user to enter their Google OAuth Client ID in the settings panel, or is there a shared client_id the developer will register?
   - Recommendation: Wave 5 (`CoachSettingsSheet`) should include a `TextField("Google Client ID", text: $geminiClientID)` in the Gemini config section, stored in UserDefaults `goose.coach.gemini.oauthClientId`. Wave 4 (`GeminiCoachProvider`) reads it. If empty, the sign-in button is disabled.
   - **RESOLVED:** The Gemini `client_id` is user-supplied. Wave 5 `CoachSettingsSheet` exposes a `TextField` bound to UserDefaults key `goose.coach.gemini.oauthClientId`; Wave 4 `GeminiCoachProvider` reads it at sign-in time and disables the sign-in button when empty. Confirmed by CONTEXT.md D-02 and the Key Findings (no bundled Gemini client_id exists).

2. **Tool call context for Claude/Gemini/Custom — system prompt size**
   - What we know: `CoachLocalToolContext.build()` returns a large nested dictionary. Serialised as JSON it can be several kilobytes.
   - What's unclear: Is the full context always injected into the system prompt, or should it be selectively included?
   - Recommendation: Serialise the full context (same data as the tool outputs) into the system prompt. Claude Haiku 4.5 has a 200k token context window — the context JSON is well within limits for all models.
   - **RESOLVED:** Tool calls run only for ChatGPT (internal to `ChatGPTCoachProvider`). Claude/Gemini/Custom never receive interleaved tool calls through the `AsyncStream<String>` protocol; instead they receive the full `CoachLocalToolContext.build()` result serialised as JSON inside the `systemPrompt` parameter of `CoachProvider.send(messages:systemPrompt:preset:)`. The full context is always injected (well within every model's context window per the note above).

3. **`CoachChatModel` send() signature — who builds the system prompt?**
   - What we know: D-06 protocol has `send(messages:systemPrompt:preset:)`. The `CoachChatModel` currently builds contextual prompts using `contextualPrompt(for:)`.
   - What's unclear: The `systemPrompt` parameter is for the static instructions. Should `CoachChatModel` inject the full tool context into `systemPrompt` before calling `send()`, or into the last user message?
   - Recommendation: Pass full tool context serialised as JSON in `systemPrompt`. Provider implementations use this as the `system` (Claude), `systemInstruction` (Gemini), or first `system` role message (Chat Completions).
   - **RESOLVED:** `CoachChatModel.send()` builds the `systemPrompt` (static instructions + `CoachLocalToolContext.build()` serialised as JSON) and calls `registry.activeProvider.send(messages:systemPrompt:preset:)`. The same systemPrompt is passed to every provider; `ChatGPTCoachProvider` additionally wraps it into the ChatGPT tool_choice format internally. The tool context goes in `systemPrompt`, never in the last user message.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode | Build + run | ✓ | 26.5 (17F42) | — |
| Swift | All Swift source | ✓ | 6.3.2 | — |
| URLSession | All provider networking | ✓ | iOS 26 SDK | — |
| Security framework | Keychain | ✓ | iOS 26 SDK | — |
| WebKit / WKWebView | Gemini OAuth | ✓ | iOS 26 SDK | — |
| CryptoKit | PKCE code challenge | ✓ | iOS 26 SDK | — |
| GooseSwiftTests test target | Unit tests | ✓ | XCTest in project | — |

**Missing dependencies with no fallback:** none

**Missing dependencies with fallback:** none

**External service prerequisites (user-supplied, not a build dependency):**
- Anthropic API key (user obtains from console.anthropic.com)
- Google Cloud OAuth Client ID (user creates in Google Cloud Console, enables Gemini API, type: iOS, bundle ID: `com.goose.swift`)
- Custom endpoint URL + API key (user-configured)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | XCTest |
| Config file | `GooseSwiftTests/` target in `GooseSwift.xcodeproj` |
| Quick run command | `xcodebuild test -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing GooseSwiftTests 2>&1 \| grep -E "error\|warning\|PASSED\|FAILED"` |
| Full suite command | `xcodebuild test -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 \| tail -5` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COACH-01 | `CoachProvider` protocol compiles with all 4 conformances | unit (compile-time) | `xcodebuild build` succeeds | ❌ Wave 1 |
| COACH-01 | `AsyncStream<String>` yielded by `send()` emits strings | unit | `GooseSwiftTests/CoachProviderTests.swift` | ❌ Wave 1 |
| COACH-02 | Claude Keychain save/load/delete roundtrip | unit | `GooseSwiftTests/CoachKeychainTests.swift` | ❌ Wave 2 |
| COACH-03 | `ClaudeCoachProvider.send()` SSE delta extraction unit test (mocked response) | unit | `GooseSwiftTests/ClaudeProviderTests.swift` | ❌ Wave 2 |
| COACH-04 | `CustomEndpointCoachProvider` URL validation rejects `http://` external hosts | unit | `GooseSwiftTests/CustomEndpointProviderTests.swift` | ❌ Wave 3 |
| COACH-05 | `CoachSettingsSheet` renders without crash (SwiftUI preview + build) | manual | `xcodebuild build` + preview | ❌ Wave 5 |
| COACH-06 | `CoachProviderRegistry.init()` finds existing ChatGPT auth and sets `activeProvider` | unit | `GooseSwiftTests/CoachProviderRegistryTests.swift` | ❌ Wave 1 |

### Sampling Rate

- **Per task commit:** `xcodebuild build -scheme GooseSwift 2>&1 | grep -c error:` → must be 0
- **Per wave merge:** `xcodebuild test -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16'`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `GooseSwiftTests/CoachProviderTests.swift` — covers COACH-01 (protocol compile + AsyncStream shape)
- [ ] `GooseSwiftTests/CoachKeychainTests.swift` — covers COACH-02 (Claude + Custom Keychain roundtrip)
- [ ] `GooseSwiftTests/ClaudeProviderTests.swift` — covers COACH-03 (SSE delta parsing)
- [ ] `GooseSwiftTests/CustomEndpointProviderTests.swift` — covers COACH-04 (URL validation)
- [ ] `GooseSwiftTests/CoachProviderRegistryTests.swift` — covers COACH-06 (migration detection)

Note: Gemini OAuth and end-to-end streaming tests require network and a real Google OAuth token — **manual-only**. Wave 4 verification is manual: sign in with Google in-app, send a message, confirm streamed response.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) for all credentials; OAuth PKCE for Gemini |
| V3 Session Management | Yes | OAuth token refresh (`oauth2.googleapis.com/token` with `refresh_token`); existing ChatGPT refresh via `CodexSelfContainedAuthClient` |
| V4 Access Control | No | Single-user app, no server-side access control |
| V5 Input Validation | Yes | Custom endpoint URL validated (`https://` required for non-local); API key fields are `SecureField` |
| V6 Cryptography | Yes | PKCE uses CryptoKit SHA256 (never hand-roll); Keychain handles encryption at rest |
| V7 Error Handling | Yes | HTTP errors surfaced as `CoachStreamState.failed`; no raw credentials in error messages |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key in UserDefaults | Information Disclosure | Store in Keychain only; UserDefaults for non-secret config only (URLs, model IDs, provider IDs) |
| MITM on Anthropic/Google API | Tampering | URLSession enforces ATS; `https://` required; no certificate pinning needed (standard TLS is sufficient for API key auth) |
| OAuth CSRF on redirect intercept | Spoofing | PKCE `state` parameter; WKNavigationDelegate checks `url.scheme == "gooseswift"` |
| Custom endpoint injection | Tampering | URL validated: scheme must be `https` for non-local hosts; no script injection via URL |
| OAuth token in memory after signOut | Information Disclosure | `GeminiCoachProvider.signOut()` must delete Keychain entry AND clear in-memory token |

---

## Sources

### Primary (HIGH confidence)

- `platform.claude.com/docs/en/api/messages-streaming` — SSE event types, headers (`x-api-key`, `anthropic-version: 2023-06-01`), cURL example
- `platform.claude.com/docs/en/docs/about-claude/models/overview` — Model IDs confirmed: `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`
- `ai.google.dev/gemini-api/docs/models` — Gemini model IDs: `gemini-2.5-pro`, `gemini-2.5-flash` (stable, no date suffix)
- `ai.google.dev/api/generate-content#v1beta.models.streamGenerateContent` — Gemini SSE format, `candidates[0].content.parts[0].text`
- `developers.google.com/identity/protocols/oauth2/native-app` — Google OAuth authorization endpoint (`accounts.google.com/o/oauth2/v2/auth`), token endpoint (`oauth2.googleapis.com/token`), PKCE, custom URI scheme redirect
- Codebase: `GooseSwift/CodexEmbeddedAuth.swift` — Keychain pattern, OAuth device code flow reference
- Codebase: `GooseSwift/OpenAICoachResponsesClient.swift` — SSE parsing pattern (`URLSession.bytes` + `bytes.lines`)
- Codebase: `GooseSwift/RemoteServerPersistence.swift` — Keychain API key pattern
- Codebase: `.planning/phases/17-observable-migration/17-04-SUMMARY.md` — confirmed `OpenAICoachChatModel` left as `ObservableObject` in Phase 17

### Secondary (MEDIUM confidence)

- `ai.google.dev/gemini-api/docs/text-generation` — Gemini streaming text generation, `?alt=sse` query param
- `ai.google.dev/gemini-api/docs/oauth` — Gemini OAuth scope (page shows `.retriever` for Semantic Retrieval; `generative-language` scope from CONTEXT.md D-02 is used instead)

### Tertiary (LOW confidence / ASSUMED)

- Gemini OAuth scope `generative-language` (without `.retriever`) for `streamGenerateContent` — specified in CONTEXT.md D-02 but not independently confirmed against an authoritative streaming endpoint doc [ASSUMED]
- Google OAuth `client_id` must be user-supplied (not bundled) — inferred from Google OAuth terms and absence of bundled credentials [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — native iOS frameworks, no external packages
- Architecture patterns: HIGH — directly verified against existing codebase + official API docs
- Claude API details: HIGH — verified at official Anthropic docs (model IDs, SSE events, headers)
- Gemini API details: MEDIUM — endpoint and response format verified; OAuth scope LOW
- Gemini OAuth flow: MEDIUM — Google OAuth docs verified; client_id origin ASSUMED
- Pitfalls: HIGH — derived from direct codebase analysis + Phase 17 lessons

**Research date:** 2026-06-06
**Valid until:** 2026-07-06 (stable APIs; Claude model IDs may change with new releases)
