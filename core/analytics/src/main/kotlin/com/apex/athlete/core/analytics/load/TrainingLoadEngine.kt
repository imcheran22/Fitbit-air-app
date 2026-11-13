package com.apex.athlete.core.analytics.load

import com.apex.athlete.core.analytics.stats.Ewma
import com.apex.athlete.core.analytics.stats.MissingValuePolicy
import com.apex.athlete.core.analytics.stats.Stats
import com.apex.athlete.core.domain.DataProvenance

/**
 * Training load of one day.
 *
 * @property trimp the day's TRIMP. 0.0 is a recorded rest day; null means no heart-rate data
 *   exists for the day (tracker not worn or not yet synced), which is not the same thing.
 */
data class DailyLoad(val epochDay: Long, val trimp: Double?)

enum class WorkloadZone(val label: String) {
    DETRAINING("Below usual load"),
    SWEET_SPOT("Sweet spot"),
    OVERREACHING("Overreaching caution"),
    HIGH_RISK("High fatigue risk"),
}

/** Reasons the workload ratio should be read with care; shown next to the number. */
enum class LoadCaveat {
    /** Fewer than 28 days of history: the chronic average has not settled. */
    SHORT_HISTORY,
    /** Chronic load is so low that a small absolute change swings the ratio. */
    LOW_CHRONIC_LOAD,
    /** Too many days in the window have no heart-rate data. */
    SPARSE_DATA,
}

data class LoadPoint(val epochDay: Long, val trimp: Double?, val acute: Double?, val chronic: Double?)

/**
 * @property acuteLoad ATL: 7-day EWMA of daily TRIMP ("fatigue"), normalised weights.
 * @property chronicLoad CTL: 28-day EWMA of daily TRIMP ("fitness"), normalised weights.
 * @property acwrCoupled ATL / CTL. The acute week is part of the chronic average, which pulls
 *   the ratio towards 1 and understates spikes. Needs 14 recorded days in the last 28.
 * @property acwrUncoupled mean of the last 7 days / mean of the 21 days before them.
 * @property workloadZone zone of the uncoupled ratio (falls back to the coupled one).
 * @property monotony Foster: mean daily load / SD of daily load over the last 7 days (needs 6 recorded days).
 * @property fosterStrain Foster: weekly load × monotony.
 * @property weeklyLoad sum of the recorded days among the last 7; a lower bound when days are missing.
 * @property weekOverWeekChange relative change of the mean recorded daily load, last 7 days versus
 *   the 7 before; null unless both weeks have at least [Config.minValidAcuteDays] recorded days.
 * @property trainingBalance yesterday's CTL − yesterday's ATL. Positive = fresh, negative = fatigued.
 * @property chronicLoadChange7d CTL today − CTL a week ago: how fast fitness load is ramping.
 */
data class TrainingLoadResult(
    val asOfDay: Long,
    val acuteLoad: Double?,
    val chronicLoad: Double?,
    val acwrCoupled: Double?,
    val acwrUncoupled: Double?,
    val workloadZone: WorkloadZone?,
    val caveats: Set<LoadCaveat>,
    val monotony: Double?,
    val fosterStrain: Double?,
    val weeklyLoad: Double?,
    val previousWeeklyLoad: Double?,
    val weekOverWeekChange: Double?,
    val load28d: Double?,
    val trainingBalance: Double?,
    val chronicLoadChange7d: Double?,
    val daysOfHistory: Int,
    val validDaysLast28: Int,
    val series: List<LoadPoint>,
    val provenance: DataProvenance = DataProvenance.MATHEMATICALLY_DERIVED,
    /** Share of the last 42 days with an active recorded load, as `min(1, active / 28)`. */
    val loadDensity: Double = 0.0,
    /** How recently the athlete trained, from the recorded days before [asOfDay]; see [TrainingLoadEngine.Config]. */
    val loadRecency: Double = 0.0,
    /** `min(loadDensity, loadRecency)`: how much the ratios can be trusted at all. */
    val loadConfidence: Double = 0.0,
    /**
     * True when [loadConfidence] is below [TrainingLoadEngine.Config.minLoadConfidence]: the ratios
     * and the zone are withheld (null) because the recorded days are too few or too old.
     */
    val isCalibrating: Boolean = false,
) {
    /**
     * The uncoupled ratio only when it carries no caveat: a ratio flagged as unreliable (short
     * history, low chronic load, sparse data) must not feed another score.
     */
    val reliableUncoupledRatio: Double? get() = acwrUncoupled?.takeIf { caveats.isEmpty() }
}

/**
 * Acute/chronic training load, workload ratios and Foster's monotony from daily TRIMP.
 *
 * A caution on the ratio itself: the acute:chronic workload ratio is a description of how this
 * week compares with the preceding weeks. The research linking specific ratio bands to injury is
 * contested (Impellizzeri et al. 2020), so the bands are presented as load-management guidance,
 * never as an injury prediction. The bands themselves (0.8–1.3, ≥ 1.5) come from team-sport studies
 * of session-RPE and GPS load (Gabbett 2016), not from TRIMP; using them on TRIMP is an Apex choice.
 */
class TrainingLoadEngine(private val config: Config = Config()) {

    data class Config(
        val acuteSpanDays: Int = 7,
        val chronicSpanDays: Int = 28,
        /** Days of history before any ratio is reported. */
        val minDaysForRatio: Int = 14,
        /** Valid days required in the 7-day acute window of the uncoupled ratio. */
        val minValidAcuteDays: Int = 5,
        /** Valid days required in the 21-day chronic window of the uncoupled ratio. */
        val minValidChronicDays: Int = 14,
        /** Chronic load (TRIMP/day) below which ratios are flagged as unstable. */
        val lowChronicLoad: Double = 10.0,
        val sweetSpotLow: Double = 0.80,
        val sweetSpotHigh: Double = 1.30,
        val highRisk: Double = 1.50,
        /** Monotony is capped here when the daily loads are (almost) identical. */
        val maxMonotony: Double = 10.0,
        /**
         * Confidence gate (formula version 3; the form, constants and the 0.35 line are those of the
         * Bevel study, strain-load.md, adapted to recorded days: a *calibration* choice, not validated).
         * A recorded day with a load above [activeDayTrimp] is "active".
         */
        val activeDayTrimp: Double = 5.0,
        /** Active days in the last [densityWindowDays] that give a density of 1. */
        val fullDensityActiveDays: Int = 28,
        val densityWindowDays: Int = 42,
        /** Days before the as-of day that count towards recency (yesterday is 0 days ago, so 0..15). */
        val recencyDays: Int = 16,
        /** Weight lost per day since the training day: 1, 0.9375, 0.875, ... */
        val recencyDecayPerDay: Double = 0.0625,
        /** Sum of the recency weights that gives a recency of 1 (the sum is multiplied by 1 / this). */
        val recencyFullWeight: Double = 4.0,
        /** Below this confidence the ratios and the zone are not shown. */
        val minLoadConfidence: Double = 0.35,
    )

    fun analyze(history: List<DailyLoad>, asOfDay: Long): TrainingLoadResult {
        // A null or non-finite TRIMP is "no data" for the day; it must not become a rest day or a NaN.
        // One value per day: the first valid entry listed wins, as in BaselineEngine and the trend analyzer.
        val byDay = LinkedHashMap<Long, Double>()
        for (d in history) {
            val t = d.trimp
            if (d.epochDay <= asOfDay && t != null && t.isFinite()) byDay.putIfAbsent(d.epochDay, t.coerceAtLeast(0.0))
        }
        val firstDay = byDay.keys.minOrNull()

        if (firstDay == null) {
            return TrainingLoadResult(
                asOfDay = asOfDay, acuteLoad = null, chronicLoad = null, acwrCoupled = null,
                acwrUncoupled = null, workloadZone = null, caveats = setOf(LoadCaveat.SHORT_HISTORY),
                monotony = null, fosterStrain = null, weeklyLoad = null, previousWeeklyLoad = null,
                weekOverWeekChange = null, load28d = null, trainingBalance = null,
                chronicLoadChange7d = null, daysOfHistory = 0, validDaysLast28 = 0, series = emptyList(),
                provenance = DataProvenance.UNAVAILABLE,
            )
        }

        val days = (firstDay..asOfDay).toList()
        val values: List<Double?> = days.map { byDay[it] }
        // Days without data leave the averages unchanged instead of being counted as rest.
        // Normalised weights: the first recorded day is not used as a seed, so a rest day (or a
        // race) at the start of the history cannot distort the chronic load for weeks.
        val acuteSeries = Ewma.normalizedSeries(values, config.acuteSpanDays, MissingValuePolicy.CARRY_FORWARD)
        val chronicSeries = Ewma.normalizedSeries(values, config.chronicSpanDays, MissingValuePolicy.CARRY_FORWARD)
        val series = days.indices.map { LoadPoint(days[it], values[it], acuteSeries[it], chronicSeries[it]) }

        val daysOfHistory = days.size
        val atl = acuteSeries.last()
        val ctl = chronicSeries.last()

        fun window(fromOffset: Int, toOffset: Int): List<Double> =
            ((asOfDay - fromOffset)..(asOfDay - toOffset)).mapNotNull { byDay[it] }

        val last7 = window(6, 0)
        val prior7 = window(13, 7)
        val chronic21 = window(27, 7)
        val last28 = window(27, 0)

        val caveats = LinkedHashSet<LoadCaveat>()
        if (daysOfHistory < config.chronicSpanDays) caveats += LoadCaveat.SHORT_HISTORY
        if (ctl != null && ctl < config.lowChronicLoad) caveats += LoadCaveat.LOW_CHRONIC_LOAD
        if (last28.size < minOf(daysOfHistory, config.chronicSpanDays) * 0.7) caveats += LoadCaveat.SPARSE_DATA

        // Confidence: enough active recorded days (density) and recent enough (recency).
        val activeDays = ((asOfDay - config.densityWindowDays + 1)..asOfDay)
            .count { d -> (byDay[d] ?: 0.0) > config.activeDayTrimp }
        val density = minOf(1.0, activeDays.toDouble() / config.fullDensityActiveDays)
        var recencySum = 0.0
        for (ago in 0 until config.recencyDays) {
            val load = byDay[asOfDay - 1 - ago] ?: continue
            if (load > config.activeDayTrimp) recencySum += 1.0 - config.recencyDecayPerDay * ago
        }
        val recency = minOf(1.0, recencySum / config.recencyFullWeight)
        val confidence = minOf(density, recency)
        val calibrating = confidence < config.minLoadConfidence

        // A coupled ratio from a handful of recorded days over a long span is not a ratio (B4):
        // it needs as many recorded days as the uncoupled chronic window.
        val ratiosAllowed = daysOfHistory >= config.minDaysForRatio && last28.size >= config.minValidChronicDays
        val coupled = if (!calibrating && ratiosAllowed && atl != null && ctl != null && ctl > 0) atl / ctl else null

        val uncoupled = if (
            !calibrating &&
            daysOfHistory >= config.chronicSpanDays &&
            last7.size >= config.minValidAcuteDays &&
            chronic21.size >= config.minValidChronicDays
        ) {
            val chronicMean = Stats.mean(chronic21)!!
            if (chronicMean > 0) Stats.mean(last7)!! / chronicMean else null
        } else null

        val zone = (uncoupled ?: coupled)?.let(::zoneFor)

        val monotony: Double?
        val fosterStrain: Double?
        if (last7.size >= 6) {
            val mean = Stats.mean(last7)!!
            val sd = Stats.sampleStdDev(last7)!!
            monotony = when {
                mean <= 0.0 -> null
                sd < mean / config.maxMonotony -> config.maxMonotony
                else -> mean / sd
            }
            fosterStrain = monotony?.let { last7.sum() * it }
        } else {
            monotony = null
            fosterStrain = null
        }

        val weekly = if (last7.isNotEmpty()) last7.sum() else null
        val previousWeekly = if (prior7.isNotEmpty()) prior7.sum() else null
        // Compares the average recorded day of each week, and only when both weeks are mostly
        // recorded: comparing raw sums would report missing wear time as a drop in training.
        val weekChange = if (last7.size >= config.minValidAcuteDays && prior7.size >= config.minValidAcuteDays) {
            val previousMean = Stats.mean(prior7)!!
            if (previousMean > 0) (Stats.mean(last7)!! - previousMean) / previousMean else null
        } else null

        val yesterdayIndex = days.size - 2
        val balance = if (yesterdayIndex >= 0) {
            val c = chronicSeries[yesterdayIndex]
            val a = acuteSeries[yesterdayIndex]
            if (c != null && a != null) c - a else null
        } else null

        val weekAgoIndex = days.size - 8
        val ramp = if (weekAgoIndex >= 0 && ctl != null) chronicSeries[weekAgoIndex]?.let { ctl - it } else null

        return TrainingLoadResult(
            asOfDay = asOfDay,
            acuteLoad = atl,
            chronicLoad = ctl,
            acwrCoupled = coupled,
            acwrUncoupled = uncoupled,
            workloadZone = zone,
            caveats = caveats,
            monotony = monotony,
            fosterStrain = fosterStrain,
            weeklyLoad = weekly,
            previousWeeklyLoad = previousWeekly,
            weekOverWeekChange = weekChange,
            load28d = if (last28.isNotEmpty()) last28.sum() else null,
            trainingBalance = balance,
            chronicLoadChange7d = ramp,
            daysOfHistory = daysOfHistory,
            validDaysLast28 = last28.size,
            series = series,
            loadDensity = density,
            loadRecency = recency,
            loadConfidence = confidence,
            isCalibrating = calibrating,
        )
    }

    fun zoneFor(ratio: Double): WorkloadZone = when {
        ratio < config.sweetSpotLow -> WorkloadZone.DETRAINING
        ratio <= config.sweetSpotHigh -> WorkloadZone.SWEET_SPOT
        ratio < config.highRisk -> WorkloadZone.OVERREACHING
        else -> WorkloadZone.HIGH_RISK
    }
}

/**
 * Which days enter the load history (formula version 3; B2 and B3 in docs/review/METRICS_ALIGNMENT.md).
 *
 * Daily TRIMP sums the heart-rate minutes the band delivered. A day with only a few hours of data
 * is not a day of low training, it is a day the band was off or not yet synced, so:
 *
 * - a finished day needs at least [MIN_WEAR_MINUTES] recorded minutes to count as a load at all,
 *   otherwise it is missing (null), exactly like a day with no data;
 * - today is still accumulating, so it never enters the load history (its lower-bound strain is
 *   still shown elsewhere).
 *
 * [MIN_WEAR_MINUTES] (10 hours of the 24) is a *calibration* choice with no published source.
 */
object DailyLoadPolicy {
    const val MIN_WEAR_MINUTES: Double = 600.0

    /** The TRIMP to store as the day's recorded load, or null when the band was worn too little (or not at all). */
    fun storedTrimp(trimp: Double?, recordedMinutes: Double?): Double? {
        if (trimp == null || !trimp.isFinite() || recordedMinutes == null || !recordedMinutes.isFinite()) return null
        return trimp.takeIf { recordedMinutes >= MIN_WEAR_MINUTES }
    }

    /** The entry to hand to [TrainingLoadEngine]; today and any later day is always a null load. */
    fun historyEntry(epochDay: Long, todayEpochDay: Long, trimp: Double?, recordedMinutes: Double?): DailyLoad =
        DailyLoad(epochDay, if (epochDay >= todayEpochDay) null else storedTrimp(trimp, recordedMinutes))
}
