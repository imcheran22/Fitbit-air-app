# Phase 1: Foundation — Design

## Context

This is the first phase of a Whoop/Bezel-style biometrics app. The
long-term product turns wearable data into actionable guidance
(recovery/readiness scoring), correlates it with self-logged habits,
and surfaces insights — but none of that is useful without a reliable
pipe from the wearable to the user's phone first. Phase 1 builds that
pipe, for multiple users, as the foundation the later phases build on.

**Product phases (this doc covers Phase 1 only):**
1. **Foundation** (this doc) — accounts, Fitbit connection, data sync,
   minimal dashboard.
2. **Daily guidance** — recovery/readiness score and recommendation.
3. **Habit tracking** — user-logged behaviors (caffeine, alcohol,
   workouts, sleep timing).
4. **Correlation & insights** — surface patterns between habits and
   biometric trends.

## Goals

- A user can create an account and sign in.
- A user can connect their Fitbit account via OAuth.
- The backend keeps that user's biometric data (HRV, resting heart
  rate, sleep, steps) in sync automatically, without polling waste.
- The mobile app displays the user's synced data.
- The system supports multiple independent users (this is being built
  toward a public product, not a single-user tool).

## Non-Goals

- No recovery/readiness scoring, habit logging, or correlation
  analysis — Phases 2–4.
- No wearables other than Fitbit — later integrations (Oura, Garmin,
  Apple HealthKit) are separate future work, not designed here.
- No monetization/billing.

## Architecture

**Components:**

- **Mobile app** — React Native + Expo, targeting iOS and Android from
  one codebase.
- **Backend API** — Node.js/TypeScript, deployed as a persistent
  container on AWS ECS Fargate (not Lambda — Fitbit webhook receipt
  and background token-refresh jobs need to run reliably without
  cold-start latency or execution-time limits).
- **Database** — AWS RDS Postgres, in the same AWS account/VPC as the
  ECS service for simple networking and IAM-based access control.
- **Sync worker queue** — an in-process job queue (e.g. BullMQ on
  Redis) inside the ECS service, with a capped number of concurrent
  workers per Fitbit-API rate-limit budget. Webhook notifications and
  backfill jobs both enqueue fetch jobs here rather than calling
  Fitbit's API inline, so a burst of webhooks (e.g. many users' Fitbit
  devices syncing overnight around the same time) is smoothed into a
  bounded number of concurrent outbound requests instead of fanning
  out one API call per webhook. This resolves the rate-limit fan-out
  concern directly in the architecture rather than leaving it as an
  open question.

**Why these choices:**

- Node/TypeScript backend shares a language with the React Native
  client (shared types for API payloads) and suits the
  integration-heavy nature of this phase (OAuth token lifecycle,
  webhook handling, rate-limit backoff) better than a data-science
  stack that isn't needed until Phase 4, or a managed BaaS that would
  fight the custom OAuth/webhook logic this phase requires.
- Managed Postgres over self-hosted for backup/scaling without ops
  overhead, while staying relational (users, devices, and biometric
  records are naturally relational at this stage). If `BiometricRecord`
  volume becomes a real scaling problem later, the standard move is
  Postgres + the TimescaleDB extension (or a dedicated time-series
  store like InfluxDB) for that table specifically — not a wholesale
  database migration, since `User` and `FitbitConnection` have no
  time-series access pattern.

## Data Model (high level)

- **User** — id, email, auth provider (Apple/Google), created_at.
- **FitbitConnection** — user_id, encrypted access token, encrypted
  refresh token, token_expires_at, fitbit_user_id, webhook
  subscription id, status (`connected` / `disconnected`).
- **BiometricRecord** — user_id, metric type (HRV, resting_hr, sleep,
  steps), value, recorded_at, synced_at.

Tokens are encrypted at rest (not just relying on DB access control),
since they grant access to a third party's health data API.

**Disconnect/reconnect behavior:** disconnecting Fitbit (whether
user-initiated or due to a revoked token) sets `FitbitConnection.status`
to `disconnected` and stops new writes — existing `BiometricRecord`
rows are never deleted, so historical data survives a disconnect.
Reconnecting re-authorizes the same `FitbitConnection` row and triggers
a backfill (see Data Flow) scoped to the gap between the last
`synced_at` and now, so no manual "catch-up" step is needed.

## Data Flow

1. **Sign-in:** user authenticates via Sign in with Apple or Google →
   backend verifies the provider token and issues a short-lived
   session JWT (15 min access token + longer-lived refresh token,
   consistent with the pattern already used for Fitbit tokens). The
   app silently refreshes the access token using the refresh token;
   signing out revokes the refresh token server-side so it can't be
   replayed.
2. **Connect Fitbit:** user taps "Connect Fitbit" in the app → app
   opens Fitbit's OAuth consent screen → Fitbit redirects back with an
   auth code → backend exchanges it for access/refresh tokens and
   stores them encrypted → backend registers a Fitbit webhook
   subscription for that user's account. Fitbit's subscription API
   requires responding to a one-time GET verification challenge (echoing
   back a verify code) before it will start delivering POST
   notifications — the backend's webhook endpoint must handle both the
   GET challenge and POST notifications. Immediately after
   registering the subscription, the backend enqueues a **backfill
   job** that pulls a fixed historical window (e.g. the last 30 days)
   via Fitbit's API, since webhooks only notify of data going forward
   and the dashboard would otherwise be empty until the next natural
   sync event.
3. **Ongoing sync:** Fitbit pushes a webhook notification when new
   data is available. The notification payload only identifies *what
   changed* (collection type + date, e.g. "sleep data for 2026-09-14
   is ready") — it does not contain the metric values themselves.
   Backend verifies the webhook signature → enqueues a fetch job on
   the sync worker queue → the worker calls Fitbit's API for that
   specific collection/date → writes the result to `BiometricRecord`.
4. **Token refresh:** a scheduled job checks for tokens nearing
   expiry (Fitbit access tokens last ~8 hours) and refreshes them
   proactively, before they're needed by an incoming webhook.
5. **Viewing data:** the mobile app calls `GET /me/biometrics` to
   fetch the current user's synced records and renders them on a
   minimal dashboard.

## Error Handling

- **Webhook signature verification failure:** reject and log; do not
  process the payload. This is a security boundary, not a retry case.
- **Fitbit API rate limit (429):** back off and retry via a queue
  rather than dropping the sync attempt. Rate limits are per-user, so
  one user's backoff must not block others.
- **Token refresh failure (revoked/expired refresh token):** mark the
  `FitbitConnection` as `disconnected` and surface a "reconnect your
  Fitbit" prompt in the app, rather than silently failing sync.
- **Webhook delivery gaps:** since sync relies entirely on webhooks in
  this phase, a missed webhook (e.g. transient backend downtime) means
  that data gap is only closed on the next webhook trigger or manual
  reconnect — there is no polling fallback in Phase 1. This is an
  accepted risk for this phase, revisit if it proves too lossy in
  practice.

## Testing

- **Backend:** unit tests for OAuth token exchange/refresh, webhook
  signature verification, and the webhook GET verification-challenge
  handshake; integration tests against a mocked Fitbit API covering
  auth, initial backfill, ongoing webhook-triggered fetches, and the
  reconnect backfill-gap path.
- **Mobile:** component tests for the sign-in, connect-Fitbit, and
  dashboard screens.
- **Manual/device testing:** iOS-specific behavior verified via
  `vphone-cli` (Lakr233/vphone-cli) for emulated device testing ahead
  of/alongside physical device testing.

## Open Questions / Risks

- No polling fallback means sync reliability depends entirely on
  Fitbit's webhook delivery guarantees — worth monitoring in practice
  and revisiting if data gaps become a problem.
