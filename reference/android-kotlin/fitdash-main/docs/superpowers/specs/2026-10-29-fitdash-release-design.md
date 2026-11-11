# fitdash release: finish the look, explain the number, reach outside the app

Date: 2026-10-29. Follows the redesign design of 2026-10-28, whose stage 1 (light look, card sizes, bottom bar, Today) is built on the `redesign` branch. This document covers everything else Mayur wants in the release, shipped as one update (Mayur's decision, 29 Oct: "it's fine to have a big update for this once since this is near releasing date").

## Why

The morning question the app does not answer is "what could be the reason for this recovery number?" (Mayur, 29 Oct). The number says "42, steady" and stops. Everything in group 2 exists to answer that. Group 1 finishes what the redesign promised and Mayur noticed missing on the phone: his name in the greeting, a dark mode, and water somewhere he can find it. Group 3 is presence outside the app and the two things Google Health makes painful: export and a week in one view.

## Goals

- Greeting with the person's name and an initial avatar, as in the Dribbble reference.
- Dark mode as a setting: system, light, dark.
- A Log tab with water, protein, caffeine and journal tags; instant logging.
- Every score shows the inputs that moved it, as tappable chips.
- Journal tags with correlations against untagged days.
- Sleep debt and a bedtime target visible on Sleep and used by the caffeine cut-off.
- A weekly review on Today on the first open of the week.
- A morning out-of-range alert for overnight vitals.
- A day timeline card on Today.
- CSV export of the daily table and raw series.
- The widget follows the dark setting.

## Non-goals

- Material You dynamic colour.
- A layout editor or per-card size option. The four card sizes stay as the variety mechanism. Two preset arrangements for Today ("calm", "dense") are a separate, later decision.
- Cycle tracking.
- Server-side anything. Everything stays on the phone.

## Anti-goals

- A chip or correlation that overclaims. Every correlation shows the sample size and is hidden under 10 tagged days.
- Any new screen that the Play build cannot ship. Protein and caffeine segments stay hidden on Play until nutrition access is approved, as the redesign design settled.
- Slowing the cold open. Nothing in this release adds blocking work before Today draws.

## Constraints

- Kotlin, Jetpack Compose, Glance widget, WorkManager, Health Connect. No new libraries.
- Journal tags, name and theme are app-private: `SharedPreferences` for settings, a small JSON file in `filesDir` for tags (date → set of tag ids). Tags never go to Health Connect.
- Verification for every task: `./gradlew :app:testGithubDebugUnitTest :app:lintGithubDebug :app:assembleGithubDebug` with JDK 17 (`JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`), then install on the Pixel 9a and look.
- Metrics code in `metrics/` is pure and unit-tested first. UI code follows the stage 1 card sizes, `Palette`, `Type`, `Motion`, and the existing `ListRow`, `StatTile`, `StripCard`, `RowGroup`, `SectionCard` components. No new `_helpers`.
- Copy is British English, sentence case, no exclamation marks except the greeting.

## Group 1: finish the look

### Name

- First run gets a step before the permission flow: the orb, "What should we call you?", a single text field, Continue and Skip. Stored as `Settings.name` (nullable string, trimmed, 24 characters max). Editable in Settings under Profile as a row "Name".
- Greeting on Today: `greeting(hour, name)` returns "Good morning, Mayur!" with a name and "Good morning" without. The greeting row gets a 36 dp circle on the right with the first letter of the name on a plum ground; without a name, no circle.
- Where first run is detected: the first `TodayUiState.Loading` with `firstRun = true`. The name step shows before `LoadingScreen` when `name == null` and the step has not been skipped (`Settings.nameAsked` boolean). Builder's call, settled here.

### Dark mode

- `Settings.theme`: `SYSTEM` (default), `LIGHT`, `DARK`. Settings gets a row "Appearance" with a three-way segmented control under the Look section.
- `Themes.kt` gains `DARK: ThemeTokens` next to `LOOK`. Ground `#15121F` to `#1A1726`; card `#231F30`; text `#F2EEF8`; muted `#A79FB8`; faint `#7E7790`; accent `#B79CF0`; chip white at 8%; chipStrong plum at 28%; navBg `#231F30` at 90%; group `#231F30` at 85%; groupDivider white at 8%; hairline white at 10%. Good `#8FD35A`, warn `#F2B544`, bad `#F07167`. Tints become dark inks of the same hues (sky `#1E3550`, rose `#4A2638`, peach `#4A3220`, sand `#3C3524`, water `#162F4A`) with light inks for text on them (`#BFD8F5`, `#F2C7D9`, `#F5D2AE`, `#E3D7B8`, `#B9D5F2`). Sleep stage colours unchanged. Glows: yellow `#5A4A1E` at 50%, lilac `#3B2D5E` at 60%.
- `FitdashTheme` takes the resolved choice and provides `LocalTheme` with `LOOK` or `DARK`, and `darkColorScheme` for Material. `MainActivity` sets status bar icons light on dark. `ThemedBackground` draws the dark ground and glows.
- The widget reads `Settings.theme` and the system night mode and picks `LOOK` or `DARK`.
- Every colour in the app already goes through `Palette` and `LocalTheme`; the builder greps for raw `Color(0xFF…)` in `ui/` outside `Themes.kt` and routes any remaining ones through tokens.

### Log tab

As in the redesign design's Log tab and Instant logging sections, with one addition: a fourth segment "Tags".

- Bottom bar gains "Log" between Activity and Trends, icon a plus in a circle. Page index 3; Trends becomes 4. Deep links and `openPage` callers update.
- Segmented control Water / Protein / Caffeine / Tags; on Play, Water / Tags.
- Water card as designed: bottle with two wave layers and bubbles, amount, goal, pace chip, +250, +500, Custom, today's entries with times, Undo bar. Adding is optimistic: `TodayViewModel.addWater` updates `waterLiters` at once, writes in the background, rolls back on failure with the existing snackbar.
- The water row leaves Today. Today's row group keeps heart rate and workouts. (Mayur could not find the row; the Log tab is where it lives now.)
- Protein and caffeine as designed: `NutritionRecord` writes, totals from fitdash's own entries kept in the tags file alongside tags (`date → entries`), so no `READ_NUTRITION` is needed. Protein goal in Settings, default 100 g.
- Tags segment: a grid of chips for the fixed vocabulary below. Tapping toggles the tag for the selected date. Today only by default; the date picker in the top bar changes the day as on other pages, so a tag can be added to yesterday.

### Tag vocabulary

Fixed list, id → label → short hint. Builder's call on icons.

| id | label |
|---|---|
| late_caffeine | Late caffeine |
| alcohol | Alcohol |
| late_meal | Late meal |
| illness | Feeling ill |
| travel | Travel |
| screen_in_bed | Screen in bed |
| stress | Stressful day |
| late_workout | Late workout |
| nap | Napped |
| early_bed | Early night |

## Group 2: explain the number

### Score chips

A row of chips under each score. Chip: 12 sp semibold label on a tinted pill, good green, warn amber, bad red, neutral muted; tapping opens the metric sheet for that input.

- **Recovery.** `ReadinessResult.Ready` gains `parts: Map<Component, Double>` (the 0 to 100 component scores already computed and thrown away). Chips: "HRV 37 ms · below usual" (bad when component < 50, warn 50 to 65, good above), "Resting HR 76 · above usual", "Sleep 95 · good". An input not used is not shown. Chips sit in the Recovery half tile under the number; the tile grows to fit, and on Today the tile pair becomes a hero when more than two chips are present. Builder's call on the exact threshold placement.
- **Sleep score.** `sleepScoreParts` already exists. Chips: "Duration 44 of 50", "Efficiency 15 of 15", "Restoration 12 of 20", "Restfulness 10 of 15", coloured by share of the maximum. Without stages, one chip "Duration only". Shown on the Sleep page under the gauge.
- **Regularity.** Two chips from the existing bed and wake spread: "Bedtime ± 62 min", "Wake ± 55 min", coloured against the band thresholds.
- Copy for each chip lives in `Copy.kt` beside the other score copy.

### Journal tags with correlations

- Storage: `JournalStore` in `settings/`, a JSON file `journal.json` in `filesDir`: `{ "2026-10-28": { "tags": ["alcohol"], "protein": [{"g": 25, "at": "..."}], "caffeine": [...] } }`. Loaded once at start into a `StateFlow`, written on each change. No Health Connect.
- Metrics: `tagEffects(journal, series, end): List<TagEffect>` in `metrics/Journal.kt`. For each tag with at least 5 tagged days inside the window and at least 5 untagged days: mean difference against untagged days for HRV, resting HR, sleep score and deep sleep share, with the counts. Sorted by absolute HRV difference.
- Trends gains an "Insights" section card after the weekly review: one row per tag, "Alcohol · 6 days: HRV −9 ms, resting HR +4 bpm, sleep score −7". Hidden until 10 tagged days exist, with a muted line "Tag 10 days to see patterns · 4 so far" in its place.
- Today: when yesterday has tags and today's recovery is below 50, the readout strip adds a second line "Yesterday you tagged alcohol." Builder's call, settled here.

### Sleep debt and bedtime target

- Sleep debt already exists (`FitnessData.sleepDebt`, 7 nights). It moves beside the Sleep page gauge as a chip "Sleep debt 2.4 h" (warn above 2 h, bad above 5 h), tapping opens the existing fitness sheet.
- `Settings.bedtimeTarget: LocalTime?`; default shown as the 14-day median of bed times when unset. Settings row "Bedtime" under Goals, time picker.
- Sleep page gets a line under the bed and wake row: "Aim for bed by 11:15 PM tonight" when debt is above 1 h, otherwise "Bedtime target 11:15 PM".
- The evening reminder from the backlog is out of scope for this release.

## Group 3: presence and reach

### Weekly review on Today

- The existing `WeekReviewCard` shows at the top of Today, under the readout strip, on the first open on a Monday (or the first open of the week) and stays until dismissed with a small "×" or until Wednesday. `Settings.weekReviewSeen: LocalDate` records the dismissal. Builder's call, settled here.

### Morning out-of-range alert

- `ReminderWorker` (already hourly) gains a morning check: between 6 AM and 11 AM local, once per day, when the night's data is present and resting HR, respiratory rate or skin temperature delta is outside its 30-day normal range in the unhealthy direction (`rangeStatus` already exists), post a notification "Overnight vitals outside your range" with the values, tapping opens Today. `Settings.morningAlert` opt-in toggle under Notifications; needs background access like the move nudge.
- Today shows a matching rose strip card at the top for that day: "Resting HR 76 bpm, above your usual 62 to 70".

### Day timeline

- A `StripCard` on Today under the week strip and sync row, 84 dp tall: a 24-hour band from midnight to midnight. Sleep span in deep plum, naps in light plum, workouts in peach, hourly steps as a faint density bar along the bottom, heart rate as a thin line, and a dotted caffeine cut-off marker 10 hours before the bedtime target. Current time is a thin vertical line on today.
- Tapping a sleep span opens the Sleep page, a workout opens its sheet, elsewhere opens the heart rate sheet.
- Hidden when the day has no sleep and no workouts and no heart rate.

### CSV export

- Settings → Data → "Export daily table" and "Export raw data". The first writes `fitdash-daily.csv` (date, recovery, sleep score, hours asleep, efficiency, awakenings, HRV, resting HR, steps, distance, calories, active minutes, water, weight, tags) for the available window. The second writes a zip with `heart-rate.csv`, `sleep-stages.csv`, `workouts.csv`, `journal.csv`. Both go through the existing `FileProvider` and the share sheet, like the share image.
- Written on `Dispatchers.IO`; a progress spinner on the row while writing.

### Widget

- Follows the dark setting (see Group 1). No new sizes in this release.

## Order of work

1. Name, dark mode, widget theme.
2. Log tab with water, protein, caffeine, tags, instant logging; water leaves Today.
3. Score chips.
4. Journal correlations and the Insights card.
5. Sleep debt chip, bedtime target.
6. Weekly review on Today, morning alert.
7. Day timeline.
8. CSV export.

Each step is its own commit on `redesign`. One pull request at the end, as Mayur asked.

## Left to the builder

- Exact chip thresholds and wording within the rules above.
- Icons for tags and the Log tab.
- Whether the timeline draws heart rate with the existing sparkline path code or a new one.
- Test fixtures for the journal file.
