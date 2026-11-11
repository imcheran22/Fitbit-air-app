---
phase: 18
name: "Coach Multi-Provider"
date: 2026-06-05
status: discussed
---

# Phase 18 Context — Coach Multi-Provider

## Domain

Expand the Coach tab from a single hardcoded ChatGPT provider to a multi-provider architecture
supporting Claude (Anthropic), Gemini (Google), and custom OpenAI-compatible endpoints.
A `CoachProvider` protocol abstracts each backend; a provider picker lives in the Coach tab
settings sheet (gear icon).

## Current State

- `OpenAICoachChatModel`: @Observable (after Phase 17) chat model — hardcoded to ChatGPT OAuth
- `OpenAIResponsesClient`: streams from `https://chatgpt.com/backend-api/codex/responses`
- `CodexSelfContainedAuthClient`: OAuth device code flow for ChatGPT; tokens in Keychain
- `CoachModelPreset` enum: `gpt55Low`, `gpt55Medium`, `gpt55High` only
- No `CoachProvider` protocol — provider is implicit in the model
- No multi-account or multi-provider infrastructure

## Decisions

### D-01: Four supported providers

**Locked:**
1. **ChatGPT** — existing OAuth device code flow (unchanged), ChatGPT backend API
2. **Claude** — Anthropic Messages API, API key stored in Keychain
3. **Gemini** — Google AI API, OAuth 2.0 via WKWebView + URLSession (no external SDK)
4. **Custom endpoint** — user-configured base URL + API key + model ID, OpenAI-compatible Chat Completions API

### D-02: Auth approaches per provider

**Locked:**
- ChatGPT: `CodexSelfContainedAuthClient` (OAuth device flow) — unchanged
- Claude: API key in Keychain (`service: "com.goose.swift.claude"`, `account: "api-key"`)
- Gemini: OAuth 2.0 authorization code flow via `WKWebView` — token stored in Keychain (`service: "com.goose.swift.gemini"`, `account: "oauth-token"`)
- Custom: API key in Keychain (`service: "com.goose.swift.custom-endpoint"`, `account: "api-key"`); base URL + model ID in UserDefaults

### D-03: One account per provider

**Locked:** Each provider supports a single active account. No multi-account management.
Existing ChatGPT OAuth auth migrates automatically (already in Keychain under existing service).

### D-04: Model presets per provider

**Locked:**

| Provider | Presets |
|----------|---------|
| ChatGPT | `gpt55Low`, `gpt55Medium`, `gpt55High` (existing) |
| Claude | `claudeOpus48`, `claudeSonnet46`, `claudeHaiku45` |
| Gemini | `gemini25Pro`, `gemini25Flash` |
| Custom | single preset using the model ID entered by the user |

`CoachModelPreset` enum is extended with new cases, keeping existing cases intact.

### D-05: UI placement — Coach tab gear icon → settings sheet

**Locked:** Provider picker lives in a settings sheet opened via a gear/settings icon in the
Coach tab navigation bar. Shows:
- Active provider selector
- Per-provider configuration (API key entry, OAuth sign-in, custom URL/model)
- Model preset picker for the active provider

### D-06: CoachProvider protocol

**Locked:**

```swift
protocol CoachProvider: AnyObject {
  var id: String { get }
  var displayName: String { get }
  var isAuthenticated: Bool { get }
  var availablePresets: [CoachModelPreset] { get }
  func send(
    messages: [CoachChatMessage],
    systemPrompt: String,
    preset: CoachModelPreset
  ) async throws -> AsyncStream<String>
  func signOut()
}
```

### D-07: CoachProviderRegistry

**Locked:** `@Observable final class CoachProviderRegistry` holds:
- `activeProvider: (any CoachProvider)?`
- `allProviders: [any CoachProvider]` (one instance of each)
- Stored active provider ID in UserDefaults (`goose.coach.activeProviderId`)

`OpenAICoachChatModel` is renamed/refactored to `CoachChatModel` and uses
`CoachProviderRegistry.activeProvider` instead of hardcoded ChatGPT client.

### D-08: No external dependencies

**Locked:** All network calls use `URLSession`. Google OAuth flow uses `WKWebView` for the
authorization page (no Google Sign-In SDK). Constraint from CLAUDE.md is maintained.

## Critical Details

### Claude API (Anthropic Messages)

- Endpoint: `POST https://api.anthropic.com/v1/messages`
- Auth: `x-api-key: {key}`, `anthropic-version: 2023-06-01`
- Streaming: SSE with `stream: true`, event types `content_block_delta` (text deltas)
- Model IDs: `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`
- Message format: `[{"role": "user"|"assistant", "content": "..."}]` — same as OpenAI

### Gemini API (Google AI)

- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`
- Auth: OAuth 2.0 Bearer token (`Authorization: Bearer {token}`)
- OAuth scopes: `https://www.googleapis.com/auth/generative-language`
- Streaming: SSE with JSON delta events
- Model IDs: `gemini-2.5-pro`, `gemini-2.5-flash`
- Message format: `contents: [{role, parts: [{text}]}]`

### Custom Endpoint

- Endpoint: `POST {userBaseURL}/v1/chat/completions`
- Auth: `Authorization: Bearer {apiKey}`
- Streaming: OpenAI-compatible SSE (`data: {json}` lines, `data: [DONE]` sentinel)
- Model ID: user-configured string
- Message format: OpenAI Chat Completions standard

### Migration

Existing `OpenAICoachChatModel` logic wraps into `ChatGPTCoachProvider` conforming to
`CoachProvider`. All existing functionality (device code flow, token refresh, tool calls) is
preserved. No Keychain data migration needed.

## Wave Plan

| Wave | Plan | Content |
|------|------|---------|
| 1 | 18-01 | `CoachProvider` protocol + `CoachProviderRegistry` + refactor `CoachChatModel` to use registry |
| 2 | 18-02 | `ClaudeCoachProvider` — Anthropic Messages API + SSE streaming + Keychain |
| 3 | 18-03 | `CustomEndpointCoachProvider` — OpenAI Chat Completions + Keychain + URL validation |
| 4 | 18-04 | `GeminiCoachProvider` — Google OAuth WKWebView + Gemini API SSE streaming |
| 5 | 18-05 | Provider picker UI — Coach settings sheet + model preset picker per provider |
| 6 | 18-06 | Integration, build verification, migration smoke test |

## Canonical Refs

- `GooseSwift/OpenAICoachChat.swift` — refactor target → `CoachChatModel`
- `GooseSwift/OpenAICoachResponsesClient.swift` — wrap into `ChatGPTCoachProvider`
- `GooseSwift/CodexEmbeddedAuth.swift` — OAuth reference implementation for Gemini
- `GooseSwift/CoachChatTypes.swift` — extend `CoachModelPreset`, add `CoachProvider`
- `GooseSwift/CoachChatScreen.swift` — add gear icon for settings sheet

## Success Criteria

1. `CoachProvider` protocol exists with conformances for ChatGPT, Claude, Gemini, Custom
2. User can configure Claude with an Anthropic API key and receive streamed responses in the Coach tab
3. User can configure a custom OpenAI-compatible endpoint and receive streamed responses
4. User can sign into Google and use Gemini in the Coach tab
5. Provider picker UI is accessible via gear icon in Coach tab navigation bar
6. Existing ChatGPT OAuth integration continues to work without any user action
7. Build succeeds with no regressions to existing Coach functionality
