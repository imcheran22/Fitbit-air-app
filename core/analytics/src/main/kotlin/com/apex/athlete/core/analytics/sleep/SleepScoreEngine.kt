package com.apex.athlete.core.analytics.sleep

import com.apex.athlete.core.analytics.stats.CircularTime
import com.apex.athlete.core.domain.DataProvenance
import kotlin.math.roundToInt

/** When a night began and ended, as local clock times in minutes after midnight. */
data class SleepTiming(val onsetMinuteOfDay: Double, val wakeMinuteOfDay: Double)

/**
 * Last night's main sleep. Stage minutes are null when the device could only score the night
 * with the movement-based "classic" method.
 */
data class SleepNightInput(
    val asleepMinutes: Double,
    val inBedMinutes: Double,
    val deepMinutes: Double? = null,
    val remMinutes: Double? = null,
    val lightMinutes: Double? = null,
    /** Awakenings longer than three minutes; null when the hypnogram is not available. */
    val wakeBoutsOverThreeMinutes: Int? = null,
    val timing: SleepTiming? = null,
)

enum class SleepComponent(val nominalWeight: Double) {
    DURATION(0.40),
    RESTORATIVE(0.25),
    EFFICIENCY(0.20),
    CONSISTENCY(0.15),
}

data class SleepContribution(
    val component: SleepComponent,
    val available: Boolean,
    val subScore: Double?,
    val effectiveWeight: Double,
    val points: Double,
)

/**
 * @property score 0..100.
 * @property restorativeFraction (deep + REM) / time asleep.
 * @property efficiencyPercent time asleep / time in bed × 100.
 * @property onsetStdDevMinutes spread of bedtimes over the trailing week (circular SD).
 * @property wakeStdDevMinutes spread of wake times over the trailing week (circular SD).
 * @property sufficientForRecovery true when the night covered at least 90 % of the need.
 */
data class SleepScoreResult(
    val score: Double,
    val scorePercent: Int,
    val contributions: List<SleepContribution>,
    val needMinutes: Double,
    val asleepMinutes: Double,
    val deficitMinutes: Double,
    val restorativeFraction: Double?,
    val deepFraction: Double?,
    val remFraction: Double?,
    val lightFraction: Double?,
    val efficiencyPercent: Double?,
    val onsetStdDevMinutes: Double?,
    val wakeStdDevMinutes: Double?,
    val sufficientForRecovery: Boolean,
    val provenance: DataProvenance = DataProvenance.MATHEMATICALLY_DERIVED,
)

/**
 * Composite sleep score (0–100):
 *
 *   40 %  duration      min(100, 100 · asleep / need)
 *   25 %  restorative   share of deep + REM against the 38–50 % benchmark, nudged by how the
 *                       night compares with the user's own usual share
 *   20 %  efficiency    asleep / in bed, minus a penalty for long awakenings
 *   15 %  consistency   week-long spread of bedtime and wake time
 *
 * A component that cannot be computed (no stage data, fewer than three nights of timing) drops
 * out and the remaining weights are scaled up proportionally.
 *
 * Evidence: the duration target comes from the sleep-need model (adult consensus of at least 7 h,
 * Watson et al. 2015; 7–9 h, Hirshkowitz et al. 2015). The weights, the 38–50 % restorative band,
 * the 65/92 % efficiency anchors, the wake-bout penalty and the 45/150-minute consistency anchors
 * are Apex calibration choices; consumer-wearable stage labels are not polysomnography stages.
 */
class SleepScoreEngine(private val config: Config = Config()) {

    data class Config(
        val restorativeBenchmarkLow: Double = 0.38,
        val restorativeBenchmarkHigh: Double = 0.50,
        /** Points lost per percentage point of deep + REM above the benchmark's upper edge (at most 10). */
        val restorativeExcessPenaltyPerPoint: Double = 1.0,
        /** Points added or removed per SD that the night differs from the personal usual (limited to ±2 SD). */
        val restorativePersonalPointsPerSd: Double = 5.0,
        /** Efficiency at or below this scores 0. */
        val efficiencyFloorPercent: Double = 65.0,
        /** Efficiency at or above this scores 100. */
        val efficiencyCeilingPercent: Double = 92.0,
        /** Long awakenings that cost nothing; most healthy nights contain one or two. */
        val freeWakeBouts: Int = 2,
        val pointsPerExtraWakeBout: Double = 3.0,
        val maxFragmentationPenalty: Double = 25.0,
        /** Bed/wake-time spread up to this many minutes is not penalised. */
        val consistencyFreeMinutes: Double = 45.0,
        /** Spread at which the consistency sub-score reaches zero. */
        val consistencyZeroMinutes: Double = 150.0,
        val minNightsForConsistency: Int = 3,
        val sufficiencyFraction: Double = 0.90,
    )

    /**
     * @param night last night's main sleep.
     * @param needMinutes tonight's need from [SleepNeedCalculator] (as it stood before this night).
     * @param recentTimings bed/wake times of the trailing 7 nights, including last night.
     * @param restorativeZ z-score of last night's deep + REM share against the personal baseline;
     *   null while that baseline is calibrating.
     */
    fun evaluate(
        night: SleepNightInput,
        needMinutes: Double,
        recentTimings: List<SleepTiming> = emptyList(),
        restorativeZ: Double? = null,
    ): SleepScoreResult {
        require(needMinutes > 0 && needMinutes.isFinite()) { "needMinutes must be finite and > 0" }
        require(night.asleepMinutes.isFinite()) { "asleepMinutes must be finite; pass no night instead of an unknown one" }
        val asleep = night.asleepMinutes.coerceAtLeast(0.0)
        // Optional parts of the night that are non-finite are treated as absent, never as zero.
        val deep = night.deepMinutes?.takeIf { it.isFinite() }
        val rem = night.remMinutes?.takeIf { it.isFinite() }
        val light = night.lightMinutes?.takeIf { it.isFinite() }

        val duration = (100.0 * asleep / needMinutes).coerceIn(0.0, 100.0)

        val restorativeFraction =
            if (deep != null && rem != null && asleep > 0) {
                ((deep + rem) / asleep).coerceIn(0.0, 1.0)
            } else null
        val restorative = restorativeFraction?.let { restorativeSubScore(it, restorativeZ?.takeIf { z -> z.isFinite() }) }

        val efficiencyPercent =
            if (night.inBedMinutes.isFinite() && night.inBedMinutes > 0) {
                (100.0 * asleep / night.inBedMinutes).coerceIn(0.0, 100.0)
            } else null
        val efficiency = efficiencyPercent?.let { efficiencySubScore(it, night.wakeBoutsOverThreeMinutes) }

        val validTimings = recentTimings.filter { it.onsetMinuteOfDay.isFinite() && it.wakeMinuteOfDay.isFinite() }
        val onsetSd: Double?
        val wakeSd: Double?
        if (validTimings.size >= config.minNightsForConsistency) {
            onsetSd = CircularTime.stdDevMinutes(validTimings.map { it.onsetMinuteOfDay })
            wakeSd = CircularTime.stdDevMinutes(validTimings.map { it.wakeMinuteOfDay })
        } else {
            onsetSd = null
            wakeSd = null
        }
        val consistency = if (onsetSd != null && wakeSd != null) consistencySubScore((onsetSd + wakeSd) / 2) else null

        val subScores = mapOf(
            SleepComponent.DURATION to duration,
            SleepComponent.RESTORATIVE to restorative,
            SleepComponent.EFFICIENCY to efficiency,
            SleepComponent.CONSISTENCY to consistency,
        )
        val weightSum = SleepComponent.entries.filter { subScores[it] != null }.sumOf { it.nominalWeight }
        val contributions = SleepComponent.entries.map { c ->
            val s = subScores[c]
            if (s == null) SleepContribution(c, false, null, 0.0, 0.0)
            else (c.nominalWeight / weightSum).let { w -> SleepContribution(c, true, s, w, w * s) }
        }
        val score = contributions.sumOf { it.points }.coerceIn(0.0, 100.0)

        return SleepScoreResult(
            score = score,
            scorePercent = score.roundToInt(),
            contributions = contributions,
            needMinutes = needMinutes,
            asleepMinutes = asleep,
            deficitMinutes = (needMinutes - asleep).coerceAtLeast(0.0),
            restorativeFraction = restorativeFraction,
            deepFraction = deep?.takeIf { asleep > 0 }?.let { it / asleep },
            remFraction = rem?.takeIf { asleep > 0 }?.let { it / asleep },
            lightFraction = light?.takeIf { asleep > 0 }?.let { it / asleep },
            efficiencyPercent = efficiencyPercent,
            onsetStdDevMinutes = onsetSd,
            wakeStdDevMinutes = wakeSd,
            sufficientForRecovery = asleep >= config.sufficiencyFraction * needMinutes,
        )
    }

    fun restorativeSubScore(fraction: Double, personalZ: Double?): Double {
        val benchmark = when {
            fraction < config.restorativeBenchmarkLow -> 100.0 * fraction / config.restorativeBenchmarkLow
            fraction <= config.restorativeBenchmarkHigh -> 100.0
            else -> 100.0 - minOf(
                10.0,
                (fraction - config.restorativeBenchmarkHigh) * 100.0 * config.restorativeExcessPenaltyPerPoint,
            )
        }
        val personal = personalZ?.let { config.restorativePersonalPointsPerSd * it.coerceIn(-2.0, 2.0) } ?: 0.0
        return (benchmark + personal).coerceIn(0.0, 100.0)
    }

    fun efficiencySubScore(efficiencyPercent: Double, wakeBoutsOverThreeMinutes: Int?): Double {
        val span = config.efficiencyCeilingPercent - config.efficiencyFloorPercent
        val base = (100.0 * (efficiencyPercent - config.efficiencyFloorPercent) / span).coerceIn(0.0, 100.0)
        val extraBouts = ((wakeBoutsOverThreeMinutes ?: 0) - config.freeWakeBouts).coerceAtLeast(0)
        val penalty = (extraBouts * config.pointsPerExtraWakeBout).coerceAtMost(config.maxFragmentationPenalty)
        return (base - penalty).coerceIn(0.0, 100.0)
    }

    fun consistencySubScore(spreadMinutes: Double): Double {
        if (spreadMinutes <= config.consistencyFreeMinutes) return 100.0
        val span = config.consistencyZeroMinutes - config.consistencyFreeMinutes
        return (100.0 * (1 - (spreadMinutes - config.consistencyFreeMinutes) / span)).coerceIn(0.0, 100.0)
    }
}
