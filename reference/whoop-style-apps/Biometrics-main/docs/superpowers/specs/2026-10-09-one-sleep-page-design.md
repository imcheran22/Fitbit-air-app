# One Sleep page — design spec

Date: 2026-10-09 · Branch: `feature/recovery-page` (from main `736cc88`) · Status: mockup draft 2 approved by the owner,
spec awaiting owner review

## 1. Goal

Merge every sleep surface into **one Sleep page**. Today a night's sleep is spread over five places: the Sleep screen,
the one-night screen (`SleepNight`), the Sleep use of `ScoreDetail`, the Activity night sheet (`NightDetail`) and the
Sleep use of `MetricDetail`. Each shows its own duration, its own score and its own "usual". After this work there is
one page, `Sleep { date? }`, that shows one night in full (picked from a 7-night picker) above the trends (bedtime to
wake, regularity, the month), the bedtime goal and an entry to the coach.

Every sentence is generated from templates over the user's own numbers. No model call is needed to render the page.

The page is built from the **existing sleep and score endpoints** plus two small additive changes (§4). It reuses the
merged night components (`StageLanes`, `SleepCyclesCard`, `MomentsCard`) unchanged, follows the A4 type system and the
shadcn button standard, and removes the duplicate surfaces.

## 2. Approved design

- Canvas: https://claude.ai/artifact/XZsyFUXr7QTZK7h8SR37Tq, board **"Sleep · one page (draft 2)"** (source
  `.superpowers/sleep-canvas/project/Main.dc.html`, 390 × 3590, dark).
- `Night.dc.html` in the same folder is the earlier "another night" draft. It is **not** on the approved board. Two
  ideas from it are kept because they answer questions draft 2 leaves open: how a past night's hero reads
  (§3.2) and the "main sleep · … with a nap" duration line (§3.4). Its "Hide night details" button and its Recovery
  link line are not built (decision 1; §9).
- The board's numbers are illustrative. For example its picker dashes and its hero band do not come from one band
  table. The build follows the engine and the live bands.

### 2.1 Board → A4 token map

The board was drawn with A4 in mind, so most styles map one to one. All numbers are Geist tabular.

| Board element | Board style | Build |
|---|---|---|
| Page title "SLEEP" | Silkscreen 20 | `PageTitle` ("SLEEP" drawn, "Sleep" spoken) |
| Back / bedtime-goal buttons | 40 × 40 outline, 8 px | `Button variant="outline" size="icon-lg"` |
| Pixel moon | 25 × 20 grid at 120 × 96 | `components/sleep/MoonArt.tsx`, `react-native-svg` rects, `crispEdges` |
| Hero numeral 78 | 72 / 600 | `text-score` |
| Verdict "Restful night" | 22 / 600 | `text-heading` |
| Hero line "Excellent · +6 vs yesterday · High confidence" | 13 muted | `text-caption` muted, band word in band colour |
| Picker weekday / duration | 11 / 13 | `text-fine` / `text-caption` |
| Eyebrows ("Last night · Wed 8 Oct", "Sleep stages", …) | Silkscreen 11 | `SectionLabel` |
| Night duration "7h 12m" | 40 / 600 | `text-number` |
| Summary line "23:08 → 06:40 · …" | 13 muted | `text-caption` muted |
| Stage names / minutes | 15 / 13 | unchanged inside `StageLanes` |
| Cycle length "1h 35m" | 17 / 600 | unchanged inside `SleepCyclesCard` (`text-headline`) |
| Row label / value ("Time in bed  7h 32m") | 15 | `text-body` label, `text-body` muted tabular value |
| Range toggle "Week / 2 weeks" | 11, radiogroup | `SegmentedControl` (already guard-compliant) |
| Chart axis and weekday initials | 11 | `text-fine` |
| Regularity number 74 | 17 / 600 | `ScoreRing numeralClassName="text-headline"` |
| Regularity word "Fairly regular" | 15 / 600 | `text-body font-semibold` |
| Month cell "7:30" | 11 / 600 | `text-fine font-semibold` |
| Month stat value / label | 17 / 13 | `text-headline` / `text-caption` muted |
| Month prev / next | 32 × 32 outline | `Button variant="outline" size="icon-sm"` |
| Bedtime goal row | card link | Existing raw `Pressable` card (`sleep-goal-row`, already allowlisted) |
| Ask bar | 56 tall, inline, nested arrow button | `AskCoachBar` (§3.13), one pressable, arrow drawn as an icon |

**Clock format.** The board mixes 24-hour ("23:08", "Bed 22:45") and 12-hour ("11:20 pm") times. The build uses the
app's existing `formatClock` ("11:08 pm") everywhere, so the page reads one way.

Tiles: `Card` (`bg-card`, `rounded-card` 22). Page: 16 px side gutter, 14 px vertical gap between sections (board
`gap: 14px`, `padding: 54px 16px 40px`).

## 3. Sections

The page scrolls from top to bottom in this order. **D** is the selected night: the civil date the night **ended** on,
the same key every sleep endpoint and the SLEEP score already use. "Live bands" means the `bands` object score
responses carry; on the client that is `scoreBand()` (`mobile/src/lib/scoreInsights.ts:45-51`).

### 3.0 The selected night

- **Route.** `Sleep: { date?: string } | undefined`. `date` is `YYYY-MM-DD`, a night-end date.
- **Resolving D.**
  - `date` given: D = `date`. A date after the user's today is clamped to today.
  - `date` undefined: D = the newest night with data among the last 7 nights (today − 6 … today), from the nights
    fetch (§4.5). With no night in that window, D = today. This matches the Home tile, which shows the newest Sleep
    score; and the Home tile passes its score's date anyway (§5).
- **Changing D on the page.** Tapping a picker cell (§3.3), a chart bar (§3.9) or a month cell (§3.11) calls
  `navigation.setParams({ date })`. The route param is the single source of truth, so back leaves the page (it does not
  step through nights), and a re-render after a sync keeps the same night. A month-cell tap also scrolls the page to
  the top so the newly selected night is visible.
- **Anchor A.** The picker and the chart need a window. A = today when D ≥ today − 6, otherwise A = D. The picker shows
  A − 6 … A. The chart shows A − 6 … A (Week) or A − 13 … A (2 weeks). So opening an old night from the month or
  the Activity calendar shows that night's own week around it.
- **Night-scoped vs page-scoped.** Hero, night summary, stages, cycles, moments and "The night" are **night-scoped**
  and reload when D changes. Picker, chart, regularity, month, goal row and Ask bar are **page-scoped**: they load once
  and only redraw their selection. Regularity is always the last 7 nights from today (the endpoint has no anchor, and
  regularity is about the present), whatever D is.

### 3.1 Header

- **Content.** Left: back, `Button variant="outline" size="icon-lg"`, chevron, `accessibilityLabel="Back"`. Centre:
  `PageTitle` "Sleep". Right, in order:
  - info, the same button style, `accessibilityLabel="How the score works"`, opening the info sheet (decision 7);
  - bedtime goal, the same button style with an alarm-clock icon, `accessibilityLabel="Bedtime goal"`, navigating to
    `BedtimeGoal`.
- **Info sheet** (decision 7). It mirrors Recovery §3.1: a `Sheet` titled "How the score works" with:
  - `SLEEP_SCORE_FRAMING` (`scoreInsights.ts:6`);
  - the sleep weights (duration / efficiency / consistency, read from the score row's config through the SLEEP score
    DTO's factor weights, not hard-coded);
  - the "Baselines used" sentences from `buildBaselineSentence`, filtered as `ScoreDetailScreen` does today (no SLEEP
    duration baseline);
  - the band ranges with their verdict words.

  It replaces the only remaining home of that content once `ScoreDetail` SLEEP redirects, and it works with the coach
  turned off.
- **Native header.** Hidden for this route (`headerShown: false`), as on Recovery, because the board's header has its
  own buttons. Safe-area top inset applies.
- No subtitle (the board has none; the night's date is in the summary eyebrow).

### 3.2 Hero

- **Content.** The pixel moon (decorative, `accessible={false}`), the numeral (`text-score`, `round(score)`), the
  verdict (`text-heading`), and the hero line `"{Band} · {±N} vs {yesterday|Mon|…} · {High|Medium|Low} confidence"`.
- **Data.** The SLEEP score for D from `GET /me/scores/:D?type=SLEEP` (`score`, `confidenceLevel`, `previous`, `bands`).
  This is the one sleep-score read on the page (§4.4).
- **Verdict by band** (decision 6). The band comes from `scoreBand(score, bands)`, the same live thresholds Recovery
  uses, so the two heroes never disagree about which band a score is in.

  | Band (live) | Band word | Verdict |
  |---|---|---|
  | Excellent | Excellent | **Restful night** |
  | Good | Good | **Solid night** |
  | Fair | Fair | **Restless night** |
  | Low | Low | **Rough night** |
  | Any band, when main sleep is ≥ 60 min under the goal | (band) | **Short night** (overrides all four) |

  "Short night" is a quantity override only: it depends on minutes under the goal, never on the band, so a short but
  solid night still reads "Short night". The band word in the hero line still shows the real band. The visible word
  for `scorePoor` is "Low", as on Recovery.
- **Delta wording.** Same rule as Recovery §3.2: if D is today and `previous.date === D − 1`, "vs yesterday"; if
  `previous` is within 7 days of D, "vs {weekday short}"; otherwise the delta part is dropped. Δ = `round(score) −
  round(previous.score)` with a real minus sign. Δ = 0 reads "same as yesterday" / "same as {Mon}".
- **States.**
  - **Building** (row exists, `score === null`): the moon at 40% opacity, `text-number` "Night {n} of {N}" from
    `pickColdStartProgress(score.coldStart)`, verdict "Learning your sleep", line "{N − n} nights to go".
  - **No score, night exists** (404 from the score route, night found): numeral "—". If D is today or yesterday the
    verdict is "Score on its way" and the line "It appears a few minutes after your watch syncs"; otherwise "No score
    for this night" with no line.
  - **No night** (score 404 and night 404): moon at 40%, numeral "—", verdict "No sleep recorded", line "Waiting for
    last night's data" when D is today, else "Nothing synced for this night".
  - **Nap-only night** (§3.4): treated as "no night" in the hero, with the line "Only a nap was recorded".
  - **Low confidence:** the line ends "Low confidence" in the Fair colour.

### 3.3 Night picker (7 nights)

- **Content.** A row of 7 equal cells, A − 6 … A, oldest left (board `role="tablist"`). Each cell, 60 px tall, 8 px
  radius, shows the weekday (`text-fine`; the cell for today reads **"Last"**), the main-sleep duration as `h:mm`
  (`text-caption`, "7:12"; "—" with no night) and a 16 × 3 dash in the night's score band colour (muted with no
  score).
- **Selection.** The cell for D uses the default look (foreground fill, background ink); the others use the outline
  look, per the button standard. No pill shapes.
- **Action.** Tap → `setParams({ date })`. Every past cell is tappable, including empty ones (they open the "no night"
  state, so a missing night is explorable).
- **Data.** `/me/sleep` nights in the window: `mainMinutesAsleep` (new, §4.3) and `sleepScore` coloured with the live
  `bands` (new on that response, §4.3).
- **Still syncing.** When today's cell has no night: a `text-caption` muted line under the picker, "Last night isn't
  in yet." plus " Syncing…" while `useSync().state === 'syncing'`.
- **Backfill.** While `stagesBackfillPending` is true, the existing "Reading older nights…" caption sits under the
  picker.

### 3.4 Night summary

- **Content.**
  - Eyebrow (`SectionLabel`): "Last night · Wed 8 Oct" when D is today, else "Mon 6 Oct".
  - `text-number` main-sleep duration "7h 12m", then `text-caption` muted "asleep".
  - With naps that night: the caption reads "main sleep · {7h 32m} with naps" instead of "asleep" ("with a nap" for
    one). The with-naps total is `minutesAsleep + Σ naps.minutesAsleep` from the night endpoint (the same sum the
    current `NightHeadline` does, `SleepNightScreen.tsx:48-63`).
  - Line (`text-caption` muted): `"{bed} → {wake} · {usual} · {goal}"`, where
    - usual: "+12m vs your usual" / "−8m vs your usual" / "same as your usual"; dropped when `usualMinutesAsleep` is
      null (the rule from `usualLine`, `SleepNightScreen.tsx:27-32`, moved to `lib/sleepCopy.ts`);
    - goal: "48m short of your 8h goal" / "22m over your 8h goal" / "right on your 8h goal" (|Δ| < 5 min); goal from
      `/me/sleep/goal`, formatted "8h" or "7h 30m".
- **Data.** Night endpoint for D (main session), goal.
- **Nap-only night.** When the night's main session is a daytime nap (`mainIsNap`, §4.3), the summary shows
  "Only a nap: {20m} at {2:10 pm}" and no usual or goal comparison, and the stage cards (§3.5–3.7) are hidden.
- **No night.** The summary shows the eyebrow and "No sleep recorded for this night." (`text-body` muted).

### 3.5 Sleep stages

- **Content.** `Card` with `SectionLabel` "Sleep stages" and the existing `StageLanes` (`components/sleep/StageLanes.tsx`,
  the owner's screenshot style: stage column with minutes, glowing lanes on tinted tracks, wake markers, links,
  cycle markers, time axis). Unchanged component.
- **Data.** Night endpoint `stages`, told on `nightClock(night, stages)` (`lib/sleepStats.ts:136`).
- **No stages** (`hasStages: false`): the card instead shows bedtime and wake at the ends and the existing
  `InBedShare` bar ("7h 32m in bed · 95% of it asleep"), exactly as `SleepNightScreen.tsx:84-96` does today.

### 3.6 Sleep cycles

- **Content.** The existing `SleepCyclesCard` ("4 sleep cycles", avg, per cycle: length, start time, stacked stage bar,
  "Deep · REM · Light" minutes, and the closing "Then N min of … before you woke"). Unchanged.
- **States.** Hidden without stages. With stages but no cycles, the card's own "Not enough REM sleep to split this
  night into cycles." shows.

### 3.7 Moments

- **Content.** The existing `MomentsCard` (stage-mix ring with the duration in the centre, percentages, then rows:
  fell asleep, deepest stretch, longest dream sleep, woke during the night). Unchanged.
- **States.** Hidden without stages.

### 3.8 The night

- **Content.** `Card`, `SectionLabel` "The night", rows (label left, value right, hairline between):
  1. Time in bed — `minutesInBed`
  2. Time awake — `minutesAwake` (row hidden when null)
  3. Time to fall asleep — `minutesToFallAsleep` (hidden when null)
  4. After waking — `minutesAfterWakeUp` (hidden when null)
  5. Naps — "20m at 2:10 pm"; one line per nap, newest last; "None" when there are none. Nap times are told on the
     night's clock (`clock.at(nap.start)`). Zero-minute naps are dropped (as `SleepNightScreen.tsx:72`).
- **Removed rows.** "Sleep score" (the hero shows it; §4.4) and the separate "Naps" card (merged into this card, as on
  the board).
- "Time to fall asleep" also appears in Moments ("Fell asleep in 12m"). Both are on the approved board and read the
  same field, so they cannot disagree.
- **Steps that day** (decision 8). Under the rows, a `Button variant="link" size="sm"` reading "Steps that day ›"
  opens the Activity tab on D's steps, the same target the removed Activity night sheet linked to. It is hidden when
  the Activity tab cannot open a date.
- **States.** Shown whenever the night exists, with or without stages.

### 3.9 Bedtime to wake

- **Content.** `Card`, `SectionLabel` "Bedtime to wake", and on the right a `SegmentedControl` "Week" / "2 weeks"
  (`accessibilityLabel="Range"`). Then the existing `WindowChart` over A − 6 … A or A − 13 … A, with weekday initials
  below; the column for D has its initial in foreground semibold.
- **Changes to `WindowChart`.**
  - New prop `selectedDate`: that bar is drawn in `sleepHeat3`-on-`metricSleep` with a 2 px foreground ring and 2 px gap
    (board), the others at 45% opacity.
  - `onPressNight` now selects the night (`setParams`), it no longer opens a screen.
  - The goal window is drawn as on the board: a faint `metricSleep` band with dashed top and bottom edges. The average
    bedtime and wake lines are removed (the board has none; spreads live in Regularity).
  - Bar heights and the axis come from `layoutSleepWindow` as now. Bars use main-session bedtime and wake, which is
    already the rule.
- **Data.** `/me/sleep` window (page-scoped), goal.
- **States.** The chart's own empty texts ("No sleep synced yet." / "No bedtimes recorded in this range.").

### 3.10 Regularity

- **Content.** A compact `Card`, as on the board: a 64 px `ScoreRing` with the score, then `SectionLabel`
  "Regularity · 7 nights", a word (`text-body` semibold), and `"Bedtime ±24m · Wake ±18m"` (`text-caption` muted).
  - Word: score ≥ 75 "Very regular", ≥ 50 "Fairly regular", otherwise "Irregular" (the same thresholds as
    `regularityLine`, `lib/regularityCopy.ts:2-7`).
  - The name stays "Regularity", never "consistency" (it is a different measure from the score's Bedtime consistency
    factor, sleep-depth spec §2).
- **Removed from the old card** (not on the board): the drift strip, the explanatory caption and the coach line.
  `RegularityCard` is rewritten to the board layout; `regularityLine` is deleted if nothing else imports it.
- **Data.** `GET /me/sleep/regularity?days=7`.
- **States.** Fewer than 4 nights: the ring is replaced by "Not enough nights yet. {n} more to go." (`nightsToGo`).
  Loading skeleton and error with retry as now.

### 3.11 Month heatmap and stats

- **Content.** `Card`. Header: the month name (`SectionLabel`, with the year when not the current year) and prev / next
  `Button variant="outline" size="icon-sm"` ("Previous month" / "Next month", `hitSlop` to 44). A Monday-first header
  row M T W T F S S (`text-fine` muted), then a 7-column grid of 36 px cells, radius 8:
  - **Night with data:** filled by `sleepHeatLevel(mainMinutes, goal)` on the `sleepHeat1–4` ramp, showing `h:mm`
    (`text-fine` semibold). In light mode the ink is foreground on the light ramp; in dark mode, foreground on the dark
    ramp (board).
  - **D:** 2 px foreground ring with a 2 px gap (board).
  - **Past night without data and future days:** `bg-muted`, muted day number.
  - **Leading blanks:** transparent.

  Below the grid, a 2 × 2 stat grid (`text-headline` value, `text-caption` muted label): **Average asleep**, **Nights
  at goal** ("2 of 8"), **Average bedtime**, **Longest night**. The Activity page's streak stat is not on the board and
  is not shown here.
- **Data.** `/me/sleep` for the month (the first month comes with the page fetch; paging fetches that month and caches
  it by `YYYY-MM`). Stats from the existing pure `sleepRangeStats(nights, monthStart, monthEnd, today, goal)`
  (`lib/sleepStats.ts:34`), fed main-sleep minutes. The grid from `monthGrid(…, sleepHeatLevel)` (`lib/heatmap.ts:131`).
- **Paging.** Opens on D's month. Prev is disabled at the month of `earliestDate` (already on the `/me/sleep`
  response). Next is disabled at the current month.
- **Action.** Tap a past cell → `setParams({ date })` and scroll to top. Future cells are not focusable.
- **States.** While a month loads the grid shows a skeleton and the header stays. On error: "Couldn't load {Month}."
  with a ghost `Button size="sm"` "Retry".

### 3.12 Bedtime goal row

- **Content.** The board's card link: a 40 px moon icon tile tinted `metricSleep`, "Bedtime goal" (`text-body`
  semibold), and `"Bed 10:45 pm · Wake 6:45 am · 8h · Reminder 30 min before"` (`text-caption` muted), then a
  chevron.
  - Unset bedtime and wake: "Set a bedtime goal · {8h}".
  - The reminder part follows the current rule: shown only when a bedtime is set; "Reminder off" when disabled
    (`SleepScreen.tsx:265-269`).
- **Data.** `/me/sleep/goal` and the device-only wind-down setting `readWindDown()` (SecureStore key `windDown`).
- **Action.** `BedtimeGoal`. On return (focus after blur) the page re-reads the goal and the reminder, as
  `SleepScreen.tsx:99-114` does now. `BedtimeGoalScreen` is unchanged.

### 3.13 Ask Axo

- **Content.** The shared `components/coach/AskCoachBar.tsx` that the Recovery spec extracts from `ScoreDetailScreen`
  (Recovery §3.9): a `GlassSurface` bar with the current coach character, pinned above the safe area. The board draws
  it inline with a nested arrow button; the build pins it like Recovery and draws the arrow as a decorative icon inside
  the one pressable.
- **Copy.** "Ask {coachName} about last night" when D is today, else "Ask {coachName} about this night"
  (`characterInfo(characterId).name`).
- **Action.** `navigateToCoachEntry(navigation, coachRoute, sleepQuestion(...))`. New `sleepQuestion` in
  `lib/coachPrompts.ts`:
  - D is today: "How was my sleep last night?"
  - past night: "How was my sleep on {Monday 6 October}?" (the current `SleepNight` wording, `formatLongDay`)
  - no night: "Why don't I have sleep data {for last night|for Monday 6 October}?"

  The prefill sits in the input box and is never sent for the user (current behaviour).
- **States.** Hidden when `coachEntryRoute(status)` is null. Scroll bottom padding is 120 with the bar, 32 without.

## 4. Data & API

### 4.1 What exists vs what is missing

| Section | Exists today | Missing |
|---|---|---|
| Hero | `GET /me/scores/:date?type=SLEEP`: score, confidence, factors, `previous`, `bands` (`scoring/routes.ts:62-98`) | Nothing. A 404 is read as "no score" (existing `fetchScoreDetail`, `api/scores.ts:101-108`) |
| Picker | `GET /me/sleep?from&to`: per night `minutesAsleep`, `sleepScore`, `hasStages` | Main-sleep minutes (today's `minutesAsleep` is the day total, naps included). Live `bands` for the dash colour |
| Night summary, stages, cycles, moments, the night | `GET /me/sleep/night/:date` (`biometrics/sleepNight.ts:47`) | A main-sleep "usual" (today's is the mean of day totals, naps included, compared against main sleep). A nap-only flag |
| Bedtime to wake | `/me/sleep` bedtime and wake (main session) | Nothing |
| Regularity | `GET /me/sleep/regularity?days=7` | Nothing |
| Month and stats | `/me/sleep` for any range ≤ 400 days, `earliestDate`; `sleepRangeStats` on the client | Main-sleep minutes (above) |
| Goal row | `GET /me/sleep/goal`, `readWindDown()` | Nothing |
| Ask | prefill only | `sleepQuestion` (client only) |

### 4.2 No bundle endpoint

The Recovery page got a bundle (`GET /me/recovery/:date`) because most of its sections had **no** endpoint: streak,
sleep debt, the month aggregation, the forecast chips and the track record were all new derived data, and one query
plan could build them together. The Sleep page is different, so it keeps the existing endpoints:

1. **Every section already has a tested endpoint.** The only gaps are two fields (§4.3). A bundle would duplicate five
   read paths that the Activity tab and Home keep using.
2. **The page has two scopes.** Night-scoped data (score, night) changes on every picker tap; page-scoped data (the
   nights window, regularity, goal) does not. A single bundle would either resend the page-scoped data on each tap or
   have to split into two endpoints, which is what already exists.
3. **Sections load and fail on their own.** That is the sleep-depth spec's rule ("Each section loads and fails on its
   own, with its own retry") and the existing `useSection` pattern (`components/sleep/Section.tsx`). A slow regularity
   query never blocks the night.
4. **Cost is small.** Opening the page makes 5 parallel GETs (scores/:D, sleep window, night/:D, regularity, goal);
   switching nights makes 2, and a revisited night comes from the hook's cache. All are indexed single-user reads.

The 404s on `/me/scores/:date` and `/me/sleep/night/:date` stay. The client already maps them to "no score" and
"no night" (`fetchScoreDetail`; `SleepNightScreen.tsx:147-155`). Recovery turned its 404 into a 200 because its
bundle would otherwise fail as a whole; that reason does not apply here.

### 4.3 Additive backend changes

All in `backend/src/biometrics/`. Old app builds ignore the new fields.

1. **`GET /me/sleep`, per night** (`activity.ts:151-170`):
   - `mainMinutesAsleep: number | null` — the main session's `minutesAsleep` (`pickMainSession`), null when the date
     has a rollup but no session rows.
   - `mainIsNap: boolean` — see rule below.
   - Response gains `bands: ScoreBands` (`getLiveConfig().scoreBands`), as the score routes already send.
   - `minutesAsleep` keeps its meaning (the day's total, naps included), so Activity and old builds are unaffected.
2. **`GET /me/sleep/night/:date`** (`sleepNight.ts`):
   - `usualMinutesAsleep` becomes the mean **main-session** minutes asleep over the 30 nights before D, still null unless
     at least 7 of them have a night. It is computed from `sleepSession` rows in that window grouped by
     `sessionEndCivilDate` and reduced with `pickMainSession`, the same rule as everything else. (Today it averages the
     SLEEP rollup, which includes naps, and is compared against main sleep. On nap days that overstated "usual".)
   - `mainIsNap: boolean` — see rule below.
3. **Nap-only rule** (one helper, `biometrics/mainSession.ts` `isDaytimeNap(main, timeZone)`): the main session starts
   at or after 10:00 and before 18:00 local, and has under 180 minutes asleep. Such a date has no night, only a nap.
   This is display only; scoring is unchanged.

Privacy: these handlers log nothing beyond what they log today (no values, no dates). Sleep data is the user's own and
is never sent to buddies or the coach by this work.

### 4.4 Duplication rulings

**One sleep-score source.** The SLEEP `DailyScore` row is the only source. Today it is shown in five places (Home tile,
Sleep score header, `ScoreDetail`, the night screen's "Sleep score" row, the Activity night sheet's ring). After:

| Place | After |
|---|---|
| Sleep page hero | The score for D, from `/me/scores/:D?type=SLEEP` (needs confidence, previous and bands) |
| Picker dash | Band colour only, from `/me/sleep` `sleepScore` (server-rounded) + live bands. No number |
| Home `SleepTile` | Unchanged (newest score in 7 days); now opens the page on that score's date, so tile and hero show the same night |
| `ScoreDetail` SLEEP, night "Sleep score" row, Activity night sheet | Gone (§5, §3.8) |

Both reads round the same stored value, so the hero and the dash can never put one night in different bands.

**Night duration = main sleep, "with naps" secondary.** Every night duration on the page (picker, summary, chart,
month cells and stats) is the main session's minutes asleep. When the night has naps, the summary adds "{total} with
naps". The Activity tab's Sleep calendar switches to `mainMinutesAsleep ?? minutesAsleep` too, so a night has one
number across the app. The Home and Trends SLEEP metric tiles keep plotting the SLEEP rollup (the day total, which is
also what scoring uses); because they now open the Sleep page, where the "with naps" line shows that same total,
the two figures are explained side by side. Scoring is unchanged.

**One "usual".** There are three today:

| Baseline | Where | What |
|---|---|---|
| A. `usualMinutesAsleep` | night screen | Mean of the 30 nights before D, ≥ 7 nights, server-side |
| B. `usualRange` | `MetricDetail` SLEEP, Trends | Middle 80% of the last 30 days' readings, client-side, anchored at the latest reading |
| C. "average for this range" | Activity night sheet (`compareSleepToAverage`) | Mean of the month or year being viewed |

The page uses **A**, recomputed on main sleep (§4.3). Reasons:
- It is anchored at the selected night and excludes it, so "vs your usual" means the same thing for any night, past or
  present. B is anchored at the latest reading, so for an old night it would compare against the future.
- It is a single number in minutes, which is what a "+12m vs your usual" line needs. B is a band, built for the trend
  chart's shaded range.
- C changes with whatever range is on screen, so it is an average, not a baseline.
- The scoring EWMA (`BaselineSnapshot` SLEEP) is not used: ScoreDetail deliberately hides it for SLEEP
  (`ScoreDetailScreen.tsx:128-130`) because the duration factor is scored against the goal.

B stays for the other metrics on Trends and `MetricDetail`. C disappears with the night sheet.

### 4.5 Mobile client

- `mobile/src/api/sleep.ts`: `SleepNight` gains `mainMinutesAsleep: number | null` and `mainIsNap: boolean`;
  `SleepActivityDTO` gains `bands?: ScoreBandsDTO`; `SleepNightDetail` gains `mainIsNap: boolean`. An older server
  defaults them (`mainMinutesAsleep ?? minutesAsleep`, `false`, `undefined` → `DEFAULT_SCORE_BANDS`), in the style of
  `fetchSleep` / `fetchSleepNight` today.
- `mobile/src/lib/useSleepPage.ts`: the page's state hook.
  - Page-scoped sections via `useSection`, reloaded on `dataVersion`: nights for
    `[min(A − 13, monthStart(D)), min(today, max(A, monthEnd(D)))]`, regularity (7), goal, plus `readWindDown()`.
  - Resolves D (§3.0) once the nights load when `date` is undefined.
  - Night-scoped sections keyed by D: `fetchScoreDetail(D, 'SLEEP')` and `fetchSleepNight(D)` (404 → null), cached by
    date for the page's lifetime, cleared on `dataVersion`. Only the latest request lands (the `detailRequest` guard
    pattern from `SleepScreen.tsx:122-142`).
  - Month cache keyed by `YYYY-MM` for paging.
- `mobile/src/lib/sleepCopy.ts`: every string and the pure helpers (`sleepVerdict`, `heroLine`, `nightEyebrow`,
  `durationCaption`, `usualPart`, `goalPart`, `formatHm` ("7:12"), `regularityWord`, `goalRowLine`, `askLabel`).
  Components never inline copy, the same rule as `recoveryCopy.ts` / `forecastCopy.ts`.
- `lib/coachPrompts.ts`: `sleepQuestion(date, isLastNight, hasNight)`. `scoreQuestion('SLEEP')` is deleted if nothing
  else uses it.

## 5. Navigation

New route shape: `Sleep: { date?: string } | undefined` in `RootStackParamList` (`RootNavigator.tsx:104-105`),
registered as `<Stack.Screen name="Sleep" component={SleepScreen} options={{ headerShown: false }} />`.

**One helper.** `mobile/src/navigation/sleepNavigation.ts` (created by whichever of Recovery or this work lands first):

```ts
export function openSleep(navigation: Nav, date?: string): void   // navigation.navigate('Sleep', date ? { date } : undefined)
export function openNight(navigation: Nav, date: string): void    // openSleep(navigation, date)
```

No caller outside this file names the `Sleep` route, except the notification handler (which uses `navigationRef`)
and the page's own `setParams`. Plain `navigate` pushes a new Sleep page unless Sleep is the current route, in which
case it updates the params, which is the wanted behaviour from every entry point.

### 5.1 Every call site

| # | Call site today | Today | After |
|---|---|---|---|
| 1 | Home `SleepTile` (`DashboardScreen.tsx:276-282`) | `navigate('Sleep')` | `openSleep(navigation, score?.date)`; the tile's `onPress` already receives the score or null (`sleep-tile.tsx:31`) |
| 2 | Home metric tile SLEEP (`DashboardScreen.tsx:139-141,304`) | `MetricDetail { SLEEP, records }` | `openDetail` sends SLEEP to `openSleep(navigation)`; other metrics unchanged |
| 3 | Activity › "Sleep details" (`activity-heatmap.tsx:600-611`, wired at `ActivityScreen.tsx:176`) | `navigate('Sleep')` | `openSleep(navigation)` |
| 4 | Activity › sleep calendar cell → `NightDetail` sheet (`activity-heatmap.tsx:453-455,659-667`) | Opens the sheet | Opens the page directly: `onOpenNight(date)` → `openNight`. The sheet is deleted. A sleep cell tap no longer sets `selection` |
| 5 | Activity › `NightDetail` "Open full night" (`activity-sheets.tsx:201-212`, `ActivityScreen.tsx:177`) | `navigate('SleepNight', { date })` | Gone with the sheet; #4 covers it |
| 6 | Activity › steps `DayDetail` "Sleep the night before" (`activity-heatmap.tsx:656`) | `crossTo('sleep', date)` → night sheet | Closes the sheet, then `onOpenNight(date)` (a Modal must close before a push, `activity-heatmap.tsx:463-467`) |
| 7 | Activity › Usual tiles › Sleep (`UsualTiles.tsx:31`) | `MetricDetail { SLEEP, records, '30d' }` | `openSleep(navigation, tile.latestDate ?? undefined)` |
| 8 | Trends card SLEEP (`MetricsScreen.tsx:83-85`) | `MetricDetail { SLEEP, … }` | `openSleep(navigation)` |
| 9 | Sleep screen "Why this score" (`SleepScreen.tsx:164-173`) | `ScoreDetail { date, SLEEP }` | Removed; the hero is the score |
| 10 | Sleep screen chart bar and "See the whole night" (`SleepScreen.tsx:144,196,239`) | `navigate('SleepNight', { date })` | Bar tap → `setParams({ date })`; the Last night card is replaced by the inline night |
| 11 | Sleep screen goal row (`SleepScreen.tsx:250-253`) | `BedtimeGoal` | Unchanged, plus the header button (§3.1) |
| 12 | Coach answer card, area `sleep` (`lib/coachAnswers.ts:74-75`, used at `CoachScreen.tsx:317`) | `ScoreDetail { date, SLEEP }`, else Trends | `{ name: 'Sleep', params: { date } }`, or `{ name: 'Sleep', params: undefined }` without a date (not Trends). `CardDestination` gains the `Sleep` member |
| 13 | Wind-down notification tap (`notifications/handler.ts:92`) | `navigate('Sleep', undefined, { pop: true })` | Unchanged call. With `pop` it returns to an existing Sleep page and resets it to the default night. No other notification opens a sleep screen (handler handles wind-down, buddy and recap only) |
| 14 | Recovery "Last night" tile (Recovery spec §3.6) | `openNight(navigation, D)` → `SleepNight { date }` | The same call, now `Sleep { date: D }`. The night that ended on D is the night that produced D's recovery |
| 15 | `ScoreDetail { type: 'SLEEP' }` (any leftover caller) | Sleep score detail | `navigation.replace('Sleep', { date })` on mount, next to the Recovery redirect for RECOVERY |
| 16 | `MetricDetail { metricType: 'SLEEP' }` (any leftover caller) | Sleep metric detail | `navigation.replace('Sleep')` on mount; HRV, RHR and Steps unchanged |
| 17 | `SleepNight { date }` route (`RootNavigator.tsx:106-107,252`) | One-night screen | **Dropped.** The signed-in navigator has no deep linking and no state persistence (`RootNavigator.tsx:221`; only `AuthNavigator` has `linking`), and #5, #10 and #14 were its only callers, so nothing can still reach it. `SleepNightScreen.tsx` is deleted |

Route comments in `RootNavigator.tsx` that mention the Sleep shelf (`:109`, `:115`) and "Opened from the Home sleep card
and the Activity Sleep page" (`:104`) are updated.

### 5.2 Recaps shelf moves to Home

`RecapShelf` is today the only entry to Recaps (`Recaps`, `Recap`, `RecapStory`, `YearInPixels`), at the top of
`SleepScreen.tsx:151`. It moves to Home (decision 3):

- **Where.** In `DashboardScreen`, after `HabitLogCard` and directly above `CoachDigestCard`
  (`DashboardScreen.tsx:292-296`), so the recap shelf and the weekly digest sit together. It renders for every user,
  whether or not the coach is on, so Recaps is always reachable from Home. This position is a reasoned default
  (decision 5; mockup first).
- **Unchanged behaviour.** Same component, same props (`navigation`), the "Recaps · See all" header always shows, and
  it reloads on focus and on return to the foreground. Home's avatar story ring (`useStoryRing`) is unchanged.
- The component comment ("The story shelf at the top of Sleep", `RecapShelf.tsx:27`) and the typography exemption's
  reason text stay valid apart from the word "Sleep", which is updated.

### 5.3 Ordering with the Recovery build

This work depends on three pieces the Recovery spec also creates: `navigation/sleepNavigation.ts`,
`components/coach/AskCoachBar.tsx`, and the ScoreDetail redirect guard. Whichever branch lands first creates them;
the second reuses them. If Sleep lands first, `ScoreDetail` keeps its RECOVERY body and only gains the SLEEP redirect.
Once both have landed, `ScoreDetail` is a redirect shim only (removing it is a later clean-up, §9).

## 6. States

| State | Trigger | Page |
|---|---|---|
| Loading | First open | Header renders. Skeletons for hero (120 × 200), picker (60 px row), summary and one card. Page-scoped cards show their own skeletons. testID `sleep-loading` |
| Night switching | Picker / bar / month tap to an uncached night | Picker selection moves at once; hero and night cards show skeletons until the two night requests land |
| Section error | Any one request throws | That section shows `SectionError` with "Try again"; the rest of the page renders. The night and score errors share one retry card in place of the night cards |
| Cold start (no nights at all) | `/me/sleep` returns no nights | Hero "No sleep recorded", picker of 7 empty cells, summary hidden, chart "No sleep synced yet.", regularity "Not enough nights yet. 4 more to go.", empty month, goal row, Ask bar ("Why don't I have sleep data…") |
| Score building | SLEEP row with `score: null` | Hero building state (§3.2); the night cards render normally |
| Still syncing | D is today, no night yet | Hero "Waiting for last night's data"; "Last night isn't in yet." under the picker; the rest renders |
| Night but no score | Score 404, night 200 | Hero "Score on its way" / "No score for this night"; night cards render |
| No stages | `hasStages: false` | Stages card shows the in-bed share bar; cycles and moments hidden; "The night" shows |
| Nap-only | `mainIsNap: true` | Hero "No sleep recorded" + "Only a nap was recorded"; summary "Only a nap: 20m at 2:10 pm"; stage cards hidden; "The night" shows the nap row only |
| Naps besides the night | `naps.length > 0` | Summary "main sleep · {total} with naps"; naps listed in "The night" |
| Stage backfill pending | `stagesBackfillPending` | "Reading older nights…" under the picker |
| Old night | D < today − 6 | Picker and chart anchored on D (§3.0); month opens on D's month; Ask says "this night" |
| Future date | Bad param | Clamped to today |

## 7. Accessibility

- `PageTitle` is the header (`accessibilityRole="header"`, label "Sleep").
- The **hero** is one element, for example "Sleep score 78, Excellent, restful night. Up 6 from yesterday. High
  confidence." The moon is hidden from screen readers.
- **Picker:** `accessibilityRole="tablist"` on the row; each cell is a `tab` with `accessibilityState={{ selected }}`
  and a label like "Wednesday, last night, 7 hours 12 minutes, Excellent" or "Monday, no sleep recorded".
- **Night summary** reads as one element: "Night ending Wednesday 8 October. 7 hours 12 minutes asleep. 11:08 pm to
  6:40 am. 12 minutes more than usual. 48 minutes short of your 8 hour goal."
- `StageLanes`, `SleepCyclesCard`, `MomentsCard` keep their existing labels.
- **Chart bars** stay buttons labelled "{Weekday}: {bed} to {wake}", plus ", selected" for D.
- **Month cells** are buttons labelled "Thursday 2 October, 6 hours 41 minutes"; empty past cells "Thursday 2
  October, no sleep recorded"; future cells are not focusable. Prev / next are labelled buttons with 44 px targets.
- Colour is never the only carrier: picker cells and month cells show their durations, and band words appear in the
  hero.
- Font scaling follows the A4 policy. Picker and month cell text use `numberOfLines={1}`.
- The Ask bar keeps the single-pressable semantics, label "Ask {coach} about last night".

## 8. Components

### Reused unchanged

`StageLanes`, `SleepCyclesCard`, `MomentsCard`, `StageStrip` exports (`STAGE_TOKEN`, used by Recovery), `Section`
(`useSection`, `SectionError`), `SegmentedControl`, `ScoreRing`, `Card`, `Skeleton`, `PageTitle`, `SectionLabel`,
`Button`, `RecapShelf` (moved), `BedtimeGoalScreen`, `lib/windDown.ts`, `lib/sleepCycles.ts`, `lib/sleepWindow.ts`,
`lib/heatmap.ts` (`monthGrid`, `sleepHeatLevel`), `lib/sleepStats.ts` (`sleepRangeStats`, `formatClock`,
`formatDuration`, `formatShortDuration`, `nightClock`).

### Changed

| File | Change |
|---|---|
| `screens/SleepScreen.tsx` | Rewritten as the one page (§3), using `useSleepPage` |
| `components/sleep/WindowChart.tsx` | `selectedDate`, select-on-tap, board goal band, average lines removed (§3.9) |
| `components/sleep/RegularityCard.tsx` | Compact board layout (§3.10) |
| `components/activity-heatmap.tsx` | Sleep cell tap opens the page; no night sheet; sleep values use main sleep |
| `components/activity-sheets.tsx` | `NightDetail` deleted; `InBedShare` moves to `components/sleep/InBedShare.tsx`; `DayDetail` and `LinkTile` stay |
| `screens/DashboardScreen.tsx` | `RecapShelf` added; SleepTile and SLEEP metric tile use `openSleep` |
| `screens/ScoreDetailScreen.tsx` | SLEEP redirects to `Sleep` |
| `screens/MetricDetailScreen.tsx` | SLEEP redirects to `Sleep` |
| `screens/MetricsScreen.tsx`, `components/activity/UsualTiles.tsx` | SLEEP opens the page |
| `lib/coachAnswers.ts`, `lib/coachPrompts.ts` | `Sleep` destination; `sleepQuestion` |
| `navigation/RootNavigator.tsx` | `Sleep` params, `headerShown: false`, `SleepNight` removed |
| `api/sleep.ts` | New fields (§4.5) |

### New

`components/sleep/MoonArt.tsx` + `lib/moonArt.ts` (the board's rects), `components/sleep/NightPicker.tsx`,
`components/sleep/NightSummary.tsx`, `components/sleep/NightNumbersCard.tsx` ("The night"),
`components/sleep/SleepMonthCard.tsx`, `components/sleep/BedtimeGoalRow.tsx`, `components/sleep/InBedShare.tsx`
(moved), `lib/useSleepPage.ts`, `lib/sleepCopy.ts`, `navigation/sleepNavigation.ts` and
`components/coach/AskCoachBar.tsx` (if Recovery has not created them).

### Deleted

`screens/SleepNightScreen.tsx` and the `SleepNight` route; `NightDetail` in `activity-sheets.tsx`;
`compareSleepToAverage` (`lib/sleepStats.ts:155`) if unused; the old Sleep screen's score header, "Last night" card and
`goalLine` (replaced by `sleepCopy.goalRowLine`); `regularityLine` and `scoreQuestion('SLEEP')` if unused. Any of
`FactorBar`, `factorBarScale`, `BaselineProgressRing` and `buildBaselineSentence` that no longer have an importer once
both Recovery and Sleep land are removed in the later ScoreDetail clean-up, not here.

## 9. Out of scope

- **Scoring:** the Sleep score's factors, the duration factor's use of the day total, bands and baselines are unchanged.
- A per-factor "why" for the Sleep score ("What moved it" is removed, decision 2) (the info sheet is in scope, decision 7).
- The earlier draft's Recovery link line ("Monday's short night pulled your Tuesday recovery down to 38").
- Regularity for an arbitrary anchor date; the 30-night regularity window on this page.
- Deleting the `ScoreDetail` route and its now-unused components (after both pages land).
- The Activity tab's steps calendar and the Activity Sleep calendar's layout (only its tap target and its minutes
  change). The Home and Trends SLEEP tiles' series.
- Apple Health stages, new notifications, and any change to the wind-down reminder.

## 10. Testing

**Backend** (`backend/tests/biometrics/`, same harness as the existing sleep route tests, through the test-DB helper):

- `/me/sleep`: `mainMinutesAsleep` equals the main session on a nap day while `minutesAsleep` stays the total; null
  with a rollup and no sessions; `bands` present; `mainIsNap` true for a daytime-only date.
- `/me/sleep/night/:date`: `usualMinutesAsleep` averages main sessions only (a nap day in the window does not raise
  it); still null below 7 nights; `mainIsNap`.
- `isDaytimeNap`: the 10:00 and 18:00 edges, the 180-minute edge, local time across a DST change.
- Existing sleep, regularity, goal and scoring tests stay green. No sleep values in captured logs.

**Mobile** (`mobile/__tests__/`):

- `lib/sleepCopy.test.ts`: verdict per band and the "Short night" override; hero line delta wording (yesterday,
  weekday, dropped, zero); eyebrow today vs past; duration caption with 0 / 1 / several naps; usual and goal parts at
  the 5-minute edge; `formatHm`; regularity words at 50 / 75; goal row with and without bedtime and reminder; ask
  labels and `sleepQuestion`.
- `lib/useSleepPage.test.tsx`: D resolution (given, undefined → newest in 7, none → today, future → today); anchor A
  for recent and old nights; fetch range; night cache and latest-request-wins; reload on `dataVersion`.
- `screens/SleepScreen.test.tsx` (rewritten; the useful `SleepNightScreen.test.tsx` cases move here): every section
  renders in order; picker tap, bar tap and month tap call `setParams` and swap the night; no stages; nap-only; naps
  besides the night; no night today (still syncing); cold start; score building; section errors with retry; month
  paging limits; goal row navigates and re-reads on focus; header goal button; Ask bar hidden without a coach route;
  `RecapShelf` is **not** on the page.
- `components/WindowChart.test.tsx` (or the existing sleep window tests): selected bar, select callback, no average
  lines.
- Navigation tests:
  - `DashboardScreen.test.tsx`: SleepTile opens `Sleep { date: score.date }`, and `Sleep` with no score; SLEEP metric
    tile opens `Sleep`; `RecapShelf` renders on Home.
  - `ActivityScreen.test.tsx`, `ActivityHeatmap.test.tsx`: "Sleep details" opens `Sleep`; a sleep cell opens
    `Sleep { date }`; the steps sheet's sleep link closes the sheet then opens the night.
  - `activity-sheets.test.tsx`: `NightDetail` cases deleted; `DayDetail` and `InBedShare` cases kept.
  - `UsualTiles.test.tsx`, Trends (`MetricsScreen`) test: SLEEP opens `Sleep`.
  - `lib/coachAnswers.test.ts`: area `sleep` → `Sleep { date }`, and `Sleep` without a date.
  - `notifications/handler.test.ts`: wind-down still opens `Sleep` with `pop`.
  - `ScoreDetailScreen.test.tsx` / `ScoreDetailRedesign.test.tsx` / `ScoreDetailCoachEntry.test.tsx`: SLEEP replaces
    to `Sleep`; their SLEEP rendering cases are deleted.
  - `MetricDetailScreen.test.tsx`: SLEEP replaces to `Sleep`; other metrics unchanged.
  - `navigation/sleepNavigation.test.ts`: `openSleep` / `openNight` params.
- `SleepNightScreen.test.tsx` and `SleepScreen.test.tsx`'s old cases are deleted with their screens.
- **Convention guards stay green.**
  - `__tests__/conventions/buttons.test.ts`: allowlist the new raw pressables by testID with counts and reasons —
    picker cells (`sleep-night-${date}`), month cells (`sleep-month-day-${date}`); keep `sleep-goal-row` (moves to
    `BedtimeGoalRow.tsx`) and `sleep-window-bar-${bar.date}`; drop nothing else (`LinkTile` stays, one definition).
    The `ask-coach-button` key moves to `AskCoachBar` with Recovery.
  - `__tests__/conventions/typography.test.ts`: tokens only; no new exemption is expected (the moon is SVG rects with
    no text). The `RecapShelf` exemption is unchanged (same file).
- **Typecheck.** Mobile `tsc --noEmit --types jest,node` stays at or under the **12-error baseline**; deleting a test
  file that holds baseline errors may lower it, never raise it. Backend `tsc --noEmit` stays clean.

## 11. Global constraints

- **No attribution.** Commits and PRs carry no Co-Authored-By trailer and no Claude/AI mention, in the footer or
  anywhere else. This applies to subagents too.
- **Subagents** (if the build uses subagent-driven development) are dispatched on **opus**.
- **Mockup first.** Any UI not on the approved board (the Home placement of the Recaps shelf, the dimmed-moon states)
  is shown to the owner as a canvas strip before it is merged.
- **Type:** A4 tokens only (§2.1). `PageTitle` for the title, `SectionLabel` for eyebrows, Geist tabular numbers.
- **Buttons:** every button and link is `components/ui/button` (shadcn Base port, neutral primary, `rounded-lg`, no
  pills). Picker cells and month cells are rounded-lg option cells, selected = default look, unselected = outline look,
  allowlisted in the buttons guard.
- **Pixel art** is crisp (`react-native-svg` rects, `crispEdges`), fixed colours in both themes.
- **Campfire files** (`CampScene.tsx`, `CampBanner.tsx`) are not touched.
- **Privacy.** Sleep values, dates and note text are never logged. Logs carry ids, event names and error classes
  only. Coach prefills are put in the input box, never sent; buddy data never reaches the coach.

## 12. Owner decisions (2026-10-09)

1. **Night details are inline.** The selected night's stages, cycles, moments and numbers sit on the page itself.
   There is no "Details" / "See the whole night" button and no separate night screen; `SleepNight` is removed.
2. **No "What moved it" card.** Removed from the Sleep page as it was from Recovery. The per-factor Sleep score
   breakdown is not shown on the page, and `ScoreDetail` for SLEEP redirects to the page.
3. **The Recaps shelf moves to Home.** It was the only entry to Recaps and lived on the Sleep screen. It now sits on
   Home (§5.2), so Recaps stays reachable after the Sleep screen is rebuilt.
4. **Mockup draft 2 approved** as the page's layout and section order (§3).
5. **Recaps shelf on Home:** after the Habit log, directly above the coach digest card, shown for everyone. It is a
   "look back" item and belongs with the digest. **A one-board mockup is shown to the owner before it is built**
   (mockup-first rule).
6. **Hero verdicts:** Restful / Solid / Restless / Rough night by `scoreBand`, with "Short night" as a quantity-only
   override at ≥ 60 min under the goal on any band (§3.2).
7. **Info sheet added**, mirroring Recovery's (§3.1). "Ask Axo covers why" fails when the coach is off
   (`coachEntryRoute` is null, so the bar is hidden), and without the sheet the "Baselines used" sentences and the
   sleep weights would have no home.
8. **Activity night sheet removed.** A sleep cell opens `Sleep { date }`. The sheet's "Steps that day" moves onto the
   page's night section (§3.8) as a small `Button variant="link" size="sm"` "Steps that day ›" that opens Activity for
   that date, so nothing the sheet offered is lost.

## 13. Notes for the build and the PR

- **The "usual" fix changes a visible number.** `/me/sleep/night/:date` `usualMinutesAsleep` (`sleepNight.ts:110`)
  moves from day totals (naps included) to main-session minutes (§4.3). The "vs your usual" line users already see will
  shift for anyone who naps. The PR description must call this out as an intentional correction, not a regression.
