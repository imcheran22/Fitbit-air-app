package com.apex.athlete.core.analytics.baseline

import com.apex.athlete.core.analytics.stats.Stats
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln

/** One reading for one civil day. [epochDay] is days since 1970-01-01 in the user's local calendar. */
data class DailyValue(val epochDay: Long, val value: Double)

/** Scale on which a metric is averaged and compared. */
enum class ValueTransform {
    IDENTITY,

    /**
     * Natural logarithm. Used for HRV: RMSSD is right-skewed, and its day-to-day changes are
     * proportional rather than additive, so baselines are computed on ln(RMSSD).
     */
    NATURAL_LOG;

    fun isValid(x: Double): Boolean = x.isFinite() && (this == IDENTITY || x > 0.0)
    fun apply(x: Double): Double = if (this == NATURAL_LOG) ln(x) else x
    fun invert(y: Double): Double = if (this == NATURAL_LOG) exp(y) else y
}

/** How the personal baseline of one metric is built. */
data class BaselineSpec(
    /** Trailing days (ending the day before the evaluated day) that form the baseline. */
    val windowDays: Int = 30,
    /** Valid days required inside the window before baseline-dependent scores unlock. */
    val minValidDays: Int = 7,
    val transform: ValueTransform = ValueTransform.IDENTITY,
    /**
     * Lower limit for the standard deviation, as a fraction of the mean (on the IDENTITY scale) or
     * as an absolute value on the log scale (where a standard deviation already is a relative
     * spread). Stops a run of near-identical readings from turning a trivial change into a huge
     * z-score.
     */
    val relativeSdFloor: Double = 0.0,
    /** Lower limit for the standard deviation in the metric's own (transformed) units. */
    val absoluteSdFloor: Double = 0.0,
    /** Z-scores are clamped to ±this value so one outlier cannot dominate a composite score. */
    val zClamp: Double = 3.0,
) {
    init {
        require(windowDays >= 2) { "windowDays must be >= 2" }
        require(minValidDays in 2..windowDays) { "minValidDays must be within 2..windowDays" }
        require(relativeSdFloor >= 0 && absoluteSdFloor >= 0) { "sd floors must be >= 0" }
        require(zClamp > 0) { "zClamp must be > 0" }
    }
}

/** Default baseline definitions for the metrics the scores depend on. */
object BaselineSpecs {
    val HRV = BaselineSpec(transform = ValueTransform.NATURAL_LOG, relativeSdFloor = 0.05)
    val RESTING_HEART_RATE = BaselineSpec(relativeSdFloor = 0.02)
    val RESPIRATORY_RATE = BaselineSpec(relativeSdFloor = 0.02)
    val SPO2 = BaselineSpec(absoluteSdFloor = 0.5)
    val SLEEP_DURATION = BaselineSpec(relativeSdFloor = 0.05)
    /** Skin temperature is already a deviation in °C, so only an absolute floor makes sense. */
    val SKIN_TEMPERATURE_DEVIATION = BaselineSpec(absoluteSdFloor = 0.2)
    /** Share of sleep spent in deep + REM, as a fraction 0..1. */
    val RESTORATIVE_SLEEP_FRACTION = BaselineSpec(absoluteSdFloor = 0.03)
    val GENERIC = BaselineSpec()
}

enum class BaselineStatus {
    /** Fewer than the required valid days: no baseline, no z-score, dependent scores stay locked. */
    CALIBRATING,
    ESTABLISHED,
}

/**
 * A personal baseline. All fields except the counters are null while [status] is CALIBRATING.
 *
 * @property center typical value in the metric's own units (arithmetic mean, or geometric mean
 *   for log-transformed metrics).
 * @property lowerNormal lower edge of the personal normal range (center − 1 SD, back-transformed).
 * @property upperNormal upper edge of the personal normal range (center + 1 SD, back-transformed).
 */
data class Baseline(
    val status: BaselineStatus,
    val validDays: Int,
    val requiredDays: Int,
    val windowDays: Int,
    val transform: ValueTransform,
    val center: Double?,
    val lowerNormal: Double?,
    val upperNormal: Double?,
    /** Mean on the transformed scale (μ30). */
    val transformedMean: Double?,
    /** Raw sample standard deviation on the transformed scale (σ30), before floors. */
    val transformedSd: Double?,
    /** Standard deviation actually used for z-scores, after applying the floors. */
    val effectiveSd: Double?,
    val zClamp: Double,
) {
    val isEstablished: Boolean get() = status == BaselineStatus.ESTABLISHED
    val daysUntilEstablished: Int get() = (requiredDays - validDays).coerceAtLeast(0)
}

object BaselineEngine {

    /**
     * Baseline for the day [asOfDay], built from readings on the [BaselineSpec.windowDays] days
     * before it. The evaluated day itself is excluded, so today's reading never dilutes the
     * baseline it is compared against.
     */
    fun baseline(history: List<DailyValue>, asOfDay: Long, spec: BaselineSpec): Baseline {
        val from = asOfDay - spec.windowDays
        val valid = history
            .asSequence()
            .filter { it.epochDay in from until asOfDay && spec.transform.isValid(it.value) }
            .distinctBy { it.epochDay }
            .map { spec.transform.apply(it.value) }
            .toList()

        if (valid.size < spec.minValidDays) {
            return Baseline(
                status = BaselineStatus.CALIBRATING,
                validDays = valid.size,
                requiredDays = spec.minValidDays,
                windowDays = spec.windowDays,
                transform = spec.transform,
                center = null, lowerNormal = null, upperNormal = null,
                transformedMean = null, transformedSd = null, effectiveSd = null,
                zClamp = spec.zClamp,
            )
        }

        val mean = Stats.mean(valid)!!
        val sd = Stats.sampleStdDev(valid)!!
        val relativeFloor = when (spec.transform) {
            ValueTransform.IDENTITY -> spec.relativeSdFloor * abs(mean)
            ValueTransform.NATURAL_LOG -> spec.relativeSdFloor
        }
        val effectiveSd = maxOf(sd, relativeFloor, spec.absoluteSdFloor)

        return Baseline(
            status = BaselineStatus.ESTABLISHED,
            validDays = valid.size,
            requiredDays = spec.minValidDays,
            windowDays = spec.windowDays,
            transform = spec.transform,
            center = spec.transform.invert(mean),
            lowerNormal = spec.transform.invert(mean - effectiveSd),
            upperNormal = spec.transform.invert(mean + effectiveSd),
            transformedMean = mean,
            transformedSd = sd,
            effectiveSd = effectiveSd,
            zClamp = spec.zClamp,
        )
    }

    /**
     * Z = (x − μ30) / σ30 on the baseline's scale, clamped to ±[Baseline.zClamp].
     * Null while calibrating, when σ is zero, or when [value] cannot be transformed.
     */
    fun zScore(value: Double, baseline: Baseline): Double? {
        if (!baseline.isEstablished || !baseline.transform.isValid(value)) return null
        val sd = baseline.effectiveSd ?: return null
        val mean = baseline.transformedMean ?: return null
        if (sd <= 0.0) return null
        val z = (baseline.transform.apply(value) - mean) / sd
        return z.coerceIn(-baseline.zClamp, baseline.zClamp)
    }

    /** (value − center) / center, as a fraction. Null while calibrating or when the center is zero. */
    fun fractionFromBaseline(value: Double, baseline: Baseline): Double? {
        val center = baseline.center ?: return null
        if (center == 0.0) return null
        return (value - center) / center
    }
}
