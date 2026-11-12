package com.apex.athlete.core.analytics.sleep

import com.apex.athlete.core.analytics.stats.Stats

/** One past night as the debt calculation sees it. All values in minutes. */
data class NightBalance(
    val epochDay: Long,
    /** Base need plus that day's strain surcharge. The debt surcharge is excluded on purpose. */
    val needMinutes: Double,
    val asleepMinutes: Double,
)

enum class BaseNeedSource {
    /** The built-in default of 7 h 45 min. */
    DEFAULT,
    /** The 75th percentile of the user's own recent sleep durations. */
    PERSONAL_HISTORY,
}

/**
 * Tonight's sleep need and how it was built up.
 *
 * @property accumulatedDebtMinutes net shortfall over the trailing debt window.
 */
data class SleepNeed(
    val baseMinutes: Double,
    val baseSource: BaseNeedSource,
    val strainSurchargeMinutes: Double,
    val debtSurchargeMinutes: Double,
    val accumulatedDebtMinutes: Double,
    val totalMinutes: Double,
)

/**
 *   need = base + strain surcharge + debt surcharge
 *
 *   base             = 7 h 45 min, or the 75th percentile of the last 30 nights once 14 nights
 *                      exist (kept within 7–9 h: sleeping too little for a month does not prove
 *                      a small need, it usually shows a habit)
 *   strain surcharge = 3 min (0.05 h) per strain point above 10 on the preceding day
 *   debt surcharge   = 50 % of the debt accumulated over the trailing 7 nights, at most 90 min
 *
 * The cap exists because sleep debt cannot be repaid in a single night; without it a week of
 * six-hour nights would prescribe a fourteen-hour night. Total need never exceeds 10 h.
 *
 * Evidence: the 7–9 h band matches the adult recommendation of Hirshkowitz et al. (2015,
 * National Sleep Foundation) and the "at least 7 h" consensus of Watson et al. (2015, AASM/SRS).
 * The 7 h 45 min default, the 75th percentile, the strain surcharge and the debt rules are Apex
 * calibration choices without a validated source.
 */
class SleepNeedCalculator(private val config: Config = Config()) {

    data class Config(
        val defaultBaseMinutes: Double = 465.0,
        val personalPercentile: Double = 0.75,
        val minNightsForPersonalBase: Int = 14,
        val personalBaseMinMinutes: Double = 420.0,
        val personalBaseMaxMinutes: Double = 540.0,
        val strainThreshold: Double = 10.0,
        val minutesPerStrainPoint: Double = 3.0,
        val debtWindowNights: Int = 7,
        val debtRepaymentFraction: Double = 0.5,
        val maxDebtSurchargeMinutes: Double = 90.0,
        /** A long night pays back at most this much debt, so one lie-in cannot erase a bad week. */
        val maxSurplusCreditMinutes: Double = 60.0,
        val maxTotalNeedMinutes: Double = 600.0,
    )

    /** @param recentDurationsMinutes main-sleep durations from the trailing 30 days. */
    fun baseNeed(recentDurationsMinutes: List<Double>): Pair<Double, BaseNeedSource> {
        val valid = recentDurationsMinutes.filter { it.isFinite() && it > 0 }
        if (valid.size < config.minNightsForPersonalBase) {
            return config.defaultBaseMinutes to BaseNeedSource.DEFAULT
        }
        val p = Stats.percentile(valid, config.personalPercentile)!!
        return p.coerceIn(config.personalBaseMinMinutes, config.personalBaseMaxMinutes) to
            BaseNeedSource.PERSONAL_HISTORY
    }

    fun strainSurcharge(precedingDayStrain: Double?): Double =
        if (precedingDayStrain == null || !precedingDayStrain.isFinite()) 0.0
        else maxOf(0.0, precedingDayStrain - config.strainThreshold) * config.minutesPerStrainPoint

    /**
     * Net sleep debt over the nights in the trailing window ending the day before [asOfDay].
     * Each night contributes need − asleep; a surplus is credited up to the configured cap.
     * Nights without data are skipped rather than counted as zero sleep. Never negative.
     */
    fun accumulatedDebt(nights: List<NightBalance>, asOfDay: Long): Double {
        val from = asOfDay - config.debtWindowNights
        val net = nights
            .filter { it.epochDay in from until asOfDay && it.needMinutes.isFinite() && it.asleepMinutes.isFinite() }
            .distinctBy { it.epochDay }
            .sumOf { (it.needMinutes - it.asleepMinutes).coerceAtLeast(-config.maxSurplusCreditMinutes) }
        return net.coerceAtLeast(0.0)
    }

    fun need(
        recentDurationsMinutes: List<Double>,
        precedingDayStrain: Double?,
        priorNights: List<NightBalance>,
        asOfDay: Long,
    ): SleepNeed {
        val (base, source) = baseNeed(recentDurationsMinutes)
        val strain = strainSurcharge(precedingDayStrain)
        val debt = accumulatedDebt(priorNights, asOfDay)
        val debtSurcharge = (config.debtRepaymentFraction * debt).coerceAtMost(config.maxDebtSurchargeMinutes)
        return SleepNeed(
            baseMinutes = base,
            baseSource = source,
            strainSurchargeMinutes = strain,
            debtSurchargeMinutes = debtSurcharge,
            accumulatedDebtMinutes = debt,
            totalMinutes = (base + strain + debtSurcharge).coerceAtMost(config.maxTotalNeedMinutes),
        )
    }
}
