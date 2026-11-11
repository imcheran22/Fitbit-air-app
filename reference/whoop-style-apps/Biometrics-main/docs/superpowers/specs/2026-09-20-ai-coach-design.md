# AI Coach — Design

## Context

This spec covers the **AI Coach** — an LLM-backed conversational layer
that sits *on top of* the Stat Engine, never *instead of* it — Slice 3
of the overall build order. It is one of three sibling specs, split out
of a single combined document that had grown too large to review or
build against as one unit:

- `2026-09-20-stat-engine-design.md` — the Recovery/Sleep Score pipeline
  (Slices 1, 1.5). This document's tool registry (§2) is a read-only
  wrapper over its `DailyScore`/`UserDailyFeatures` tables.
- `2026-09-20-habits-correlation-design.md` — habit logging and
  correlation (Slice 2). This document's `getHabitCorrelations` tool
  wraps its `HabitCorrelation` table directly.
- **This document** — the AI Coach (Slice 3).

Cross-references to the other two docs are by filename and section
number.

## Revision History

- **v1** (this document): split out of the original combined "Phases
  2–4" spec's Part 2 (AI Coach) and the coach-specific piece of Part 3
  (`ChatBubble`/`StreamingText`, coach-message motion), which by that
  document's fourth review round had already fixed the guardrail's
  streaming/reject-and-regenerate contradiction, the number-word
  false-positive problem, and added the data-handling/consent section.
  This split fixes every issue that review round raised against this
  section specifically and that hadn't yet been addressed:
  - The **digit-only guardrail scan** (§4) is reworked to exempt
    numbered-list markers, times, and dates, rather than rejecting any
    reply containing them — the prior design would have regenerated on
    nearly every piece of concrete advice a coach gives.
  - The guardrail is now explicit that it **grounds numeric values, not
    comparative claims** — a reply can state a grounded number while
    getting its direction wrong relative to that number, and §4 now
    says plainly that this is covered by the eval harness (§7), not
    by the guardrail itself, with a `direction` field added to
    `getDailyScore()`'s return shape so the model isn't computing
    "higher or lower than yesterday" itself in the first place.
  - **§3.3 and §3.4's contradiction over `StreamingText`** ("preserves
    the feel of the coach typing" vs. "explicitly not styled to imply
    live generation") is resolved by dropping the word-reveal animation
    in favor of a simple fade-in — honest about the fact that the full
    reply already arrived, with no attempt to imply live generation
    either way.
  - A **latency budget** is added (new — this document's predecessor
    never stated one): tool calls, whole-reply buffering, one possible
    guardrail regenerate, and a possible provider fallback can chain
    into several model round-trips, and this now has a stated timeout
    and fallback behavior rather than an open-ended wait.
- **v2**: corrected three defects in v1's own fixes:
  - **The digit-scan exemption patterns were wrong.** The clock-time
    pattern required `:mm`, so the example the text itself called exempt
    ("wind down by 10pm") would have been rejected; it also exempted a
    bare `7:32`, which is the shape of a *duration* and so let a
    fabricated duration through; and the numeric-date pattern
    `\d{1,2}/\d{1,2}` matched ratios such as "7/10". Exemptions now
    require an explicit am/pm for clock times, allow only month-name and
    ordinal dates, and name ratios and bare `h:mm` values as
    non-exempt.
  - **The timeout fallback could have nothing to compose from.** v1 built
    it from "raw tool results", but a timeout before the model's first
    tool call produces none. Added a server-side **turn preamble**
    (pre-fetch of today's score) that guarantees fallback material and
    saves a model round-trip on the most common question.
  - Fixed a reference to a nonexistent §2.8 (observability is the
    unnumbered "Cross-cutting" section at the end).
- **v3**: closed the remaining review items.
  - **Coach memory is an allowlist, not a free-text store.** v2's
    health-fact filter was a denylist, which fails open on every
    classifier miss. Memory is now written only through a structured
    `proposeMemory` call with a closed category enum; the classifier
    remains as a second layer.
  - **Push notification text is generic**: fixed server-side strings,
    never model-generated and never containing health data, because push
    text appears on the lock screen and passes through the OS push
    provider.
  - Sections renumbered 1–8 so numbering starts at 1 as the Context
    states; cross-references in all three documents were updated.
  - Removed edit-history narration from the body.

## Goals

- An **AI coach** the user can converse with, which is grounded entirely
  in Stat-Engine output and the user's own logged habit correlations —
  never in the model's own arithmetic — with a configurable persona,
  tool-calling architecture, memory, safety rails, and an eval harness.

## Non-Goals

- Computing any score or correlation itself — see
  `2026-09-20-stat-engine-design.md` and
  `2026-09-20-habits-correlation-design.md`. This document's tools are
  strictly read-only wrappers over those two documents' tables.
- Diagnosing or treating anything. Every coach response carries the
  existing "comparison against your own recent readings, not a medical
  assessment" framing from Phase 1, non-negotiably.

## Build Order Dependency

**Slice 3 depends on Slices 1, 1.5 and 2** — its tool registry (§2) is
literally `getDailyScore`/`getHabitCorrelations` from the prior slices.
Building the coach before there's a score or a correlation to ground it
in would leave it nothing grounded to say. It also depends on §5's
data-handling/consent work being resolved before it ships to anyone, not
as a Slice-3-internal task but as a precondition of it.

---

## 1. What the coach is and isn't

The coach is a **grounded explainer and Q&A layer**, not a second scoring
system. It never computes a number — it calls tools that read
`DailyScore`/`UserDailyFeatures` (`2026-09-20-stat-engine-design.md`) and
`HabitCorrelation` (`2026-09-20-habits-correlation-design.md`) and talks
about what's already there. This is the single load-bearing design
decision in this document, and it's a direct extension of the existing
codebase's own stated principle in `metricInsights.ts` ("no external
model call, no fabricated score") — the coach doesn't relax that
principle, it adds a conversational surface *on top of* numbers that
principle still governs.

## 2. Architecture

```
Mobile chat UI
   │  (single request/response — no incremental
   │   streaming; §4 buffers the full reply
   │   server-side before anything is sent back)
   ▼
POST /coach/message  ──▶  Orchestrator
                              │
                    ┌─────────┼─────────────────┐
                    ▼         ▼                  ▼
              System Prompt  Tool Registry   Memory Store
              (persona cfg)  (read-only)     (short+long term)
                    │         │                  │
                    └─────────┴──────────────────┘
                              ▼
                         Model Router
                    ┌─────────┴─────────┐
                    ▼                   ▼
              Fast/cheap model    Larger model
              (single-turn Q&A)   (weekly synthesis,
                                   long-context recall)
                    │                   │
                    └─────────┬─────────┘
                              ▼
                     Safety/Guardrail Layer
                    (pre + post response)
                              ▼
                Sent to client, whole, once validated
```

#### Tool registry (the grounding mechanism)

The model is given exactly these tools, each a thin read-only wrapper
over Stat Engine / correlation tables — no tool can write, and no tool
exposes raw SQL:

- `getDailyScore(date)` → `{recoveryScore, sleepScore, factors[],
  confidence, deltaFromYesterday, direction}` — **`deltaFromYesterday`
  and `direction` are precomputed server-side, not left for the model to
  derive**: the model has no arithmetic of its own that this spec
  trusts, so "why is my score lower today" needs the delta *and* its
  sign/direction handed to it as fields, not derived by the model doing
  `today - yesterday` (or eyeballing which way a number moved) in its
  head and hoping it's right. `direction` is an enum
  (`'higher' | 'lower' | 'unchanged'`) so a comparative claim in a reply
  can itself be grounded, not just the raw numbers around it (see §4).
- `getScoreHistory(metric, days)` → array, for "how has my recovery
  trended this month," from `2026-09-20-stat-engine-design.md`.
- `getHabitCorrelations()` → the significant, pre-vetted correlations
  from `2026-09-20-habits-correlation-design.md` §2 only, each returned
  as **structured fields** — `{habitType, factor, lagDays,
  effectSizePercent, sampleSize, direction}` — not a pre-composed
  sentence, so the coach references them via `{{field}}` templates the
  same as any score value (§4) rather than paraphrasing numbers into
  free prose. The model is never handed raw habit logs to
  eyeball-correlate itself, because that would bypass the significance
  gate entirely and reintroduce exactly the false-pattern risk that
  document's correlation engine was built to prevent.
- `getUserGoals()` → user-set goals (steps target, sleep target, if
  customized from `METRIC_CONFIG` defaults) — the same values
  `sleepDebtRolling14d` (`2026-09-20-stat-engine-design.md` §2 Stage 2)
  is computed against, sourced from one place.

System prompt instructs (and the guardrail layer, §4, enforces
independently of instruction-following) that **any specific quantity in a
response must be a value returned by a tool call in that turn** — the
model doesn't recite a number from its own context/memory of an earlier
tool call without re-fetching, since a score computed yesterday may not
be today's, and it doesn't compute a derived quantity (a delta, a
percentage, a direction) itself — if a derived quantity is needed, the
tool returns it precomputed (see `deltaFromYesterday`/`direction` above).

#### Model routing

Two tiers, chosen per request by the orchestrator, not by the user:

- **Fast tier**: single-turn factual Q&A ("what was my HRV yesterday",
  "why is my score lower today") — low latency, tool-call-heavy, short
  responses.
- **Synthesis tier**: weekly/monthly recap generation, multi-turn
  conversations referencing several weeks of history, anything invoking
  `getHabitCorrelations` across a long window — larger context budget,
  higher latency tolerated, run as a background job (§6) rather than
  inline chat for the weekly recap case specifically.

Provider-agnostic router interface (`CoachModelProvider`) with a primary
provider and a configured fallback — not because multi-provider is
strictly needed at this scale, but because a coach that goes fully silent
on a single provider's outage is a worse failure mode here than in a
typical app (a user checking in on a bad recovery day deserves the app to
degrade gracefully, not 500).

#### Turn preamble (server-side pre-fetch)

Before the first model call of every fast-tier turn, the orchestrator
itself calls `getDailyScore(today)` — `today` being the user's local
civil date under `User.timezone` — and supplies the result to the model
as that turn's tool result. The pre-fetch runs fresh on every turn (it is
never carried over from an earlier turn), so it satisfies the "values
must come from a tool call in this turn" rule like any other tool result
and is valid for `{{field}}` resolution. It serves two purposes:

1. **It guarantees fallback material.** Whatever else goes wrong — a
   provider timeout, two guardrail rejections, a failure before the
   model has made any tool call — the orchestrator already holds today's
   score and can compose an answer without the model.
2. **It removes a model round-trip** from the most common question
   ("how is my recovery today"), which helps the latency budget below.

The fixed, server-composed fallback is a template filled only from the
pre-fetched result, for example: "Your recovery score today is
{{recoveryScore}}, {{direction}} than yesterday. I couldn't put together
a fuller answer just now." followed by the standard disclaimer. Two
degenerate cases are defined so the fallback never has nothing to say:
if no `DailyScore` exists for today yet, the template uses the most
recent one with its date stated; if the pre-fetch itself fails or the
user has no score at all, the fallback is a static message with no
numbers ("I can't reach your data right now — please try again in a
moment.").

#### Latency budget

A worst-case coach turn can chain: one or more tool-call round-trips →
whole-reply buffering (§4, no partial output can be shown early) → a
guardrail rejection → one full regenerate → potentially a provider
fallback on top of that. Left unbounded, this can run to several
sequential model calls with no user-visible feedback in between, which
is a worse experience than a fast, honest failure.

**Adopted**: a **12-second end-to-end budget** for the fast tier
(tool-call-heavy, short-reply case), measured from request receipt to
either a validated reply or a fallback being sent. If the budget is
exceeded at any point in the chain — including mid-regenerate — the
orchestrator stops waiting on the model entirely and returns the
server-composed fallback built from the turn preamble above, logged as a
distinct event (`coach.latency_budget_exceeded`) from a guardrail-
triggered fallback, since a slow provider and a guardrail-failing model
are different problems worth telling apart in
`coach.tool_call`/`coach.guardrail_reject` observability (see
"Cross-cutting: observability" at the end of this document). The
mobile client's own request timeout must be set above this budget so the
fallback is what the user sees, not a network error. The synthesis tier
(weekly recap, run as a background job) has no equivalent user-facing
budget — it isn't blocking a chat response, so a slower, more thorough
generation is an acceptable trade there.

## 3. Persona configuration

A `CoachPersona` config (versioned, same pattern as `ScoreAlgorithmVersion`
in `2026-09-20-stat-engine-design.md`) rather than a single hardcoded
system prompt, because "how blunt should the coach be about a bad
recovery score" is a real product decision worth being able to tune and
A/B without a redeploy:

```ts
interface CoachPersona {
  id: string;
  name: string;              // "Direct", "Encouraging", "Clinical"
  tone: string;               // free-text style guidance, injected into system prompt
  verbosity: 'terse' | 'normal' | 'detailed';
  proactivity: 'reactive-only' | 'daily-checkin' | 'threshold-triggered';
  disallowedTopics: string[]; // always includes medical-diagnosis, medication dosing
}
```

Users pick a persona in Settings (default: "Encouraging, normal,
threshold-triggered"); the system prompt is templated (never
string-concatenated raw user config into the prompt — persona fields are
interpolated into a fixed template with their own escaping, to keep this
a config surface, not a prompt-injection surface for the user's own
account, minor as that particular risk is here).

## 4. Guardrails (independent of prompt instructions)

Prompt instructions are advisory; the guardrail layer is enforced in
code, on both directions:

- **Pre-request**: a lightweight regex/keyword classifier flags messages
  mentioning self-harm, medication dosing, or acute medical symptoms, and
  routes those to a fixed, non-LLM-generated safety response with crisis
  resources, bypassing the model entirely for that turn. **Tuned
  deliberately toward false positives, not precision** — a classifier that
  over-triggers costs an occasional unnecessary "here are some resources"
  on an innocuous message; one that under-triggers costs missing an
  actual crisis message. Given that asymmetry, this is the one place in
  the whole spec where "keep it simple and slightly over-sensitive" beats
  "keep it clever," and the crisis response itself is designed to be easy
  to route past (a visible "that's not why I'm asking" option that
  returns control to normal chat) so over-triggering doesn't trap a user
  in an unwanted safety flow.
- **Post-response — numeric grounding.** A plain regex number scan
  against raw model output (`\d+%`/`\d+\s*(bpm|ms|hours?)` string-matched
  against tool results) is rejected — it breaks on rounding/
  reformatting (452 minutes rendered as "7h 32m" fails to match, a wrong
  number in the same shape as a real one slips through undetected).
  **Adopted instead**: the model states quantities only via `{{field}}`
  references (writes `"Your HRV is {{hrv.value}} ms"`, server resolves
  `{{...}}` against that turn's actual tool results before anything
  reaches the client). Substitution alone only guarantees that *values
  placed in templates* are grounded — it says nothing about a number the
  model writes as ordinary prose instead ("about 8 hours," "2 points
  lower"), so it's paired with a validation pass, not treated as
  sufficient on its own: after resolving every `{{field}}` reference
  against that turn's tool results, scan the *resolved* text for any
  **digit character** falling **outside** a resolved-template span.

  **Digit-scan exemptions.** A bare digit scan with no exemptions would
  regenerate on nearly every ordinary reply, so a small, closed set of
  shapes is exempt. Each is matched as a complete span; a digit inside an
  exempt span is ignored, and digits outside every exempt span are still
  scanned (so "10pm for 8 hours" is rejected because of the "8").
  - A **list marker** at the start of a line: `^\s*\d{1,2}[.)]\s`, e.g.
    "1. Sleep earlier tonight." — the digit is enumerating advice, not
    stating a measured quantity.
  - A **clock time with an explicit meridiem**:
    `\b(1[0-2]|0?[1-9])(:[0-5]\d)?\s?(a\.?m\.?|p\.?m\.?)(?![A-Za-z])`
    (case-insensitive; the trailing lookahead stops "5 amazing" from
    matching as "5 am"), matching "10pm", "10:30 pm", "7 a.m." — the model
    referring to a general time of day in its own advice ("try winding
    down by 10pm"). **A bare `h:mm` with no am/pm is deliberately not
    exempt**: "7:32" is indistinguishable from a duration, and a
    data-derived time must arrive via a `{{field}}` anyway. The system
    prompt instructs advice times to be written with am/pm.
  - A **calendar date** in one of two shapes: a capitalized month name
    followed by a day, `\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|
    Nov|Dec)[a-z]*\.?\s+\d{1,2}(st|nd|rd|th)?\b` ("March 14"), or an
    ordinal, `\b\d{1,2}(st|nd|rd|th)\b` ("the 14th").
    **Numeric slash dates such as `3/14` are deliberately not exempt**: they
    collide with ratios like "7/10" that are exactly the kind of
    fabricated score this scan exists to catch.

  **Explicitly non-exempt, and rejected if outside a template span:** a
  bare count ("3 tips"), any unit-suffixed value ("8 hours", "42ms",
  "62 bpm"), a percentage, a decimal, a ratio ("7/10"), and a bare
  `h:mm` ("7:32"). This keeps the guardrail's actual job — catching a
  fabricated measurement — intact while not tripping on the ordinary
  shape of health-coaching advice. The system prompt still instructs the
  model to always express *measured* quantities as digits or `{{field}}`
  references, never spelled out — a residual risk of a spelled-out
  number slipping past both the instruction and the scan is real and
  stated openly, not solved perfectly (see Open Questions).

  Any non-exempt digit outside a template span means the response is
  discarded and regenerated once with an explicit corrective system
  message; a second failure falls back to a fixed, server-composed
  sentence built from the turn preamble's pre-fetched score (§2 — no
  model involved at all for that turn), logged as a guardrail event. This is strictly a
  **reject-and-regenerate** design, not a strip-and-patch one — no
  partial, edited model output is ever shown.

- **Post-response — claim grounding, not just numeric grounding, stated
  as a scope boundary.** The `{{field}}` + digit-scan mechanism above
  grounds *values* — it does not verify that a *comparative or
  directional claim* the model makes about those values is actually
  true. A reply reading `"your HRV is {{hrv.value}} ms, higher than
  yesterday"` passes the guardrail even if `deltaFromYesterday` is
  negative, because "higher than yesterday" is prose the scan has no way
  to check against the number it's describing. This spec does not claim
  the guardrail catches this class of error — instead, two things
  narrow it: (a) `getDailyScore()`'s `direction` field (§2) gives the
  model a grounded value to reference *for direction itself* (the system
  prompt instructs directional language to come from `{{delta.direction}}`
  or equivalent, the same way a raw number must come from a field, not
  be composed freely), and (b) the eval harness (§7) is the actual
  correctness backstop for whether the model *uses* that field correctly
  rather than composing its own "higher"/"lower" judgment — a dedicated
  eval fixture category checks exactly this failure mode (a reply whose
  directional language contradicts a fetched `direction` value fails the
  eval), since it's not a class of error the runtime guardrail can
  reliably catch without effectively re-implementing a claim-verification
  model of its own.

  **Two mechanical points:**
  - *Streaming.*
    Sentence-level buffering was considered and dropped — if individual
    sentences stream to the client as they each pass validation, then by
    the time a later sentence in the same reply fails, earlier sentences
    are already visible and can't be un-shown, which directly
    contradicts "discarded and regenerated" above. **Adopted instead**:
    the orchestrator buffers the model's *entire* response server-side,
    resolves and validates it as one unit, and only then sends it to the
    client — no token-by-token or sentence-by-sentence SSE from model to
    client at all for coach replies. This is acceptable specifically
    because coach replies are short (a few sentences, per the persona's
    `verbosity` setting) — the perceived-latency cost of full buffering
    is small and bounded by §2's latency budget, and it's the only
    design where "discarded and regenerated" is actually true rather
    than aspirational.
  - *Bad field path.* A `{{field}}` reference to a path that isn't in
    that turn's actual tool results (the model asking for
    `{{hrv.deltaFromLastWeek}}` when no such field exists) is treated
    identically to an unwrapped number — it's not a "close enough,"
    render-something-anyway case. The response is discarded and
    regenerated the same way, logged as a guardrail event distinct from
    the free-number case (`invalid_field_path` vs. `unwrapped_number` —
    a spike in the former specifically flags the model losing track of
    what's actually in the tool registry, a different failure mode worth
    telling apart from it just writing prose numbers).
- Every coach response ends with the same disclaimer framing carried
  from Phase 1's `metricInsights.ts` sentences — not a medical assessment
  — templated in, not left to the model to remember to add.

## 5. Data handling, consent & retention

Slices 1, 1.5 and 2 (the other two documents) keep all health data inside
this app's own database. **The coach changes that materially**: score
values, per-factor z-scores, habit-correlation sentences, and user-goal
data all get sent to a third-party LLM provider as tool results on every
coach turn, and the model-routing fallback (§2) means a second provider
may see the same data on a primary-provider outage. A provider-agnostic
router and a fallback are an engineering pattern, not a privacy answer on
their own — the actual consequence of routing real health data through
either provider needs a stated answer, as a precondition of the coach
shipping to anyone, not an implementation detail inside it:

- **Provider selection is gated on contract terms, not just capability.**
  Before this feature ships to anyone, the chosen primary provider must
  offer a data-processing agreement covering (a) no training on
  submitted data, (b) a bounded retention window for abuse-monitoring
  purposes, after which data is deleted, and (c) confirmation that
  tool-result content (health scores, not just chat text) falls under
  the same terms as prompt/completion content. This is a real
  vendor-selection gate, not a formality — a provider that can't confirm
  these in writing is disqualified for this feature regardless of its
  technical fit.
- **The fallback provider must clear the identical bar**, not a lower
  one. A fallback that's only there for technical resilience but has
  weaker data terms would mean an outage silently downgrades the user's
  privacy along with the app's availability — that's not an acceptable
  trade, so the fallback is disabled (coach shows a plain "temporarily
  unavailable" message) rather than failing over to a provider that
  doesn't meet the same bar.
- **Explicit opt-in gates the coach feature itself**, separate from and
  in addition to whatever general terms-of-service exists. A dedicated
  consent screen, shown before the coach's first use, states plainly what
  data leaves the device on a coach turn (the specific field types above
  — never raw Google Health tokens, never the user's full biometric
  history, only the specific tool-result fields that turn's response
  actually needed) and requires an affirmative action, not a bundled
  checkbox inside a larger flow. A user who declines still gets the
  other two documents' features in full — the coach is additive, never a
  gate on the rest of the app.
- **`CoachMemory` is an allowlist, not a free-text store.** The model
  can propose a memory only through a structured `proposeMemory({category,
  value})` call, where `category` is one of a closed enum —
  `TRAINING_GOAL`, `SCHEDULE`, `PREFERENCE` — and `value` is a short
  string (at most 140 characters). Anything that does not fit a category
  is not stored, so a health or medical fact ("I'm on medication X",
  "dealing with a knee injury") has no category to land in and is never
  persisted, however the user phrases it. As a second layer, the same
  lightweight classifier as the crisis check in §4 runs over `value` and
  blocks any entry matching a medical/health-fact pattern, in case a
  health fact is disguised as a goal or preference. The allowlist is the
  primary control because a denylist fails open — every classifier miss
  would persist a sensitive fact into future prompts — whereas an
  allowlist fails closed. The coach can still discuss what the user said
  *in that conversation* (it is in the chat transcript, which follows the
  retention terms below); it just never becomes a persisted,
  resurfaced-in-future-prompts fact.
- **Google's own data-use terms need their own check, separate from the
  LLM vendor's.** Everything above covers what the LLM provider may do
  with data sent to it — it says nothing about whether Google Health
  API's own terms permit this app to *derive* data from a user's Google
  Health grant and pass that derived data to a third-party LLM in the
  first place. The Google Health migration spec's own Restricted-Scope
  Verification risk section already establishes that this app's Google
  Health scopes are under CASA review scrutiny — sending derived health
  data (score values, factor breakdowns) onward to another third party is
  exactly the kind of data flow a security/terms review would ask about,
  and this spec doesn't get to assume the answer is yes. **Required
  before this feature ships, alongside the LLM vendor check above**: read
  Google Health API's terms of service and data-use policy specifically
  for downstream-sharing restrictions on derived data, not just the
  restricted-scope access question the migration spec already covered.
- **This app's own retention isn't specified either.** Chat transcripts
  and `CoachMemory` entries live in this app's own database once
  written, and nothing in this spec says how long they're kept or what
  happens to them when a user deletes their account. **Adopted**: coach
  chat transcripts and `CoachMemory` are deleted as part of the same
  account deletion flow (`DELETE /me`), which removes every row a user owns
  (their `User`, `HealthConnection` and `BiometricRecord` rows included).
  Short of full deletion, chat transcripts are retained for a
  bounded window (proposed: 90 days, matching a reasonable abuse-
  monitoring need) and then hard-deleted on a scheduled job, not kept
  indefinitely by default.

## 6. Memory

- **Short-term**: the current conversation's turns, windowed.
- **Long-term**: a `CoachMemory` table — not a vector store scraping raw
  chat transcripts. Columns: `id`, `userId`, `category` (the closed enum
  in §5), `value` (≤ 140 characters), `status`, `createdAt`,
  `confirmedAt`. The model proposes entries via `proposeMemory` (§5);
  an entry is written as `status: PENDING` and surfaced inline in the
  same reply ("I'll remember that — let me know if that's not right").
  The §5 allowlist and classifier run before anything below applies.
  The entry flips to `status: CONFIRMED` automatically if the user's next
  message doesn't correct or dismiss **that entry** — an unrelated negative
  word elsewhere in the message is not a correction — with no separate
  confirm button required. A deletion by this rule is never silent: the
  reply says so (see Implementation Status). It is fully visible and editable at any time in
  Settings → Coach Memory, where a `PENDING` entry is marked as such and
  any entry can be edited or deleted outright. This is deliberately
  closer to "assume yes unless corrected, but always show your work" than
  to a friction-heavy explicit-consent flow, because the allowlist
  already restricts memory to the low-stakes categories. Surfaced back
  into future system prompts as a bulleted "what I know about you" block
  (confirmed entries only), capped at N most-recent to bound prompt
  size.
- **Weekly synthesis**: this is the Synthesis tier's one scheduled use
  (§2 names the tier; this is that job's spec, not a separate
  mechanism) — run as a scheduled background job, not live chat: once a
  week, generate a recap referencing `getScoreHistory` +
  `getHabitCorrelations` over the trailing 7 days, written to a
  `CoachDigest` row, gated entirely by the persona's `proactivity`
  setting, and announced with a push notification.
- **Push notification content is generic.** The push title and body are
  fixed strings chosen from a small server-side set ("Your weekly recap
  is ready", "You have a new insight") — never model-generated, and never
  containing a score, factor, habit name or any number — because push
  text is visible on the lock screen and passes through the OS push
  provider (APNs/FCM), a further third party this spec does not want
  holding health data. The digest itself is fetched in-app after the user
  opens it. Any proactive (`threshold-triggered` or `daily-checkin`) nudge
  follows the same rule.

## 7. Eval harness

Because "does the coach ever hallucinate a number, or get a direction
wrong" is exactly the kind of regression that's invisible until a user
catches it: a fixture set of (user data snapshot, question) pairs with
expected tool-call sequences and expected-value-presence checks, run
against every persona/prompt change before it ships — not a full RL
pipeline, but a real CI-gated eval suite, versioned alongside
`ScoreAlgorithmVersion` and `CoachPersona` configs so a prompt change and
its eval results are one reviewable unit. **Two fixture categories added
here**, both new: (a) fixtures for the digit-scan exemptions in §4 in both
directions — replies containing list markers, am/pm times, month-name
dates and ordinals that must pass, and replies containing ratios
("7/10"), bare `h:mm` durations ("7:32") and bare counts that must be
rejected — to guard against regressing either way; (b) a fixture whose grounded
`direction` field is deliberately set opposite to what a naive reading
of the raw numbers would suggest, to catch the model asserting a
directional claim that contradicts the grounded field rather than
quoting it (§4's claim-grounding scope boundary).

## 8. Component: `ChatBubble` + `StreamingText`

Coach message rendering. Per §4, the client never receives a coach
reply incrementally — the whole, already-validated response arrives in
one payload, not over SSE.

**`StreamingText` is a simple fade-in, not a word-by-word reveal.** The
reply has already fully arrived, so a typing-style animation would only
add cosmetic latency and imply live generation that isn't happening;
there is no honest version of "looks like typing but isn't claiming to be
typing." The full text renders behind a single fixed-duration opacity
fade (from the `MOTION` object, `2026-09-20-stat-engine-design.md` §4 —
the same token object the Stat Engine's score-transition animation uses,
no separate motion system for this component). It signals "a new message
arrived" without implying anything about *how* it arrived, and needs no
per-word timing or animation-frame loop.

## Testing

- The eval harness (§7) as the primary correctness gate, including the
  two fixture categories above.
- Integration tests mocking the model provider entirely, against the
  guardrail layer's reject-and-regenerate path. Each is its own
  assertion, since a regression in the exemption logic in either
  direction (too strict or too permissive) is a real failure mode:
  - **must reject**: a bare count ("3 tips"), a unit-suffixed value
    ("8 hours", "42ms"), a percentage, a ratio ("7/10"), a bare `h:mm`
    duration ("7:32"), a digit that merely resembles an exempt span
    ("5 amazing tips"), a digit adjacent to an exempt span ("10pm for 8
    hours"), and a `{{field}}` reference to a nonexistent path (logged as
    the distinct `invalid_field_path` event);
  - **must accept**: a line-start list marker ("1. Sleep earlier"),
    "10pm", "10:30 pm", "March 14", "the 14th", and a fully
    `{{field}}`-resolved sentence.
- **Turn preamble and fallback**:
  - the pre-fetch runs on every fast-tier turn and its result is valid
    for `{{field}}` resolution;
  - a timeout that fires before the model makes any tool call returns
    the fallback composed from the pre-fetched score, with no further
    model call, and logs `coach.latency_budget_exceeded`;
  - the same holds when the budget expires mid-regenerate;
  - two consecutive guardrail rejections return the same fallback and
    log a guardrail event instead;
  - a missing `DailyScore` for today uses the most recent score with its
    date stated; a failed pre-fetch or a user with no score returns the
    static no-numbers message, and that message contains no digits.
- **Memory allowlist**: a `proposeMemory` call with a category outside
  the enum is rejected; a `value` over 140 characters is rejected; a
  health-shaped `value` inside an allowed category is blocked by the
  classifier; a health fact stated in chat produces no `CoachMemory`
  row; a proposed entry is `PENDING`, becomes `CONFIRMED` on an
  uncorrected next message, and stays editable and deletable.
- **Push content**: the digest push payload is always one of the fixed
  strings, contains no digits, and no code path interpolates model output
  or health values into it.
- Component snapshot test for `StreamingText`'s fade-in.

## Open Questions / Risks

- The AI coach's model-routing/fallback (§2) adds a second LLM provider
  dependency the rest of this codebase doesn't otherwise have — worth
  confirming actual need (vs. a single provider with a clear outage
  message) once real usage/cost data exists. **This is also gated on
  §5**: a fallback provider only ships if it clears the same
  data-retention bar as the primary, which may mean no acceptable
  fallback exists at all — a real possible outcome, not just an
  implementation detail to sort out later.
- **No LLM provider has actually been confirmed against §5's retention/
  no-training/tool-result-coverage requirements yet** — this spec
  describes the gate, not a cleared vendor. This feature cannot ship
  until this is resolved concretely (a named provider, a signed/
  confirmed data processing agreement), not just designed around
  abstractly.
- The `{{field}}` guardrail (§4) requires structured/tool-based output
  from the model provider to resolve template references — worth
  confirming this capability against whichever provider clears §5's
  bar before that provider choice is finalized, since the two
  requirements (data terms, structured-output support) narrow the
  provider field independently and the intersection may be small.
- The digit-scan exemptions (§4) are deliberately narrow, but they
  still trade some recall for precision — worth measuring in practice,
  once this feature has real usage, whether an ungrounded quantity is
  ever written in an exempt shape (an invented "March 14", or a wrong
  time with a meridiem attached), since that determines whether the
  exemption list needs narrowing further or the eval harness needs a
  dedicated fixture category for it.
- The claim-grounding scope boundary (§4) relies on the eval harness
  as the only backstop for directional-claim correctness — worth
  revisiting whether a stricter runtime check (e.g. requiring
  directional language to originate from a `{{delta.direction}}`
  template span specifically, the same enforcement mechanism as numeric
  grounding) is worth the added false-positive risk once real usage data
  exists.
- Google Health API's own terms on downstream-sharing derived data with
  a third-party LLM (§5) haven't been read yet as part of this spec —
  this is a required precondition for this feature, not a nice-to-have,
  and sits alongside the migration spec's existing CASA/Restricted-Scope
  review as a second, separate compliance question this app now has to
  answer.
- Account deletion (`DELETE /me`) is implemented, but its Google-side steps
  (deleting the webhook subscription and revoking the OAuth grant) are
  best-effort and have only been tested against mocks, never against
  Google's real endpoints.
- The 12-second latency budget (§2) is a starting number, not measured
  against real provider latency for this app's actual tool-call pattern
  — worth revisiting once a provider is chosen (§5) and real latency
  data exists.

---

## Cross-cutting: observability

**Scoped to this feature only, not the other two documents.** Rejected:
OpenTelemetry spans across the Stat Engine and correlation engine from
day one. Neither `package.json` currently has an OpenTelemetry
dependency, and for those two documents' slices, it isn't needed: their
correctness signals — `DailyScore.confidenceLevel`, the per-day
imputation count, `ScoreInputFlag.OUTLIER` records, `HabitCorrelation`
rows — are already persisted, queryable rows, not events that need a
tracing pipeline to see. Introducing OTel for those slices would be new
infrastructure solving a problem the existing schema already solves by
just being a database.

**Where it earns its place is here**, and specifically because a
tool-calling LLM orchestrator with a reject-and-regenerate guardrail
(§4) *can* silently produce a wrong answer without throwing an error in
a way the other two documents' slices structurally can't (there's no LLM
in the loop before this feature). From this feature on: each coach turn
emits a span (`coach.tool_call`, `coach.guardrail_reject`) tagged with
`userId`, `personaId`, and, on a guardrail event, which failure it was
(`unwrapped_number` vs. `invalid_field_path`, per §4) and whether the
regenerate-once retry succeeded or fell back to the canned response, plus
`coach.latency_budget_exceeded` (§2) as a distinct event from a
guardrail-triggered fallback. Not for performance monitoring primarily —
for **correctness monitoring**: a spike in `coach.guardrail_reject`
events, split by reason, is the signal that a prompt or persona change
started producing unwrapped numbers or bad field references again, well
before a user complaint would surface it.

## Implementation Status

The coach is implemented (backend and mobile) but **must not ship to
anyone**: it is dark by default and the gates in §5 are unresolved.

- `COACH_ENABLED` defaults to false. When false, `GET /me/coach/status`
  returns `enabled:false` and every other `/me/coach/*` route (and the
  memory/digest/push-token routes) returns 404 `coach_disabled`; the mobile
  UI renders nothing coach-related.
- Consent is enforced server-side and versioned; a stale version returns
  409. `CoachConsent` has an extra `revokedAt` column: revoke stamps it
  instead of deleting the row, for an audit trail.
- **No LLM provider exists.** There is no LLM SDK dependency and no network
  call anywhere in the coach. `CoachModelProvider` has two implementations:
  `UnconfiguredProvider` (always throws, so a turn falls back to the
  server-composed fallback) and a `ScriptedProvider` used only by tests and
  the eval harness. No fallback provider is built (§5). With the shipped
  provider, weekly digests are the deterministic server-composed fallback.
- **Still unresolved, and blocking any release:** a named provider with
  written no-training / bounded-retention / tool-result-coverage terms; the
  Google Health API downstream-sharing terms review; and confirming the chosen
  provider supports structured/tool output for `{{field}}` references.

Decisions made in implementation:
- Telemetry goes through a pluggable `CoachTelemetry` with a logger sink
  that never includes text; OpenTelemetry is not a dependency. Two events
  were added beyond the spec: `coach.turn_fallback` and
  `coach.safety_classifier`.
- The synthesis tier has a 60-second safety cap for inline requests (the
  spec gave it no budget). The turn preamble runs on both tiers. A failed
  preamble still tries the model; the fallback is then the static message.
- `getDailyScore` compares against the literal previous day, so
  `deltaFromYesterday` and `direction` are null when yesterday has no
  score. Extra tool fields: `sleepDeltaFromYesterday`, `sleepDirection`,
  `habitLabel`. A `{{ref}}` reads the most recent call of that tool within
  the turn.
- The disclaimer is appended to every reply, including the safety reply.
- `proposeMemory` only validates; the row is written `PENDING` after the
  reply passes the grounding guardrail, so a discarded, timed-out or failed
  turn leaves no row. The server appends the fixed "I'll remember that…"
  line only when a row was actually created.
- **Memory feedback is judged per entry, and errs toward confirming.**
  `classifyMemoryFeedback(message, entryValue)` dismisses (deletes) a
  pending entry only for (1) an explicit memory-directed request ("forget
  that", "remove it", "don't remember that", "that's not right / wrong /
  a mistake", "never mind that") or (2) a correction cue ("no", "not",
  "actually", "instead", "meant", "wrong", "change"…) in a message that
  also shares a content word with that entry's own value (stop-words
  removed, light stemming). Everything else confirms. So "why is my score
  not higher" or "no problem, thanks" leaves an unrelated entry alone, and
  with several pending entries each is judged independently. The bias is
  deliberately toward confirming: a wrongly-kept memory is visible in
  Settings and editable, whereas a wrongly-deleted one would be silent. The
  known cost is a missed correction that shares no word with the entry
  ("wrong goal, it is a 10k" does not delete "training for a half-marathon");
  the user can still edit or delete it in Settings. An empty message
  confirms. A crisis turn leaves entries PENDING.
- **Deletion by the detector is announced.** When it removes an entry the
  server appends a fixed line ("Okay — I've removed that from what I
  remember.") after validation, before the "I'll remember that…" line and
  the disclaimer, only when a row was actually deleted, and also on
  fallback and expired turns.
- Memory, digest and push-token routes need the flag but not consent,
  because nothing is sent to a model; a user can always see and delete
  their data. Retention runs even when the flag is off, so transcripts keep
  expiring.
- Digest data is pre-fetched under the names `recoveryHistory`,
  `sleepHistory` and `getHabitCorrelations`. A user with no data gets no
  digest. The push payload is always a fixed string from a small set and
  contains no digits. `NoopPushSender` is the default; `ExpoPushSender`
  is selected with `PUSH_PROVIDER=expo`.
- **Push is built end to end but has never been delivered to a device.**
  Mobile has a "Weekly recap notifications" switch that requests permission,
  obtains an Expo push token and registers it (`POST /me/push-token`); the
  backend sends through Expo's push service, refuses any text that is not one
  of the fixed generic strings for that payload kind, masks tokens in logs,
  and deletes a token Expo reports as `DeviceNotRegistered`. Real delivery
  needs three things nobody has done: a paid Apple Developer team, an EAS
  `projectId` in `extra.eas.projectId`, and a native rebuild with
  `EXPO_PUSH=1 npx expo prebuild --platform ios`. The `expo-notifications`
  config plugin is deliberately **off by default** (`app.config.js`) because
  it adds the `aps-environment` entitlement, which Xcode will not sign on a
  free personal team. Without it the switch reports that notifications are
  unavailable in that build and everything else works. It is also moot until
  the provider gate in §5 is resolved, since no digest is generated unless
  the coach is enabled and consented.
- **Account deletion** (`DELETE /me`, body `{"confirm":"DELETE"}`) deletes
  the user and every row they own in one transaction, after best-effort
  deletion of the Google webhook subscription and revocation of the OAuth
  grant (neither blocks). One ordered `USER_OWNED_MODELS` list drives it, and a
  test introspects the Prisma schema so a future table with a `userId` cannot
  outlive its user. `requireAuth` now reads the user on every request, so a
  deleted account's still-valid JWT is rejected.
- The eval harness (`backend/evals/coach/`, `npm run eval:coach`, also run
  under jest) has 35 fixtures plus 4 deliberately wrong directional replies
  that it must catch.
- **Mobile entry (redesign, `2026-09-21-app-redesign-design.md`):** the coach is now
  the centre tab of the floating bar. The hub orb is **always drawn**, dim and
  paused when the coach is disabled or its status is unknown, and opens the Coach
  tab's existing "unavailable" state. Every other entry point (digest card, "Ask
  about this") is still hidden unless `coachEntryRoute(status)` is non-null.
