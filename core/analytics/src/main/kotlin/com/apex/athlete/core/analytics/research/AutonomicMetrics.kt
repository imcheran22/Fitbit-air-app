package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.stats.Stats
import kotlin.math.exp
import kotlin.math.ln

/** Where the 7-night ln RMSSD mean sits against the smallest-worthwhile-change band. */
enum class SwcStatus { BELOW_BAND, WITHIN_BAND, ABOVE_BAND }

/**
 * AR01 / AR02: the week's HRV against the person's own preceding 60 nights, on the ln scale.
 *
 * @property lnMean7 mean of ln(RMSSD) over the valid nights of the last 7.
 * @property lnBaselineMean μ60, mean of ln(RMSSD) over the 60 nights before those 7.
 * @property lnBaselineSd σ60, sample SD of the same nights.
 * @property z (lnMean7 − μ60) / σ60. Null only when σ60 is zero (below [AutonomicMetrics.MIN_SIGMA_LN]).
 * @property percentFromBaseline 100 · (e^(lnMean7 − μ60) − 1): the change of the geometric mean.
 * @property cv7LnPercent AR02: 100 · SD(ln RMSSD, last 7) / mean(ln RMSSD, last 7), the Plews
 *   convention (CV on the log scale). Null when the weekly ln mean is not positive.
 * @property swcLn half-width of the smallest-worthwhile-change band, 0.5 · σ60.
 * @property swcStatus whether the weekly mean left μ60 ± swcLn.
 */
data class HrvTrend(
    val lnMean7: Double,
    val lnBaselineMean: Double,
    val lnBaselineSd: Double,
    val z: Double?,
    val percentFromBaseline: Double,
    val cv7LnPercent: Double?,
    val validNights7: Int,
    val validBaselineNights: Int,
    val swcLn: Double,
    val swcStatus: SwcStatus,
) {
    /** Geometric mean RMSSD of the week, in ms. */
    val weeklyRmssdMs: Double get() = exp(lnMean7)

    /** Geometric mean RMSSD of the 60-night baseline, in ms. */
    val baselineRmssdMs: Double get() = exp(lnBaselineMean)
}

/**
 * HRV trend monitoring on ln(RMSSD) (Plews et al. 2012, 2013, 2014; Buchheit 2014).
 *
 *   L7   = mean(ln RMSSD) over the last 7 nights, at least 4 valid
 *   μ60, σ60 = mean and SD of ln RMSSD over the 60 nights before those 7, at least 21 valid
 *   z    = (L7 − μ60) / σ60
 *   pct  = 100 · (e^(L7 − μ60) − 1)
 *   CV7  = 100 · SD(ln RMSSD, 7 nights) / mean(ln RMSSD, 7 nights)
 *   SWC  = 0.5 · σ60
 *
 * The weekly mean is used because a single night's HRV is too noisy to act on (Plews 2012).
 * Validated on trained endurance athletes with chest-strap or ECG recordings taken on waking;
 * the wrist device reports a sleep-time RMSSD computed by an undocumented algorithm, and no
 * Fitbit-specific HRV validation exists. Evidence class B. The 7/60-night windows, the 4- and
 * 21-night minimums and the 0.5 multiplier are conventions (calibration choices), not validated
 * cut-offs. A low value may reflect poor sleep, alcohol, a late meal, illness, travel or cycle
 * phase; on its own it is neither a recovery verdict nor a diagnosis.
 */
object AutonomicMetrics {

    /** Valid range of the provider's RMSSD field, in ms. Readings outside it are dropped. */
    const val RMSSD_MIN_MS = 1.0
    const val RMSSD_MAX_MS = 200.0

    const val RECENT_NIGHTS = 7
    const val BASELINE_NIGHTS = 60
    const val MIN_RECENT_NIGHTS = 4
    const val MIN_BASELINE_NIGHTS = 21
    const val SWC_MULTIPLIER = 0.5

    /**
     * σ60 below this (on the ln scale, one part in a billion) is rounding residue of identical
     * readings, not variability, and gives no z. Floating-point tolerance, not physiology.
     */
    const val MIN_SIGMA_LN = 1e-9

    /**
     * @param lastNights RMSSD (ms) of the most recent nights; null marks a night without a reading.
     * @param baselineNights RMSSD (ms) of the nights before them.
     * @return null when fewer than [minRecent] recent or [minBaseline] baseline nights are valid.
     */
    fun hrvTrend(
        lastNights: List<Double?>,
        baselineNights: List<Double?>,
        minRecent: Int = MIN_RECENT_NIGHTS,
        minBaseline: Int = MIN_BASELINE_NIGHTS,
    ): HrvTrend? {
        val recent = lastNights.filterNotNull().filter(::isValidRmssd).map(::ln)
        val base = baselineNights.filterNotNull().filter(::isValidRmssd).map(::ln)
        if (recent.size < maxOf(minRecent, 2) || base.size < maxOf(minBaseline, 2)) return null

        val l7 = Stats.mean(recent)!!
        val mu = Stats.mean(base)!!
        val sigma = Stats.sampleStdDev(base)!!
        val swc = SWC_MULTIPLIER * sigma
        val diff = l7 - mu
        return HrvTrend(
            lnMean7 = l7,
            lnBaselineMean = mu,
            lnBaselineSd = sigma,
            z = if (sigma > MIN_SIGMA_LN) diff / sigma else null,
            percentFromBaseline = 100.0 * (exp(diff) - 1),
            cv7LnPercent = if (l7 > 0.0) 100.0 * Stats.sampleStdDev(recent)!! / l7 else null,
            validNights7 = recent.size,
            validBaselineNights = base.size,
            swcLn = swc,
            swcStatus = when {
                diff < -swc -> SwcStatus.BELOW_BAND
                diff > swc -> SwcStatus.ABOVE_BAND
                else -> SwcStatus.WITHIN_BAND
            },
        )
    }

    /**
     * The same calculation on a dated history: the recent window is the 7 nights ending on
     * [asOfDay], the baseline the 60 nights before that window.
     */
    fun hrvTrend(history: List<DailyValue>, asOfDay: Long): HrvTrend? {
        val recentFrom = asOfDay - RECENT_NIGHTS + 1
        return hrvTrend(
            lastNights = history.windowValues(recentFrom, asOfDay + 1),
            baselineNights = history.windowValues(recentFrom - BASELINE_NIGHTS, recentFrom),
        )
    }

    private fun isValidRmssd(ms: Double): Boolean = ms.isFinite() && ms in RMSSD_MIN_MS..RMSSD_MAX_MS
}
