package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue
import kotlin.math.ln
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ActivityMetricsTest {

    private val eps = 1e-9

    private fun daily(vararg v: Double, start: Long = 1) = v.mapIndexed { i, x -> DailyValue(start + i, x) }

    // ------------------------------------------------------------------------------- PA01

    @Test
    fun `T-PA01-a steps summary`() {
        val h = daily(5200.0, 6100.0, 4800.0, 7300.0, 5900.0, 3100.0, 4500.0)
        val s = ActivityMetrics.stepsSummary(h, asOfDay = 7)!!
        assertEquals(7, s.n)
        assertEquals(5200.0, s.median, eps)
        assertEquals(5271.4, s.mean, 0.05)
        assertEquals(1337.6, s.sd!!, 0.05)
        assertEquals(25.4, s.cvPercent!!, 0.05)
    }

    @Test
    fun `steps need five of seven days and gaps stay gaps`() {
        val h = daily(5200.0, 6100.0, 4800.0, 7300.0, 5900.0, 3100.0, 4500.0)
        assertNull(ActivityMetrics.stepsSummary(h.filter { it.epochDay !in setOf(2L, 3L, 4L) }, 7))
        val five = ActivityMetrics.stepsSummary(h.filter { it.epochDay !in setOf(2L, 3L) }, 7)!!
        assertEquals(5, five.n)
        assertNull(ActivityMetrics.stepsSummary(emptyList(), 7))
    }

    @Test
    fun `steps window ends on the evaluated day and negative counts are invalid`() {
        val h = daily(100.0, 5000.0, 5000.0, 5000.0, 5000.0, 5000.0, -50.0, 5000.0, start = 1)
        val s = ActivityMetrics.stepsSummary(h, asOfDay = 8)!!      // days 2..8, day 7 invalid
        assertEquals(6, s.n)
        assertEquals(5000.0, s.mean, eps)
    }

    @Test
    fun `step reference ranges follow Paluch 2022 by age`() {
        assertEquals(StepReferenceRange(8_000, 10_000), ActivityMetrics.stepReferenceRange(35))
        assertEquals(StepReferenceRange(8_000, 10_000), ActivityMetrics.stepReferenceRange(59))
        assertEquals(StepReferenceRange(6_000, 8_000), ActivityMetrics.stepReferenceRange(60))
        assertEquals(StepReferenceRange(6_000, 8_000), ActivityMetrics.stepReferenceRange(75))
    }

    @Test
    fun `steps per waking hour`() {
        assertEquals(500.0, ActivityMetrics.stepsPerWakingHour(8000.0, 960.0)!!, eps)
        assertNull(ActivityMetrics.stepsPerWakingHour(null, 960.0))
        assertNull(ActivityMetrics.stepsPerWakingHour(8000.0, null))
        assertNull(ActivityMetrics.stepsPerWakingHour(8000.0, 0.0))
        assertNull(ActivityMetrics.stepsPerWakingHour(-1.0, 960.0))
    }

    // ------------------------------------------------------------------------------- PA02

    @Test
    fun `T-PA02-a active zone minutes 128 of 150`() {
        val w = ActivityMetrics.weeklyActiveZoneMinutes(daily(20.0, 18.0, 15.0, 25.0, 10.0, 30.0, 10.0), weekEndDay = 7)!!
        assertEquals(128.0, w.moderateEquivalentMinutes, eps)
        assertEquals(85.3, w.percentOfLowerBound, 0.05)
        assertFalse(w.meetsLowerBound)
        assertFalse(w.meetsUpperBound)
        assertEquals(22.0, w.minutesToLowerBound, eps)
        assertEquals(7, w.validDays)
        assertFalse(w.isLowerBound)
        assertNull(w.moderateMinutes)
    }

    @Test
    fun `MVPA counts a vigorous minute twice`() {
        val w = ActivityMetrics.weeklyMvpa(daily(*DoubleArray(7) { 30.0 }), daily(*DoubleArray(7) { 10.0 }), 7)!!
        assertEquals(210.0, w.moderateMinutes!!, eps)
        assertEquals(70.0, w.vigorousMinutes!!, eps)
        assertEquals(350.0, w.moderateEquivalentMinutes, eps)
        assertEquals(350.0 / 1.5, w.percentOfLowerBound, 1e-9)
        assertTrue(w.meetsLowerBound)
        assertTrue(w.meetsUpperBound)
        assertEquals(0.0, w.minutesToLowerBound, eps)
    }

    @Test
    fun `five or six valid days give a lower bound and fewer give nothing`() {
        val m = daily(*DoubleArray(7) { 30.0 })
        val v = daily(*DoubleArray(7) { 0.0 })
        val six = ActivityMetrics.weeklyMvpa(m, v.filter { it.epochDay != 4L }, 7)!!
        assertEquals(6, six.validDays)
        assertTrue(six.isLowerBound)
        assertEquals(180.0, six.moderateEquivalentMinutes, eps)
        val five = ActivityMetrics.weeklyMvpa(m.filter { it.epochDay != 1L }, v.filter { it.epochDay != 4L }, 7)!!
        assertEquals(5, five.validDays)
        assertNull(ActivityMetrics.weeklyMvpa(m.take(4), v, 7))
        assertNull(ActivityMetrics.weeklyMvpa(m, emptyList(), 7))
    }

    @Test
    fun `days outside the week and negative values do not count`() {
        val m = daily(*DoubleArray(10) { 10.0 }, start = 1)                   // days 1..10
        val v = daily(*DoubleArray(10) { 0.0 }, start = 1).map { if (it.epochDay == 8L) DailyValue(8, -1.0) else it }
        val w = ActivityMetrics.weeklyMvpa(m, v, weekEndDay = 10)!!           // week 4..10, day 8 invalid
        assertEquals(6, w.validDays)
        assertEquals(60.0, w.moderateEquivalentMinutes, eps)
    }

    // ------------------------------------------------------------------------------- PA10

    private fun week(total: Double, validDays: Int = 7): WeeklyActivity? =
        ActivityMetrics.weeklyActiveZoneMinutes(List(validDays) { DailyValue(it + 1L, total / validDays) }, 7)

    @Test
    fun `streak counts back from the latest week`() {
        val s = ActivityMetrics.guidelineStreak(listOf(week(100.0), week(160.0), week(200.0), week(155.0)))
        assertEquals(3, s.currentStreakWeeks)
        assertEquals(3, s.weeksMeeting)
        assertEquals(4, s.weeksEvaluated)
        assertEquals(0, s.weeksUnknown)
    }

    @Test
    fun `an unknown week ends the streak and is not a miss`() {
        val s = ActivityMetrics.guidelineStreak(listOf(week(200.0), week(200.0), null, week(200.0)))
        assertEquals(1, s.currentStreakWeeks)
        assertEquals(3, s.weeksMeeting)
        assertEquals(3, s.weeksEvaluated)
        assertEquals(1, s.weeksUnknown)
    }

    @Test
    fun `a partial week above the bound counts but one below it is unknown`() {
        val s = ActivityMetrics.guidelineStreak(listOf(week(200.0), week(160.0, validDays = 5)))
        assertEquals(2, s.currentStreakWeeks)
        val u = ActivityMetrics.guidelineStreak(listOf(week(200.0), week(100.0, validDays = 5)))
        assertEquals(0, u.currentStreakWeeks)
        assertEquals(1, u.weeksUnknown)
        assertEquals(1, u.weeksEvaluated)
    }

    @Test
    fun `empty streak`() {
        val s = ActivityMetrics.guidelineStreak(emptyList())
        assertEquals(0, s.currentStreakWeeks)
        assertEquals(0, s.weeksEvaluated)
    }

    // ------------------------------------------------------------------------------- PA03

    @Test
    fun `T-PA03-a prolonged bouts`() {
        val b = ActivityMetrics.prolongedBouts(listOf(45.0, 120.0, 20.0, 65.0, 35.0, 15.0))
        assertEquals(listOf(45.0, 120.0, 65.0, 35.0), b.prolongedBouts)
        assertEquals(4, b.prolongedCount)
        assertEquals(120.0, b.longestMinutes!!, eps)
        assertEquals(265.0, b.prolongedMinutes, eps)
        assertEquals(300.0, b.totalMinutes, eps)
        assertEquals(30.0, b.thresholdMinutes, eps)
    }

    @Test
    fun `a bout of exactly the threshold is prolonged and invalid bouts are ignored`() {
        val b = ActivityMetrics.prolongedBouts(listOf(30.0, 29.0, 0.0, -5.0, Double.NaN))
        assertEquals(listOf(30.0), b.prolongedBouts)
        assertEquals(59.0, b.totalMinutes, eps)
        assertEquals(60, ActivityMetrics.prolongedBouts(listOf(60.0, 45.0), 60.0).prolongedBouts.single().toInt())
    }

    @Test
    fun `no bouts gives no longest bout`() {
        val b = ActivityMetrics.prolongedBouts(emptyList())
        assertNull(b.longestMinutes)
        assertEquals(0, b.prolongedCount)
        assertFailsWith<IllegalArgumentException> { ActivityMetrics.prolongedBouts(listOf(10.0), 0.0) }
    }

    // ----------------------------------------------------------------------- PA03(b) / PA04

    /** A day of 1,440 minutes built from (steps or null) segments. */
    private fun dayOf(vararg segments: Pair<Int, Int?>): List<Int?> =
        segments.flatMap { (minutes, steps) -> List(minutes) { steps } }

    @Test
    fun `sedentary bouts and breaks from minute steps`() {
        // 06:00 asleep. 06:00-07:00 sedentary, break, 30 min sedentary, break, rest of the day sedentary.
        val steps = dayOf(360 to 0, 60 to 0, 1 to 25, 30 to 0, 1 to 30, 988 to 0)
        assertEquals(1440, steps.size)
        val d = ActivityMetrics.sedentaryDay(steps, asleepMinutes = listOf(0..359))!!
        assertEquals(1080, d.observedWakingMinutes)
        assertEquals(2, d.breaks)
        assertEquals(listOf(60.0, 30.0, 988.0), d.bouts.prolongedBouts)
        assertEquals(1078.0, d.bouts.totalMinutes, eps)
        assertEquals(2.0 / (1078.0 / 60), d.breaksPerSedentaryHour!!, 1e-9)
        assertEquals(2.0 / 18.0, d.breaksPerWakingHour, 1e-9)
    }

    @Test
    fun `a minute without data ends a bout but is not a break`() {
        val steps = dayOf(500 to 0, 1 to null, 499 to 0)
        val d = ActivityMetrics.sedentaryDay(steps)!!
        assertEquals(999, d.observedWakingMinutes)
        assertEquals(0, d.breaks)
        assertEquals(listOf(500.0, 499.0), d.bouts.prolongedBouts)
    }

    @Test
    fun `a thinly covered day is unknown`() {
        assertNull(ActivityMetrics.sedentaryDay(dayOf(599 to 0, 841 to null)))
        assertNotNull(ActivityMetrics.sedentaryDay(dayOf(600 to 0, 840 to null)))
        assertNull(ActivityMetrics.sedentaryDay(List(1440) { null }))
    }

    @Test
    fun `a day without sedentary minutes has no breaks per sedentary hour`() {
        val d = ActivityMetrics.sedentaryDay(List(1440) { 25 })!!
        assertEquals(0, d.breaks)
        assertNull(d.breaksPerSedentaryHour)
        assertEquals(0.0, d.breaksPerWakingHour, eps)
        assertEquals(0.0, d.bouts.totalMinutes, eps)
    }

    @Test
    fun `the break threshold is configurable and must be positive`() {
        val steps = dayOf(300 to 0, 1 to 10, 700 to 0)
        assertEquals(0, ActivityMetrics.sedentaryDay(steps)!!.breaks)
        assertEquals(1, ActivityMetrics.sedentaryDay(steps, breakStepsPerMinute = 10)!!.breaks)
        assertFailsWith<IllegalArgumentException> { ActivityMetrics.sedentaryDay(steps, breakStepsPerMinute = 0) }
    }

    // ------------------------------------------------------------------------------- PA05

    @Test
    fun `peak cadence is the mean of the top minutes`() {
        val steps = List(570) { 10 } + List(30) { 100 }
        assertEquals(100.0, ActivityMetrics.peakCadence(steps)!!, eps)
        assertEquals(55.0, ActivityMetrics.peakCadence(steps, topMinutes = 60)!!, eps)
        assertEquals(100.0, ActivityMetrics.peakCadence(steps.shuffled(java.util.Random(1)))!!, eps)
    }

    @Test
    fun `peak cadence of a thinly observed day is unknown`() {
        assertNull(ActivityMetrics.peakCadence(List(599) { 20 }))
        assertNull(ActivityMetrics.peakCadence(List(600) { if (it < 100) null else 20 }))
        assertEquals(20.0, ActivityMetrics.peakCadence(List(700) { if (it < 100) null else 20 })!!, eps)
        assertFailsWith<IllegalArgumentException> { ActivityMetrics.peakCadence(List(700) { 1 }, topMinutes = 0) }
    }

    // ------------------------------------------------------------------------------- PA07

    @Test
    fun `steps in one hour have zero entropy`() {
        val steps = List(1440) { if (it in 480..539) 100 else 0 }
        val p = ActivityMetrics.hourlyStepProfile(steps)
        assertEquals(6000, p.hourlySteps[8])
        assertEquals(1, p.activeHours)
        assertEquals(6000.0, p.stepsPerActiveHour!!, eps)
        assertEquals(0.0, p.normalisedEntropy!!, 1e-12)
    }

    @Test
    fun `evenly spread steps have entropy one`() {
        val p = ActivityMetrics.hourlyStepProfile(List(1440) { 1 })
        assertEquals(24, p.activeHours)
        assertEquals(60.0, p.stepsPerActiveHour!!, eps)
        assertEquals(1.0, p.normalisedEntropy!!, 1e-12)
    }

    @Test
    fun `entropy of two equal hours out of twenty-four`() {
        val steps = List(1440) { if (it / 60 == 8 || it / 60 == 17) 1 else 0 }
        assertEquals(ln(2.0) / ln(24.0), ActivityMetrics.hourlyStepProfile(steps).normalisedEntropy!!, 1e-12)
    }

    @Test
    fun `hours without an observed minute stay unknown`() {
        val steps: List<Int?> = List(1440) { if (it / 60 < 6) null else 1 }
        val p = ActivityMetrics.hourlyStepProfile(steps)
        assertNull(p.hourlySteps[0])
        assertEquals(60, p.hourlySteps[6])
        assertEquals(18, p.activeHours)
        assertEquals(1.0, p.normalisedEntropy!!, 1e-12)   // normalised by the 18 observed hours
    }

    @Test
    fun `no steps or a single observed hour gives no entropy`() {
        assertNull(ActivityMetrics.hourlyStepProfile(List(1440) { 0 }).normalisedEntropy)
        assertNull(ActivityMetrics.hourlyStepProfile(List(1440) { 0 }).stepsPerActiveHour)
        assertNull(ActivityMetrics.hourlyStepProfile(List(60) { 5 }).normalisedEntropy)
        assertTrue(ActivityMetrics.hourlyStepProfile(emptyList()).hourlySteps.isEmpty())
    }

    // ------------------------------------------------------------------------------- BV02

    @Test
    fun `target adherence and streak`() {
        val a = ActivityMetrics.targetAdherence(listOf(8000.0, null, 10000.0, 9000.0, 11000.0, 12000.0), 10000.0)!!
        assertEquals(3, a.daysMeeting)
        assertEquals(5, a.validDays)
        assertEquals(60.0, a.percentOfValidDays, eps)
        assertEquals(2, a.currentStreakDays)
    }

    @Test
    fun `a missing latest day ends the streak and an upper target works the other way`() {
        val a = ActivityMetrics.targetAdherence(listOf(10000.0, 10000.0, null), 10000.0)!!
        assertEquals(0, a.currentStreakDays)
        assertEquals(2, a.daysMeeting)
        val b = ActivityMetrics.targetAdherence(listOf(3.0, 5.0, 2.0, 1.0), 2.0, atLeast = false)!!
        assertEquals(2, b.daysMeeting)
        assertEquals(2, b.currentStreakDays)
    }

    @Test
    fun `adherence with no valid day is unknown`() {
        assertNull(ActivityMetrics.targetAdherence(listOf(null, null), 1.0))
        assertNull(ActivityMetrics.targetAdherence(emptyList(), 1.0))
        assertNull(ActivityMetrics.targetAdherence(listOf(Double.NaN), 1.0))
    }
}
