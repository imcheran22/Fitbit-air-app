# Design v2: audit against the design system

Step 11 of the [spec](spec.md#81-order), first half. Every screen of the build checked against spec section 2 and the
[design system page](design-system.html), on 2026-10-24. The second half is the fixes, in the order of section 4.

Paths are relative to `app/src/main/kotlin/org/openstrap/app/`. Screenshots are in `build/v2-shots/audit/` (not in
git): the file names below are theirs.

## How it was checked

- **Build:** 1.1.5, debug, installed from `design-v2` before `1a3a93d`. The design system commit changed docs only,
  so the build on the phone is the code this audit points at.
- **Phone:** Galaxy Z Fold 7, folded, cover screen 1080 by 2520. Every screen captured over adb.
- **States forced** with the debug extras in `MainActivity.kt`: `moment` (all seven), `strap_state` (all six),
  `data_state` (all ten), `open_metric` (all ten details), `show_summary`, `workout_notification`.
- **Code scanned** for every rule that can be read from source: dashes, `DotPanel`, colours, type, dot sizes,
  Material parts, minus signs.

**Not covered**, to do in the next pass:

- The live workout and the During moment with a recording running. Forcing During without one shows the Midday
  layout, so only the header label could be checked.
- The real pairing flow (the six pairing previews were checked).
- The Sleep score, Naps, Breathing disturbances and VO2 max details, Edit Today's pin flow, and the Restore and
  Health Connect pages.

## 1. Summary

Nothing in the build follows section 2 yet, which is expected: section 2 was written after the build. What matters is
where the faults come from. Most screens are wrong for the same few reasons, and each is fixed once in a shared part:

| # | Fault | Rule | Fixed in | Screens it fixes |
|---|---|---|---|---|
| 1 | Glow cards dim and muddy, heroes at 45 to 85% strength | 2.1 L4 | `GlowStyle.kt` (`GlowPalette`, `light()`), `GlowCard.kt` (`fillShader`), `GlowTodayScreen.kt:407` (`heroStyle`) | Every glow card |
| 2 | Edge light weak, level fills end in a hard edge | 2.1 L1, L2, Levels | `EdgeCard.kt` (`SoftGlow`, `StrongGlow`, the level brush) | Every edge card, Energy and Load levels |
| 3 | Energy is gold, chargeDeep or a red to green scale | 2.2 | `Theme.kt:28-50`, 14 call sites | Energy everywhere, Recharged and Drained, Energy |
| 4 | Dotted and dashed lines | 2.7 | 17 `dashPathEffect` calls in 9 files, 31 `DotPanel` uses in 4 files | Every chart, Habit Age, workouts, pairing |
| 5 | Two title styles: glow 20 Light, edge 15 Medium | 2.3 | `GlowType.kt`, `GlowLayout.kt:184` (`GlowHeader`) | Every screen with both tiers |
| 6 | Coloured dots in list rows | 2.5 Grouped list | `GlowList.kt` (`ListRow`), 41 call sites | Every list |
| 7 | Several dotted numbers on one card | 2.3 | Hero figures, Your week, Energy, Load and Sleep details | Today heroes, Sleep, details |
| 8 | No caret on cards and rows that open something | 2.5 Tappable | `GlowCard`, `EdgeCard`, `ListRow` | Every tappable card |
| 9 | Material pages, dialogs and fields | 3.4 | `ProfileScreen.kt`, `GoalsDialog.kt`, `TodayCards.kt` (Edit Today), `AlarmsScreen.kt`, `DeviceScreen.kt` | You, Strap and their pages |
| 10 | Cards run under the tab bar with no fade | 3.2 | `MainActivity.kt` tab bar host | Every tab and page |

## 2. System-wide faults

### 2.1 Light (rule 2.1)

- **Glow body capped too dark.** `GlowPalette` caps the body at luminance 0.09 (`MID_MAX_LUMINANCE`) and the band at
  0.07, and the fill melts from light to body on a cubic ease-out by 40% of the card (`fillShader`), so the lit edge
  is gone almost at once. Seen on every glow card, worst on Energy (`tab_recovery_0`, `sc_charge_0`).
- **Heroes not at full strength.** `heroStyle` in `GlowTodayScreen.kt:407` builds every Today hero from `Bloom` with
  `glowStrength` 0.6 by default, 0.45 after a workout (548), 0.85 in the workout window (525), 0.5 for sync stuck
  (642), plus a 0.6 bevel that lights the rim all the way round. L4 is a full rim from one side, no bevel.
- **The Energy level isn't bright.** The Tall Energy on Recovery is dark red from the top down to the number, with no
  bright edge at the bottom (`tab_recovery_0`). The mockup's lit bottom edge is missing because of the two points
  above.
- **The Midday hero isn't a level.** Energy as the Today hero is lit evenly from below over the whole card
  (`today_Midday_0`), not risen to 73%.
- **Edge light too weak.** `SoftGlow` is 62% over about 45 dp and `StrongGlow` 75%. L1 is 70% over 48 dp, L2 90% over
  72 dp. At Night mood (Sleep tab) regularity and Breathing disturbances are barely lit (`tab_sleep_2`).
- **Level fills end in a hard edge.** Load on Activity and Energy on Today stop in a sharp vertical line at the value
  (`tab_activity_1`, `today_WorkoutWindow_0`). The rule is a fade over 40 dp past the value.
- **Recharged and Drained** show a bright line along their lit border (`tab_recovery_0`), the "bright line on the
  border" the edge card rules out. It comes from the gold `chargeDeep` at the edge stop.
- **Moods.** Evening and Night look the same on Today (`today_Evening_0`, `today_Night_0`): the Night mood's light
  from below doesn't show on the hero. The mood is also provided at the app root (`MainActivity.kt:700`), so in the
  evening Recovery and Activity dim too, not only Today. The factors are 0.6 and 0.4, not 0.8 and 0.65.

### 2.2 Colour (rule 2.2)

- **Energy colours.** `MetricColors.charge` is gold #FFD166, `chargeDeep` #F5B400, and `chargeScale` with
  `chargeAt` turns it red to green by value. Used for the Energy edge level (`TodayCards.kt:402`), its ghost line
  (408), Recharged and Drained (`GlowRecoveryScreen.kt:298`), the Energy detail header (`ScoreDetail.kt:218`, 326),
  Energy (`GlowActivityScreen.kt:330`, `GlowWorkoutScreen.kt:263`, `ActivityDetail.kt:504`) and All metrics
  (`AllMetricsScreen.kt:110`). Energy on Today's level card and on its detail is gold, on the hero orange
  (`sc_charge_0`, `today_WorkoutWindow_0`).
- **Two Recovery teals.** `readinessDeep` is used in 9 places (contributors, Time to recover, the Recovery edge card
  in `TodayCards.kt:363`, the details).
- **Workout window hero in Recovery teal.** `GlowTodayScreen.kt:525` lights it with `overviewColor`, the Recovery
  colour. The rule is heart red (`today_WorkoutWindow_0`).
- **Evening hero in Sleep blue.** `GlowTodayScreen.kt:578` uses `sleepDeep` in both Evening and Night. Evening is
  evening violet (`today_Evening_0`).
- **Status colours on health values.** `Narrative.kt:17` colours a "Fair" Recovery with `warn`.
  `GlowHealthspanScreen.kt:91` and 176 colour Habit Age's pace and years with `good` and `warn`.
- **Coloured delete.** "Delete workout" is amber (`TrendBad` #FFB547, `GlowWorkoutMode.kt:1227`), "Forget this
  strap" red (`DeviceScreen.kt`), the Alarms delete in `bad` (`AlarmsScreen.kt:108`, 253). The rule keeps green and
  amber for strap and sync states only, and `bad` goes.
- **A blue accent on Profile.** The sex picker's selected icon is outlined in blue (`you_Profile`), a colour that
  means nothing in the app.

### 2.3 Type (rule 2.3)

- **Two card title styles.** Glow cards use `GlowType.title` (Display Light 20, through `GlowHeader` in
  `GlowLayout.kt:184`), edge cards and lists `GlowType.label` (Sans Medium 15). Side by side on Recovery: Energy
  against Recharged and Drained (`tab_recovery_0`), and on Activity: Steps against Active minutes.
- **Hero sentences** use `GlowType.sentence` (20), which is right, but sit under a 20 Light title of the same size, so
  title and sentence read as one block (`today_Waking_0`).
- **Headline scaled up on workout pages.** `GlowType.headline` (26) times 1.1 to 1.25 for "Outdoor run saved",
  "Ready when you are" and "Add a workout" (`GlowWorkoutSummary.kt:100`, `GlowWorkoutMode.kt:351`, 477), and 46 for
  the live clock (733).
- **Material typography.** 97 uses of `MaterialTheme.typography` remain, 34 of them in `GlowWorkoutMode.kt`, 14 in
  `ZeppSignIn.kt`, 11 in `GlowHealthspanScreen.kt`. Plus 40 literal `fontSize` values in 15 files outside
  `GlowType.kt` and `Theme.kt`, 10 of them in `GlowMetricDetail.kt`.
- **Page titles** are three different styles: "You" and "Your strap" in Sans Bold about 22, "Habit Age" and "Add a
  workout" with a subtitle and a bare arrow, details with a centred pill (`you_0`, `strap_0`, `habit_0`, `wk_add`).
  The rule is one page header: the round back button and the page title in Display 24.
- **The info sheet's meaning** is Sans Bold about 20 (`info_hrv_0`), a size and weight no role has.
- **Secondary text** is 12.5 (`GlowType.secondary`), the rule says 13.
- **Dot sizes.** Ten sizes in use: 1.7, 2.4, 3, 3.2, 3.4, 4.5, 5, 6, 9 dp and computed ones. The rule has six.

### 2.4 Shape and space (rule 2.4)

- **Glow corner 48 dp** (`GlowStyle` default), edge and list 28. Small glow cards look like pills.
- **Four card paddings:** glow 30 by 32 by 26 (`GlowLayout.CardPadding`), wide glow 20 by 32 by 26, edge 20 by 18,
  list 18 by 6 to 8. The rule is 20 on every side.
- **Wrapping in rows.** Contributor words wrap to two lines ("Holding you back", `tab_recovery_0`), and Health alerts'
  value wraps on the Strap page ("Over 150, oxygen under 90%", `strap_0`).
- **Empty band** in the Wide Breathing disturbances card (`tab_sleep_2`), against the rule that a card is as high as
  its content.

### 2.5 Cards (rule 2.5)

- **No carets.** No card that opens something shows a caret: the heroes, Heart rate, Activity, Last night, Your week,
  Habit Age, every row in Body signals and Night vitals, the You and Strap rows. The collapsed Last night strip and
  the "All 4" note are the only ones that have one.
- **Habit Age.** On Recovery it's an edge card lit from the left without (i) (`tab_recovery_2`). Its page is a purple
  glow card and a dotted "How it works" panel (`habit_0`, `GlowHealthspanScreen.kt:89`, 134, 188).
- **The check-in strip** is lit from the left in teal (`today_Waking_0`). Strips light from below.
- **To recover** shows the word "Recovered" in place of a number, at number size (`today_After_1`).
- **Edit Today** is a centred Material dialog with checkboxes and "Pin" text buttons (`sh_edit`). Sheets are the rule.
- **Goals** is a centred Material dialog with outlined fields over a blurred page (`you_Goals`).

### 2.6 List rows (rule 2.5 Grouped list)

- Every metric row has the 8 dp dot, none has its metric icon: 41 `ListRow` calls in 12 files, only workout rows pass
  an `icon`, and that one is toned white. Lists on
  Today, Recovery, Sleep, Activity, every detail's Related list, Before you start, Energy's Where it went.

### 2.7 Lines and charts (rule 2.7)

17 dotted or dashed lines, all to become solid or go:

| Where | What | Code |
|---|---|---|
| Heart rate card and detail, HRV, Blood oxygen, Stress, Skin temperature charts | Dotted grid lines and the dotted band edges of your normal | `GlowCharts.kt:69` (`dottedLine`), 95, 165, 170 |
| Activity card on Today and Activity | Dotted ghost line of your usual | `GlowCharts.kt:374` or 533 |
| Hypnogram (Last night, Sleep hero, Sleep detail) | Dotted stage guides | `GlowCharts.kt:333` |
| Gaps in data lines | Dashed | `GlowCharts.kt:655` |
| Steps card | Dashed baseline for empty hours | `GlowParts.kt:99` (`dotted`), 124 |
| Energy Tall on Recovery | Dotted grid | `GlowParts.kt` or `GlowCharts.kt` |
| Resting heart rate week | Dotted stems | `GlowCharts.kt` |
| Heart points detail | Dashed target line, dash bars | `ActivityDetail.kt:226` |
| After a workout hero, calm down | Dotted resting band and End marker | `GlowWorkoutSummary.kt:200`, `GlowWorkoutScreen.kt:230-248` |
| Pairing stage (all six steps) | Dotted line strap to phone, amber when failed | `DataStateParts.kt:65` |
| Quiet states | Dotted dividers | `GlowQuiet.kt:70`, 130 |
| Old chart helper | Dashed | `components/Charts.kt:181` |

Two charts are drawn entirely from dots, which breaks "dots are for numbers":

- **Steps detail:** the hourly bars are columns of dots (`det_Steps_0`).
- **Active minutes detail:** the daily bars are columns of dots (`sc_Active_minutes`).

`DotPanel` borders (dotted rounded outlines): Habit Age page (9 uses), Ready (15 in `GlowWorkoutMode.kt`: the GPS and
Ask to end panels, Add a workout), All workouts (4 in `GlowWorkoutScreen.kt`), quiet states (3 in `GlowQuiet.kt`).

### 2.8 Dotted numbers (rule 2.3, one per card)

| Card | Dotted numbers | Screenshot |
|---|---|---|
| Waking hero | 2 (score, Energy at waking) | `today_Waking_0` |
| Midday hero, During | 3 (now, recharged, drained) | `today_Midday_0` |
| After hero | 2 (now, resting) | `today_After_0` |
| Evening and Night hero | 3 (steps, Load, Energy left) | `today_Evening_0` |
| Your week | 3 | every Today shot |
| Sleep hero | 5 (score, four stage totals) | `tab_sleep_0` |
| Energy detail | 4 (header, at waking, highest, lowest) | `sc_charge_0` |
| Load detail | 4 (header, from workouts, moving about, strain) | `sc_load` |
| Sleep regularity detail | 3 (header, usually asleep, usually up) | `sc_regularity` |
| Last night's detail (Sleep score) | header plus three times | earlier session shots |

### 2.9 Up and down (rule 2.3)

- A hyphen as minus in `TabCopy.kt:102` (`signed`) and `GlowRecoveryScreen.kt:365` (contributor deltas). `TabCopy`'s
  vs-yesterday line uses the real minus.
- No arrows found in the app. The status words already carry meaning. Nothing to remove.

### 2.10 Frame and motion (rules 3.2, 3.5)

- **No fade behind the tab bar.** Cards and rows run under the pill and are cut by it on every tab and page.
- **You and Strap open with no transition.** Both appear at once over the tab.
- **Material parts on pages:** `OutlinedTextField` and Material switches on Profile, a Material dialog for Goals,
  `TextButton`s on Alarms and the Strap page, the Material outlined search field on Choose a sport.

## 3. Screen by screen

Faults already listed in section 2 aren't repeated unless the screen shows them in a way of its own.

### Today

| Moment | Faults | Shots |
|---|---|---|
| All | Heroes at 45 to 85% strength with a bevel. No carets. No Start a workout strip. Your week has 3 dotted numbers. Dotted grids on Heart rate, dotted ghost on Activity, dotted hypnogram guides on Last night | `today_*` |
| Waking up | Hero has two dotted numbers. Check-in strip lit from the left in teal. Hero says "Strap's estimate" under the score while learning | `today_Waking_0` |
| Midday | Energy hero lit evenly, not as a level. Three dotted numbers | `today_Midday_0` |
| Workout time | Hero in Recovery teal, the rule is heart red from upper right at 120%. Title "Your usual workout time" in Light 20. Energy as a gold edge level with a hard edge. Before you start rows have dots | `today_WorkoutWindow_0` |
| After a workout | Hero lit from the top, the rule is from below at 80%. Two dotted numbers and a dotted resting band. "Recovered" as a number in To recover. Energy gold | `today_After_0`, `_1` |
| Evening | Hero in Sleep blue, not evening violet. Three dotted numbers. Looks the same as Night | `today_Evening_0` |
| Night | Same as Evening. Night mood's light from below doesn't show | `today_Night_0` |
| During | Can't be judged without a recording. The header says "Workout", the spec says the sport ("Running") | `today_During_0` |

States:

| State | Faults | Shots |
|---|---|---|
| Stale, Disconnected, Charging | Chip and markers right. Energy hero faults as Midday | `st_stale_0`, `st_disconnected_0`, `st_charging_0` |
| Sync stuck | Hero glows amber (allowed: a sync state) at 0.5 strength, so it reads muddy brown-gold | `st_stuck_0` |
| Not paired, pairing steps | Dotted strap-to-phone line, amber dotted when failed. Waiting cards dimmed as the rule says | `st_notpaired_0`, `ds_pair*_0` |
| Recovery failed | Fine apart from the hero light | `st_recoveryfail_0` |
| First nights, No sleep, Partial | Fine apart from section 2 faults | `ds_firstnights_0`, `ds_nosleep_0`, `ds_partial_0` |

### Recovery tab

- Energy Tall dim with no bright bottom edge, dotted grid in its curve, Display Light title beside Medium titles.
- Recharged and Drained in gold with a bright line on the lit edge.
- What drove it: contributor words wrap to two lines.
- Body signals: dots, not icons. No carets.
- Habit Age: no (i), no caret.
- Shots: `tab_recovery_0` to `_2`.

### Sleep tab

- Sleep hero: arc, dotted guides, five dotted numbers. The Night mood leaves it and the cards under it almost unlit.
- Night vitals: dots, not icons.
- Regularity and Breathing disturbances: edge light barely visible at Night. Breathing disturbances has an empty band.
- Shots: `tab_sleep_0` to `_2`.

### Activity tab

- The way in is three unlabelled icons and All sports (`tab_activity_0`). The rule is a labelled Start a workout card.
- Steps: dashed baseline for empty hours, 48 dp corners.
- Load: hard-edged level fill.
- Today list: dots, VO2 max's waiting dash fine.
- Workouts: fine apart from the missing carets. One dotted number per row is right.
- Shots: `tab_activity_0` to `_3`.

### Details

| Detail | Faults | Shot |
|---|---|---|
| All metric details | Related list with dots. Header pill and (i) fine. Dotted grid lines in every day chart | `det_*_0` |
| Heart rate | A red Material "Live" switch in the header | `det_HeartRate_0` |
| Resting heart rate | Dotted stems in the week chart | `det_RestingHr_0` |
| Steps | Hourly bars drawn as dots | `det_Steps_0` |
| Energy | Gold, four dotted numbers | `sc_charge_0` |
| Active minutes | Daily bars drawn as dots | `sc_Active_minutes` |
| Heart points | Dashed target line and dash bars | `sc_Heart_points` |
| Load | Four dotted numbers in a row | `sc_load` |
| Sleep regularity | Bedtime and wake times in big dots | `sc_regularity` |
| Recovery, Sleep (pushed) | The tab screens with a different header ("Recovery, Today" and a bare arrow) | `det_Recovery_0`, `det_Sleep_0` |
| Info sheet | Meaning in Sans Bold 20, not a type role. Otherwise right | `info_hrv_0`, `_1` |

### You and Strap

| Page | Faults | Shot |
|---|---|---|
| You | Title in Sans Bold. No carets on rows. "Your data" label in Secondary, fine | `you_0`, `you_1` |
| Profile | Material outlined fields and switches, blue accent on the sex picker, Save as a pill top right | `you_Profile` |
| Goals | Material dialog, the rule is a page or sheet | `you_Goals` |
| Diagnostics | Fine | `you_Diagnostics` |
| Strap | Hero lit green (a strap state, allowed) with the battery in dots. Health alerts' value wraps. Material switches. "Forget this strap" in red | `strap_0`, `strap_1` |
| Alarms | Outlined Add alarm button, Material text buttons in the editor | `strap_Alarms` |
| Phone alerts, Health alerts | Fine apart from type | `strap_Phone_alerts`, `strap_Health_alerts` |
| Firmware, Zepp account | Fine apart from type and page header | `strap_Firmware`, `strap_Zepp_account` |

### Sheets

| Sheet | Faults | Shot |
|---|---|---|
| Calendar | Fine | `sh_calendar` |
| Edit Today | Material dialog with checkboxes, the rule is a sheet with rows | `sh_edit` |

### Habit Age page

- Purple glow card, the rule is the edge card lit from the left with (i).
- "How it works" as a dotted expandable panel, the rule is the info sheet.
- Page header with subtitle and bare arrow.
- Shots: `habit_0` to `_2`.

### Workouts

| Screen | Faults | Shot |
|---|---|---|
| Choose a sport | 38 sports in seven sections, indoor and outdoor as separate sports, Material outlined search, header style of its own | `wk_picker_0`, `_1` |
| Ready | GPS off by default for a run, in a dotted panel. Ask to end in a dotted panel. "Ready when you are" at 26 times 1.25. Strap state as one line, not the hero. No outdoor or indoor switch | `wk_ready`, `wk_ready_walk` |
| Right after (calm down) | Title "Outdoor run saved" at 26 times 1.1. Hero in teal-green, the rule is heart red as a level. Dotted End marker. Delete in amber | `wk_summary_0` to `_2` |
| Workout detail | Delete in amber. Otherwise close to the rule | `wk_detail_0` to `_2` |
| All workouts | Dotted day panels | `wk_all` |
| Add a workout | Dotted panel, page header with a bare arrow, headline at 26 times 1.25 | `wk_add` |
| Notification | Fine | `notif_running` |

### Unfolded (inner screen, 1968 by 2184)

Captured after the first pass with the phone opened: Today at waking, midday and evening, the three tabs, two details
and the calendar. Shots in `build/v2-shots/audit/open/`. The You and Strap pages weren't reached unfolded.

| Where | Fault | Rule | Shot |
|---|---|---|---|
| Every tab | Content runs the full width, no 960 dp limit. A hero sentence becomes one line of 70 characters | 2.4 Unfolded | `today_Waking_0` |
| Today, Recovery | Columns end at very different heights. On Recovery the left column (What drove it, Habit Age) stops halfway and leaves an empty half screen beside Body signals | 2.4 Unfolded | `tab_recovery_1` |
| Today | The right column ends after Activity while the left carries on, so the lower right is empty | 2.4 Unfolded | `today_Waking_2` |
| Tab bar | A narrow pill centred over two columns, cutting into both, no fade | 3.2 | every shot |
| Details | A detail opens in a right pane beside the tab (list and detail), not as one centred column. This works better than the rule and the rule should follow it | 2.4 Unfolded | `det_hrv`, `tab_activity_0` |
| Calendar sheet | Stretches the full width | 3.4 Sheets | `cal_open` |
| Cards | The same faults as folded: dotted grids, row dots, two title styles, dim Energy | 2 | all |

Proposed rule change for the fixes: on 600 dp and up, a detail opens in the right pane beside its tab (as built), a
sheet is at most 600 dp wide and centred, and the two columns are balanced by height, moving the last optional card
(Habit Age, Your week) to the shorter column.

## 4. Fix order

Each step is one or a few commits, built by a subagent and checked on the phone screen by screen before the next.

1. **Tokens.** `GlowType` roles (card title 17 Sans Medium, page title, header, caption, secondary 13), the six dot
   sizes, `MetricColors` (Energy Ember #F66C28, one Recovery teal, evening violet, no `chargeScale`, `chargeDeep`,
   `readinessDeep`, `bad`), card corner 28 and padding 20 as constants. A token test for the rules in spec 8.2.
2. **Light.** `GlowPalette` body cap 0.18, L4 and L3 fills, level glows lit at full with the soft step, `heroStyle`
   at full strength with no bevel, `SoftGlow` and `StrongGlow` to L1 and L2, the edge level fade, moods 0.8 and 0.65,
   and the mood on Today and Sleep only.
3. **Lines.** Every `dashPathEffect` removed per the 2.7 table, the Steps and Active minutes dot bars redrawn as solid
   pill bars, `DotPanel` and `DotHeader` deleted.
4. **Rows and carets.** `ListRow` icons with the 14 metric icons, the caret on tappable cards and rows.
5. **Today.** Hero colours and light per moment, one dotted number per hero, Your week with one, the Start a workout
   strip, the check-in strip from below.
6. **Tabs.** Recovery (Energy Tall, Recharged and Drained, contributor wrap, Habit Age with (i)), the sleep hero,
   Activity's Start a workout card.
7. **Details.** One dotted number in Energy, Load and regularity, solid charts, one page header for every page,
   the info sheet's meaning in a type role.
8. **Pages.** Profile, Goals, Edit Today, Alarms and the Strap page without Material parts, neutral delete text.
9. **Workouts.** Choose a sport with twelve sports and More sports, Ready with the strap hero and the outdoor or
   indoor switch deciding GPS, the calm down page, All workouts and Add a workout without dotted panels.
10. **Frame and motion.** The tab bar fade, You and Strap growing from their buttons.
11. **Unfolded.** The 960 dp content limit, balanced columns, sheets at most 600 dp, and the spec's 2.4 updated for
    the right-pane details.
12. **Recheck** every screen in this audit on the phone, folded and unfolded, plus the screens it didn't cover.

## 5. Recheck (step 12), 2026-10-24

Every screen above, checked again on the phone folded and unfolded after steps 1 to 11 and the follow-up fixes
(up to 863f6f5).

Fixed: every system-wide fault in section 2, every screen fault in section 3, and the unfolded faults (960 dp limit,
balanced columns, details and You/Strap pages in a right pane, 600 dp pages and sheets, fades under the tab bar and
pinned buttons, Smalls two across).

Fixed after the recheck (50d078a to 2574cb2):

- Steps on Activity is a level glow like the Energy battery: lit to the share of the goal over a black core, the
  hourly bars in the dark, the number at the foot (it read as a lime card all over, on the chart glow's olive core).
- The Recovery and Sleep score details share one arc gauge: a symmetric 240 degree arch, round caps, a solid 8% track
  and the value in the metric's ink, the score centred inside. The Sleep detail's horizon arc is gone.
- At waking, the header's pull hint fades out before "Syncing strap..." fades in, one line at a time.
- Profile's two round icons beside Age were the female and male symbols setting sex. Sex is a labelled Female and
  Male segment control now, saying what it's for.
- Every hypnogram draws the stage colours, Today's Last night card and the Sleep detail included.
- Habit Age page: Pace of aging and What moves it are grouped lists with icon rows in their inks.
- The Zepp sign-in keeps to the 600 dp page column unfolded.

Still open:

- The heartbeat glow fix (0fe4c4d) needs a look while the strap streams live heart rate; during the recheck the strap
  was reconnecting.
- The Steps detail showed a device icon top right where the other details have (i). The code has no such icon: every
  detail, Steps included, ends its header in `InfoButton` through `DetailTemplate`, and a test now pins that. Check
  on the phone whether it still shows, and from which way in (Today's Activity card, Activity's Steps card, the Today
  list's Steps row).
- Not covered: during and right after a live workout, the Energy detail, real pairing.
