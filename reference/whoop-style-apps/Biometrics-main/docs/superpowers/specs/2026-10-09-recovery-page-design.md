# Recovery page — design spec

Date: 2026-10-09 · Branch: `feature/recovery-page` (from main `736cc88`) · Status: design approved, spec for build

## 1. Goal

Replace the Recovery use of `ScoreDetailScreen` with a dedicated **Recovery page** built on the approved weather
metaphor: the day's Recovery Score shown as conditions (clear, cloudy, stormy), why it moved, the last week, sleep debt
and streak, a month calendar, tomorrow's forecast, and an entry to the coach. Every sentence is generated from
templates over the user's own numbers. No model call is needed to render the page.

The page must be buildable from **one new read endpoint** (plus a light month endpoint for calendar paging), reuse the
scoring engine as it is (no change to how scores are computed), and follow the merged A4 type system and the shadcn
button standard.

## 2. Approved design

- Canvas: https://claude.ai/artifact/9v7waTGZ6abQfJQak2injD, board **"Recovery page · D + C calendar + bento"**
  (source `.superpowers/recovery-canvas/project/Combined.dc.html`, 390 × 2440, dark).
- Intent sources: `Weather.dc.html` (D: weather hero, factors as fronts/fog, outlook strip) and `Timeline.dc.html`
  (C: month calendar coloured by band, "How 50 became 68").
- The board's numbers are illustrative. For example its factor points (+14, +3, −5) do not add up to 68 − 50, and it
  colours 58 as Fair although the live bands put 58 in Good. The build follows the engine and the live bands.

### 2.1 Board → A4 token map

The board predates A4. Where they differ, the implementation uses these tokens. All are Geist tabular unless noted.

| Board element | Board style | Build |
|---|---|---|
| Page title "Recovery" | Geist 700 16 | `PageTitle` ("RECOVERY" drawn, "Recovery" spoken) |
| Header subtitle "Wed 8 Oct · updated 7:12 AM" | 12 muted | `text-caption` muted |
| Hero numeral 68 | 96 / 300 | `text-score` (72) |
| Verdict "Mostly clear" | Instrument Serif 30 | `text-display` (28) Geist 600. The serif is banned |
| Hero line "Good · +6 vs yesterday · High confidence" | 14 muted | `text-caption` muted, band word in band colour |
| Summary paragraph | 14/20 | `text-body` on a `bg-card` tile, `rounded-tile` |
| Eyebrows ("Last 7 days", "Sleep and streak", …) | 11 caps 600 | `SectionLabel` (pixel 11) |
| Factor value "58 ms" | 15 | `text-headline` value, `text-caption` unit |
| Factor points "+14" | 13 / 600 teal | `text-caption` semibold, tone colour |
| Range caption "Usual 49–55 ms · warm front" | 12 | `text-fine`, muted |
| Outlook day / score | 11 / 13 | `text-fine` / `text-caption` |
| Sleep debt "3h 10m" | 28 / 600 | `text-display` |
| Last night "6h 48m" | serif 30 | `text-display` |
| Streak "2 days" | 30 / 600 | `text-display` + `text-caption` unit |
| Month average 64 | (number) | `text-number` (40) |
| Calendar cell score | 12 / 600 | `text-fine` semibold |
| Forecast range "70–78" | (number) | `text-number` |
| Chips "6h / 61" | — | `text-caption` / `text-headline` |
| Buttons | 8px radius | `components/ui/button` (`rounded-lg`, no pills) |

Tiles: `Card` (`bg-card`, `rounded-card` 22). Bento tiles: `rounded-card` with 10 px gaps. Page: 16 px side gutter,
14 px vertical gap between sections (board `gap: 14px`, `padding: 54px 16px 40px`).

## 3. Sections

The page scrolls from top to bottom in this order. `D` is the viewed civil date (route param, default the user's local
today). "Live bands" means the `bands` object every score response already carries (`backend/src/scoring/routes.ts:58,96`).
On the client that is `scoreBand()` (`mobile/src/lib/scoreInsights.ts:45-51`), with bands 75 / 55 / 40 from
`backend/src/scoring/configs/v1.ts:121`.

### 3.0 Weather mapping (used by hero, outlook, calendar legend, forecast)

The four bands map 1:1 to `ScoreBand` (`scoreInsights.ts:16`) and to the existing colour tokens
`scoreExcellent/Good/Fair/Poor` (`mobile/src/theme.ts:73-76` light, `:149-152` dark). The dark values are exactly the
board's calendar colours. The visible band word for `scorePoor` stays **"Low"** (`ScoreDetailScreen.tsx:44-49`), not the
backend's "Poor" (`configs/v1.ts:23-24`).

| Band | Band word | Verdict | Pixel icon (board art) |
|---|---|---|---|
| Excellent (≥ 75) | Excellent | **Clear skies** | Sun with four rays (board outlook "Sat", forecast icon) |
| Good (55–74) | Good | **Mostly clear** | Sun behind cloud (board hero 28×20; outlook "Fri") |
| Fair (40–54) | Fair | **Cloudy** | Grey cloud, no rain drops (decision 1) |
| Low (< 40) | Low | **Stormy** | Dark cloud with lightning (board outlook "Mon") |
| Building (score null, cold start) | — | **Learning your weather** | Sun outline in dotted grey (new, same grid) |
| No data for D | — | **No reading** | Empty sky: grey dashes (new, same grid) |

- **Art.** All art is in `mobile/src/lib/weatherArt.ts` as rect lists (`{x, y, w, h, fill}`), copied from the board's
  `<rect>`s. It is drawn by `components/recovery/WeatherIcon.tsx` with `react-native-svg` `Rect`s and
  `shapeRendering="crispEdges"`, the same approach as `components/achievements/BadgeIcon.tsx`. There are two grids: a
  **hero** grid 28×20, drawn at 150×107, and a **small** grid 11×11, drawn at 22 (outlook) and 44 (forecast). Pixel
  colours are fixed and are the same in light and dark. The board only has hero art for Good. The other three hero
  icons and the two new states are drawn on the same 28×20 grid in the same palette. They are shown to the owner as a
  canvas strip before they are merged, following the mockup-first rule.
- Icons are decorative (`accessible={false}`). The verdict text carries the meaning.

### 3.1 Header

- **Content.** The left button is back: `Button variant="outline" size="icon-lg"` (40 px, the board's 40×40), chevron
  icon, `accessibilityLabel="Back"`. In the centre is `PageTitle` "Recovery" with a caption subtitle under it:
  `"{Wed 8 Oct} · updated {7:12 AM}"` (see §3.1 copy). The right button is info, the same button style with
  `accessibilityLabel="How the score works"`. It opens a `Sheet` (`components/ui/sheet.tsx:34`).
- **Native header.** The stack header is hidden for this route (`headerShown: false`), because the board's subtitle
  under the title does not fit the native `HeaderTitle` (`navigation/headerStyle.tsx:19`). Safe-area top inset applies.
- **Info sheet.** Title "How the score works". It contains:
  - the framing `SCORE_FRAMING` (`scoreInsights.ts:3`);
  - "Each day starts at 50. HRV, resting heart rate and sleep debt move it up or down against your own usual, weighted 45 / 35 / 20" (weights from `configs/v1.ts:122`, read from the DTO, not hard-coded);
  - the "Baselines used" sentences from `buildBaselineSentence` (`scoreInsights.ts:203`), moved here from ScoreDetail (`ScoreDetailScreen.tsx:199-210`);
  - the band ranges with their weather words.
- **Data.** `date`, `updatedAt`, `baselines`, `weights`, `bands`.
- **Copy.** The date is `formatScoreDate`-style but day-first, as on the board ("Wed 8 Oct"). "updated h:mm AM" comes
  from `DailyScore.updatedAt` (`schema.prisma:388`) in device local time. When `updatedAt` is null (no row), only the
  date is shown. On a past day the text reads `"Thu 2 Oct"` with no "updated".

### 3.2 Hero

- **Content.** The weather icon for the band, the numeral (`text-score`, `round(score)`), the verdict (`text-display`),
  and the hero line `"{Band} · {±N} vs {yesterday|Mon|…} · {High|Medium|Low} confidence"`.
- **Data.** `score.score`, `score.confidenceLevel`, `previous` (same rule as today's `/me/scores/:date`:
  `routes.ts:85-95`, the last earlier day with a non-null score).
- **Delta wording.** If `previous.date === D − 1`, use "vs yesterday". If it is within 7 days, use "vs {weekday short}".
  If it is older or null, drop the delta part. Δ = `round(score) − round(previous.score)`, signed with a real minus
  (`−`) as `formatPoints` does (`scoreInsights.ts:77-81`). Δ = 0 reads "same as yesterday".
- **Band colour.** The band word takes the band colour. The rest is muted.
- **States.**
  - **Building.** The icon is the building art. The numeral is replaced by `text-number` "Day {n} of {N}" from
    `pickColdStartProgress(score.coldStart)` (`scoreInsights.ts:95`). The verdict is "Learning your weather". The line is
    "Your forecast is charging up · {N − n} days to go".
  - **No data.** The icon is the no-reading art. The numeral is "—". The verdict is "No reading". The line is
    "Waiting for last night's data" when D is today, else "No data synced for this day".
  - **Low confidence.** The line ends "Low confidence" in the Fair colour, and the summary (§3.3) gets its
    low-confidence sentence.

### 3.3 One-line summary

- **Content.** One or two sentences in a `bg-card` tile, `text-body`.
- **Data.** Active factors' `points` and `imputed`, plus `confidenceLevel`.
- **Template.** This is `buildRecoverySummary` in `mobile/src/lib/recoveryCopy.ts`. It follows the same ranking and
  `NEGLIGIBLE_POINTS` (0.5) rule as `buildScoreVerdict` (`scoreInsights.ts:178-191`).
  1. *Top lift* (largest positive `points` ≥ 0.5): HRV "A warm front in your HRV is lifting you today." · Resting HR "A calm resting heart rate is lifting you today." · Sleep debt "Clear air: your sleep debt is lighter than usual."
  2. *Top drag* (largest negative ≤ −0.5): HRV "A cold front in your HRV is holding you back." · Resting HR "A gusty resting heart rate is holding you back." · Sleep debt "{Light |}sleep-debt fog lingers; an early night clears it." ("Light " when |points| < 3).
  3. Neither: "Calm conditions: everything is close to your usual."
  4. Low confidence (appended): "Some readings are missing, so treat today as a rough read."
- **Tense.** On a past day, "today" becomes "that day", "is lifting you" becomes "lifted you", and so on. Each
  template has `present` and `past` forms.
- **States.** Building: "We need {N − n} more days of {metricName} to read your weather. Keep wearing your watch to
  bed." No data: the tile is hidden.

### 3.5 Last 7 days

- **Content.** `SectionLabel` "Last 7 days". There are 7 columns, oldest to newest, ending at D. Each column has the
  weekday (`text-fine`), a small weather icon (22) and the score (`text-caption`). The last column reads "Today" (or the
  weekday of D on a past day) and gets a `bg-muted` 8 px rounded highlight (board: `background: rgb(28,31,38)`).
- **Naming.** The board's strip is the **trailing** week (Thu…Today match the calendar's 2–8 Oct), not a future
  forecast, so the owner renamed it "Last 7 days" (decision 3, 2026-10-09).
- **Data.** `outlook[]` (7 entries, `score` or null).
- **States.** A day with no row or a null score shows the no-reading icon, dimmed, and "—". Tapping a column pushes that
  day's Recovery (same as the calendar).

### 3.6 "Sleep and streak" bento

`SectionLabel` "Sleep and streak", then a 2-column grid with a 10 px gap. The sleep-debt tile spans 2 columns. Below it
are Last night and Clear streak.

**Sleep-debt tile (wide)**

- **Content.** An eyebrow with a moon icon: "Sleep debt · 14 nights". On the right is the factor word and points
  ("Fog · −5", in the tone colour). Then the value `text-display` "3h 10m" with "owed · usual under 2h 05m". Then a
  block row: each block is 30 min, 16 px tall, radius 3. The fill colour is the drag colour when debt is above usual,
  otherwise muted. The last block is partial, at 45% opacity, for a remainder ≥ 10 min. Empty blocks are `bg-muted`.
  Block count = `clamp(ceil(max(debt, usualHigh) / 30) + 1, 8, 16)`. The board shows 8.
- **Caption.** "Each block is 30 min. {clearCopy}", where clearCopy depends on `nightsToClear`:
  - 0: "You're within your usual."
  - 1: "One night at your {goal} goal clears the fog."
  - 2–14: "{Two…} nights at your {goal} goal clear the fog."
  - null: nothing.

  `{goal}` is the goal in hours ("8h", or "7h 30m" when it isn't whole). The number is a word up to ten. Owner-approved (decision 2): the
  engine's debt is a floored rolling sum (`scoring/features.ts:10-27`), so a long night does **not** repay debt. Debt
  clears as deficit nights leave the 14-night window. `nightsToClear` is therefore the number of future nights at goal
  until the rolling sum is ≤ the usual high.
- **Data.** `sleepDebt` (§4).
- **States.** With no features row, the tile shows "No sleep data in the last 14 nights". In cold start (no SLEEP_DEBT
  baseline) there is no "usual" text and no clear copy.

**Last night tile**

- **Content.** The eyebrow "Last night", the duration `text-display` ("6h 48m"), a stage bar (8 px, segments in
  `sleepDeep / sleepRem / sleepLight / sleepAwake` order as on the board, theme tokens `theme.ts:103-106`; reuse
  `STAGE_TOKEN` from `components/sleep/StageStrip.tsx:10-15`), and the caption "Deep 1h 22m · REM 1h 31m".
- **Data.** `lastNight` (from `getSleepNight(userId, D)`, `backend/src/biometrics/sleepNight.ts:47`; the night that
  ended on D is the night that produced D's HRV, `scoring/compute.ts:71-72`).
- **Action.** The whole tile is a navigating card. It calls `openNight(navigation, D)`, a new helper in
  `mobile/src/navigation/sleepNavigation.ts` that currently navigates to `SleepNight { date }`
  (`RootNavigator.tsx:107,252`). **Dependency:** the combined Sleep page work repoints this one helper. No caller names
  the route directly.
- **States.** With no stages (`hasStages: false`), there is a solid single-colour bar and the caption is
  "No stage data". With no night (404), the tile shows "No sleep recorded", is not tappable, and its value is "—".

**Clear streak tile**

- **Content.** The eyebrow "Clear streak", `text-display` "{n}" plus `text-caption` "days" (or "day"), a strip of the
  last 4 days' band squares (14 px, radius 4; from `outlook`), and the caption "Good or better · best run {best}".
- **Rule.** A clear day has score ≥ `bands.good`. `current` is the run of consecutive clear days ending at D. If D is
  today and has no score yet, the run ends at D − 1 so the streak doesn't "break" before the morning sync. A missing day
  or a null score breaks the run. `best` is the longest run in all stored history up to D.
- **States.** current = 0 shows "0 days" with the caption "Good or better · best run {best}". With no history the
  caption is "Good or better days in a row".

### 3.7 Month calendar

- **Content.** The eyebrow is the month name ("October"; with the year when it isn't the current year). On the right
  are prev/next `Button variant="ghost" size="icon-sm"` (labels "Previous month" / "Next month", `hitSlop` to 44). Below
  is a `text-number` month average plus the caption "month average · {1 Excellent, 1 Low}", which lists Excellent and
  Low counts only when they are nonzero and is omitted when both are 0. Then a header row M T W T F S S (Monday first,
  as on the board), then a 7-column grid of 38 px cells (radius 8):
  - **Scored day:** filled with the band colour, score `text-fine` semibold. In dark mode the ink is near-black
    (board). In light mode the fill is `withAlpha(band, 0.22)` and the ink is foreground, for contrast (white on lime
    fails AA at 11 px).
  - **D:** a 2 px ring in foreground with a 2 px gap (board `box-shadow`).
  - **Today, when viewing another day:** the date number is in bold.
  - **Day without a score, or a future day:** `bg-muted` with a muted date number.
  - **Leading blanks:** transparent.

  Then a legend (four dots plus band words), then the hint "Tap a day to see its conditions."
- **Data.** `month` comes in the bundle for D's month. Paging uses `GET /me/recovery/calendar/:month` (§4.3). Prev is
  disabled before `firstScoredDate`'s month. Next is disabled at the current month.
- **Action.** Tapping a scored day, or a past day with a row, pushes `Recovery { date }`. Future cells do nothing and
  are not focusable. A past day with no row still opens, in the no-data state, so "missing day" is explorable.
- **States.** While a month loads, the grid shows a skeleton and the header stays. On error, the caption reads
  "Couldn't load {Month}." with a ghost "Retry" `Button size="sm"`.

### 3.8 Tomorrow's forecast

Shown **only when D is today**; on past days it is hidden (Q4).

- **Content.** The eyebrow "Tomorrow's forecast", with the track record "right {hits} of last {days}" on the right. Then
  a row: a 44 px weather icon for the selected chip's band, `text-number` "{lo}–{hi}", and the caption "if you sleep {h}h
  tonight". Then a `radiogroup` "Sleep tonight" of four chips, 6h / 7h / 8h / 9h, each with the hour (`text-caption`)
  and the predicted score (`text-headline`). The selected chip is inverted (foreground fill, board). Last comes a full
  width `Button variant="outline"` "More levers", which navigates to `Forecast` (`RootNavigator.tsx:84,241`).
- **Chips.** Chips are toggle chips (allowed raw pressables under the buttons guard), with `accessibilityRole="radio"`
  and `accessibilityState={{ checked }}`. The initial selection is the user's sleep goal rounded to the nearest chip.
  Tapping a chip changes the range and caption locally; there is no fetch.
- **Data.** `tomorrow` (§4) is built from the existing engine `buildForecast` (`backend/src/forecast/engine.ts`). Chips
  are the grid cells at `sleepHours ∈ {6,7,8,9}` with the default habit exposure (the same rule as the mobile
  `exposedFor(levers, defaults.habits)`, `mobile/src/lib/forecastGrid.ts:14`). The grid steps by 0.5 h from 4 to 10
  (`forecast/config.ts:23-25`), so all four exist.
- **Track record.** The last 12 points of `trackRecord.series`. A hit is `|actual − forecast| ≤ withinPoints`, the same
  tolerance and rule as `errorSummary` (`forecast/band.ts:30-35`), so this agrees with the Forecast screen's "Within ±N
  on X of the last Y days" (`mobile/src/lib/forecastCopy.ts:15`). With fewer than 5 points the track record is hidden.
- **States.**
  - `NOT_ENOUGH_DATA` / `NO_HISTORY`: there are no chips; the card shows `FORECAST_COPY.unlocksAfter(days)`
    (`forecastCopy.ts:12`) and keeps "More levers" hidden.
  - `LOW_CONFIDENCE_TODAY`: `FORECAST_COPY.lowConfidence`.
  - `UNAVAILABLE` (forecast threw inside the bundle): `FORECAST_COPY.unavailable`.
  - All strings come from `forecastCopy.ts`, plus new keys there (`rightOfLast`, `ifYouSleep`, `moreLevers`).

### 3.9 Ask Axo bar

- **Content.** This is the existing documented custom CTA: a `GlassSurface` bar with the current coach character, 8 px
  corners, pinned to the bottom above the safe area (`ScoreDetailScreen.tsx:213-232`). It is **extracted** into
  `components/coach/AskCoachBar.tsx` and used by both ScoreDetail (for SLEEP) and Recovery, so the button standard keeps
  a single documented exception (`components/ui/README.md:133`). The bar reads "Ask {coachName} about today"
  (`characterInfo(characterId).name`, as `SleepNightScreen.tsx:138-139`), or "…about this day" on a past day. The
  board's arrow is drawn as a decorative icon inside the one pressable, not as a nested button.
- **Action.** `navigateToCoachEntry(navigation, coachRoute, recoveryQuestion(...))` (`navigation/coachNavigation.ts`).
  The coach tab accepts only a `prefill` (`TabsNavigator.tsx:16-17`). The coach's own tools read the score, so "recovery
  context" means a specific prefill. A new `recoveryQuestion` goes in `lib/coachPrompts.ts`:
  - today: "Why is my recovery {68} today?"
  - past day: "Why was my recovery {58} on {Thu 2 Oct}?"
  - building: "When will my recovery score be ready?"
  - no data: "Why don't I have a recovery score {today|for Thu 2 Oct}?"
- **States.** Hidden when `coachEntryRoute(status)` is null (`useCoachStatus`, as now). Scroll bottom padding is 120
  when the bar is shown, 32 otherwise (as `ScoreDetailScreen.tsx:138`).

## 4. Data & API

### 4.1 What exists vs what is missing

| Section | Exists today | Missing |
|---|---|---|
| Hero | `GET /me/scores/:date` gives score, confidence, `previous`, bands (`scoring/routes.ts:62-98`) | `updatedAt`. Also a 200 for a day with no row (today it is a 404, `routes.ts:77-80`) |
| ~~What moved it~~ (removed, decision 6; only summary points + debt needed) | factor `z`, `points`, `imputed`, `excluded`, `coldStart`; baselines `ewma`/`spread` (`scoring/dto.ts:10-46`) | Raw HRV / RHR values and debt minutes for D. The usual low/high in the factor's unit with the **floored** spread the z used (`scoring/baseline.ts:64`, not exported). The snapshot `spread` is unfloored, so a range built from it could disagree with the dot |
| Outlook | `GET /me/scores?days=7&type=RECOVERY` (today only) | Anchoring at an arbitrary D (the window is always "last N days from today", `routes.ts:39-40`) |
| Sleep debt | `UserDailyFeatures.sleepDebtRolling14d`, not exposed anywhere | Minutes, usual, goal, `nightsToClear` |
| Last night | `GET /me/sleep/night/:date` (`biometrics/routes.ts:51-63`) | Nothing new; included in the bundle to save a round trip |
| Streak | — | Current and best run |
| Calendar | `/me/scores?days≤120` from today only (`routes.ts:11-12,27`) | Any calendar month; average; band counts; first scored date |
| Forecast | `GET /me/forecast` (`forecast/routes.ts:9-12`) | The 4-chip slice and the last-12 track record (derivable; done server-side so the client fetches the grid once) |
| Coach | prefill only | `recoveryQuestion` (client only) |

Not used: `/me/habits/patterns` (the Timeline board's "What helps you" card did not make the approved board) and
`/me/coach/today` (the coach's AI sentence stays on the Coach tab).

### 4.2 `GET /me/recovery/:date`

New module `backend/src/recovery/` with `routes.ts`, `bundle.ts`, `dto.ts` and pure helpers in `streak.ts` and
`sleepDebt.ts`. It is mounted in `app.ts` next to `scoresRouter` (`app.ts:35`).

- `:date` is `YYYY-MM-DD` or the literal `today`, which is resolved with `localCivilDate(new Date(), user.timezone)` as
  `routes.ts:39` does.
  - 400 for a malformed date or a date after the user's today.
  - 200 always otherwise, including when there is no row (state `NO_DATA`).
- Auth: `requireAuth`. The user id comes only from the session.
- `Cache-Control: private, no-store` (same as `/me/coach/today`, `coach/routes.ts:328`).
- **Privacy.** Recovery data is the user's own and is never logged. Handlers log only an error code and the route name,
  never values, dates or the DTO. Nothing is cached server-side.

```ts
// backend/src/recovery/dto.ts — mirrored in mobile/src/api/recovery.ts
import type { BaselineDTO, DailyScoreDTO } from '../scoring/dto';
import type { ScoreBands } from '../scoring/configs/v1';

export type RecoveryState = 'READY' | 'BUILDING' | 'NO_DATA';

export interface RecoveryFactorDetailDTO {
  factor: 'HRV' | 'RHR' | 'SLEEP_DEBT';
  label: string;                       // FACTOR_LABELS
  unit: 'ms' | 'bpm' | 'min';
  better: 'HIGHER' | 'LOWER';          // from cfg.direction (+1 / -1), configs/v1.ts:34
  weight: number;                      // base weight from the row's config (for the info sheet)
  value: number | null;                // D's raw value; null when imputed, excluded with no reading, or no row
  usual: { low: number; center: number; high: number } | null; // ewma ± floored spread, low ≥ 0; null in cold start
  position: number | null;             // stored z (already clamped ±3 under v3); null when excluded
  points: number;                      // FactorDTO.points (2 dp); the client makes whole numbers
  imputed: boolean;
  excluded: boolean;
  coldStart: { daysCollected: number; daysRequired: number } | null;
}

export interface SleepDebtDTO {
  minutes: number;                     // round(sleepDebtRolling14d)
  windowNights: number;                // cfg.sleepDebtWindowDays (14)
  goalMinutes: number;                 // the SLEEP_DEBT factor's goalMinutes, else the current goal
  usualLowMinutes: number | null;
  usualHighMinutes: number | null;     // SLEEP_DEBT ewma + floored spread
  nightsToClear: number | null;        // 0..14; null without a usual
}

export interface LastNightDTO {
  date: string;
  minutesAsleep: number;
  stages: { deep: number; rem: number; light: number; awake: number } | null; // minutes; null when !hasStages
}

export interface RecoveryDayDTO { date: string; score: number | null } // score 1 dp

export interface RecoveryMonthDTO {
  month: string;                       // YYYY-MM
  days: RecoveryDayDTO[];              // only dates with a RECOVERY row, ascending
  average: number | null;              // mean of non-null scores, 1 dp
  counts: { excellent: number; good: number; fair: number; low: number };
}

export type RecoveryTomorrowDTO =
  | { status: 'NOT_ENOUGH_DATA'; reason: 'NO_HISTORY' | 'LOW_CONFIDENCE_TODAY'; daysOfHistory: number }
  | { status: 'UNAVAILABLE' }
  | {
      status: 'READY';
      date: string;                    // tomorrow
      chips: Array<{ sleepHours: 6 | 7 | 8 | 9; score: number; band: [number, number]; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }>;
      trackRecord: { hits: number; days: number; withinPoints: number }; // over the last ≤12 series points
    };

export interface RecoveryPageDTO {
  date: string;
  isToday: boolean;
  state: RecoveryState;
  bands: ScoreBands;                   // getLiveConfig().scoreBands
  updatedAt: string | null;            // DailyScore.updatedAt ISO
  score: DailyScoreDTO | null;         // unchanged existing shape (toDailyScoreDTO)
  previous: { date: string; score: number } | null;
  baselines: BaselineDTO[];            // toBaselineDTOs(snapshots, 'RECOVERY'), for the info sheet
  factors: RecoveryFactorDetailDTO[];  // always 3, order HRV, RHR, SLEEP_DEBT; [] when NO_DATA
  outlook: RecoveryDayDTO[];           // exactly 7, D-6..D ascending, score null when no row
  sleepDebt: SleepDebtDTO | null;
  lastNight: LastNightDTO | null;
  streak: { current: number; best: number };
  month: RecoveryMonthDTO;             // D's month
  firstScoredDate: string | null;      // earliest RECOVERY row with a non-null score
  tomorrow: RecoveryTomorrowDTO | null; // null unless isToday
}
```

**State rule.**

- `NO_DATA` when there is no RECOVERY row for D.
- `BUILDING` when the row exists and `score === null`. Every factor is excluded (`scoring/types.ts:97`), so
  `score.coldStart` lists progress.
- `READY` otherwise. A READY day can still have some factors excluded.

**Query plan** (`bundle.ts`, one `Promise.all` after resolving the user and D):

1. The `DailyScore` RECOVERY row for D, its `BaselineSnapshot`s (`BASELINE_METRICS`), and `previous`. These are the
   same queries as `scoring/routes.ts:76-90`; factor that code into a shared `loadScoreDetail(userId, date, type)` so
   both routes use it.
2. One history query:
   `dailyScore.findMany({ where: { userId, type: 'RECOVERY', date: { lte: endOfMonth(D) } }, select: { date, score }, orderBy: { date: 'asc' } })`.
   Outlook, month, streak (`streak.ts`, pure, takes rows ≤ D plus `bands.good` and `isToday`) and `firstScoredDate` are
   all derived from it. It is indexed by `@@index([userId, date])` (`schema.prisma:391`). This is a few hundred rows per
   year.
3. `biometricRecord` HRV and RESTING_HR at `recordedAt = civilDateToUtcMidnight(D)`, the same key as
   `scoring/compute.ts:20-36`. The value is used only when the factor is not `imputed`. An outlier-rejected reading is
   imputed (`pipeline.ts:118-142`) and so shows "—", which is correct.
4. `userDailyFeatures` for D (`sleepDebtRolling14d`), plus SLEEP `biometricRecord`s for nights D−13..D. These feed the
   pure `nightsToClear(deficits, usualHigh)`: deficits `d_i = max(0, goal − asleep_i)` (a missing night is 0, as in
   `features.ts:16-18`). It returns the smallest k in 0..14 with Σ deficits of nights D−13+k..D ≤ usualHigh.
5. `getSleepNight(userId, D)` mapped to `LastNightDTO` (`stageTotals.*.minutes`).
6. If `isToday`: `buildForecast(await loadForecastData(userId, now))` inside try/catch. `UNAVAILABLE` on a throw. Map it
   to chips plus a last-12 track record. This is the same cost as today's `/me/forecast`, which the Forecast screen
   still calls separately.

**Usual range.** `usual = { center: ewma, low: max(0, ewma − s), high: ewma + s }`, where `s = flooredSpread(...)`.
`flooredSpread` in `scoring/baseline.ts:64` becomes exported. Debt and the duration factor are in minutes, HRV in ms,
RHR in bpm (`dto.ts:71-78`). Values are rounded: ms and bpm to 0 dp, minutes to 0 dp.

**Weights.** `weight` is the row config's base weight (`configFor(row.algorithmVersion).weights`, `dto.ts:99-101`). It
is not the renormalised per-day weight.

### 4.3 `GET /me/recovery/calendar/:month`

- `:month` is `YYYY-MM`. 400 if it is malformed or after the user's current month.
- Returns `{ month: RecoveryMonthDTO; bands: ScoreBands }`, with the same auth, privacy and cache rules.
- Uses the same `buildMonth(rows, month, bands)` helper as the bundle, so the two cannot disagree.

### 4.4 Mobile client

- `mobile/src/api/recovery.ts`: the types above plus `fetchRecoveryPage(date: string | 'today')` and
  `fetchRecoveryMonth(month)`. Errors throw, as in `api/scores.ts:100-108`. There is no 404 path.
- `mobile/src/lib/useRecoveryPage.ts`: a load-state hook (`loading | error | ready`). It refetches on focus when D is
  today (scores land after the morning sync), and keeps a month cache keyed by `YYYY-MM` for calendar paging.
- `mobile/src/lib/recoveryCopy.ts`: every string and the pure helpers (`weatherFor(band | state)`, `factorWord`,
  `wholePoints`, `buildRecoverySummary`, `heroLine`, `debtClearCopy`, `formatMinutes`, `monthCaption`,
  `trackRecordCopy`). Components never inline copy, the same rule as `forecastCopy.ts:1-2`.
- Existing `/me/scores/:date` and `/me/scores` are unchanged. Home, Activity and Sleep keep using them.

## 5. Navigation

New stack route: `Recovery: { date?: string } | undefined` in `RootStackParamList` (`RootNavigator.tsx:75-83`). It is
registered as `<Stack.Screen name="Recovery" component={RecoveryScreen} options={{ headerShown: false }} />`.
Undefined `date` means today (it fetches `today`).

| Entry point | Today | After |
|---|---|---|
| Home hero tap | `ScoreDetail { date, type: 'RECOVERY' }` (`DashboardScreen.tsx:272`) | `Recovery { date }`. The hero's `accessibilityHint` becomes "Opens your Recovery page" (`recovery-hero.tsx:69`) and "What moved it ›" becomes "Open Recovery ›" (`:101`) |
| Activity › Usual tiles › Recovery | `ScoreDetail { latestDate, RECOVERY }` (`UsualTiles.tsx:28`) | `Recovery { date: latestDate }`, or `Recovery` (today) when there is no latest date, instead of doing nothing |
| Coach answer card source line, area `recovery` | `ScoreDetail` or Trends (`lib/coachAnswers.ts:60,72-73`) | `{ name: 'Recovery', params: { date } }`, falling back to `Recovery` (today) instead of Trends |
| Calendar / outlook day tap | — | `navigation.push('Recovery', { date })` (push, so back returns to the previous day) |
| Push notifications | No recovery push exists (`notifications/handler.ts:91-104` handles wind-down, buddy and recap) | No change. A future "recovery ready" push routes to `Recovery` (out of scope) |
| `ScoreDetail` with `type` RECOVERY or omitted | Recovery detail | `navigation.replace('Recovery', { date })` on mount, so any old caller or restored state lands on the new page |

**SLEEP stays as it is.** `ScoreDetail { type: 'SLEEP' }` from the Sleep screen (`SleepScreen.tsx:170`) and coach area
`sleep` (`coachAnswers.ts:74-75`) are unchanged until the combined Sleep page replaces them. ScoreDetail keeps its
"Baselines used" section for SLEEP; only the RECOVERY copy moves to the info sheet.

**Last night link.** As §3.6 describes, `openNight(navigation, date)` in `navigation/sleepNavigation.ts` is the single
named target for the combined Sleep page work to repoint.

## 6. States

| State | Trigger | Page |
|---|---|---|
| Loading | First fetch | The header renders. Skeletons (`components/ui/skeleton.tsx`) replace the hero (150 × 220 block), the summary, the factor card, the outlook and the bento. The calendar and forecast show skeleton tiles. testID `recovery-loading` |
| Error | Fetch throws | The header renders, then centred muted text "Couldn't load your recovery." and `Button variant="outline"` "Try again". testID `recovery-error` |
| Cold start | `state: 'BUILDING'` | Hero building state. The summary uses the building copy. The factor card shows progress rows for all three. Outlook, calendar and streak render whatever rows exist. Forecast shows `unlocksAfter` (needs 21 days, `forecast/config.ts:12`). Ask bar prefill "When will my recovery score be ready?" |
| Partial cold start | READY with some `excluded` | Normal page; excluded rows show progress (§3.4) |
| Missing day | `state: 'NO_DATA'` | Hero no-reading state. The summary and factor card are hidden. Outlook, bento (last night may still exist) and calendar render. Today: "Waiting for last night's data" |
| Low confidence | `confidenceLevel: 'LOW'` | The hero line's confidence is in the Fair colour. The summary gets its extra sentence. Imputed factors show "Not recorded" |
| Medium confidence | `MEDIUM` | Shown as "Medium confidence"; nothing else changes |
| Future date | Deep link or bad param | The 400 maps to the error state with the text "That day hasn't happened yet." |
| Forecast states | §3.8 | Per §3.8 |

## 7. Accessibility

- `PageTitle` is the header (`accessibilityRole="header"`, label "Recovery", `components/ui/page-title.tsx:15-20`).
  `SectionLabel`s are not headers (unchanged component). Each card gets `accessibilityRole="summary"` where useful.
- The **hero** is one accessible element, for example "Recovery 68, Good, mostly clear. Up 6 from yesterday. High
  confidence." The weather art is hidden from screen readers.
- **Factor rows** are one element each, for example "HRV 58 milliseconds, usual 49 to 55, warm front, plus 14 points."
  The range bar is hidden.
- **Outlook and calendar cells** are buttons with labels like "Thursday 2 October, 58, Good". Empty cells are labelled
  "No reading" and future cells are not focusable. Prev/next are buttons with labels and 44 px hit targets.
- **Chips** use radiogroup semantics as on the board (`role="radiogroup"`, `aria-label="Sleep tonight"`). Each chip
  label reads "7 hours, predicted 68".
- Colour is never the only carrier: every coloured cell shows its number, and band words appear in the hero, legend and
  labels.
- The light-mode calendar uses tinted cells with foreground ink (§3.7). Dark mode matches the board.
- Font scaling follows the A4 policy (unchanged, `type-system-design.md` §scope). Calendar numbers use
  `numberOfLines={1}`.
- The Ask bar keeps the ScoreDetail CTA's single-pressable semantics with the label "Ask {coach} about today".

## 8. Out of scope

- **The battery widget** (`Battery*.dc.html`, `HomeBattery.dc.html`). Home keeps its current `RecoveryHero` ring.
- **The combined Sleep page** and any change to `ScoreDetail` for SLEEP or to the Sleep / SleepNight screens.
- **Scoring changes:** weights, bands, the sleep-debt definition and forecast models are untouched.
- A recovery push notification. Factor sparklines and a per-factor 7-day history (not on the approved board). The
  "What helps you" habits card. "How 50 became 68" waterfall (Timeline). AI-written summaries.

## 9. Testing

**Backend** (`backend/tests/recovery/`, Jest, same harness as `tests/scoring/routes.test.ts`):

- Unit tests:
  - `streak.ts`: runs across gaps, null scores and the band edge (`score === good`); today-without-score continues
    from yesterday; best across history.
  - `nightsToClear`: already under usual → 0; window roll-off; missing nights count 0; cap 14; no usual → null.
  - `buildMonth`: average, counts per band, leading and trailing months.
  - Usual range with the floored spread: a tiny-MAD series gives the floor, and the dot and the band agree with z.
  - Last-12 track record from a series.
- Route integration tests:
  - `GET /me/recovery/today` resolves the user's timezone.
  - READY, BUILDING and NO_DATA shapes.
  - 400 on a bad or future date.
  - `factors` are always three, in order, with imputed values null.
  - `tomorrow` is null on past days and `UNAVAILABLE` when the forecast throws (mock).
  - `Cache-Control: private, no-store`.
  - No recovery values in captured logs (spy on the logger).
  - Auth required.
  - Calendar endpoint paging and 400s.
  - `/me/scores/:date` is unchanged after the `loadScoreDetail` refactor (existing tests stay green).

**Mobile** (`mobile/__tests__/`):

- `lib/recoveryCopy.test.ts`: weather mapping per band and state, factor words, `wholePoints` sums exactly, summary
  templates (lift, drag, steady, low confidence, past tense), hero line delta wording, debt copy (0 / 1 / n / null),
  month caption, minutes formatting.
- `screens/RecoveryScreen.test.tsx`: loading, error with retry, READY render of every section, BUILDING, NO_DATA,
  low confidence, past day (no forecast, past-tense copy, "this day" ask), chip selection updating the range, calendar
  paging (prev disabled before first month, next disabled at the current month), day tap pushes Recovery, Last night tap
  calls `openNight`, "More levers" navigates to Forecast, the Ask bar hidden without a coach route.
- Navigation tests:
  - Home hero, UsualTiles (`__tests__/components/UsualTiles.test.tsx`), coachAnswers destination and
    `coachNavigation` tests updated to `Recovery`.
  - `ScoreDetail` RECOVERY replaces to Recovery.
  - ScoreDetail SLEEP tests (`ScoreDetailScreen.test.tsx`, `ScoreDetailRedesign.test.tsx`,
    `ScoreDetailCoachEntry.test.tsx`) keep passing for SLEEP. Their RECOVERY cases move to RecoveryScreen tests.
- `components/WeatherIcon.test.tsx`: renders the rect count per art, `crispEdges`, hidden from accessibility.
- Convention guards stay green: `__tests__/conventions/typography.test.ts` (tokens only, no inline font, no serif) and
  `__tests__/conventions/buttons.test.ts`. New raw pressables (calendar cells, outlook columns, chips, the Last night
  card) are allowlisted by testID with counts and reasons. The Ask bar moves its existing exception key to
  `AskCoachBar`.

## 10. Global constraints

- **No attribution.** Commits and PRs carry no Co-Authored-By trailer and no Claude/AI mention, in the footer or
  anywhere else. This applies to subagents too.
- **Subagents** (if the build uses subagent-driven development) are dispatched on **opus**.
- **Type:** A4 tokens only (§2.1). `PageTitle` for the title, `SectionLabel` for eyebrows, Geist tabular numbers. No
  Instrument Serif.
- **Buttons:** every button and link is `components/ui/button` (shadcn Base port, neutral primary, `rounded-lg`, no
  pills). Raw pressables only per the buttons-guard allowlist.
- **Pixel art** is crisp (`react-native-svg` rects, `crispEdges`) and matches the coach sprites' palette approach.
- **Guards and typecheck.** The typography and buttons guards pass. Backend `tsc --noEmit` stays clean. Mobile
  `tsc --noEmit --types jest,node` stays at the **12-error baseline** (as recorded for S3). No task adds an error.
- **Privacy.** Recovery values are never logged, cached server-side or sent anywhere but the owner's client.

## 11. Owner decisions (2026-10-09)

1. **Fair icon and word.** Fair is a plain grey cloud with no rain drops, named "Cloudy". Rain and storm art is used
   only for Low.
2. **Sleep-debt copy.** "Two nights at your 8h goal clear the fog". The engine's debt is a rolling 14-night shortfall
   that long nights do not pay back.
3. **Strip label.** The strip is labelled "Last 7 days", because it shows the past week.
4. **Past days and the forecast.** On a past day the Tomorrow card is hidden (the spec default, kept).
5. **Recaps shelf.** Today the shelf is the only entry to Recaps, and it lives on the Sleep page. It moves to Home when
   the Sleep pages merge. That is part of the separate Sleep page work.
6. **No "What moved it" card.** The owner removed the "What moved it" card from the Recovery page, and from the
   Sleep page mockup, on 2026-10-09. Section 3.4 is deleted. The per-factor HRV/RHR raw values and usual ranges in
   §4.1/§4.2 are no longer needed for display. Keep only what the remaining sections use: factor `points`/`imputed`
   for the one-line summary (§3.3), and debt minutes plus the usual for the sleep-debt tile (§3.6). The plan trims
   `RecoveryFactorDetailDTO` accordingly. Section numbers after 3.3 are unchanged, so references elsewhere stay valid.
