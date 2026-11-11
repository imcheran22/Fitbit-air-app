# Recap — design (growth sub-project B)

Date: 2026-10-04 (revised twice after review the same day). Branch `feature/recap`, stacked on `feature/sleep-depth` (PR #48).
Source: the owner's picks on the growth canvas (https://claude.ai/artifact/JHqksi4S4DpFXNiFJho97e):
1 shareable recap card, 1a weekly story, 1b year in pixels, 1c build your recap, 1d your month in the app.

## Purpose

Growth. A user turns their week, month or year into a good-looking image in their coach's voice and shares it;
the image carries the app's name so friends can find the app. Success: a user can open a recap, choose what to
include, and save or share an image in a few taps, and every number on it is true.

## Decisions (owner)

| Question | Decision |
|---|---|
| Coach quote | Written by the coach AI, number-checked, template fallback |
| Link on images | App name only for now (no URL) |
| Scope | All five screens in this sub-project |
| Ready notifications | Push on the 1st (month) and Monday (week), with a "Recap ready" setting |
| Approach | A — recaps prepared ahead on the server, rendered and shared on the phone |
| Existing weekly digest | **Merged** into the weekly recap: one Monday item, one push, one fact sheet |

Out of scope: buddies / other people (sub-project C), a public link or landing page, server-rendered images,
editing the coach's line.

## 1. What a recap contains

**Periods.** Week = Monday–Sunday in the user's time zone. Month = calendar month. A night belongs to the civil
date it ends on (as everywhere else in the app).

**Numbers** (each omitted, never zero-filled, when its own data is missing):

| Key | Definition |
|---|---|
| `nightsWithData` | Nights in the period with a SLEEP rollup |
| `avgSleepMinutes` | Mean SLEEP rollup minutes over those nights, rounded |
| `nightsOnGoal` | Nights with SLEEP rollup ≥ the goal snapshot |
| `longestOnGoalStreak` | Most consecutive civil dates on goal inside the period (a missing night breaks it) |
| `bestNight` | `{date, minutesAsleep}`: highest SLEEP DailyScore; ties → longer sleep; no scores → longest sleep |
| `bestRecovery` | `{date, score}`: highest RECOVERY DailyScore (rounded) |
| `avgRecovery` | Mean RECOVERY score, rounded |
| `steps` | `{total, dailyAverage}` from STEPS records on days with data |
| `earlierBedtimes` | `{nights, of}`: nights whose main-session bedtime (pickMainSession, noon-anchored minutes) was earlier than the previous period's average bedtime |
| `bedtimeSpreadMinutes` | Population std of noon-anchored bedtimes (the regularity spread maths), rounded; needs ≥ 4 nights |
| `weekStrip` (week only) | 7 entries Mon→Sun: `{date, minutesAsleep|null, onGoal|null, recovery|null}` |
| `comparison` | vs the previous period of the same kind: `avgSleepDelta`, `bedtimeSpreadDelta`, `avgRecoveryDelta` |
| `milestones` (month only) | See below |

**Previous period.** Comparison and `earlierBedtimes` are computed from **raw stored data** for the previous period
with the same definitions (not from a stored recap), so the first recap has a comparison whenever history exists.
Each comparison value is present only when the previous period meets the same eligibility threshold as the current
one (WEEK ≥ 3 nights, MONTH ≥ 7) and has that number.

**Monthly milestones** (fixed rules, only those achieved):
- `streak` — "N nights on goal in a row" when `longestOnGoalStreak` ≥ 5.
- `bestRecoveryWeek` — the Monday-start week (inside the month, ≥ 4 days of RECOVERY) with the highest mean
  recovery, shown only when it beats the previous month's best such week by ≥ 1 point (raw data).
- `everyDayLogged` — every civil date of the month has a SLEEP rollup.
- `steadiestMonth` — `bedtimeSpreadMinutes` is the lowest of all months computable from raw data, with ≥ 3
  earlier eligible months.

**Goal snapshot.** The user's sleep goal at build time is stored on the recap (`sleepGoalMinutes`) and used for
every on-goal number in that recap; it never changes afterwards.

**Year in pixels** is not stored: the app draws it from `GET /me/sleep` for the calendar year (one square per
night: on goal / short / no data) against the **current** goal, and says so under the grid ("on your current goal
of 8h"). Accepted consequence: after a goal change, the year count can differ from older monthly recaps, which keep
the goal they were built with; the caption makes the rule visible.

**Eligibility.** WEEK needs `nightsWithData` ≥ 3; MONTH needs ≥ 7. Below that the period is recorded as skipped
(no recap shown, no push). A skipped period is re-checked while late data can still arrive (section 2, Late data).

## 2. Building, writing and announcing

**Schedule.** An hourly recap sweep on the existing `health-sync` repeatable-job machinery replaces the weekly
digest cron (`COACH_WEEKLY_DIGEST_CRON`). A period is **due** for a user when, in their time zone, the period has
ended, it is past 08:00 on any day after it ended, and it ended no more than **7 days** ago (WEEK) / **10 days** ago
(MONTH), and no `Recap` row exists for it. This survives a missed hour or a down day. One BullMQ job per due
(user, kind, periodStart), job id `recap-<userId>-<kind>-<periodStart>` (dedupes, `removeOnComplete: true`).
One user's failure never blocks others.

**Storage.** New Prisma model `Recap`: `id`, `userId`, `kind` (`WEEK|MONTH`), `periodStart`, `periodEnd`,
`status` (`BUILT|SKIPPED`), `stats` (JSON, section 1; null when skipped), `sleepGoalMinutes`, `line`, `lineSource`
(`AI|TEMPLATE`), `story` (the weekly paragraph, nullable, WEEK only), `storySource` (`AI|TEMPLATE`, nullable),
`personaId`, `builtAt`, `rebuiltAt` (null until the one allowed rebuild), `openedAt`, `pushedAt`.
Unique `(userId, kind, periodStart)`. SKIPPED rows mark thin-data periods so the hourly due check does not rebuild
them; only the late-data rule below re-checks them.
`Recap` is added to `USER_OWNED_MODELS` (users/deletion.ts) and its schema test; account deletion removes recaps.
Migration additive only.

**One fact sheet.** A new `recap` fact sheet (coach/answer/facts.ts) holds exactly the section-1 numbers. Every
count fact carries a count unit (`nights`, `days`, `times`, `steps`). `nights`, `days` and `times` are new units,
each with its own validator family, separate from the existing `count` family that steps own, so a sentence about
steps cannot borrow a night count.

**Stricter number check for recaps.** `validateSentence` gains an option `{ exactNumbers: true }` used only by
recaps. With it on:
- Every integer must equal a sheet value exactly, counts and scores alike, with no ±1 and no hedge tolerance.
  (Today every integer matches within ±1, scores included, so this is a change for scores too.)
- A bare number with no unit matches only a count fact with exactly that value.
- The averaging-window exemptions are off: "7-night", "for 7 nights", "last 30 days" and the like are checked as
  numbers, because in a recap they read as claims ("a 7-night streak"). Dates, times of day and "/100" stay exempt.
- Durations keep ±1 minute.

Existing chat/digest behaviour is unchanged when the option is off.

**Coach text (AI).** From the one sheet, in the user's persona (name, tone, focus, verbosity) with the existing
disallowed-topics list, no medical claims, second person, numbers only from the sheet, and each comparison's
direction stated explicitly in the prompt:
- `line` — 1–2 sentences, ≤ 30 words (every recap).
- `story` — the merged weekly digest: the paragraph the digest used to write, now built from the recap sheet
  (WEEK only). It is narrower than the digest on purpose: it covers only the section-1 numbers. Anything else the
  digest's `trends` sheet held is no longer in the weekly paragraph and stays available in chat.
- Engine: the user's selected coach engine, as the daily one-liner chooses (`summaryEngineDeps`).
- Each output: every sentence through `validateSentence(…, { exactNumbers: true })`; a rejected draft gets one retry
  with the regeneration note, then a template (lines: small fixed set per situation; story: the existing
  `composeDigestFallback` adapted to the recap sheet), templates also validated. 60 s budget per recap.
- Coach disabled or no current consent → no AI call: template line, no story. Persona `reactive-only` → template
  line, no story (the digest already skipped these users).

**Digest merge.** The weekly digest job stops being scheduled. `CoachDigest` rows stay for history.
`GET /me/coach/digests/latest` keeps its response shape but serves the latest BUILT WEEK recap's `story` (falling
back to the latest legacy `CoachDigest` when no recap with a story exists), so existing screens keep working.

**Coach data deletion.** `deleteUserCoachData` (coach/retention.ts) also clears coach-written recap text. For each
of the user's recaps, `story` and `storySource` are set to null, and an AI `line` is replaced by the template line
built from the stored `stats` (`lineSource` becomes `TEMPLATE`; no model call). The numbers stay, since they are not
coach data. The deletion summary gains a `recapTexts` count.

**Ready push.** Pushes stay inside the closed table in coach/push.ts:
- WEEK reuses `weekly_digest` ("Your weekly recap is ready" / "Open the app to read it.").
- MONTH adds `monthly_recap` ("Your monthly recap is ready" / "Open the app to see it.").
- The payload gains an id-only `data` field `{ kind: 'recap', recapId }`. The push rule is amended in push.ts's
  header: data may carry only a fixed kind and an opaque UUID, never content; the Expo sender validates `data`
  against that allowlist (keys `kind`,`recapId`; `kind === 'recap'`; `recapId` a UUID) as it does title/body.
- Sent only when the user has a registered push token **and** `recapPushEnabled` is true; `pushedAt` prevents a
  second push; failures are logged and never fail the recap. SKIPPED periods never push.
- **Push tokens become app-level (owner decision: recap pushes reach everyone).** `POST /me/push-token` and its
  delete no longer require the coach (`requireEnabled` removed from those two routes only); `deleteUserCoachData`
  stops deleting push tokens; account deletion still removes them. Every coach push sender (digest legacy, insight,
  any coach-originated kind) checks coach enabled + current consent before sending, so turning the coach off still
  stops coach pushes while recap pushes continue. Mobile registers the token (lib/pushRegistration.ts) when the user
  first turns on a notification-backed feature — the "Recap ready" switch, or the coach as today — instead of only
  with the coach; denied OS permission is never re-prompted. The "Recap ready" switch is shown whenever the device
  can show notifications, with the coach on or off.

**Notification setting.** New `User.recapPushEnabled Boolean @default(true)`; new routes
`GET /me/notifications` → `{ recapPushEnabled }` and `PUT /me/notifications` (partial, boolean validated, 400
`invalid_settings` otherwise).

**Late data (one rebuild).** The hourly sweep also checks recaps whose period ended ≤ 3 days ago:
- **BUILT, `openedAt` null, `rebuiltAt` null.** Timestamps are only a cheap first filter. Every sync sets `syncedAt`
  to now even when the value is unchanged, and the catch-up sweep re-fetches recent days every three hours, so a newer
  timestamp does not mean new data. When any SLEEP or STEPS `BiometricRecord.syncedAt` or `DailyScore.updatedAt` in
  the period is newer than `builtAt`, the sweep recomputes the section-1 stats and compares them with the stored
  `stats`. Equal → nothing happens and `rebuiltAt` stays null. Different → the recap is rebuilt (numbers and coach
  text) and `rebuiltAt` set.
- **Scores must have caught up first.** A rebuild waits for a later hour inside the window until, for every date in
  the period that has a score, `DailyScore.updatedAt` ≥ that date's SLEEP rollup `syncedAt` (the nightly sweep's own
  staleness test). STEPS are left out of this test because a STEPS change never triggers a rescore.
- **SKIPPED.** The sweep recounts `nightsWithData`. If the period is now eligible, the row becomes a normal BUILT
  recap. This is its first build, so it pushes once and may still have its one rebuild.

Opened or rebuilt recaps never change. A rebuild does not push again. After the 3 days a SKIPPED row is final.

**Launch backfill.** On first deploy a one-off job builds, per user, the last 4 weeks and last 3 months (AI text as
normal, `pushedAt` set so no push), so the Recaps screen is not empty.
It is enqueued **before** the hourly sweep is first registered and covers every period still inside the due window,
so the sweep finds those rows already built. Backfill jobs use the sweep's job ids and carry `noPush`; the sweep's
add for the same id is ignored while a backfill job is queued or running. As a backstop for a failed backfill job,
the sweep never pushes for a WEEK that already has a `CoachDigest` row, because the old digest announced that week.

**Endpoints.**
- `GET /me/recaps?kind=WEEK|MONTH&limit=` → BUILT recaps newest first (summary fields).
- `GET /me/recaps/:id` → full recap; pure read. Another user's id or a SKIPPED row → 404.
- `POST /me/recaps/:id/opened` → idempotently sets `openedAt` (called by the app when the recap is actually shown).

## 3. Screens, the image and sharing

**Entry points.** A "Your recaps" row on the Sleep screen opens a new **Recaps** screen (latest MONTH, latest
WEEK, older ones, and Year in pixels). Home shows a dismissible "Your {Month} recap is ready" / "Your week is ready"
card while the newest recap is unopened. The coach screen's weekly digest entry opens the WEEK recap's story.

**Push taps.** The notification response handler (cold start via the last response, warm via the listener) gains a
`recap` route: `data.kind === 'recap'` → navigate to that recap; other data is ignored as today. Cold-start and
warm-start taps are both tested. (A free-team device build cannot receive remote pushes; verify on the simulator
with a simulated push payload.)

**Screens.**
1. **Month in the app (1d)** — "{Month} with {Coach}", the line, milestones achieved, "Compared with last month"
   (avg sleep, bedtime spread, avg recovery with ± arrows; only present comparisons), "Make a shareable recap".
2. **Monthly card (1)** — "MY {MONTH}", pixel coach + name, the quote, up to four stats (avg sleep, longest
   streak, best recovery, steps), app name.
3. **Weekly story (1a)** — 9:16: "How {Coach} saw my week", Mon–Sun strip coloured by on goal, best night, the
   quote, app name; the in-app week view also shows the `story` paragraph under the card.
4. **Year in pixels (1b)** — grid, one cell per night of the calendar year (on goal / short / no data),
   "{N} nights on goal", "on your current goal of {goal}", app name; shareable.
5. **Build your recap (1c)** — format (monthly card 1:1, weekly story 9:16, year in pixels 1:1), include
   switches (each available stat, the quote, the coach character), live preview, "Only you see this until you
   share", **Save image** (Photos; asks permission first time) and **Share** (system share sheet). Switches for
   missing stats are hidden; choices persist per format in **SecureStore** (like the other device settings).

**Look.** App fonts (Geist, Instrument Serif), the user's pixel coach, app colours incl. the stage colours (year
pixels: on goal `sleepDeep`, short a muted track). Share images always render in the dark theme. In-app screens
follow light/dark.

**Image.** The on-screen preview is scaled to fit and is never captured. The export renders a separate **off-screen
view** designed on a 360×360 (card, year) or 360×640 (story) grid and captures it with Skia `makeImageFromView`.
That call has no scale argument and captures at the device's pixel ratio, so the view is laid out
1080 / `PixelRatio.get()` logical points wide (the design grid scaled by 3 / pixel ratio). The capture is then
1080×1080 / 1080×1920 on any device, 2x included. PNGs are written to the cache directory, then saved
with `expo-media-library` or shared with `expo-sharing` (new native modules → one iOS rebuild).

**Privacy.** Nothing leaves the phone until Save/Share. Images never include name or email, and only the numbers
left switched on.

## 4. Errors and edge cases

- Thin data → SKIPPED row, no recap/push; per-stat omission; builder hides missing stats. A SKIPPED period that
  becomes eligible within 3 days is built and pushed then.
- A resync with unchanged values → no rebuild; the one allowed rebuild is kept for a real change.
- Coach off → recap pushes still arrive (app-level push token); coach pushes stop. Denied OS permission → Home card only.
- Coach data deleted → recap numbers stay; AI lines become template lines and stories are removed.
- Previous period thin or absent → no comparison / no earlier-bedtimes fact (so the coach can't mention them).
- Time zones → each user's own zone decides due-ness; nights keyed by their own end date.
- Server down on the Monday / the 1st → built later inside the 7 / 10-day window, still pushed once.
- Coach failures (down, slow, invalid twice, disabled, no consent) → template line; recap always built.
- Photos permission denied → Save explains how to allow it in Settings; Share still works. Capture failure → a
  short retry message.
- Account deletion → recaps removed via `USER_OWNED_MODELS`.

## 5. Testing

Backend (Jest, test DB): each number definition on hand-built periods (thin data, streak across a gap, first period
with and without earlier history, goal snapshot), previous-period comparison from raw data, milestone rules,
eligibility and SKIPPED rows, due-window maths (Monday 07:59 not due, Tuesday due, day 8 not due; same for months),
dedupe on rerun, late-data rebuild (sleep, steps and score changes; a resync with unchanged values neither rebuilds
nor spends the rebuild; waits for scores per date; only once; never after open), a SKIPPED period that becomes
eligible inside 3 days is built and pushed once, `exactNumbers` validator (6 vs 5 nights rejected, 88 vs 87 recovery
rejected, "7-night streak" checked rather than exempt, a steps sentence cannot borrow a night count, bare numbers,
hedges, existing callers unchanged), line and story paths (AI accepted, invalid → retry → template, coach off/no
consent/reactive-only → no AI call), digest endpoint served from the WEEK recap, push kinds and `data` allowlist, push token registration with the coach off, coach-data deletion keeping tokens, coach push senders refusing when the coach is off while recap pushes still send,
`recapPushEnabled` and token gating, settings routes, recap endpoints (404s, pure GET, idempotent opened), deletion
test with `Recap` in `USER_OWNED_MODELS`, coach-data deletion clears stories and AI lines, backfill (no push; the
sweep does not push for a week that has a `CoachDigest`).
Mobile (Jest/RNTL): each screen from a stored recap, builder switches change the preview, off-screen export size at
pixel ratios 2 and 3, year-pixel colouring/count/caption, Save permission-denied path, Share called with the captured
file, push-tap routing cold and warm, Home ready card shows and dismisses, opened call made once.
Simulator/device: trigger a WEEK and MONTH build for the owner, simulated push tap, each screen, both share formats
and a saved image; light and dark in-app.

## 6. Rollout and risk

Additive migration; new native modules need a dev-client rebuild; the digest cron is replaced by the recap sweep in
the same deploy. Hosted coach cost: one or two calls per eligible user per week/month plus the one-off backfill.
Remaining risk: comparison direction words ("higher"/"lower") are not checked by the validator; mitigated by stating
direction in the prompt and by templates.

## 7. Rulings made in revision (owner may override)

- Comparison and earlier-bedtimes use raw previous-period data, not stored recaps.
- Year in pixels uses the current goal and says so; monthly recaps keep their snapshot.
- Due window 7 days (WEEK) / 10 days (MONTH); SKIPPED rows for thin periods.
- Late-data rebuild covers sleep, steps and scores, waits for scores, happens at most once, only before opening.
- Launch backfill: last 4 weeks + 3 months with AI text, no push.
- Opening is a separate POST, not a side effect of GET.
- Reactive-only personas get a template line and no story (as the digest did).

Second revision:
- A late-data rebuild fires only when the recomputed stats differ; a SKIPPED period is re-checked for 3 days.
- The recap number check is exact for every integer and has no window exemptions.
- Coach-data deletion replaces AI lines with template lines and removes stories; recap numbers stay.
- Push tokens become app-level so recap pushes reach every user with notifications allowed (owner decision, 2026-10-04); coach pushes still require the coach on and consent.
- The weekly story covers only the recap numbers, narrower than the old digest.
- The launch backfill is enqueued before the sweep; the sweep never pushes for a week that has a `CoachDigest`.
