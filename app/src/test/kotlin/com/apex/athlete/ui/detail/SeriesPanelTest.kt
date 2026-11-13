package com.apex.athlete.ui.detail

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.data.repository.TrendPoint
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.ui.health.TrendLoad
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS", application = android.app.Application::class)
class SeriesPanelTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test fun aSeriesKeepsItsGapsAndCoversTheRangeEndingOnTheEndDay() {
        val trend = testTrend(MetricType.STEPS, listOf(1_000.0, null, 3_000.0))
        val ui = seriesUi(trend, 3, TEST_TODAY, "Steps", testFormatter(context))
        assertEquals(listOf<Double?>(1_000.0, null, 3_000.0), ui.series.points.map { it.y })
        assertEquals(TEST_TODAY - 2, ui.startDay)
        assertEquals(TEST_TODAY, ui.endDay)
        assertEquals("Steps", ui.series.label)
        assertEquals("Measured", ui.provenance)
        assertTrue(ui.hasReadings())
    }

    @Test fun weightFollowsTheUnitSystem() {
        val trend = testTrend(MetricType.WEIGHT, listOf(72.0, null, 70.0))
        val kg = seriesUi(trend, 3, TEST_TODAY, "Weight", testFormatter(context, UnitSystem.METRIC))
        assertEquals(72.0, kg.series.points[0].y!!, 1e-9)
        assertEquals(" kg", kg.series.valueSuffix)
        val lb = seriesUi(trend, 3, TEST_TODAY, "Weight", testFormatter(context, UnitSystem.IMPERIAL))
        assertEquals(72.0 * 2.2046226218, lb.series.points[0].y!!, 1e-6)
        assertNull(lb.series.points[1].y)
        assertEquals(" lb", lb.series.valueSuffix)
    }

    @Test fun anEmptyWindowHasNoReadings() {
        val ui = seriesUi(testTrend(MetricType.STEPS, listOf(null, null)), 2, TEST_TODAY, "Steps", testFormatter(context))
        assertFalse(ui.hasReadings())
    }

    @Test fun theBaselineBandIsOnlyDrawnWhenAskedFor() {
        val values = (1..40).map { 60.0 + it % 5 }
        val trend = testTrend(MetricType.RESTING_HEART_RATE, values)
        val f = testFormatter(context)
        assertNull(seriesUi(trend, 30, TEST_TODAY, "RHR", f, withBand = false).series.baseline)
        val banded = seriesUi(trend, 30, TEST_TODAY, "RHR", f, withBand = true).series.baseline
        assertTrue(banded != null && banded.low < banded.high)
    }

    @Test fun theTrendStatesMapToPanels() {
        val f = testFormatter(context)
        assertEquals(SeriesPanel.Loading, seriesPanel(TrendLoad.Loading, "Steps", f))
        assertEquals(SeriesPanel.Empty, seriesPanel(TrendLoad.Empty, "Steps", f))
        val ready = seriesPanel(TrendLoad.Loaded(testTrend(MetricType.STEPS, listOf(5.0, 6.0)), 2, TEST_TODAY), "Steps", f)
        assertIs<SeriesPanel.Ready>(ready)
    }

    @Test fun aSeriesOfPlainPointsGetsTheRequestedProvenance() {
        val points = listOf(TrendPoint(TEST_TODAY - 1, 45.0), TrendPoint(TEST_TODAY, null))
        val ui = seriesUiOf(MetricType.VO2_MAX, points, TEST_TODAY, 2, "VO2 max", DataProvenance.ESTIMATED, testFormatter(context))
        assertEquals("Estimated", ui.provenance)
        assertEquals(listOf<Double?>(45.0, null), ui.series.points.map { it.y })
        assertEquals(" ml/kg/min", ui.series.valueSuffix)
    }
}
