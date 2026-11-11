# Biometrics

A Whoop/Bezel-style personal health app with a social building experience. Wearable data (steps, resting heart rate, sleep, HRV) is synced from a Fitbit through the **Google Health API** into a Node backend. The backend turns it into daily **Recovery** and **Sleep** scores, finds **habit ↔ biometric patterns**, and serves an **AI coach** that runs on a **local LLM (Ollama)** by default, so health data never leaves the machine (an opt-in hosted engine, Claude, is available per user with its own consent). A React Native (Expo) app presents all of it.

🎬 **[Watch the demo](docs/media/redesign-demo.mp4)** (64 s): Home, Score detail, Metrics against your usual range, Forecast, Patterns, Coach, Activity and Profile in dark mode, then again in light. (Recorded before the companion characters replaced the orb.)

<table>
  <tr>
    <td><img src="docs/media/home-dark.jpg" width="190" alt="Home: Recovery hero ring, Sleep and Ask Coach tiles, Tomorrow forecast"></td>
    <td><img src="docs/media/hrv-dark.jpg" width="190" alt="HRV detail drawn against the usual range"></td>
    <td><img src="docs/media/forecast-dark.jpg" width="190" alt="Tomorrow's forecast with what-if levers"></td>
    <td><img src="docs/media/coach-dark.jpg" width="190" alt="AI Coach with starter questions"></td>
  </tr>
  <tr>
    <td><img src="docs/media/profile-dark.jpg" width="190" alt="Profile as grouped rows"></td>
    <td><img src="docs/media/home-light.jpg" width="190" alt="Home in light mode"></td>
    <td><img src="docs/media/profile-light.jpg" width="190" alt="Profile in light mode"></td>
    <td></td>
  </tr>
</table>

<sub>(These screens predate the companion characters.)</sub>

<table>
  <tr>
    <td><img src="docs/media/coach-mochi.png" width="150" alt="Mochi, squishy rice cake"></td>
    <td><img src="docs/media/coach-boba.png" width="150" alt="Boba, bubble tea"></td>
    <td><img src="docs/media/coach-sprout.png" width="150" alt="Sprout, potted seedling"></td>
    <td><img src="docs/media/coach-avo.png" width="150" alt="Avo, avocado half"></td>
    <td><img src="docs/media/coach-peep.png" width="150" alt="Peep, baby chick"></td>
  </tr>
  <tr>
    <td><img src="docs/media/coach-bun.png" width="150" alt="Bun, bunny"></td>
    <td><img src="docs/media/coach-kit.png" width="150" alt="Kit, ginger cat"></td>
    <td><img src="docs/media/coach-axo.png" width="150" alt="Axo, axolotl"></td>
    <td><img src="docs/media/coach-boo.png" width="150" alt="Boo, friendly ghost"></td>
    <td><img src="docs/media/coach-cap.png" width="150" alt="Cap, mushroom"></td>
  </tr>
  <tr>
    <td><img src="docs/media/coach-jelly.png" width="150" alt="Jelly, jellyfish"></td>
    <td><img src="docs/media/coach-pengu.png" width="150" alt="Pengu, penguin"></td>
    <td><img src="docs/media/coach-luna.png" width="150" alt="Luna, sleepy moon"></td>
    <td><img src="docs/media/coach-gloop.png" width="150" alt="Gloop, slime drop"></td>
    <td><img src="docs/media/coach-bao.png" width="150" alt="Bao, panda"></td>
  </tr>
</table>

📋 **[Migration status report](https://claude.ai/artifact/FuYPXc1v8PM4WSqJdtn2kY)**: what shipped in the Fitbit → Google Health API migration, the 8 real bugs only live device testing found, and what's left before a public launch.

---

## Where we are (October 2026)

Every feature goes through the same steps:
1. a mockup on a design canvas, iterated with the owner;
2. a written spec;
3. a task-by-task plan;
4. a subagent-driven build, with a review after each task, a final whole-branch review and one fix wave;
5. a device walkthrough;
6. a PR.

The designs are versioned in [`docs/design/`](docs/design/README.md), and the specs and plans in `docs/superpowers/`.

**Shipped (on `main`):**

| PR | Feature |
|---|---|
| #44–#47 | Sleep on the Activity tab, the tab and chat bar redesign, pixel coaches |
| #48, #50 | Sleep depth (stage lanes, cycles, bedtime goal); recaps and sharing |
| #51, #52 | Achievements and badges; Buddies |
| #53, #54, #56 | Social S1 (stories, check-ins), S2 Campfire, S3 Chats |
| #55, #57, #58 | The shadcn button standard (no pills) and the A4 type system |
| #59 | **Recovery page**: weather hero, last 7 days, sleep-debt and streak bento, month calendar, tomorrow's forecast |

**Built, not merged:**

- **One Sleep page** (`feature/sleep-page`). Every sleep screen is merged into one page with:
  - a moon hero and a 7-night picker;
  - the night inline (stages, cycles, moments, naps);
  - bedtime-to-wake, regularity and a month heatmap.

  The night's "usual" now counts main sleep only. All reviews are clean, and backend and mobile tests pass. The PR is
  held until the Home redesign decides where the Recaps shelf goes.

**In design:**

- **KIP, the app's own mascot.** The design is final:
  - a basic pixel block with GROUNDED lighting and pose-only arms;
  - 22 animal skins for later;
  - version 1 is the default KIP in coral, with 10 colours to choose from.
- **Home redesign.** Direction **F** is approved: a pixel scene with your KIP and your buddies' KIPs, and a tappable
  cottage (bed = Sleep, sky = Recovery, mailbox = Recaps, calendar = Tomorrow). The scene changes with today's recovery
  weather: bright with flowers on clear days, stormy on low ones, starry at night.
- **Settings, Activity and the Profile ID card.** Mockups are up (Settings S1 or the S2 category hub; Activity A-1 or
  A-2; ID-1 to ID-3) and await the owner's picks.

**Next steps, in order:**

1. Pick the Settings, Activity and ID-card directions.
2. **KIP character system**, as its own spec, plan and build: the in-app sprite engine, the per-user colour on the
   account, the Profile colour picker, and buddies seeing your colour.
3. **Home F**, built on KIP: the scene layers, the weather states and the tappable cottage. The Recaps shelf placement
   from Home then unblocks the Sleep PR.
4. Settings, Activity and the ID card, using the picked directions.
5. Later roadmap: invites and outfits (D), group challenges (E), Apple Health (F).

**Open decisions:**
- The Sleep page bands on the rounded score, while Recovery bands on the one-decimal score. They should be made the
  same.
- Two small Sleep follow-ups are listed in the [handoff](https://github.com/tusharcora/Biometrics/blob/feature/sleep-page/docs/superpowers/handoff/2026-10-10-sleep-home-kip-handoff.md)
  on `feature/sleep-page`.

---

## Contents

0. [Where we are](#where-we-are-october-2026)
1. [System at a glance](#1-system-at-a-glance)
2. [End-to-end data flow](#2-end-to-end-data-flow)
3. [Repository layout](#3-repository-layout)
4. [Backend architecture](#4-backend-architecture)
5. [Data model](#5-data-model)
6. [Scoring engine (Recovery & Sleep)](#6-scoring-engine-recovery--sleep)
7. [Habits & correlation engine](#7-habits--correlation-engine)
8. [AI coach](#8-ai-coach)
9. [Models used](#9-models-used)
10. [Mobile app](#10-mobile-app)
11. [Technology stack](#11-technology-stack)
12. [External providers & services](#12-external-providers--services)
13. [Security & privacy](#13-security--privacy)
14. [Configuration](#14-configuration)
15. [Running locally](#15-running-locally)
16. [Testing & evaluation](#16-testing--evaluation)
17. [Operations scripts](#17-operations-scripts)
18. [Status & known limitations](#18-status--known-limitations)
19. [Design docs](#19-design-docs)

---

## 1. System at a glance

<p align="center"><img src="docs/diagrams/system-overview.png" alt="System overview: the Expo app talks to the Express backend over REST and SSE; Google Health webhooks and OAuth feed the backend; BullMQ workers on Redis run sync, the stat engine and the habit engine into PostgreSQL; the coach pipeline calls local Ollama by default or Claude when the user opts in; Expo push and Resend handle notifications."></p>

<sub>Diagrams are generated from Python with <a href="https://github.com/mingrammer/diagrams">mingrammer/diagrams</a>; sources and how to re-render them are in <a href="docs/diagrams/"><code>docs/diagrams/</code></a>.</sub>

| Layer | What it is |
|---|---|
| **Mobile** | Expo SDK 57 / React Native 0.86 / React 19 app with a dark-first design, a floating tab bar and fifteen selectable pixel-art coaches (drawn with Skia). Needs a development build; Expo Go is not supported. |
| **API** | Express 5 + TypeScript, [Better Auth](https://better-auth.com) sessions, Prisma 6 on PostgreSQL. |
| **Background work** | BullMQ on Redis: the `health-sync` queue runs every sync, scoring, habit, coach-digest and retention job, with repeatable schedules; the coach's day summaries run on their own `coach-summary` queue. |
| **Analytics** | A pure, versioned **stat engine** (per-user EWMA baselines → z-scores → logistic composite) and a **habit correlation engine** (de-seasonalised Pearson r with effective-n correction and Benjamini–Hochberg FDR). |
| **AI coach** | Facts first, one pass: the question is routed, a compact fact sheet is built from the user's data, one streamed model call writes the reply (plus an optional answer card), and every sentence is validated against the fact sheet before it is shown. Local Ollama by default; hosted Claude is opt-in per user. |

## 2. End-to-end data flow

<p align="center"><img src="docs/diagrams/sync-pipeline.png" alt="Sync and scoring: Fitbit syncs to the Google Health API, whose change notifications hit /webhooks/health; jobs on the health-sync queue fetch and backfill into BiometricRecord and SleepSession; computeDailyScore runs the five-stage stat engine (clean, features, baseline, composite, explain) into DailyScore; scheduled sweeps run scoring, weekly habit correlations, the coach digest and retention; scored days queue a coach day summary."></p>

1. **Sign in.** Auth is **Better Auth**, mounted at `/auth/*`. The app signs in with an Apple identity token or a Google ID token (Better Auth's social ID-token sign-in verifies it), or with **email + password**: new accounts must confirm their email before the first sign-in, and "Forgot password" sends a reset link. Each sign-in method is an `Account` row on one `User`. A new method whose **verified** email matches a verified user is linked to that user; an unverified sign-up never attaches to an existing account. A successful sign-in creates a database-backed **30-day sliding session** (`Session` table, extended at most once a day while in use). The session cookie is kept in `expo-secure-store` and sent on every request.
2. **Connect Google Health.** `GET /health/authorize` mints a single-use OAuth `state` (Redis, 10-minute TTL) and returns the consent URL, which the app opens in the system browser. Google redirects to `GET /health/callback`, and the backend:
   - exchanges the code for tokens, encrypting both with **AES-256-GCM** before storing them;
   - resolves the user's `healthUserId`;
   - registers a **per-user webhook subscription** with a GCP service account;
   - enqueues a 30-day `backfill` of all four metrics and a 365-day **steps-history** backfill for the heat map;
   - deep-links back to the app with `biometrics://health/callback?status=connected`.
3. **Ongoing sync.** Google POSTs change notifications to `/webhooks/health`, verified with a constant-time `Authorization` comparison. Each notified interval becomes a `fetch` job, and the worker pulls just that day from `health.googleapis.com/v4`. Every job gets one in-line token refresh on a 401; a second 401 marks the connection `DISCONNECTED`. A repeatable **token-refresh sweep** (every 10 min) keeps access tokens fresh.
4. **Storage.** Each metric is stored as one `BiometricRecord` per civil day. Sleep is kept as whole `SleepSession` rows, and the daily SLEEP value is a derived rollup keyed by the local date of each session's end. The rollup is recomputed under a per-user Postgres advisory lock.
5. **Scoring.** New HRV, resting-HR or sleep data triggers a debounced (5-minute) `computeDailyScore`. The stat engine cleans outliers, builds baselines, computes features and z-scores, and writes Recovery and Sleep scores with a per-factor explanation and a confidence level. A nightly sweep at 03:30 back-fills anything missed or scored by an older algorithm version.
6. **Habits.** You log alcohol, caffeine, workouts or custom habits, or check in "nothing today". Every Monday at 05:00 the correlation engine tests each habit against next-day biometric factors and promotes patterns that pass two weeks running.
7. **Coach.** `POST /me/coach/message` answers one question:
   - a crisis classifier screens the message first;
   - the question is routed (`today`, `sleep`, `trends` or `general`) and a fact sheet is built for that route;
   - one streamed model call writes the reply, optionally followed by an answer card and a memory proposal;
   - each sentence is checked against the fact sheet as it completes and streamed to the app over SSE; a sentence with an invented number is dropped, and an answer with nothing valid is retried once, then shown as an error card.

   After each sync the day's summary sentence is written for the Coach page, and a weekly digest job writes a recap (validated the same way) and sends a generic push notification.
8. **App.** Home shows the score cards and habit log. Activity shows the steps heat map. Metrics shows per-metric trend cards and Patterns. Coach is today's summary and the chat with your companion character. Profile holds settings.

## 3. Repository layout

```
backend/                 Express API, BullMQ worker, stat engine, habit engine, AI coach
  src/
    auth/                Better Auth config (Apple, Google, email + password, sessions), requireAuth
    email/               verification / reset emails (Resend, or the console in development)
    health/              Google Health OAuth, API client, webhooks, service-account subscriptions
    sync/                BullMQ queue + worker, backfills, token-refresh sweep
    biometrics/          record storage, sleep rollups, civil-date/timezone helpers, /me/activity
    scoring/             stat engine (clean → features → baseline → composite → explain), configs v1–v3
    habits/              habit logging, observed-day rules, correlation stats, lifecycle
    coach/               answer pipeline (answer/), model providers, engine + consent, personas, memory, digest, day summary, push, retention
      model/             provider interface: Unconfigured, ScriptedStream (tests), Ollama, Anthropic
    users/               timezone, goals, account deletion
    crypto/              AES-256-GCM token cipher
  prisma/                schema.prisma + 17 migrations
  evals/coach/           coach eval harness (scripted + real local model)
  scripts/               ops scripts (backtest, resync, subscriber registration, …)
  tests/                 113 Jest suites against a real Postgres + Redis
mobile/                  Expo (React Native) app
  src/
    screens/             Dashboard, Activity, Metrics, Coach, Settings, ScoreDetail, MetricDetail, Patterns, …
    navigation/          root stack + bottom tabs + custom FloatingTabBar
    characters/          CharacterProvider (current character, coach status, recovery band), moods
    components/          pixel coaches (Skia), heat map, prompt bar, habit log, digest card, ui/ primitives
    api/                 fetch client that sends the session cookie; typed endpoints
    lib/                 pure logic: heatmap layout, metric trends, score insights, timezone, push
    theme/, theme.ts     dark-first tokens (mirrors global.css), metric config, motion tokens
  plugins/               iOS scene-delegate config plugin (iOS 27 SDK)
  __tests__/             134 Jest test files (jest-expo + Testing Library)
docs/diagrams/           architecture diagrams: Python sources (mingrammer/diagrams) + rendered PNGs
docs/superpowers/        design specs, implementation plans, research notes
```

## 4. Backend architecture

### Process model
`src/server.ts` binds the HTTP port first. Only after `listen` succeeds does it start the BullMQ worker, register the schedulers and install the graceful-shutdown handler. That handler drains HTTP → worker → queue → Redis → Prisma within 15 s. A second backend started on a taken port exits instead of running a second set of workers.

### REST API
Every `/me/*` route requires a valid Better Auth session (`requireAuth` looks it up in the database). Sessions are deleted with their user, so a deleted account's session stops working immediately. Coach routes additionally return 404 `coach_disabled` unless `COACH_ENABLED` is set.

| Module | Routes |
|---|---|
| auth | Better Auth under `/auth/*`: `sign-in/social` (Apple / Google ID token), `sign-up/email`, `sign-in/email`, `verify-email`, `request-password-reset`, `reset-password`, `link-social`, `unlink-account`, `list-accounts`, `list-sessions`, `revoke-session`, `sign-out`, … |
| health | `GET /health/authorize`, `GET /health/callback`, `GET/POST /webhooks/health` |
| biometrics | `GET /me/biometrics`, `GET /me/activity?from&to` (daily steps, ≤ 400 days), `GET /me/connection` |
| scoring | `GET /me/scores?days&type`, `GET /me/scores/:date?type` (with baselines, previous day, score bands) |
| habits | `GET /me/habits/config`, `POST /me/habits/types`, `POST/GET /me/habits/logs`, `DELETE /me/habits/logs/:id`, `POST /me/habits/check-ins`, `GET /me/habits/status`, `GET /me/habits/patterns` |
| users | `PUT /me/timezone` (re-buckets sleep and re-scores), `DELETE /me` (body `{"confirm":"DELETE"}`; revokes Google access, deletes everything) |
| coach | `GET /me/coach/status`, `POST /me/coach/consent` (`scope` in the JSON body), `DELETE /me/coach/consent` (`?scope=hosted` revokes only the hosted consent; without it, both), `PUT /me/coach/persona`, `PUT /me/coach/engine`, `POST /me/coach/message` (SSE with `Accept: text/event-stream`, JSON otherwise), `GET /me/coach/today`, `GET /me/coach/conversations`, `GET /me/coach/conversations/latest`, `GET /me/coach/conversations/:id`, `GET/PATCH/DELETE /me/coach/memory[/:id]`, `GET /me/coach/digests/latest`, `POST/DELETE /me/push-token` |
| infra | `GET /health-check` |

### Background jobs (queue `health-sync`, worker concurrency 5)

| Job | Trigger | Does |
|---|---|---|
| `fetch` | webhook notification | fetches one day of one metric (sleep window widened ±1 day) and requests re-scores |
| `backfill` | connect / reconnect | all four metrics over 30 days, or since the last sync |
| `backfillStepsHistory` | connect, plus a server-start sweep for anyone still missing it | 365 days of steps for the heat map; sets `stepsHistoryBackfilledAt` |
| `tokenRefreshSweep` | every 10 min, plus once at startup | refreshes tokens expiring within 1 h; a failure disconnects |
| `computeDailyScore` | debounced 5 min per user/day | runs the stat engine for one day |
| `scoreSweep` | daily 03:30 | 90-day look-back for missing or stale scores |
| `habitCorrelationSweep` → `runHabitCorrelations` | Mondays 05:00 | one idempotent correlation run per user per ISO week |
| `coachWeeklyDigest` | Mondays 08:00 | weekly recap and a generic push (only when the coach is enabled) |
| `coachRetentionSweep` | daily 04:15 | deletes coach transcripts older than 90 days |

The coach's day summary (`coachDaySummary`) runs on its own `coach-summary` queue, `COACH_SUMMARY_CONCURRENCY` at a time (default 1), queued when a sync scores today, so a local model generation never holds a sync slot.

### Google Health API usage (`health.googleapis.com/v4`)
| Metric | Endpoint |
|---|---|
| Steps | `dataTypes/steps/dataPoints:dailyRollUp` (1-day windows, chunked into 14-day requests) |
| Resting HR | `dataTypes/daily-resting-heart-rate/dataPoints` |
| HRV | `dataTypes/daily-heart-rate-variability/dataPoints` |
| Sleep | `dataTypes/sleep/dataPoints` filtered on `sleep.interval.end_time` (session start/end with UTC offsets, minutes asleep) |
| Identity | `users/me/identity` → `healthUserId` |
| Webhooks | `projects/{number}/subscribers/biometrics-subscriber/subscriptions` (service-account token) |

The scopes are `googlehealth.activity_and_fitness.readonly`, `googlehealth.health_metrics_and_measurements.readonly` and `googlehealth.sleep.readonly`. List calls follow `nextPageToken`, and windows are half-open `[start, end)`, with empty windows skipped because Google answers them with a 400.

## 5. Data model

PostgreSQL via Prisma (`backend/prisma/schema.prisma`).

| Model | Purpose |
|---|---|
| `User` | name, unique `email` + `emailVerified`, IANA `timezone`, `sleepGoalMinutes` (480), coach persona and engine |
| `Session` | Better Auth sessions: 30-day sliding expiry, device user agent / IP (for Profile → Devices) |
| `Account` | one row per sign-in method (`apple`, `google`, or `credential` with the password hash) |
| `Verification` | single-use email-verification and password-reset tokens |
| `HealthConnection` | 1:1 Google Health link: encrypted tokens, webhook subscription id, status, `lastSyncedAt`, `stepsHistoryBackfilledAt` |
| `BiometricRecord` | one value per (user, metric, civil day at UTC midnight); SLEEP rows are a derived rollup |
| `SleepSession` | raw sleep sessions with their own UTC offsets (the source of the SLEEP rollup) |
| `BaselineSnapshot`, `UserDailyFeatures`, `ScoreInputFlag` | stat-engine intermediates: EWMA/MAD baselines, per-day features and z-scores, outlier verdicts |
| `DailyScore` | per (user, date, RECOVERY/SLEEP): score (null during cold start), confidence, factor breakdown, `algorithmVersion` |
| `HabitType`, `HabitLog`, `HabitCheckIn` | custom habit types, logs (stored with a 04:00-boundary "habit day"), "everything is logged" markers |
| `HabitCorrelation` | per (habit, factor, lag) test results and lifecycle state (CANDIDATE → CONFIRMED → RETIRED) |
| `CoachConsent`, `CoachConversation`, `CoachMessage`, `CoachMemory`, `CoachDigest`, `CoachDaySummary`, `PushToken` | coach consent (local and hosted scopes, versioned), transcripts (clean reply text, answer card, engine, duration, guardrail events), user-confirmed memories (linked to the message that proposed them), weekly digests, the day's summary sentence, push tokens |

**Dates.** Every daily metric is keyed by the user's *civil date*. Google already keys steps, resting HR and HRV that way. Sleep is attributed to the local date of the session's end, using the session's own UTC offset when present and otherwise the user's timezone. Changing timezone rebuilds every sleep rollup and re-scores the affected days.

## 6. Scoring engine (Recovery & Sleep)

`backend/src/scoring/` is five pure, versioned stages composed by `scoreDay`:

1. **Clean.** HRV and resting-HR values more than 5 MADs from the trailing 90-day median are flagged as outliers once there are at least 14 prior points. Gaps are imputed from the metric's own EWMA and marked as imputed.
2. **Features.** 14-night rolling sleep debt against the user's goal, sleep efficiency, and bedtime consistency (noon-anchored onset spread). Acute:chronic load from steps is stored but excluded from the composite.
3. **Baseline.** Each metric gets a personal EWMA (N = 30) and spread = 1.4826 × MAD. Until there are 14 clean days (cold start) a factor is **excluded**, never replaced by a population default. Each factor becomes a z-score, and v3 clamps it to [−3, 3].
4. **Composite.** `score = 100 / (1 + e^(−k·Σ wᵢ·dᵢ·zᵢ))` with `k = ln 9 / 2`, so an average day scores 50 and +2σ scores 90. Weights are renormalised over the factors available.
   - **Recovery:** HRV 0.45 (+), resting HR 0.35 (−), sleep debt 0.20 (−).
   - **Sleep:** duration 0.50, efficiency 0.30, circadian consistency 0.20.
5. **Explain.** Each factor's share of the score's distance from 50 becomes the "what moved it" breakdown. Confidence starts at HIGH and drops one level for imputed inputs and for excluded factors.

Configs are immutable (`configs/v1`–`v3`, `LIVE_VERSION = 'v3'`). Changing the live version re-scores history through the nightly sweep. Score bands: Excellent ≥ 75, Good ≥ 55, Fair ≥ 40, otherwise Poor. `scripts/backtest.ts` replays history through two configs as a regression check.

## 7. Habits & correlation engine

- **Habit types:** built-in `ALCOHOL` (≥ 2 drinks), `CAFFEINE` (≥ 3 cups) and `WORKOUT` (≥ 20 min), plus user-defined types. A day only counts if something was logged (a 0 counts as a real "none") or the user checked in.
- **Weekly test:** each habit against next-day HRV, resting HR, sleep duration, sleep efficiency and circadian consistency, at lags of 1–3 days over a 120-day window. Each side needs at least 8 exposed and 8 unexposed days.
- **Statistics** (`habits/stats.ts`, dependency-free):
  - weekday de-seasonalisation of both series;
  - Pearson r;
  - lag-1 autocorrelation with a Pyper–Peterman effective-n correction;
  - Student-t p-values (Lanczos log-gamma + regularised incomplete beta);
  - a **Benjamini–Hochberg** correction across every test in the run.
- **A test passes** when q < 0.10 and |r| > 0.30.
- **Lifecycle:** 2 consecutive weekly passes → CONFIRMED; 2 misses → RETIRED. Only confirmed patterns reach the app or the coach.

## 8. AI coach

`backend/src/coach/`. It's disabled unless `COACH_ENABLED=true`, and it requires the user's versioned consent.

<p align="center"><img src="docs/diagrams/coach-pipeline.png" alt="Coach pipeline: turn guard, then crisis classifier (a match gets a fixed safety reply); otherwise route, fact sheet from Postgres, one system prompt, one streamed call to Ollama or opt-in Claude (falling back to local if no text within 10 s); each sentence is validated, passing sentences stream over SSE with an answer card and memory chip, failing ones are dropped, and if nothing is left the answer is retried once and then shown as an error card."></p>

**How answers work.** `answer/route.ts` routes the question; `answer/facts.ts` builds the fact sheet (`[recovery.today] Recovery today: 26 (usual 58, 32 lower than usual)` …) from the same readers the app's screens use; `answer/prompt.ts` writes one system prompt (character voice, today's date, the facts, the rules); the model streams a conversational reply and, when it used the facts, a fenced ```` ```card ```` block naming fact ids (the server fills every value). `answer/validate.ts` checks each sentence as it completes: every number must be on the fact sheet (±1 on integers, ±1% or ±1 minute on durations; "6h 48m" = "408 minutes" = "6.8 hours"; a hedged "about 7 hours" may be within 10%); general-knowledge ranges are allowed only for general questions and never about the user. Nothing shown is ever retracted. The app shows the disclaimer once, as a page footnote; it is never part of a reply (only the JSON response kept for older app builds, which have no footnote, appends it).

- **Today summary:** `GET /me/coach/today` returns the four "today vs usual" bars (recovery, sleep, HRV, resting HR) and one sentence. A template sentence is always available; an AI sentence (what happened → why → what to do today, ≤ 45 words, validated like a reply) is written after each sync on its own `coach-summary` queue (`COACH_SUMMARY_CONCURRENCY`, default 1) and cached per day.
- **Engines:** local Ollama is the default. Hosted **Claude** (`claude-opus-5-5` through the Anthropic SDK, `effort: low`, server-side refusal fallback; `COACH_HOSTED_MODEL` overrides the model) is offered only when `COACH_HOSTED_ENABLED=true` and `ANTHROPIC_API_KEY` is set. It is used only for a user who chose it in **Profile → AI engine** (shown while the hosted engine is offered, or while a hosted consent is still held so it can be withdrawn) and accepted the hosted consent ("Your question and a summary of your recent health numbers are sent to Anthropic…"); `GET /me/coach/status` reports `engine: "hosted"` only while that consent and the local coach consent are both current. Only the fact sheet and the recent conversation are sent: no name, email, account id or tokens (anything the user types is sent as part of the conversation, and the consent says so). The key stays on the server.
- **Withdrawing hosted consent:** **Withdraw Claude consent** in the same group (`DELETE /me/coach/consent?scope=hosted`) stops anything further going to Anthropic and switches the user back to the local engine. Choosing **On-device** switches engine without withdrawing the consent.
- **Hosted failures:** if a hosted call fails before any text, or produces no text within `COACH_HOSTED_FIRST_TEXT_MS` (default 10 s), that message is answered locally with the rest of the budget (`done.engine = "local"`, and the app notes it); the local model is warmed at the start of hosted messages (at most once every 5 minutes per provider) so this is not a cold load. A refusal after text has streamed is not handed to the local model: the sentences already shown stay, an error line with Retry follows, and the answer is not stored.
- **Cost (hosted):** roughly 1.5k input + 300–500 output tokens per message, about 1–2 cents on `claude-opus-5-5`.
- **Budgets:** 45 s per local answer (`COACH_LOCAL_BUDGET_MS`), 30 s hosted (`COACH_HOSTED_BUDGET_MS`); the app waits 60 s (`EXPO_PUBLIC_COACH_TIMEOUT_MS`, keep it above the server budget). The local model is kept loaded (`keep_alive` 24h, `OLLAMA_KEEP_ALIVE`) and warmed when the Coach tab opens; on the owner's Mac the first sentence arrives in about 3–6 s once warm.
- **Memory:** the model may append a ```` ```memory ```` block (training goal, schedule or preference, ≤ 140 characters); a health-fact classifier rejects health facts. Proposals appear as chips; the user's next message in that conversation confirms or dismisses them (correcting one deletes it silently). Confirmed memories are deleted with their conversation when it expires after 90 days.
- **Safety:** crisis messages never reach the model; they get fixed resources (988, Crisis Text Line, findahelpline.com, 911). Diagnosis, medication dosing and supplement advice are dropped sentence by sentence. The coach speaks as one of fifteen **coaches** (persona set v4: `mochi`, `boba`, `sprout`, `avo`, `peep`, `bun`, `kit`, `axo`, `boo`, `cap`, `jelly`, `pengu`, `luna`, `gloop`, `bao`; Mochi is the default); only the voice and focus differ. A stored id that no longer exists (the v1 styles and the seven retired v3 characters) resolves to Mochi.
- **Other features:** one in-flight answer per user and 15 per 5 minutes (turn guard); conversation history with cards, safety cards and memory chips as they appeared live; a weekly digest written from the `trends` fact sheet and validated like replies (falling back to a recap composed from the sheet); push notifications with fixed text only, sent via Expo when `PUSH_PROVIDER=expo`; 90-day transcript retention; telemetry that drops message text.
- **Model providers** (`coach/model/`): one `stream()` interface. `OllamaProvider` (`COACH_PROVIDER=ollama`; loopback only unless `OLLAMA_ALLOW_REMOTE=true`; `<think>` blocks filtered from the stream), `AnthropicProvider` (hosted, opt-in), `UnconfiguredProvider` (the default: every answer is an error card) and `ScriptedStreamProvider` (tests and evals).

## 9. Models used

### Language model (coach)
| Role | Model | Where it runs |
|---|---|---|
| Coach answers, today summary and weekly digest | **`qwen3.6:35b`** (Qwen 3.6, mixture-of-experts with ~3B active parameters, Q4_K_M, 22 GB) | local **Ollama** (`http://localhost:11434`) |
| Hosted coach (opt-in) | **`claude-opus-5-5`** (`COACH_HOSTED_MODEL`) | Anthropic API |

The model was chosen with `npm run eval:coach:local` on an M1 Pro (32 GB), when the coach still used a tool loop; the table below is from that run. The eval now runs the answer pipeline and reports warm first-sentence and full-answer times.

| Model | Model replies | First-try guardrail rejects | Tool use | Median / p90 latency |
|---|---|---|---|---|
| **`qwen3.6:35b`** | **33/34** | **3** | correct | **3.1 s / 5.0 s** |
| `qwen3.8:27b` | 32/34 | 5 | correct | 30 s / 72 s |
| `qwen2.5-7b-instruct-abliterated` | 11/34 | 34 | calls tools | 14 s |
| Qwen3 4B uncensored (`flux2-klein` tag) | 34/34 | 11 | never | 3.4 s |

Details, remaining weaknesses and the original spike: `docs/superpowers/notes/local-model-coach-plan.md`. Pin the exact tag and re-run the eval before changing models.

### Statistical models (no ML training)
- **Recovery and Sleep scores:** personal EWMA baselines with robust (MAD) spread, z-scores and a weighted logistic composite (§6).
- **Outlier detection:** a robust MAD rule against the 90-day median.
- **Habit patterns:** de-seasonalised Pearson correlation with an autocorrelation-corrected effective n, Student-t tests and Benjamini–Hochberg FDR control (§7).

No model is trained on user data.

## 10. Mobile app

- **Navigation:** a native stack (`RootNavigator`) wraps the bottom **tabs**: Home · Activity · **Coach** (the centre character) · Metrics · Profile. Detail screens push over the tabs: MetricDetail, ScoreDetail, Patterns, ConnectHealth, CoachConsent, HostedConsent, CoachMemory, ThinkingStyle, ThinkingText, and the MeetYourCoach modal. Signed-out users see SignIn.
- **Screens:**
  - **Home:** today's **Recovery** as a large hero ring (band-coloured, with a glow) and a one-line verdict naming the factor that moved it most. Below it, Sleep and Ask Coach tiles, Tomorrow's forecast, the habit check-in, the coach's weekly recap and a two-column metrics grid.
  - **Score detail:** the same hero, the confidence and band, the full explanation, the factor bars ("what moved it"), cold-start progress and the baselines used. A floating glass button asks the coach about it.
  - **Metrics / Metric detail:** every metric is drawn against its **usual range**: the middle 80% of the person's own last 30 days, shown once there are at least 7 readings. The line stays neutral and only readings outside the band take the metric's colour. The detail view adds 7D / 30D / 90D windows and drag-to-scrub with a haptic tick.
  - **Forecast:** tomorrow's likely Recovery range, what-if levers and the forecast's track record.
  - **Patterns:** habit → metric effects, each leading with its effect size, with the sample size and caveats.
  - **Activity:** a steps heat map with Month (calendar), Year and YTD views. Levels are relative to the 10,000-step goal, and no-data cells are drawn distinctly. Tapping a day opens a glass sheet with its details. The view also shows range stats: total, average, active days, goal streak and best day.
  - **Coach:** today's summary (a sentence in your character's voice above four "today vs usual" bars, tap to ask), suggested questions, streamed answers with answer cards and follow-up chips, a stop button, past conversations (☰) and coach memory, with your character as its face.
  - **Meet your coach:** a 3-column grid of the fifteen coaches; tapping one opens its card (number, focus, tagline, greeting) in a bottom sheet with **Choose**. It opens on the first Coach-tab visit when the coach is enabled; Skip picks Mochi. Reopened from Profile to switch.
  - **Profile:** iOS grouped rows for Google Health and sync, time zone, account (sign-in methods, devices, sign out), your coach with its **Thinking style** and **Thinking text** settings, the AI engine (when the hosted engine is offered), coach memory, notifications and account deletion.
  - **Sign-in / onboarding:** Apple, Google and email sign-in; sign up and password reset; Connect Google Health with the read-only data it will use.
- **Design system** (`global.css` ⇄ `src/theme.ts` ⇄ `tailwind.config.js`, kept in step by `__tests__/theme/tokens.test.ts`):
  - **Colour:** one cool-neutral ramp for dark (the default) and light, stepped surfaces instead of shadows, one accent per metric, and an indigo for the coach.
  - **Type:** Geist for the UI and tabular numerals, and Instrument Serif for editorial lines (loaded with `expo-font`). A named scale covers `text-eyebrow`, `text-numeral*` and `text-display*`. `components/ui/text.tsx` maps font weights to Geist's faces.
  - **Components:** `components/ui/`: `Card`, `SectionLabel`, `SettingsGroup`/`SettingsRow`, `RangeChart`, `ScoreRing`, `Glow`, `GlassSurface`, `Button`, and the Reanimated 4 motion kit (`PressableScale`, `Reveal`, `Sheet`, `SegmentedControl`, `CountUp`), all respecting reduce-motion.
  - **Chrome:** real iOS 26 **Liquid Glass** (`expo-glass-effect`) on the floating tab bar, sheets and floating buttons. It falls back to the system blur (`expo-blur`) on older iOS and to an opaque surface under Reduce Transparency. Content surfaces stay opaque.
  - **Pixel coaches** (`components/characters/`): fifteen symmetrical pixel-art coaches. Each is data (a 12-column left half and a palette); a pure TypeScript compositor mirrors, shades and outlines it into a 24×24 grid, and Skia draws that grid as a cached `Picture` at whole-device-pixel scales, so sprites stay crisp at every size. Each has four moods: **idle**, **thinking** (a message is sending), **answering** (a reply arrived in the last 2.5 s) and **resting** (today's Recovery is poor). While thinking, the coach wears a **thinking attachment** (Lightbulb by default, or one of eight others), and the chat's pending row uses a **thinking text** style (by default *What it's doing*, a checklist of the answer pipeline's real progress steps). Both are chosen in Profile → Your coach. The tab bar's coach always idles; elsewhere coaches pause off screen, and Reduce Motion holds a still frame. The choice is saved on the server (`PUT /me/coach/persona`, `PUT /me/coach/thinking`) and cached in SecureStore for a fast cold start; signed out, it's always Mochi.

    | # | Coach | What it is | Focus |
    |---|---|---|---|
    | 01 | Mochi (default) | Squishy rice cake | Rest |
    | 02 | Boba | Bubble tea | Daily habits |
    | 03 | Sprout | Potted seedling | Progress |
    | 04 | Avo | Avocado half | Energy |
    | 05 | Peep | Baby chick | Motivation |
    | 06 | Bun | Bunny | Rest days |
    | 07 | Kit | Ginger cat | Bedtime |
    | 08 | Axo | Axolotl | Recovery |
    | 09 | Boo | Friendly ghost | Wind-down |
    | 10 | Cap | Mushroom | Balance |
    | 11 | Jelly | Jellyfish | Breathing |
    | 12 | Pengu | Penguin | Consistency |
    | 13 | Luna | Sleepy moon | Sleep |
    | 14 | Gloop | Slime drop | Workouts |
    | 15 | Bao | Panda | Movement |
- **Networking:** `apiFetch` sends the Better Auth session cookie from SecureStore. Sessions slide on the server, so there is no refresh step: a 401 signs the user out (unless they already signed in again); network errors don't. Coach answers stream over SSE (`expo/fetch`) with their own timeout (`EXPO_PUBLIC_COACH_TIMEOUT_MS`, default 60 s).
- **iOS:** the config plugin `plugins/with-ios-scene-delegate.js` adds the UIScene lifecycle the iOS 27 SDK requires. Push (`expo-notifications`) is only added at prebuild with `EXPO_PUSH=1`, because the `aps-environment` entitlement needs a paid Apple team.

## 11. Technology stack

| Area | Technology |
|---|---|
| Language | TypeScript everywhere (strict; backend also uses `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`) |
| Backend runtime | Node.js 24+ (Docker `node:24-slim`), Express 5 |
| Database | PostgreSQL 16 via **Prisma 6** (migrations committed) |
| Queue / cache | **Redis** + **BullMQ 6** (ioredis) |
| Auth | **Better Auth** (+ `@better-auth/expo`): Apple / Google ID-token sign-in, email + password, DB-backed sessions; `google-auth-library` for the service account |
| Crypto | Node `crypto`: AES-256-GCM for stored OAuth tokens; Better Auth handles password hashing and session tokens |
| LLM runtime | **Ollama** (local HTTP `/api/chat`, streamed) by default; **`@anthropic-ai/sdk`** for the opt-in hosted engine |
| Mobile | **Expo SDK 57**, React Native 0.86, React 19, React Navigation 7 (native-stack, bottom-tabs) |
| Mobile UI | NativeWind 4 + Tailwind 3, Reanimated 4 + worklets, **@shopify/react-native-skia** (pixel coaches), react-native-svg, Ionicons; **expo-glass-effect** + **expo-blur** (Liquid Glass with fallback), expo-haptics; fonts **Geist** and **Instrument Serif** via `@expo-google-fonts` |
| Mobile platform | better-auth client + `@better-auth/expo` (session in expo-secure-store), expo-auth-session + web-browser (OAuth), expo-apple-authentication, expo-notifications |
| Testing | Jest 30: ts-jest + Supertest + nock (backend, real Postgres/Redis); jest-expo + Testing Library (mobile) |
| Packaging | Dockerfile for the backend (runs `prisma migrate deploy` on start, health-check probe) |

## 12. External providers & services

| Provider | Used for |
|---|---|
| **Google Health API** | steps, sleep sessions, daily HRV, daily resting HR, identity, per-user webhook subscriptions |
| **Google OAuth 2.0** | user consent and token exchange, refresh and revocation for the Health scopes |
| **Google Sign-In** | app sign-in (ID token verified by Better Auth) |
| **Google Cloud service account** | managing webhook subscriptions only (`cloud-platform` scope); never mixed with user tokens |
| **Sign in with Apple** | app sign-in (identity token verified by Better Auth against Apple's JWKS) |
| **Resend** | verification and password-reset emails (optional in development, where links are printed to the console) |
| **Expo Push Service** | generic weekly-digest notifications (optional; `PUSH_PROVIDER=expo`) |
| **Ollama** (self-hosted, local) | the coach's default LLM (`qwen3.6:35b`) |
| **Anthropic API** (optional) | the opt-in hosted coach engine (`claude-opus-5-5`); only for users who chose it, with its own consent |
| **PostgreSQL**, **Redis** | self-hosted persistence and job queue |

No analytics or crash-reporting service is used; a hosted LLM is used only for users who opt in.

## 13. Security & privacy

- **Health data stays local for the AI by default.** The local coach only talks to a loopback Ollama unless explicitly overridden. A user who opts into the hosted engine sends Anthropic the fact sheet and the recent conversation only, never identifiers or tokens; the API key stays on the server.
- **Token handling:** Google tokens are AES-256-GCM encrypted at rest. Sessions are database-backed and revocable per device; a password reset revokes every session. Session freshness is disabled (`session.freshAge: 0`, an owner decision) because freshness counts from session creation and would lock long-lived sessions out of Devices and unlinking; removing the last sign-in method and linking a different email stay blocked server-side. The OAuth `state` is single-use and short-lived. Webhooks use a constant-time secret comparison.
- **Least exposure:** the API returns only the fields screens use, and the coach's telemetry drops message text. Push notifications carry fixed text only, never health numbers.
- **User control:** the coach requires versioned consent (the hosted engine a second one, which can be withdrawn at any time), and memories can be viewed, edited and deleted. `DELETE /me` revokes Google access and deletes all data in one transaction. Coach transcripts expire after 90 days, and confirmed memories are deleted with their conversation.

## 14. Configuration

Templates: `backend/.env.example`, `mobile/.env.example`.

**Backend (required):** `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL` (the API's public URL, used in email links), `TOKEN_ENCRYPTION_KEY` (base64 of 32 bytes), `GOOGLE_HEALTH_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI`, `GOOGLE_HEALTH_WEBHOOK_SECRET`, `GOOGLE_CLOUD_PROJECT_NUMBER`, `GOOGLE_APPLICATION_CREDENTIALS` (service-account key path), `GOOGLE_CLIENT_ID` (Sign-In), `APPLE_BUNDLE_ID`, `PORT` (default 3000).

**Backend (optional):** `GOOGLE_IOS_CLIENT_ID` (a second Google client id whose ID tokens are accepted).

**Email:** `EMAIL_FROM` and `RESEND_API_KEY`. Without both, development prints verification and reset emails to the backend log instead of sending them; production refuses to boot without them.

**AI coach:**
```env
COACH_ENABLED=true
COACH_PROVIDER=ollama
OLLAMA_MODEL=qwen3.6:35b          # pin the exact tag
# optional: OLLAMA_URL, OLLAMA_TEMPERATURE, OLLAMA_NUM_CTX, OLLAMA_KEEP_ALIVE (default 24h), OLLAMA_ALLOW_REMOTE
# optional budgets (ms): COACH_LOCAL_BUDGET_MS=45000, COACH_HOSTED_BUDGET_MS=30000
# optional: COACH_SUMMARY_CONCURRENCY=1   (day summaries written at once, clamped to 1-8)
# hosted engine (opt-in per user): COACH_HOSTED_ENABLED=true, ANTHROPIC_API_KEY=…, COACH_HOSTED_MODEL=claude-opus-5-5
# optional: COACH_HOSTED_FIRST_TEXT_MS=10000   (no hosted text by then: answered locally)
```

**Push (optional):** `PUSH_PROVIDER=expo`, `EXPO_ACCESS_TOKEN`.

**Mobile:** `EXPO_PUBLIC_API_BASE_URL` (default `http://localhost:3000`), `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_COACH_TIMEOUT_MS` (default 60000; keep it above the server budget), `EXPO_PUBLIC_CHARACTER_GALLERY=1` (dev character gallery: every coach in every mood, the thinking attachments and thinking text styles, and a size ladder), and `EXPO_PUBLIC_DEV_SIGN_IN_EMAIL` / `EXPO_PUBLIC_DEV_SIGN_IN_PASSWORD` (dev builds only: a one-tap "Sign in as … (dev)" button for a local test account). Build-time: `EXPO_PUSH=1` to include push.

## 15. Running locally

Prerequisites: Node 24 (the backend requires it; run `nvm use`), PostgreSQL, Redis, Xcode with an iOS simulator, and for the coach [Ollama](https://ollama.com) with the model pulled.

```bash
# 1. Coach model (optional, ~22 GB)
ollama pull qwen3.6:35b

# 2. Backend
cd backend
cp .env.example .env          # fill in secrets
npm install
npx prisma migrate deploy
npm run build
node --env-file=.env dist/server.js      # API on :3000; worker + schedulers start after bind
# In development, verification and password-reset links are printed in the backend log as `[email] to=…`;
# open them on the simulator with `xcrun simctl openurl booted '<link>'`.

# 3. Mobile (Skia is native, so this needs a development build; Expo Go won't work)
cd ../mobile
cp .env.example .env
npm install
npx expo run:ios              # first time / after native changes
npx expo start --dev-client   # afterwards: JS-only changes
```

The redesign added native modules (`expo-glass-effect`, `expo-blur`), so an existing development build must be rebuilt once (`npx expo run:ios`) before it can load the current JavaScript.

**A demo account** with 90 days of synthetic history, scored by the real pipelines:

```bash
cd backend
DEMO_USER_PASSWORD='<choose one>' npx ts-node scripts/seedDemoUser.ts --email demo@example.com
# Forgot it later? Reset the password without reseeding (local only):
NEW_PASSWORD='<new one>' TS_NODE_TRANSPILE_ONLY=1 npx ts-node scripts/setUserPassword.ts --email demo@example.com
```

Put the same email and password in `mobile/.env` as `EXPO_PUBLIC_DEV_SIGN_IN_EMAIL` / `EXPO_PUBLIC_DEV_SIGN_IN_PASSWORD` (then restart Metro) to get a one-tap dev sign-in button. It never appears in a release build.

The provider is built on the coach's first use, which logs `coach.provider_configured` with `ollama:qwen3.6:35b`. A bad Ollama configuration logs `coach.provider_config_invalid` instead, and every coach answer is then an error card.

### Upgrading an existing database (Better Auth migrations)

`20260927120000_better_auth` moves existing users onto Better Auth's tables, and `20260928120000_normalize_user_email` lower-cases and trims their emails (Better Auth looks emails up in lower case). The second one refuses to run if two users share an email that differs only by case.

Rehearse on a copy of the dev database first:

```bash
createdb biometrics_rehearsal && pg_dump biometrics | psql biometrics_rehearsal
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/biometrics_rehearsal npx prisma migrate deploy
```

If a migration fails, fix the data it reports (for example, merge or delete the duplicate user), mark it rolled back with `npx prisma migrate resolve --rolled-back <migration_name>` (`20260927120000_better_auth` or `20260928120000_normalize_user_email`), then re-run `npx prisma migrate deploy`. Prisma does not wrap a migration in a transaction, so one that fails partway can leave some of its changes behind: take a `pg_dump` backup before deploying so you can restore it instead.

### Mobile sign-in

The app signs in with Apple, Google, or email + password (new accounts confirm their email before first sign-in; "Forgot password" sends a reset link). Once signed in, **Profile → Account → Sign-in methods** links or unlinks methods on the account, **Profile → Account → Devices** lists signed-in devices and signs them out, and **Profile → Account → Sign out** signs out.

Linking a new method from **Profile → Sign-in methods** is Apple / Google only.

Email links open the app through deep links: `biometrics://verified` opens sign-in with an "Email confirmed" banner (it does not sign you in automatically) and `biometrics://reset-password?token=…` (set a new password). iOS dev builds need the `biometrics` URL scheme, which is already set in `mobile/app.json`; rebuild the native project after pulling if the scheme or native modules changed.


## 16. Testing & evaluation

```bash
# Backend: uses a real Postgres + Redis; point DATABASE_URL/TEST_DATABASE_URL at a *_test database
cd backend && npm test        # 113 suites, 1,300+ tests (serial: maxWorkers 1)
docker compose -f docker-compose.test.yml up -d   # optional Postgres 16 on :5434

# Mobile
cd mobile && npm test         # 134 test files, 1,200+ tests

# Coach evals
cd backend && npm run eval:coach          # scripted stream through the real answer pipeline; no network (also run in Jest)
OLLAMA_MODEL=qwen3.6:35b npm run eval:coach:local   # real local model, warm first-sentence and full-answer times; *_test DB only
```

**Coach evals.** `npm run eval:coach` runs every fixture (a seeded snapshot, a question and a scripted model stream) through the real answer pipeline and checks the outcome, route, shown and dropped sentences, the card, the prompt and memory rows; it always checks that every shown sentence and card value is on the fact sheet. Must-fail fixtures prove the eval catches a contradicted direction, a real number on the wrong metric, and invented numbers with the runtime validator switched off. It prints `PASS`/`FAIL` per fixture and `CAUGHT`/`MISSED` per must-fail fixture, then `N/N fixtures passed, 3/3 must-fail fixtures caught`.

`npm run eval:coach:local` needs [Ollama](https://ollama.com) running with `OLLAMA_MODEL` pulled (the other `OLLAMA_*` settings are read as the server reads them) and a `*_test` `DATABASE_URL`, since each fixture seeds and deletes a user. It warms the model, sends the fixtures' questions to it (the scripted outputs are ignored) and prints, per fixture, the outcome, time to the first sentence, total time, sentences shown and dropped, whether a card came back, the question and the reply, and any failed check (grounded, direction, attribution, quality). It ends with a summary: answered, grounded (must be all), direction, attribution and quality counts, and median / p90 / max first-sentence and full-answer times (target: first sentence 6 s or less, warm). Options: `EVAL_IDS` (comma list), `EVAL_LIMIT`, `EVAL_BUDGET_MS` (default: the local budget) and `EVAL_OUT` (a JSONL file).

Backend Jest runs may not exit on their own because of an open Redis handle; use `--forceExit` if needed. There is no CI in the repository; run both suites before merging.

## 17. Operations scripts

`backend/scripts/`:
- `registerHealthSubscriber.ts`: one-time Google webhook subscriber registration.
- `resyncSleep.ts`, `resyncRestingHr.ts`: re-fetch a metric's window (dry-run by default).
- `rescoreUser.ts`: recompute a user's scores inline.
- `backtest.ts`: compare scoring configs over history.
- `probeSleepShape.ts`: inspect raw Google sleep payloads.
- `purgeTestFixtures.ts`: clean test users.
- `seedDemoUser.ts`: create (or recreate) the demo account with 90 days of synthetic history, run through the real scoring and habit pipelines.
- `setUserPassword.ts`: set a new password on an existing local account without touching its data (refuses in production).

## 18. Status & known limitations

- **Public launch needs Google's CASA review.** All three Health scopes are Restricted. Until the app is verified it's limited to about 100 allowlisted test users, and refresh tokens expire after 7 days while the OAuth app is in Testing.
- **Live webhook delivery hasn't been observed yet.** The backfill path is proven against a real account.
- **Step history is limited to what Google holds.** The heat map requests a full year; the test account returned about 5 months.
- **The coach's validator checks numbers, not reasoning.** The validator limits each number to the metric(s) the sentence names but does not judge direction words; the evals' direction and attribution checks catch what that scoping can miss.
- **Push is built end-to-end but hasn't been delivered to a real device.** It needs a paid Apple team and an EAS build.
- **The redesign's device card (spec §5) is not built yet.**
- **For progress and next steps, see [Where we are](#where-we-are-october-2026).**

## 19. Design docs

`docs/superpowers/`:

| Doc | Topic |
|---|---|
| `specs/2026-09-15-phase1-foundation-design.md` | original foundation: accounts, OAuth connect, webhook sync, dashboard |
| `specs/2026-09-16-google-health-migration-design.md` | Fitbit → Google Health API, live-verified API facts, CASA risk |
| `specs/2026-09-20-stat-engine-design.md` | Recovery and Sleep score pipeline |
| `specs/2026-09-20-habits-correlation-design.md` | habit logging and correlation engine |
| `specs/2026-09-20-ai-coach-design.md` | original AI coach (tool loop, since replaced): safety, memory, digest |
| `specs/2026-09-21-app-redesign-design.md` | dark-first redesign, tab bar, orbs (since replaced), heat map, coach chat |
| `specs/2026-09-29-companion-characters-design.md` | companion characters: eight selectable coaches, moods, Meet your coach (superseded by pixel coaches) |
| `specs/2026-10-01-pixel-coaches-design.md` | pixel coaches: fifteen pixel-art coaches, grid + card picker, thinking style and thinking text settings, real progress steps |
| `specs/2026-09-30-coach-redesign-design.md` | coach redesign: answer pipeline, fact sheet, validator, streaming, hosted engine, today summary |
| `specs/2026-09-28-recovery-forecast-design.md` | tomorrow's recovery forecast and what-if levers |
| `specs/2026-10-03-sleep-depth-design.md` | sleep depth: stage lanes, cycles, moments, bedtime goal |
| `specs/2026-10-04-recap-design.md` | recaps and sharing |
| `specs/2026-10-06-achievements-design.md` | achievements and badges |
| `specs/2026-10-06-buddies-design.md` | buddies: pairing, sharing, stickers |
| `specs/2026-10-07-social-tab-design.md` | Social tab: stories, Campfire, Chats |
| `specs/2026-10-08-type-system-design.md` | A4 type system |
| `specs/2026-10-09-recovery-page-design.md` | Recovery page (shipped, PR #59) |
| `specs/2026-10-09-one-sleep-page-design.md` | one Sleep page (built on `feature/sleep-page`) |
| `handoff/*` | session handoffs: current state and how to continue |
| [`../design/`](docs/design/README.md) | design canvases (Recovery, Sleep, KIP, Home redesign, …) |
| `plans/*` | task-by-task implementation plans |
| `notes/slice0-live-checks.md` | live Google Health probe results |
| `notes/local-model-coach-plan.md` | local LLM evaluation and the model choice |
