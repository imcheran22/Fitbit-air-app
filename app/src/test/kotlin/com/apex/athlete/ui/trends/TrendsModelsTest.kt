package com.apex.athlete.ui.trends

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricCategory
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.detail.TEST_TODAY
import com.apex.athlete.ui.detail.testFormatter
import com.apex.athlete.ui.detail.testTrend
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS", application = android.app.Application::class)
class TrendsModelsTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val sensor = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    private val f get() = testFormatter(context)

    private fun state(vararg trends: com.apex.athlete.core.data.repository.MetricTrend, range: Int = 4) =
        TrendIntelligenceState(false, TEST_TODAY, range, trends.toList())

    @Test fun rangesAreSevenThirtyNinetyAndOneHundredEightyDays() {
        assertEquals(listOf(7, 30, 90, 180), TRENDS_RANGES)
        assertEquals(180, sanitizeTrendsRange(180))
        assertEquals(30, sanitizeTrendsRange(14))
        assertEquals(30, sanitizeTrendsRange(null))
    }

    @Test fun everyBrowsableMetricIsInTheRepositoryTrendList() {
        assertEquals(AthleteRepository.TREND_METRICS.map { it.first }, BROWSABLE_METRICS)
        assertEquals(MetricType.HRV_RMSSD, browsableMetric("hrv_rmssd"))
        assertNull(browsableMetric("nonsense"))
        assertNull(browsableMetric(null))
        assertNull(browsableMetric(""))
    }

    @Test fun everyCategoryHasATitleAndAnOrderPosition() {
        assertEquals(MetricCategory.entries.toSet(), TREND_GROUP_ORDER.toSet())
        assertEquals(TREND_GROUP_ORDER.size, TREND_GROUP_ORDER.distinct().size)
        MetricCategory.entries.forEach { groupTitleRes(it) }
    }

    @Test fun metricsAreGroupedByCategoryInTheFixedOrderAndEmptyGroupsAreLeftOut() {
        val s = state(
            testTrend(MetricType.STEPS, listOf(1_000.0, 2_000.0, 3_000.0, 4_000.0)),
            testTrend(MetricType.HRV_RMSSD, listOf(60.0, 61.0, 62.0, null)),
            testTrend(MetricType.WEIGHT, listOf(70.0, null, null, 71.0)),
            testTrend(MetricType.RESTING_HEART_RATE, listOf(50.0, 51.0, 52.0, 53.0)),
        )
        val groups = buildTrendGroups(s, f)
        assertEquals(listOf(MetricCategory.CARDIOVASCULAR, MetricCategory.ACTIVITY, MetricCategory.BODY), groups.map { it.category })
        assertEquals(listOf(MetricType.HRV_RMSSD, MetricType.RESTING_HEART_RATE), groups[0].rows.map { it.metric })
        assertEquals(listOf(MetricType.STEPS), groups[1].rows.map { it.metric })
    }

    @Test fun aRowShowsTheNewestReadingWithItsDateWhenItIsNotTheEndDay() {
        val s = state(
            testTrend(MetricType.HRV_RMSSD, listOf(60.0, 61.0, 62.0, null)),
            testTrend(MetricType.STEPS, listOf(1.0, 2.0, 3.0, 4_000.0)),
        )
        val groups = buildTrendGroups(s, f)
        val hrv = groups.first { it.category == MetricCategory.CARDIOVASCULAR }.rows.single()
        assertEquals(MetricState.Value(62.0, 0, "ms", sensor, asOf = "Yesterday"), hrv.state)
        val steps = groups.first { it.category == MetricCategory.ACTIVITY }.rows.single()
        assertEquals(MetricState.Value(4_000.0, 0, null, sensor), steps.state)
    }

    @Test fun aRangeWithoutAnyReadingIsUnavailableWithNoStatusNeverZero() {
        val s = state(testTrend(MetricType.WEIGHT, listOf(null, null, null, null)))
        val row = buildTrendGroups(s, f).single().rows.single()
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA), row.state)
        assertNull(row.statusLabel)
    }

    @Test fun noMetricsMeansNoGroups() {
        assertTrue(buildTrendGroups(state(), f).isEmpty())
    }

    // --- Overlay --------------------------------------------------------------------------------

    @Test fun theOverlayNeedsTwoFiguresAndWaitsForTheData() {
        val s = state(testTrend(MetricType.HRV_RMSSD, listOf(60.0, 61.0, 62.0, 63.0)))
        assertEquals(OverlayState.NeedsTwo, buildOverlay(null, null, s, f))
        assertEquals(OverlayState.NeedsTwo, buildOverlay(MetricType.HRV_RMSSD, null, s, f))
        assertEquals(OverlayState.NeedsTwo, buildOverlay(null, MetricType.STEPS, null, f))
        assertEquals(OverlayState.Loading, buildOverlay(MetricType.HRV_RMSSD, MetricType.STEPS, null, f))
    }

    @Test fun theOverlayKeepsEachFigureOnItsOwnScaleAndItsOwnGaps() {
        val s = state(
            testTrend(MetricType.HRV_RMSSD, listOf(60.0, null, 62.0, 63.0)),
            testTrend(MetricType.STEPS, listOf(1_000.0, 2_000.0, null, 4_000.0)),
        )
        val ready = assertIs<OverlayState.Ready>(buildOverlay(MetricType.HRV_RMSSD, MetricType.STEPS, s, f))
        assertEquals(listOf<Double?>(60.0, null, 62.0, 63.0), ready.primary.series.points.map { it.y })
        assertEquals(listOf<Double?>(1_000.0, 2_000.0, null, 4_000.0), ready.secondary.series.points.map { it.y })
        assertEquals(" ms", ready.primary.series.valueSuffix)
        assertEquals("", ready.secondary.series.valueSuffix)
        assertEquals(TEST_TODAY - 3, ready.primary.startDay)
        assertEquals(TEST_TODAY, ready.primary.endDay)
        assertTrue(ready.missing.isEmpty())
        assertEquals("Heart rate variability: Measured. Steps: Measured", ready.provenance)
    }

    @Test fun aChosenFigureWithNoReadingsIsNamedAndDrawsNoLine() {
        val s = state(testTrend(MetricType.HRV_RMSSD, listOf(60.0, 61.0, 62.0, 63.0)))
        val ready = assertIs<OverlayState.Ready>(buildOverlay(MetricType.HRV_RMSSD, MetricType.WEIGHT, s, f))
        assertEquals(listOf(MetricType.WEIGHT), ready.missing)
        assertTrue(ready.secondary.series.points.isEmpty())
        assertEquals("Heart rate variability: Measured", ready.provenance)
    }

    // --- Tap to day -----------------------------------------------------------------------------

    @Test fun everyBrowsableMetricOpensASensibleScreen() {
        assertEquals(DayTarget.RECOVERY, dayTargetOf(MetricType.RECOVERY_SCORE))
        assertEquals(DayTarget.RECOVERY, dayTargetOf(MetricType.HRV_RMSSD))
        assertEquals(DayTarget.SLEEP, dayTargetOf(MetricType.SLEEP_SCORE))
        assertEquals(DayTarget.STRAIN, dayTargetOf(MetricType.STRAIN_SCORE))
        assertEquals(DayTarget.ACTIVITY, dayTargetOf(MetricType.STEPS))
        assertEquals(DayTarget.ACTIVITY, dayTargetOf(MetricType.SEDENTARY_MINUTES))
        assertEquals(DayTarget.BODY, dayTargetOf(MetricType.WEIGHT))
        assertEquals(DayTarget.STRESS, dayTargetOf(MetricType.STRESS_SCORE))
        assertEquals(DayTarget.FITNESS, dayTargetOf(MetricType.VO2_MAX))
        assertEquals(DayTarget.MONITOR, dayTargetOf(MetricType.SPO2_AVG))
        assertEquals(DayTarget.MONITOR, dayTargetOf(MetricType.SKIN_TEMP_NIGHTLY))
        BROWSABLE_METRICS.forEach { dayTargetOf(it) }
    }

    /** A navigator that records `method:argument` for every call, so the test keeps compiling when the interface grows. */
    private fun recordingNavigator(calls: MutableList<String>): ApexNavigator =
        java.lang.reflect.Proxy.newProxyInstance(
            ApexNavigator::class.java.classLoader,
            arrayOf(ApexNavigator::class.java),
        ) { _, method, args ->
            calls += method.name + ":" + (args?.firstOrNull() ?: "")
            null
        } as ApexNavigator

    @Test fun openingADayTargetCallsTheMatchingNavigatorMethodWithThatDay() {
        val day = LocalDate.of(2027, 1, 10)
        val expected = mapOf(
            DayTarget.RECOVERY to "openRecovery",
            DayTarget.SLEEP to "openSleep",
            DayTarget.STRAIN to "openStrain",
            DayTarget.ACTIVITY to "openActivity",
            DayTarget.BODY to "openBody",
            DayTarget.STRESS to "openStress",
            DayTarget.MONITOR to "openMonitor",
            DayTarget.FITNESS to "openFitness",
        )
        assertEquals(DayTarget.entries.toSet(), expected.keys)
        for ((target, method) in expected) {
            val calls = ArrayList<String>()
            recordingNavigator(calls).openDayTarget(target, day)
            assertEquals(listOf("$method:$day"), calls, target.name)
        }
    }
}
