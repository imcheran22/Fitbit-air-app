package com.apex.athlete.ui.overview

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.R
import com.apex.athlete.core.analytics.energy.EnergyPoint
import com.apex.athlete.core.analytics.energy.EnergyResult
import com.apex.athlete.core.analytics.stress.MinuteStress
import com.apex.athlete.core.analytics.stress.StressBaseline
import com.apex.athlete.core.analytics.stress.StressSummary
import com.apex.athlete.core.data.pipeline.EnergyMissingReason
import com.apex.athlete.core.data.pipeline.StressMissingReason
import com.apex.athlete.core.data.repository.StressEnergyState
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.ApexFormatter
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.test.assertEquals
import kotlin.test.assertNull

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS", application = android.app.Application::class)
class OverviewExtrasMappingTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val formatter = ApexFormatter(context, UnitSystem.METRIC, true, { ZoneOffset.UTC }, { 1_800_000_000_000L })
    private val derived = DataProvenance.MATHEMATICALLY_DERIVED
    private val day = LocalDate.of(2026, 11, 12)

    private fun sampleEnergy() = EnergyResult(
        startLevel = 80.0, curve = listOf(EnergyPoint(10L, 80.0), EnergyPoint(11L, 79.5)), currentLevel = 79.5, lowestLevel = 60.2,
        drainedBasal = 1.0, drainedActivity = 2.0, drainedStress = 3.0, chargedRest = 0.0, chargedNap = 0.0, unscoredStressMinutes = 0,
    )

    private fun state(
        epochDay: Long = day.toEpochDay(),
        stress: StressSummary? = StressSummary(1.24, 240, 80, 31, 351, null),
        stressMissing: StressMissingReason? = null,
        baseline: StressBaseline? = null,
        energy: EnergyResult? = sampleEnergy(),
        energyMissing: EnergyMissingReason? = null,
        levels: List<MinuteStress> = listOf(MinuteStress(100L, 0.5), MinuteStress(101L, 2.5), MinuteStress(102L, Double.NaN)),
    ) = StressEnergyState(
        isDemo = false, epochDay = epochDay, isProvisional = false, stress = stress, stressMinuteLevels = levels,
        stressDayAggregateBpm = null, stressBaseline = baseline, stressMissing = stressMissing, stressHistory = emptyList(),
        energy = energy, energyMissing = energyMissing,
    )

    @Test fun tiersFollowTheEnginesCutOffs() {
        assertEquals(StressTier.Low, stressTierOf(0.99))
        assertEquals(StressTier.Medium, stressTierOf(1.0))
        assertEquals(StressTier.Medium, stressTierOf(1.99))
        assertEquals(StressTier.High, stressTierOf(2.0))
    }

    @Test fun minuteLevelsBecomeMillisecondPointsAndANonFiniteLevelIsAGap() {
        assertEquals(
            listOf(ChartPoint(6_000_000L, 0.5), ChartPoint(6_060_000L, 2.5), ChartPoint(6_120_000L, null)),
            stressStripPoints(listOf(MinuteStress(100L, 0.5), MinuteStress(101L, 2.5), MinuteStress(102L, Double.NaN))),
        )
        assertEquals(listOf(ChartPoint(600_000L, 80.0)), energyCurvePoints(listOf(EnergyPoint(10L, 80.0))))
    }

    @Test fun stressCardCarriesLevelMinutesAndDerivedProvenance() {
        val ui = buildOverviewExtras(state(), null, day, formatter).stress
        assertEquals(MetricState.Value(1.24, 1, "/ 3", derived), ui.level)
        assertEquals(StressTier.Medium, ui.tier)
        assertEquals(MetricState.Value(240.0, 0, "min", derived), ui.lowMinutes)
        assertEquals(MetricState.Value(80.0, 0, "min", derived), ui.mediumMinutes)
        assertEquals(MetricState.Value(31.0, 0, "min", derived), ui.highMinutes)
        assertEquals(3, ui.points.size)
        assertEquals(6_000_000L, ui.windowStartMillis)
        assertEquals(6_120_000L, ui.windowEndMillis)
    }

    @Test fun energyCardCarriesTheBankAndTheCurve() {
        val ui = buildOverviewExtras(state(), null, day, formatter).energy
        assertEquals(MetricState.Value(79.5, 0, "/ 100", derived), ui.bank)
        assertEquals(MetricState.Value(60.2, 0, "/ 100", derived), ui.lowest)
        assertEquals(listOf(ChartPoint(600_000L, 80.0), ChartPoint(660_000L, 79.5)), ui.points)
    }

    @Test fun calibratingStressShowsTheNightsStillNeededAndNoNumber() {
        val ui = buildOverviewExtras(
            state(stress = null, stressMissing = StressMissingReason.BASELINE_CALIBRATING, baseline = null, levels = emptyList()),
            null, day, formatter,
        ).stress
        assertEquals(MetricState.Calibrating(null), ui.level)
        assertNull(ui.tier)
        assertEquals(MetricState.Calibrating(null), ui.lowMinutes)
        assertEquals(emptyList(), ui.points)
        assertEquals(MetricState.Calibrating(4), stressMissingState(StressMissingReason.BASELINE_CALIBRATING, 3, formatter))
        assertEquals(MetricState.Calibrating(null), stressMissingState(StressMissingReason.BASELINE_CALIBRATING, 7, formatter))
    }

    @Test fun missingStressAndEnergyGiveReasonsNeverZero() {
        assertEquals(
            MetricState.Unavailable(MetricReason.INSUFFICIENT_HR_DATA),
            stressMissingState(StressMissingReason.NO_HEART_RATE_DATA, null, formatter),
        )
        assertEquals(
            MetricState.Unavailable(MetricReason.NO_DATA, context.getString(R.string.overview_stress_no_motion)),
            stressMissingState(StressMissingReason.NO_MOTION_DATA, null, formatter),
        )
        assertEquals(
            MetricState.Unavailable(MetricReason.NO_DATA, context.getString(R.string.overview_energy_no_recovery)),
            energyMissingState(EnergyMissingReason.NO_RECOVERY, formatter),
        )
        assertEquals(
            MetricState.Unavailable(MetricReason.AWAITING_SLEEP_SYNC, context.getString(R.string.overview_energy_no_wake)),
            energyMissingState(EnergyMissingReason.NO_WAKE_TIME, formatter),
        )
        val ui = buildOverviewExtras(
            state(stress = null, stressMissing = StressMissingReason.NO_HEART_RATE_DATA, energy = null, energyMissing = EnergyMissingReason.NEEDS_ZONES, levels = emptyList()),
            null, day, formatter,
        )
        assertEquals(MetricState.Unavailable(MetricReason.INSUFFICIENT_HR_DATA), ui.stress.level)
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA, context.getString(R.string.overview_energy_needs_zones)), ui.energy.bank)
    }

    @Test fun aResultForAnotherDayOrNoResultIsLoading() {
        val other = buildOverviewExtras(state(epochDay = day.toEpochDay() - 1), null, day, formatter)
        assertEquals(OverviewExtrasUi.Loading, other)
        val none = buildOverviewExtras(null, null, day, formatter)
        assertEquals(MetricState.Loading, none.stress.level)
        assertEquals(MetricState.Loading, none.energy.bank)
        assertEquals(OVERVIEW_ACTIVITY_METRICS, none.activity.map { it.metric })
        assertEquals(true, none.activity.all { it.state == MetricState.Loading })
    }
}
