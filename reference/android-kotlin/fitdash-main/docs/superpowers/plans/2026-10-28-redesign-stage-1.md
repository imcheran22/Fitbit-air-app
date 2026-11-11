# Redesign Stage 1: one light look, card sizes, bottom bar, Today

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three themes with the single soft light look, add the four card sizes and the new bottom bar, and rebuild Today with them.

**Architecture:** `ThemeTokens` stays as the token carrier but holds one value set, `LOOK`; `ThemeId`, `SOFT_DARK`, `NumbersFont` and every `soft`/`lightGround` branch go. Card sizes extend the existing building blocks in `ui/components` (`StatTile`, `ListRow`, `cardSurface`) rather than adding parallel ones. Today is rebuilt from those blocks in `ui/pages/TodayPage.kt`.

**Tech Stack:** Kotlin, Jetpack Compose (Material 3), Health Connect, JUnit 4 unit tests. JDK 17: `export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`.

**Spec:** `docs/superpowers/specs/2026-10-28-fitdash-redesign-design.md`. Mockup: `.superpowers/brainstorm/25909-1793207635/content/soft-light-v4.html` (open in a browser; it is the visual reference for every task).

## Global Constraints

- Ground gradient `#F3EEF8` → `#F4F3EF`; sun glow pale yellow top right; lilac glow lower left.
- Ink `#1E1B2E`, muted `#8A8398`, accent plum `#3B2357`.
- Hero gradient `#A17DF0` → `#8A66E6`, white text. Tints: sky `#D7E9FB`, rose `#F4DCE6`, peach `#FCEBD8`, sand `#EFE6D2`, water `#DDEEFF`.
- One typeface, Nunito Sans (OFL), bundled; big numbers weight 300 with units as smaller text; greeting 30 sp light.
- Card radius 24 dp; hero ~132 dp tall; half tile ~124 dp; strip 64–84 dp.
- Motion off when the system animator duration scale is 0 or the in-app Reduce motion setting is on.
- Each PR about 400 added lines (tests excluded), mergeable on its own; no release until Stage 3.
- Shipthis standard: no new helper or `_underscore` functions (logic inline), comments only for a reason the code cannot show, match each file's style. Run `/simplify` on each PR's diff before opening it.
- Verify every task with: `./gradlew :app:testGithubDebugUnitTest :app:lintGithubDebug :app:assembleGithubDebug` (all pass, lint has no errors).

## Review Focus

- A day with no sleep record: the Today hero must not be blank; it shows steps or "No sleep recorded" with a tap to Data sources (Task 6 preview).
- 1.3x font scale: half-tile numbers and the bottom-bar label must not clip or wrap (Task 4 and Task 6 previews at `fontScale = 1.3f`).
- A past date selected: no add buttons, greeting replaced by the date (Task 6 preview with `isToday = false`).
- Recovery still calibrating: the Recovery tile shows "Night 3 of 7", not a number or a dash (Task 6 preview).
- Reduce motion on (system or setting): cards, rolls and draw-ins appear at their final state immediately (Task 3 device check).

---

## PR 1: One light look

### Task 1: Collapse themes into one look

**Files:**
- Modify: `app/src/main/java/app/fitdash/ui/theme/Themes.kt`, `Theme.kt`, `ScoreColor.kt`
- Modify: `app/src/main/java/app/fitdash/settings/Settings.kt`
- Modify: `app/src/main/java/app/fitdash/MainActivity.kt`, `widget/FitdashWidget.kt`, `ui/pages/SettingsSheet.kt`, `ui/pages/PagerScreen.kt`, `ui/pages/TodayPage.kt`, `ui/components/Blocks.kt`, `Charts.kt`, `DayNav.kt`, `GlassNav.kt`, `Previews.kt`

**Interfaces:**
- Produces: `val LOOK: ThemeTokens` in `Themes.kt`; `LocalTheme` defaults to `LOOK`; `@Composable fun FitdashTheme(content: @Composable () -> Unit)`; `enum class Tint { SKY, ROSE, PEACH, SAND, WATER }` with `LOOK.tints`/`tintInk` in that order.

- [ ] **Step 1:** In `Themes.kt` delete `ThemeId`, `THEMES`, `SOFT_DARK`, `resolveTheme`, and the `soft` and `lightGround` fields. Add `LOOK` with the Global Constraints colours; `card` white, `chip` `#FFFFFFB0`, `chipStrong` plum at 12% alpha, `navBg` white at 85%; sleep stage colours deep `#7A5CFF`, light `#B79CF0`, rem `#58C7FF`, awake `#FFB86B`; good/warn/bad keep Soft's values (`#4F7A22`, `#A86A12`, `#C23B33`). Tint inks: sky `#285A99`, rose `#7A3D5C`, peach `#7A4A24`, sand `#5E5236`, water `#163B6B`.
- [ ] **Step 2:** In `Theme.kt` make `FitdashTheme` take no theme id and always use `lightColorScheme`; make `labelCase`/`noteCase` and `Type` take the former Soft branch only; delete `LocalNumbersFont`, `NumbersFont`, `displayFamily` (Type uses the one family).
- [ ] **Step 3:** In `Settings.kt` delete `theme` and `numbersFont` from `Settings`, `read()` and `update()`. Old keys stay in prefs unread.
- [ ] **Step 4:** Remove every remaining reference (`grep -rn "ThemeId\|resolveTheme\|SOFT_DARK\|NumbersFont\|\.soft\b\|lightGround" app/src` returns nothing): the theme and numbers-font rows in `SettingsSheet`, the dark branches in `GlassNav`/`DayNav`/`Blocks`/`Charts`/`TodayPage`, `FitdashWidget` uses `LOOK`, previews drop the theme parameter, status-bar icons always dark in `MainActivity`.
- [ ] **Step 5:** Run the verification command. Expected: all pass.
- [ ] **Step 6:** Commit `Redesign: one light look replaces the three themes`.

### Task 2: Nunito Sans and the new ground

**Files:**
- Create: `app/src/main/res/font/nunito_sans.ttf`, `licenses/NunitoSans-OFL.txt`
- Delete: every other file in `app/src/main/res/font/` and its licence in `licenses/`
- Modify: `app/src/main/java/app/fitdash/ui/theme/Theme.kt` (`ThemedBackground`, font families)

**Interfaces:**
- Produces: `val Nunito: FontFamily` with weights 300, 400, 600, 700; `Type` styles all use it.

- [ ] **Step 1:** Ask the person before downloading, then fetch the variable font `NunitoSans[YTLC,opsz,wdth,wght].ttf` and `OFL.txt` from `https://github.com/google/fonts/tree/main/ofl/nunitosans` into the paths above.
- [ ] **Step 2:** Define `Nunito` from the one file with `Font(R.font.nunito_sans, weight, variationSettings = FontVariation.Settings(FontVariation.weight(n)))` for 300/400/600/700 (minSdk 26 supports it). Point `Type.hero/title/value/tile` at weight 300, body 400, labels 600; delete `Inter`, `Mono`, `Outfit`, `SpaceGrotesk`, `InstrumentSerif`.
- [ ] **Step 3:** `ThemedBackground` draws the ground gradient, then a radial pale-yellow glow (`#FFF6C8`, radius ~150 dp, centre at top-right outside the screen edge) and a radial lilac glow (`#D9C9F5` at 60% alpha, radius ~160 dp, left edge at ~35% height).
- [ ] **Step 4:** Run the verification command, then install on the Pixel and check every page reads on the light ground. Expected: tests and lint pass; no white-on-white text.
- [ ] **Step 5:** Commit `Redesign: Nunito Sans and the soft ground`. Open PR 1.

## PR 2: Card sizes, motion, bottom bar

### Task 3: Motion tokens and system reduce motion

**Files:**
- Modify: `app/src/main/java/app/fitdash/ui/theme/Motion.kt`, `MainActivity.kt`, `ui/components/Blocks.kt` (`pressScale`, `Reveal`)

**Interfaces:**
- Produces: `Motion.ENTER = 700`, `Motion.STAGGER = 60`, `Motion.press: SpringSpec<Float>` (damping 0.55, stiffness 600), `Motion.settle: SpringSpec<Float>` (damping 0.7, stiffness 300).

- [ ] **Step 1:** Add the tokens. `pressScale` animates with `Motion.press` to 0.965; `Reveal` fades and rises 14 dp over `Motion.ENTER` with `index * Motion.STAGGER` delay.
- [ ] **Step 2:** Where `MainActivity` provides `LocalReduceMotion`, provide `settings.reduceMotion || Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f`, inline.
- [ ] **Step 3:** Run the verification command; on the Pixel turn on Settings → Accessibility → Remove animations and open Today. Expected: content appears at once, no rise or roll.
- [ ] **Step 4:** Commit `Redesign: spring motion tokens; honour system Remove animations`.

### Task 4: The four card sizes

**Files:**
- Modify: `app/src/main/java/app/fitdash/ui/components/Blocks.kt` (`CardShape`, `cardSurface`, `ListRow`), `StatTile.kt`
- Create: `app/src/main/java/app/fitdash/ui/components/Cards.kt` (`HeroCard`, `RowGroup`, `StripCard`)
- Modify: `app/src/main/java/app/fitdash/ui/components/Previews.kt`

**Interfaces:**
- Consumes: `LOOK`, `Tint`, `Motion.press`.
- Produces:
  - `@Composable fun HeroCard(onClick: (() -> Unit)?, description: String, modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit)`: full width, 132 dp min height, 24 dp radius, hero gradient, plum-tinted shadow, white `LocalContentColor`.
  - `StatTile(...)` keeps its signature and becomes the half tile: 124 dp, tint gradient (tint → 6% darker), no hairline.
  - `@Composable fun RowGroup(content: @Composable ColumnScope.() -> Unit)`: white 82% card, 6 dp inner padding, 1 dp `#F0ECF3` dividers between children.
  - `ListRow(icon, title, subtitle, modifier, onClick, trailing: (@Composable () -> Unit)? = null)`: icon in a 36 dp tinted circle; `trailing` holds a sparkline or an add button.
  - `@Composable fun StripCard(onClick: (() -> Unit)?, description: String?, modifier: Modifier = Modifier, tint: Tint? = null, content: @Composable RowScope.() -> Unit)`: full width, 64 dp min height.
- [ ] **Step 1:** Implement the above; every card uses `pressScale` when clickable.
- [ ] **Step 2:** Add a preview `CardSizes` showing one of each at `fontScale = 1.3f` and one at 1.0.
- [ ] **Step 3:** Run the verification command and open the preview. Expected: pass; no clipped text at 1.3x.
- [ ] **Step 4:** Commit `Redesign: hero, half tile, row group and strip cards`.

### Task 5: Bottom bar

**Files:**
- Modify: `app/src/main/java/app/fitdash/ui/components/GlassNav.kt` (rename the composable to `BottomBar`, delete `DockNav`), `ui/pages/PagerScreen.kt`

**Interfaces:**
- Produces: `@Composable fun BottomBar(items: List<NavItem>, pager: PagerState, onSelect: (Int) -> Unit, modifier: Modifier = Modifier)`.

- [ ] **Step 1:** White 85% pill, 62 dp tall, 24 dp radius, plum-tinted shadow, haze blur kept. The selected item is a plum pill with a white icon and its label; the label width animates from 0 with `Motion.settle`; unselected items show the icon only in muted.
- [ ] **Step 2:** `PagerScreen` calls `BottomBar`; semantics stay `Role.Tab` with `selected`.
- [ ] **Step 3:** Run the verification command; on the Pixel swipe and tap between all pages at 1.0x and 1.3x font. Expected: label expands on the selected tab without wrapping.
- [ ] **Step 4:** Commit `Redesign: bottom bar with expanding label`. Run `/simplify`, open PR 2.

## PR 3: Today

### Task 6: Greeting and streak copy

**Files:**
- Modify: `app/src/main/java/app/fitdash/ui/Copy.kt`
- Test: `app/src/test/java/app/fitdash/ui/CopyTest.kt`

**Interfaces:**
- Produces: `fun greeting(hour: Int): String`, `fun streakLine(days: Int): String?`.

- [ ] **Step 1: Write the failing tests**

```kotlin
@Test fun greetingByHour() {
    assertEquals("Good morning", greeting(4))
    assertEquals("Good morning", greeting(11))
    assertEquals("Good afternoon", greeting(12))
    assertEquals("Good afternoon", greeting(16))
    assertEquals("Good evening", greeting(17))
    assertEquals("Good evening", greeting(3))
}

@Test fun streakLineOnlyFromThree() {
    assertNull(streakLine(2))
    assertEquals("3 days in a row", streakLine(3))
    assertEquals("12 days in a row", streakLine(12))
}
```

- [ ] **Step 2:** Run `./gradlew :app:testGithubDebugUnitTest --tests app.fitdash.ui.CopyTest`. Expected: FAIL, unresolved references.
- [ ] **Step 3:** Implement both in `Copy.kt` beside the other copy functions.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `Copy: greeting by hour, quiet streak line`.

### Task 7: Rebuild Today

**Files:**
- Modify: `app/src/main/java/app/fitdash/ui/pages/TodayPage.kt`, `ui/components/DayNav.kt` (`WeekStrip`), `ui/pages/PagerScreen.kt` (previews)

**Interfaces:**
- Consumes: Task 4 cards, `greeting`, `streakLine`, existing `Hypnogram`, `Bars`, `HeartDayLine`, `NumberWithUnits`, `CountUpText`, `onAddWater`.

- [ ] **Step 1:** `WeekStrip`: white 75% day chips, 12 dp radius; the selected day is plum with white text, lifted 2 dp with a plum shadow, moved with `Motion.settle`; a 4 dp dot under days with data (yellow `#FFD36E` on the selected day).
- [ ] **Step 2:** Today order: greeting (`greeting(LocalTime.now().hour)` at 30 sp light; on a past date the formatted date instead), `WeekStrip`, the sync row, the readout sentence as a white `StripCard` with the sparkle icon, then:
  - `HeroCard`: sleep with `NumberWithUnits` (`7h 40m`, 46 sp) bottom left and `Hypnogram` (white stages, awake yellow) bottom right; opens Sleep. No sleep: steps hero with the count, or "No sleep recorded" opening Data sources.
  - Half tiles: Steps (sky, hourly `Bars`, `6,420 of 9k`) and Recovery (rose, `CountUpText` rolling to the score, the band word under it; while calibrating "Night N of 7").
  - Half tiles: HRV (peach) and Resting HR (sand), as today's contributor tiles.
  - `RowGroup`: heart rate (small `HeartDayLine` trailing), workouts (folded as now), water (`1.25 of 2.5 L`, trailing plum `+` adding 250 ml, hidden on a past date).
  - The first suggestion as a `StripCard`; the rest as `ListRow`s.
  - Monday's `WeekReviewCard`, then the Share day / Ask AI pills.
- [ ] **Step 3:** Streaks: delete `StreakRow`; put `streakLine(days)` as a 12 sp muted line inside the Steps tile, the sleep hero and the water row for the matching `Streak.kind`.
- [ ] **Step 4:** Delete what Today no longer uses: the orb branch, `SoftHero`, `GlanceGrid`, `WaterCard`, `ActionCard` if replaced. Keep `Orb.kt` (first-run screen uses it).
- [ ] **Step 5:** Previews in `PagerScreen.kt`: `TodayFull` (`PreviewData.today(21, 30)`), `TodayNoSleep`, `TodayPastDate`, `TodayCalibrating`, and `TodayFull` at `fontScale = 1.3f`.
- [ ] **Step 6:** Run the verification command, open each preview, install on the Pixel and compare Today with the mockup. Expected: pass; each Review Focus case renders as described.
- [ ] **Step 7:** Commit `Redesign: Today in the new card sizes`. Run `/simplify`, open PR 3.
