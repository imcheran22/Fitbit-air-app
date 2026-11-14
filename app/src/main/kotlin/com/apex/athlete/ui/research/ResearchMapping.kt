package com.apex.athlete.ui.research

import androidx.annotation.StringRes
import androidx.compose.runtime.Immutable
import com.apex.athlete.R
import com.apex.athlete.core.analytics.baseline.DualBaseline
import com.apex.athlete.core.analytics.research.ConfidenceLevel
import com.apex.athlete.core.analytics.research.Deviation
import com.apex.athlete.core.analytics.research.PatternMatch
import com.apex.athlete.core.analytics.research.SwcStatus
import com.apex.athlete.core.data.pipeline.ActivityResearchMissing
import com.apex.athlete.core.data.pipeline.ResearchInsights
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import kotlin.math.abs
import kotlin.math.roundToInt

/*
 * Research metrics as MetricState rows (docs/RESEARCH_GAP_MATRIX.md). Pure mapping, no Compose. Every figure is
 * MATHEMATICALLY_DERIVED; a missing input is Unavailable or Calibrating, never 0. All wording is descriptive
 * ("different from your usual"), never diagnostic.
 */

private val DERIVED = DataProvenance.MATHEMATICALLY_DERIVED

/** A derived number, or Unavailable when it is missing or not finite. */
fun derivedState(value: Double?, decimals: Int, unit: String?): MetricState =
    if (value == null || !value.isFinite()) {
        MetricState.Unavailable(MetricReason.NO_DATA)
    } else {
        MetricState.Value(value, decimals, unit, DERIVED)
    }

// --- Usual vs average -------------------------------------------------------------------------------

/** How far today sits from the usual, in words. */
enum class VsUsualWord { ABOUT_USUAL, SOMEWHAT_HIGHER, MUCH_HIGHER, SOMEWHAT_LOWER, MUCH_LOWER }

/** Robust z below this is "about usual"; below [MUCH_Z] "somewhat"; beyond it "much". Calibration choices, not clinical limits. */
const val ABOUT_USUAL_Z = 1.0
const val MUCH_Z = 2.0

fun vsUsualWordOf(robustZ: Double?): VsUsualWord? {
    if (robustZ == null || !robustZ.isFinite()) return null
    val size = abs(robustZ)
    return when {
        size < ABOUT_USUAL_Z -> VsUsualWord.ABOUT_USUAL
        size < MUCH_Z -> if (robustZ > 0) VsUsualWord.SOMEWHAT_HIGHER else VsUsualWord.SOMEWHAT_LOWER
        else -> if (robustZ > 0) VsUsualWord.MUCH_HIGHER else VsUsualWord.MUCH_LOWER
    }
}

@StringRes
fun vsUsualWordRes(word: VsUsualWord): Int = when (word) {
    VsUsualWord.ABOUT_USUAL -> R.string.research_vs_about
    VsUsualWord.SOMEWHAT_HIGHER -> R.string.research_vs_somewhat_higher
    VsUsualWord.MUCH_HIGHER -> R.string.research_vs_much_higher
    VsUsualWord.SOMEWHAT_LOWER -> R.string.research_vs_somewhat_lower
    VsUsualWord.MUCH_LOWER -> R.string.research_vs_much_lower
}

/** [usual] is the median, [average] the mean; [today] says how unusual today's reading is (null without one). */
@Immutable
data class UsualRowUi(val metric: MetricType, val usual: MetricState, val average: MetricState, val today: VsUsualWord?)

/**
 * No baseline at all is Unavailable. A baseline that exists but has not matured (no median yet, or no mean yet) is
 * Calibrating for that figure.
 */
fun usualRow(
    metric: MetricType,
    decimals: Int,
    unit: String?,
    hasBaseline: Boolean,
    usual: Double?,
    average: Double?,
    robustZ: Double?,
): UsualRowUi {
    fun figure(v: Double?): MetricState = when {
        !hasBaseline -> MetricState.Unavailable(MetricReason.NO_DATA)
        v == null || !v.isFinite() -> MetricState.Calibrating(null)
        else -> MetricState.Value(v, decimals, unit, DERIVED)
    }
    return UsualRowUi(metric, figure(usual), figure(average), if (hasBaseline) vsUsualWordOf(robustZ) else null)
}

fun usualRow(metric: MetricType, decimals: Int, unit: String?, dual: DualBaseline?): UsualRowUi =
    usualRow(metric, decimals, unit, dual != null, dual?.usual, dual?.average, dual?.robustZ)

@Immutable
data class HrvStabilityUi(
    /** CV of ln RMSSD over the last 7 nights, percent. */
    val cv: MetricState,
    val swc: SwcStatus?,
    /** 7-night average against the baseline, percent (signed). */
    val percentFromBaseline: MetricState,
)

@Immutable
data class RecoveryResearchUi(val rows: List<UsualRowUi>, val hrv: HrvStabilityUi)

fun recoveryResearchOf(r: ResearchInsights): RecoveryResearchUi = RecoveryResearchUi(
    rows = listOf(
        usualRow(MetricType.HRV_RMSSD, 0, "ms", r.hrvDual),
        usualRow(MetricType.RESTING_HEART_RATE, 0, "bpm", r.restingHeartRateDual),
        usualRow(MetricType.SLEEPING_HEART_RATE, 0, "bpm", r.sleepingHeartRateDual),
        usualRow(MetricType.RESPIRATORY_RATE, 1, "br/min", r.respiratoryRateDual),
    ),
    hrv = HrvStabilityUi(
        cv = derivedState(r.hrvCv7LnPercent, 1, "%"),
        swc = r.hrvSwc,
        percentFromBaseline = derivedState(r.hrvPercentFromBaseline, 1, "%"),
    ),
)

@StringRes
fun swcRes(status: SwcStatus): Int = when (status) {
    SwcStatus.WITHIN_BAND -> R.string.research_swc_within
    SwcStatus.ABOVE_BAND -> R.string.research_swc_above
    SwcStatus.BELOW_BAND -> R.string.research_swc_below
}

// --- Sleep ------------------------------------------------------------------------------------------

@Immutable
data class SleepResearchUi(
    /** Clipped shortfall against 7 h over the last 7 nights, hours. */
    val shortfall: MetricState,
    /** Nights of the 7 without a sleep session; they add nothing, so the shortfall may be understated. */
    val shortfallMissingNights: Int,
    /** Midpoint of the night as local minutes after midnight, or null. */
    val midpointMinute: Int?,
    val midpointSd: MetricState,
    val midpointSdNights: Int?,
    val waso: MetricState,
    val awakeningsPerHour: MetricState,
)

private const val MINUTES_PER_DAY = 1440

fun sleepResearchOf(r: ResearchInsights): SleepResearchUi {
    val s = r.guidelineShortfall
    val sd = r.sleepMidpointSd7
    return SleepResearchUi(
        shortfall = derivedState(s?.clippedMinutes?.div(60.0), 1, "h"),
        shortfallMissingNights = s?.missingNights ?: 0,
        midpointMinute = r.sleepMidpointMinuteOfDay?.takeIf { it.isFinite() }
            ?.roundToInt()?.let { Math.floorMod(it, MINUTES_PER_DAY) },
        midpointSd = derivedState(sd?.sdMinutes, 0, "min"),
        midpointSdNights = sd?.nights,
        waso = derivedState(r.wasoMinutes, 0, "min"),
        awakeningsPerHour = derivedState(r.awakeningsPerHour, 1, "/h"),
    )
}

// --- Activity ---------------------------------------------------------------------------------------

@Immutable
data class ActivityResearchUi(
    val sedentary: MetricState,
    val prolongedBouts: MetricState,
    val longestBout: MetricState,
    val breaksPerHour: MetricState,
    val peakCadence: MetricState,
    /** Prolonged-bout length in minutes, for the caption; null without a day. */
    val boutThresholdMinutes: Int?,
    /** Set when the day's minute metrics are missing: why. Every state above is then Unavailable. */
    @StringRes val missingRes: Int?,
)

@StringRes
fun activityMissingRes(reason: ActivityResearchMissing): Int = when (reason) {
    ActivityResearchMissing.DAY_NOT_COMPLETE -> R.string.research_activity_missing_day
    ActivityResearchMissing.NO_STEP_DATA -> R.string.research_activity_missing_steps
    ActivityResearchMissing.COARSE_STEP_DATA -> R.string.research_activity_missing_coarse
    ActivityResearchMissing.TOO_FEW_MINUTES -> R.string.research_activity_missing_few
}

fun activityResearchOf(r: ResearchInsights): ActivityResearchUi {
    val missing = r.activityMissing
    val day = r.sedentary
    if (missing != null) {
        val none = MetricState.Unavailable(MetricReason.NO_DATA)
        return ActivityResearchUi(none, none, none, none, none, null, activityMissingRes(missing))
    }
    val bouts = day?.bouts
    return ActivityResearchUi(
        sedentary = derivedState(bouts?.totalMinutes, 0, "min"),
        prolongedBouts = derivedState(bouts?.prolongedCount?.toDouble(), 0, null),
        longestBout = derivedState(bouts?.longestMinutes, 0, "min"),
        breaksPerHour = derivedState(day?.breaksPerSedentaryHour, 1, "/h"),
        peakCadence = derivedState(r.peakCadence30, 0, "steps/min"),
        boutThresholdMinutes = bouts?.thresholdMinutes?.roundToInt(),
        missingRes = null,
    )
}

// --- Patterns ---------------------------------------------------------------------------------------

@Immutable
data class PatternSignalUi(val label: String, val deviation: Deviation)

/**
 * One detected pattern. [title], [message] and the signal labels come from :core:analytics and are English only; the
 * message is always hedged ("may indicate ... This is not a diagnosis.").
 */
@Immutable
data class PatternUi(
    val id: String,
    val title: String,
    val message: String,
    val signals: List<PatternSignalUi>,
    val confidence: ConfidenceLevel?,
    /** True when data quality or a tag suppressed alerts: the pattern is still shown, but quietly. */
    val quiet: Boolean,
)

/** Detected patterns only; none detected is an empty list and the card is not drawn. */
fun patternsOf(r: ResearchInsights): List<PatternUi> = r.patterns.mapNotNull { match -> patternUi(match, r.dataConfidence?.level) }

private fun patternUi(match: PatternMatch, confidence: ConfidenceLevel?): PatternUi? {
    val message = match.message ?: return null
    return PatternUi(
        id = match.spec.id,
        title = match.spec.title,
        message = message,
        signals = (match.contributing + match.supporting).map { PatternSignalUi(it.signal.label, it.rule.deviation) },
        confidence = confidence,
        quiet = !match.alertAllowed || match.lowProminence,
    )
}

@StringRes
fun deviationRes(d: Deviation): Int = when (d) {
    Deviation.HIGHER -> R.string.research_dev_higher
    Deviation.LOWER -> R.string.research_dev_lower
    Deviation.STABLE -> R.string.research_dev_stable
}

@StringRes
fun confidenceRes(level: ConfidenceLevel): Int = when (level) {
    ConfidenceLevel.HIGH -> R.string.research_confidence_high
    ConfidenceLevel.MODERATE -> R.string.research_confidence_moderate
    ConfidenceLevel.LOW -> R.string.research_confidence_low
}
