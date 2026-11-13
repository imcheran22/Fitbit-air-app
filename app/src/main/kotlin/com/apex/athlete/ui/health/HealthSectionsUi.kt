package com.apex.athlete.ui.health

import androidx.annotation.StringRes
import androidx.compose.runtime.Immutable
import com.apex.athlete.R
import com.apex.athlete.core.analytics.fitness.FitnessAgeBound
import com.apex.athlete.core.analytics.fitness.FitnessAgeMissing
import com.apex.athlete.core.analytics.fitness.FitnessCategory
import com.apex.athlete.core.analytics.fitness.Vo2CategoryMissing
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.repository.BodyState
import com.apex.athlete.core.data.repository.FitnessState
import com.apex.athlete.core.data.repository.MetricReading
import com.apex.athlete.core.data.repository.ReadingMissing
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.data.repository.TrendPoint
import com.apex.athlete.core.data.repository.VITALS_METRICS
import com.apex.athlete.core.data.repository.VitalsState
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.components.GoodDirection
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.ApexFormatter
import java.time.LocalDate
import kotlin.math.roundToInt

/*
 * Body, Vitals and Cardio fitness sections of the Health tab (DESIGN_SYSTEM section 4, Health).
 * Pure mapping from repository states to UI models: no Compose runtime beyond @Immutable. A missing value
 * is Unavailable with a reason, never zero; every value keeps the provenance the repository reported.
 */

/** Days of weight / body fat / BMI history the repository returns for the Body charts. */
const val BODY_CHART_DAYS = 90

/** Metrics that have a trend detail (everything in the repository's trend list). */
val TREND_OPENABLE: Set<MetricType> = AthleteRepository.TREND_METRICS.map { it.first }.toSet()

private fun display(metric: MetricType, f: ApexFormatter): MetricDisplay = displayOf(metric, f)

// --- Body -----------------------------------------------------------------------------------------

@Immutable
data class BodyMetricUi(
    val metric: MetricType,
    @StringRes val titleRes: Int,
    val state: MetricState,
    /** Chart input on the display scale (lb when imperial); gaps are null. Empty of readings means no chart is drawn. */
    val points: List<ChartPoint>,
    val decimals: Int,
    val unit: String,
    val provenance: String,
    val opensTrend: Boolean,
) {
    val hasChart: Boolean get() = points.any { it.y != null }
}

@Immutable
data class BodyUi(
    val weight: BodyMetricUi,
    val bodyFat: BodyMetricUi,
    val bmi: BodyMetricUi,
    val endDay: Long,
    val historyDays: Int,
    /** True when BMI is missing only because the profile has no height: the screen offers a link to Profile. */
    val bmiNeedsHeight: Boolean,
)

/**
 * One stored reading as a [MetricState] on the display scale. A reading from another day than [requestedDay]
 * keeps its date in `asOf`, so an old weigh-in is never passed off as today's.
 */
fun readingState(
    reading: MetricReading,
    display: MetricDisplay,
    requestedDay: Long,
    f: ApexFormatter,
    missingDetail: (ReadingMissing?) -> String? = { null },
): MetricState {
    val raw = reading.value?.takeIf { it.isFinite() }
        ?: return MetricState.Unavailable(MetricReason.NO_DATA, missingDetail(reading.missing))
    val asOf = reading.epochDay?.takeIf { it != requestedDay }?.let { f.dayLabel(LocalDate.ofEpochDay(it)) }
    return MetricState.Value(
        value = display.convert(raw),
        decimals = display.decimals,
        unit = display.unit,
        provenance = reading.provenance,
        asOf = asOf,
    )
}

fun buildBodyUi(s: BodyState, f: ApexFormatter): BodyUi {
    fun metricUi(metric: MetricType, reading: MetricReading, history: List<TrendPoint>, detail: (ReadingMissing?) -> String? = { null }): BodyMetricUi {
        val d = display(metric, f)
        return BodyMetricUi(
            metric = metric,
            titleRes = metricTitleRes(metric),
            state = readingState(reading, d, s.epochDay, f, detail),
            points = chartPoints(history, d),
            decimals = d.decimals,
            unit = d.unit.orEmpty(),
            provenance = provenanceText(reading.provenance, f),
            opensTrend = metric in TREND_OPENABLE,
        )
    }
    return BodyUi(
        weight = metricUi(MetricType.WEIGHT, s.weight, s.weightHistory),
        bodyFat = metricUi(MetricType.BODY_FAT, s.bodyFat, s.bodyFatHistory),
        bmi = metricUi(MetricType.BMI, s.bmi, s.bmiHistory) { missing ->
            when (missing) {
                ReadingMissing.NEEDS_HEIGHT -> f.string(R.string.health_bmi_needs_height)
                ReadingMissing.NEEDS_WEIGHT -> f.string(R.string.health_bmi_needs_weight)
                ReadingMissing.NO_DATA, null -> null
            }
        },
        endDay = s.epochDay,
        historyDays = BODY_CHART_DAYS,
        bmiNeedsHeight = s.bmi.value == null && s.bmi.missing == ReadingMissing.NEEDS_HEIGHT,
    )
}

// --- Vitals ---------------------------------------------------------------------------------------

@Immutable
data class VitalRowUi(
    val metric: MetricType,
    @StringRes val titleRes: Int,
    val state: MetricState,
    /** The personal normal range (centre and half-width) on the display scale; null until the baseline exists. */
    val average: Double?,
    val sd: Double?,
    val decimals: Int,
    val good: GoodDirection,
    val opensTrend: Boolean,
    /** "Night average of 12 samples" where the value is a mean of raw samples. */
    val sampleNote: String?,
)

@Immutable
data class VitalsUi(val rows: List<VitalRowUi>)

/**
 * Every reading in [VITALS_METRICS] in order. The baseline band comes from the trend analysis when the metric has
 * one (the two frequency-band HRV values do not), so a row without a band simply shows no arrow.
 */
fun buildVitalsUi(s: VitalsState, trends: TrendIntelligenceState?, f: ApexFormatter): VitalsUi =
    VitalsUi(
        VITALS_METRICS.map { metric ->
            val reading = s.readings[metric] ?: MetricReading.absent(metric)
            val d = display(metric, f)
            val band = trends?.trends?.firstOrNull { it.metric == metric }?.let { baselineBand(it.intelligence.baseline, d) }
            val centre = trends?.trends?.firstOrNull { it.metric == metric }?.intelligence?.baseline?.center
            VitalRowUi(
                metric = metric,
                titleRes = metricTitleRes(metric),
                state = readingState(reading, d, s.epochDay, f),
                average = centre?.takeIf { band != null && it.isFinite() }?.let(d.convert),
                sd = band?.let { (it.high - it.low) / 2.0 },
                decimals = d.decimals,
                good = goodDirectionOf(metric),
                opensTrend = metric in TREND_OPENABLE,
                sampleNote = reading.sampleCount?.takeIf { reading.value != null && it > 0 }
                    ?.let { f.string(R.string.health_vitals_samples, it) },
            )
        },
    )

// --- Cardio fitness -------------------------------------------------------------------------------

/** One line of the Cardio fitness card: a [state] (a number or a reason) and optional words that qualify it. */
@Immutable
data class CardioLineUi(
    @StringRes val titleRes: Int,
    val state: MetricState,
    /** Words that go with the number, for example "Good" or "27 or younger". Null when there is no value. */
    val headline: String?,
    val note: String?,
    /** True when the reason is something the owner fixes in Profile (age or sex). */
    val needsProfile: Boolean,
)

@Immutable
data class CardioUi(
    val vo2: CardioLineUi,
    val isEstimate: Boolean,
    val method: String?,
    val category: CardioLineUi,
    val fitnessAge: CardioLineUi,
) {
    /** The Profile link is shown once when either line needs it. */
    val needsProfile: Boolean get() = category.needsProfile || fitnessAge.needsProfile
}

@StringRes
private fun categoryRes(c: FitnessCategory): Int = when (c) {
    FitnessCategory.POOR -> R.string.health_cardio_cat_poor
    FitnessCategory.FAIR -> R.string.health_cardio_cat_fair
    FitnessCategory.GOOD -> R.string.health_cardio_cat_good
    FitnessCategory.EXCELLENT -> R.string.health_cardio_cat_excellent
    FitnessCategory.SUPERIOR -> R.string.health_cardio_cat_superior
}

@StringRes
private fun categoryMissingRes(m: Vo2CategoryMissing?): Int = when (m) {
    Vo2CategoryMissing.NO_AGE -> R.string.health_cardio_needs_age
    Vo2CategoryMissing.SEX_UNSPECIFIED -> R.string.health_cardio_needs_sex
    Vo2CategoryMissing.AGE_OUT_OF_RANGE -> R.string.health_cardio_age_range
    Vo2CategoryMissing.INVALID_INPUT -> R.string.health_cardio_invalid
    Vo2CategoryMissing.NO_VO2MAX, null -> R.string.health_cardio_no_vo2
}

@StringRes
private fun ageMissingRes(m: FitnessAgeMissing?): Int = when (m) {
    FitnessAgeMissing.NO_AGE -> R.string.health_cardio_needs_age
    FitnessAgeMissing.SEX_UNSPECIFIED -> R.string.health_cardio_needs_sex
    FitnessAgeMissing.AGE_OUT_OF_RANGE -> R.string.health_cardio_age_range
    FitnessAgeMissing.INVALID_INPUT -> R.string.health_cardio_invalid
    FitnessAgeMissing.NO_VO2MAX, null -> R.string.health_cardio_no_vo2
}

private fun categoryNeedsProfile(m: Vo2CategoryMissing?): Boolean =
    m == Vo2CategoryMissing.NO_AGE || m == Vo2CategoryMissing.SEX_UNSPECIFIED

private fun ageNeedsProfile(m: FitnessAgeMissing?): Boolean =
    m == FitnessAgeMissing.NO_AGE || m == FitnessAgeMissing.SEX_UNSPECIFIED

fun buildCardioUi(s: FitnessState, f: ApexFormatter): CardioUi {
    val vo2Display = display(MetricType.VO2_MAX, f)
    val reading = s.vo2Max
    val vo2State: MetricState = if (reading == null || !reading.value.isFinite()) {
        MetricState.Unavailable(MetricReason.NO_DATA)
    } else {
        MetricState.Value(
            value = reading.value,
            decimals = vo2Display.decimals,
            unit = vo2Display.unit,
            provenance = reading.provenance,
            asOf = reading.epochDay?.takeIf { it != s.epochDay }?.let { f.dayLabel(LocalDate.ofEpochDay(it)) },
        )
    }
    val derived = DataProvenance.MATHEMATICALLY_DERIVED

    val c = s.category
    val categoryLabel = c.category?.let { f.string(categoryRes(it)) }
    val percentile = c.percentile?.takeIf { it.isFinite() }
    val category = if (categoryLabel != null && percentile != null) {
        val rounded = percentile.roundToInt()
        CardioLineUi(
            titleRes = R.string.health_cardio_category,
            state = MetricState.Value(rounded.toDouble(), 0, f.string(R.string.health_cardio_percentile_unit), derived),
            headline = categoryLabel,
            note = when {
                c.atTableEdge && rounded <= 5 -> f.string(R.string.health_cardio_edge_low)
                c.atTableEdge && rounded >= 95 -> f.string(R.string.health_cardio_edge_high)
                else -> f.string(R.string.health_cardio_percentile_note)
            },
            needsProfile = false,
        )
    } else {
        CardioLineUi(
            titleRes = R.string.health_cardio_category,
            state = MetricState.Unavailable(MetricReason.NO_DATA, f.string(categoryMissingRes(c.missing))),
            headline = null,
            note = null,
            needsProfile = categoryNeedsProfile(c.missing),
        )
    }

    val a = s.fitnessAge
    val years = a.fitnessAgeYears?.takeIf { it.isFinite() }
    val age = if (years != null) {
        val whole = years.roundToInt()
        val diff = a.differenceYears?.takeIf { it.isFinite() }?.roundToInt()
        CardioLineUi(
            titleRes = R.string.health_cardio_age,
            state = MetricState.Value(whole.toDouble(), 0, f.string(R.string.health_cardio_age_unit), derived),
            headline = when (a.bound) {
                FitnessAgeBound.YOUNGER_THAN_RANGE -> f.string(R.string.health_cardio_age_or_younger, whole)
                FitnessAgeBound.OLDER_THAN_RANGE -> f.string(R.string.health_cardio_age_or_older, whole)
                FitnessAgeBound.WITHIN_RANGE, null -> null
            },
            note = when {
                a.bound == FitnessAgeBound.YOUNGER_THAN_RANGE || a.bound == FitnessAgeBound.OLDER_THAN_RANGE -> null
                diff == null -> null
                diff < 0 -> f.string(R.string.health_cardio_age_younger, -diff)
                diff > 0 -> f.string(R.string.health_cardio_age_older, diff)
                else -> f.string(R.string.health_cardio_age_same)
            },
            needsProfile = false,
        )
    } else {
        CardioLineUi(
            titleRes = R.string.health_cardio_age,
            state = MetricState.Unavailable(MetricReason.NO_DATA, f.string(ageMissingRes(a.missing))),
            headline = null,
            note = null,
            needsProfile = ageNeedsProfile(a.missing),
        )
    }

    return CardioUi(
        vo2 = CardioLineUi(R.string.health_metric_vo2, vo2State, null, null, false),
        isEstimate = reading?.provenance == DataProvenance.ESTIMATED,
        method = reading?.method,
        category = category,
        fitnessAge = age,
    )
}
