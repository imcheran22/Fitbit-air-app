# Achievements (badges) — design

Growth sub-project after B (Recap). Status: approved in brainstorming with the owner on 2026-10-05; revised
2026-10-06 after a spec review (owner decisions on late check-ins and goal changes).
Visual reference: canvas https://claude.ai/artifact/G41SNEnLjSbhhPjAnzyXMZ (badge catalogue, Profile, badge detail,
unlock celebration, recap placement).

## 1. Goal

Reward healthy habits kept over time with badges that level up, shown on the profile, celebrated in the app when
earned, and shown in the weekly / monthly recap of the period they were earned in.

Success: a person sees their progress toward the next level, gets one celebratory moment per new level, and the
recap for the week/month they earned it lists it. Levels never disappear.

Owner decisions:
- Badges reward **healthy habits over time** (streaks, consistency, monthly milestones) — not app exploration.
  Two monthly families (Best recovery week, Steadiest month) are personal-best milestones; that is intended — the
  owner chose to turn the recap milestones into badges.
- **Levels**, five per family: I Bronze · II Silver · III Gold · IV Diamond · V Coach (the user's coach colour).
  Coach is deliberately long-term (100 nights, 180 days, 24 months).
- **Start fresh:** only days/months from each user's start date count; history before it awards nothing.
- **Unlock moment:** in-app full-screen celebration (next app open) + shown in that period's recap. **No push.**
- **Late check-ins:** only check-ins made during their own habit day (the app's 4am boundary) count toward the
  check-in streak.
- **Goal changes:** a streak restarts only when its goal gets easier (sleep goal lowered; bedtime goal moved by more
  than 30 min, or a first bedtime goal set more than 30 min from the usual bedtime). Otherwise each night is judged
  against the goal in effect that night.
- Approach A: awarded server-side once, stored, never revoked.

## 2. Catalogue

| Family (`family` key) | Kind | A day / month counts when… | I | II | III | IV Diamond | V Coach |
|---|---|---|---|---|---|---|---|
| Sleep goal streak (`SLEEP_GOAL`) | streak | the night's total sleep (the SLEEP daily rollup — Recap's definition) ≥ the sleep goal in effect for that night | 3 | 7 | 14 | 30 | 100 nights |
| Steady bedtime (`STEADY_BEDTIME`) | streak | fell asleep within ±30 min of the bedtime goal in effect that night; with no goal, of the median bedtime of the previous 14 nights that have sleep data (may include nights before the start date; needs ≥ 7) | 3 | 7 | 14 | 30 | 100 nights |
| Step goal streak (`STEP_GOAL`) | streak | a finished local day with steps ≥ `STEPS_GOAL` (10,000, `backend/src/coach/tools/metrics.ts`) | 3 | 7 | 14 | 30 | 100 days |
| Daily check-in (`CHECK_IN`) | streak | a `HabitCheckIn` exists for that habit day **with `onTime = true`** (made during that habit day, see §3) | 7 | 14 | 30 | 60 | 180 days |
| Best recovery week (`BEST_RECOVERY_WEEK`) | monthly | that month's recap has the `bestRecoveryWeek` milestone | 1 | 3 | 6 | 12 | 24 months |
| Every day logged (`EVERY_DAY_LOGGED`) | monthly | that month's recap has the `everyDayLogged` milestone | 1 | 3 | 6 | 12 | 24 months |
| Steadiest month (`STEADIEST_MONTH`) | monthly | that month's recap has the `steadiestMonth` milestone | 1 | 2 | 4 | 6 | 12 months |

Monthly milestone rules are unchanged from the Recap spec (`backend/src/recap/stats.ts` `milestonesOf`).

**Levels are awarded from the best value**, not the current one: the evaluator walks every qualifying run since the
family's start date and awards each level whose threshold any run reached, so a streak that happened and ended inside
a single catch-up sync still earns its levels. A higher level needs a single run of that length (not cumulative).
Levels are **never revoked**.

## 3. Data

- New table `Achievement`: `id` uuid, `userId` (cascade delete; add to `USER_OWNED_MODELS`; NOT part of coach-data
  deletion), `family` enum `AchievementFamily`, `level` int 1..5, `value` int (the threshold reached),
  `earnedOn` `@db.Date` (local date the run first reached the threshold; for monthly: the month's last day),
  `weekStart` `@db.Date` (Monday of earnedOn), `monthStart` `@db.Date` (1st of earnedOn's month), `createdAt`,
  `celebratedAt` nullable. `@@unique([userId, family, level])`, index `(userId, celebratedAt)`.
- `User.achievementsSince` `@db.Date`, nullable. **Single definition:**
  - existing users: the user's local date on launch day, set by a one-off **launch job** at deploy (Redis once-marker,
    like `RECAP_BACKFILL_MARKER` in `recap/backfill.ts`) that writes it **only where it is null** — a lost marker and
    a rerun can never move anyone's start date;
  - new users: left null at sign-up (the Better Auth row is created before the app reports the real time zone via
    `PUT /me/timezone`) and set on the user's **first badge load** (`GET /me/achievements`) to their local date then.
  Never changed once set. The starting `GoalChange` rows (below) are written at the same moment — by the launch job
  for existing users, by the first badge load for new users (no Better Auth hook).
  The launch job also sets `onTime` for check-ins already saved on launch day before the deploy (recomputed once from
  `createdAt` with `habitDayFor` and the user's zone at launch), so launch day counts for them.
- `HabitCheckIn.onTime` boolean, default false: set **when the row is written** by `POST /me/habits/check-ins` to
  `habitDay === habitDayFor(now, user.timezone)` (the app's 4am habit-day boundary, `habits/habitDay.ts`). Stored, never
  recomputed, so a later time-zone change can't rewrite history. Backdated check-ins save as before with `onTime = false`.
- New table `GoalChange`: `id`, `userId` (cascade delete **and** listed in `USER_OWNED_MODELS`), `kind` enum
  (`SLEEP_MINUTES` | `BEDTIME`), `sleepMinutes` Int? (for `SLEEP_MINUTES`), `bedtime` String? "HH:MM" (for `BEDTIME`;
  null = goal cleared), `effectiveOn` `@db.Date` (the user's local date of the change), `resetsStreak` boolean,
  `createdAt`, `@@unique([userId, kind, effectiveOn])` — **only the last change of a day counts** (a second change the
  same day overwrites that day's row). Written in one place, `updateSleepGoal` (`users/goals.ts`), whenever the sleep
  goal or bedtime goal changes. `resetsStreak` compares the new value with the goal in effect **before that day**
  (so lowering and restoring on the same day is no reset):
  - sleep goal: `resetsStreak = newMinutes < previousMinutes`;
  - bedtime goal: `resetsStreak` = moved by > 30 min (circular minutes), or set for the first time > 30 min from the
    current usual bedtime (median of the previous 14 nights with data; no usual bedtime → true), or cleared.
  **A change applies only to nights that end after its date:** the goal in effect for a night = the latest change
  with `effectiveOn` **<** the night's wake date. Changing the goal in the evening never re-judges the night you
  already slept that morning.
- No progress table: runs and month counts are computed on demand from existing data (SLEEP and STEPS rollups,
  `SleepSession` main-session starts, `HabitCheckIn`, `Recap.stats.milestones`), from the family's start date.

## 4. Rules in detail

- **Dates.** Sleep families use each night's local wake date (the date of its SLEEP rollup, as Recap and sleep depth
  do). Steps use the user's local calendar day (`User.timezone`). Check-ins use their stored `habitDay` and stored
  `onTime` flag — nothing is recomputed from the current time zone.
- **Family start date** = max(`achievementsSince`, the day after the latest `GoalChange.effectiveOn` with
  `resetsStreak` for that family's kind) — a reset streak starts from the next night. Steps and check-in use
  `achievementsSince`. Monthly families count only months whose 1st is ≥ `achievementsSince`.
- **Paused vs broken (synced families only).** A run is consecutive qualifying dates. For Sleep goal, Steady bedtime
  and Step goal — whose data arrives by sync — a date with no data breaks a run only if a later date has data, or the
  date is more than 2 days before today (local); otherwise the latest run is paused (late sync never costs a streak).
  **Check-ins never pause:** a check-in is never late, so a habit day without an on-time check-in breaks the
  check-in streak as soon as that habit day is over. `current` = the latest run if it is unbroken, else 0.
- **Today.** Steps: today never counts until it is over. Check-in: today counts as soon as a same-day check-in exists.
  Sleep families: a night counts once its rollup has arrived.
- **Steady bedtime**: bedtime = the main session's start (the noon-anchored main session, as Recap's bedtime) in local
  time, compared as minutes on a circle around midnight. Nights without a goal and with < 7 prior nights of data
  neither count nor break.
- **Monthly count** = number of BUILT month recaps with `periodStart ≥ achievementsSince` whose stored milestones
  contain the family's key. A rebuild that gains a milestone awards then; a rebuild that loses one revokes nothing.

## 5. Evaluation (backend)

- `evaluateAchievements(userId, now, families)` computes each family's runs (or month count) since its start date and
  inserts every level whose threshold the best run reached and that isn't stored (`createMany`, `skipDuplicates`),
  with `earnedOn` = the date that run first reached the threshold. Idempotent; safe to run twice or concurrently
  (the unique key decides).
- **Trigger: on load only.** `GET /me/achievements` evaluates all families inline before answering, at most once per
  user per 10 minutes (a Redis marker). Saving a check-in (`POST /me/habits/check-ins`) and saving a goal
  (`updateSleepGoal`) clear that marker, so the next load re-evaluates at once. There are no queue triggers: nothing
  is pushed, so a badge only matters when the app shows it, and evaluating on load covers every way data arrives
  (sync fetch, backfill, catch-up, check-ins, recap rebuilds).
- For a user whose `achievementsSince` is null (a new user's first badge load — the normal path), the GET sets it to
  the user's local date and writes the starting `GoalChange` rows before evaluating; nothing qualifies before it.
- Logs: event names with ids, family and level only — never health values.
- The recap fact sheet stops emitting the old streak-milestone note (`coach/answer/facts.ts`), so the AI line never
  mentions a milestone the app doesn't show. Other recap facts are unchanged; AI text never mentions badges.

## 6. API and app

- `GET /me/achievements` → `{ since, families: [{ family, kind, level (0..5), thresholds[5], levels: [{ level,
  value, earnedOn }], current, best, nextThreshold | null }], uncelebrated: [{ id, family, level, value, earnedOn }] }`.
  `best` = the longest run (or month count) since the family's start.
- `POST /me/achievements/celebrated { ids: string[] }` → sets `celebratedAt` on the caller's rows (unknown ids ignored).
- Mobile:
  - **Profile** (SettingsScreen, between the header and Health data): Badges card — 7 badges at their highest level
    (locked grey when 0), "BADGES · n OF 35", "Next up: <family> <next level> · current / threshold" progress bar for
    the family closest to its next level, "See all". Hidden on 404 (old backend).
  - **Badges screen** ("See all"): the catalogue grid with each family's level; tapping opens **Badge detail**: big
    badge, current + best, ladder of the 5 levels (earned date / "N more" / locked).
  - **Unlock celebration**: on app start, on foreground, and right after a check-in is saved (the app refetches
    `GET /me/achievements` then), if `uncelebrated` is non-empty, a full-screen modal per
    family's highest new level (highest first): badge, coach sprite, level name + value, fixed coach line ("<n> more
    <unit> for <next level>" or "Top level!"), Share (existing pipeline, a 1080 px badge card) and "Nice!". Closing
    marks that family's new levels celebrated (lower levels of the same family too). Reduce motion: no confetti.
  - **Weekly recap**: story frame 3 gets a "Badges this week" card listing levels with `earnedOn` in the recap week
    (hidden when none; up to 4 shown, highest level per family first, then a "+n" chip). Read at view time: a level
    dated into a week after that recap was opened appears the next time it's viewed (badges are only ever added).
    Build your recap gets a "Badges this week" include switch (default ON, saved with the other story choices); the
    story frame, viewer and share image include the card when present and the switch is on.
  - **Month recap screen**: keeps the milestone tiles, now the 3 monthly families (the old 5-night streak tile is
    dropped — Sleep goal streak covers it). Each tile shows whether that month hit the milestone and, for months on or
    after `achievementsSince`, a "Level up" mark when a level was earned in that month. Only the **newest** month
    recap also shows progress toward the family's next level ("2 of 3 months for Silver") — progress is today's, so
    showing it on older months would put January's count on October's tile. Below the tiles, "Badges earned in <Month>" lists any
    streak-family levels earned that month (hidden when none). Months before `achievementsSince` (including
    backfilled ones) show their milestone tiles as before, without badge progress.
  - Badge visuals per the canvas: pixel octagon, 12×12 glyph per family (moon, clock, sneaker, check, heart,
    calendar, sparkle), tier colours Bronze #D08A4E, Silver #CBD5E1, Gold #FACC15, Diamond #67E8F9, Coach = the
    user's coach accent; 5 level pips.

## 7. Edge cases

- New user / no data / Google disconnected: nothing awarded; all badges locked with a next-up hint.
- Several levels at once (catch-up sync): all stored with their own `earnedOn`; one celebration per family.
- A finished streak delivered late: awarded from the best run (§2), dated when it was reached.
- **Accepted:** Recap and badges share the "total sleep vs goal" definition, but a recap judges its whole period by
  one goal snapshot while badges judge each night by the goal in effect that night. After a mid-period goal change a
  recap's on-goal count and the badge streak can differ.
- **Accepted:** a user inactive at launch still starts on launch day (the launch job sets it), so days they missed
  simply don't qualify.
- **Accepted:** a goal changed after midnight (e.g. at 1am before going to bed) applies from the following night,
  not that one — it follows from "a change applies to nights that end after its date".
- Coach-data deletion leaves achievements, goal changes and check-in flags untouched; account deletion removes them.
- Old app versions: unaffected (new endpoints only). New app vs old backend: 404 → badge UI hidden, month tiles as before.
- Reinstall / new device: celebration state is server-side, so nothing re-celebrates.

## 8. Testing

- Backend unit: each family's run calculator (qualifying days; gaps → paused vs broken; the 2-day rule; best vs
  current; earnedOn per threshold; goal history — a change applies from the next night, raising keeps the streak,
  easing restarts from the next night, same-day lower-and-restore is no reset; steady bedtime median incl. pre-start
  nights and the ≥ 7 rule; only `onTime` check-ins; start-date cut-off); thresholds table; monthly counts from recap
  milestones (rebuild gain/loss); fact sheet no longer emits the streak note.
- Backend integration: evaluator idempotence and concurrency; GET evaluates inline with the 10-min bound, and a
  check-in or goal save clears it; `onTime` set at write (1am check-in → previous habit day, on time; backdated →
  false); check-in streak breaks once a missed habit day is over (no pause); GoalChange written by `updateSleepGoal`
  (one row per day, last wins); launch job sets `achievementsSince` and starting goals only where null (rerun is a
  no-op) and backfills launch-day `onTime`; a new user's first GET sets them in their local zone; endpoints (shape, own rows only, celebrated); migration;
  USER_OWNED_MODELS includes Achievement and GoalChange; account-deletion cascade.
- Mobile: Profile card (locked / levels / next-up / 404 hidden), Badges + detail screens, celebration queue order and
  marking, weekly story card (with/without), month tiles (progress, level-up mark, pre-start months), 404 fallback.
- Dev-only seed script awarding sample levels to the demo account (dev DB only) for the simulator pass.

## 9. Out of scope

Push notifications for badges, badges for app exploration, social sharing of profiles (sub-project C), backfilling
history, editing or hiding badges.
