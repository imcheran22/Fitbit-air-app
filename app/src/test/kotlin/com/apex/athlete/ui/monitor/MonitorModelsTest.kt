package com.apex.athlete.ui.monitor

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.analytics.baseline.BaselineSpecs
import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.trend.MetricIntelligence
import com.apex.athlete.core.analytics.trend.MetricTrendAnalyzer
import com.apex.athlete.core.analytics.trend.RangeStatus
import com.apex.athlete.core.data.repository.MetricReading
import com.apex.athlete.core.data.repository.MetricTrend
import com.apex.athlete.core.data.repository.MonitorItem
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.data.repository.TrendPoint
import com.apex.athlete.core.data.repository.VITALS_METRICS
import com.apex.athlete.core.data.repository.VitalsState
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.MetricStateMapper
import com.apex.athlete.ui.detail.TEST_TODAY
import com.apex.athlete.ui.detail.testFormatter
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
class MonitorModelsTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val sensor = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    private val f get() = testFormatter(context)

    /** 34 prior days around 60 to 62, then [current] on the evaluated day (null = no reading that day). */
    private fun values(current: Double?, prior: Int = 34): List<Double?> = List(prior) { 60.0 + it % 3 } + listOf(current)

    private fun intel(values: List<Double?>): MetricIntelligence {
        val start = TEST_TODAY - values.size + 1
        val daily = values.mapIndexedNotNull { i, v -> v?.let { DailyValue(start + i, it) } }
        return MetricTrendAnalyzer.analyze(daily, TEST_TODAY, BaselineSpecs.GENERIC)
    }

    private fun trendOf(metric: MetricType, values: List<Double?>) = MetricTrend(
        metric,
        values.mapIndexed { i, v -> TrendPoint(TEST_TODAY - values.size + 1 + i, v) },
        intel(values),
        sensor,
    )

    @Test fun everyRangeStatusMapsToOneFlag() {
        assertEquals(RangeFlag.ABOVE, rangeFlagOf(RangeStatus.ABOVE_NORMAL))
        assertEquals(RangeFlag.BELOW, rangeFlagOf(RangeStatus.BELOW_NORMAL))
        assertEquals(RangeFlag.INSIDE, rangeFlagOf(RangeStatus.WITHIN_NORMAL))
        assertEquals(RangeFlag.NONE, rangeFlagOf(RangeStatus.NO_READING))
        assertEquals(RangeFlag.NONE, rangeFlagOf(RangeStatus.CALIBRATING))
        assertNull(RangeFlag.NONE.labelRes)
        assertNotNull(RangeFlag.ABOVE.labelRes)
    }

    @Test fun aReadingAboveTheRangeIsFlaggedAndTheBandIsWritten() {
        val items = listOf(MonitorItem(MetricType.RESTING_HEART_RATE, intel(values(90.0)), sensor))
        val card = buildNightCards(items, MetricStateMapper(f), f).single()
        assertEquals(RangeFlag.ABOVE, card.flag)
        assertTrue(card.opensTrend)
        val band = assertNotNull(card.bandText)
        assertTrue(band.startsWith("Your 30-day range: "), band)
        assertTrue(band.endsWith("bpm"), band)
        assertNotNull(card.average)
        assertNotNull(card.sd)
    }

    @Test fun aReadingBelowAndOneInsideTheRange() {
        val items = listOf(
            MonitorItem(MetricType.HRV_RMSSD, intel(values(30.0)), sensor),
            MonitorItem(MetricType.RESTING_HEART_RATE, intel(values(61.0)), sensor),
        )
        val cards = buildNightCards(items, MetricStateMapper(f), f)
        assertEquals(RangeFlag.BELOW, cards[0].flag)
        assertEquals(RangeFlag.INSIDE, cards[1].flag)
    }

    @Test fun aBaselineStillBeingLearnedHasNoBandAndNoFlag() {
        val items = listOf(MonitorItem(MetricType.RESPIRATORY_RATE, intel(List(3) { 14.0 + it } + listOf(15.0)), sensor))
        val card = buildNightCards(items, MetricStateMapper(f), f).single()
        assertEquals(RangeFlag.NONE, card.flag)
        assertNull(card.bandText)
        assertNull(card.average)
    }

    @Test fun aMissingReadingIsNeverFlaggedAndNeverZero() {
        val items = listOf(MonitorItem(MetricType.SPO2_AVG, intel(values(null)), null))
        val card = buildNightCards(items, MetricStateMapper(f), f).single()
        assertEquals(RangeFlag.NONE, card.flag)
        assertTrue(card.state !is MetricState.Value)
    }

    private fun vitals(vararg readings: MetricReading) =
        VitalsState(false, TEST_TODAY, VITALS_METRICS.associateWith { m -> readings.firstOrNull { it.metric == m } ?: MetricReading.absent(m) })

    @Test fun everyOvernightVitalGetsACardInRepositoryOrder() {
        val cards = buildMoreCards(vitals(), null, f)
        assertEquals(VITALS_METRICS, cards.map { it.metric })
        assertTrue(cards.all { it.flag == RangeFlag.NONE && it.state is MetricState.Unavailable })
    }

    @Test fun aVitalWithAnEstablishedRangeIsFlaggedFromTheTrendIntelligence() {
        val spo2 = MetricReading(MetricType.SPO2_LOWER_BOUND, 80.0, TEST_TODAY, sensor, null)
        val trends = TrendIntelligenceState(false, TEST_TODAY, 30, listOf(trendOf(MetricType.SPO2_LOWER_BOUND, values(80.0))))
        val card = buildMoreCards(vitals(spo2), trends, f).first { it.metric == MetricType.SPO2_LOWER_BOUND }
        assertEquals(RangeFlag.ABOVE, card.flag)
        assertIs<MetricState.Value>(card.state)
    }

    @Test fun aVitalWithoutATrendIsShownWithoutARange() {
        val spo2 = MetricReading(MetricType.SPO2_LOWER_BOUND, 94.0, TEST_TODAY, sensor, null)
        val card = buildMoreCards(vitals(spo2), null, f).first { it.metric == MetricType.SPO2_LOWER_BOUND }
        assertEquals(RangeFlag.NONE, card.flag)
        assertNull(card.bandText)
        assertEquals(MetricState.Value(94.0, 1, "%", sensor), card.state)
    }

    @Test fun nightAverageVitalsNameTheirSampleCount() {
        val lf = MetricReading(MetricType.HRV_LOW_FREQUENCY, 412.0, TEST_TODAY, sensor, null, sampleCount = 9)
        val card = buildMoreCards(vitals(lf), null, f).first { it.metric == MetricType.HRV_LOW_FREQUENCY }
        assertEquals("Night average of 9 samples", card.sampleNote)
        assertEquals(false, card.opensTrend)
    }

    @Test fun theSummaryCountsOutOfRangeReadingsAcrossBothLists() {
        fun card(flag: RangeFlag) = VitalCardUi(
            MetricType.HRV_RMSSD, 0, MetricState.Loading, null, null, 0, com.apex.athlete.core.ui.components.GoodDirection.NEUTRAL, null, flag, null, true,
        )
        assertEquals(MonitorSummary.Loading, monitorSummary(null, null))
        assertEquals(MonitorSummary.Learning, monitorSummary(listOf(card(RangeFlag.NONE)), emptyList()))
        assertEquals(MonitorSummary.AllInside, monitorSummary(listOf(card(RangeFlag.INSIDE)), listOf(card(RangeFlag.NONE))))
        assertEquals(MonitorSummary.Outside(2), monitorSummary(listOf(card(RangeFlag.ABOVE), card(RangeFlag.INSIDE)), listOf(card(RangeFlag.BELOW))))
        // One list loaded is enough to say something; the other fills in later.
        assertEquals(MonitorSummary.Outside(1), monitorSummary(listOf(card(RangeFlag.ABOVE)), null))
    }
}
