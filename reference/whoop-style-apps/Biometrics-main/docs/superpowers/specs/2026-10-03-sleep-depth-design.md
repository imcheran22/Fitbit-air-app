# Sleep depth: design

**Date:** 2026-10-03
**Branch:** `feature/sleep-depth`, stacked on `worktree-pixel-coaches` (PR #47). Rebase onto `main` once #47 merges.
**Status:** approved in conversation, awaiting written-spec review.
**Mockups:** growth canvas https://claude.ai/artifact/JHqksi4S4DpFXNiFJho97e, row "8 · Sleep window" (screens 8, 8a, 8c, 8d; 8b was skipped). Picks and notes: https://claude.ai/artifact/3sPCoqZWwFCjF6muR9rCs1.

## Context: the growth roadmap

The owner picked 35 of 36 growth mockups. They are split into sub-projects, each with its own spec, plan and build:

| # | Sub-project | Screens |
|---|---|---|
| **A** | **Sleep depth (this spec)** | 8, 8a, 8c, 8d |
| B | Recap and sharing | 1, 1a–1d |
| C | Social foundation and buddies | 2, 2a–2d |
| D | Invites and outfits | 3, 3a–3d |
| E | Group challenges | 9, 9a–9d |
| F | Apple Health | 7, 7a–7d |
| Later | Widgets, coach growth, morning briefing (briefing time is fully user-set, default 09:00) | 4, 4b, 5, 5b, 6, 6b |

## Goal

Give sleep its own screen with four things:
- **A sleep window chart:** a bar from bedtime to wake for each night.
- **A sleep regularity score:** how regular bedtime and wake time are (a separate measure from the Sleep score's Bedtime consistency factor).
- **A one-night detail screen:** with Google Health's sleep stages (deep, light, REM, awake) plus time in bed, time awake, time to fall asleep and time after waking. This is the owner's note on 8c.
- **A bedtime goal:** with a wind-down reminder scheduled on the phone.

### Decisions (from the brainstorm)

| Topic | Decision |
|---|---|
| Stage source | Google Health `sleep` dataPoints. The live check (2026-10-03) confirmed the fields below. |
| Placement | A **new dedicated Sleep screen**, opened from the Home sleep card. The Activity tab keeps its calendar. |
| Reminder | **A local notification scheduled on the phone.** No server job, works with the coach off. |
| Sleep goal | The existing sleep goal (minutes asleep, default 480) stays. Bedtime and wake goals are added beside it. |
| Stage history | Stored for every synced night, including the existing year-long backfill. |
| Goal change → scores | **From today on.** Today's score is recomputed with the new goal; past scores keep theirs and record the goal they used. |

## Non-goals

- New scoring inputs or a different scoring formula. Stages are display data only in this sub-project. The one scoring-related change is that the existing sleep-goal input becomes user-editable; §2 "Sleep goal and scores" defines exactly what that does.
- The month calendar with sleep windows (8b, skipped).
- Server-sent sleep reminders, or reminders that adapt to last night.
- Apple Health stages (sub-project F).
- Sharing any sleep data (B, C).

## 1. What Google returns (live check, 2026-10-03)

`GET https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints`, the same endpoint as today. Each dataPoint has these fields (values are strings unless noted):

```
sleep.interval            { startTime, startUtcOffset, endTime, endUtcOffset }   // already read
sleep.type                "STAGES" (other values exist for devices without stage tracking; store as-is)
sleep.stages[]            { startTime, startUtcOffset, endTime, endUtcOffset, type, createTime, updateTime }
                          type ∈ AWAKE | LIGHT | DEEP | REM
sleep.metadata            { stagesStatus: string, processed: boolean, mainSleep: boolean }
sleep.summary             { minutesInSleepPeriod, minutesAfterWakeUp, minutesToFallAsleep,
                            minutesAsleep (already read), minutesAwake,
                            stagesSummary[]: { type, minutes, count } }
sleep.shortAwakenings[]   { startTime, startUtcOffset, endTime, endUtcOffset, type }   // not used in this spec
```

Numbers arrive as numeric strings, like the existing `minutesAsleep` parsing. A missing or unparseable field is stored as `null` and never invents a value. An unknown stage `type` is skipped, never coerced.

## 2. Data (backend)

### Schema

```prisma
enum SleepStageType { AWAKE LIGHT DEEP REM }

model SleepStage {
  id        String         @id @default(uuid())
  sessionId String
  session   SleepSession   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  type      SleepStageType
  startTime DateTime
  endTime   DateTime
  @@index([sessionId, startTime])
}
```

`SleepSession` gains these fields, all nullable:
- **Google's night summary:** `sleepType String?`, `mainSleep Boolean?`, `minutesInSleepPeriod Float?`, `minutesAwake Float?`, `minutesToFallAsleep Float?`, `minutesAfterWakeUp Float?`
- **Minutes per stage:** `deepMinutes Float?`, `lightMinutes Float?`, `remMinutes Float?`, `awakeMinutes Float?` (from `stagesSummary`)
- **The relation:** `stages SleepStage[]`

`User` gains `bedtimeGoal String?` and `wakeGoal String?` (local `"HH:MM"`, null = not set). `HealthConnection` gains `sleepStagesBackfilledAt DateTime?`.

One migration, `20261003120000_sleep_stages`, adds all of this. Every new field is nullable, so old rows and old app builds are unaffected.

### Sync

- `fetchSleepSessions` (`backend/src/health/client.ts`) parses the fields in §1 into `SleepSessionPoint` (new optional fields plus `stages: {type, start, end}[]`).
- `upsertSleepSessionsTouched` (`backend/src/biometrics/repository.ts`) stores the summary fields. In the same transaction, it replaces the session's `SleepStage` rows: delete them, then insert. A resync of a night therefore never duplicates stages.
- **Unchanged rollups are not rewritten.** Today `recomputeSleepRollups` (`repository.ts:118`) writes the SLEEP rollup row for every touched date and bumps its `syncedAt`, even when the total is unchanged. The nightly sweep (`scoring/sweep.ts`) treats a rollup newer than its score as stale and rescores, up to 90 days back. From now on the rollup is written, and `syncedAt` bumped, **only when the total `value` changes**. A resync that only adds stage data therefore leaves `syncedAt` alone and triggers no rescore. Session rows still update; the sweep reads the rollup's `syncedAt`, not theirs.
- **Stage backfill:**
  - The existing `backfillSleepHistory` now stores stages automatically, because it goes through the new parser. When it finishes, it sets `sleepStagesBackfilledAt` as well as `sleepHistoryBackfilledAt`. New connections therefore fetch a year of sleep once.
  - A new job, `backfillSleepStages`, is only for connections that predate this change: `status = CONNECTED`, `sleepHistoryBackfilledAt` set, and `sleepStagesBackfilledAt` null.
    - It re-fetches the same window through the same upsert and then sets its marker.
    - It is queued once at startup for those connections, and skips any connection that is not CONNECTED.
    - Thanks to the rollup rule above it causes no rescoring, except on a date whose sleep total genuinely changed upstream. That is correct and the same as a normal sync.

### The main session of a night

One rule, in one helper, `pickMainSession(sessions)` (`backend/src/biometrics/mainSession.ts`): **the session with the most `minutesAsleep`; ties go to the earliest start.** This is the rule scoring already uses (`scoring/features.ts` `mainSessionOnsets`), so scoring is unchanged and now imports the helper.
- `/me/sleep`, the night endpoint and the regularity endpoint all use it. Every other session ending that date is a nap.
- `/me/sleep` currently picks the longest interval (`activity.ts:137`), so its `bedtime` and `wakeTime` move to this rule. They differ only on a date with several sessions.
- Google's `mainSleep` flag is stored but not used to choose, so the chart, the night screen, the regularity card and scoring can never disagree about a night's bedtime.

### Sleep goal and scores

The sleep goal is an existing scoring input: the 14-day sleep-debt factor (`scoring/features.ts:10-25`, passed in at `scoring/compute.ts:88`). Until now nothing could change it. `PUT /me/sleep/goal` is the first route that can. When `sleepGoalMinutes` changes:
- **Only today is rescored.** The route enqueues one score job for the user's current local civil date through the existing score queue. Past scores are not touched.
- **Scores record their goal.** Every score computed from now on stores the goal it used, as `sleepGoalMinutes`, in its `factors` JSON next to the sleep-debt factor.
- **"Why this score"** shows the sleep-debt factor as "vs your goal of {h}h {m}m" using the stored value. A score computed before this change has no stored goal, so it shows the factor without naming a goal and never guesses.
- **Bedtime and wake goals** are display and reminder settings only. They never affect scoring.

### Endpoints

All require auth. All dates are the night-END civil date, as today.

- **`GET /me/sleep`** (existing). Each night gains `minutesAwake: number|null`, `stageMinutes: {deep, light, rem, awake}|null` and `hasStages: boolean`, all from the night's main session (above).
  - `hasStages` is true only when the main session has **at least one DEEP, LIGHT or REM stage**. A night with only AWAKE segments, possible from devices without stage tracking, counts as having no stages.
  - The response gains `stagesBackfillPending: boolean`. It is true only while the user's connection is CONNECTED **and** `sleepStagesBackfilledAt` is null, so a disconnected user never sees it.
  - Every existing field keeps its meaning. `bedtime` and `wakeTime` follow the single main-session rule.
- **`GET /me/sleep/night/:date`.** 404 `{error:'not_found'}` if the date has no session. Response:
  ```ts
  {
    date, bedtime, wakeTime,                       // "HH:MM" local, main session
    minutesAsleep, minutesInBed,                   // minutesInSleepPeriod ?? interval length
    minutesAwake, minutesToFallAsleep, minutesAfterWakeUp,   // number|null
    hasStages,
    stages: { type: 'AWAKE'|'LIGHT'|'DEEP'|'REM', start: string, end: string }[],  // ISO, main session, ordered
    stageTotals: { deep: {minutes, count}, light: {...}, rem: {...}, awake: {...} } | null,
    naps: { start, end, minutesAsleep }[],         // non-main sessions ending that date
    sleepScore: number|null,
    usualMinutesAsleep: number|null                // average over the 30 nights before this date; null unless at least 7 of them have data
  }
  ```
  `hasStages` here uses the same definition as in `/me/sleep`. Without stages, `stages` is `[]` and `stageTotals` is null.
- **`GET /me/sleep/regularity?days=7|30`** (anything else → 400). This is named *regularity* on purpose: it is a different measure from the Sleep score's "Bedtime consistency" factor, which covers bedtime only, over 14 days, with at least 7 nights in the window and 14 of history (`scoring/configs/v1.ts:139`). It uses the main session per night (above), and times in minutes from local noon, so after-midnight bedtimes sort correctly. Response:
  ```ts
  {
    days, nights,                                  // nights with a main session in the window
    score: number|null,                            // null when nights < 4 (7d) or < 15 (30d)
    bedtimeSpreadMinutes: number|null, wakeSpreadMinutes: number|null,   // standard deviation
    averageBedtime: string|null, averageWake: string|null,              // "HH:MM"
    drift: { date, bedtimeOffsetMinutes }[]        // vs averageBedtime, one per night with data
  }
  ```
  `score` uses the same spread-to-score maths as the scoring engine (`100·max(0, 1 − std / maxStdMinutes)`, `maxStdMinutes` 120). That maths moves into one exported helper both callers import. Here it is applied to bedtime and to wake time and the two are averaged. The scoring factor's own window, minimums and output are unchanged.
- **`GET /me/sleep/goal`** → `{ sleepGoalMinutes, bedtimeGoal: string|null, wakeGoal: string|null }`.
- **`PUT /me/sleep/goal`** takes the same shape, partial: any subset of the three fields.
  - `sleepGoalMinutes` is an integer from 240 to 720.
  - `bedtimeGoal` and `wakeGoal` match `^([01]\d|2[0-3]):[0-5]\d$`, or are null.
  - Anything invalid → 400 `{error:'invalid_goal'}`; a missing user → 404.
  - It returns the saved goal.
  - If `sleepGoalMinutes` changed, it enqueues today's rescore (see "Sleep goal and scores").

## 3. Screens (mobile)

Colours follow the existing sleep purple (`#9333EA` and the `sleepHeat1..4` ramp in `theme.ts`). Stage colours are new tokens:

| Stage | Token |
|---|---|
| Deep | `sleepDeep` (darkest purple) |
| REM | `sleepRem` (mid) |
| Light | `sleepLight` (light purple) |
| Awake | `sleepAwake` (orange `#FB923C`) |

Each token has light and dark mode values, and a contrast test checks them.

### Sleep screen (new, `screens/SleepScreen.tsx`, route `Sleep`)

- **Entry points:**
  - The Home sleep card opens it. Before this change the card opened `ScoreDetail` for SLEEP; the Sleep screen's score header now links there with "Why this score".
  - The Activity tab's Sleep page header gets a "Sleep details" link.
- **Layout, top to bottom:**
  1. **Score header:** today's Sleep score with "Why this score" → `ScoreDetail`.
  2. **Range toggle:** Week or Two weeks.
  3. **Window chart (8):** one bar per night from bedtime to wake, on a 21:00–09:00 axis. The axis extends to fit bars outside it. Dashed lines mark the average bedtime and wake time, and a faint band shows the goal window when one is set. Missing nights are gaps. Tapping a bar opens that night.
  4. **Sleep regularity card (8a):** a score ring titled **"Sleep regularity"**, never "consistency", with a caption: "Bedtime and wake time over the last {7|30} nights. Your Sleep score's Bedtime consistency uses bedtime over 14 nights." The card shows bedtime and wake spread (±minutes) and a 7-night drift strip, with nights more than 30 minutes off highlighted in orange. It reads `GET /me/sleep/regularity`, and ends with a one-line comment in the coach's voice.
     - The comment is chosen from fixed templates per band (steady / drifting / irregular) and includes the coach's name. It is never generated, so it can't state a number that wasn't checked.
     - With too few nights the card reads "Not enough nights yet. [n] more to go."
  5. **Last night:** time asleep, a mini stage strip, and "See the whole night".
  6. **Bedtime goal row:** the goal times (or "Set a bedtime goal") and the reminder state.
- Each section loads and fails on its own, with its own retry.
- While `stagesBackfillPending` is true, the screen shows what it has plus a "Reading older nights…" line.

### One night in detail (8c, `screens/SleepNightScreen.tsx`, route `SleepNight { date }`)

- **Header:** the date and time asleep.
- **Stage strip:** the night's timeline in stage colours, with bedtime and wake at the ends.
- **Stage breakdown:** deep, light, REM and awake, each with minutes, percentage of time asleep (awake as a percentage of time in bed) and count.
- **Night numbers:** time in bed, time awake, time to fall asleep, time after waking, Sleep score, and the difference from your usual night.
- Naps are listed under the night numbers.
- **Ask button:** "Ask {coach} about this night" opens the Coach chat with "How was my sleep on {date}?" in the input box, not sent.
- **No stages** (`hasStages` false): the strip and breakdown are replaced by today's asleep/in-bed share bar.
- The existing Activity night sheet (`components/activity-sheets.tsx` `NightDetail`) gains an "Open full night" link to this screen.

### Bedtime goal (8d, `screens/BedtimeGoalScreen.tsx`, route `BedtimeGoal`)

- **Times:** bedtime and wake time, each with −/+ buttons in 15-minute steps. A live line underneath reads "That's {h}h {m}m in bed. Your goal is {goal} asleep.", in orange when the window is shorter than the goal.
- **Sleep goal:** a stepper in 15-minute steps from 4h to 12h. The Activity heat map stops hard-coding 480 and reads this goal.
- **Saving:** Save PUTs the goal. On failure the screen goes back to the saved values and shows "Your goal couldn't be saved. Check your connection and try again."
- **Wind-down reminder:**
  - An on/off switch and a lead time of 15, 30, 45 or 60 minutes.
  - A preview of the notification: "{Coach}: Wind-down time. Bed in {lead} min."
  - **Permission.** Turning the switch on first reads the current permission with `getPermissionsAsync`. Coach push may already have asked (`lib/pushRegistration.ts`).
    - **Already granted:** schedule straight away, with no prompt.
    - **Not asked yet:** request permission now, then schedule if granted.
    - **Already denied, or declined now:** the switch turns back off and shows "Notifications are off for Biometrics. Turn them on in Settings." with a link to the app's Settings page. It never re-prompts, because iOS won't show the dialog again.
  - It needs a bedtime goal; without one the switch is disabled and says "Set a bedtime first".

### Wind-down scheduling (`lib/windDown.ts`)

- Reminder settings (enabled, lead minutes) stay on the device, in SecureStore, like the character cache.
- **Scheduling:** `expo-notifications` `scheduleNotificationAsync` with a daily trigger at bedtime minus the lead time, in device local time. The returned identifier is stored.
- **Rescheduling:** the reminder is cancelled and scheduled again whenever bedtime, lead time or the switch changes, and on each app return to the foreground, which also covers time-zone changes and the OS dropping it. Only one reminder ever exists.
- **Content:** the notification carries `data: { kind: 'wind-down' }`.
- **Shown while the app is open.**
  - The app sets a notification handler at startup (`Notifications.setNotificationHandler`). It shows banner, list and sound **for `kind: 'wind-down'` only**, and keeps today's behaviour for everything else (coach pushes stay as they are).
  - Without this handler, iOS hides notifications while the app is in the foreground.
- **Tapping it** opens the Sleep screen. The app reads `getLastNotificationResponseAsync` at launch, for a cold start, and adds a response listener while running. Both navigate to `Sleep` when `kind` is `wind-down`.
- **Session teardown:** the reminder is cancelled and its settings cleared in the shared local-session teardown (`auth/AuthContext.tsx` `dropLocalSession`). Sign-out and account deletion (`clearSession`) both go through it.

## 4. Testing

- **Backend:**
  - Parsing a dataPoint with stages and without stages, using synthetic values in the live shape from §1.
  - Unknown stage types and numeric strings that don't parse.
  - The upsert replaces stages on resync.
  - **Repository level:** storing sessions whose daily total is unchanged leaves the SLEEP rollup's `syncedAt` unchanged. A real total change still bumps it. After a stage-only resync, the sweep finds no stale day.
  - **Backfill:** the history backfill sets both markers. The stage job only selects CONNECTED connections with the history marker set and the stage marker null.
  - **`pickMainSession`:** ties, naps, and scoring still producing identical onsets (existing scoring tests stay green).
  - **`GET /me/sleep`:**
    - the additions
    - `hasStages` false for an awake-only night
    - `stagesBackfillPending` false for a disconnected connection
  - **Night endpoint:** main session versus naps, no stages, 404, and `usualMinutesAsleep` null below 7 nights.
  - **Regularity:** an after-midnight bedtime, too few nights, and the 7 and 30 day windows.
  - **Goal:**
    - GET, and PUT with invalid bodies
    - a goal change enqueues exactly one rescore, for today
    - a new score stores the goal it used
    - "Why this score" names a stored goal and omits it for an old score
- **Mobile:**
  - The window chart's pure layout maths: scale, axis extension, gaps, and the average and goal lines.
  - Each screen in loading, error, empty, no-stages and too-few-nights states.
  - Goal save and rollback.
  - **Reminder** (notifications mocked):
    - scheduling, rescheduling, and cancelling on off, sign-out and account deletion
    - permission already granted (no prompt), not yet asked, already denied (no prompt), and declined
    - the foreground handler shows `wind-down` only
    - tapping a reminder, warm and cold start, opens the Sleep screen
  - The Home card now opens the Sleep screen.
  - Stage colour contrast in both themes.
- **Simulator:** with the owner's real account:
  - the Sleep screen
  - a night with stages
  - the goal
  - a reminder fired by setting bedtime a few minutes ahead, checked once with the app open and once in the background, then tapped to open the Sleep screen

## 5. Rollout and risk

- **Order:** backend first. The new fields are additive, so old app builds ignore them.
- **Backfill load:** the stage backfill re-fetches up to a year of sleep per connection once. That's the same volume as the existing history backfill, paginated.
- **Unverified:** the live check covered three recent nights on one device, all `STAGES`. Older devices may send another `sleep.type` with a different stage set; those stages are skipped and the night falls back to no stages. The spec relies on the summary fields, never on `sleep.type` values.
- **Home card:** the Home sleep card's destination changes, from score detail to the Sleep screen. Score detail is still one tap away.
- **Scores:** the only scoring effect is the goal rule ("Sleep goal and scores"): today's score can change when the user changes their goal. History is never rescored by this sub-project. The rollup rule removes the one-off rescore the stage backfill would otherwise have caused.
- **Bedtimes in `/me/sleep`:** on dates with several sessions, `bedtime` and `wakeTime` can change, because the main session rule changes from longest interval to most minutes asleep. This matches scoring.
