# Phase 19: pt-PT Localisation Completion (Coach + Startup Fixes) - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Translate all 132 real-text strings currently missing pt-PT translation in `GooseSwift/Localizable.xcstrings`
and confirm the 3 startup fixes already shipped (overnight recovery moved to background thread,
`defaultDatabasePath` caching, "Saltar configuração" skip button) are working (build gate).

The xcstrings infrastructure already exists from Phase 14. This phase adds translations only — no
new Swift files, no new xcstrings catalog, no new dynamic string infrastructure.

**Not in scope:** New UI features, dynamic string infrastructure changes, translations for other
languages, performance optimisations, or any Coach provider behaviour changes.

</domain>

<decisions>
## Implementation Decisions

### D-01: Scope — translate all missing strings

**Locked:** Translate ALL 132 non-trivial strings missing pt-PT, regardless of which phase
introduced them. The origin (Phase 14 gap, Phase 16-18 new strings) does not matter — the
goal is zero real-text strings without pt-PT at the end of the phase.

Trivial format-only strings (pure `%@`, `%lld`, empty, single digits) may be left without
pt-PT — they have no human-readable text to translate.

Current count: 132 non-trivial strings missing pt-PT out of 754 total (597 already translated).

### D-02: AI provider/model names stay in English

**Locked:** Product and version names are NOT translated:
- `Claude Sonnet 4.6`, `Claude Opus 4.8`, `Claude Haiku 4.5` → no pt-PT entry (stays in English)
- `GPT-5.5 High`, `GPT-5.5 Low`, `GPT-5.5 Medium` → no pt-PT entry
- `Gemini 2.5 Pro`, `Gemini 2.5 Flash` → no pt-PT entry
- `Google Client ID` → no pt-PT entry (technical label)

These are brand names and version identifiers. Convention: do not translate.

### D-03: 1 single plan

**Locked:** Phase 19 is implemented as a single plan (no waves). The xcstrings infrastructure
is already in place from Phase 14. All work is adding `pt-PT` localizations to existing string
entries in the JSON-structured xcstrings file.

The plan also includes a gate confirming the 3 already-shipped startup fixes (see D-05).

### D-04: Verification gate — xcodebuild passes

**Locked:** The verification criterion for translations is:
1. `xcodebuild` build succeeds with no errors
2. Python scan confirms 0 non-trivial strings remain without pt-PT

No simulator language-switch manual test is required for the translation gate.

### D-05: Startup fixes gate — xcodebuild passes

**Locked:** The 3 startup fixes were already shipped in prior commits:
1. `fix: don't restore onboardingComplete from Keychain on fresh install` (commit `d1876b9`)
2. Overnight recovery moved to background thread (prevents main-thread file I/O block)
3. `defaultDatabasePath` caching (avoids repeated file I/O on startup)
4. Skip button added to onboarding footer (`feat: add skip button`) (commit `ab8e90e`)

Verification gate: `xcodebuild` passes. No additional runtime testing required.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Localisation infrastructure (Phase 14)
- `GooseSwift/Localizable.xcstrings` — the String Catalog; all translations go here as `pt-PT` localizations
- `.planning/phases/14-pt-pt-localisation/14-01-PLAN.md` — how pt-PT was registered in the project
- `.planning/phases/14-pt-pt-localisation/14-04-PLAN.md` — LocalizedStatusStrings.swift pattern (dynamic strings)

### Phase 18 new strings (primary source of untranslated strings)
- `GooseSwift/CoachSettingsSheet.swift` — Coach settings UI added in Phase 18; source of most missing strings
- `.planning/phases/18-coach-multi-provider/18-CONTEXT.md` — provider decisions (D-01 through D-08)
- `.planning/phases/18-coach-multi-provider/18-05-PLAN.md` — Wave 5: provider picker UI (string sources)

### Startup fixes (already shipped)
- `GooseSwift/GooseAppModel.swift` — overnight recovery background dispatch
- `GooseSwift/HealthDataStore.swift` — `defaultDatabasePath` caching
- `GooseSwift/OnboardingModels.swift` — onboardingComplete Keychain restore fix
- `GooseSwift/OnboardingPermissions.swift` — skip button implementation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GooseSwift/Localizable.xcstrings`: JSON-structured String Catalog. Add `pt-PT` localizations
  by adding a `"pt-PT"` key under each string's `localizations` dict. No Swift code changes needed.
- Python script pattern (used in this discussion session): count strings missing pt-PT via json.load;
  the same script can be run as a verification step after translation.

### Established Patterns
- Phase 14 Wave 2/3 pattern: open xcstrings, identify untranslated strings by group (tab labels,
  health families, More tab, onboarding), add pt-PT string values.
- String format: `{ "localizations": { "pt-PT": { "stringUnit": { "state": "translated", "value": "..." } } } }`
- Phase 14 Wave 4 pattern: `LocalizedStatusStrings.swift` extension for dynamic `@Published` strings
  that cannot use `String(localized:)` directly. Check if new Phase 18 strings need this pattern.

### Integration Points
- `GooseSwift/CoachSettingsSheet.swift` — main new file from Phase 18; contains Coach settings UI
  strings that need pt-PT
- `GooseSwift/LocalizedStatusStrings.swift` — existing dynamic string extension; may need additions
  if any Phase 18 dynamic strings are missing

### Known String Groups Missing pt-PT
From xcstrings audit (2026-06-06):
- **Coach / Provider config (~40 strings):** API Key, Base URL, Anthropic API key, Bearer token (API key),
  Coach Settings, Coach settings, Configuration, Provider, Model ID, Enter an API key first, Key saved,
  No key saved, Save API Key, Remove API Key, Remove Key, Save Endpoint, Sign in with ChatGPT,
  Sign in with Google, Not signed in, Signed in, Signing in..., Sign Out?, You will need to sign in
  again..., Select a provider above to get started., Generation stopped, Filters, Change, Calibrate
- **Health / General UI (~90 strings):** Add Sleep, No Sleep Timeline, Cardio Load descriptions,
  Metric families, Open Activity, Band sync, No Weekly Load, Stages, Wake, Period, Primary sleep,
  Energy Bank descriptions, Sleep Insights, Workout Details, etc.

</code_context>

<specifics>
## Specific Ideas

- **Translation reference:** pt-PT translations in Phase 14 set the tone — formal but accessible
  Portuguese (e.g., "Dispositivo" not "Device", "Configurações" not "Settigs"). Maintain same register.
- **No simulator test required** — user chose build-green as the sole verification gate.
- **D-02 exception logic:** When a string key is a pure brand name or model version (e.g., `Claude Sonnet 4.6`),
  leave it without a pt-PT localization — the OS will fall back to the source string (English).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 19-pt-pt-localisation-completion*
*Context gathered: 2026-06-06*
