package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.goals.DayValue
import com.apex.athlete.core.analytics.goals.GoalEngine
import com.apex.athlete.core.analytics.goals.GoalInput
import com.apex.athlete.core.analytics.goals.GoalKind
import com.apex.athlete.core.analytics.goals.GoalMissingReason
import com.apex.athlete.core.analytics.goals.GoalSpec
import com.apex.athlete.core.analytics.recovery.RecoveryEngine
import java.time.DayOfWeek
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Hand-computed expectations for the Pulse-parity goal engine (docs/FORMULAS.md, "Pulse parity engines", P1). */
class GoalEngineTest {

    private val steps = GoalSpec(GoalKind.DAILY_STEPS, 10_000.0)
    private fun v(day: Long, value: Double?) = DayValue(day, value)
    private fun daily(spec: GoalSpec, today: Long, vararg values: DayValue) = GoalEngine.evaluate(GoalInput(spec, values.toList(), today))
    private fun day(y: Int, m: Int, d: Int) = LocalDate.of(y, m, d).toEpochDay()

    @Test
    fun recoveredDayThresholdIsTheRecoveryEnginesGreenBand() {
        assertEquals(RecoveryEngine.Config().peakThreshold.toDouble(), GoalEngine.RECOVERED_DAY_MIN_SCORE)
        assertEquals(67.0, GoalEngine.RECOVERED_DAY_MIN_SCORE)
    }

    @Test
    fun partialTodayIsProvisionalAndNotCapped() {
        val r = daily(steps, 100, v(100, 7_500.0))
        assertEquals(0.75, r.fraction!!, 1e-12)
        assertFalse(r.achieved)
        assertTrue(r.provisional)
        assertNull(r.missingReason)
    }

    @Test
    fun fractionIsNotCappedAtOneAndExactTargetIsAchieved() {
        val over = daily(steps, 100, v(100, 12_000.0))
        assertEquals(1.2, over.fraction!!, 1e-12)
        assertTrue(over.achieved)
        assertFalse(over.provisional)
        assertTrue(daily(steps, 100, v(100, 10_000.0)).achieved)
        assertFalse(daily(steps, 100, v(100, 9_999.0)).achieved)
    }

    @Test
    fun noValueTodayIsNotRecordedNotZeroAndNotAchieved() {
        val missing = daily(steps, 100, v(99, 20_000.0))
        assertNull(missing.value)
        assertNull(missing.fraction)
        assertFalse(missing.achieved)
        assertEquals(GoalMissingReason.NOT_RECORDED_TODAY, missing.missingReason)
        val explicitNull = daily(steps, 100, v(100, null))
        assertEquals(GoalMissingReason.NOT_RECORDED_TODAY, explicitNull.missingReason)
        // A recorded zero is a value (fraction 0.0), not a missing day.
        val zero = daily(steps, 100, v(100, 0.0))
        assertEquals(0.0, zero.fraction!!, 0.0)
        assertNull(zero.missingReason)
    }

    @Test
    fun streakEndsYesterdayWhenTodayIsUnfinished() {
        // 90,91,92 achieved; 93 not recorded; 94 achieved; 95 below target; 96,97,98,99 achieved; today 100 partial.
        val r = daily(
            steps, 100,
            v(90, 11_000.0), v(91, 10_000.0), v(92, 15_000.0), v(94, 12_000.0), v(95, 9_000.0),
            v(96, 10_500.0), v(97, 10_500.0), v(98, 10_500.0), v(99, 10_500.0), v(100, 3_000.0),
        )
        assertEquals(4, r.currentStreak) // 96..99; today's partial value does not break it
        assertEquals(4, r.bestStreak)    // 96..99 (90..92 is 3)
    }

    @Test
    fun achievedTodayExtendsTheStreak() {
        val r = daily(steps, 100, v(98, 10_000.0), v(99, 10_000.0), v(100, 10_001.0))
        assertEquals(3, r.currentStreak)
        assertEquals(3, r.bestStreak)
    }

    @Test
    fun missingYesterdayBreaksTheStreakAndBestStreakIsKept() {
        // 95,96,97 achieved (best 3); 98 and 99 not recorded; today partial.
        val r = daily(steps, 100, v(95, 10_000.0), v(96, 10_000.0), v(97, 10_000.0), v(100, 10.0))
        assertEquals(0, r.currentStreak)
        assertEquals(3, r.bestStreak)
        // Yesterday recorded but short also gives 0.
        val short = daily(steps, 100, v(98, 10_000.0), v(99, 9_000.0))
        assertEquals(0, short.currentStreak)
        assertEquals(1, short.bestStreak)
    }

    @Test
    fun futureDaysAreIgnoredAndInvalidValuesAreMissing() {
        val r = daily(steps, 100, v(99, 10_000.0), v(101, 50_000.0), v(98, Double.NaN), v(100, -5.0))
        assertEquals(1, r.currentStreak) // 99 only; 98 NaN is missing; 101 is the future
        assertEquals(GoalMissingReason.NOT_RECORDED_TODAY, r.missingReason) // negative today = invalid = missing
    }

    @Test
    fun sleepGoalUsesMinutes() {
        val r = daily(GoalSpec(GoalKind.DAILY_SLEEP_MINUTES, 480.0), 10, v(10, 432.0))
        assertEquals(0.9, r.fraction!!, 1e-12)
        assertFalse(r.achieved)
    }

    @Test
    fun invalidTargetGivesNoNumbers() {
        for (t in listOf(0.0, -1.0, Double.NaN, Double.POSITIVE_INFINITY)) {
            val r = daily(GoalSpec(GoalKind.DAILY_STEPS, t), 100, v(100, 5_000.0))
            assertEquals(GoalMissingReason.INVALID_TARGET, r.missingReason)
            assertNull(r.fraction)
            assertNull(r.currentStreak)
            assertFalse(r.achieved)
        }
    }

    // Monday 2024-01-01; Thursday 2024-01-04 is "today".
    private val mon = day(2024, 1, 1)
    private val active = GoalSpec(GoalKind.WEEKLY_ACTIVE_MINUTES, 150.0)

    private fun weekly(spec: GoalSpec, today: Long, weekStart: DayOfWeek, vararg values: DayValue) =
        GoalEngine.evaluate(GoalInput(spec, values.toList(), today, weekStart))

    @Test
    fun weeklyProgressMondayStart() {
        val r = weekly(active, mon + 3, DayOfWeek.MONDAY, v(mon, 30.0), v(mon + 1, 40.0), v(mon + 2, null), v(mon + 3, 20.0), v(mon - 1, 999.0))
        val w = assertNotNull(r.week)
        assertEquals(90.0, r.value!!, 0.0)
        assertEquals(0.6, r.fraction!!, 1e-12)
        assertFalse(r.achieved)
        assertTrue(r.provisional)
        assertEquals(mon, w.weekStartEpochDay)
        assertEquals(mon + 6, w.weekEndEpochDay)
        assertEquals(3, w.recordedDays)
        assertEquals(4, w.elapsedDays)
        assertEquals(4, w.daysLeftInclToday)
        assertEquals(60.0, w.remaining!!, 0.0)
        assertEquals(15.0, w.neededPerRemainingDay!!, 1e-12)
        assertTrue(w.totalIsLowerBound) // Wednesday has no value
        assertNull(r.currentStreak) // streaks are for daily goals
        assertNull(r.bestStreak)
    }

    @Test
    fun weeklyProgressSundayStartChangesTheWindow() {
        // Week runs Sun 2023-12-31 .. Sat 2024-01-06: 5 days elapsed, 3 left including Thursday.
        val r = weekly(active, mon + 3, DayOfWeek.SUNDAY, v(mon, 30.0), v(mon + 1, 40.0), v(mon + 3, 20.0), v(mon - 1, 10.0))
        val w = assertNotNull(r.week)
        assertEquals(mon - 1, w.weekStartEpochDay)
        assertEquals(100.0, r.value!!, 0.0) // Sunday's 10 now counts
        assertEquals(5, w.elapsedDays)
        assertEquals(3, w.daysLeftInclToday)
        assertEquals(50.0, w.remaining!!, 0.0)
        assertEquals(50.0 / 3.0, w.neededPerRemainingDay!!, 1e-12)
    }

    @Test
    fun weeklyAchievedNeedsNothingMoreAndLastDayLeavesOneDay() {
        val r = weekly(active, mon + 6, DayOfWeek.MONDAY, v(mon, 100.0), v(mon + 6, 60.0))
        val w = assertNotNull(r.week)
        assertTrue(r.achieved)
        assertEquals(160.0 / 150.0, r.fraction!!, 1e-12) // 100 + 60 over 150: not capped
        assertEquals(1, w.daysLeftInclToday)
        assertEquals(0.0, w.remaining!!, 0.0)
        assertEquals(0.0, w.neededPerRemainingDay!!, 0.0)
    }

    @Test
    fun weeklyWithNoRecordedDayIsMissingNotZero() {
        val r = weekly(active, mon + 3, DayOfWeek.MONDAY, v(mon - 3, 100.0))
        assertNull(r.value)
        assertNull(r.fraction)
        assertFalse(r.achieved)
        assertEquals(GoalMissingReason.NO_DATA_THIS_WEEK, r.missingReason)
        // The week geometry is still known (it does not depend on data).
        assertEquals(4, assertNotNull(r.week).daysLeftInclToday)
        assertNull(r.week!!.neededPerRemainingDay)
        assertNull(r.week!!.remaining)
    }

    @Test
    fun azmGoalIsASumLikeActiveMinutes() {
        val r = weekly(GoalSpec(GoalKind.WEEKLY_AZM, 300.0), mon + 1, DayOfWeek.MONDAY, v(mon, 120.0), v(mon + 1, 45.0))
        assertEquals(165.0, r.value!!, 0.0)
        assertEquals(0.55, r.fraction!!, 1e-12)
        assertEquals(135.0 / 6.0, r.week!!.neededPerRemainingDay!!, 1e-12)
    }

    @Test
    fun recoveredDaysCountScoresAtOrAbove67() {
        // Mon 70 (yes), Tue 67 (yes, boundary), Wed 66 (no), Thu not recorded. Target 3 days.
        val r = weekly(
            GoalSpec(GoalKind.WEEKLY_RECOVERED_DAYS, 3.0), mon + 3, DayOfWeek.MONDAY,
            v(mon, 70.0), v(mon + 1, 67.0), v(mon + 2, 66.0), v(mon + 3, null),
        )
        val w = assertNotNull(r.week)
        assertEquals(2.0, r.value!!, 0.0)
        assertEquals(2.0 / 3.0, r.fraction!!, 1e-12)
        assertEquals(3, w.recordedDays)
        assertEquals(1.0, w.remaining!!, 0.0)
        assertEquals(0.25, w.neededPerRemainingDay!!, 1e-12) // 1 more recovered day over 4 days left incl. today
        assertTrue(w.totalIsLowerBound)
    }

    @Test
    fun recoveredDaysWithOnlyBelowThresholdScoresIsZeroNotMissing() {
        val r = weekly(GoalSpec(GoalKind.WEEKLY_RECOVERED_DAYS, 3.0), mon + 1, DayOfWeek.MONDAY, v(mon, 50.0), v(mon + 1, 10.0))
        assertEquals(0.0, r.value!!, 0.0) // two recorded days, none recovered
        assertNull(r.missingReason)
    }
}
