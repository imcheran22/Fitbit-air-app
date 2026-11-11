---
status: complete
phase: 18-coach-multi-provider
source: [18-VERIFICATION.md]
started: 2026-06-06T13:49:00Z
updated: 2026-06-06T13:49:00Z
---

## Current Test

number: 7
name: UI-SPEC conformance
expected: |
  CoachSettingsSheet rendered UI matches 18-UI-SPEC.md design specification (layout, provider list, gear icon, add/remove controls).
awaiting: complete

## Tests

### 1. COACH-06 Migration Smoke Test

expected: Cold-launch app with existing ChatGPT OAuth token in Keychain. ChatGPT is active provider, shows "Signed in", no re-auth required. Message streams.
result: pass

### 2. Claude Streaming End-to-End

expected: Enter Anthropic API key in Claude config, save, send message. Streaming reply from api.anthropic.com/v1/messages arrives.
result: pass

### 3. Custom Endpoint Streaming End-to-End

expected: Enter HTTPS base URL + API key + model ID in Custom config, save, send message. Streaming reply from {baseURL}/v1/chat/completions arrives.
result: pass

### 4. Gemini OAuth + Streaming

expected: Enter Google Client ID, complete OAuth in WKWebView, send message. Streaming reply from Google Generative Language API arrives. If no Client ID available, record as "deferred".
result: deferred — no Google Client ID available

### 5. Provider Switching

expected: Authenticate two providers, switch between them, each backend responds correctly. No cross-provider credential leakage.
result: pass

### 6. ChatGPT Sign-In Button in Settings Sheet

expected: Tapping "Sign in with ChatGPT" in CoachSettingsSheet initiates the sign-in flow. (Currently: button action is empty — sign-in only works via chat sheet.)
result: accepted — known gap (IN-02), sign-in works via chat sheet

### 7. UI-SPEC Conformance

expected: CoachSettingsSheet rendered UI matches 18-UI-SPEC.md design specification.
result: pass

## Summary

total: 7
passed: 5
issues: 0
pending: 0
skipped: 1
deferred: 1
blocked: 0

## Gaps
