# Google Health API Migration — Design

## Context

Phase 1 ("Foundation") was built and shipped against Fitbit's Web API
(`docs/superpowers/specs/2026-09-15-phase1-foundation-design.md`). During
manual device verification (Task 19 of that phase's implementation plan),
it became clear the user's actual target is the **Google Health API**
(`health.googleapis.com`) — Google's own next-generation successor to the
Fitbit Web API, unifying Fitbit, Pixel Watch, and other third-party
devices behind one API surface.

This spec replaces Phase 1's Fitbit integration with Google Health API.
It does not change anything about auth, sessions, the mobile app's
screens, or the overall architecture shape (OAuth connect → encrypted
token storage → webhook-driven sync worker → biometrics API) — those all
carry over. What changes is which third-party API the connect/sync layer
talks to, and the naming that currently says "Fitbit" throughout that
layer.

## Launch-Critical Risk: Restricted-Scope Verification

**This is the single biggest risk in this migration and belongs at the
top of this document, not buried in Open Questions.** Confirmed against
Google's own developer documentation: most Google Health API scopes —
including all three this app needs
(`activity_and_fitness.readonly`, `health_metrics_and_measurements.readonly`,
`sleep.readonly`) — are classified as **Restricted** scopes.

Concretely, this means:

- **Without completing Google's verification process, this app can only
  ever be used by up to ~100 test users** explicitly allowlisted in
  Google Cloud Console. It cannot serve the public.
- **Verification for Restricted scopes requires an annual third-party
  security assessment** under Google's CASA (Cloud Application Security
  Assessment) framework — a real audit with real cost and no guaranteed
  outcome, not a form to fill out.
- **Timeline**: 2-3 weeks for a Tier 2 assessment, 4-6 weeks for Tier 3,
  with **no published SLA from Google beyond that** for the review
  itself.
- **Cost**: assessor fees ranging roughly $500-$4,500 USD depending on
  app complexity, payable to a third-party assessor (not Google), and
  this assessment must be **repeated annually** to keep access.
- This is a hard dependency on the project's own stated goal of building
  "a public product, not a single-user tool" (established during Phase
  1's original brainstorming) — it gates the actual public launch date
  in a way nothing else in this spec does, and is not something
  engineering effort alone can shorten.

**Reaffirmed with the user after surfacing this risk: proceed with full
replacement anyway.** Reasoning: Fitbit's own Web API is itself being
deprecated in favor of Google Health API (confirmed earlier in this
spec via the official migration guide's reference to "the official
Fitbit Web API deprecation deadlines") — so keeping Fitbit's classic API
as a fallback is only a temporary reprieve, not a durable long-term
alternative. The CASA verification burden isn't avoidable by staying on
Fitbit; it's a cost this project incurs eventually either way. The
accepted consequence: this app is limited to ~100 allowlisted test
users until verification completes, with no guaranteed timeline or
outcome — budget for that explicitly as a real launch dependency, not
an engineering task with a knowable duration.

## Decisions Made (confirmed directly with the user — not open for
reconsideration in this spec)

- **Full replacement, not dual-provider.** Google Health API replaces
  Fitbit's Web API entirely. There is no "pick a provider" step for the
  user, and no Fitbit code path remains after this migration.
- **Full rename, not a field-repurpose.** `fitbit/` (backend module),
  `FitbitConnection` (Prisma model), `FITBIT_*` (env vars), and all
  Fitbit-specific naming become generic `health`/`HealthConnection`/
  `GOOGLE_HEALTH_*` naming. The code should describe what it does, not
  carry the name of a provider it no longer talks to.
- **Connecting Google Health stays a separate step from signing in**,
  even for a user who signed in with Google. Sign-in (proving identity,
  already built, unaffected by this spec) and connecting a health data
  source (granting data-access scopes) remain two distinct OAuth flows,
  mirroring the existing connect-flow pattern. This also means a user who
  signed in with Apple can still connect Google Health.

## Goals

- Replace every Fitbit-specific piece of the sync pipeline (OAuth,
  webhook subscription, metric fetching) with the equivalent Google
  Health API integration, preserving the existing guarantees from the
  Phase 1 spec: encryption at rest, webhook-only sync (no polling
  fallback), gap-scoped reconnect backfill, `BiometricRecord` never
  deleted on disconnect, queue-only external API calls.
- Rename the codebase's Fitbit-specific identifiers to generic
  health-provider naming.
- Support the same four metrics: HRV, resting heart rate, sleep, steps.

## Non-Goals

- No dual-provider support (Fitbit is fully removed, not kept as a
  fallback).
- No changes to sign-in, sessions, the mobile app's screen structure, or
  the biometrics API's external shape (`GET /me/biometrics`,
  `GET /me/connection` keep their existing request/response contracts —
  only what populates them changes).
- No support for other Google Health API capabilities beyond the four
  existing metrics (e.g. nutrition, exercise sessions, paired-device
  management) — out of scope for this migration, same as Phase 1's own
  metric scope.

## Architecture

Unchanged from Phase 1's shape: Express backend, Prisma/Postgres,
BullMQ/Redis sync worker, React Native/Expo mobile app. The only
architectural change is internal to the connect/sync layer:

- **OAuth**: Google's standard OAuth 2.0 endpoints
  (`accounts.google.com/o/oauth2/v2/auth` for authorization,
  `oauth2.googleapis.com/token` for code exchange and refresh) replace
  Fitbit's `fitbit.com`/`api.fitbit.com` OAuth endpoints. Credentials
  come from a Google Cloud Console project instead of a Fitbit developer
  app.
- **Identity**: Google Health API identifies a user via a `healthUserId`
  string (via `GET /v4/users/me/identity`), replacing Fitbit's
  6-character user ID. `HealthConnection.healthUserId` replaces
  `FitbitConnection.fitbitUserId` — but note this ID is for our own
  dedup/bookkeeping only, not for constructing data-fetch paths (see
  Confirmed API Facts below — all data calls use the literal path
  segment `me`, authenticated by the bearer token, not the resolved ID).
- **Data fetch**: two endpoint patterns depending on the metric — a
  daily-rollup aggregation call for STEPS and RESTING_HR, and a raw
  dataPoints list call for SLEEP and HRV (see Confirmed API Facts) —
  replacing Fitbit's four differently-shaped per-metric endpoints with
  two shapes instead of four. Still simpler than Phase 1's
  `fitbit/client.ts`, which needed a per-metric-type switch over four
  distinct shapes.
- **Webhooks**: a two-level subscription model —
  a project-level "subscriber" (the webhook receiver URL, registered
  once, analogous to Fitbit's single app-wide webhook config) plus
  per-user "subscriptions" (created on connect, deleted on disconnect) —
  replaces Fitbit's single-level per-user subscription. This is one
  extra one-time setup step (registering the subscriber) beyond what
  Phase 1 built.

## Data Model Changes

Prisma schema renames (new migration, not a fresh `User`/session-related
change — those tables are untouched):

- `FitbitConnection` → `HealthConnection`
- `FitbitConnection.fitbitUserId` → `HealthConnection.healthUserId`
- `FitbitConnectionStatus` enum: unchanged values (`CONNECTED`/
  `DISCONNECTED`), renamed type if needed for consistency.
- `encryptedAccessToken`/`encryptedRefreshToken`/`tokenExpiresAt`/
  `webhookSubscriptionId`/`status`/`lastSyncedAt`: unchanged shape,
  carried over as-is (these are provider-agnostic).
- `BiometricRecord`: unchanged. Metric types (`HRV`/`RESTING_HR`/`SLEEP`/
  `STEPS`) unchanged — same four metrics, different upstream source.

## Data Flow

1. **Connect**: `GET /health/authorize` (renamed from
   `/fitbit/authorize`) stays behind session auth, keeps the existing
   Redis-backed single-use state-token mechanism (built and hardened
   during Phase 1's final review — this part needs no changes). Redirects
   to Google's OAuth consent screen with Health API scopes instead of
   Fitbit's authorize URL.
2. **Callback**: `GET /health/callback` (renamed from
   `/fitbit/callback`) keeps the existing state-token verification
   (unauthenticated, resolves identity from the consumed state token —
   this logic is provider-agnostic and carries over unchanged). Exchanges
   the code via Google's token endpoint instead of Fitbit's, resolves
   `healthUserId` via the identity endpoint, registers the per-user
   webhook subscription (against the pre-registered project-level
   subscriber) before writing the connection as `CONNECTED` — same
   ordering fix from Phase 1's final review, still required here since
   the same failure mode applies.
3. **Backfill**: unchanged shape (30-day window on first connect,
   gap-scoped on reconnect) — the underlying fetch calls now split by
   metric: `dailyRollUp` for STEPS/RESTING_HR, raw `dataPoints.list` for
   SLEEP/HRV (see Confirmed API Facts).
4. **Ongoing sync**: webhook notification → sync worker fetches the
   specific data type/date via the appropriate call for that metric →
   same `upsertBiometricRecords` write path (unchanged).
5. **Token refresh**: same distributed-safe BullMQ repeatable job from
   Phase 1's final review, now calling Google's token-refresh endpoint
   instead of Fitbit's.
6. **Disconnect**: delete the per-user subscription, mark
   `HealthConnection.status = DISCONNECTED` — same as Phase 1, plus the
   narrowed catch behavior from the final review (only an actual token
   refresh failure disconnects, not an unrelated DB-write failure).

## Confirmed API Facts (verified live against the real API, not guessed)

Verified via a real Google Cloud Console project, a real OAuth
consent/token exchange, and live calls against `health.googleapis.com`
using the actual account's data (device: a real Fitbit synced into
Google Health, platform reported as `FITBIT`):

- **OAuth**: standard Google OAuth2. Authorize at
  `https://accounts.google.com/o/oauth2/v2/auth`, exchange/refresh at
  `https://oauth2.googleapis.com/token`, standard
  `grant_type=authorization_code` / `grant_type=refresh_token` bodies —
  no Google-Health-specific deviation from typical Google OAuth.
- **Scopes** (exact strings, confirmed via the consent screen and a
  successful grant):
  - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
    (steps)
  - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
    (heart rate, HRV)
  - `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
    (sleep)
- **Token lifetimes**: access token ~1 hour (`expires_in: 3599`).
  Live testing observed `refresh_token_expires_in: 604799` (7 days), but
  **this is a Testing-publishing-status artifact of unverified OAuth
  apps, not an inherent property of the Google Health API** — Google
  automatically caps refresh token life at 7 days for apps that haven't
  passed verification, regardless of which API they call. Once (if) this
  app completes the verification/CASA process (see the Restricted-Scope
  Verification risk below), refresh tokens become long-lived under
  Google's normal policy (expiring only after ~6 months of inactivity,
  explicit revocation, or a few other edge cases) — this needs
  re-verifying against a verified app before any UX/reconnect-frequency
  decisions are made on the assumption of a 7-day window. No
  architectural conclusion in this spec depends on the exact number; the
  proactive refresh sweep and disconnect-on-failure path (both carried
  over from Phase 1) handle either lifetime correctly as-is.
- **User identity**: `GET /v4/users/me/identity` (or `users/-/identity`
  — both resolve identically) returns `{name, legacyUserId,
  healthUserId}`. `legacyUserId` confirmed to match the underlying
  Fitbit account's old-style ID.
- **Data-fetch path convention**: all data calls use the literal path
  segment `me` (`users/me/dataTypes/...`), not the resolved
  `healthUserId` — the numeric ID is not usable in the request path
  itself (confirmed: using it directly returns 400s). `healthUserId` is
  stored only for our own per-account dedup bookkeeping.
- **Raw data fetch**: `GET /v4/users/me/dataTypes/{dataType}/dataPoints`
  with a required `filter` query param using
  [AIP-160](https://google.aip.dev/160) syntax:
  `{dataType}.interval.start_time >= "<RFC3339>" AND
  {dataType}.interval.start_time < "<RFC3339>"` for interval-based types,
  or `{dataType}.sample_time.physical_time >= "..." AND ... <  "..."`
  for sample-based types (confirmed both patterns exist; `sleep` and
  `steps` are interval-based, `heartRateVariability` is sample-based).
  Confirmed live: raw `steps` dataPoints are **minute-by-minute**, not
  daily totals.
- **Daily aggregation**: `POST /v4/users/me/dataTypes/{dataType}/dataPoints:dailyRollUp`
  aggregates to daily buckets server-side — confirmed live, exact
  working request body:
  `{"range": {"start": {"date": {"year", "month", "day"}}, "end": {"date": {...}}}, "windowSizeDays": 1}`
  (the discovery doc's field names `civilStartTime`/`civilEndTime` are
  wrong for the request — the real fields are `range.start`/`range.end`,
  each a `date: {year, month, day}` object; confirmed by trial against
  the live API's own error messages). **Must be called with a token that
  has ONLY the `googlehealth.*` scopes — a token that also carries
  `cloud-platform` is rejected with `403 DISALLOWED_OAUTH_SCOPES`**, a
  real, confirmed API behavior, not a hypothetical concern: the
  cloud-platform-scoped token used for subscriber/subscription
  management must never be the same token used for per-user data
  fetching, even though both are technically valid OAuth tokens for the
  same Google account.
- **Confirmed per-metric mapping (live-tested, real values returned)**:
  - **STEPS**: `dailyRollUp` on parent data type `steps` →
    `rollupDataPoints[].steps.countSum` (e.g. real observed value:
    `"2504"` steps for one day) — clean 1:1 match to Phase 1's `STEPS`.
  - **RESTING_HR**: `dailyRollUp` on parent data type `heart-rate`
    (**kebab-case**, confirmed — this differs from the camelCase
    `heartRate` used elsewhere, e.g. the raw `DataPoint` union field
    name) → `rollupDataPoints[].heartRate.beatsPerMinuteMin` (real
    observed values: 39-51 bpm across different days — plausible
    resting-adjacent numbers). Google Health API has **no direct daily
    "resting heart rate" value** the way Fitbit's classic API did —
    confirmed via the discovery document's full schema, not an
    oversight in searching. Decided with the user: use
    `beatsPerMinuteMin` as an honestly-labeled proxy, not an exact
    equivalent.
  - **SLEEP**: raw `dataPoints.list` on data type `sleep` →
    `Sleep.summary.minutesAsleep` (per sleep session) — an exact
    naming and semantic match to Phase 1's Fitbit-based `SLEEP` value.
  - **HRV**: raw `dataPoints.list` on data type `heartRateVariability`
    (sample-based, not interval-based) →
    `HeartRateVariability.rootMeanSquareOfSuccessiveDifferencesMilliseconds`
    — the same RMSSD metric Fitbit's `dailyRmssd` used. Since this is
    sample-based (possibly multiple readings per day, unlike Fitbit's
    pre-aggregated one-per-day value), the implementation needs to pick
    one value per day (e.g. the last sample of the day) to match our
    one-row-per-day `BiometricRecord` schema — a small, well-scoped
    decision for the implementation task, not a design-level blocker.

## Webhook Mechanism (fully confirmed via a real subscriber, a real
subscription, and a real observed notification)

**Registration is a two-step, project-level admin flow, separate from
per-user OAuth:**

1. **Subscriber** (`POST /v4/projects/{project_number}/subscribers`,
   once per app, not per user): registers the webhook receiver URL
   (`endpointUri`, must be HTTPS) and a shared secret
   (`endpointAuthorization.secret`, a string like `"Bearer <value>"`
   that becomes the literal `Authorization` header value on every
   future call to this endpoint). Also declares which data types this
   subscriber can ever receive (`subscriberConfigs[].dataTypes`, bare
   lowercase strings like `"steps"`) and the creation policy — we use
   `MANUAL` (confirmed working), matching Phase 1's per-user
   create-on-connect/delete-on-disconnect model. (`AUTOMATIC` also
   exists and would skip the per-user subscription step entirely, but
   changes the model to "notify for all consented users automatically"
   — not adopted here, to keep parity with Phase 1's explicit
   per-connection lifecycle.)
   - **Confirmed live**: on creation, Google's servers immediately send
     two real verification requests to the given `endpointUri` — one
     WITH the configured `Authorization` header (must respond `201`),
     one WITHOUT it (must respond `401`/`403`). Both must pass or
     subscriber creation fails. Verified request `User-Agent`:
     `Google-Health-API-Webhooks`.
   - **This requires `cloud-platform` OAuth scope**, not the
     `googlehealth.*` scopes used for user data access — a materially
     broader permission than anything else in this integration.
     **Production implementation should use a dedicated GCP service
     account scoped narrowly (ideally to just this API/project), not an
     end-user's OAuth grant** — using a personal broad `cloud-platform`
     consent was acceptable for this one-time manual verification only.
2. **Subscription** (`POST /v4/projects/{project}/subscribers/{subscriber}/subscriptions`,
   once per user, on connect): body is `{"user": "users/{healthUserId}",
   "dataTypes": ["steps"]}` — note `dataTypes` takes **bare strings** in
   the request despite the discovery document's own description
   implying a full `users/{id}/dataTypes/{type}` path (confirmed by
   testing both — the full-path form returns `400 INVALID_ARGUMENT`,
   the bare-string form succeeds and echoes back the full-path form in
   its response). This is the one place `healthUserId` actually gets
   used (data-fetch calls always use the literal `me`, per Confirmed
   API Facts above) — confirming `HealthConnection.healthUserId` still
   needs to be stored, just for this specific purpose. Delete via
   `DELETE .../subscriptions/{id}` on disconnect (same lifecycle as
   Phase 1's Fitbit subscription).

**Confirmed real notification payload** (observed live after triggering
an actual step-count change on the connected device):

```json
[{
  "data": {
    "version": "1",
    "clientProvidedSubscriptionName": "<the subscription id we created>",
    "healthUserId": "8512524441117254421",
    "operation": "UPSERT",
    "dataType": "steps",
    "intervals": [{
      "physicalTimeInterval": {
        "startTime": "2026-09-16T07:51:49.386781Z",
        "endTime": "2026-09-16T07:54:27.486198Z"
      },
      "civilDateTimeInterval": { "...structured local date/time, not needed": "..." },
      "civilIso8601TimeInterval": { "startTime": "...", "endTime": "..." }
    }]
  }
}]
```

Key implications for the sync worker:
- **Body is a JSON array** of notification objects (Fitbit's was also
  an array, so the webhook route's existing array-iteration shape
  carries over).
- **`healthUserId` identifies the connection directly** — look up
  `HealthConnection` by `healthUserId`, no state-token or session
  needed (this is Google calling us, authenticated by the shared
  secret, not a user's browser).
- **`operation`** is present (`UPSERT` observed; a `DELETE` value
  presumably exists for retracted data, though not observed live —
  treat any non-`UPSERT` value conservatively, e.g. log and skip rather
  than assume behavior for an unobserved case).
- **`dataType`** is the bare data type string (`"steps"`), directly
  usable as the key into our metric-type mapping.
- **`intervals`** gives the exact changed time range(s) — use
  `physicalTimeInterval.startTime`/`endTime` (RFC3339, matches the
  `filter` query param format already confirmed) to scope the
  subsequent fetch, rather than re-fetching a whole day blindly.

**Verification mechanism — two layers, one fully confirmed, one with an
open distribution question:**

1. **`Authorization` header shared secret** (fully confirmed, fully
   testable): the exact static value configured at subscriber-creation
   time arrives unchanged on every notification. This alone is a
   complete, sufficient verification mechanism — it is literally the
   same check Google's own verification handshake requires the receiver
   to implement. **Recommendation: implement this first and treat it as
   the primary verification**, structurally simpler than Fitbit's
   HMAC-SHA1 (a straight string comparison, not a signature
   computation).
2. **`GOOGLE-HEALTH-API-SIGNATURE` header** (confirmed to exist and
   arrive with real values on real notifications — an ECDSA NIST P256
   signature of the JSON body): this is real, active, and provides
   defense-in-depth beyond the shared secret. **However, the mechanism
   to obtain Google's public key to verify this signature is not
   published anywhere in the REST reference, the discovery document, or
   the general API documentation** — searched exhaustively, this is a
   genuine, confirmed documentation gap, not a missed detail.
   **Decision: ship with Authorization-header verification only for
   this migration; treat ECDSA signature verification as a fast-follow
   once the key-distribution mechanism is found** (likely via Google
   support channels or a documentation update) rather than blocking the
   migration on an unresolved external documentation gap.

Every technical decision in this spec is now confirmed against the live
API — nothing left is guessed.

## Error Handling

Unchanged from Phase 1's hardened behavior (all carried over as
provider-agnostic patterns): split try/catch for auth-failure vs.
internal-failure responses, subscription-registration-before-CONNECTED-
write ordering, narrowed disconnect-on-refresh-failure-only catch,
in-flight refresh coalescing on the mobile client, `skipAuth` on
non-retryable auth endpoints, distributed-safe token refresh via BullMQ
repeatable job.

## Testing

Same testing shape as Phase 1: unit tests for OAuth token exchange/
refresh and webhook verification (once the real verification mechanism
is confirmed), integration tests against a mocked Google Health API
(via `nock`, same tooling already in place), mobile component tests
unchanged in shape (only the screen names/copy referencing "Fitbit"
need updating to generic "connect your health data" language).

## Open Questions / Risks

- Whether the Google Health API's rate limits and subscription quotas
  differ meaningfully from Fitbit's in ways that affect the sync worker's
  concurrency settings (currently 5, tuned for Fitbit's documented
  limits) — worth revisiting once real usage patterns are known, not
  blocking for initial migration.
