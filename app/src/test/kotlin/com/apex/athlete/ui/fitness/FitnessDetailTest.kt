package com.apex.athlete.ui.fitness

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.analytics.fitness.FitnessAgeMissing
import com.apex.athlete.core.analytics.fitness.FitnessAgeResult
import com.apex.athlete.core.analytics.fitness.Vo2CategoryMissing
import com.apex.athlete.core.analytics.fitness.Vo2CategoryResult
import com.apex.athlete.core.data.pipeline.Vo2MaxReading
import com.apex.athlete.core.data.repository.FitnessState
import com.apex.athlete.core.data.repository.TrendPoint
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.detail.TEST_TODAY
import com.apex.athlete.ui.detail.testFormatter
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS", application = android.app.Application::class)
class FitnessDetailTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun history(vararg values: Double?): List<TrendPoint> =
        values.mapIndexed { i, v -> TrendPoint(TEST_TODAY - values.size + 1 + i, v) }

    private fun state(
        vo2: Vo2MaxReading?,
        history: List<TrendPoint>,
        category: Vo2CategoryResult = Vo2CategoryResult(null, null, false, Vo2CategoryMissing.SEX_UNSPECIFIED),
        age: FitnessAgeResult = FitnessAgeResult(null, null, null, FitnessAgeMissing.SEX_UNSPECIFIED),
    ) = FitnessState(false, TEST_TODAY, vo2, category, age, history)

    @Test fun anEstimatedVo2IsLabelledAnEstimateWithItsMethod() {
        val ui = buildFitnessDetail(
            state(Vo2MaxReading(47.5, DataProvenance.ESTIMATED, TEST_TODAY, "Heart-rate ratio"), history(46.0, null, 47.5)),
            testFormatter(context),
        )
        assertTrue(ui.cardio.isEstimate)
        assertEquals("Heart-rate ratio", ui.cardio.method)
        assertEquals(MetricState.Value(47.5, 1, "ml/kg/min", DataProvenance.ESTIMATED), ui.cardio.vo2.state)
    }

    @Test fun aMeasuredVo2IsNotCalledAnEstimate() {
        val ui = buildFitnessDetail(
            state(Vo2MaxReading(50.0, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, TEST_TODAY, null), history(50.0)),
            testFormatter(context),
        )
        assertFalse(ui.cardio.isEstimate)
    }

    @Test fun theTrendIsTheVo2HistoryWithItsGapsAndSource() {
        val ui = buildFitnessDetail(
            state(Vo2MaxReading(47.5, DataProvenance.ESTIMATED, TEST_TODAY, null), history(46.0, null, 47.5)),
            testFormatter(context),
        )
        val trend = assertNotNull(ui.trend)
        assertEquals(listOf<Double?>(46.0, null, 47.5), trend.series.points.map { it.y })
        assertEquals(TEST_TODAY - 89, trend.startDay)
        assertEquals("Estimated", trend.provenance)
    }

    @Test fun withoutAnyVo2ThereIsNoTrendAndNoNumber() {
        val ui = buildFitnessDetail(state(null, history(null, null)), testFormatter(context))
        assertNull(ui.trend)
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA), ui.cardio.vo2.state)
        assertFalse(ui.cardio.isEstimate)
    }

    @Test fun aMissingSexOffersTheProfileLinkForCategoryAndAge() {
        val ui = buildFitnessDetail(
            state(Vo2MaxReading(47.5, DataProvenance.ESTIMATED, TEST_TODAY, null), history(47.5)),
            testFormatter(context),
        )
        assertTrue(ui.cardio.needsProfile)
        val category = assertIs<MetricState.Unavailable>(ui.cardio.category.state)
        assertEquals(MetricReason.NO_DATA, category.reason)
    }
}
