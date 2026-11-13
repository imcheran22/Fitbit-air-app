package com.apex.athlete.core.analytics.sleep

import com.apex.athlete.core.analytics.stats.Stats

/** One past night as the debt calculation sees it. All values in minutes. */
data class NightBalance(
    val epochDay: Long,
    /** Base need plus that day's strain surcharge. The debt surcharge is excluded on purpose. */
    val needMinutes: Double,
    /** Time asleep in the night's main sleep. */
    val asleepMinutes: Double,
    /** Naps taken on the same day (formula version 3: naps count towards the bank). Non-finite is ignored. */
    val napMinutes: Double = 0.0,
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
 * @property accumulatedDebtMinutes net shortfall over the trailing debt window; null when fewer than
 *   [SleepNeedCalculator.Config.minNightsForDebt] nights were recorded in it (then no debt surcharge is added).
 */
data class SleepNeed(
    val baseMinutes: Double,
    val baseSource: BaseNeedSource,
    val strainSurchargeMinutes: Double,
    val debtSurchargeMinutes: Double,
    val accumulatedDebtMinutes: Double?,
    val totalMinutes: Double,
)

/**
 *   need = base + strain surcharge + debt surcharge
 *
 *   base             = 7 h 45 min, or the 75th percentile of the last 30 nights once 14 nights
 *                      exist (kept within 7–9 h: sleeping too little for a month does not prove
 *                      a small need, it usually shows a habit)
 *   strain surcharge = 2 % of the base per SD that the preceding day's strain lies above the mean
 *                      of the athlete's own last 30 recorded days (formula version 3; 0 at or below it)
 *   debt surcharge   = 50 % of the debt accumulated over the trailing 7 nights, at most 90 min
 *
 * The cap exists because sleep debt cannot be repaid in a single night; without it a week of
 * six-hour nights would prescribe a fourteen-hour night. Total need never exceeds 10 h.
 *
 * Evidence: the 7–9 h band matches the adult recommendation of Hirshkowitz et al. (2015,
 * National Sleep Foundation) and the "at least 7 h" consensus of Watson et al. (2015, AASM/SRS).
 * The 7 h 45 min default, the 75th percentile, the strain surcharge (its 2 % per SD, the 7-day
 * minimum, the 1-point SD floor and the cap of 3 SD) and the debt rules are Apex calibration
 * choices without a validated source; the personal-z form comes from the Bevel study (sleep.md).
 */
class SleepNeedCalculator(private val config: Config = Config()) {

    data class Config(
        val defaultBaseMinutes: Double = 465.0,
        val personalPercentile: Double = 0.75,
        val minNightsForPersonalBase: Int = 14,
        val personalBaseMinMinutes: Double = 420.0,
        val personalBaseMaxMinutes: Double = 540.0,
        /** Extra need, as a fraction of the base, per SD of strain above the athlete's own mean. */
        val strainFractionPerSd: Double = 0.02,
        /** Prior recorded strain days needed before a z-score exists, and the most that are used. */
        val minStrainDays: Int = 7,
        val strainHistoryDays: Int = 30,
        /** The SD used for z is never below this many strain points, so a very steady history does not blow z up. */
        val strainSdFloor: Double = 1.0,
        val strainZCap: Double = 3.0,
        val debtWindowNights: Int = 7,
        /** Recorded nights in the debt window needed before a debt is reported at all. */
        val minNightsForDebt: Int = 4,
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

    /**
     * z of the preceding day's strain against the [Config.strainHistoryDays] most recent prior
     * recorded days ([priorStrains], oldest first). Null when the day's strain is missing or fewer
     * than [Config.minStrainDays] prior days exist. Sample SD, floored at [Config.strainSdFloor],
     * z capped at [Config.strainZCap].
     */
    fun strainZ(precedingDayStrain: Double?, priorStrains: List<Double>): Double? {
        if (precedingDayStrain == null || !precedingDayStrain.isFinite()) return null
        val prior = priorStrains.filter { it.isFinite() }.takeLast(config.strainHistoryDays)
        if (prior.size < config.minStrainDays) return null
        val mean = Stats.mean(prior)!!
        val sd = maxOf(Stats.sampleStdDev(prior)!!, config.strainSdFloor)
        return ((precedingDayStrain - mean) / sd).coerceAtMost(config.strainZCap)
    }

    /** Extra minutes of need for a strain z above zero: `base * 0.02 * z`. Missing or non-positive z adds nothing. */
    fun strainSurcharge(strainZ: Double?, baseMinutes: Double): Double =
        if (strainZ == null || !strainZ.isFinite()) 0.0
        else baseMinutes * config.strainFractionPerSd * maxOf(0.0, strainZ)

    /**
     * Net sleep debt over the nights in the trailing window ending the day before [asOfDay].
     * Each night contributes need - (main sleep + naps of that day); a surplus is credited up to the
     * configured cap. Nights without data are skipped rather than counted as zero sleep. Never
     * negative, and null (unknown) when fewer than [Config.minNightsForDebt] nights were recorded.
     */
    fun accumulatedDebt(nights: List<NightBalance>, asOfDay: Long): Double? {
        val from = asOfDay - config.debtWindowNights
        val recorded = nights
            .filter { it.epochDay in from until asOfDay && it.needMinutes.isFinite() && it.asleepMinutes.isFinite() }
            .distinctBy { it.epochDay }
        if (recorded.size < config.minNightsForDebt) return null
        val net = recorded.sumOf {
            val asleep = it.asleepMinutes + (if (it.napMinutes.isFinite()) it.napMinutes.coerceAtLeast(0.0) else 0.0)
            (it.needMinutes - asleep).coerceAtLeast(-config.maxSurplusCreditMinutes)
        }
        return net.coerceAtLeast(0.0)
    }

    fun need(
        recentDurationsMinutes: List<Double>,
        precedingDayStrainZ: Double?,
        priorNights: List<NightBalance>,
        asOfDay: Long,
    ): SleepNeed {
        val (base, source) = baseNeed(recentDurationsMinutes)
        val strain = strainSurcharge(precedingDayStrainZ, base)
        val debt = accumulatedDebt(priorNights, asOfDay)
        val debtSurcharge = debt?.let { (config.debtRepaymentFraction * it).coerceAtMost(config.maxDebtSurchargeMinutes) } ?: 0.0
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
