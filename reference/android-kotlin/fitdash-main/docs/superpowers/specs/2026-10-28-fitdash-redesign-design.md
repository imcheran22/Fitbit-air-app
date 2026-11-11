# fitdash redesign: soft light look, Log tab, instant logging

Date: 2026-10-28. Approved in chat by Mayur. Mockups: `.superpowers/brainstorm/25909-1793207635/content/soft-light-v4.html` (git-ignored; the chosen direction).

## Why

The app looks dated after a few days and adding water feels broken: a tap waits for the Health Connect write and then a full `load()` before the number moves (`TodayViewModel.addWater`). Mayur wants a full redesign modelled on two Dribbble shots, "AI Health App Design" (Abdur Rouf) and "Harmonizing Health" (Anastasia Golovko for Tino), with microinteractions and animation everywhere, and a polished finish. Existing themes do not need to be kept.

## Goals

- One light look in the style of the references, finished to Dribbble quality, not a sketch.
- Four card sizes so screens are not a stack of identical boxes (folds in #20).
- A Log tab for water, protein and caffeine; water drawn as a bottle that fills.
- Every add reflects on screen immediately.
- Motion and haptics across the app, off when the system "Remove animations" setting is on (part of #16).
- Ask for a name; greet with it.
- Polished water reminder and move nudge notifications.

## Non-goals

- Calories, food search, meal logging, weight logging (weight may come later as a small card).
- A dark version of the new look (later, separate work).
- Bought or commissioned 3D illustrations (the first reference uses them; possible later).
- Issues #22 to #26; they follow the redesign.

## Anti-goals

- A tap that does not visibly respond within one frame.
- Animation that delays reading a number or blocks a tap.
- Anything that reads as a calorie or diet app.

## Look

- Ground: vertical gradient pale lavender `#F3EEF8` to warm off-white `#F4F3EF`, a soft pale-yellow "sun" glow top right, a faint lilac glow lower left.
- Ink `#1E1B2E`, muted `#8A8398`, accent deep plum `#3B2357` (selected day, active tab, primary buttons, add buttons).
- Cards: white at high opacity on rows; pastel gradients on tiles: lavender-violet hero `#A17DF0→#8A66E6` with white text, sky `#D7E9FB`, rose `#F4DCE6`, peach `#FCEBD8`, sand `#EFE6D2`, water blue `#DDEEFF`. Soft plum-tinted shadows, no hairlines.
- Type: one rounded sans (Nunito Sans, OFL, bundled) for everything. Big numbers light weight (300) with small units set as subscripts: `7h 40m`, `1.25 L`. Greeting 30 sp light with the name in semibold.
- Icons: line icons, round caps, 2 dp stroke, inside round tinted circles on rows.

## Card sizes

| Size | Use | Shape |
|---|---|---|
| Hero | one per page, the page's main metric (Today: sleep) | full width, ~132 dp, 24 dp radius, coloured gradient, white text |
| Half tile | paired metrics (steps, recovery) | half width, ~124 dp, pastel |
| Row | lists of metrics with icon, value and squiggle sparkline, or a quick add | full width inside a white group card |
| Strip | wide short summaries (sleep stages, water) | full width, 64–84 dp |

## Navigation

Bottom bar: Today, Sleep, Activity, Log, Trends. Floating white pill bar; the active tab is a plum pill that expands to show its label with a spring. Pager swipes as now. Settings stays behind the avatar or menu on Today.

## Today

Top to bottom: avatar (initial) and calendar button; greeting "Good morning, <name>!"; tappable week strip (dark plum selected day lifts slightly, dot per day with data); sleep hero with stepped hypnogram drawing in; Steps half tile (hourly bars rising) and Recovery half tile (number rolls up like a picker to its value, "Above your usual" under it); a row group for heart rate (sparkline), water (+), caffeine (+). Existing content (readout sentence, workouts, suggestions, fitness, body) moves into these sizes; what goes where is the builder's call within this system.

Streaks are softened (Mayur's decision, 28 Oct): no chips and no milestone pop-ups; a quiet "4 days in a row" line inside the steps, sleep and water cards when the run is 3 or more.

## Log tab

- Segmented control Water / Protein / Caffeine, sliding plum indicator.
- Water: a large bottle in a blue card. Water inside has two wave layers moving at different speeds and a few rising bubbles. Next to it the amount (`1.25 L`), "of 2.5 L goal", and a pace chip. Buttons: +250 (glass, primary), +500 (bottle), Custom (ml entry).
- Adding: a drop falls into the bottle, the level rises with a spring, the bottle sloshes slightly, the number counts up, a haptic tick, and an Undo bar rises from the bottom for ~3 s. Today's entries listed with times.
- Protein: quick +10 g / +25 g and a ring to the daily goal. Caffeine: +1 coffee / +1 tea, the time of the last one. Both write `NutritionRecord` to Health Connect (protein, caffeine fields).
- Totals count only fitdash's own entries, read back without `READ_NUTRITION` (which the Play build removes). Builder's call, settled here.
- Protein goal: a new Settings field, default 100 g, not derived from weight. Caffeine: +1 coffee writes 95 mg, +1 tea 47 mg; the card shows cups and the time of the last one. Builder's call, settled here.
- Play: `WRITE_NUTRITION` is in the GitHub build only; the Play manifest removes it and the Play build hides the Protein and Caffeine segments until production access is approved (Mayur's decision, 28 Oct). Water ships on Play as before.

## Instant logging

Each add updates the UI state at once (optimistic), then writes to Health Connect in the background without a full reload. On a failed write the value animates back and the existing snackbar says it could not save. Undo deletes the written record and also updates at once.

## Motion

Use the existing `Motion` tokens and extend them. Cards enter with a short staggered fade and rise; charts and arcs draw in; numbers roll; presses scale down with a spring; tab and segment indicators slide with a spring; haptics on adds, tab changes and thresholds. All motion off when the system animator scale is 0, plus the in-app Reduce motion setting.

## Name

First run gets an optional "What should we call you?" step before the permission flow, skippable. Stored in `Settings`, editable in Settings. Without a name the greeting is "Good morning".

## Notifications

Water reminder: title "Water", text "1.25 of 2.5 L so far", a progress bar, actions +250 ml and +500 ml, plum accent, new small icon. Move nudge: steps in the last hour and a short line. Both keep their current scheduling rules from `Reminders.kt` / `ReminderWorker.kt`.

## Constraints

- Android, Jetpack Compose, Health Connect, as now. Package stays `app.fitdash`.
- Protein and caffeine need `WRITE_NUTRITION`, which changes the Play Health Connect declaration.
- Settings fields for removed themes and number fonts fall back cleanly for existing installs.
- Themes: Soft, Midnight Teal and Graphite (and Soft's dark variant) are removed; everyone gets the new light look, including phones in system dark mode, until the dark version is built. The theme picker and numbers-font picker leave Settings. The widget and the share card move to the new look. Builder's call, settled here; follows Mayur's "ignore existing themes".
- Each stage below is split into pull requests of about 400 added lines (tests excluded), each mergeable on its own. No release until Stage 3 lands, so pages may look mixed on `main` in between and the old theme does not need to live alongside the new one. Builder's call, settled here.

## Stages

1. New look and card sizes on Today, the new bottom bar.
2. Log tab with the bottle, instant water, protein and caffeine.
3. Sleep, Activity, Trends and sheets in the new look.
4. Name step and the notifications.

## Left to the builder

Exact spacing, curves and durations; which existing Today content becomes which card size; chart drawing details; how optimistic state is held in the view model; test approach.
