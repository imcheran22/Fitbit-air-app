package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.goals.DayValue
import com.apex.athlete.core.analytics.goals.GoalKind
import com.apex.athlete.core.analytics.goals.GoalSpec
import com.apex.athlete.core.analytics.journal.JournalEffect
import com.apex.athlete.core.analytics.journal.JournalOutcomeKind
import com.apex.athlete.core.analytics.load.WorkloadZone
import com.apex.athlete.core.analytics.report.ChangeMissingReason
import com.apex.athlete.core.analytics.report.GoalAchievementMissingReason
import com.apex.athlete.core.analytics.report.LoadAtEndMissingReason
import com.apex.athlete.core.analytics.report.ReportDay
import com.apex.athlete.core.analytics.report.ReportEngine
import com.apex.athlete.core.analytics.report.ReportGoalInput
import com.apex.athlete.core.analytics.report.ReportPeriodType
import com.apex.athlete.core.analytics.report.ReportRequest
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Hand-computed expectations for the period report (docs/FORMULAS.md, "Pulse parity engines", P3). */
class ReportEngineTest {

    private val s = 1_000L // week start (any day: the engine does not care which weekday)

    private fun day(
        d: Long, rec: Double? = null, sleep: Double? = null, strain: Double? = null,
        hrv: Double? = null, rhr: Double? = null, workouts: Int? = null,
        zone: WorkloadZone? = null, calibrating: Boolean = false,
    ) = ReportDay(d, rec, sleep, strain, hrv, rhr, workouts, zone, calibrating)

    private fun effect(name: String) = JournalEffect(
        name, JournalOutcomeKind.RECOVERY_POINTS, 10, 10, 60.0, 50.0, 10.0, 2.0, 18.0, 18.0, 0.02,
    )

    private val currentWeek = listOf(
        day(s, rec = 60.0, sleep = 80.0, strain = 10.0, hrv = 50.0, workouts = 1),
        day(s + 1, rec = 80.0, sleep = 70.0, strain = 12.0, hrv = 60.0, workouts = 0),
        day(s + 2, sleep = 90.0),
        day(s + 3, rec = 70.0, strain = 14.0, hrv = 70.0, workouts = 2),
        day(s + 4, rec = 50.0, sleep = 60.0, strain = 8.0, workouts = 1),
        day(s + 5, sleep = 85.0),
        day(s + 6, rec = 90.0, zone = WorkloadZone.SWEET_SPOT),
    )
    private val previousWeek = listOf(
        day(s - 7, rec = 50.0, strain = 9.0, sleep = 70.0),
        day(s - 6, rec = 60.0, strain = 9.0, sleep = 70.0),
        day(s - 5, rec = 70.0, strain = 9.0, sleep = 70.0),
        day(s - 4, rec = 60.0, strain = 9.0),
    )

    private fun week(
        days: List<ReportDay> = currentWeek + previousWeek,
        goals: List<ReportGoalInput> = emptyList(),
        effects: List<JournalEffect> = emptyList(),
        asOf: Long? = null,
    ) = ReportEngine.summarise(ReportRequest(ReportPeriodType.WEEK, s, days, goals, effects, asOf))

    @Test
    fun meansBestAndWorstDays() {
        val r = week()
        assertEquals(s + 6, r.endEpochDay)
        assertEquals(7, r.daysInPeriod)
        assertFalse(r.partial)
        assertEquals(5, r.recovery.recordedDays)
        assertEquals(70.0, r.recovery.mean!!, 1e-12)   // (60+80+70+50+90)/5
        assertEquals(s + 6, r.recovery.best!!.epochDay); assertEquals(90.0, r.recovery.best!!.value!!, 0.0)
        assertEquals(s + 4, r.recovery.worst!!.epochDay); assertEquals(50.0, r.recovery.worst!!.value!!, 0.0)
        assertEquals(77.0, r.sleep.mean!!, 1e-12)      // (80+70+90+60+85)/5
        assertEquals(s + 2, r.sleep.best!!.epochDay)
        assertEquals(s + 4, r.sleep.worst!!.epochDay)
        assertEquals(11.0, r.strain.mean!!, 1e-12)     // (10+12+14+8)/4
        assertEquals(60.0, r.hrv.mean!!, 1e-12)        // (50+60+70)/3
        assertNull(r.restingHr.mean)                   // nothing recorded: missing, not 0
        assertEquals(0, r.restingHr.recordedDays)
        assertEquals(ChangeMissingReason.INSUFFICIENT_BOTH, r.restingHr.changeMissingReason)
    }

    @Test
    fun changeAgainstPreviousPeriodNeedsFourRecordedDaysOnBothSides() {
        val r = week()
        assertEquals(60.0, r.recovery.previousMean!!, 1e-12) // (50+60+70+60)/4
        assertEquals(10.0, r.recovery.change!!, 1e-12)       // 70 - 60
        assertEquals(2.0, r.strain.change!!, 1e-12)          // 11 - 9
        // Sleep: previous week has 3 recorded days.
        assertNull(r.sleep.change)
        assertEquals(ChangeMissingReason.INSUFFICIENT_PREVIOUS, r.sleep.changeMissingReason)
        // HRV: current has 3 recorded days and the previous none.
        assertEquals(ChangeMissingReason.INSUFFICIENT_BOTH, r.hrv.changeMissingReason)
        // Current has only 3 and previous has enough.
        val thin = week(days = currentWeek.filter { it.epochDay <= s + 2 } + previousWeek)
        assertEquals(2, thin.recovery.recordedDays)
        assertEquals(ChangeMissingReason.INSUFFICIENT_CURRENT, thin.recovery.changeMissingReason)
        assertNull(thin.recovery.change)
    }

    @Test
    fun workoutsAndStrainOnWorkoutDays() {
        val r = week()
        assertEquals(4, r.totalWorkouts)                       // 1+0+2+1; null days are unknown
        assertEquals(3, r.workoutDaysWithStrain)               // days 0, 3, 4
        assertEquals(32.0 / 3.0, r.meanStrainOnWorkoutDays!!, 1e-12) // (10+14+8)/3; the zero-workout day is excluded
        val none = week(days = currentWeek.map { it.copy(workoutCount = null) })
        assertNull(none.totalWorkouts)
        assertNull(none.meanStrainOnWorkoutDays)
        val zero = week(days = listOf(day(s, rec = 1.0, workouts = 0)))
        assertEquals(0, zero.totalWorkouts) // a recorded zero is a value
        assertNull(zero.meanStrainOnWorkoutDays)
    }

    @Test
    fun loadStatusIsTakenOnTheLastDayOnly() {
        assertEquals(WorkloadZone.SWEET_SPOT, week().loadAtEnd.zone)
        val missing = week(days = currentWeek.map { it.copy(loadZone = null) })
        assertNull(missing.loadAtEnd.zone)
        assertEquals(LoadAtEndMissingReason.NOT_RECORDED, missing.loadAtEnd.reason)
        val cal = week(days = currentWeek.dropLast(1) + day(s + 6, rec = 90.0, calibrating = true))
        assertEquals(LoadAtEndMissingReason.CALIBRATING, cal.loadAtEnd.reason)
        // An earlier day's zone is not carried forward to the period end.
        val earlier = week(days = currentWeek.dropLast(1) + day(s + 5, zone = WorkloadZone.HIGH_RISK, sleep = 85.0) )
        assertNull(earlier.loadAtEnd.zone)
    }

    @Test
    fun coverageAndSparseFlag() {
        val full = week()
        assertEquals(7, full.coverageDays)
        assertEquals(1.0, full.coverage, 0.0)
        assertFalse(full.sparse)
        // 3 of 7 days: 0.428...
        val three = week(days = listOf(day(s, rec = 1.0), day(s + 3, sleep = 1.0), day(s + 5, strain = 1.0), day(s + 1, hrv = 5.0)))
        assertEquals(3, three.coverageDays)
        assertEquals(3.0 / 7.0, three.coverage, 1e-12)
        assertTrue(three.sparse) // HRV or RHR alone do not count towards coverage
        // 4 of 7 = 0.571
        val four = week(days = listOf(day(s, rec = 1.0), day(s + 1, rec = 1.0), day(s + 2, rec = 1.0), day(s + 3, rec = 1.0)))
        assertFalse(four.sparse)
    }

    @Test
    fun exactlyHalfCoverageIsNotSparse() {
        val june = LocalDate.of(2024, 6, 1).toEpochDay() // 30 days
        fun month(n: Int) = ReportEngine.summarise(
            ReportRequest(ReportPeriodType.MONTH, june, (0 until n).map { day(june + it, rec = 50.0) }),
        )
        assertEquals(30, month(15).daysInPeriod)
        assertEquals(0.5, month(15).coverage, 0.0)
        assertFalse(month(15).sparse)
        assertTrue(month(14).sparse)
    }

    @Test
    fun monthLengthFollowsTheCalendarAndPreviousPeriodHasEqualLength() {
        val feb = LocalDate.of(2024, 2, 1).toEpochDay() // leap year: 29 days
        // Previous period = the 29 days before 1 Feb, i.e. 3 Jan .. 31 Jan.
        val prev = (0 until 29).map { day(feb - 29 + it, rec = 40.0) }
        val cur = (0 until 29).map { day(feb + it, rec = 50.0) }
        val r = ReportEngine.summarise(ReportRequest(ReportPeriodType.MONTH, feb, prev + cur))
        assertEquals(29, r.daysInPeriod)
        assertEquals(feb + 28, r.endEpochDay)
        assertEquals(29, r.recovery.recordedDays)
        assertEquals(29, r.recovery.previousRecordedDays)
        assertEquals(10.0, r.recovery.change!!, 1e-12)
        // One day before the 29-day window is outside the previous period.
        val outside = ReportEngine.summarise(ReportRequest(ReportPeriodType.MONTH, feb, listOf(day(feb - 30, rec = 99.0)) + cur))
        assertEquals(0, outside.recovery.previousRecordedDays)
    }

    @Test
    fun daysOutsideThePeriodAndItsPredecessorAreIgnored() {
        val r = week(days = currentWeek + previousWeek + day(s + 7, rec = 100.0) + day(s - 100, rec = 0.0))
        assertEquals(70.0, r.recovery.mean!!, 1e-12)
        assertEquals(60.0, r.recovery.previousMean!!, 1e-12)
    }

    @Test
    fun inProgressPeriodIsMeasuredAgainstElapsedDays() {
        val r = week(days = currentWeek.take(3), asOf = s + 2)
        assertTrue(r.partial)
        assertEquals(3, r.daysInPeriod)
        assertEquals(1.0, r.coverage, 0.0)
        assertFalse(r.sparse)
        assertEquals(s + 6, r.endEpochDay) // nominal end stays
        // A day after asOf is ignored even if present.
        val ignore = week(days = currentWeek, asOf = s + 2)
        assertEquals(2, ignore.recovery.recordedDays)
    }

    @Test
    fun behaviourEffectsAreCarriedInOrderAndCappedAtThree() {
        val five = listOf("a", "b", "c", "d", "e").map(::effect)
        assertEquals(listOf("a", "b", "c"), week(effects = five).behaviourEffects.map { it.factor })
        assertEquals(listOf("a"), week(effects = five.take(1)).behaviourEffects.map { it.factor })
        assertTrue(week().behaviourEffects.isEmpty())
    }

    @Test
    fun dailyGoalAchievementCountsDaysAndLeavesUnrecordedOut() {
        val steps = GoalSpec(GoalKind.DAILY_STEPS, 10_000.0)
        val series = listOf(
            DayValue(s, 10_000.0), DayValue(s + 1, 9_999.0), DayValue(s + 3, 12_000.0), DayValue(s + 5, 20_000.0),
            DayValue(s - 1, 50_000.0), // previous period: not counted
        )
        val g = week(goals = listOf(ReportGoalInput(steps, series))).goals.single()
        assertEquals(3, g.achievedCount)
        assertEquals(7, g.outOf)
        assertEquals(4, g.recordedDays)
        assertNull(g.missingReason)
        val none = week(goals = listOf(ReportGoalInput(steps, emptyList()))).goals.single()
        assertNull(none.achievedCount)
        assertEquals(GoalAchievementMissingReason.NO_DATA_IN_PERIOD, none.missingReason)
    }

    @Test
    fun weeklyGoalsInAWeekReportAreOneOrZeroAndNotSummarisedForAMonth() {
        val active = GoalSpec(GoalKind.WEEKLY_ACTIVE_MINUTES, 150.0)
        val ok = week(goals = listOf(ReportGoalInput(active, listOf(DayValue(s, 100.0), DayValue(s + 4, 50.0), DayValue(s - 1, 500.0))))).goals.single()
        assertEquals(1, ok.achievedCount); assertEquals(1, ok.outOf)
        val short = week(goals = listOf(ReportGoalInput(active, listOf(DayValue(s, 100.0), DayValue(s + 4, 49.0))))).goals.single()
        assertEquals(0, short.achievedCount)
        val recovered = week(goals = listOf(ReportGoalInput(GoalSpec(GoalKind.WEEKLY_RECOVERED_DAYS, 2.0), listOf(DayValue(s, 67.0), DayValue(s + 1, 66.0), DayValue(s + 2, 90.0))))).goals.single()
        assertEquals(1, recovered.achievedCount) // 67 and 90 are recovered days: 2 >= 2
        val month = ReportEngine.summarise(
            ReportRequest(ReportPeriodType.MONTH, s, emptyList(), listOf(ReportGoalInput(active, listOf(DayValue(s, 500.0))))),
        ).goals.single()
        assertNull(month.achievedCount)
        assertEquals(GoalAchievementMissingReason.WEEKLY_GOAL_NOT_SUMMARISED_FOR_MONTH, month.missingReason)
        val nodata = week(goals = listOf(ReportGoalInput(active, emptyList()))).goals.single()
        assertEquals(GoalAchievementMissingReason.NO_DATA_IN_PERIOD, nodata.missingReason)
    }
}
