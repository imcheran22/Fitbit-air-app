# fitdash v2 — design

Date: 2026-10-11
Status: approved in brainstorming (glass bar = option A), awaiting spec review
Builds on: `2026-10-11-fitdash-design.md` (v1). Everything in v1 stays unless changed here.

## Goal

Make fitdash feel closer to Ultrahuman: swipeable pages, three score rings, simple daily suggestions. Move the Data sources list out of the main page into an info sheet. Add a support link and an "Ask AI" share button.

## Decisions

| Topic | Decision |
|---|---|
| Navigation | Four full pages you swipe between: Today → Sleep → Activity → Trends, plus a floating frosted-glass bar at the bottom (icons + labels) whose highlight slides with the swipe. |
| Info | ⓘ top-right on every page opens a bottom sheet: Data sources, privacy note, Support link, version. |
| Hero | Orb always shows Recovery (the v1 readiness score). The 16:00 switch is removed. |
| Rings | Recovery, Sleep, Movement under the orb; tapping one jumps to its page (Recovery stays on Today). |
| Suggestions | 2–3 rule-based "Do this today" lines on Today. |
| Ask AI | Button on Today shares a plain-text summary of the last 30 days through Android's share sheet. |
| Support | Link in the ⓘ sheet, shown only when a build flag is on (off for a Play build). |
| Sign-in | None. |
| Licence | GPL-3.0 (done). |

Out of scope: MCP server (possible v3, opt-in, separate), Pro features, widgets, notifications.

## Pages

**Every stat is visual, never a plain text row.** Detail stats use one shared **stat tile**: label, value with unit, and a small visual. Tiles sit in a 2-column grid.
- **Range bar** for values with a baseline (SpO₂, breathing rate, skin temperature, HRV, resting HR): a short track showing your normal range (25th–75th percentile of the previous 30 days, today excluded), with a dot for today, coloured green inside the range and amber outside it in the unhealthy direction. Each metric knows its good direction: higher HRV is green, lower resting HR is green, SpO₂ below range is amber, and skin temperature or breathing outside the range in either direction is amber.
- **Mini ring** for values with a goal or share (sleep stages as % of the night, steps / active minutes vs goal).
- **7-day sparkline** for running totals (distance, calories, generic types).

All pages share the v1 look (dark, orb gradient colours, cards fade up, charts draw in, count-ups) and pull-to-refresh. Each page scrolls vertically; swiping horizontally changes page.

### Top bar (every page)

Left: date. Right: ⓘ button (small frosted circle).

### Glass navigation bar

Floating pill, centred, 22 dp above the bottom inset. Four items (icon + label): Today, Sleep, Activity, Trends. A lighter pill highlight slides between items and tracks the pager's scroll offset continuously while swiping (not only on settle). Tapping an item animates the pager to that page. The bar's background is a backdrop blur of the content scrolling under it (via the Haze library), with a faint border and shadow. Page content gets bottom padding so the last card clears the bar. Each page also has a faint coloured glow at the top in its accent colour (Today: score colour, Sleep: violet, Activity: green, Trends: teal).

### ① Today

1. Orb with the Recovery score (v1 readiness: Ready / Calibrating / NoData states unchanged), band word, one line of advice, "Based on …" line when inputs are missing.
2. Three rings, each a small animated arc coloured by its score:
   - **Recovery** = readiness score.
   - **Sleep** = last night's sleep score.
   - **Movement** = today's steps as % of the 9,000 goal, capped at 100.
   A ring with no data shows a grey empty arc and "—". Tapping Sleep or Movement swipes to that page.
3. **Contributors**: HRV, resting HR and sleep as range-bar tiles showing how each pulled the score.
4. **Do this today** card: up to 3 suggestions from the rules below. Hidden when no rule fires.
5. **Ask AI about my data** button.

### ② Sleep

Last night: duration, sleep score and hypnogram. Stage totals as four mini-ring tiles (deep, REM, light, awake as % of the night). Overnight vitals as range-bar tiles (SpO₂, breathing rate, skin temperature). **Sleep · 7 nights**: bars of hours asleep, coloured by each night's sleep score. Empty state when there is no sleep data.

### ③ Activity

Today: steps with a goal ring and hourly bars. Active minutes as a mini-ring tile (goal 30 min), distance and calories as sparkline tiles. **Steps · 7 days**: bars, coloured by % of goal. Empty state when there is no activity data.

### ④ Trends

HRV · 14 days and Resting HR · 14 days line charts, each with its baseline drawn as a dashed line and a range-bar tile for today. Readiness · 7 days bars (v1 Week card). Every generic data type with data, as v1 generic cards. Empty state when nothing qualifies.

### ⓘ sheet

Modal bottom sheet:
- **Data sources**: the v1 list (type, ✓ app / no data / no access).
- One line: "fitdash has no internet access. Your data never leaves this phone unless you share it."
- **Support fitdash** row opening the support URL in the browser, only when `BuildConfig.SHOW_SUPPORT` is true. The URL is a single constant: `https://buymeacoffee.com/thepsygeek`.
- App version.

The Data sources card is removed from the scrolling page.

## Suggestions (rules)

Evaluated in this order, first 3 that fire are shown:

| Condition | Text |
|---|---|
| Readiness band Primed | "Good day for a hard workout." |
| Readiness band Steady | "Moderate effort today. Keep workouts under an hour." |
| Readiness band Recover | "Rest or an easy walk today." |
| Last night asleep < 7h | "Get to bed 30 minutes earlier tonight." |
| HRV ≥ 10% below baseline | "Go easy on caffeine and alcohol today." |
| Hour ≥ 16 and steps < goal | "N steps to go. A 15-minute walk does it." when N ≤ 2,000; otherwise "N steps to go before bed." (N formatted with thousands separators) |

Calibrating or NoData readiness fires none of the band rules.

## Ask AI summary

Plain text, shared with `Intent.ACTION_SEND` (`text/plain`) through the system chooser. Content:

```
My health data from fitdash (Health Connect), generated <date time>.
Please help me understand it. Baselines are my 30-day medians.

Today: recovery <score/band or calibrating>, sleep <h m> (score <n>), HRV <n> ms (baseline <n>), resting HR <n> bpm (baseline <n>), steps so far <n>.

Last 30 days (date, recovery, sleep_hours, hrv_ms, resting_hr, steps):
2026-09-12, 71, 7.4, 44, 60, 8120
...
Other data (latest): Weight 72.4 kg, ...
```

Missing values are blank. Nothing is sent anywhere by fitdash itself; the user picks the app.

## Polish requirements

Polish is a requirement, not a follow-up. v2 is not done until each item holds on the Pixel 9a.

- **Spacing and type:** one spacing scale (4, 8, 12, 16, 24, 32 dp) and the v1 type scale only; page side gutter 16 dp; cards 22 dp radius; no hard-coded one-off sizes.
- **Motion:** all durations and easings come from one `Motion` object. The pager has a subtle parallax (the orb moves slower than the page). Rings sweep in with a 120 ms stagger. Ring taps and page changes give a light haptic tick.
- **First load:** the orb fades from grey to its score colour (not a separate grey orb that is then replaced). The text colour on the orb animates with the orb.
- **Charts:** every chart shares one style (stroke width, corner radius, label size, grid colour). Charts draw in once; scrolling a card off-screen and back does not replay it.
- **Smoothness:** no recomposition per animation frame. Animated values are read in the draw/layout phase; no `Path`/`PathMeasure` allocation per frame. Scrolling and swiping stay at 60 fps on the Pixel 9a.
- **Orb fit:** the orb never clips at its largest breathing size.
- **Empty states:** every page has a designed empty state (icon or grey orb, one sentence, what to do), never a blank page.
- **Edges:** status and navigation bars are dark with light icons; content respects insets; nothing hides under the camera cut-out.
- **Accessibility:** rings, orb and buttons have content descriptions; layouts hold at 1.3× font scale without overlap.
- **On-device review:** after implementation, screenshots of each page (morning and evening, with data and empty) are taken from the phone with `adb exec-out screencap` and checked against this list before the work is called done.

## Code changes

- `metrics/Today.kt`: remove `HeroMode` and the card plan; `TodayData` gains `sleepWeek`, `activityWeek` (steps, distance, kcal), `movementScore`, `suggestions`, `restingHrTrend` (in `HeartSummary`), and the activity summary is always today. `buildToday` still takes `now`.
- New `metrics/Suggestions.kt`: pure rules above.
- New `ui/AiSummary.kt`: pure text builder (presentation text, so it lives in `ui/`).
- `ui/today/` replaced by `ui/pages/`: `PagerScreen` (HorizontalPager + top bar + pull-to-refresh), `TodayPage`, `SleepPage`, `ActivityPage`, `TrendsPage`, `InfoSheet`, `Rings`. Existing cards are reused and the Sources card moves into `InfoSheet`.
- Dependency: `dev.chrisbanes.haze:haze:2.0.1` for the glass blur.
- `app/build.gradle.kts`: `buildConfig = true`, `SHOW_SUPPORT` true for debug and release (flip to false for a Play build).

## Testing

- Unit tests: suggestion rules (each row, order, cap of 3, calibrating), AI summary (header, a full row, blanks for missing values, generic line), `movementScore` cap, 7-day sleep/steps series, resting-HR trend.
- Compose previews for each page with `PreviewData`.
- On device: swipe between pages, ring taps jump to pages, ⓘ sheet opens with Data sources, Ask AI opens the share sheet with the summary.

