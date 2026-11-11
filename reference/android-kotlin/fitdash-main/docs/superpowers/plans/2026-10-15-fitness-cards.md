# Fitness Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Fitness section on Trends with five cards (fitness age, VO2 max estimate, sleep debt, training load, resting calories) computed from published formulas, each opening a sheet that shows the formula, the inputs used and the citation.

**Architecture:** Pure functions in `metrics/Fitness.kt` return a value plus an `Explanation`; `buildToday` calls one aggregator and stores a `FitnessData` on `TodayData`. The UI reads only `TodayData.fitness`. A new `Gender` setting flows through `Goals` like the other settings. Rendering reuses `SectionCard`, `StatTile`, `TileGrid`, `SmoothArea`, `CountUpText` and the detail bottom sheet.

**Tech Stack:** Kotlin, Jetpack Compose, Material 3, JUnit 4. Build with `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`. SDK at `~/Library/Android/sdk` (already in the git-ignored `local.properties`).

**Spec:** `docs/superpowers/specs/2026-10-15-fitdash-fitness-cards-design.md`

## Global Constraints

- Card label is "Fitness age"; the string "biological age" never appears in code or copy.
- Setting label is "Gender", options Female, Male, Not set; stored key `gender`, values `FEMALE` or `MALE`, absent when not set.
- Every formula ships with a `Source(title, citation)` next to it; no coefficient from memory. Coefficients in this plan were checked against open copies at design time.
- Every sheet ends with the line "General guide, not medical advice."
- No new Health Connect reads. No internet. No new dependencies.
- Reduce motion must disable count-ups, staggered fills and marker slides.
- British spelling in copy (colour, behaviour). Numbers shown with the app's existing formatters.
- Commits: never add an AI attribution trailer. Do not edit `.github/`.

## Review Focus

1. A user with birth year set but no gender: fitness age and calories tiles must render with the note "Add gender in Settings" and open Settings on tap; VO2 estimate, sleep debt and training load still compute. Test in Task 6.
2. A user whose watch writes VO2 max: the estimate tile must not appear and the Heart tile stays. Test in Task 6.
3. Fewer than 4 workouts in 28 days: training load must be absent, not a ratio from one session. Test in Task 5.
4. A 28-day window where the weekly minutes mean is 0 (no workouts) but steps are high: PA-R must come from steps and never divide by zero. Test in Task 3.
5. Sleep debt on a week with missing nights: a missing night contributes 0 debt, not the whole goal. Test in Task 5.

---

### Task 0: Branch and commit the pending v0.5.1 work

**Files:**
- Modify: nothing new; commits the working-tree changes already present (device-neutral copy, No data screen, Soft dropdown fix, fastlane description, manifest queries).

- [ ] **Step 1: Create the branch**

```bash
cd /Users/mayurrawte/thepsygeek/fitdash
git checkout -b fitness-cards
```

- [ ] **Step 2: Run the existing tests**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest`
Expected: BUILD SUCCESSFUL, 141 tests, 0 failures.

- [ ] **Step 3: Commit the pending work and the spec**

```bash
git add app/src/main docs/superpowers/specs/2026-10-15-fitdash-fitness-cards-design.md fastlane/metadata/android/en-GB/full_description.txt
git commit -m "Device-neutral copy, No data screen with app buttons, Soft dropdown fix, fitness cards spec"
```

---

### Task 1: Gender setting

**Files:**
- Modify: `app/src/main/java/app/fitdash/settings/Settings.kt`
- Create: `app/src/main/java/app/fitdash/metrics/Gender.kt`
- Modify: `app/src/main/java/app/fitdash/ui/pages/SettingsSheet.kt:143-153` (Heart-rate zones card) and the "Body on Trends" toggle at line 165
- Test: `app/src/test/java/app/fitdash/metrics/GenderTest.kt`

**Interfaces:**
- Produces: `enum class Gender { FEMALE, MALE }` in package `app.fitdash.metrics`; `Settings.gender: Gender?`; `fun genderLabel(g: Gender?): String`.

- [ ] **Step 1: Write the failing test**

```kotlin
package app.fitdash.metrics

import org.junit.Assert.assertEquals
import org.junit.Test

class GenderTest {
    @Test fun `labels`() {
        assertEquals("Female", genderLabel(Gender.FEMALE))
        assertEquals("Male", genderLabel(Gender.MALE))
        assertEquals("Not set", genderLabel(null))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest --tests 'app.fitdash.metrics.GenderTest'`
Expected: compile error, `Gender` unresolved.

- [ ] **Step 3: Create Gender.kt**

```kotlin
package app.fitdash.metrics

// The formulas in Fitness.kt come from studies that grouped people by sex at birth; the setting says so.
enum class Gender { FEMALE, MALE }

fun genderLabel(g: Gender?): String = when (g) {
    Gender.FEMALE -> "Female"
    Gender.MALE -> "Male"
    null -> "Not set"
}
```

- [ ] **Step 4: Add the setting**

In `Settings.kt`, add after `birthYear`:

```kotlin
    val gender: Gender? = null,
```

Add the import `import app.fitdash.metrics.Gender`. In `read()` add:

```kotlin
        gender = prefs.getString("gender", null)?.let { runCatching { Gender.valueOf(it) }.getOrNull() },
```

In `update()` chain, after `.putInt("birthYear", s.birthYear ?: 0)` add `.putString("gender", s.gender?.name)`.

- [ ] **Step 5: Add the Gender row in Settings**

In `SettingsSheet.kt`, inside the `SectionCard("Heart-rate zones", …)` block, after the Age `Stepper(...)` call, add:

```kotlin
                    GenderRow(settings.gender) { g -> store.update { s -> s.copy(gender = g) } }
```

Add this composable next to `ThemeRow` (same file, same dropdown pattern):

```kotlin
@Composable
private fun GenderRow(selected: Gender?, onSelect: (Gender?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth().padding(top = Space.s)) {
        Row(
            Modifier.fillMaxWidth().clickable(role = Role.Button) { open = true }.padding(vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Gender", Modifier.weight(1f), style = Type.body.copy(fontSize = 13.5.sp, fontWeight = FontWeight.Medium), color = Palette.Text)
            Text(genderLabel(selected), style = Type.body.copy(fontSize = 13.5.sp), color = Palette.Muted)
            Icon(NavIcons.chevronDown, null, Modifier.padding(start = Space.s).size(14.dp), tint = Palette.Faint)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = LocalTheme.current.bgMid) {
            (listOf<Gender?>(null) + Gender.entries).forEach { g ->
                DropdownMenuItem(
                    text = { Text(genderLabel(g), style = Type.body, color = Palette.Text) },
                    trailingIcon = { if (g == selected) Icon(NavIcons.check, null, Modifier.size(16.dp), tint = Palette.Accent) },
                    onClick = { open = false; onSelect(g) },
                )
            }
        }
    }
    Text(
        "Used by fitness age and resting calories. The studies behind them grouped people by sex at birth; pick whichever matches your physiology.",
        style = Type.tiny, color = Palette.Faint, modifier = Modifier.padding(top = Space.xs),
    )
}
```

Add imports `app.fitdash.metrics.Gender` and `app.fitdash.metrics.genderLabel`. Change the toggle at line 165 to:

```kotlin
            item { ToggleRow("Body and fitness on Trends", settings.showBody, { v -> store.update { it.copy(showBody = v) } }, "BMI, body composition, fitness age and calories") }
```

Also change the Heart-rate zones card trailing label comment to match: the card now holds age and gender.

- [ ] **Step 6: Run tests and compile**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:compilePlayDebugKotlin :app:testPlayDebugUnitTest`
Expected: BUILD SUCCESSFUL, GenderTest passes.

- [ ] **Step 7: Commit**

```bash
git add app/src/main/java/app/fitdash/settings/Settings.kt app/src/main/java/app/fitdash/metrics/Gender.kt app/src/main/java/app/fitdash/ui/pages/SettingsSheet.kt app/src/test/java/app/fitdash/metrics/GenderTest.kt
git commit -m "Gender setting"
```

---

### Task 2: Goals carry birth year and gender

**Files:**
- Modify: `app/src/main/java/app/fitdash/metrics/Readiness.kt:8-13`
- Modify: `app/src/main/java/app/fitdash/ui/today/TodayViewModel.kt:115`
- Test: `app/src/test/java/app/fitdash/metrics/TodayTest.kt` (add one test)

**Interfaces:**
- Produces: `Goals(steps, sleepHours, waterLiters, activeMinutes, birthYear: Int? = null, gender: Gender? = null)`; `fun Goals.age(year: Int): Int?`.

- [ ] **Step 1: Write the failing test**

Add to `TodayTest.kt`:

```kotlin
    @Test fun `goals expose age from birth year`() {
        assertEquals(36, Goals(birthYear = 1990).age(2026))
        assertNull(Goals().age(2026))
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest --tests 'app.fitdash.metrics.TodayTest'`
Expected: compile error, no parameter `birthYear`.

- [ ] **Step 3: Extend Goals**

In `Readiness.kt` replace the data class with:

```kotlin
data class Goals(
    val steps: Int = Tuning.STEP_GOAL,
    val sleepHours: Double = Tuning.SLEEP_TARGET_HOURS,
    val waterLiters: Double = 2.5,
    val activeMinutes: Int = Tuning.ACTIVE_MINUTES_GOAL,
    val birthYear: Int? = null,
    val gender: Gender? = null,
) {
    fun age(year: Int): Int? = birthYear?.let { year - it }
}
```

- [ ] **Step 4: Map settings to goals**

In `TodayViewModel.kt` line 115:

```kotlin
    private fun Settings.goals() = Goals(stepGoal, sleepHours, waterGoalMl / 1000.0, activeGoal, birthYear, gender)
```

- [ ] **Step 5: Run tests**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add app/src/main/java/app/fitdash/metrics/Readiness.kt app/src/main/java/app/fitdash/ui/today/TodayViewModel.kt app/src/test/java/app/fitdash/metrics/TodayTest.kt
git commit -m "Goals carry birth year and gender"
```

---

### Task 3: Fitness core types, PA-R, Jackson VO2 max and fitness age

**Files:**
- Create: `app/src/main/java/app/fitdash/metrics/Fitness.kt`
- Test: `app/src/test/java/app/fitdash/metrics/FitnessTest.kt`

**Interfaces:**
- Produces:

```kotlin
data class Source(val title: String, val citation: String)
data class Explanation(val formula: String, val inputs: List<Pair<String, String>>, val source: Source, val note: String? = null)
data class FitnessValue<T>(val value: T, val explanation: Explanation)
data class FitnessAge(val years: Int, val realAge: Int, val vo2: Double) { val delta: Int get() = years - realAge }
fun paRating(weeklyWorkoutMinutes: Double, stepsPerDay: Double): Int            // 0..7
fun jacksonVo2(age: Int, gender: Gender, bmi: Double, paR: Int): Double
fun fitnessAge(age: Int, gender: Gender, bmi: Double, paR: Int): FitnessValue<FitnessAge>
```

- [ ] **Step 1: Write the failing tests**

```kotlin
package app.fitdash.metrics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FitnessTest {
    @Test fun `PA-R from workouts and steps follows the table`() {
        assertEquals(0, paRating(0.0, 2000.0))
        assertEquals(1, paRating(0.0, 3000.0))
        assertEquals(1, paRating(0.0, 6999.0))
        assertEquals(2, paRating(0.0, 7000.0))
        assertEquals(2, paRating(30.0, 4000.0))
        assertEquals(3, paRating(60.0, 4000.0))
        assertEquals(3, paRating(89.9, 4000.0))
        assertEquals(4, paRating(90.0, 4000.0))
        assertEquals(4, paRating(30.0, 10000.0))
        assertEquals(5, paRating(150.0, 4000.0))
        assertEquals(6, paRating(240.0, 4000.0))
        assertEquals(7, paRating(420.0, 4000.0))
        assertEquals(7, paRating(900.0, 0.0))
    }

    @Test fun `Jackson 1990 worked example`() {
        // 56.363 + 1.921*3 - 0.381*40 - 0.754*25 + 10.987 = 39.023
        assertEquals(39.02, jacksonVo2(40, Gender.MALE, 25.0, 3), 0.01)
        assertEquals(28.04, jacksonVo2(40, Gender.FEMALE, 25.0, 3), 0.01)
    }

    @Test fun `fitness age is a fixed point at the reference inputs`() {
        for (age in 18..90) {
            for (g in Gender.entries) {
                assertEquals(age, fitnessAge(age, g, 25.0, 3).value.years)
            }
        }
    }

    @Test fun `fitter inputs give a younger fitness age and the sheet lists them`() {
        val r = fitnessAge(40, Gender.MALE, 22.0, 6)
        assertTrue(r.value.years < 40)
        assertEquals(40, r.value.realAge)
        assertEquals(listOf("Age" to "40", "Gender" to "Male", "BMI" to "22.0", "Activity rating" to "6 of 7"), r.explanation.inputs)
        assertEquals("Jackson et al. 1990", r.explanation.source.title)
    }

    @Test fun `fitness age clamps to 18 and 90`() {
        assertEquals(18, fitnessAge(20, Gender.MALE, 15.0, 7).value.years)
        assertEquals(90, fitnessAge(85, Gender.FEMALE, 45.0, 0).value.years)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest --tests 'app.fitdash.metrics.FitnessTest'`
Expected: compile error, `paRating` unresolved.

- [ ] **Step 3: Create Fitness.kt**

```kotlin
package app.fitdash.metrics

import java.util.Locale
import kotlin.math.roundToInt

data class Source(val title: String, val citation: String)

// What the info sheet shows: the equation, the inputs with the numbers used, where it comes from, and an optional caveat.
data class Explanation(val formula: String, val inputs: List<Pair<String, String>>, val source: Source, val note: String? = null)

data class FitnessValue<T>(val value: T, val explanation: Explanation)

data class FitnessAge(val years: Int, val realAge: Int, val vo2: Double) {
    val delta: Int get() = years - realAge
}

val JACKSON = Source("Jackson et al. 1990", "Prediction of functional aerobic capacity without exercise testing. Med Sci Sports Exerc 22(6):863–870.")

private const val REF_BMI = 25.0
private const val REF_PAR = 3

// NASA/Jackson physical activity rating 0–7, from mean weekly workout minutes over 28 days and mean steps per day.
fun paRating(weeklyWorkoutMinutes: Double, stepsPerDay: Double): Int = when {
    weeklyWorkoutMinutes >= 420 -> 7
    weeklyWorkoutMinutes >= 240 -> 6
    weeklyWorkoutMinutes >= 150 -> 5
    weeklyWorkoutMinutes >= 90 -> 4
    weeklyWorkoutMinutes > 0 && stepsPerDay >= 10_000 -> 4
    weeklyWorkoutMinutes >= 60 -> 3
    weeklyWorkoutMinutes > 0 -> 2
    stepsPerDay >= 7_000 -> 2
    stepsPerDay >= 3_000 -> 1
    else -> 0
}

fun paRatingRule(paR: Int): String = when (paR) {
    0 -> "under 3 000 steps a day, no workouts"
    1 -> "3 000–7 000 steps a day, no workouts"
    2 -> "workouts under 60 min a week, or over 7 000 steps a day"
    3 -> "workouts 60–90 min a week"
    4 -> "workouts 90–150 min a week, or 10 000+ steps with any workout"
    5 -> "workouts 150–240 min a week"
    6 -> "workouts 240–420 min a week"
    else -> "workouts over 420 min a week"
}

private fun genderTerm(g: Gender) = if (g == Gender.MALE) 1 else 0

fun jacksonVo2(age: Int, gender: Gender, bmi: Double, paR: Int): Double =
    56.363 + 1.921 * paR - 0.381 * age - 0.754 * bmi + 10.987 * genderTerm(gender)

fun fitnessAge(age: Int, gender: Gender, bmi: Double, paR: Int): FitnessValue<FitnessAge> {
    val vo2 = jacksonVo2(age, gender, bmi, paR)
    val raw = (56.363 + 1.921 * REF_PAR - 0.754 * REF_BMI + 10.987 * genderTerm(gender) - vo2) / 0.381
    val years = raw.roundToInt().coerceIn(18, 90)
    return FitnessValue(
        FitnessAge(years, age, vo2),
        Explanation(
            formula = "VO₂max = 56.363 + 1.921 × PA-R − 0.381 × age − 0.754 × BMI + 10.987 × G, G is 1 for men and 0 for women. Fitness age is the age at which someone of your gender with BMI 25 and PA-R 3 would have your VO₂max.",
            inputs = listOf(
                "Age" to age.toString(),
                "Gender" to genderLabel(gender),
                "BMI" to String.format(Locale.ENGLISH, "%.1f", bmi),
                "Activity rating" to "$paR of 7",
            ),
            source = JACKSON,
            note = "Activity rating ${paR}: ${paRatingRule(paR)}. Estimated VO₂max ${String.format(Locale.ENGLISH, "%.1f", vo2)} ml/kg/min.",
        ),
    )
}
```

- [ ] **Step 4: Run tests**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest --tests 'app.fitdash.metrics.FitnessTest'`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/app/fitdash/metrics/Fitness.kt app/src/test/java/app/fitdash/metrics/FitnessTest.kt
git commit -m "Fitness age from the Jackson 1990 model"
```

---

### Task 4: VO2 max estimate and resting calories

**Files:**
- Modify: `app/src/main/java/app/fitdash/metrics/Fitness.kt`
- Test: `app/src/test/java/app/fitdash/metrics/FitnessTest.kt`

**Interfaces:**
- Produces:

```kotlin
fun vo2Estimate(age: Int, restingHr: Double): FitnessValue<Double>
data class Calories(val resting: Int, val daily: Int, val factor: Double)
fun activityFactor(stepsPerDay: Double): Double
fun calories(age: Int, gender: Gender, weightKg: Double, heightCm: Double, stepsPerDay: Double): FitnessValue<Calories>
```

- [ ] **Step 1: Write the failing tests**

Add to `FitnessTest.kt`:

```kotlin
    @Test fun `Uth 2004 VO2 estimate`() {
        // max HR 208 - 0.7*30 = 187; 15.3 * 187/60 = 47.68
        val r = vo2Estimate(30, 60.0)
        assertEquals(47.7, r.value, 0.05)
        assertEquals(listOf("Age" to "30", "Max HR" to "187 bpm (208 − 0.7 × age)", "Resting HR" to "60 bpm"), r.explanation.inputs)
        assertEquals("Uth et al. 2004", r.explanation.source.title)
    }

    @Test fun `activity factor bands`() {
        assertEquals(1.2, activityFactor(4999.0), 0.0)
        assertEquals(1.375, activityFactor(5000.0), 0.0)
        assertEquals(1.55, activityFactor(7500.0), 0.0)
        assertEquals(1.725, activityFactor(10000.0), 0.0)
        assertEquals(1.9, activityFactor(12500.0), 0.0)
    }

    @Test fun `Mifflin-St Jeor worked example`() {
        // 10*70 + 6.25*175 - 5*30 + 5 = 1648.75
        val m = calories(30, Gender.MALE, 70.0, 175.0, 8000.0)
        assertEquals(1649, m.value.resting)
        assertEquals((1648.75 * 1.55).roundToInt(), m.value.daily)
        // 10*60 + 6.25*165 - 5*30 - 161 = 1320.25
        assertEquals(1320, calories(30, Gender.FEMALE, 60.0, 165.0, 1000.0).value.resting)
        assertEquals("Mifflin et al. 1990", m.explanation.source.title)
    }
```

Add `import kotlin.math.roundToInt` at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest --tests 'app.fitdash.metrics.FitnessTest'`
Expected: compile error, `vo2Estimate` unresolved.

- [ ] **Step 3: Implement**

Append to `Fitness.kt`:

```kotlin
val UTH = Source("Uth et al. 2004", "Estimation of VO2max from the ratio between HRmax and HRrest. Eur J Appl Physiol 91:111–115. Max HR from Tanaka et al. 2001.")
val MIFFLIN = Source("Mifflin et al. 1990", "A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr 51:241–247. Activity factors are the standard Harris-Benedict multipliers.")

fun vo2Estimate(age: Int, restingHr: Double): FitnessValue<Double> {
    val maxHr = maxHrForAge(age)
    val vo2 = 15.3 * maxHr / restingHr
    return FitnessValue(
        vo2,
        Explanation(
            formula = "VO₂max = 15.3 × (max HR ÷ resting HR)",
            inputs = listOf(
                "Age" to age.toString(),
                "Max HR" to "$maxHr bpm (208 − 0.7 × age)",
                "Resting HR" to "${restingHr.roundToInt()} bpm",
            ),
            source = UTH,
            note = "Resting HR is your 28-day mean. A watch-measured VO₂max replaces this estimate when available.",
        ),
    )
}

data class Calories(val resting: Int, val daily: Int, val factor: Double)

fun activityFactor(stepsPerDay: Double): Double = when {
    stepsPerDay >= 12_500 -> 1.9
    stepsPerDay >= 10_000 -> 1.725
    stepsPerDay >= 7_500 -> 1.55
    stepsPerDay >= 5_000 -> 1.375
    else -> 1.2
}

fun calories(age: Int, gender: Gender, weightKg: Double, heightCm: Double, stepsPerDay: Double): FitnessValue<Calories> {
    val bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + if (gender == Gender.MALE) 5 else -161
    val factor = activityFactor(stepsPerDay)
    return FitnessValue(
        Calories(bmr.roundToInt(), (bmr * factor).roundToInt(), factor),
        Explanation(
            formula = "At rest = 10 × weight + 6.25 × height − 5 × age + 5 (men) or − 161 (women). Daily need = at rest × activity factor from your 7-day steps.",
            inputs = listOf(
                "Weight" to "${String.format(Locale.ENGLISH, "%.1f", weightKg)} kg",
                "Height" to "${heightCm.roundToInt()} cm",
                "Age" to age.toString(),
                "Gender" to genderLabel(gender),
                "Steps a day" to "${stepsPerDay.roundToInt()}",
                "Activity factor" to String.format(Locale.ENGLISH, "%.3f", factor).trimEnd('0'),
            ),
            source = MIFFLIN,
        ),
    )
}
```

- [ ] **Step 4: Run tests**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest --tests 'app.fitdash.metrics.FitnessTest'`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/app/fitdash/metrics/Fitness.kt app/src/test/java/app/fitdash/metrics/FitnessTest.kt
git commit -m "VO2 max estimate and resting calories"
```

---

### Task 5: Sleep debt and training load

**Files:**
- Modify: `app/src/main/java/app/fitdash/metrics/Fitness.kt`
- Test: `app/src/test/java/app/fitdash/metrics/FitnessTest.kt`

**Interfaces:**
- Produces:

```kotlin
data class SleepDebt(val hours: Double, val nights: List<Double>)   // nights: shortfall per night, oldest first, 7 entries
fun sleepDebt(nightHours: List<Double?>, goalHours: Double): FitnessValue<SleepDebt>
enum class LoadBand { EASING, STEADY, RAMPING }
data class TrainingLoad(val ratio: Double, val acuteMinutes: Long, val chronicWeeklyMinutes: Double, val band: LoadBand)
fun trainingLoad(minutesPerDay: List<Long>): FitnessValue<TrainingLoad>?   // 28 entries, oldest first
```

- [ ] **Step 1: Write the failing tests**

Add to `FitnessTest.kt`:

```kotlin
    @Test fun `sleep debt sums shortfall and ignores missing nights`() {
        val d = sleepDebt(listOf(6.0, 7.5, null, 9.0, 5.0, 8.0, 7.0), 8.0)
        assertEquals(2.0 + 0.5 + 0.0 + 0.0 + 3.0 + 0.0 + 1.0, d.value.hours, 1e-9)
        assertEquals(listOf(2.0, 0.5, 0.0, 0.0, 3.0, 0.0, 1.0), d.value.nights)
        assertEquals("Sleep goal" to "8.0 h", d.explanation.inputs.first())
    }

    @Test fun `training load needs four workouts in 28 days`() {
        val quiet = List(28) { 0L }
        assertEquals(null, trainingLoad(quiet))
        val three = quiet.toMutableList().also { it[27] = 30; it[20] = 30; it[10] = 30 }
        assertEquals(null, trainingLoad(three))
    }

    @Test fun `training load ratio and bands`() {
        // 4 weeks of one 60-minute workout a week: acute 60, chronic weekly 60, ratio 1.0
        val steady = List(28) { i -> if (i % 7 == 6) 60L else 0L }
        val s = trainingLoad(steady)!!
        assertEquals(1.0, s.value.ratio, 1e-9)
        assertEquals(LoadBand.STEADY, s.value.band)
        // last week doubled: acute 120, chronic (60*3+120)/4 = 75, ratio 1.6
        val ramp = steady.toMutableList().also { it[27] = 120 }
        assertEquals(LoadBand.RAMPING, trainingLoad(ramp)!!.value.band)
        // last week skipped but 4 earlier workouts: acute 0, ratio 0
        val ease = steady.toMutableList().also { it[27] = 0; it[0] = 60 }
        assertEquals(LoadBand.EASING, trainingLoad(ease)!!.value.band)
        assertEquals("Gabbett 2016", s.explanation.source.title)
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest --tests 'app.fitdash.metrics.FitnessTest'`
Expected: compile error, `sleepDebt` unresolved.

- [ ] **Step 3: Implement**

Append to `Fitness.kt`:

```kotlin
val SLEEP_DEBT_SOURCE = Source("Your sleep goal", "Sum over the last 7 nights of the hours short of the goal set in Settings. A night without a recording adds nothing.")
val GABBETT = Source("Gabbett 2016", "The training–injury prevention paradox: should athletes be training smarter and harder? Br J Sports Med 50:273–280 (acute:chronic workload ratio).")

data class SleepDebt(val hours: Double, val nights: List<Double>)

fun sleepDebt(nightHours: List<Double?>, goalHours: Double): FitnessValue<SleepDebt> {
    val nights = nightHours.map { h -> if (h == null) 0.0 else (goalHours - h).coerceAtLeast(0.0) }
    val total = nights.sum()
    return FitnessValue(
        SleepDebt(total, nights),
        Explanation(
            formula = "Debt = Σ over 7 nights of max(0, goal − hours asleep)",
            inputs = listOf("Sleep goal" to "${String.format(Locale.ENGLISH, "%.1f", goalHours)} h") +
                nightHours.mapIndexed { i, h -> "Night ${i + 1}" to (h?.let { String.format(Locale.ENGLISH, "%.1f h", it) } ?: "no recording") },
            source = SLEEP_DEBT_SOURCE,
        ),
    )
}

enum class LoadBand { EASING, STEADY, RAMPING }

data class TrainingLoad(val ratio: Double, val acuteMinutes: Long, val chronicWeeklyMinutes: Double, val band: LoadBand)

private const val MIN_LOAD_WORKOUT_DAYS = 4

fun trainingLoad(minutesPerDay: List<Long>): FitnessValue<TrainingLoad>? {
    require(minutesPerDay.size == 28) { "28 days expected" }
    if (minutesPerDay.count { it > 0 } < MIN_LOAD_WORKOUT_DAYS) return null
    val acute = minutesPerDay.takeLast(7).sum()
    val chronicWeekly = minutesPerDay.sum() / 4.0
    if (chronicWeekly == 0.0) return null
    val ratio = acute / chronicWeekly
    val band = when {
        ratio < 0.8 -> LoadBand.EASING
        ratio <= 1.3 -> LoadBand.STEADY
        else -> LoadBand.RAMPING
    }
    return FitnessValue(
        TrainingLoad(ratio, acute, chronicWeekly, band),
        Explanation(
            formula = "Ratio = workout minutes in the last 7 days ÷ (minutes in the last 28 days ÷ 4)",
            inputs = listOf(
                "Last 7 days" to "$acute min",
                "28-day weekly mean" to "${chronicWeekly.roundToInt()} min",
            ),
            source = GABBETT,
            note = "Under 0.8 is easing off, 0.8–1.3 steady, over 1.3 ramping fast. Shown once there are four workout days in 28.",
        ),
    )
}
```

- [ ] **Step 4: Run tests**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest --tests 'app.fitdash.metrics.FitnessTest'`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/app/fitdash/metrics/Fitness.kt app/src/test/java/app/fitdash/metrics/FitnessTest.kt
git commit -m "Sleep debt and training load"
```

---

### Task 6: FitnessData aggregator wired into buildToday

**Files:**
- Modify: `app/src/main/java/app/fitdash/metrics/Fitness.kt`
- Modify: `app/src/main/java/app/fitdash/metrics/Today.kt` (field on `TodayData`, call in `buildToday`)
- Test: `app/src/test/java/app/fitdash/metrics/FitnessDataTest.kt`

**Interfaces:**
- Consumes: everything from Tasks 3–5; `Goals.age(year)`, `Goals.gender`; `HealthSnapshot.weightKg`, `heightMeters`, `restingHr`, `workouts`, `sleep`, `generic`; `stepsOn`, `nightEnding`, `asleepDuration`, `dailyMean`, `window`.
- Produces:

```kotlin
enum class FitnessCard { FITNESS_AGE, VO2, SLEEP_DEBT, TRAINING_LOAD, CALORIES }
enum class MissingInput { GENDER, BIRTH_YEAR, HEIGHT, WEIGHT, RESTING_HR }
data class FitnessData(
    val fitnessAge: FitnessValue<FitnessAge>?,
    val fitnessAgeSeries: List<DayValue>,          // one point per day over the window, fitness age in years
    val vo2Estimate: FitnessValue<Double>?,
    val vo2Series: List<DayValue>,
    val watchVo2: Boolean,
    val calories: FitnessValue<Calories>?,
    val sleepDebt: FitnessValue<SleepDebt>,
    val trainingLoad: FitnessValue<TrainingLoad>?,
    val missing: Map<FitnessCard, MissingInput>,
)
fun fitness(snapshot: HealthSnapshot, date: LocalDate, zone: ZoneId, goals: Goals): FitnessData
```
- `TodayData.fitness: FitnessData`.

- [ ] **Step 1: Write the failing tests**

```kotlin
package app.fitdash.metrics

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.at
import app.fitdash.history
import app.fitdash.plus
import app.fitdash.health.DayActivity
import app.fitdash.health.GenericSeries
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.Sample
import app.fitdash.health.Workout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FitnessDataTest {
    private val year = TODAY.year
    private val goals = Goals(sleepHours = 8.0, birthYear = year - 40, gender = Gender.MALE)

    private fun base(workoutDays: Int = 0): HealthSnapshot {
        val workouts = (0 until workoutDays).map { i ->
            val d = TODAY.minusDays((i * 7 + 1).toLong())
            Workout(at(d, 18), at(d, 19), 56, app = "app")
        }
        return history(TODAY, 28, rhr = 60.0, sleepHours = 7.0) + HealthSnapshot(
            heightMeters = 1.75, weightKg = 70.0,
            dailyActivity = (1..28).map { DayActivity(TODAY.minusDays(it.toLong()), 8000, 6000.0, 2000.0) },
            workouts = workouts,
        )
    }

    @Test fun `all cards compute with full inputs`() {
        val f = fitness(base(4), TODAY, IST, goals)
        assertNotNull(f.fitnessAge)
        assertNotNull(f.vo2Estimate)
        assertNotNull(f.calories)
        assertNotNull(f.trainingLoad)
        assertEquals(7.0, f.sleepDebt.value.hours, 1e-9)
        assertTrue(f.missing.isEmpty())
        assertEquals(28, f.fitnessAgeSeries.size)
        assertEquals(f.fitnessAge!!.value.years.toDouble(), f.fitnessAgeSeries.last().value!!, 0.0)
    }

    @Test fun `no gender hides fitness age and calories but not the rest`() {
        val f = fitness(base(4), TODAY, IST, goals.copy(gender = null))
        assertNull(f.fitnessAge)
        assertNull(f.calories)
        assertNotNull(f.vo2Estimate)
        assertNotNull(f.trainingLoad)
        assertEquals(MissingInput.GENDER, f.missing[FitnessCard.FITNESS_AGE])
        assertEquals(MissingInput.GENDER, f.missing[FitnessCard.CALORIES])
        assertFalse(f.missing.containsKey(FitnessCard.VO2))
    }

    @Test fun `no birth year reports BIRTH_YEAR first`() {
        val f = fitness(base(), TODAY, IST, goals.copy(birthYear = null, gender = null))
        assertEquals(MissingInput.BIRTH_YEAR, f.missing[FitnessCard.FITNESS_AGE])
        assertEquals(MissingInput.BIRTH_YEAR, f.missing[FitnessCard.VO2])
        assertNull(f.vo2Estimate)
    }

    @Test fun `missing weight or height reports it and no resting HR hides the estimate`() {
        val noWeight = base().copy(weightKg = null)
        assertEquals(MissingInput.WEIGHT, fitness(noWeight, TODAY, IST, goals).missing[FitnessCard.FITNESS_AGE])
        val noRhr = base().copy(restingHr = emptyList())
        val f = fitness(noRhr, TODAY, IST, goals)
        assertNull(f.vo2Estimate)
        assertEquals(MissingInput.RESTING_HR, f.missing[FitnessCard.VO2])
    }

    @Test fun `a watch-written VO2 max suppresses the estimate`() {
        val snap = base() + HealthSnapshot(generic = listOf(GenericSeries("VO₂ max", "ml/kg/min", listOf(Sample(at(TODAY, 8), 45.0)))))
        val f = fitness(snap, TODAY, IST, goals)
        assertTrue(f.watchVo2)
        assertNull(f.vo2Estimate)
    }

    @Test fun `fewer than four workout days gives no training load`() {
        assertNull(fitness(base(3), TODAY, IST, goals).trainingLoad)
    }

    @Test fun `buildToday carries fitness`() {
        val t = buildToday(base(4), TODAY.atTime(9, 0).atZone(IST), goals = goals)
        assertNotNull(t.fitness.fitnessAge)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest --tests 'app.fitdash.metrics.FitnessDataTest'`
Expected: compile error, `fitness` unresolved.

- [ ] **Step 3: Implement the aggregator**

Append to `Fitness.kt` (add imports `app.fitdash.health.HealthSnapshot`, `java.time.LocalDate`, `java.time.ZoneId`):

```kotlin
enum class FitnessCard { FITNESS_AGE, VO2, SLEEP_DEBT, TRAINING_LOAD, CALORIES }

enum class MissingInput { GENDER, BIRTH_YEAR, HEIGHT, WEIGHT, RESTING_HR }

data class FitnessData(
    val fitnessAge: FitnessValue<FitnessAge>?,
    val fitnessAgeSeries: List<DayValue>,
    val vo2Estimate: FitnessValue<Double>?,
    val vo2Series: List<DayValue>,
    val watchVo2: Boolean,
    val calories: FitnessValue<Calories>?,
    val sleepDebt: FitnessValue<SleepDebt>,
    val trainingLoad: FitnessValue<TrainingLoad>?,
    val missing: Map<FitnessCard, MissingInput>,
)

private const val LOAD_DAYS = 28L

// Mean over the 28 days ending on `date`, of whatever `pick` returns per day; null when nothing was recorded.
private fun mean28(date: LocalDate, pick: (LocalDate) -> Double?): Double? =
    window(date, LOAD_DAYS).mapNotNull(pick).takeIf { it.isNotEmpty() }?.average()

fun fitness(snapshot: HealthSnapshot, date: LocalDate, zone: ZoneId, goals: Goals): FitnessData {
    val age = goals.age(date.year)
    val gender = goals.gender
    val bmi = snapshot.weightKg?.let { w -> snapshot.heightMeters?.let { h -> bmi(w, h) } }
    val rhrDaily = dailyLast(snapshot.restingHr, zone)
    val workoutMinutes = snapshot.workouts.groupBy { it.start.atZone(zone).toLocalDate() }.mapValues { (_, ws) -> ws.sumOf { it.duration.toMinutes() } }
    fun stepsMean(d: LocalDate, days: Long) = window(d, days).mapNotNull { stepsOn(snapshot, it, zone)?.toDouble() }.takeIf { it.isNotEmpty() }?.average() ?: 0.0
    fun weeklyMinutes(d: LocalDate) = window(d, LOAD_DAYS).sumOf { workoutMinutes[it] ?: 0L } / 4.0
    fun paOn(d: LocalDate) = paRating(weeklyMinutes(d), stepsMean(d, LOAD_DAYS))
    fun rhrOn(d: LocalDate) = mean28(d) { rhrDaily[it] }

    val missing = mutableMapOf<FitnessCard, MissingInput>()
    fun need(card: FitnessCard, vararg checks: Pair<Boolean, MissingInput>): Boolean {
        val first = checks.firstOrNull { it.first }?.second ?: return true
        missing[card] = first
        return false
    }

    val ageResult = if (need(FitnessCard.FITNESS_AGE, (age == null) to MissingInput.BIRTH_YEAR, (gender == null) to MissingInput.GENDER, (snapshot.heightMeters == null) to MissingInput.HEIGHT, (snapshot.weightKg == null) to MissingInput.WEIGHT))
        fitnessAge(age!!, gender!!, bmi!!, paOn(date)) else null
    val fitnessAgeSeries = if (ageResult != null) window(date, snapshot.windowDays).map { d ->
        DayValue(d, fitnessAge(age!!, gender!!, bmi!!, paOn(d)).value.years.toDouble())
    } else emptyList()

    val watchVo2 = snapshot.generic.any { it.label == "VO₂ max" && it.points.isNotEmpty() }
    val rhr = rhrOn(date)
    val vo2 = if (!watchVo2 && need(FitnessCard.VO2, (age == null) to MissingInput.BIRTH_YEAR, (rhr == null) to MissingInput.RESTING_HR))
        vo2Estimate(age!!, rhr!!) else null
    val vo2Series = if (vo2 != null) window(date, snapshot.windowDays).mapNotNull { d -> rhrOn(d)?.let { DayValue(d, vo2Estimate(age!!, it).value) } } else emptyList()

    val calResult = if (need(FitnessCard.CALORIES, (age == null) to MissingInput.BIRTH_YEAR, (gender == null) to MissingInput.GENDER, (snapshot.heightMeters == null) to MissingInput.HEIGHT, (snapshot.weightKg == null) to MissingInput.WEIGHT))
        calories(age!!, gender!!, snapshot.weightKg!!, snapshot.heightMeters!! * 100, stepsMean(date, Tuning.WEEK_DAYS)) else null

    val nights = window(date, Tuning.WEEK_DAYS).map { d -> nightEnding(d, snapshot.sleep, zone)?.let { asleepDuration(it).seconds / 3600.0 } }
    val debt = sleepDebt(nights, goals.sleepHours)

    val load = trainingLoad(window(date, LOAD_DAYS).map { workoutMinutes[it] ?: 0L })

    return FitnessData(ageResult, fitnessAgeSeries, vo2, vo2Series, watchVo2, calResult, debt, load, missing)
}
```

- [ ] **Step 4: Wire into TodayData**

In `Today.kt`, add to `TodayData` after `syncApp`:

```kotlin
    val fitness: FitnessData = FitnessData(null, emptyList(), null, emptyList(), false, null, FitnessValue(SleepDebt(0.0, emptyList()), Explanation("", emptyList(), SLEEP_DEBT_SOURCE)), null, emptyMap()),
```

In `buildToday`'s `TodayData(...)` call add:

```kotlin
        fitness = fitness(snap, date, zone, goals),
```

- [ ] **Step 5: Run all tests**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest`
Expected: BUILD SUCCESSFUL, FitnessDataTest 7 tests pass, nothing else regresses.

- [ ] **Step 6: Commit**

```bash
git add app/src/main/java/app/fitdash/metrics/Fitness.kt app/src/main/java/app/fitdash/metrics/Today.kt app/src/test/java/app/fitdash/metrics/FitnessDataTest.kt
git commit -m "FitnessData on TodayData"
```

---

### Task 7: Copy for the cards

**Files:**
- Modify: `app/src/main/java/app/fitdash/ui/Copy.kt`
- Test: `app/src/test/java/app/fitdash/ui/CopyTest.kt`

**Interfaces:**
- Produces:

```kotlin
fun fitnessAgeWord(delta: Int): String        // "3 years younger", "2 years older", "matches your age", "1 year younger"
fun loadWord(band: LoadBand): String          // "easing off", "steady", "ramping fast"
fun missingWord(m: MissingInput): String      // "Add gender in Settings" …
fun fitnessCardName(card: FitnessCard): String
fun formatHoursShort(h: Double): String       // "3.5 h"
const val NOT_MEDICAL = "General guide, not medical advice."
```

- [ ] **Step 1: Write the failing test**

Add to `CopyTest.kt`:

```kotlin
    @Test fun `fitness words`() {
        assertEquals("3 years younger", fitnessAgeWord(-3))
        assertEquals("1 year older", fitnessAgeWord(1))
        assertEquals("matches your age", fitnessAgeWord(0))
        assertEquals("ramping fast", loadWord(LoadBand.RAMPING))
        assertEquals("Add gender in Settings", missingWord(MissingInput.GENDER))
        assertEquals("Add height in Settings", missingWord(MissingInput.HEIGHT))
        assertEquals("Needs resting heart rate", missingWord(MissingInput.RESTING_HR))
        assertEquals("Fitness age", fitnessCardName(FitnessCard.FITNESS_AGE))
        assertEquals("3.5 h", formatHoursShort(3.5))
        assertEquals("0 h", formatHoursShort(0.0))
    }
```

Add imports `app.fitdash.metrics.LoadBand`, `app.fitdash.metrics.MissingInput`, `app.fitdash.metrics.FitnessCard`.

- [ ] **Step 2: Run test to verify it fails**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest --tests 'app.fitdash.ui.CopyTest'`
Expected: compile error, `fitnessAgeWord` unresolved.

- [ ] **Step 3: Implement**

Append to `Copy.kt` (imports `app.fitdash.metrics.FitnessCard`, `LoadBand`, `MissingInput`):

```kotlin
const val NOT_MEDICAL = "General guide, not medical advice."

fun fitnessAgeWord(delta: Int): String = when {
    delta == 0 -> "matches your age"
    delta < 0 -> "${-delta} ${if (delta == -1) "year" else "years"} younger"
    else -> "$delta ${if (delta == 1) "year" else "years"} older"
}

fun loadWord(band: LoadBand): String = when (band) {
    LoadBand.EASING -> "easing off"
    LoadBand.STEADY -> "steady"
    LoadBand.RAMPING -> "ramping fast"
}

fun missingWord(m: MissingInput): String = when (m) {
    MissingInput.GENDER -> "Add gender in Settings"
    MissingInput.BIRTH_YEAR -> "Add age in Settings"
    MissingInput.HEIGHT -> "Add height in Settings"
    MissingInput.WEIGHT -> "Needs a weight in Health Connect"
    MissingInput.RESTING_HR -> "Needs resting heart rate"
}

fun fitnessCardName(card: FitnessCard): String = when (card) {
    FitnessCard.FITNESS_AGE -> "Fitness age"
    FitnessCard.VO2 -> "VO₂ max est."
    FitnessCard.SLEEP_DEBT -> "Sleep debt"
    FitnessCard.TRAINING_LOAD -> "Training load"
    FitnessCard.CALORIES -> "Resting kcal"
}

fun formatHoursShort(h: Double): String = if (h == 0.0) "0 h" else String.format(Locale.ENGLISH, "%.1f h", h)
```

- [ ] **Step 4: Run tests**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest --tests 'app.fitdash.ui.CopyTest'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/app/fitdash/ui/Copy.kt app/src/test/java/app/fitdash/ui/CopyTest.kt
git commit -m "Copy for fitness cards"
```

---

### Task 8: Fitness info sheet

**Files:**
- Modify: `app/src/main/java/app/fitdash/ui/pages/MetricDetailSheet.kt:70-90` (`MetricRef`, `metricDescription`)
- Create: `app/src/main/java/app/fitdash/ui/pages/FitnessSheet.kt`
- Modify: `app/src/main/java/app/fitdash/ui/pages/PagerScreen.kt` where `MetricDetailSheet` is shown (search `MetricDetailSheet(`)

**Interfaces:**
- Consumes: `TodayData.fitness`, `Explanation`, copy from Task 7.
- Produces: `MetricRef.Fitness(card: FitnessCard)`; `@Composable fun FitnessSheet(card: FitnessCard, data: TodayData, onDismiss: () -> Unit)`.

- [ ] **Step 1: Add the ref**

In `MetricDetailSheet.kt`:

```kotlin
sealed interface MetricRef {
    data class Kind(val kind: MetricKind) : MetricRef
    data class Generic(val label: String, val unit: String) : MetricRef
    data class Fitness(val card: FitnessCard) : MetricRef
}
```

and

```kotlin
fun metricDescription(ref: MetricRef) = when (ref) {
    is MetricRef.Kind -> "${metricName(ref.kind)} details"
    is MetricRef.Generic -> "${ref.label} details"
    is MetricRef.Fitness -> "${fitnessCardName(ref.card)}: how it is worked out"
}
```

Inside `MetricDetailSheet`, the two `when (ref)` expressions over `series` and `name`/`unit` need a `Fitness` branch; add `is MetricRef.Fitness -> emptyList()` for series and `is MetricRef.Fitness -> fitnessCardName(ref.card)` for name and `""` for unit. The sheet itself is never opened with a Fitness ref (PagerScreen routes it), so these branches only satisfy the compiler.

- [ ] **Step 2: Create FitnessSheet.kt**

```kotlin
package app.fitdash.ui.pages

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp
import app.fitdash.metrics.Explanation
import app.fitdash.metrics.FitnessCard
import app.fitdash.metrics.TodayData
import app.fitdash.ui.NOT_MEDICAL
import app.fitdash.ui.components.ValueText
import app.fitdash.ui.fitnessAgeWord
import app.fitdash.ui.fitnessCardName
import app.fitdash.ui.formatHoursShort
import app.fitdash.ui.formatSteps
import app.fitdash.ui.loadWord
import app.fitdash.ui.theme.LocalReduceMotion
import app.fitdash.ui.theme.LocalTheme
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type
import java.util.Locale

private const val FORMULA_DELAY_MS = 120

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FitnessSheet(card: FitnessCard, data: TodayData, onDismiss: () -> Unit) {
    val f = data.fitness
    val (value, unit, word, explanation) = when (card) {
        FitnessCard.FITNESS_AGE -> f.fitnessAge?.let { Quad(it.value.years.toString(), "years", fitnessAgeWord(it.value.delta), it.explanation) }
        FitnessCard.VO2 -> f.vo2Estimate?.let { Quad(String.format(Locale.ENGLISH, "%.1f", it.value), "ml/kg/min", null, it.explanation) }
        FitnessCard.SLEEP_DEBT -> f.sleepDebt.let { Quad(formatHoursShort(it.value.hours).removeSuffix(" h"), "h", "over the last 7 nights", it.explanation) }
        FitnessCard.TRAINING_LOAD -> f.trainingLoad?.let { Quad(String.format(Locale.ENGLISH, "%.1f", it.value.ratio), null, loadWord(it.value.band), it.explanation) }
        FitnessCard.CALORIES -> f.calories?.let { Quad(formatSteps(it.value.resting.toLong()), "kcal at rest", "${formatSteps(it.value.daily.toLong())} kcal a day with your steps", it.explanation) }
    } ?: Quad("—", null, null, null)
    val reduce = LocalReduceMotion.current
    var showFormula by remember { mutableStateOf(reduce) }
    LaunchedEffect(Unit) { if (!reduce) { kotlinx.coroutines.delay(FORMULA_DELAY_MS.toLong()); showFormula = true } }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = LocalTheme.current.bgMid) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = Space.xl).padding(bottom = Space.xxl)) {
            Text(fitnessCardName(card).uppercase(), style = Type.label, color = Palette.Muted)
            ValueText(value, unit, Modifier.padding(top = Space.xs), style = Type.hero.copy(fontSize = 56.sp))
            if (word != null) Text(word, style = Type.body, color = Palette.Muted)
            AnimatedVisibility(visible = showFormula, enter = fadeIn(tween(220))) {
                Column {
                    if (explanation != null) ExplanationBlock(explanation)
                    HorizontalDivider(Modifier.padding(vertical = Space.l), color = Palette.Divider)
                    Text(NOT_MEDICAL, style = Type.tiny, color = Palette.Faint)
                    if (card == FitnessCard.FITNESS_AGE || card == FitnessCard.CALORIES) {
                        Text(
                            "The study behind this grouped people by sex at birth. Gender in Settings picks which equation is used; choose whichever matches your physiology.",
                            style = Type.tiny, color = Palette.Faint, modifier = Modifier.padding(top = Space.s),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ExplanationBlock(e: Explanation) {
    Text("HOW THIS IS WORKED OUT", style = Type.label, color = Palette.Muted, modifier = Modifier.padding(top = Space.xl, bottom = Space.s))
    Text(e.formula, style = Type.small, color = Palette.Text)
    Text("INPUTS USED", style = Type.label, color = Palette.Muted, modifier = Modifier.padding(top = Space.l, bottom = Space.s))
    e.inputs.forEach { (k, v) ->
        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(k, style = Type.small, color = Palette.Muted)
            Text(v, style = Type.small, color = Palette.Text)
        }
    }
    e.note?.let { Text(it, style = Type.secondary, color = Palette.Muted, modifier = Modifier.padding(top = Space.s)) }
    Text("SOURCE", style = Type.label, color = Palette.Muted, modifier = Modifier.padding(top = Space.l, bottom = Space.s))
    Text(e.source.title, style = Type.small, color = Palette.Text)
    Text(e.source.citation, style = Type.secondary, color = Palette.Muted)
}

private data class Quad(val value: String, val unit: String?, val word: String?, val explanation: Explanation?)
```

Add `import androidx.compose.ui.unit.dp`.

- [ ] **Step 3: Route the ref in PagerScreen**

Find the line that shows `MetricDetailSheet(` for `metric` and replace with:

```kotlin
        metric?.let { ref ->
            if (ref is MetricRef.Fitness) FitnessSheet(ref.card, data, onDismiss = { metric = null })
            else MetricDetailSheet(ref, data, settings.miles, onDismiss = { metric = null })
        }
```

(Keep whatever argument names the existing call uses; only the branch is new.)

- [ ] **Step 4: Compile**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:compilePlayDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/app/fitdash/ui/pages/MetricDetailSheet.kt app/src/main/java/app/fitdash/ui/pages/FitnessSheet.kt app/src/main/java/app/fitdash/ui/pages/PagerScreen.kt
git commit -m "Fitness info sheet with formula, inputs and source"
```

---

### Task 9: Fitness section on Trends

**Files:**
- Create: `app/src/main/java/app/fitdash/ui/pages/FitnessSection.kt`
- Modify: `app/src/main/java/app/fitdash/ui/pages/TrendsPage.kt:170-174` (insert before the Body section)

**Interfaces:**
- Consumes: `TodayData.fitness`, `metricOpener(MetricRef.Fitness(card))`, `chrome.onMenu`, `SectionCard`, `StatTile`, `TileGrid`, `SmoothArea`, `CountUpText`, `EmptyTrack`, `Tint`, `Palette.Good/Accent/Warn/Bad`, copy from Task 7.
- Produces: `fun LazyListScope.fitnessSection(data: TodayData, chrome: PageChrome)`.

- [ ] **Step 1: Create FitnessSection.kt**

```kotlin
package app.fitdash.ui.pages

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fitdash.metrics.FitnessCard
import app.fitdash.metrics.LoadBand
import app.fitdash.metrics.TodayData
import app.fitdash.ui.components.CountUpText
import app.fitdash.ui.components.EmptyTrack
import app.fitdash.ui.components.SectionCard
import app.fitdash.ui.components.SectionLabel
import app.fitdash.ui.components.SmoothArea
import app.fitdash.ui.components.StatTile
import app.fitdash.ui.components.TileGrid
import app.fitdash.ui.fitnessAgeWord
import app.fitdash.ui.fitnessCardName
import app.fitdash.ui.formatHoursShort
import app.fitdash.ui.formatSteps
import app.fitdash.ui.loadWord
import app.fitdash.ui.missingWord
import app.fitdash.ui.components.Chart
import app.fitdash.ui.theme.LocalReduceMotion
import app.fitdash.ui.theme.Motion
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Tint
import app.fitdash.ui.theme.Type
import java.util.Locale

// Band colours: good, middle, watch, poor, all from the theme so each look stays coherent.
@Composable
private fun bandColour(level: Int): Color = when (level) {
    0 -> Palette.Good
    1 -> Palette.Accent
    2 -> Palette.Warn
    else -> Palette.Bad
}

private fun ageLevel(delta: Int) = when {
    delta < -1 -> 0
    delta <= 1 -> 1
    delta < 10 -> 2
    else -> 3
}

private fun debtLevel(hours: Double) = when {
    hours < 2 -> 0
    hours <= 5 -> 2
    else -> 3
}

private fun loadLevel(band: LoadBand) = when (band) {
    LoadBand.STEADY -> 0
    LoadBand.EASING -> 1
    LoadBand.RAMPING -> 2
}

fun LazyListScope.fitnessSection(data: TodayData, chrome: PageChrome) {
    val f = data.fitness
    item(key = "fitness-label") { SectionLabel("FITNESS") }
    item(key = "fitness-age") { FitnessAgeCard(data, chrome) }
    item(key = "fitness-tiles") {
        val tiles = buildList<@Composable (Modifier) -> Unit> {
            if (!f.watchVo2) add { m -> Vo2Tile(data, chrome, m, Tint.SKY) }
            add { m -> SleepDebtTile(data, m, Tint.SAGE) }
            if (f.trainingLoad != null) add { m -> LoadTile(data, m, Tint.LAVENDER) }
            add { m -> CaloriesTile(data, chrome, m, Tint.PEACH) }
        }
        TileGrid(tiles)
    }
}

@Composable
private fun FitnessAgeCard(data: TodayData, chrome: PageChrome) {
    val f = data.fitness
    val age = f.fitnessAge
    val missing = f.missing[FitnessCard.FITNESS_AGE]
    val open = metricOpener(MetricRef.Fitness(FitnessCard.FITNESS_AGE))
    SectionCard(
        "FITNESS AGE",
        trailing = if (age != null) "tap for the formula" else null,
        onClick = if (age != null) open else chrome.onMenu,
        description = if (age != null) metricDescription(MetricRef.Fitness(FitnessCard.FITNESS_AGE)) else missing?.let(::missingWord),
    ) {
        if (age == null) {
            Text("—", style = Type.hero, color = Palette.Faint)
            Text(missing?.let(::missingWord) ?: "", style = Type.tiny, color = Palette.Muted)
            return@SectionCard
        }
        val colour = bandColour(ageLevel(age.value.delta))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                // Counts from the real age to the fitness age so the delta is visible as motion.
                AgeCountUp(age.value.realAge, age.value.years)
                Text(fitnessAgeWord(age.value.delta), style = Type.body.copy(fontWeight = FontWeight.Medium), color = colour)
                Text("VO₂max est. ${String.format(Locale.ENGLISH, "%.1f", age.value.vo2)} ml/kg/min", style = Type.tiny, color = Palette.Muted, modifier = Modifier.padding(top = Space.xs))
            }
            Box(Modifier.width(140.dp)) {
                val values = f.fitnessAgeSeries.map { it.value }
                if (values.count { it != null } >= 2) SmoothArea("fitness-age-series", values, height = 64.dp, color = colour)
                else EmptyTrack()
            }
        }
    }
}

@Composable
private fun AgeCountUp(from: Int, to: Int) {
    val reduce = LocalReduceMotion.current
    val value = remember { Animatable(if (reduce) to.toFloat() else from.toFloat()) }
    LaunchedEffect(to) { if (reduce) value.snapTo(to.toFloat()) else value.animateTo(to.toFloat(), tween(Motion.COUNT, easing = Motion.ease)) }
    Row(verticalAlignment = Alignment.Bottom) {
        Text(value.value.toInt().toString(), style = Type.hero, color = Palette.Text)
        Text("years", style = Type.secondary, color = Palette.Muted, modifier = Modifier.padding(start = Space.xs, bottom = 10.dp))
    }
}

@Composable
private fun Vo2Tile(data: TodayData, chrome: PageChrome, m: Modifier, tint: Tint) {
    val f = data.fitness
    val v = f.vo2Estimate
    val missing = f.missing[FitnessCard.VO2]
    if (v == null) {
        StatTile(fitnessCardName(FitnessCard.VO2), "—", null, missing?.let(::missingWord) ?: "", m, onClick = if (missing == app.fitdash.metrics.MissingInput.BIRTH_YEAR) chrome.onMenu else null, tint = tint) { EmptyTrack() }
        return
    }
    val open = metricOpener(MetricRef.Fitness(FitnessCard.VO2))
    StatTile(fitnessCardName(FitnessCard.VO2), String.format(Locale.ENGLISH, "%.1f", v.value), "ml/kg/min", "tap for the formula", m, onClick = open, description = metricDescription(MetricRef.Fitness(FitnessCard.VO2)), tint = tint) {
        val values = f.vo2Series.map { it.value }
        if (values.size >= 2) SmoothArea("vo2-series", values, height = 28.dp) else EmptyTrack()
    }
}

@Composable
private fun SleepDebtTile(data: TodayData, m: Modifier, tint: Tint) {
    val d = data.fitness.sleepDebt
    val open = metricOpener(MetricRef.Fitness(FitnessCard.SLEEP_DEBT))
    val colour = bandColour(debtLevel(d.value.hours))
    StatTile(fitnessCardName(FitnessCard.SLEEP_DEBT), formatHoursShort(d.value.hours).removeSuffix(" h"), "h", "last 7 nights · tap for the formula", m, onClick = open, description = metricDescription(MetricRef.Fitness(FitnessCard.SLEEP_DEBT)), tint = tint) {
        NightStrip(d.value.nights, data.goals.sleepHours, colour)
    }
}

// Seven blocks, one per night, filled by that night's shortfall; fills night by night unless Reduce motion is on.
@Composable
private fun NightStrip(nights: List<Double>, goal: Double, colour: Color) {
    val reduce = LocalReduceMotion.current
    Row(Modifier.fillMaxWidth().height(22.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        nights.forEachIndexed { i, short ->
            val fill = (short / goal).coerceIn(0.0, 1.0).toFloat()
            val progress = remember(i) { Animatable(if (reduce) 1f else 0f) }
            LaunchedEffect(i) { if (!reduce) { kotlinx.coroutines.delay(60L * i); progress.animateTo(1f, tween(Motion.RISE, easing = Motion.ease)) } }
            Box(Modifier.weight(1f).fillMaxWidth().height(22.dp).clip(RoundedCornerShape(4.dp)).background(Chart.track), contentAlignment = Alignment.BottomCenter) {
                Box(Modifier.fillMaxWidth().height((22 * fill * progress.value).dp).background(colour))
            }
        }
    }
}

@Composable
private fun LoadTile(data: TodayData, m: Modifier, tint: Tint) {
    val l = data.fitness.trainingLoad ?: return
    val open = metricOpener(MetricRef.Fitness(FitnessCard.TRAINING_LOAD))
    val colour = bandColour(loadLevel(l.value.band))
    StatTile(fitnessCardName(FitnessCard.TRAINING_LOAD), String.format(Locale.ENGLISH, "%.1f", l.value.ratio), null, "${loadWord(l.value.band)} · tap for the formula", m, onClick = open, description = metricDescription(MetricRef.Fitness(FitnessCard.TRAINING_LOAD)), tint = tint) {
        LoadBar(l.value.ratio, colour)
    }
}

// A track from 0 to 2.0 with the 0.8–1.3 zone marked; the marker slides into place over 400 ms.
@Composable
private fun LoadBar(ratio: Double, colour: Color) {
    val reduce = LocalReduceMotion.current
    val target = (ratio / 2.0).coerceIn(0.0, 1.0).toFloat()
    val pos = remember { Animatable(if (reduce) target else 0f) }
    LaunchedEffect(target) { if (reduce) pos.snapTo(target) else pos.animateTo(target, tween(400, easing = Motion.ease)) }
    BoxWithConstraints(Modifier.fillMaxWidth().height(14.dp)) {
        val w = maxWidth
        Box(Modifier.fillMaxWidth().height(6.dp).align(Alignment.Center).clip(RoundedCornerShape(3.dp)).background(Chart.track))
        Box(Modifier.offset(x = w * 0.4f).width(w * 0.25f).height(6.dp).align(Alignment.CenterStart).clip(RoundedCornerShape(3.dp)).background(Palette.Good.copy(alpha = 0.35f)))
        Box(Modifier.offset(x = (w - 10.dp) * pos.value).size(10.dp).align(Alignment.CenterStart).clip(CircleShape).background(colour))
    }
}

@Composable
private fun CaloriesTile(data: TodayData, chrome: PageChrome, m: Modifier, tint: Tint) {
    val f = data.fitness
    val c = f.calories
    val missing = f.missing[FitnessCard.CALORIES]
    if (c == null) {
        StatTile(fitnessCardName(FitnessCard.CALORIES), "—", null, missing?.let(::missingWord) ?: "", m, onClick = if (missing == app.fitdash.metrics.MissingInput.WEIGHT) null else chrome.onMenu, tint = tint) { EmptyTrack() }
        return
    }
    val open = metricOpener(MetricRef.Fitness(FitnessCard.CALORIES))
    StatTile(fitnessCardName(FitnessCard.CALORIES), "", "kcal", "${formatSteps(c.value.daily.toLong())} kcal a day with your steps", m, onClick = open, description = metricDescription(MetricRef.Fitness(FitnessCard.CALORIES)), tint = tint) {
        CountUpText("calories-${c.value.resting}", c.value.resting.toLong(), Type.tile, color = Palette.Text)
    }
}
```

Note: `StatTile` draws `value` through `ValueText`; for the calories tile the value is the count-up in the body, so `value` is `""`. If `ValueText("")` leaves a visible gap, pass the formatted resting number as `value` and drop the count-up; the plan prefers the count-up.

`Chart.track` is the existing track colour used by `EmptyTrack`; it lives in `app.fitdash.ui.components.Chart` (Charts.kt).

- [ ] **Step 2: Insert the section in TrendsPage**

In `TrendsPage.kt`, before `if (showBody) { item(key = "body-label") …`, add:

```kotlin
        if (showBody) fitnessSection(data, chrome)
```

- [ ] **Step 3: Compile**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:compilePlayDebugKotlin`
Expected: BUILD SUCCESSFUL. Fix any import path that differs from the file names cited here (`Chart`, `Motion`, `LocalReduceMotion`), using the imports already present in `Charts.kt`.

- [ ] **Step 4: Run all tests**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/app/fitdash/ui/pages/FitnessSection.kt app/src/main/java/app/fitdash/ui/pages/TrendsPage.kt
git commit -m "Fitness section on Trends"
```

---

### Task 10: Fitness block in the Ask AI summary

**Files:**
- Modify: `app/src/main/java/app/fitdash/ui/AiSummary.kt`
- Test: `app/src/test/java/app/fitdash/ui/AiSummaryTest.kt`

- [ ] **Step 1: Write the failing test**

Add to `AiSummaryTest.kt` (reuse its existing snapshot fixture; if it has none, build one as in `FitnessDataTest.base(4)` with `goals` carrying birth year and gender):

```kotlin
    @Test fun `summary carries a fitness block`() {
        val goals = Goals(birthYear = TODAY.year - 40, gender = Gender.MALE)
        val snap = history(TODAY, 28, rhr = 60.0, sleepHours = 7.0) + HealthSnapshot(heightMeters = 1.75, weightKg = 70.0,
            dailyActivity = (1..28).map { DayActivity(TODAY.minusDays(it.toLong()), 8000, 6000.0, 2000.0) })
        val data = buildToday(snap, TODAY.atTime(9, 0).atZone(IST), goals = goals)
        val text = aiSummary(snap, data, TODAY.atTime(9, 0).atZone(IST))
        assertTrue(text.contains("Fitness (published formulas):"))
        assertTrue(text.contains("fitness age ${data.fitness.fitnessAge!!.value.years}"))
        assertTrue(text.contains("sleep debt 7.0 h"))
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest --tests 'app.fitdash.ui.AiSummaryTest'`
Expected: FAIL, assertion on "Fitness (published formulas):".

- [ ] **Step 3: Implement**

In `aiSummary`, after the `data.heartDay?.let { … }` line and before `append("\n")`, add:

```kotlin
        val f = data.fitness
        val parts = listOfNotNull(
            f.fitnessAge?.let { "fitness age ${it.value.years} (Jackson 1990)" },
            f.vo2Estimate?.let { "VO2max est. ${String.format(Locale.ENGLISH, "%.1f", it.value)} ml/kg/min (Uth 2004)" },
            "sleep debt ${String.format(Locale.ENGLISH, "%.1f", f.sleepDebt.value.hours)} h",
            f.trainingLoad?.let { "training load ${String.format(Locale.ENGLISH, "%.1f", it.value.ratio)} (${loadWord(it.value.band)})" },
            f.calories?.let { "resting ${it.value.resting} kcal, daily ${it.value.daily} kcal (Mifflin-St Jeor)" },
        )
        append("Fitness (published formulas): " + parts.joinToString(", ") + ".\n")
```

- [ ] **Step 4: Run tests**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:testPlayDebugUnitTest`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/app/fitdash/ui/AiSummary.kt app/src/test/java/app/fitdash/ui/AiSummaryTest.kt
git commit -m "Fitness block in Ask AI summary"
```

---

### Task 11: Preview data, version bump and release notes

**Files:**
- Modify: `app/src/main/java/app/fitdash/ui/PreviewData.kt` (give the preview snapshot height, weight, 28 days of steps and four workouts so the section renders in previews)
- Modify: `app/build.gradle.kts:13-14` (`versionCode = 6`, `versionName = "0.6.0"`)
- Create: `fastlane/metadata/android/en-GB/changelogs/6.txt` (under 500 characters)
- Modify: `WIP.md` (replace the "Play submission" section with the current state: internal and closed tracks live, review sent 15 Oct, what version 6 adds)

- [ ] **Step 1: Preview data**

In `PreviewData.kt`, add to the preview `HealthSnapshot`: `heightMeters = 1.75, weightKg = 72.4`, and ensure `dailyActivity` covers 28 days and `workouts` has at least four entries a week apart. Build the preview `TodayData` with `Goals(birthYear = 1990, gender = Gender.MALE)`.

- [ ] **Step 2: Version and notes**

`app/build.gradle.kts`: `versionCode = 6`, `versionName = "0.6.0"`.

`fastlane/metadata/android/en-GB/changelogs/6.txt`:

```
New Fitness section on Trends: fitness age, VO2 max estimate, sleep debt, training load and resting calories, each from a published formula. Tap any card to see the formula, the inputs used and the source.
Gender setting (optional) for the formulas that need it.
No data screen now opens your watch app, and offers phone-only tracking apps if you have no wearable.
Wording no longer assumes a Fitbit.
Fixed the theme menu being unreadable on Soft in dark mode.
```

- [ ] **Step 3: Compile, test, and check the changelog length**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:compilePlayDebugKotlin :app:testPlayDebugUnitTest && wc -c fastlane/metadata/android/en-GB/changelogs/6.txt`
Expected: BUILD SUCCESSFUL; byte count under 500.

- [ ] **Step 4: Commit**

```bash
git add app/src/main/java/app/fitdash/ui/PreviewData.kt app/build.gradle.kts fastlane/metadata/android/en-GB/changelogs/6.txt WIP.md
git commit -m "v0.6.0: preview data, version code 6, release notes"
```

---

### Task 12: Device check (manual, before merging)

**Files:** none.

- [ ] **Step 1: Install the Play debug build on the Pixel**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew -q :app:installPlayDebug`

- [ ] **Step 2: Walk the checklist and note results in WIP.md**

- Settings: Gender row shows "Not set", dropdown lists Not set, Female, Male; readable on Soft in dark mode.
- Trends with no gender: Fitness age and Resting kcal tiles show the "Add gender" note and open Settings; VO2, Sleep debt and (if four workouts) Training load render.
- Set gender: fitness age counts from real age to fitness age; delta word in the band colour; curve draws.
- Sleep debt strip fills night by night; training load marker slides.
- Each card's sheet: value, formula, inputs, source, the not-medical line; fitness age and calories sheets carry the gender sentence.
- Reduce motion on: no count-up, no stagger, no slide, no formula fade.
- All three themes plus Soft in dark mode.
- Ask AI text contains the Fitness line.

- [ ] **Step 3: Commit the WIP note**

```bash
git add WIP.md
git commit -m "Device check notes for v0.6.0"
```
