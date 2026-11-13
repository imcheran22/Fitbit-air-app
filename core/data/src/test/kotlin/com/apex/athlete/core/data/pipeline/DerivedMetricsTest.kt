package com.apex.athlete.core.data.pipeline

import com.apex.athlete.core.analytics.sleep.DipCategory
import com.apex.athlete.core.analytics.sleep.DipMissing
import com.apex.athlete.core.analytics.strain.CardioProfile
import com.apex.athlete.core.analytics.strain.HrrMissing
import com.apex.athlete.core.analytics.strain.HeartRateZoneModel
import com.apex.athlete.core.analytics.journal.JournalOutcomeKind
import com.apex.athlete.core.analytics.journal.JournalSkipReason
import com.apex.athlete.core.analytics.stress.MinuteHeartRate
import com.apex.athlete.core.analytics.stress.MinuteRange
import com.apex.athlete.core.analytics.stress.MinuteStress
import com.apex.athlete.core.domain.MetricType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The decisions around the version-4 engines, on plain data (no database): which minutes are still, when a
 * stress or energy value is withheld and why, how journal days are paired, how BMI is derived.
 */
class DerivedMetricsTest {

    private val minute = 60_000L
    private val day0 = 20_000L * 86_400_000L // a UTC midnight
    private val startMinute = day0 / minute
    private fun hhmm(h: Int, m: Int = 0) = startMinute + h * 60 + m

    /** One heart-rate value per minute from [fromH] to [toH] (exclusive). */
    private fun hr(fromH: Int, toH: Int, bpm: Double = 70.0) = (hhmm(fromH) until hhmm(toH)).map { MinuteHeartRate(it, bpm) }
    private val motionSomewhere = listOf(StepInterval(day0 + 3 * 3_600_000L, day0 + 3 * 3_600_000L + minute, 12.0))
    private val dayEnd = day0 + 86_400_000L

    // --- minute arithmetic -------------------------------------------------------------------------

    @Test
    fun minuteRoundingFloorsAndCeils() {
        assertEquals(5L, minuteOf(5 * minute + 59_999))
        assertEquals(6L, minuteCeil(5 * minute + 1))
        assertEquals(5L, minuteCeil(5 * minute))
        assertEquals(-1L, minuteOf(-1))
        assertEquals(0L, minuteCeil(-1))
        assertEquals(MinuteRange(5, 7), minuteRangeOf(5 * minute + 10, 6 * minute + 10))
        assertEquals(MinuteRange(5, 5), minuteRangeOf(5 * minute, 4 * minute)) // reversed spans are empty, not an error
    }

    // --- motion gating -----------------------------------------------------------------------------

    @Test
    fun aBucketWithStepsIsMotionForEveryMinuteOfIt() {
        val m = StressDay.motionMinutes(listOf(StepInterval(day0, day0 + 15 * minute, 40.0)))
        assertEquals((0L until 15L).map { startMinute + it }, m.map { it.minute })
        assertTrue(m.all { it.steps >= 1 })
    }

    @Test
    fun zeroStepsMissingEndAndAbsurdIntervalsAreHandledWithoutGuessing() {
        assertTrue(StressDay.motionMinutes(listOf(StepInterval(day0, day0 + 5 * minute, 0.0))).isEmpty())
        assertEquals(1, StressDay.motionMinutes(listOf(StepInterval(day0, null, 3.0))).size)
        // A day total mislabelled as an interval says nothing about when the person moved: not used for gating.
        assertTrue(StressDay.motionMinutes(listOf(StepInterval(day0, day0 + 6 * 3_600_000L, 9000.0))).isEmpty())
        assertTrue(StressDay.motionMinutes(listOf(StepInterval(day0, day0 + minute, Double.NaN))).isEmpty())
    }

    // --- stress -----------------------------------------------------------------------------------

    private val calm: List<Double?> = List(8) { 60.0 }

    @Test
    fun noHeartRateMeansNoStressAndNoAggregate() {
        val o = StressDay.evaluate(day0, dayEnd, emptyList(), motionSomewhere, emptyList(), calm)
        assertNull(o.summary)
        assertNull(o.dayAggregateBpm)
        assertEquals(StressMissingReason.NO_HEART_RATE_DATA, o.missing)
    }

    @Test
    fun heartRateOutsideTheDayDoesNotCount() {
        val outside = (startMinute - 600 until startMinute).map { MinuteHeartRate(it, 70.0) }
        val o = StressDay.evaluate(day0, dayEnd, outside, motionSomewhere, emptyList(), calm)
        assertEquals(StressMissingReason.NO_HEART_RATE_DATA, o.missing)
    }

    @Test
    fun withoutAnyStepIntervalStillMinutesCannotBeTold_stressIsWithheldNotGuessed() {
        val o = StressDay.evaluate(day0, dayEnd, hr(6, 22, 60.0), emptyList(), emptyList(), calm)
        assertNull(o.summary)
        assertNull(o.dayAggregateBpm)
        assertEquals(StressMissingReason.NO_MOTION_DATA, o.missing)
        // A bucket that ended before the day began does not cover it either.
        val yesterday = listOf(StepInterval(day0 - 3_600_000L, day0 - 3_000_000L, 50.0))
        assertEquals(StressMissingReason.NO_MOTION_DATA, StressDay.evaluate(day0, dayEnd, hr(6, 22, 60.0), yesterday, emptyList(), calm).missing)
    }

    @Test
    fun calibratingKeepsTheAggregateSoTomorrowHasABaseline() {
        val o = StressDay.evaluate(day0, dayEnd, hr(6, 22, 62.0), motionSomewhere, emptyList(), listOf(60.0, null, 61.0))
        assertNull(o.summary)
        assertEquals(StressMissingReason.BASELINE_CALIBRATING, o.missing)
        assertNull(o.baseline)
        assertEquals(62.0, o.dayAggregateBpm!!, 1e-9)
    }

    @Test
    fun tooFewStillMinutesKeepsTheAggregateButNoSummary() {
        val o = StressDay.evaluate(day0, dayEnd, hr(9, 10, 62.0), motionSomewhere, emptyList(), calm)
        assertNull(o.summary)
        assertEquals(StressMissingReason.TOO_FEW_MINUTES, o.missing)
        assertNotNull(o.baseline)
        assertEquals(62.0, o.dayAggregateBpm!!, 1e-9)
    }

    @Test
    fun aCalmDayScoresLowAndARaisedStillStretchScoresHigh() {
        val heartRate = hr(6, 12, 60.0) + hr(12, 13, 95.0) + hr(13, 22, 60.0)
        val o = StressDay.evaluate(day0, dayEnd, heartRate, motionSomewhere, emptyList(), calm)
        val s = o.summary!!
        assertNull(o.missing)
        assertEquals(960, s.scoredMinutes)
        assertEquals(60, s.highMinutes)
        assertEquals(900, s.lowMinutes)
        assertEquals(960, s.lowMinutes + s.mediumMinutes + s.highMinutes)
        assertEquals(o.minuteLevels.size, s.scoredMinutes)
        // The P10 of the hourly means is the calm floor, not pulled up by the raised hour.
        assertEquals(60.0, o.dayAggregateBpm!!, 1e-9)
    }

    @Test
    fun minutesNearStepsAndInsideWorkoutsOrSleepAreNeverScored() {
        val steps = motionSomewhere + StepInterval(day0 + 10 * 3_600_000L, day0 + 10 * 3_600_000L + minute, 50.0)
        val workout = minuteSpan(day0 + 14 * 3_600_000L, day0 + 14 * 3_600_000L + 30 * minute)
        val o = StressDay.evaluate(day0, dayEnd, hr(6, 22, 60.0), steps, listOf(workout), calm)
        val scored = o.minuteLevels.map { it.minute }.toSet()
        // +-2 minutes around the 10:00 step: 09:58 .. 10:02 absent.
        assertTrue((hhmm(9, 58)..hhmm(10, 2)).none { it in scored })
        assertTrue((hhmm(14) until hhmm(14, 30)).none { it in scored })
        assertEquals(960 - 5 - 30, o.summary!!.scoredMinutes)
    }

    // --- energy bank ------------------------------------------------------------------------------

    private val zones = HeartRateZoneModel.of(CardioProfile(50.0, 190.0))
    private val wake = day0 + 7 * 3_600_000L
    private val noon = day0 + 12 * 3_600_000L

    private fun energy(
        recovery: Double? = 80.0, wakeMillis: Long? = wake, now: Long = noon, z: HeartRateZoneModel? = zones,
        heartRate: List<MinuteHeartRate> = hr(7, 13, 70.0), stress: List<MinuteStress> = emptyList(), naps: List<MinuteRange> = emptyList(),
    ) = EnergyDay.evaluate(recovery, wakeMillis, dayEnd, now, z, heartRate, stress, naps)

    @Test
    fun energyNamesTheFirstMissingInput() {
        assertEquals(EnergyMissingReason.NO_RECOVERY, energy(recovery = null).missing)
        assertEquals(EnergyMissingReason.NO_WAKE_TIME, energy(wakeMillis = null).missing)
        assertEquals(EnergyMissingReason.NEEDS_ZONES, energy(z = null).missing)
        assertEquals(EnergyMissingReason.EMPTY_SPAN, energy(now = wake - 3_600_000L).missing)
        assertEquals(EnergyMissingReason.NO_HEART_RATE_DATA, energy(heartRate = hr(7, 7).plus(hr(9, 9))).missing)
        assertEquals(EnergyMissingReason.NO_HEART_RATE_DATA, energy(heartRate = hr(7, 7) + (0 until 59).map { MinuteHeartRate(hhmm(8) + it, 70.0) }).missing)
        assertNull(energy(recovery = null).result)
    }

    @Test
    fun energyRunsFromWakeToNowAndDrainsTheBasalRateWhenNothingElseIsKnown() {
        val o = energy()
        val r = o.result!!
        assertNull(o.missing)
        assertEquals(80.0, r.startLevel, 0.0)
        assertEquals(301, r.curve.size) // 07:00 .. 12:00 inclusive of the minute of "now"
        assertEquals(80.0 - 0.04 * 301, r.currentLevel, 1e-9)
        assertEquals(301, r.unscoredStressMinutes) // no stress level for any minute: said so, not imputed
    }

    @Test
    fun calmStressMinutesChargeAndAnEmptyStressListIsNotAssumedCalm() {
        val calmLevels = (hhmm(7) until hhmm(13)).map { MinuteStress(it, 0.5) }
        val r = energy(stress = calmLevels).result!!
        assertEquals(80.0 - 0.03 * 301, r.currentLevel, 1e-9)
        assertEquals(0, r.unscoredStressMinutes)
    }

    @Test
    fun aNapChargesInsteadOfDraining() {
        val nap = MinuteRange(hhmm(9), hhmm(9, 30))
        val r = energy(naps = listOf(nap)).result!!
        assertEquals(80.0 - 0.04 * (301 - 30) + 0.25 * 30, r.currentLevel, 1e-9)
    }

    @Test
    fun theCurveEndsWhereTheDayEndsForAFinishedDay() {
        val r = EnergyDay.evaluate(80.0, wake, dayEnd, dayEnd + 5 * 86_400_000L, zones, hr(7, 24, 70.0), emptyList(), emptyList()).result!!
        assertEquals(17 * 60, r.curve.size)
    }

    // --- sleeping heart-rate dip ------------------------------------------------------------------

    @Test
    fun theDaytimeWindowStartsAtTheLastWakeButNeverMoreThanADayBeforeTheOnset() {
        val onset = day0
        assertEquals(onset - 10 * 3_600_000L, HeartRateDipDay.daytimeStart(onset, onset - 10 * 3_600_000L))
        assertEquals(onset - 24 * 3_600_000L, HeartRateDipDay.daytimeStart(onset, null))
        assertEquals(onset - 24 * 3_600_000L, HeartRateDipDay.daytimeStart(onset, onset - 40 * 3_600_000L))
        assertEquals(onset - 24 * 3_600_000L, HeartRateDipDay.daytimeStart(onset, onset + 1)) // a wake time after the onset is nonsense
    }

    @Test
    fun theDipLeavesWorkoutsOutOfTheDaytimeMean() {
        val day = hr(7, 9, 80.0) + hr(9, 10, 150.0) + hr(10, 12, 80.0)
        val sleeping = hr(23, 24, 60.0) + hr(24, 30, 60.0)
        val withoutExclusion = HeartRateDipDay.evaluate(day, emptyList(), sleeping)
        val excluded = HeartRateDipDay.evaluate(day, listOf(minuteSpan(day0 + 9 * 3_600_000L, day0 + 10 * 3_600_000L)), sleeping)
        assertEquals(0.25, excluded.dipFraction!!, 1e-9)
        assertEquals(DipCategory.DIPPER, excluded.category)
        // A workout in the daytime mean would inflate it, and with it the dip.
        assertTrue(withoutExclusion.dipFraction!! > excluded.dipFraction!!)
    }

    @Test
    fun theDipSaysWhichSideIsMissing() {
        val day = hr(7, 12, 80.0)
        assertEquals(DipMissing.NO_SLEEPING_HEART_RATE, HeartRateDipDay.evaluate(day, emptyList(), emptyList()).missing)
        assertEquals(DipMissing.NO_DAYTIME_HEART_RATE, HeartRateDipDay.evaluate(emptyList(), emptyList(), hr(0, 6, 55.0)).missing)
        assertEquals(DipMissing.NO_DAYTIME_HEART_RATE, HeartRateDipDay.evaluate(day, listOf(minuteSpan(day0, dayEnd)), hr(0, 6, 55.0)).missing)
        assertEquals(DipMissing.TOO_FEW_MINUTES, HeartRateDipDay.evaluate(day, emptyList(), hr(0, 0) + (0 until 10).map { MinuteHeartRate(hhmm(1) + it, 55.0) }).missing)
        assertNull(HeartRateDipDay.evaluate(day, emptyList(), emptyList()).dipFraction)
    }

    @Test
    fun aReversedNightIsReportedAsNegative() {
        val r = HeartRateDipDay.evaluate(hr(7, 12, 60.0), emptyList(), hr(0, 6, 66.0))
        assertEquals(DipCategory.REVERSED, r.category)
        assertTrue(r.dipFraction!! < 0.0)
    }

    // --- post-workout heart-rate recovery ---------------------------------------------------------

    @Test
    fun recoveryNeedsAZoneModelAndAHardEnoughPeak() {
        val end = day0 + 18 * 3_600_000L
        val e = minuteOf(end)
        val rows = (e - 3 until e).map { MinuteHeartRate(it, 170.0) } + MinuteHeartRate(e, 150.0) + MinuteHeartRate(e + 1, 140.0)
        assertNull(WorkoutRecovery.compute(end, rows, null))

        val z = HeartRateZoneModel.of(CardioProfile(50.0, 190.0)) // zone 4 starts at 152 bpm
        val ok = WorkoutRecovery.compute(end, rows, z)!!
        assertEquals(170.0, ok.peakBpm!!, 0.0)
        assertEquals(20.0, ok.dropAt60!!, 0.0)
        assertEquals(30.0, ok.dropAt120!!, 0.0)

        val easy = WorkoutRecovery.compute(end, (e - 3 until e).map { MinuteHeartRate(it, 120.0) } + MinuteHeartRate(e, 100.0), z)!!
        assertEquals(HrrMissing.PEAK_BELOW_MINIMUM, easy.missing)
        assertNull(easy.dropAt60)
    }

    @Test
    fun aWorkoutEndingMidMinuteUsesTheMinuteItEndedIn() {
        val end = day0 + 18 * 3_600_000L + 30_000L // 18:00:30
        val last = minuteOf(end) // 18:00 is the last workout minute
        val z = HeartRateZoneModel.of(CardioProfile(50.0, 190.0))
        val rows = (last - 2..last).map { MinuteHeartRate(it, 160.0) } + MinuteHeartRate(last + 1, 140.0) + MinuteHeartRate(last + 2, 130.0)
        val r = WorkoutRecovery.compute(end, rows, z)!!
        assertEquals(20.0, r.dropAt60!!, 0.0)
        assertEquals(30.0, r.dropAt120!!, 0.0)
    }

    // --- journal effects --------------------------------------------------------------------------

    private val alcohol = MetricType.JOURNAL_ALCOHOL
    private val first = 100L

    /** Factor on days [first]..[first]+[n]-1 (yes when [isYes]); outcome the next day is 70 after yes and 60 after no, plus a tiny deterministic wobble. */
    private fun scenario(n: Int, isYes: (Long) -> Boolean): Triple<Map<MetricType, Map<Long, Double>>, Map<Long, Double>, Map<Long, Double>> {
        val factor = (first until first + n).associateWith { if (isYes(it)) 1.0 else 0.0 }
        val recovery = HashMap<Long, Double>()
        val rmssd = HashMap<Long, Double>()
        for (d in first + 1..first + n) {
            val after = isYes(d - 1)
            recovery[d] = (if (after) 70.0 else 60.0) + (d % 3) - 1
            rmssd[d] = (if (after) 40.0 else 60.0) * (1.0 + 0.01 * ((d % 3) - 1))
        }
        return Triple(mapOf(alcohol to factor), recovery, rmssd)
    }

    @Test
    fun nothingJournalledMeansNoReportAtAll() {
        assertNull(JournalDay.analyze(emptyMap(), mapOf(100L to 70.0), mapOf(100L to 50.0), 130))
        assertNull(JournalDay.analyze(mapOf(alcohol to emptyMap()), mapOf(100L to 70.0), mapOf(100L to 50.0), 130))
    }

    @Test
    fun aFactorWithAtLeastFiveDaysPerArmGetsARecoveryAndAnHrvEffect() {
        val (factor, recovery, rmssd) = scenario(30) { it % 2 == 0L }
        val report = JournalDay.analyze(factor, recovery, rmssd, first + 30)!!
        val rec = report.effects.single { it.outcome == JournalOutcomeKind.RECOVERY_POINTS }
        val hrv = report.effects.single { it.outcome == JournalOutcomeKind.HRV_PERCENT }
        assertEquals(alcohol, rec.factorMetric())
        assertTrue(rec.nWith >= 5 && rec.nWithout >= 5)
        assertEquals(10.0, rec.effect, 1.0)
        assertTrue(rec.intervalExcludesZero)
        assertTrue(hrv.effect < -20.0, "RMSSD was lower after a yes day by construction, got ${hrv.effect}")
        assertEquals(report.effects.size, report.testsPerformed)
    }

    @Test
    fun fourDaysInOneArmIsNotEnough() {
        // Only 4 yes days (the factor on days 110..113); the other 26 are no.
        val (factor, recovery, rmssd) = scenario(30) { it in 110L..113L }
        val report = JournalDay.analyze(factor, recovery, rmssd, first + 30)!!
        assertTrue(report.effects.isEmpty())
        assertTrue(report.skipped.isNotEmpty())
        assertTrue(report.skipped.all { it.reason == JournalSkipReason.TOO_FEW_PER_ARM && it.nWith == 4 })
        assertEquals(0, report.testsPerformed)
    }

    @Test
    fun anUnloggedDayIsNotANoDay() {
        // Factor logged only on even days, all "yes": with no "no" days there is no comparison to make.
        val (_, recovery, rmssd) = scenario(30) { true }
        val factor = mapOf(alcohol to (first until first + 30).filter { it % 2 == 0L }.associateWith { 1.0 })
        val report = JournalDay.analyze(factor, recovery, rmssd, first + 30)!!
        assertTrue(report.effects.isEmpty())
        assertTrue(report.skipped.all { it.nWithout == 0 })
    }

    @Test
    fun onlyKnownFactorsAreAnalysed() {
        val (factor, recovery, rmssd) = scenario(30) { it % 2 == 0L }
        val report = JournalDay.analyze(mapOf(MetricType.STEPS to factor.getValue(alcohol)), recovery, rmssd, first + 30)
        assertNull(report) // STEPS is not a journal factor
    }

    // --- BMI --------------------------------------------------------------------------------------

    @Test
    fun bmiIsKilogramsOverMetresSquaredAndNullWithoutAHeightOrWeight() {
        assertEquals(24.69, BodyMassIndex.compute(80.0, 180.0)!!, 0.01)
        assertNull(BodyMassIndex.compute(80.0, null))
        assertNull(BodyMassIndex.compute(null, 180.0))
        assertNull(BodyMassIndex.compute(0.0, 180.0))
        assertNull(BodyMassIndex.compute(80.0, 18.0)) // 18 cm is a typing error, not a height
        assertNull(BodyMassIndex.compute(80.0, Double.NaN))
        assertFalse(BodyMassIndex.compute(80.0, 180.0)!!.isNaN())
    }
}
