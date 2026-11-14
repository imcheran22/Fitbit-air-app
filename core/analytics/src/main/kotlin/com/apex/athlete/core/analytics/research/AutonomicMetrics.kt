package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.stats.Stats
import com.apex.athlete.core.analytics.trend.WeeklyHrvStatus
import kotlin.math.ln

/** Where the 7-night ln RMSSD mean sits against the smallest-worthwhile-change band. */
enum class SwcStatus { BELOW_BAND, WITHIN_BAND, ABOVE_BAND }

/**
 * AR01 / AR02 additions to the weekly HRV status the app already computes.
 *
 * The research's own AR01 (7-night ln RMSSD mean against the 60 nights before, at least 4 and 21 nights, z on the ln
 * scale; Plews et al. 2012, 2013, 2014; Buchheit 2014) is the same calculation as
 * [com.apex.athlete.core.analytics.trend.WeeklyHrvStatusAnalyzer] (formula version 3), so that engine is the single
 * implementation and this object only derives what it does not report:
 *
 *   SWC band  = 0.5 · σ60 around μ60, i.e. |z| > 0.5 with the analyzer's z (whose σ is floored at 0.05)
 *   pct       = 100 · (e^(L7 − μ60) − 1) = 100 · (weekAverage / baselineCenter − 1)
 *   CV7       = 100 · SD(ln RMSSD, last 7 nights) / mean(ln RMSSD, last 7 nights)   (Plews convention, ln scale)
 *
 * Validated on trained endurance athletes with chest-strap or ECG recordings taken on waking; the wrist device
 * reports a sleep-time RMSSD computed by an undocumented algorithm and no Fitbit-specific HRV validation exists.
 * Evidence class B. The 0.5 multiplier and the 4-night minimum are conventions (calibration choices). A value below
 * the band may reflect poor sleep, alcohol, a late meal, illness, travel or cycle phase; it is never a diagnosis.
 */
object AutonomicMetrics {

    const val SWC_MULTIPLIER = 0.5
    const val RECENT_NIGHTS = 7
    const val MIN_RECENT_NIGHTS = 4

    /** SWC status of the analyzer's weekly z; null while the weekly status has no z (baseline building, too few nights). */
    fun swcStatus(status: WeeklyHrvStatus): SwcStatus? {
        val z = status.zScore?.takeIf { it.isFinite() } ?: return null
        return when {
            z < -SWC_MULTIPLIER -> SwcStatus.BELOW_BAND
            z > SWC_MULTIPLIER -> SwcStatus.ABOVE_BAND
            else -> SwcStatus.WITHIN_BAND
        }
    }

    /** Change of the week's geometric-mean RMSSD against the baseline's, in percent; null without both. */
    fun percentFromBaseline(status: WeeklyHrvStatus): Double? {
        val week = status.weekAverage ?: return null
        val base = status.baselineCenter?.takeIf { it > 0.0 } ?: return null
        return 100.0 * (week / base - 1.0)
    }

    /**
     * AR02. Coefficient of variation of ln RMSSD over the [RECENT_NIGHTS] nights ending on [asOfDay] (first reading
     * per day wins, invalid readings are missing). Null with fewer than [MIN_RECENT_NIGHTS] readings or a weekly ln
     * mean that is not positive (RMSSD at or below 1 ms).
     */
    fun cv7LnPercent(history: List<DailyValue>, asOfDay: Long): Double? {
        val byDay = LinkedHashMap<Long, Double>()
        for (v in history) if (v.value.isFinite() && v.value > 0.0) byDay.putIfAbsent(v.epochDay, v.value)
        val lnWeek = ((asOfDay - RECENT_NIGHTS + 1)..asOfDay).mapNotNull { byDay[it]?.let(::ln) }
        if (lnWeek.size < MIN_RECENT_NIGHTS) return null
        val mean = Stats.mean(lnWeek)!!
        if (mean <= 0.0) return null
        return 100.0 * Stats.sampleStdDev(lnWeek)!! / mean
    }
}
