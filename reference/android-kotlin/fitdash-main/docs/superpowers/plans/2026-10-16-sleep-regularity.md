# Sleep Regularity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Regularity card on the Sleep page built on the Sleep Regularity Index, a Regularity row in the week review, and calm framing so a single night never shows red.

**Architecture:** Pure functions in `metrics/Regularity.kt` return a `FitnessValue<Regularity>` reusing the `Explanation` types from `Fitness.kt`. `buildToday` stores it on `TodayData.regularity`. The week review gains an optional regularity pair. UI: a card and chart on the Sleep page, a `calm` flag on `StatusText` and `NumberTile`, a `FitnessCard.REGULARITY` case in `FitnessSheet`, and a "Show sleep score" setting.

**Tech Stack:** Kotlin, Jetpack Compose, Material 3, JUnit 4. Build with `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`. Test command for every task: `./gradlew :app:testPlayDebugUnitTest` (not `-q`, the ledger script needs output).

**Spec:** `docs/superpowers/specs/2026-10-16-fitdash-sleep-regularity-design.md`

## Global Constraints

- SRI per Phillips et al. 2017: 200 × (share of minute pairs 24 h apart in the same state) − 100, clamped 0–100 for display. Null under 5 valid day pairs.
- A day without a main night is excluded from pairing, never treated as awake.
- Regularity never renders red. Any single-night sleep status of `ATTENTION` renders with the watch colour and the words "below your usual" when `calm = true`.
- `sleepWord` under 50 is "Short night".
- Setting key `showSleepScore`, default true.
- Every sheet ends with `NOT_MEDICAL`. British spelling. Reduce motion respected. No new dependencies. No AI attribution trailers in commits. Do not edit `.github/`.

## Review Focus

1. Sessions crossing midnight twice (a 14-hour recording) or overlapping naps: the asleep-minute set must not double count or throw. Test in Task 1.
2. Time zone with DST change inside the 14-day window: pairs are 24 h apart in instants, so a 23- or 25-hour civil day must not shift the pairing. Test in Task 1 with a zone that changes during the window.
3. Exactly 5 valid day pairs: the card computes; 4 shows calibrating with "4 of 5". Test in Task 1 and Task 2.
4. Show sleep score off with no sleep data: the gauge and Today glance must render the empty states, not crash on a null summary. Covered by compile plus device check; Task 5 notes it.
5. The week review with regularity this week but not last week: row shows the value with no delta. Test in Task 2.

---

### Task 0: Branch and commit the spec and research notes

- [ ] **Step 1: Branch and commit**

```bash
cd /Users/mayurrawte/thepsygeek/fitdash
git checkout -b sleep-regularity
git add docs/research/2026-10-16-behaviour-science-notes.md docs/superpowers/specs/2026-10-16-fitdash-sleep-regularity-design.md docs/superpowers/plans/2026-10-16-sleep-regularity.md
git commit -m "Behaviour science notes, sleep regularity spec and plan"
```

- [ ] **Step 2: Baseline tests**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew :app:testPlayDebugUnitTest`
Expected: BUILD SUCCESSFUL, 163 tests, 0 failures.

---

### Task 1: Regularity metric

**Files:**
- Create: `app/src/main/java/app/fitdash/metrics/Regularity.kt`
- Test: `app/src/test/java/app/fitdash/metrics/RegularityTest.kt`

**Interfaces:**
- Consumes: `SleepSession`, `nightEnding`, `Source`, `Explanation`, `FitnessValue`, `window`, `Tuning.MIN_NIGHT_HOURS`.
- Produces:

```kotlin
data class NightSpan(val date: LocalDate, val start: Instant?, val end: Instant?)
data class Regularity(val sri: Int, val nightsUsed: Int, val pairsUsed: Int, val bedtimeSpreadMin: Int?, val wakeSpreadMin: Int?, val nights: List<NightSpan>)
val PHILLIPS: Source
val WINDRED: Source
const val REGULARITY_NIGHTS = 14L
const val MIN_PAIRS = 5
fun regularityWordBand(sri: Int): Int          // 0 very regular (>=80), 1 regular (70..79), 2 varies (60..69), 3 irregular (<60)
fun regularity(sessions: List<SleepSession>, date: LocalDate, zone: ZoneId): FitnessValue<Regularity>?
fun regularityProgress(sessions: List<SleepSession>, date: LocalDate, zone: ZoneId): Int   // valid day pairs so far, for "N of 5"
fun clockSpreadMinutes(times: List<Instant>, zone: ZoneId): Int?   // SD of clock time measured from 18:00, null under 3
```

- [ ] **Step 1: Write the failing tests**

```kotlin
package app.fitdash.metrics

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.at
import app.fitdash.health.SleepSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class RegularityTest {
    private fun night(date: LocalDate, startHour: Int, endHour: Int, startMinute: Int = 0): SleepSession {
        val start = if (startHour >= 18) at(date.minusDays(1), startHour, startMinute) else at(date, startHour, startMinute)
        return SleepSession(start, at(date, endHour), emptyList())
    }

    private fun nights(days: Int, build: (Int, LocalDate) -> SleepSession) = (days - 1 downTo 0).map { i -> build(i, TODAY.minusDays(i.toLong())) }

    @Test fun `identical nights give 100`() {
        val r = regularity(nights(14) { _, d -> night(d, 23, 7) }, TODAY, IST)!!
        assertEquals(100, r.value.sri)
        assertEquals(14, r.value.nightsUsed)
        assertEquals(13, r.value.pairsUsed)
    }

    @Test fun `alternating nights give 33`() {
        // 22:00–06:00 one day, 02:00–10:00 the next: states differ for 8 of 24 hours, matches 16/24, SRI = 200*16/24-100 = 33
        val r = regularity(nights(14) { i, d -> if (i % 2 == 0) night(d, 22, 6) else night(d, 2, 10) }, TODAY, IST)!!
        assertEquals(33, r.value.sri)
    }

    @Test fun `under five valid pairs is null and progress counts pairs`() {
        val five = nights(5) { _, d -> night(d, 23, 7) }
        assertNull(regularity(five, TODAY, IST))
        assertEquals(4, regularityProgress(five, TODAY, IST))
        val six = nights(6) { _, d -> night(d, 23, 7) }
        assertEquals(100, regularity(six, TODAY, IST)!!.value.sri)
    }

    @Test fun `a missing night is excluded not counted as awake`() {
        val full = nights(14) { _, d -> night(d, 23, 7) }
        val gap = full.filterNot { it.end == at(TODAY.minusDays(6), 7) }
        val r = regularity(gap, TODAY, IST)!!
        assertEquals(100, r.value.sri)
        assertEquals(13, r.value.nightsUsed)
        assertEquals(11, r.value.pairsUsed)
    }

    @Test fun `naps count as asleep`() {
        val base = nights(14) { _, d -> night(d, 23, 7) }
        val nap = SleepSession(at(TODAY.minusDays(3), 14), at(TODAY.minusDays(3), 15), emptyList())
        val r = regularity(base + nap, TODAY, IST)!!
        // one hour mismatched on two pairs out of 13 × 24 h: 2/312 → 200 × (1 − 2/312) − 100 ≈ 98.7 → 99
        assertEquals(99, r.value.sri)
    }

    @Test fun `bedtime spread wraps midnight`() {
        val d = TODAY
        val times = listOf(at(d.minusDays(1), 23, 30), at(d, 0, 30), at(d.minusDays(1), 23, 0))
        // minutes from 18:00: 330, 390, 300 → mean 340, population SD = sqrt((100+2500+1600)/3) = 37.4 → 37
        assertEquals(37, clockSpreadMinutes(times, IST))
        assertNull(clockSpreadMinutes(times.take(2), IST))
    }

    @Test fun `a DST change inside the window does not shift pairing`() {
        val london: ZoneId = ZoneId.of("Europe/London")
        val end = LocalDate.of(2026, 11, 1) // clocks went back on 25 Oct 2026
        fun ln(date: LocalDate) = SleepSession(date.minusDays(1).atTime(23, 0).atZone(london).toInstant(), date.atTime(7, 0).atZone(london).toInstant(), emptyList())
        val sessions = (13 downTo 0).map { ln(end.minusDays(it.toLong())) }
        val r = regularity(sessions, end, london)!!
        // the night across the change is one hour longer, so one pair mismatches by an hour each side: still rounds above 98
        assert(r.value.sri >= 98) { "sri ${r.value.sri}" }
    }

    @Test fun `word bands`() {
        assertEquals(0, regularityWordBand(80))
        assertEquals(1, regularityWordBand(79))
        assertEquals(1, regularityWordBand(70))
        assertEquals(2, regularityWordBand(69))
        assertEquals(3, regularityWordBand(59))
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew :app:testPlayDebugUnitTest --tests 'app.fitdash.metrics.RegularityTest'`
Expected: compile error, `regularity` unresolved.

- [ ] **Step 3: Implement Regularity.kt**

```kotlin
package app.fitdash.metrics

import app.fitdash.health.SleepSession
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToInt
import kotlin.math.sqrt

data class NightSpan(val date: LocalDate, val start: Instant?, val end: Instant?)

data class Regularity(
    val sri: Int,
    val nightsUsed: Int,
    val pairsUsed: Int,
    val bedtimeSpreadMin: Int?,
    val wakeSpreadMin: Int?,
    val nights: List<NightSpan>,
)

val PHILLIPS = Source("Phillips et al. 2017", "Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing. Sci Rep 7:3216. Defines the Sleep Regularity Index.")
val WINDRED = Source("Windred et al. 2023", "Sleep regularity is a stronger predictor of mortality risk than sleep duration: a prospective cohort study. Sleep 47(1). UK Biobank, 60 977 adults.")

const val REGULARITY_NIGHTS = 14L
const val MIN_PAIRS = 5
private const val SPREAD_NIGHTS = 7
private const val DAY_MINUTES = 24 * 60

fun regularityWordBand(sri: Int): Int = when {
    sri >= 80 -> 0
    sri >= 70 -> 1
    sri >= 60 -> 2
    else -> 3
}

// Minutes since 18:00 of the previous evening, so bedtimes either side of midnight sit on one scale.
private fun minutesFromEvening(t: Instant, zone: ZoneId): Int {
    val z = t.atZone(zone)
    val m = z.hour * 60 + z.minute
    return if (m >= 18 * 60) m - 18 * 60 else m + 6 * 60
}

fun clockSpreadMinutes(times: List<Instant>, zone: ZoneId): Int? {
    if (times.size < 3) return null
    val xs = times.map { minutesFromEvening(it, zone).toDouble() }
    val mean = xs.average()
    return sqrt(xs.sumOf { (it - mean) * (it - mean) } / xs.size).roundToInt()
}

private data class Pairing(val nights: List<NightSpan>, val matches: Long, val pairs: Long)

private fun pair(sessions: List<SleepSession>, date: LocalDate, zone: ZoneId): Pairing {
    val dates = window(date, REGULARITY_NIGHTS)
    val mains = dates.associateWith { nightEnding(it, sessions, zone) }
    val nights = dates.map { d -> NightSpan(d, mains[d]?.start, mains[d]?.end) }
    val present = mains.filterValues { it != null }.keys
    if (present.size < 2) return Pairing(nights, 0, 0)
    val first = sessions.minOf { it.start }
    val last = sessions.maxOf { it.end }
    // Minute index from `first`; asleep when inside any session in the window.
    val total = Duration.between(first, last).toMinutes().toInt() + 1
    val asleep = BooleanArray(total)
    for (s in sessions) {
        val a = Duration.between(first, s.start).toMinutes().toInt().coerceAtLeast(0)
        val b = Duration.between(first, s.end).toMinutes().toInt().coerceAtMost(total - 1)
        for (i in a..b) asleep[i] = true
    }
    var matches = 0L
    var pairs = 0L
    for (d in dates) {
        val next = d.plusDays(1)
        if (d !in present || next !in present) continue
        // The civil day d: every minute from 00:00 on d to 00:00 on d+1, paired with the minute exactly 24 h later.
        val dayStart = d.atStartOfDay(zone).toInstant()
        val base = Duration.between(first, dayStart).toMinutes()
        for (m in 0 until DAY_MINUTES) {
            val i = base + m
            val j = i + DAY_MINUTES
            val si = i in 0 until total && asleep[i.toInt()]
            val sj = j in 0 until total && asleep[j.toInt()]
            pairs++
            if (si == sj) matches++
        }
    }
    return Pairing(nights, matches, pairs)
}

fun regularityProgress(sessions: List<SleepSession>, date: LocalDate, zone: ZoneId): Int =
    (pair(sessions, date, zone).pairs / DAY_MINUTES).toInt()

fun regularity(sessions: List<SleepSession>, date: LocalDate, zone: ZoneId): FitnessValue<Regularity>? {
    val p = pair(sessions, date, zone)
    val dayPairs = (p.pairs / DAY_MINUTES).toInt()
    if (dayPairs < MIN_PAIRS) return null
    val sri = (200.0 * p.matches / p.pairs - 100).roundToInt().coerceIn(0, 100)
    val recent = p.nights.takeLast(SPREAD_NIGHTS)
    val bed = clockSpreadMinutes(recent.mapNotNull { it.start }, zone)
    val wake = clockSpreadMinutes(recent.mapNotNull { it.end }, zone)
    val nightsUsed = p.nights.count { it.start != null }
    return FitnessValue(
        Regularity(sri, nightsUsed, dayPairs, bed, wake, p.nights),
        Explanation(
            formula = "SRI = 200 × (share of minute pairs 24 h apart in the same state, asleep or awake) − 100, over the last 14 nights",
            inputs = listOfNotNull(
                "Nights used" to "$nightsUsed of 14",
                "Day pairs used" to dayPairs.toString(),
                bed?.let { "Bedtime" to "± $it min over 7 nights" },
                wake?.let { "Wake time" to "± $it min over 7 nights" },
            ),
            source = PHILLIPS,
            note = "Bands are fitdash's choice: 80 and over very regular, 70–79 regular, 60–69 varies, under 60 irregular. Regularity predicted mortality more strongly than duration in ${WINDRED.title} (${WINDRED.citation}).",
        ),
    )
}
```

- [ ] **Step 4: Run tests**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew :app:testPlayDebugUnitTest --tests 'app.fitdash.metrics.RegularityTest'`
Expected: PASS, 8 tests. If the nap test or the alternating test is off by one because of inclusive minute ranges, fix the implementation (the end minute of a session should be exclusive: use `a until b`), not the test.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/app/fitdash/metrics/Regularity.kt app/src/test/java/app/fitdash/metrics/RegularityTest.kt
git commit -m "Sleep Regularity Index"
```

---

### Task 2: Wire regularity into TodayData, the week review, the fitness card enum and settings

**Files:**
- Modify: `app/src/main/java/app/fitdash/metrics/Today.kt` (field + call)
- Modify: `app/src/main/java/app/fitdash/metrics/Fitness.kt:…` (`FitnessCard` enum gains `REGULARITY`)
- Modify: `app/src/main/java/app/fitdash/metrics/WeekReview.kt`
- Modify: `app/src/main/java/app/fitdash/settings/Settings.kt`
- Modify: `app/src/main/java/app/fitdash/ui/Copy.kt` (`fitnessCardName` gains the case)
- Test: `app/src/test/java/app/fitdash/metrics/WeekReviewTest.kt`, `app/src/test/java/app/fitdash/metrics/TodayTest.kt`

**Interfaces:**
- Produces: `TodayData.regularity: FitnessValue<Regularity>?`, `TodayData.regularityProgress: Int`; `WeekReview.regularity: Pair<Int, Int?>?` (this week's SRI, last week's); `fun weekReview(series, end, regularityThisWeek: Int? = null, regularityLastWeek: Int? = null)`; `Settings.showSleepScore`.

- [ ] **Step 1: Failing tests**

Add to `WeekReviewTest.kt`:

```kotlin
    @Test fun `regularity row carries this week and last week`() {
        val r = weekReview(mapOf(MetricKind.STEPS to twoWeeks(8000.0, 9000.0)), end, regularityThisWeek = 82, regularityLastWeek = 75)!!
        assertEquals(82 to 75, r.regularity)
        val only = weekReview(mapOf(MetricKind.STEPS to twoWeeks(8000.0, 9000.0)), end, regularityThisWeek = 82)!!
        assertEquals(82 to null, only.regularity)
    }
```

Add to `TodayTest.kt`:

```kotlin
    @Test fun `regularity is computed from the snapshot's sleep`() {
        val t = buildToday(history(TODAY, 14, sleepHours = 8.0) + day(TODAY, sleepHours = 8.0), time(8, 10))
        assertEquals(100, t.regularity!!.value.sri)
        assertNull(buildToday(history(TODAY, 3, sleepHours = 8.0), time(8, 10)).regularity)
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew :app:testPlayDebugUnitTest --tests 'app.fitdash.metrics.WeekReviewTest' --tests 'app.fitdash.metrics.TodayTest'`
Expected: compile errors on `regularityThisWeek` and `t.regularity`.

- [ ] **Step 3: Implement**

`WeekReview.kt`:

```kotlin
data class WeekReview(val end: LocalDate, val rows: List<WeekRow>, val headline: String?, val regularity: Pair<Int, Int?>? = null)

fun weekReview(series: Map<MetricKind, List<DayValue>>, end: LocalDate, regularityThisWeek: Int? = null, regularityLastWeek: Int? = null): WeekReview? {
    val start = end.minusDays(6)
    val rows = REVIEW_KINDS.mapNotNull { kind ->
        val values = series[kind] ?: return@mapNotNull null
        val now = mean(values, start, end) ?: return@mapNotNull null
        WeekRow(kind, now, mean(values, start.minusDays(7), start.minusDays(1)))
    }
    if (rows.isEmpty() && regularityThisWeek == null) return null
    return WeekReview(end, rows, headline(rows), regularityThisWeek?.let { it to regularityLastWeek })
}
```

`Today.kt`: add to `TodayData` after `fitness`:

```kotlin
    val regularity: FitnessValue<Regularity>? = null,
    val regularityProgress: Int = 0,
```

and in `buildToday`'s constructor call:

```kotlin
        regularity = regularity(snap.sleep, date, zone),
        regularityProgress = regularityProgress(snap.sleep, date, zone),
```

`Fitness.kt`: `enum class FitnessCard { FITNESS_AGE, VO2, SLEEP_DEBT, TRAINING_LOAD, CALORIES, REGULARITY }`.

`Copy.kt` `fitnessCardName`: add `FitnessCard.REGULARITY -> "Sleep regularity"`.

`Settings.kt`: add `val showSleepScore: Boolean = true,` after `showBody`; read `showSleepScore = prefs.getBoolean("showSleepScore", true),`; write `.putBoolean("showSleepScore", s.showSleepScore)` after `showBody`.

The Trends page calls `weekReview(data.series, …)`; it will pass regularity in Task 5. The call compiles unchanged now because the new parameters default to null.

- [ ] **Step 4: Run the full suite**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew :app:testPlayDebugUnitTest`
Expected: BUILD SUCCESSFUL, 173 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/app/fitdash/metrics/Today.kt app/src/main/java/app/fitdash/metrics/Fitness.kt app/src/main/java/app/fitdash/metrics/WeekReview.kt app/src/main/java/app/fitdash/settings/Settings.kt app/src/main/java/app/fitdash/ui/Copy.kt app/src/test/java/app/fitdash/metrics/WeekReviewTest.kt app/src/test/java/app/fitdash/metrics/TodayTest.kt
git commit -m "Regularity on TodayData, week review row, show sleep score setting"
```

---

### Task 3: Copy and calm status

**Files:**
- Modify: `app/src/main/java/app/fitdash/ui/Copy.kt`
- Modify: `app/src/main/java/app/fitdash/ui/components/Blocks.kt:198-213` (`statusWord`, `StatusText`)
- Modify: `app/src/main/java/app/fitdash/ui/components/StatTile.kt:68-95` (`NumberTile` gains `calm`)
- Test: `app/src/test/java/app/fitdash/ui/CopyTest.kt`

**Interfaces:**
- Produces: `fun regularityWord(sri: Int): String`, `fun calmStatusWord(status: Status): String`, `sleepWord` change; `StatusText(status, modifier, calm: Boolean = false)`; `NumberTile(…, calm: Boolean = false)`.

- [ ] **Step 1: Failing test**

Add to `CopyTest.kt`:

```kotlin
    @Test fun `regularity and calm words`() {
        assertEquals("very regular", regularityWord(85))
        assertEquals("regular", regularityWord(72))
        assertEquals("varies", regularityWord(65))
        assertEquals("irregular", regularityWord(40))
        assertEquals("Short night", sleepWord(40))
        assertEquals("Good", sleepWord(70))
        assertEquals("below your usual", calmStatusWord(Status.ATTENTION))
        assertEquals("Fair", calmStatusWord(Status.FAIR))
    }
```

Add `import app.fitdash.metrics.Status`.

- [ ] **Step 2: Run to verify failure**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew :app:testPlayDebugUnitTest --tests 'app.fitdash.ui.CopyTest'`
Expected: compile error, `regularityWord` unresolved.

- [ ] **Step 3: Implement**

`Copy.kt`: change `score >= 50 -> "Fair"; else -> "Poor"` in `sleepWord` to `else -> "Short night"`, and append:

```kotlin
fun regularityWord(sri: Int): String = when (regularityWordBand(sri)) {
    0 -> "very regular"
    1 -> "regular"
    2 -> "varies"
    else -> "irregular"
}

// Single-night sleep values never alarm: the lowest band reads as a comparison, not a verdict.
fun calmStatusWord(status: Status): String = when (status) {
    Status.OPTIMAL -> "Optimal"
    Status.GOOD -> "Good"
    Status.FAIR -> "Fair"
    Status.ATTENTION -> "below your usual"
}
```

(imports `app.fitdash.metrics.Status`, `app.fitdash.metrics.regularityWordBand`).

`Blocks.kt` `StatusText`:

```kotlin
@Composable
fun StatusText(status: Status, modifier: Modifier = Modifier, calm: Boolean = false) {
    val colour = when (status) {
        Status.OPTIMAL, Status.GOOD -> Palette.Good
        Status.FAIR -> Palette.Warn
        Status.ATTENTION -> if (calm) Palette.Warn else Palette.Bad
    }
    val word = if (calm) calmStatusWord(status) else statusWord(status)
    Text(noteCase(word, upper = false), modifier, style = Type.status, color = colour)
}
```

`StatTile.kt` `NumberTile`: add parameter `calm: Boolean = false` after `tint`, and change `if (status != null) StatusText(status)` to `if (status != null) StatusText(status, calm = calm)`.

- [ ] **Step 4: Run tests and compile**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew :app:compilePlayDebugKotlin :app:testPlayDebugUnitTest`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/app/fitdash/ui/Copy.kt app/src/main/java/app/fitdash/ui/components/Blocks.kt app/src/main/java/app/fitdash/ui/components/StatTile.kt app/src/test/java/app/fitdash/ui/CopyTest.kt
git commit -m "Regularity words and calm single-night status"
```

---

### Task 4: Regularity sheet

**Files:**
- Modify: `app/src/main/java/app/fitdash/ui/pages/FitnessSheet.kt`

- [ ] **Step 1: Add the case**

In `FitnessSheet`, extend the `when (card)`:

```kotlin
        FitnessCard.REGULARITY -> data.regularity?.let { Shown(it.value.sri.toString(), null, regularityWord(it.value.sri), it.explanation) }
```

and add `import app.fitdash.ui.regularityWord`. The gender sentence condition stays as is (not shown for regularity).

- [ ] **Step 2: Compile**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew :app:compilePlayDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/app/fitdash/ui/pages/FitnessSheet.kt
git commit -m "Regularity info sheet"
```

---

### Task 5: Sleep page card and chart, calm tiles, one-night line, show-score toggle

**Files:**
- Create: `app/src/main/java/app/fitdash/ui/pages/RegularityCard.kt`
- Modify: `app/src/main/java/app/fitdash/ui/pages/SleepPage.kt` (gauge block, tiles, insert card)
- Modify: `app/src/main/java/app/fitdash/ui/pages/TodayPage.kt:418-426` (sleep glance tile)
- Modify: `app/src/main/java/app/fitdash/ui/pages/TrendsPage.kt` (pass regularity to `weekReview`)
- Modify: `app/src/main/java/app/fitdash/ui/components/WeekReviewCard.kt` (regularity row)
- Modify: `app/src/main/java/app/fitdash/ui/pages/SettingsSheet.kt:163` (toggle)
- Modify: `app/src/main/java/app/fitdash/ui/pages/MetricDetailSheet.kt` (calm on sleep kinds)

- [ ] **Step 1: RegularityCard.kt**

```kotlin
package app.fitdash.ui.pages

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import app.fitdash.metrics.MIN_PAIRS
import app.fitdash.metrics.NightSpan
import app.fitdash.metrics.TodayData
import app.fitdash.metrics.regularityWordBand
import app.fitdash.ui.components.Chart
import app.fitdash.ui.components.CountUpText
import app.fitdash.ui.components.SectionCard
import app.fitdash.ui.regularityWord
import app.fitdash.ui.theme.LocalReduceMotion
import app.fitdash.ui.theme.Motion
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type
import java.time.ZoneId
import kotlinx.coroutines.delay

// Three colours only; regularity never shows red.
@Composable
private fun bandColour(band: Int): Color = when (band) {
    0 -> Palette.Good
    1 -> Palette.Accent
    else -> Palette.Warn
}

private const val AXIS_START_MIN = 20 * 60        // 20:00 the evening before
private const val AXIS_SPAN_MIN = 16 * 60         // to 12:00

@Composable
fun RegularityCard(data: TodayData, zone: ZoneId) {
    val r = data.regularity
    if (r == null) {
        SectionCard("REGULARITY", trailing = "last 14 nights") {
            Text("Calibrating · ${data.regularityProgress} of $MIN_PAIRS nights", style = Type.body, color = Palette.Muted)
            Text("Regularity needs five nights in a row. It compares when you are asleep with the same time the day before.", style = Type.tiny, color = Palette.Faint, modifier = Modifier.padding(top = Space.xs))
        }
        return
    }
    val v = r.value
    val colour = bandColour(regularityWordBand(v.sri))
    val open = metricOpener(MetricRef.Fitness(FitnessCard.REGULARITY))
    SectionCard("REGULARITY", trailing = "last 14 nights · tap for the formula", onClick = open, description = metricDescription(MetricRef.Fitness(FitnessCard.REGULARITY))) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.width(120.dp)) {
                CountUpText("regularity-${data.date}", v.sri.toLong(), Type.hero, color = Palette.Text)
                Text(regularityWord(v.sri), style = Type.body.copy(fontWeight = FontWeight.Medium), color = colour)
                val spread = listOfNotNull(v.bedtimeSpreadMin?.let { "bed ± $it min" }, v.wakeSpreadMin?.let { "wake ± $it min" }).joinToString(" · ")
                if (spread.isNotEmpty()) Text(spread, style = Type.tiny, color = Palette.Muted, modifier = Modifier.padding(top = Space.xs))
            }
            Spacer(Modifier.width(Space.m))
            NightBars(v.nights, zone, colour, Modifier.weight(1f))
        }
    }
}

// One row per night on a shared 20:00–12:00 axis; rows draw in top to bottom.
@Composable
private fun NightBars(nights: List<NightSpan>, zone: ZoneId, colour: Color, modifier: Modifier) {
    val reduce = LocalReduceMotion.current
    Column(modifier) {
        nights.forEachIndexed { i, n ->
            val progress = remember(i) { Animatable(if (reduce) 1f else 0f) }
            LaunchedEffect(i) { if (!reduce) { delay(40L * i); progress.animateTo(1f, tween(Motion.RISE, easing = Motion.ease)) } }
            BoxWithConstraints(Modifier.fillMaxWidth().height(5.dp).padding(vertical = 0.5.dp)) {
                val w = maxWidth
                Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(Chart.track))
                if (n.start != null && n.end != null) {
                    val s = axisFraction(n.start.atZone(zone).let { it.hour * 60 + it.minute })
                    val e = axisFraction(n.end.atZone(zone).let { it.hour * 60 + it.minute })
                    if (e > s) Box(Modifier.offset(x = w * s).width(w * (e - s) * progress.value).height(4.dp).clip(RoundedCornerShape(2.dp)).background(colour))
                }
            }
        }
    }
}

private fun axisFraction(minuteOfDay: Int): Float {
    val sinceStart = ((minuteOfDay - AXIS_START_MIN) % (24 * 60) + 24 * 60) % (24 * 60)
    return (sinceStart.toFloat() / AXIS_SPAN_MIN).coerceIn(0f, 1f)
}
```

- [ ] **Step 2: SleepPage changes**

In `SleepPage.kt`:

a. Read the setting: after `val zone = ZoneId.systemDefault()` add `val showScore = LocalPrefs.current.showSleepScore`.

b. Gauge block: replace the `SemiGauge(...)` call with:

```kotlin
                    if (showScore) {
                        SemiGauge(s.score, "Sleep", scoreStatus(s.score), from = Palette.Deep, to = colour, tag = sleepWord(s.score))
                    } else {
                        val mins = s.asleep.toMinutes()
                        SemiGauge(
                            ((mins / (data.goals.sleepHours * 60)) * 100).roundToInt().coerceIn(0, 100), "Sleep", Status.GOOD,
                            key = "gauge-hours-${data.date}", value = formatDuration(s.asleep), from = Palette.Deep, to = colour,
                            tag = data.regularity?.let { regularityWord(it.value.sri) } ?: "calibrating",
                        )
                    }
```

and after the existing "asleep · efficient" `Text`, add the one-night line:

```kotlin
                    if (s.asleep.toMinutes() < (data.goals.sleepHours * 60).roundToInt()) {
                        val avg = data.sleepWeek.mapNotNull { it.hours }.takeIf { it.size >= 3 }?.average()
                        Text(
                            "One night on its own says little." + (avg?.let { " Your 7-night average is ${formatDuration(Duration.ofMinutes((it * 60).roundToLong()))}." } ?: ""),
                            Modifier.padding(top = Space.s, start = Space.xl, end = Space.xl), style = Type.body, color = Palette.Muted, textAlign = TextAlign.Center,
                        )
                    }
```

c. Insert the card: after `item(key = "span") { … }` add `item(key = "regularity") { RegularityCard(data, zone) }`.

d. Calm tiles: every `NumberTile(...)` in the `sleep-tiles` list gets `calm = true` as a final argument.

Imports to add: `app.fitdash.ui.regularityWord`, `androidx.compose.ui.text.style.TextAlign`, `kotlin.math.roundToLong`.

- [ ] **Step 3: Today glance tile**

In `TodayPage.kt` the sleep `GlanceTile`: read `val showScore = LocalPrefs.current.showSleepScore` inside the lambda, then:

```kotlin
            GlanceTile(
                "Sleep", if (showScore) s?.score?.toString() ?: "—" else s?.let { formatDuration(it.asleep) } ?: "—", null, m, icon = NavIcons.moonSmall,
                ring = s?.let { if (showScore) it.score / 100f else (it.asleep.toMinutes() / (data.goals.sleepHours * 60)).toFloat().coerceAtMost(1f) },
                ringColor = s?.score?.let { scoreColor(it) } ?: Palette.Faint,
                note = if (showScore) s?.let { formatDuration(it.asleep) } ?: "no night yet" else data.regularity?.let { regularityWord(it.value.sri) } ?: (s?.let { "no score shown" } ?: "no night yet"),
                delta = if (showScore) sleepDelta else null,
                ringKey = "glance-sleep-${data.date}", onClick = { onOpen(1) }, description = "Sleep page", tint = Tint.SKY,
            )
```

- [ ] **Step 4: Week review**

`TrendsPage.kt`: change `weekReview(data.series, if (data.isToday) data.date.minusDays(1) else data.date)` to:

```kotlin
        val reviewEnd = if (data.isToday) data.date.minusDays(1) else data.date
        weekReview(data.series, reviewEnd, regularityThisWeek = data.regularity?.value?.sri, regularityLastWeek = data.regularityLastWeek)
```

`Today.kt`: add `val regularityLastWeek: Int? = null` to `TodayData` and compute `regularityLastWeek = regularity(snap.sleep, date.minusDays(7), zone)?.value?.sri` in `buildToday`. Also hide the sleep score row from the review when the setting is off: no change needed, the review has no sleep-score row (it uses SLEEP_HOURS).

`WeekReviewCard.kt`: after the `review.rows.forEach { … }` block add:

```kotlin
        review.regularity?.let { (now, last) ->
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Sleep regularity", Modifier.weight(1f), style = Type.small, color = Palette.Muted)
                Text(now.toString(), style = Type.small, color = Palette.Text)
                val d = last?.let { now - it }?.takeIf { it != 0 }
                if (d != null) {
                    DeltaArrow(d > 0, Modifier.padding(start = Space.s, end = 4.dp))
                    Text("${if (d > 0) "+" else "−"}${abs(d)}", style = Type.secondary, color = Palette.Muted)
                }
            }
        }
```

- [ ] **Step 5: Settings toggle and detail sheet**

`SettingsSheet.kt` after the `Label("SHOW ON TODAY")` item, add as the first toggle:

```kotlin
            item { ToggleRow("Show sleep score", settings.showSleepScore, { v -> store.update { it.copy(showSleepScore = v) } }, "Off shows hours and regularity instead of a score") }
```

`MetricDetailSheet.kt`: where `if (status != null) StatusText(status, Modifier.padding(horizontal = Space.xl))` is called, pass `calm = kind in setOf(MetricKind.SLEEP_SCORE, MetricKind.SLEEP_HOURS, MetricKind.EFFICIENCY, MetricKind.AWAKENINGS)`.

- [ ] **Step 6: Compile and run the suite**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew :app:compilePlayDebugKotlin :app:testPlayDebugUnitTest`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git add app/src/main/java/app/fitdash
git commit -m "Regularity card on Sleep, calm sleep tiles, show sleep score toggle"
```

---

### Task 6: Version, release notes, WIP

**Files:**
- Modify: `app/build.gradle.kts` (`versionCode = 7`, `versionName = "0.7.0"`)
- Create: `fastlane/metadata/android/en-GB/changelogs/7.txt`
- Modify: `WIP.md` (Play section: v0.7.0 line; note v0.6.0 bundle waits for upload)

- [ ] **Step 1: Edit**

`changelogs/7.txt`:

```
Sleep regularity: a new card on the Sleep page scores how consistent your sleep and wake times are over 14 nights, with the formula and research one tap away. Regularity predicts health outcomes more strongly than hours alone.
Calmer sleep: a single short night never shows red, reads "below your usual", and the page reminds you that one night says little.
Show sleep score toggle: turn it off to see hours and regularity instead.
```

- [ ] **Step 2: Verify and commit**

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew :app:compilePlayDebugKotlin :app:testPlayDebugUnitTest && wc -c fastlane/metadata/android/en-GB/changelogs/7.txt`
Expected: BUILD SUCCESSFUL; under 500 bytes.

```bash
git add app/build.gradle.kts fastlane/metadata/android/en-GB/changelogs/7.txt WIP.md
git commit -m "v0.7.0: version code 7, release notes"
```

---

### Task 7: Device check (manual, before merging)

- Sleep page in Soft, Teal, Graphite and Soft dark: card, bars, calibrating state with under 5 nights.
- A short night: the one-night line shows; tiles read "below your usual" in amber, never red.
- Show sleep score off: Sleep gauge shows hours with the regularity word; Today sleep tile shows hours; no crash with no sleep data.
- Reduce motion on: no count-up, no bar stagger.
- Regularity row in the week review on Trends.
- Tap the card: sheet shows value, formula, nights used, pairs, spreads, both sources, not-medical line.
