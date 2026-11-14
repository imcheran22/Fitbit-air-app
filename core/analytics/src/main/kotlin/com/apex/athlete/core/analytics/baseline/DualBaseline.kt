package com.apex.athlete.core.analytics.baseline

import com.apex.athlete.core.analytics.research.RobustBaseline
import com.apex.athlete.core.analytics.research.RobustBaselineSpec
import com.apex.athlete.core.analytics.research.RobustBaselineSpecs
import com.apex.athlete.core.analytics.research.RobustCenter

/**
 * Both personal baselines of one metric on one day (owner decision, docs/DECISIONS.md D16).
 *
 * - [mean] (mean and SD, 30 days, at least 7; ln scale for HRV, Plews et al. 2013 / Buchheit 2014 style) is the basis
 *   of every **composite score** (recovery, sleep restoration). Unchanged from formula version 3.
 * - [robust] (median and MAD, 28 days, at least 14; Rousseeuw & Croux 1993, Leys et al. 2013) is the basis of
 *   **anomaly / alert and multi-signal detection** ([com.apex.athlete.core.analytics.research.MultiSignal],
 *   [com.apex.athlete.core.analytics.research.RobustBaseline.consecutiveDaysBeyond]): one outlier night (alcohol, a
 *   sensor glitch) barely moves a median, so it neither triggers nor masks the next day's check.
 *
 * Screens may show both: "usual (median) [usual], average [average]". The two windows and minimums differ by design,
 * so the robust value can still be calibrating when the mean is established; each says so through its own nullity.
 *
 * @property robust median/MAD of the window on the metric's own scale for IDENTITY metrics; for ln-scale metrics
 *   (HRV) the MAD and scale are in ln units and [usual] is the back-transformed median (the median of the raw values
 *   for an odd count; for an even count, the geometric mean of the two middle readings). Null while immature.
 * @property robustZ today's reading against [robust] (unclamped, in the same units as its scale); null without a
 *   reading or a mature robust baseline. Never feeds a composite score.
 */
data class DualBaseline(
    val mean: Baseline,
    val robust: RobustCenter?,
    val robustZ: Double?,
    val robustWindowDays: Int,
    private val transform: ValueTransform,
) {
    /** Arithmetic mean (geometric mean for HRV) of the mean/SD baseline; null while calibrating. */
    val average: Double? get() = mean.center

    /** Median of the robust baseline in the metric's own units; null while immature. */
    val usual: Double? get() = robust?.let { transform.invert(it.median) }
}

object DualBaselines {

    /**
     * Both baselines for [asOfDay] from readings before it (the day itself is never part of its own baseline). Invalid
     * readings (non-finite, or not positive on the ln scale) are gaps, never filled.
     */
    fun of(history: List<DailyValue>, asOfDay: Long, meanSpec: BaselineSpec, robustSpec: RobustBaselineSpec): DualBaseline {
        val transform = meanSpec.transform
        val mean = BaselineEngine.baseline(history, asOfDay, meanSpec)
        val window = history.asSequence()
            .filter { it.epochDay in (asOfDay - robustSpec.windowDays) until asOfDay && transform.isValid(it.value) }
            .distinctBy { it.epochDay }
            .map { transform.apply(it.value) }
            .toList()
        val robust = RobustBaseline.center(window, robustSpec)
        val today = history.firstOrNull { it.epochDay == asOfDay && transform.isValid(it.value) }?.value
        val robustZ = if (robust != null && today != null) (transform.apply(today) - robust.median) / robust.scale else null
        return DualBaseline(mean, robust, robustZ, robustSpec.windowDays, transform)
    }

    /** HRV: ln-scale mean/SD (BaselineSpecs.HRV) and ln-scale median/MAD (RobustBaselineSpecs.HRV_LN). */
    fun hrv(history: List<DailyValue>, asOfDay: Long) = of(history, asOfDay, BaselineSpecs.HRV, RobustBaselineSpecs.HRV_LN)

    fun restingHeartRate(history: List<DailyValue>, asOfDay: Long) =
        of(history, asOfDay, BaselineSpecs.RESTING_HEART_RATE, RobustBaselineSpecs.RESTING_HEART_RATE)

    fun sleepingHeartRate(history: List<DailyValue>, asOfDay: Long) =
        of(history, asOfDay, BaselineSpecs.SLEEPING_HEART_RATE, RobustBaselineSpecs.SLEEPING_HEART_RATE)

    fun respiratoryRate(history: List<DailyValue>, asOfDay: Long) =
        of(history, asOfDay, BaselineSpecs.RESPIRATORY_RATE, RobustBaselineSpecs.RESPIRATORY_RATE)
}
