package com.apex.athlete.core.analytics.stress

import com.apex.athlete.core.analytics.stats.Stats
import kotlin.math.exp
import kotlin.math.sqrt

/** Why a day has no stress summary. The UI shows a calibrating or not-enough-data state, never a zero. */
enum class StressMissing {
    /** Fewer than [StressConfig.minBaselineDays] prior days with a daytime aggregate. */
    BASELINE_CALIBRATING,

    /** Fewer than [StressConfig.minScoredMinutes] still, awake minutes with heart rate. */
    TOO_FEW_MINUTES,
}

/**
 * The athlete's own daytime resting-heart-rate baseline.
 * @property centerBpm mean of the prior days' daytime aggregates.
 * @property sigmaBpm max(sample SD of those aggregates, [StressConfig.sigmaFloorBpm]).
 */
data class StressBaseline(val centerBpm: Double, val sigmaBpm: Double, val validDays: Int)

/**
 * One local day. [dayStartMinute] is local midnight, [dayEndMinuteExclusive] the next local midnight.
 * [excluded] holds the day's workouts and every sleep session or nap; minutes inside them are never scored.
 */
data class StressDayInput(
    val dayStartMinute: Long,
    val dayEndMinuteExclusive: Long,
    val heartRate: List<MinuteHeartRate>,
    val steps: List<MinuteSteps>,
    val excluded: List<MinuteRange>,
)

/** Mean level over the scored minutes of one 6-minute slot (slots tile the day from [startMinute]). */
data class StressSlot(val startMinute: Long, val meanLevel: Double)

data class StressSummary(
    /** Mean of the 0..3 per-minute levels. */
    val meanLevel: Double,
    /** Minutes with level < 1. */
    val lowMinutes: Int,
    /** Minutes with 1 <= level < 2. */
    val mediumMinutes: Int,
    /** Minutes with level >= 2. */
    val highMinutes: Int,
    val scoredMinutes: Int,
    /** The 6-minute slot with the highest mean level (needs >= [StressConfig.minSlotMinutes] scored minutes). */
    val highestSlot: StressSlot?,
)

data class StressResult(
    /** Null while calibrating or with too few scored minutes; see [missing]. */
    val summary: StressSummary?,
    val missing: StressMissing?,
    /** Today's resting daytime HR (P10 of waking-hour still-minute means). Feed it to [StressEngine.baselineFrom] later. */
    val dayAggregateBpm: Double?,
    /** Per-minute levels; empty when [summary] is null. */
    val minuteLevels: List<MinuteStress>,
)

/**
 * All constants are calibration choices, not validated cut-offs, except where stated.
 */
data class StressConfig(
    /** Logistic slope. Calibration choice (structure from the Pulse reference, no published validation). */
    val slope: Double = 1.5,
    /** z at the logistic midpoint (level 1.5). Calibration choice: z = 0 maps to 0.29, z = 3 to 2.71. */
    val midpointZ: Double = 1.5,
    /** A minute is "still" only if no step was recorded within this many minutes either side. Calibration choice. */
    val stillWindowMinutes: Int = 2,
    /** Steps in a minute above this value count as motion. Calibration choice: any step. */
    val stepThreshold: Int = 0,
    /** Waking window for the day aggregate, local hours [from, to). Calibration choice: 06:00-22:00. */
    val wakingFromHour: Int = 6,
    val wakingToHour: Int = 22,
    /** Still minutes an hour needs before its mean joins the day aggregate. Calibration choice. */
    val minHourStillMinutes: Int = 15,
    /** Percentile of the qualifying hourly means that forms the day aggregate. Calibration choice: the calm floor. */
    val dayAggregatePercentile: Double = 0.10,
    /** Prior days with an aggregate before any stress is shown. Calibration choice, same as Apex's 7-valid-day rule. */
    val minBaselineDays: Int = 7,
    /** Most recent prior days used for the baseline. Calibration choice, same as Apex's 30-day baselines. */
    val baselineWindowDays: Int = 30,
    /** Lower bound on sigma so a run of near-identical days cannot make a few bpm look extreme. Calibration choice. */
    val sigmaFloorBpm: Double = 5.0,
    /** Scored minutes needed for a day summary. Calibration choice (2 h). */
    val minScoredMinutes: Int = 120,
    /** Minutes per slot for the "highest slot". */
    val slotMinutes: Int = 6,
    /** Scored minutes a slot needs to be a candidate. Calibration choice (half the slot). */
    val minSlotMinutes: Int = 3,
    /** Band edges on the 0..3 level: low < 1 <= medium < 2 <= high. Calibration choice (thirds of the scale, rounded). */
    val mediumFrom: Double = 1.0,
    val highFrom: Double = 2.0,
)

/**
 * Daytime stress from heart rate alone: how far a still, awake minute's mean HR sits above the athlete's own
 * resting daytime level. This is not a measure of psychological stress and is not validated against any
 * clinical stress instrument; the wording in the UI must stay "heart rate was elevated while still".
 *
 * Structure follows the Pulse reference (algorithms/stress.ts, scoring/stressBase.ts; HR-only path):
 *  1. Per-minute mean HR (several readings in a minute are averaged).
 *  2. Motion gating: minutes within +-[StressConfig.stillWindowMinutes] of a minute with steps above the
 *     threshold, and minutes inside a workout or sleep range, are removed rather than guessed.
 *  3. z = (bpm - baseline.centerBpm) / baseline.sigmaBpm.
 *  4. level = 3 / (1 + e^(-k (z - z0))), k = 1.5, z0 = 1.5 (a calibration choice; level in 0..3).
 *  5. Day summary: mean level, minutes per band, highest 6-minute slot.
 * Missing data stays missing: no HR in a minute means no level for that minute, and a day without a usable
 * baseline or without enough still minutes has no summary.
 */
object StressEngine {

    private val defaultConfig = StressConfig()

    /** Logistic mapping from z to a 0..3 level. */
    fun levelForZ(z: Double, config: StressConfig = defaultConfig): Double =
        3.0 / (1.0 + exp(-config.slope * (z - config.midpointZ)))

    /** Minute -> mean bpm for the minutes that survive motion and exclusion gating. */
    fun stillMinutes(input: StressDayInput, config: StressConfig = defaultConfig): Map<Long, Double> {
        val perMinute = LinkedHashMap<Long, MutableList<Double>>()
        for (s in input.heartRate) {
            if (s.minute < input.dayStartMinute || s.minute >= input.dayEndMinuteExclusive) continue
            if (!s.bpm.isFinite() || s.bpm <= 0.0) continue
            perMinute.getOrPut(s.minute) { mutableListOf() }.add(s.bpm)
        }
        val blocked = HashSet<Long>()
        for (st in input.steps) {
            if (st.steps > config.stepThreshold) {
                for (m in st.minute - config.stillWindowMinutes..st.minute + config.stillWindowMinutes) blocked.add(m)
            }
        }
        val out = LinkedHashMap<Long, Double>()
        for ((m, v) in perMinute.entries.sortedBy { it.key }) {
            if (m in blocked || input.excluded.any { m in it }) continue
            out[m] = v.sum() / v.size
        }
        return out
    }

    /**
     * The day's resting daytime HR: the [StressConfig.dayAggregatePercentile] (type 7) of the mean still-minute HR of each
     * waking hour that has at least [StressConfig.minHourStillMinutes] still minutes. Null when no hour qualifies.
     * Hours count from [StressDayInput.dayStartMinute]; on a DST-change day hours after the change are off by one.
     */
    fun dayAggregate(input: StressDayInput, config: StressConfig = defaultConfig): Double? {
        val still = stillMinutes(input, config)
        val byHour = still.entries.groupBy { ((it.key - input.dayStartMinute) / 60).toInt() }
        val hourMeans = byHour
            .filter { (h, xs) -> h >= config.wakingFromHour && h < config.wakingToHour && xs.size >= config.minHourStillMinutes }
            .map { (_, xs) -> xs.sumOf { it.value } / xs.size }
        return Stats.percentile(hourMeans, config.dayAggregatePercentile)
    }

    /**
     * Baseline from prior days' aggregates (oldest first, today excluded; null = no aggregate that day, which stays missing).
     * Uses the most recent [StressConfig.baselineWindowDays] entries. Null (calibrating) below [StressConfig.minBaselineDays] valid days.
     */
    fun baselineFrom(dayAggregates: List<Double?>, config: StressConfig = defaultConfig): StressBaseline? {
        val valid = dayAggregates.takeLast(config.baselineWindowDays).filterNotNull().filter { it.isFinite() && it > 0.0 }
        if (valid.size < config.minBaselineDays) return null
        val center = valid.sum() / valid.size
        val sd = Stats.sampleStdDev(valid) ?: 0.0
        return StressBaseline(center, maxOf(sd, config.sigmaFloorBpm), valid.size)
    }

    fun evaluate(input: StressDayInput, baseline: StressBaseline?, config: StressConfig = defaultConfig): StressResult {
        val aggregate = dayAggregate(input, config)
        if (baseline == null) return StressResult(null, StressMissing.BASELINE_CALIBRATING, aggregate, emptyList())
        val still = stillMinutes(input, config)
        if (still.size < config.minScoredMinutes) return StressResult(null, StressMissing.TOO_FEW_MINUTES, aggregate, emptyList())

        val levels = still.map { (m, bpm) -> MinuteStress(m, levelForZ((bpm - baseline.centerBpm) / baseline.sigmaBpm, config)) }
        val low = levels.count { it.level < config.mediumFrom }
        val high = levels.count { it.level >= config.highFrom }
        val summary = StressSummary(
            meanLevel = levels.sumOf { it.level } / levels.size,
            lowMinutes = low,
            mediumMinutes = levels.size - low - high,
            highMinutes = high,
            scoredMinutes = levels.size,
            highestSlot = highestSlot(levels, input.dayStartMinute, config),
        )
        return StressResult(summary, null, aggregate, levels)
    }

    private fun highestSlot(levels: List<MinuteStress>, dayStart: Long, config: StressConfig): StressSlot? {
        var best: StressSlot? = null
        val slots = levels.groupBy { (it.minute - dayStart) / config.slotMinutes }
        for ((idx, xs) in slots.entries.sortedBy { it.key }) {
            if (xs.size < config.minSlotMinutes) continue
            val mean = xs.sumOf { it.level } / xs.size
            if (best == null || mean > best.meanLevel + 1e-9) best = StressSlot(dayStart + idx * config.slotMinutes, mean)
        }
        return best
    }
}
