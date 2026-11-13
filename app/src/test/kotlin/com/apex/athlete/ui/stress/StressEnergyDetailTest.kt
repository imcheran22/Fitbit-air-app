package com.apex.athlete.ui.stress

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.analytics.energy.EnergyPoint
import com.apex.athlete.core.analytics.energy.EnergyResult
import com.apex.athlete.core.analytics.stress.MinuteStress
import com.apex.athlete.core.analytics.stress.StressBaseline
import com.apex.athlete.core.analytics.stress.StressSummary
import com.apex.athlete.core.data.pipeline.EnergyMissingReason
import com.apex.athlete.core.data.pipeline.StressMissingReason
import com.apex.athlete.core.data.repository.StressEnergyState
import com.apex.athlete.core.data.repository.TrendPoint
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.detail.TEST_TODAY
import com.apex.athlete.ui.detail.testFormatter
import com.apex.athlete.ui.energy.EnergyTerm
import com.apex.athlete.ui.energy.buildEnergyDetail
import com.apex.athlete.ui.overview.StressTier
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS", application = android.app.Application::class)
class StressEnergyDetailTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val derived = DataProvenance.MATHEMATICALLY_DERIVED
    private val f get() = testFormatter(context)

    private fun summary(mean: Double = 0.9) = StressSummary(mean, 240, 80, 31, 351, null)

    private fun energy() = EnergyResult(
        startLevel = 88.0,
        curve = listOf(EnergyPoint(100, 88.0), EnergyPoint(101, 87.5), EnergyPoint(102, Double.NaN), EnergyPoint(103, 60.0)),
        currentLevel = 46.0,
        lowestLevel = 44.0,
        drainedBasal = 38.4,
        drainedActivity = 12.25,
        drainedStress = 2.4,
        chargedRest = 1.1,
        chargedNap = 0.0,
        unscoredStressMinutes = 42,
    )

    private fun state(
        stress: StressSummary? = summary(),
        energy: EnergyResult? = energy(),
        stressMissing: StressMissingReason? = null,
        energyMissing: EnergyMissingReason? = null,
        provisional: Boolean = false,
        baseline: StressBaseline? = StressBaseline(58.0, 5.0, 12),
        history: List<TrendPoint> = listOf(TrendPoint(TEST_TODAY - 1, 0.6), TrendPoint(TEST_TODAY, 0.9)),
    ) = StressEnergyState(
        isDemo = false,
        epochDay = TEST_TODAY,
        isProvisional = provisional,
        stress = stress,
        stressMinuteLevels = listOf(MinuteStress(100, 0.4), MinuteStress(101, Double.NaN), MinuteStress(102, 2.4)),
        stressDayAggregateBpm = 60.4,
        stressBaseline = baseline,
        stressMissing = stressMissing,
        stressHistory = history,
        energy = energy,
        energyMissing = energyMissing,
    )

    // --- Stress ---------------------------------------------------------------------------------

    @Test fun stressShowsLevelTierMinutesAndCalculatedProvenance() {
        val ui = buildStressDetail(state(), f)
        assertEquals(MetricState.Value(0.9, 1, "/ 3", derived), ui.level)
        assertEquals(StressTier.Low, ui.tier)
        assertEquals(MetricState.Value(240.0, 0, "min", derived), ui.lowMinutes)
        assertEquals(MetricState.Value(80.0, 0, "min", derived), ui.mediumMinutes)
        assertEquals(MetricState.Value(31.0, 0, "min", derived), ui.highMinutes)
    }

    @Test fun theStripKeepsAGapForAMinuteWithoutALevel() {
        val ui = buildStressDetail(state(), f)
        assertEquals(listOf<Double?>(0.4, null, 2.4), ui.points.map { it.y })
        assertEquals(100 * 60_000L, ui.windowStartMillis)
        assertEquals(102 * 60_000L, ui.windowEndMillis)
    }

    @Test fun theBaselineAndTheDaysCalmHeartRateCarryTheirNumbers() {
        val ui = buildStressDetail(state(), f)
        assertEquals(MetricState.Value(58.0, 0, "bpm", derived), ui.baselineBpm)
        assertEquals(12, ui.baselineDays)
        assertEquals(MetricState.Value(60.4, 0, "bpm", derived), ui.dayBpm)
    }

    @Test fun aLevelAboveTwoIsHigh() {
        assertEquals(StressTier.High, buildStressDetail(state(stress = summary(2.1)), f).tier)
        assertEquals(StressTier.Medium, buildStressDetail(state(stress = summary(1.0)), f).tier)
    }

    @Test fun calibratingShowsTheNightsStillNeededAndNoNumbers() {
        val ui = buildStressDetail(
            state(stress = null, stressMissing = StressMissingReason.BASELINE_CALIBRATING, baseline = null), f,
        )
        assertEquals(MetricState.Calibrating(null), ui.level)
        assertEquals(ui.level, ui.lowMinutes)
        assertEquals(ui.level, ui.baselineBpm)
        assertTrue(ui.points.isEmpty())
        assertNull(ui.tier)
    }

    @Test fun calibratingWithSomeBaselineDaysCountsTheRest() {
        val ui = buildStressDetail(
            state(stress = null, stressMissing = StressMissingReason.BASELINE_CALIBRATING, baseline = StressBaseline(58.0, 5.0, 4)), f,
        )
        assertEquals(MetricState.Calibrating(3), ui.level)
    }

    @Test fun missingMotionDataIsUnavailableWithItsReason() {
        val ui = buildStressDetail(state(stress = null, stressMissing = StressMissingReason.NO_MOTION_DATA), f)
        val level = assertIs<MetricState.Unavailable>(ui.level)
        assertEquals("No step data covers this day, so still minutes cannot be told from walking.", level.detail)
    }

    @Test fun noHeartRateIsTheInsufficientDataReason() {
        val ui = buildStressDetail(state(stress = null, stressMissing = StressMissingReason.NO_HEART_RATE_DATA), f)
        assertEquals(MetricState.Unavailable(MetricReason.INSUFFICIENT_HR_DATA), ui.level)
    }

    @Test fun todayIsProvisionalAndHistoryOnlyAppearsWithReadings() {
        val ui = buildStressDetail(state(provisional = true), f)
        assertEquals(true, assertIs<MetricState.Value>(ui.level).isProvisional)
        assertNotNull(ui.history)
        assertEquals(TEST_TODAY - 1, ui.history!!.startDay)
        assertNull(buildStressDetail(state(history = listOf(TrendPoint(TEST_TODAY, null))), f).history)
    }

    // --- Energy ---------------------------------------------------------------------------------

    @Test fun energyShowsTheBankLowestStartAndEveryTerm() {
        val ui = buildEnergyDetail(state(), f)
        assertEquals(MetricState.Value(46.0, 0, "/ 100", derived), ui.bank)
        assertEquals(MetricState.Value(44.0, 0, "/ 100", derived), ui.lowest)
        assertEquals(MetricState.Value(88.0, 0, "/ 100", derived), ui.start)
        assertEquals(EnergyTerm.entries, ui.terms.map { it.term })
        assertEquals(MetricState.Value(38.4, 1, "points", derived), ui.terms.first { it.term == EnergyTerm.BASAL }.state)
        assertEquals(MetricState.Value(12.25, 1, "points", derived), ui.terms.first { it.term == EnergyTerm.ACTIVITY }.state)
        assertEquals(listOf(EnergyTerm.BASAL, EnergyTerm.ACTIVITY, EnergyTerm.STRESS), ui.drains.map { it.term })
        assertEquals(listOf(EnergyTerm.REST, EnergyTerm.NAP), ui.charges.map { it.term })
        assertEquals(42, ui.unscoredStressMinutes)
    }

    @Test fun theCurveKeepsGapsForNonFiniteLevels() {
        val ui = buildEnergyDetail(state(), f)
        assertEquals(listOf<Double?>(88.0, 87.5, null, 60.0), ui.points.map { it.y })
        assertEquals(100 * 60_000L, ui.windowStartMillis)
        assertEquals(103 * 60_000L, ui.windowEndMillis)
    }

    @Test fun withoutARecoveryTheBankIsUnavailableWithTheReasonEverywhere() {
        val ui = buildEnergyDetail(state(energy = null, energyMissing = EnergyMissingReason.NO_RECOVERY), f)
        val bank = assertIs<MetricState.Unavailable>(ui.bank)
        assertEquals("Needs this morning's recovery score to start the bank.", bank.detail)
        assertEquals(bank, ui.lowest)
        assertTrue(ui.terms.all { it.state == bank })
        assertNull(ui.unscoredStressMinutes)
        assertTrue(ui.points.isEmpty())
    }

    @Test fun energyStillRunsWhileStressIsCalibrating() {
        val ui = buildEnergyDetail(
            state(stress = null, stressMissing = StressMissingReason.BASELINE_CALIBRATING, baseline = null), f,
        )
        assertEquals(MetricState.Value(46.0, 0, "/ 100", derived), ui.bank)
    }

    @Test fun noUnscoredMinutesMeansNoNote() {
        val e = energy().copy(unscoredStressMinutes = 0)
        assertNull(buildEnergyDetail(state(energy = e), f).unscoredStressMinutes)
    }
}
