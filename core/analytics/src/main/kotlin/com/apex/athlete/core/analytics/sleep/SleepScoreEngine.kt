package com.apex.athlete.core.analytics.sleep

import com.apex.athlete.core.analytics.stats.CircularTime
import com.apex.athlete.core.domain.DataProvenance
import kotlin.math.roundToInt

/** When a night began and ended, as local clock times in minutes after midnight. */
data class SleepTiming(val onsetMinuteOfDay: Double, val wakeMinuteOfDay: Double)

/**
 * Last night's main sleep. Stage minutes are null when the device could only score the night
 * with the movement-based "classic" method.
 *
 * There is deliberately no "time to fall asleep" field: the provider-reported latency is shown as
 * reported (and is 0 for automatically detected sleep, see [SleepLatency]); nothing scores on it.
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

/**
 * The five parts of the sleep score (formula version 5). The weights are calibration choices (they
 * sum to 1.0); docs/FORMULAS.md section 4 gives the reasoning behind each.
 *
 * @property isBehavioural true for the parts that describe the sleep itself (how long, how
 *   composed, how continuous, how regular). [RESTORATION] is the one physiological part: how the
 *   body's overnight heart rate and HRV compared with its own usual.
 */
enum class SleepComponent(val nominalWeight: Double, val isBehavioural: Boolean) {
    DURATION(0.35, true),
    RESTORATION(0.25, false),
    QUALITY(0.15, true),
    EFFICIENCY(0.15, true),
    CONSISTENCY(0.10, true),
}

data class SleepContribution(
    val component: SleepComponent,
    val available: Boolean,
    /** 0..100, null when the part could not be computed. */
    val subScore: Double?,
    /** Weight after sharing out the weights of missing parts; 0 when unavailable. */
    val effectiveWeight: Double,
    /** effectiveWeight × subScore: this part's share of the final score, in points. */
    val points: Double,
)

/**
 * How much of the score's nominal weight was backed by data. A missing part is never filled in;
 * its weight is shared among the rest and the score is flagged as partial instead.
 */
enum class SleepScoreConfidence {
    /** At least 85 % of the weight was available. */
    HIGH,
    /** At least 60 %: a partial score, typically a night without overnight heart-rate / HRV baselines. */
    MEDIUM,
    /** Under 60 %: little more than duration and efficiency. */
    LOW,
}

/**
 * @property score 0..100. 100 is an ideal night; an ordinary adequate night lands around 75–85.
 * @property behaviouralScore the score recomputed over duration, quality, efficiency and
 *   consistency only (re-weighted to 1.0). This, not [score], is what the recovery score takes as
 *   its sleep input, because recovery already counts HRV, heart rate and breathing rate itself.
 * @property availableWeight sum of the nominal weights of the parts that could be computed (0..1).
 * @property confidence [availableWeight] as a three-step label for the "partial score" hint.
 * @property durationTargetMinutes what the duration part was scored against: the need, but never
 *   less than the adult guideline minimum.
 * @property deficitMinutes need − asleep for this one night (never negative). The multi-night
 *   personal sleep debt is [SleepNeed.accumulatedDebtMinutes]; the guideline shortfall is
 *   `research.SleepRegularity.guidelineShortfall`.
 * @property restorationZ combined "good direction" z-score behind the restoration part (positive =
 *   calmer than the personal usual); null when that part is unavailable.
 * @property restorativeFraction (deep + REM) / time asleep.
 * @property efficiencyPercent time asleep / time in bed × 100.
 * @property onsetStdDevMinutes spread of bedtimes over the trailing week (circular SD).
 * @property wakeStdDevMinutes spread of wake times over the trailing week (circular SD).
 * @property sufficientForRecovery true when the night covered at least 90 % of the need.
 * @property regularityIndex Sleep Regularity Index (-100..100) that scored the consistency part, when one was given.
 */
data class SleepScoreResult(
    val score: Double,
    val scorePercent: Int,
    val behaviouralScore: Double,
    val availableWeight: Double,
    val confidence: SleepScoreConfidence,
    val contributions: List<SleepContribution>,
    val needMinutes: Double,
    val durationTargetMinutes: Double,
    val asleepMinutes: Double,
    val deficitMinutes: Double,
    val restorationZ: Double?,
    val restorativeFraction: Double?,
    val deepFraction: Double?,
    val remFraction: Double?,
    val lightFraction: Double?,
    val efficiencyPercent: Double?,
    val onsetStdDevMinutes: Double?,
    val wakeStdDevMinutes: Double?,
    val sufficientForRecovery: Boolean,
    val provenance: DataProvenance = DataProvenance.MATHEMATICALLY_DERIVED,
    val regularityIndex: Double? = null,
)

/**
 * Composite sleep score (0–100), formula version 5. This is Apex's own transparent calculation,
 * not the Fitbit / Google Health sleep score, and it is not a clinical measurement.
 *
 *   35 %  duration      0 at (target − 225 min), 100 at the target, linear between;
 *                       target = max(need, 7 h)
 *   25 %  restoration   last night's sleeping heart rate and HRV (ln RMSSD) against the personal
 *                       mean/SD baselines, less a penalty for a raised breathing rate: 80 at
 *                       baseline, 100 at +1 SD calmer, 50 at −1 SD
 *   15 %  quality       deep + REM share against the user's own usual share: 80 at the usual,
 *                       ±10 per SD (a fixed 38–50 % band, worth at most 80, only while calibrating)
 *   15 %  efficiency    asleep / in bed: 0 at 65 %, 75 at 85 %, 100 at 95 %, minus a penalty for
 *                       long awakenings
 *   10 %  consistency   Sleep Regularity Index of the last week, limited to 0..100 (version 3);
 *                       without an index, direct callers may fall back to the bed/wake-time spread
 *
 * Calibration: only a night that is long enough, physiologically calmer than usual, unusually
 * rich in deep + REM, continuous and regular reaches 100. Each part sits near 80 for an ordinary
 * night, so an ordinary adequate night scores about 75–85 and a short or physiologically poor one
 * about 55–75. Every constant is either cited or labelled a calibration choice in docs/FORMULAS.md.
 *
 * A part that cannot be computed (no baselines yet, no stage data, no regularity index) is never
 * filled in. It drops out, the remaining weights are scaled up proportionally, and
 * [SleepScoreResult.confidence] says how much of the score was backed by data.
 */
class SleepScoreEngine(private val config: Config = Config()) {

    data class Config(
        // --- Duration ---------------------------------------------------------------------
        /**
         * The duration target is never below this. 7 h is the consensus minimum for adults
         * (Watson et al. 2015, AASM/SRS joint consensus statement).
         */
        val guidelineMinimumMinutes: Double = 420.0,
        /**
         * Minutes short of the target at which the duration part reaches zero. Calibration: with
         * the default 7 h 45 min need, 7 h asleep scores 80, 6 h about 53 and 4 h or less 0.
         */
        val durationZeroShortfallMinutes: Double = 225.0,

        // --- Restoration ------------------------------------------------------------------
        /** Sub-score when overnight heart rate and HRV sit exactly at the personal baseline. */
        val restorationNeutralSubScore: Double = 80.0,
        /** Points gained per SD calmer than usual; reaches 100 at +1 SD. */
        val restorationPointsPerSdAbove: Double = 20.0,
        /** Points lost per SD more strained than usual; 50 at −1 SD, 0 from −2.67 SD. */
        val restorationPointsPerSdBelow: Double = 30.0,
        /** A breathing-rate z-score above this starts to count against restoration. */
        val respiratoryPenaltyThresholdZ: Double = 1.0,
        /** Combined-z units removed per SD of breathing rate beyond the threshold. */
        val respiratoryPenaltyPerSd: Double = 0.5,
        /** Individual and combined z-scores are limited to ±this value. */
        val restorationZClamp: Double = 3.0,

        // --- Quality (stage composition) ----------------------------------------------------
        /** Sub-score for a deep + REM share equal to the user's own usual share. */
        val qualityNeutralSubScore: Double = 80.0,
        /** Points added or removed per SD that the night differs from the personal usual. */
        val qualityPointsPerSd: Double = 10.0,
        /** Provisional band used only while the personal stage baseline is calibrating. */
        val qualityBandLow: Double = 0.38,
        val qualityBandHigh: Double = 0.50,
        /** Points lost per percentage point of deep + REM above the band's upper edge. */
        val qualityExcessPenaltyPerPoint: Double = 1.0,
        val qualityMaxExcessPenalty: Double = 10.0,

        // --- Efficiency -------------------------------------------------------------------
        /** Efficiency at or below this scores 0. */
        val efficiencyFloorPercent: Double = 65.0,
        /** The "good sleep quality" indicator of Ohayon et al. 2017 (National Sleep Foundation). */
        val efficiencyGoodPercent: Double = 85.0,
        /** Sub-score given at [efficiencyGoodPercent]. */
        val efficiencyGoodSubScore: Double = 75.0,
        /** Efficiency at or above this scores 100. */
        val efficiencyCeilingPercent: Double = 95.0,
        /** Long awakenings that cost nothing; most healthy nights contain one or two. */
        val freeWakeBouts: Int = 2,
        val pointsPerExtraWakeBout: Double = 3.0,
        val maxFragmentationPenalty: Double = 25.0,

        // --- Consistency (fallback only; the pipeline scores the Sleep Regularity Index) -----
        /** Bed/wake-time spread up to this many minutes is not penalised. */
        val consistencyFreeMinutes: Double = 45.0,
        /** Spread at which the consistency sub-score reaches zero. */
        val consistencyZeroMinutes: Double = 150.0,
        val minNightsForConsistency: Int = 3,
        /**
         * When true (default for direct callers), a missing regularity index falls back to scoring the
         * spread of bed and wake times. The pipeline switches it off so one stored series never mixes
         * two definitions of consistency; the spread is still reported for display.
         */
        val useTimingSpreadForConsistency: Boolean = true,

        // --- Result labels ----------------------------------------------------------------
        val sufficiencyFraction: Double = 0.90,
        val highConfidenceWeight: Double = 0.85,
        val mediumConfidenceWeight: Double = 0.60,
    )

    /**
     * @param night last night's main sleep.
     * @param needMinutes tonight's need from [SleepNeedCalculator] (as it stood before this night).
     * @param recentTimings bed/wake times of the trailing 7 nights, including last night.
     * @param restorativeZ z-score of last night's deep + REM share against the personal baseline;
     *   null while that baseline is calibrating.
     * @param regularityIndex Sleep Regularity Index of the trailing week ([SleepRegularityIndex]);
     *   when given it scores the consistency part.
     * @param sleepingHeartRateZ z-score of last night's mean sleeping heart rate against its personal
     *   baseline (positive = faster than usual); null when there is no reading or no baseline.
     * @param hrvZ z-score of last night's HRV (ln RMSSD) against its personal baseline (positive =
     *   higher than usual); null when there is no reading or no baseline.
     * @param respiratoryRateZ z-score of last night's breathing rate against its personal
     *   baseline; only ever lowers the restoration part, and never makes it available on its own.
     */
    fun evaluate(
        night: SleepNightInput,
        needMinutes: Double,
        recentTimings: List<SleepTiming> = emptyList(),
        restorativeZ: Double? = null,
        regularityIndex: Double? = null,
        sleepingHeartRateZ: Double? = null,
        hrvZ: Double? = null,
        respiratoryRateZ: Double? = null,
    ): SleepScoreResult {
        require(needMinutes > 0 && needMinutes.isFinite()) { "needMinutes must be finite and > 0" }
        require(night.asleepMinutes.isFinite()) { "asleepMinutes must be finite; pass no night instead of an unknown one" }
        val asleep = night.asleepMinutes.coerceAtLeast(0.0)
        // Optional parts of the night that are non-finite are treated as absent, never as zero.
        val deep = night.deepMinutes?.takeIf { it.isFinite() }
        val rem = night.remMinutes?.takeIf { it.isFinite() }
        val light = night.lightMinutes?.takeIf { it.isFinite() }

        val duration = durationSubScore(asleep, needMinutes)

        val combinedZ = restorationZ(sleepingHeartRateZ, hrvZ, respiratoryRateZ)
        val restoration = combinedZ?.let(::restorationSubScoreForZ)

        val restorativeMinutes = if (deep != null && rem != null) deep + rem else null
        val restorativeFraction =
            if (restorativeMinutes != null && asleep > 0) (restorativeMinutes / asleep).coerceIn(0.0, 1.0) else null
        // A staged night with neither deep nor REM is a staging failure, not a measurement of
        // zero restorative sleep, so the quality part is left out rather than scored as 0.
        val quality = restorativeFraction
            ?.takeIf { restorativeMinutes != null && restorativeMinutes > 0 }
            ?.let { qualitySubScore(it, restorativeZ) }

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
        val index = regularityIndex?.takeIf { it.isFinite() }
        val consistency = when {
            index != null -> SleepRegularityIndex.subScore(index)
            config.useTimingSpreadForConsistency && onsetSd != null && wakeSd != null -> consistencySubScore((onsetSd + wakeSd) / 2)
            else -> null
        }

        val subScores: Map<SleepComponent, Double?> = mapOf(
            SleepComponent.DURATION to duration,
            SleepComponent.RESTORATION to restoration,
            SleepComponent.QUALITY to quality,
            SleepComponent.EFFICIENCY to efficiency,
            SleepComponent.CONSISTENCY to consistency,
        )
        val available = SleepComponent.entries.filter { subScores[it] != null }
        val availableWeight = available.sumOf { it.nominalWeight }
        val contributions = SleepComponent.entries.map { c ->
            val s = subScores[c]
            if (s == null) SleepContribution(c, false, null, 0.0, 0.0)
            else (c.nominalWeight / availableWeight).let { w -> SleepContribution(c, true, s, w, w * s) }
        }
        val score = contributions.sumOf { it.points }.coerceIn(0.0, 100.0)

        // Duration is always available, so the behavioural weight is never zero.
        val behavioural = available.filter { it.isBehavioural }
        val behaviouralWeight = behavioural.sumOf { it.nominalWeight }
        val behaviouralScore =
            (behavioural.sumOf { it.nominalWeight * subScores.getValue(it)!! } / behaviouralWeight).coerceIn(0.0, 100.0)

        return SleepScoreResult(
            score = score,
            scorePercent = score.roundToInt(),
            behaviouralScore = behaviouralScore,
            availableWeight = availableWeight.coerceIn(0.0, 1.0),
            confidence = confidenceFor(availableWeight),
            contributions = contributions,
            needMinutes = needMinutes,
            durationTargetMinutes = durationTarget(needMinutes),
            asleepMinutes = asleep,
            deficitMinutes = (needMinutes - asleep).coerceAtLeast(0.0),
            restorationZ = combinedZ,
            restorativeFraction = restorativeFraction,
            deepFraction = deep?.takeIf { asleep > 0 }?.let { it / asleep },
            remFraction = rem?.takeIf { asleep > 0 }?.let { it / asleep },
            lightFraction = light?.takeIf { asleep > 0 }?.let { it / asleep },
            efficiencyPercent = efficiencyPercent,
            onsetStdDevMinutes = onsetSd,
            wakeStdDevMinutes = wakeSd,
            sufficientForRecovery = asleep >= config.sufficiencyFraction * needMinutes,
            regularityIndex = index,
        )
    }

    /** What the duration part is scored against: the need, but never less than the guideline minimum. */
    fun durationTarget(needMinutes: Double): Double = maxOf(needMinutes, config.guidelineMinimumMinutes)

    /** 0 at (target − 225 min), 100 at the target, linear between. */
    fun durationSubScore(asleepMinutes: Double, needMinutes: Double): Double {
        val zeroAt = durationTarget(needMinutes) - config.durationZeroShortfallMinutes
        return (100.0 * (asleepMinutes - zeroAt) / config.durationZeroShortfallMinutes).coerceIn(0.0, 100.0)
    }

    /**
     * Combined "good direction" z-score of the night's physiology, limited to ±3:
     *
     *   z = mean(−z_sleepingHR, z_HRV over those available) − 0.5 · max(0, z_breathing − 1)
     *
     * Null when neither sleeping heart rate nor HRV has a z-score. Breathing rate alone is not
     * enough: it only ever subtracts, so on its own it would report a constant "typical" value on
     * every ordinary night, which would be a made-up number rather than a measurement.
     */
    fun restorationZ(sleepingHeartRateZ: Double?, hrvZ: Double?, respiratoryRateZ: Double?): Double? {
        val clamp = config.restorationZClamp
        fun usable(z: Double?): Double? = z?.takeIf { it.isFinite() }?.coerceIn(-clamp, clamp)
        val autonomic = listOfNotNull(usable(sleepingHeartRateZ)?.let { -it }, usable(hrvZ))
        if (autonomic.isEmpty()) return null
        val breathingPenalty = usable(respiratoryRateZ)
            ?.let { config.respiratoryPenaltyPerSd * maxOf(0.0, it - config.respiratoryPenaltyThresholdZ) }
            ?: 0.0
        return (autonomic.average() - breathingPenalty).coerceIn(-clamp, clamp)
    }

    /** 80 at the personal baseline; +20 per SD calmer (100 at +1 SD); −30 per SD more strained. */
    fun restorationSubScoreForZ(combinedZ: Double): Double {
        val slope = if (combinedZ >= 0) config.restorationPointsPerSdAbove else config.restorationPointsPerSdBelow
        return (config.restorationNeutralSubScore + slope * combinedZ).coerceIn(0.0, 100.0)
    }

    /** [restorationZ] mapped through [restorationSubScoreForZ]; null when the part is unavailable. */
    fun restorationSubScore(sleepingHeartRateZ: Double?, hrvZ: Double?, respiratoryRateZ: Double? = null): Double? =
        restorationZ(sleepingHeartRateZ, hrvZ, respiratoryRateZ)?.let(::restorationSubScoreForZ)

    /**
     * Stage composition. With a personal baseline: 80 + 10 per SD from the user's own usual share,
     * and the absolute share plays no part. While that baseline is calibrating ([personalZ] null):
     * 80 inside the provisional 38–50 % band, proportionally less below it, up to 10 less above it.
     */
    fun qualitySubScore(fraction: Double, personalZ: Double?): Double {
        if (personalZ != null && personalZ.isFinite()) {
            return (config.qualityNeutralSubScore + config.qualityPointsPerSd * personalZ).coerceIn(0.0, 100.0)
        }
        val neutral = config.qualityNeutralSubScore
        val provisional = when {
            fraction < config.qualityBandLow -> neutral * fraction / config.qualityBandLow
            fraction <= config.qualityBandHigh -> neutral
            else -> neutral - minOf(
                config.qualityMaxExcessPenalty,
                (fraction - config.qualityBandHigh) * 100.0 * config.qualityExcessPenaltyPerPoint,
            )
        }
        return provisional.coerceIn(0.0, 100.0)
    }

    /** Piecewise linear: 0 at 65 %, 75 at 85 %, 100 at 95 %; then the long-awakening penalty. */
    fun efficiencySubScore(efficiencyPercent: Double, wakeBoutsOverThreeMinutes: Int?): Double {
        val floor = config.efficiencyFloorPercent
        val good = config.efficiencyGoodPercent
        val ceiling = config.efficiencyCeilingPercent
        val goodScore = config.efficiencyGoodSubScore
        val base = when {
            efficiencyPercent <= floor -> 0.0
            efficiencyPercent < good -> goodScore * (efficiencyPercent - floor) / (good - floor)
            efficiencyPercent < ceiling -> goodScore + (100.0 - goodScore) * (efficiencyPercent - good) / (ceiling - good)
            else -> 100.0
        }
        val extraBouts = ((wakeBoutsOverThreeMinutes ?: 0) - config.freeWakeBouts).coerceAtLeast(0)
        val penalty = (extraBouts * config.pointsPerExtraWakeBout).coerceAtMost(config.maxFragmentationPenalty)
        return (base - penalty).coerceIn(0.0, 100.0)
    }

    /** Fallback consistency from the bed/wake-time spread (direct callers only; see [Config.useTimingSpreadForConsistency]). */
    fun consistencySubScore(spreadMinutes: Double): Double {
        if (spreadMinutes <= config.consistencyFreeMinutes) return 100.0
        val span = config.consistencyZeroMinutes - config.consistencyFreeMinutes
        return (100.0 * (1 - (spreadMinutes - config.consistencyFreeMinutes) / span)).coerceIn(0.0, 100.0)
    }

    fun confidenceFor(availableWeight: Double): SleepScoreConfidence = when {
        availableWeight >= config.highConfidenceWeight - WEIGHT_EPSILON -> SleepScoreConfidence.HIGH
        availableWeight >= config.mediumConfidenceWeight - WEIGHT_EPSILON -> SleepScoreConfidence.MEDIUM
        else -> SleepScoreConfidence.LOW
    }

    private companion object {
        /** Sums of the decimal weights can land a rounding error below a threshold they equal. */
        const val WEIGHT_EPSILON = 1e-9
    }
}
