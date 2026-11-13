package com.apex.athlete.ui.health

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.analytics.baseline.BaselineSpecs
import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.fitness.FitnessAgeBound
import com.apex.athlete.core.analytics.fitness.FitnessAgeMissing
import com.apex.athlete.core.analytics.fitness.FitnessAgeResult
import com.apex.athlete.core.analytics.fitness.FitnessCategory
import com.apex.athlete.core.analytics.fitness.Vo2CategoryMissing
import com.apex.athlete.core.analytics.fitness.Vo2CategoryResult
import com.apex.athlete.core.analytics.trend.MetricTrendAnalyzer
import com.apex.athlete.core.data.pipeline.Vo2MaxReading
import com.apex.athlete.core.data.repository.BodyState
import com.apex.athlete.core.data.repository.FitnessState
import com.apex.athlete.core.data.repository.MetricReading
import com.apex.athlete.core.data.repository.MetricTrend
import com.apex.athlete.core.data.repository.ReadingMissing
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.data.repository.TrendPoint
import com.apex.athlete.core.data.repository.VITALS_METRICS
import com.apex.athlete.core.data.repository.VitalsState
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.ApexFormatter
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.ZoneOffset
import kotlin.math.abs
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS", application = android.app.Application::class)
class HealthSectionsUiTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val now = 1_800_000_000_000L
    private val today = now / 86_400_000L

    private fun formatter(units: UnitSystem = UnitSystem.METRIC) = ApexFormatter(context, units, true, { ZoneOffset.UTC }, { now })

    // --- Body -----------------------------------------------------------------------------------

    private fun reading(metric: MetricType, value: Double?, day: Long?, p: DataProvenance?, missing: ReadingMissing? = null) =
        MetricReading(metric, value, day, p, missing)

    private fun body(
        weight: MetricReading,
        bmi: MetricReading,
        bodyFat: MetricReading = MetricReading.absent(MetricType.BODY_FAT),
        weightHistory: List<TrendPoint> = emptyList(),
        bmiHistory: List<TrendPoint> = emptyList(),
    ) = BodyState(false, today, null, weight, bodyFat, bmi, weightHistory, emptyList(), bmiHistory)

    @Test
    fun bmiNeedsHeightIsUnavailableWithTheProfileHintAndNoNumber() {
        val ui = buildBodyUi(
            body(
                weight = reading(MetricType.WEIGHT, 72.4, today, DataProvenance.USER_REPORTED),
                bmi = MetricReading.absent(MetricType.BMI, ReadingMissing.NEEDS_HEIGHT),
            ),
            formatter(),
        )
        val state = assertIs<MetricState.Unavailable>(ui.bmi.state)
        assertEquals(MetricReason.NO_DATA, state.reason)
        assertEquals("Add your height in Profile to see BMI", state.detail)
        assertTrue(ui.bmiNeedsHeight)
        assertFalse(ui.bmi.hasChart)
        assertFalse(ui.bmi.opensTrend)
    }

    @Test
    fun bmiNeedsWeightHasItsOwnHintAndNoProfileHeightLink() {
        val ui = buildBodyUi(
            body(weight = MetricReading.absent(MetricType.WEIGHT), bmi = MetricReading.absent(MetricType.BMI, ReadingMissing.NEEDS_WEIGHT)),
            formatter(),
        )
        val state = assertIs<MetricState.Unavailable>(ui.bmi.state)
        assertEquals("Add a weigh-in, or your weight in Profile, to see BMI", state.detail)
        assertFalse(ui.bmiNeedsHeight)
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA, null), ui.weight.state)
    }

    @Test
    fun bmiValueIsDerivedWithOneDecimal() {
        val ui = buildBodyUi(
            body(
                weight = reading(MetricType.WEIGHT, 72.4, today, DataProvenance.USER_REPORTED),
                bmi = reading(MetricType.BMI, 22.9, today, DataProvenance.MATHEMATICALLY_DERIVED),
            ),
            formatter(),
        )
        assertEquals(MetricState.Value(22.9, 1, "kg/m²", DataProvenance.MATHEMATICALLY_DERIVED), ui.bmi.state)
        assertFalse(ui.bmiNeedsHeight)
    }

    @Test
    fun weightIsShownInPoundsWhenImperialAndAnOlderWeighInKeepsItsDate() {
        val ui = buildBodyUi(
            body(
                weight = reading(MetricType.WEIGHT, 72.4, today - 1, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API),
                bmi = MetricReading.absent(MetricType.BMI, ReadingMissing.NEEDS_HEIGHT),
                weightHistory = listOf(TrendPoint(today - 1, 72.4), TrendPoint(today, null)),
            ),
            formatter(UnitSystem.IMPERIAL),
        )
        val v = assertIs<MetricState.Value>(ui.weight.state)
        assertTrue(abs(72.4 * 2.2046226218 - v.value) < 1e-9)
        assertEquals("lb", v.unit)
        assertEquals(1, v.decimals)
        assertEquals("Yesterday", v.asOf)
        assertEquals(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, v.provenance)
        // The chart follows the same unit, and the day without a weigh-in stays a gap.
        assertEquals(2, ui.weight.points.size)
        assertEquals(today - 1, ui.weight.points[0].x)
        assertTrue(abs(72.4 * 2.2046226218 - assertNotNull(ui.weight.points[0].y)) < 1e-9)
        assertEquals(ChartPoint(today, null), ui.weight.points[1])
        assertEquals("Measured", ui.weight.provenance)
        assertTrue(ui.weight.opensTrend)
        assertTrue(ui.weight.hasChart)
    }

    @Test
    fun profileWeightIsSelfReportedAndHasNoDate() {
        val ui = buildBodyUi(
            body(
                weight = reading(MetricType.WEIGHT, 70.0, null, DataProvenance.USER_REPORTED),
                bmi = reading(MetricType.BMI, 22.0, null, DataProvenance.MATHEMATICALLY_DERIVED),
            ),
            formatter(),
        )
        assertEquals(MetricState.Value(70.0, 1, "kg", DataProvenance.USER_REPORTED, null), ui.weight.state)
        assertEquals("Self-reported", ui.weight.provenance)
    }

    @Test
    fun missingBodyFatIsUnavailableNotZero() {
        val ui = buildBodyUi(
            body(weight = MetricReading.absent(MetricType.WEIGHT), bmi = MetricReading.absent(MetricType.BMI, ReadingMissing.NEEDS_WEIGHT)),
            formatter(),
        )
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA, null), ui.bodyFat.state)
        assertFalse(ui.bodyFat.hasChart)
    }

    // --- Vitals ---------------------------------------------------------------------------------

    @Test
    fun vitalsListsEveryReadingInOrderAndMissingOnesAreUnavailable() {
        val readings = mapOf(
            MetricType.SKIN_TEMP_NIGHTLY to reading(MetricType.SKIN_TEMP_NIGHTLY, 33.8, today, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API),
            MetricType.HRV_LOW_FREQUENCY to MetricReading(MetricType.HRV_LOW_FREQUENCY, 412.0, today, DataProvenance.IMPORTED_FILE_ARCHIVE, null, 9),
        )
        val ui = buildVitalsUi(VitalsState(false, today, readings), null, formatter())
        assertEquals(VITALS_METRICS, ui.rows.map { it.metric })
        val skin = ui.rows.first { it.metric == MetricType.SKIN_TEMP_NIGHTLY }
        assertEquals(MetricState.Value(33.8, 1, "°C", DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API), skin.state)
        assertNull(skin.average)
        assertNull(skin.sd)
        val lf = ui.rows.first { it.metric == MetricType.HRV_LOW_FREQUENCY }
        assertEquals(MetricState.Value(412.0, 0, "ms²", DataProvenance.IMPORTED_FILE_ARCHIVE), lf.state)
        assertEquals("Night average of 9 samples", lf.sampleNote)
        assertFalse(lf.opensTrend)
        val spo2 = ui.rows.first { it.metric == MetricType.SPO2_LOWER_BOUND }
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA, null), spo2.state)
        assertNull(spo2.sampleNote)
        assertTrue(spo2.opensTrend)
    }

    @Test
    fun nightlySkinTemperatureIsConvertedToFahrenheitWhenImperial() {
        val readings = mapOf(MetricType.SKIN_TEMP_NIGHTLY to reading(MetricType.SKIN_TEMP_NIGHTLY, 33.8, today, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API))
        val ui = buildVitalsUi(VitalsState(false, today, readings), null, formatter(UnitSystem.IMPERIAL))
        val v = assertIs<MetricState.Value>(ui.rows.first { it.metric == MetricType.SKIN_TEMP_NIGHTLY }.state)
        assertTrue(abs(33.8 * 1.8 + 32.0 - v.value) < 1e-9)
        assertEquals("°F", v.unit)
    }

    @Test
    fun vitalsRowCarriesTheBaselineBandWhenTheMetricHasOne() {
        // Alternating 98 and 102 for 30 days: the personal range is centred on 100.
        val values = (1..30).map { DailyValue(today - it, if (it % 2 == 0) 98.0 else 102.0) }
        val intelligence = MetricTrendAnalyzer.analyze(values + DailyValue(today, 100.0), today, BaselineSpecs.GENERIC)
        val trends = TrendIntelligenceState(
            false, today, 14,
            listOf(MetricTrend(MetricType.SPO2_LOWER_BOUND, listOf(TrendPoint(today, 100.0)), intelligence, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)),
        )
        val readings = mapOf(MetricType.SPO2_LOWER_BOUND to reading(MetricType.SPO2_LOWER_BOUND, 100.0, today, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API))
        val row = buildVitalsUi(VitalsState(false, today, readings), trends, formatter()).rows.first { it.metric == MetricType.SPO2_LOWER_BOUND }
        assertTrue(abs(100.0 - assertNotNull(row.average)) < 0.5, "centre was ${row.average}")
        assertTrue(assertNotNull(row.sd) in 1.5..2.5, "half-width was ${row.sd}")
    }

    // --- Cardio fitness -------------------------------------------------------------------------

    private fun fitness(
        vo2: Vo2MaxReading?,
        category: Vo2CategoryResult,
        age: FitnessAgeResult,
    ) = FitnessState(false, today, vo2, category, age, emptyList())

    private val estimate = Vo2MaxReading(47.5, DataProvenance.ESTIMATED, null, "Heart-rate ratio")

    @Test
    fun estimatedVo2WithCategoryAndFitnessAge() {
        val ui = buildCardioUi(
            fitness(
                estimate,
                Vo2CategoryResult(71.4, FitnessCategory.GOOD, false, null),
                FitnessAgeResult(31.2, -4.2, FitnessAgeBound.WITHIN_RANGE, null),
            ),
            formatter(),
        )
        assertTrue(ui.isEstimate)
        assertEquals("Heart-rate ratio", ui.method)
        assertEquals(MetricState.Value(47.5, 1, "ml/kg/min", DataProvenance.ESTIMATED), ui.vo2.state)
        assertEquals(MetricState.Value(71.0, 0, "percentile", DataProvenance.MATHEMATICALLY_DERIVED), ui.category.state)
        assertEquals("Good", ui.category.headline)
        assertEquals("Compared with adults of your age and sex", ui.category.note)
        assertEquals(MetricState.Value(31.0, 0, "years", DataProvenance.MATHEMATICALLY_DERIVED), ui.fitnessAge.state)
        assertNull(ui.fitnessAge.headline)
        assertEquals("4 years younger than your age", ui.fitnessAge.note)
        assertFalse(ui.needsProfile)
    }

    @Test
    fun measuredVo2IsNotLabelledAsAnEstimate() {
        val ui = buildCardioUi(
            fitness(
                Vo2MaxReading(50.0, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, today - 1, null),
                Vo2CategoryResult(null, null, false, Vo2CategoryMissing.SEX_UNSPECIFIED),
                FitnessAgeResult(null, null, null, FitnessAgeMissing.SEX_UNSPECIFIED),
            ),
            formatter(),
        )
        assertFalse(ui.isEstimate)
        assertNull(ui.method)
        assertEquals(
            MetricState.Value(50.0, 1, "ml/kg/min", DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, "Yesterday"),
            ui.vo2.state,
        )
    }

    @Test
    fun missingSexAndAgeShowTheReasonAndLinkToProfile() {
        val ui = buildCardioUi(
            fitness(
                estimate,
                Vo2CategoryResult(null, null, false, Vo2CategoryMissing.SEX_UNSPECIFIED),
                FitnessAgeResult(null, null, null, FitnessAgeMissing.NO_AGE),
            ),
            formatter(),
        )
        assertEquals(
            MetricState.Unavailable(MetricReason.NO_DATA, "Choose your sex in Profile to see this"),
            ui.category.state,
        )
        assertEquals(
            MetricState.Unavailable(MetricReason.NO_DATA, "Add your birth year in Profile to see this"),
            ui.fitnessAge.state,
        )
        assertTrue(ui.category.needsProfile)
        assertTrue(ui.fitnessAge.needsProfile)
        assertTrue(ui.needsProfile)
        assertNull(ui.category.headline)
        // The VO2 max itself is still shown.
        assertIs<MetricState.Value>(ui.vo2.state)
    }

    @Test
    fun noVo2MaxAndAgeOutOfRangeAreNotProfileLinksForTheValueButAgeRangeIsExplained() {
        val none = buildCardioUi(
            fitness(
                null,
                Vo2CategoryResult(null, null, false, Vo2CategoryMissing.NO_VO2MAX),
                FitnessAgeResult(null, null, null, FitnessAgeMissing.NO_VO2MAX),
            ),
            formatter(),
        )
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA, null), none.vo2.state)
        assertFalse(none.isEstimate)
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA, "No cardio fitness reading yet"), none.category.state)
        assertFalse(none.needsProfile)

        val range = buildCardioUi(
            fitness(
                estimate,
                Vo2CategoryResult(null, null, false, Vo2CategoryMissing.AGE_OUT_OF_RANGE),
                FitnessAgeResult(null, null, null, FitnessAgeMissing.AGE_OUT_OF_RANGE),
            ),
            formatter(),
        )
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA, "The reference table covers ages 20 to 79"), range.category.state)
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA, "The reference table covers ages 20 to 79"), range.fitnessAge.state)
        assertFalse(range.needsProfile)
    }

    @Test
    fun tableEdgeAndFitnessAgeBoundsAreWorded() {
        val low = buildCardioUi(
            fitness(
                estimate,
                Vo2CategoryResult(5.0, FitnessCategory.POOR, true, null),
                FitnessAgeResult(20.0, -12.0, FitnessAgeBound.YOUNGER_THAN_RANGE, null),
            ),
            formatter(),
        )
        assertEquals("Poor", low.category.headline)
        assertEquals("At or below the 5th percentile, the lowest the table shows", low.category.note)
        assertEquals("20 or younger", low.fitnessAge.headline)
        assertNull(low.fitnessAge.note)

        val high = buildCardioUi(
            fitness(
                estimate,
                Vo2CategoryResult(95.0, FitnessCategory.SUPERIOR, true, null),
                FitnessAgeResult(80.0, 20.0, FitnessAgeBound.OLDER_THAN_RANGE, null),
            ),
            formatter(),
        )
        assertEquals("Superior", high.category.headline)
        assertEquals("At or above the 95th percentile, the highest the table shows", high.category.note)
        assertEquals("80 or older", high.fitnessAge.headline)

        val older = buildCardioUi(
            fitness(estimate, Vo2CategoryResult(40.0, FitnessCategory.FAIR, false, null), FitnessAgeResult(50.0, 7.6, FitnessAgeBound.WITHIN_RANGE, null)),
            formatter(),
        )
        assertEquals("8 years older than your age", older.fitnessAge.note)
        val same = buildCardioUi(
            fitness(estimate, Vo2CategoryResult(40.0, FitnessCategory.FAIR, false, null), FitnessAgeResult(43.0, 0.2, FitnessAgeBound.WITHIN_RANGE, null)),
            formatter(),
        )
        assertEquals("The same as your age", same.fitnessAge.note)
    }
}
