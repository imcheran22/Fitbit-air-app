package com.apex.athlete.core.analytics.energy

import com.apex.athlete.core.analytics.strain.HeartRateZoneModel
import com.apex.athlete.core.analytics.stress.MinuteHeartRate
import com.apex.athlete.core.analytics.stress.MinuteRange
import com.apex.athlete.core.analytics.stress.MinuteStress

enum class EnergyMissing {
    /** No morning recovery score (or one outside 0..100): the day's starting level is unknown. */
    NO_RECOVERY,

    /** [EnergyInput.untilMinuteExclusive] is not after [EnergyInput.wakeMinute]. */
    EMPTY_SPAN,
}

/**
 * Every constant here is a calibration choice. There is no published validation of a "battery" model
 * of daily energy; the structure (start from recovery, basal drain, load drain, rest charge) follows the
 * Pulse reference's per-minute model (algorithms/energyBank.ts) and the magnitudes are kept to its scale:
 * about 38 points of basal drain over a 16 h day, so a full day with some load ends near a third of the start.
 */
data class EnergyConfig(
    /** Drain per awake minute. Calibration choice: 0.04 x 960 min = 38.4 points per 16 h. */
    val basalDrainPerMinute: Double = 0.04,
    /** Drain per minute per heart-rate zone number (Edwards-style weight 1..5). Calibration choice. */
    val activityDrainPerZonePerMinute: Double = 0.08,
    /** Extra drain per minute at stress level >= [highStress]. Calibration choice. */
    val stressDrainPerMinute: Double = 0.08,
    /** Charge per minute at stress level < [lowStress] (still, calm). Calibration choice; deliberately small. */
    val restChargePerMinute: Double = 0.01,
    /** Charge per minute asleep in a nap; no other term applies during a nap. Calibration choice. */
    val napChargePerMinute: Double = 0.25,
    val lowStress: Double = 1.0,
    val highStress: Double = 2.0,
)

/**
 * @property recovery morning recovery score 0..100, or null if unknown.
 * @property wakeMinute first awake minute; the curve starts here (sleep itself is already reflected in the recovery score).
 * @property heartRate per-minute mean HR; minutes without HR add no activity drain (not imputed).
 * @property minuteStress per-minute 0..3 levels from the stress engine; minutes without a level add no stress term.
 * @property zones the athlete's zone model, so the zone method stays the caller's single source of truth.
 * @property naps minutes inside a nap charge at the nap rate and nothing else applies.
 */
data class EnergyInput(
    val recovery: Double?,
    val wakeMinute: Long,
    val untilMinuteExclusive: Long,
    val minuteStress: List<MinuteStress>,
    val heartRate: List<MinuteHeartRate>,
    val zones: HeartRateZoneModel,
    val naps: List<MinuteRange>,
)

/** Level at the end of [minute], 0..100. */
data class EnergyPoint(val minute: Long, val level: Double)

data class EnergyResult(
    val startLevel: Double,
    val curve: List<EnergyPoint>,
    val currentLevel: Double,
    val lowestLevel: Double,
    /** Unclamped sums, in points. */
    val drainedBasal: Double,
    val drainedActivity: Double,
    val drainedStress: Double,
    val chargedRest: Double,
    val chargedNap: Double,
    /** Awake minutes with no stress level; these neither drain nor charge beyond the basal term. */
    val unscoredStressMinutes: Int,
)

data class EnergyOutcome(val result: EnergyResult?, val missing: EnergyMissing?)

/**
 * Energy bank: a 0..100 reserve that starts at the morning recovery score and moves minute by minute.
 * Display context only; it is not a physiological measurement.
 *
 *   level(m) = clamp(level(m-1) - basal - activity - stress + rest, 0, 100), or + nap charge inside a nap
 *   activity = zoneNumber(HR) x 0.08 for HR in zones 1..5 (none below zone 1, none when HR is missing)
 *   stress   = 0.08 when the stress level >= 2;  rest = 0.01 when the stress level < 1
 */
object EnergyEngine {

    fun evaluate(input: EnergyInput, config: EnergyConfig = EnergyConfig()): EnergyOutcome {
        val rec = input.recovery
        if (rec == null || !rec.isFinite() || rec < 0.0 || rec > 100.0) return EnergyOutcome(null, EnergyMissing.NO_RECOVERY)
        if (input.untilMinuteExclusive <= input.wakeMinute) return EnergyOutcome(null, EnergyMissing.EMPTY_SPAN)

        val hrByMinute = input.heartRate.filter { it.bpm.isFinite() && it.bpm > 0.0 }
            .groupBy { it.minute }.mapValues { (_, v) -> v.sumOf { it.bpm } / v.size }
        val stressByMinute = input.minuteStress.filter { it.level.isFinite() }
            .groupBy { it.minute }.mapValues { (_, v) -> v.sumOf { it.level } / v.size }

        val start: Double = rec
        var level = start
        var lowest = start
        var basal = 0.0; var activity = 0.0; var stress = 0.0; var rest = 0.0; var nap = 0.0
        var unscored = 0
        val curve = ArrayList<EnergyPoint>()
        for (m in input.wakeMinute until input.untilMinuteExclusive) {
            if (input.naps.any { m in it }) {
                level += config.napChargePerMinute
                nap += config.napChargePerMinute
            } else {
                level -= config.basalDrainPerMinute
                basal += config.basalDrainPerMinute
                hrByMinute[m]?.let { bpm ->
                    val zone = input.zones.zoneFor(bpm).number
                    if (zone > 0) {
                        val d = zone * config.activityDrainPerZonePerMinute
                        level -= d
                        activity += d
                    }
                }
                val s = stressByMinute[m]
                if (s == null) {
                    unscored++
                } else if (s >= config.highStress) {
                    level -= config.stressDrainPerMinute
                    stress += config.stressDrainPerMinute
                } else if (s < config.lowStress) {
                    level += config.restChargePerMinute
                    rest += config.restChargePerMinute
                }
            }
            level = level.coerceIn(0.0, 100.0)
            lowest = minOf(lowest, level)
            curve.add(EnergyPoint(m, level))
        }
        return EnergyOutcome(EnergyResult(start, curve, level, lowest, basal, activity, stress, rest, nap, unscored), null)
    }
}
