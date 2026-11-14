package com.apex.athlete.ui.recovery

import com.apex.athlete.core.analytics.baseline.Baseline
import com.apex.athlete.core.analytics.recovery.FatigueAssessment
import com.apex.athlete.core.analytics.recovery.RecoveryComponent
import com.apex.athlete.core.analytics.recovery.RecoveryResult
import com.apex.athlete.core.analytics.recovery.RecoveryStatus
import com.apex.athlete.core.analytics.trend.MetricIntelligence
import com.apex.athlete.core.analytics.trend.WeeklyHrvState
import com.apex.athlete.core.analytics.trend.WeeklyHrvStatus
import com.apex.athlete.core.analytics.trend.WeeklyHrvStatusAnalyzer
import com.apex.athlete.core.data.pipeline.DayAnalysis
import com.apex.athlete.core.data.repository.RecoveryDetailState
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.components.GoodDirection
import com.apex.athlete.core.data.pipeline.ResearchInsights
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.MetricStateMapper
import com.apex.athlete.ui.research.RecoveryResearchUi
import com.apex.athlete.ui.research.recoveryResearchOf

/** One KeyStatRow: today's state against the personal 30-day centre. The sd is half the normal range, on the raw scale. */
data class RecoveryStatUi(
    val metric: MetricType,
    val state: MetricState,
    val average: Double?,
    val averageDecimals: Int,
    val sd: Double?,
    val goodDirection: GoodDirection,
)

/** What the insight card says. Copy is chosen in the composable; this carries only the facts. */
sealed interface RecoveryInsight {
    data class Raised(val component: RecoveryComponent) : RecoveryInsight
    data class Lowered(val component: RecoveryComponent) : RecoveryInsight
    data object Balanced : RecoveryInsight
    data object Calibrating : RecoveryInsight
    data object Unavailable : RecoveryInsight
}

data class RecoveryDriverUi(val component: RecoveryComponent, val points: Double)

data class CalibrationItem(val metric: MetricType, val validDays: Int, val requiredDays: Int)

sealed interface FatigueUi {
    /** No HRV and no resting heart rate for the day: there is nothing to judge. */
    data object NoData : FatigueUi
    data class Assessed(val assessment: FatigueAssessment) : FatigueUi
}

data class RecoveryUi(
    val recovery: MetricState,
    val stats: List<RecoveryStatUi>,
    val insight: RecoveryInsight,
    val fatigue: FatigueUi,
    val weeklyHrv: WeeklyHrvUi,
    val calibration: List<CalibrationItem>,
    val drivers: List<RecoveryDriverUi>,
    /** Usual (median) vs average (mean) for HRV, resting and sleeping heart rate and breathing, plus HRV stability. */
    val research: RecoveryResearchUi = recoveryResearchOf(ResearchInsights.EMPTY),
)

/** Smallest recovery impact (in points) that counts as having moved the score. */
internal const val MIN_DRIVER_POINTS = 0.5

/** Half the width of the normal range, back on the raw scale; null while the range is not established. */
fun normalHalfWidth(baseline: Baseline): Double? {
    val lo = baseline.lowerNormal ?: return null
    val hi = baseline.upperNormal ?: return null
    return ((hi - lo) / 2.0).takeIf { it.isFinite() && it > 0.0 }
}

/** Available inputs only; an input without data never appears as a zero-point driver. */
fun driversOf(result: RecoveryResult): List<RecoveryDriverUi> =
    result.contributions
        .filter { it.available && it.impact.isFinite() }
        .map { RecoveryDriverUi(it.component, it.impact) }

fun insightOf(result: RecoveryResult): RecoveryInsight = when (result.status) {
    RecoveryStatus.CALIBRATING -> RecoveryInsight.Calibrating
    RecoveryStatus.UNAVAILABLE -> RecoveryInsight.Unavailable
    RecoveryStatus.SCORED -> {
        val up = result.positiveContributors.firstOrNull()
        val down = result.negativeContributors.firstOrNull()
        val upPoints = up?.impact ?: 0.0
        val downPoints = down?.let { -it.impact } ?: 0.0
        when {
            up != null && upPoints >= downPoints && upPoints >= MIN_DRIVER_POINTS -> RecoveryInsight.Raised(up.component)
            down != null && downPoints > upPoints && downPoints >= MIN_DRIVER_POINTS -> RecoveryInsight.Lowered(down.component)
            else -> RecoveryInsight.Balanced
        }
    }
}

/** No autonomic signal to judge fatigue from is NoData ("not evaluable"), never "no fatigue". */
fun fatigueOf(a: DayAnalysis): FatigueUi = fatigueUiOf(a.fatigueEvaluable, a.fatigue)

fun fatigueUiOf(evaluable: Boolean, assessment: FatigueAssessment): FatigueUi =
    if (!evaluable) FatigueUi.NoData else FatigueUi.Assessed(assessment)

/** The wording of the week's HRV status; copy is chosen in the composable. */
enum class HrvWeekLabel { Balanced, Below, MarkedlyBelow, Above }

/**
 * The weekly HRV status row. [label] is set only when the engine judged the week; [state] is then the week's average
 * (geometric mean, ms). While the baseline fills in it is Calibrating, and without enough recent nights Unavailable.
 */
data class WeeklyHrvUi(
    val label: HrvWeekLabel?,
    val state: MetricState,
    val rangeLow: Double?,
    val rangeHigh: Double?,
)

fun weeklyHrvOf(status: WeeklyHrvStatus?): WeeklyHrvUi {
    if (status == null) return WeeklyHrvUi(null, MetricState.Unavailable(MetricReason.NO_HRV_LAST_NIGHT), null, null)
    val label = when (status.state) {
        WeeklyHrvState.WITHIN_RANGE -> HrvWeekLabel.Balanced
        WeeklyHrvState.ABOVE_RANGE -> HrvWeekLabel.Above
        WeeklyHrvState.BELOW_RANGE -> HrvWeekLabel.Below
        WeeklyHrvState.MARKEDLY_BELOW -> HrvWeekLabel.MarkedlyBelow
        WeeklyHrvState.BASELINE_BUILDING -> {
            val left = (WeeklyHrvStatusAnalyzer.MIN_BASELINE_NIGHTS - status.baselineNights).coerceAtLeast(0).takeIf { it > 0 }
            return WeeklyHrvUi(null, MetricState.Calibrating(left), null, null)
        }
        WeeklyHrvState.NO_RECENT_NIGHTS ->
            return WeeklyHrvUi(null, MetricState.Unavailable(MetricReason.NO_HRV_LAST_NIGHT), null, null)
    }
    val average = status.weekAverage?.takeIf { it.isFinite() }
        ?: return WeeklyHrvUi(null, MetricState.Unavailable(MetricReason.NO_HRV_LAST_NIGHT), null, null)
    return WeeklyHrvUi(
        label = label,
        state = MetricState.Value(average, 0, "ms", DataProvenance.MATHEMATICALLY_DERIVED),
        rangeLow = status.rangeLow?.takeIf { it.isFinite() },
        rangeHigh = status.rangeHigh?.takeIf { it.isFinite() },
    )
}

/** Baselines still filling in, for the calibration card. Established baselines are left out. */
fun calibrationOf(a: DayAnalysis): List<CalibrationItem> = listOf(
    MetricType.HRV_RMSSD to a.hrv,
    a.restingHeartRateMetric to a.restingHeartRate,
    MetricType.RESPIRATORY_RATE to a.respiratoryRate,
).mapNotNull { (metric, i) -> calibrationItem(metric, i) }

private fun calibrationItem(metric: MetricType, i: MetricIntelligence): CalibrationItem? {
    val b = i.baseline
    if (b.isEstablished) return null
    return CalibrationItem(metric, b.validDays, b.requiredDays)
}

/** Builds everything the screen shows. All numbers go through [MetricStateMapper]. */
fun buildRecoveryUi(detail: RecoveryDetailState, mapper: MetricStateMapper): RecoveryUi {
    val a = detail.analysis
    val rhrMetric = a.restingHeartRateMetric
    val stats = listOf(
        RecoveryStatUi(
            MetricType.HRV_RMSSD,
            mapper.intelligence(a.hrv, MetricType.HRV_RMSSD, a.provenance[MetricType.HRV_RMSSD]),
            a.hrv.baseline.center, 0, normalHalfWidth(a.hrv.baseline), GoodDirection.UP,
        ),
        RecoveryStatUi(
            rhrMetric,
            mapper.intelligence(a.restingHeartRate, rhrMetric, a.provenance[rhrMetric]),
            a.restingHeartRate.baseline.center, 0, normalHalfWidth(a.restingHeartRate.baseline), GoodDirection.DOWN,
        ),
        RecoveryStatUi(
            MetricType.RESPIRATORY_RATE,
            mapper.intelligence(a.respiratoryRate, MetricType.RESPIRATORY_RATE, a.provenance[MetricType.RESPIRATORY_RATE]),
            a.respiratoryRate.baseline.center, 1, normalHalfWidth(a.respiratoryRate.baseline), GoodDirection.NEUTRAL,
        ),
        // The pipeline keeps no 30-day sleep-score baseline, so this row has no comparison and no arrow.
        RecoveryStatUi(MetricType.SLEEP_SCORE, mapper.sleep(a), null, 0, null, GoodDirection.UP),
    )
    return RecoveryUi(
        recovery = mapper.recovery(a),
        stats = stats,
        insight = insightOf(a.recovery),
        fatigue = fatigueOf(a),
        weeklyHrv = weeklyHrvOf(a.weeklyHrvStatus),
        calibration = calibrationOf(a),
        drivers = driversOf(a.recovery),
        research = recoveryResearchOf(a.research),
    )
}
