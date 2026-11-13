package com.apex.athlete.core.analytics.recovery

import com.apex.athlete.core.domain.DataProvenance
import kotlin.math.exp
import kotlin.math.roundToInt

/**
 * Inputs to the recovery score. Each can be absent.
 *
 * Two kinds of input (formula version 3):
 * - **Weighted** (HRV, resting heart rate, sleep, the optional fatigue rating): the score is their
 *   weighted mean, re-weighted around whichever are present.
 * - **Penalty-only** ([isPenaltyOnly]: breathing rate, skin temperature, workload ratio): they
 *   never enter the mean. Each present one subtracts `nominalWeight * (100 - subScore)` points,
 *   so a sensor that did not sync, or one that reads normal, changes nothing.
 *
 * @property nominalWeight weight of the input. For weighted inputs the weights of the present ones
 *   are renormalised to sum to 1; for penalty-only inputs it is the largest number of points per
 *   cent of sub-score shortfall (so 0.05 means at most 5 points).
 * @property neutralSubScore sub-score that represents "nothing notable"; contributions are
 *   reported relative to it so the user sees what helped and what hurt.
 */
enum class RecoveryComponent(
    val nominalWeight: Double,
    val neutralSubScore: Double,
    val isOptional: Boolean,
    val isPenaltyOnly: Boolean = false,
) {
    HRV(0.40, 50.0, false),
    RESTING_HEART_RATE(0.25, 50.0, false),
    SLEEP(0.25, 75.0, false),
    RESPIRATORY_RATE(0.05, 100.0, false, isPenaltyOnly = true),
    SKIN_TEMPERATURE(0.05, 100.0, false, isPenaltyOnly = true),
    SUBJECTIVE_FATIGUE(0.10, 50.0, true),
    TRAINING_LOAD(0.05, 100.0, true, isPenaltyOnly = true),
}

/**
 * @property hrvZ z-score of last night's HRV against the personal 30-day baseline (ln RMSSD scale).
 * @property restingHeartRateZ z-score of today's resting heart rate against its baseline.
 * @property sleepScore last night's sleep score, 0..100.
 * @property respiratoryRateZ z-score of the overnight breathing rate against its baseline.
 * @property skinTemperatureZ nightly skin-temperature deviation divided by its usual spread.
 * @property subjectiveFatigue optional self-rating, 1 (fresh) to 10 (exhausted).
 * @property acuteChronicRatio optional acute:chronic workload ratio; pass null when it is flagged unreliable.
 * @property autonomicBaselineCalibrating true while HRV and RHR baselines are still being learned,
 *   so a missing score can be reported as "calibrating" rather than "no data".
 * @property calibrationDaysRemaining days of readings still needed, when known.
 */
data class RecoveryInputs(
    val hrvZ: Double? = null,
    val restingHeartRateZ: Double? = null,
    val sleepScore: Double? = null,
    val respiratoryRateZ: Double? = null,
    val skinTemperatureZ: Double? = null,
    val subjectiveFatigue: Int? = null,
    val acuteChronicRatio: Double? = null,
    val autonomicBaselineCalibrating: Boolean = false,
    val calibrationDaysRemaining: Int? = null,
)

enum class RecoveryStatus {
    SCORED,
    /** Personal baselines are not established yet (fewer than 7 valid days). */
    CALIBRATING,
    /** Neither HRV nor resting heart rate is available for the day. */
    UNAVAILABLE,
}

enum class RecoveryCategory(val label: String) {
    PEAK("Peak"),
    MODERATE("Moderate"),
    RESTORATIVE("Restorative"),
}

enum class TrainingRecommendation { TRAIN_HARD, TRAIN_MODERATE, PRIORITIZE_RECOVERY }

data class RecoveryContribution(
    val component: RecoveryComponent,
    val available: Boolean,
    /** 0..100, null when the input was not available. */
    val subScore: Double?,
    val nominalWeight: Double,
    /**
     * Weight in the weighted mean after redistributing the weights of missing inputs. Always 0 for
     * penalty-only inputs and for unavailable ones.
     */
    val effectiveWeight: Double,
    /**
     * This input's share of the final score, in points: `effectiveWeight × subScore` for weighted
     * inputs, `−nominalWeight × (100 − subScore)` for penalty-only ones. Before the 0..100 clamp
     * the points of all inputs add up to the score.
     */
    val points: Double,
    /**
     * Positive helped the score, negative lowered it: `effectiveWeight × (subScore − neutral)` for
     * weighted inputs; for penalty-only inputs the same as [points].
     */
    val impact: Double,
)

data class RecoveryResult(
    val status: RecoveryStatus,
    /** 0..100 with decimals; null unless [status] is SCORED. */
    val score: Double?,
    /** [score] rounded to a whole percentage, the number shown to the user. */
    val scorePercent: Int?,
    val category: RecoveryCategory?,
    val recommendation: TrainingRecommendation?,
    val contributions: List<RecoveryContribution>,
    /** Inputs that raised the score, strongest first. */
    val positiveContributors: List<RecoveryContribution>,
    /** Inputs that lowered the score, strongest first. */
    val negativeContributors: List<RecoveryContribution>,
    val missingComponents: List<RecoveryComponent>,
    val calibrationDaysRemaining: Int?,
    val provenance: DataProvenance,
)

/**
 * Daily recovery score (0–100), formula version 3.
 *
 *   score = Σ wᵢ' · Sᵢ  −  Σ wₖ · (100 − Sₖ)
 *           weighted inputs i (HRV, resting HR, sleep, fatigue rating), wᵢ' = wᵢ / Σ wⱼ (present)
 *           penalty-only inputs k (breathing rate, skin temperature, workload ratio), if present
 *
 * Because the weights of missing weighted inputs are redistributed in proportion to the remaining
 * ones, the score spans the full 0–100 range no matter which of them exist. A penalty-only input
 * is never part of that mean (version 2 put it in with a neutral 100, so a sensor that did not
 * sync lowered the score by pulling the other weights up; B1 in docs/review/METRICS_ALIGNMENT.md).
 * At least one autonomic marker (HRV or resting heart rate) is required; sleep alone is not a
 * recovery score.
 *
 * Evidence: the inputs follow published practice (ln RMSSD against a personal baseline, Plews
 * et al. 2013; resting heart rate against a personal baseline, Buchheit 2014), but the weights,
 * the logistic steepness, the penalty slopes and the 34/67 category edges are Apex calibration
 * choices. The composite has not been validated against any outcome; it is a summary, not a
 * diagnosis.
 */
class RecoveryEngine(private val config: Config = Config()) {

    data class Config(
        /** Steepness of the logistic curve that maps a z-score to a 0–100 sub-score. */
        val logisticSteepness: Double = 1.2,
        /** A resting heart rate further below baseline than this (in SD) earns no extra credit. */
        val restingHeartRateBenefitFloorZ: Double = -2.0,
        /** Breathing-rate / temperature z-scores above this start to cost points. */
        val stabilityPenaltyThresholdZ: Double = 1.0,
        /** Points lost per SD beyond the threshold for an elevated reading. */
        val elevatedPenaltyPerSd: Double = 40.0,
        /** Points lost per SD beyond the threshold for a lowered skin temperature. */
        val loweredTemperaturePenaltyPerSd: Double = 20.0,
        /** Workload ratio up to which training load costs nothing. */
        val loadRatioNoPenalty: Double = 1.30,
        /** Workload ratio at which the training-load sub-score reaches zero. */
        val loadRatioZeroScore: Double = 2.00,
        val peakThreshold: Int = 67,
        val moderateThreshold: Int = 34,
        /** Contributions smaller than this many points are not listed as helping or hurting. */
        val contributorMinImpact: Double = 1.0,
    )

    fun evaluate(inputs: RecoveryInputs): RecoveryResult {
        // A non-finite input (NaN, ±Infinity) is treated exactly like a missing one: it never
        // reaches the arithmetic, so it can neither poison the score nor crash the rounding.
        fun Double?.finite(): Double? = this?.takeIf { it.isFinite() }
        val subScores: Map<RecoveryComponent, Double?> = mapOf(
            RecoveryComponent.HRV to inputs.hrvZ.finite()?.let(::hrvSubScore),
            RecoveryComponent.RESTING_HEART_RATE to inputs.restingHeartRateZ.finite()?.let(::restingHeartRateSubScore),
            RecoveryComponent.SLEEP to inputs.sleepScore.finite()?.coerceIn(0.0, 100.0),
            RecoveryComponent.RESPIRATORY_RATE to inputs.respiratoryRateZ.finite()?.let(::respiratoryRateSubScore),
            RecoveryComponent.SKIN_TEMPERATURE to inputs.skinTemperatureZ.finite()?.let(::skinTemperatureSubScore),
            RecoveryComponent.SUBJECTIVE_FATIGUE to inputs.subjectiveFatigue?.let(::subjectiveFatigueSubScore),
            RecoveryComponent.TRAINING_LOAD to inputs.acuteChronicRatio.finite()?.let(::trainingLoadSubScore),
        )

        val missing = RecoveryComponent.entries.filter { !it.isOptional && subScores[it] == null }
        val hasAutonomicMarker =
            subScores[RecoveryComponent.HRV] != null || subScores[RecoveryComponent.RESTING_HEART_RATE] != null

        if (!hasAutonomicMarker) {
            return RecoveryResult(
                status = if (inputs.autonomicBaselineCalibrating) RecoveryStatus.CALIBRATING else RecoveryStatus.UNAVAILABLE,
                score = null, scorePercent = null, category = null, recommendation = null,
                contributions = RecoveryComponent.entries.map { unavailable(it) },
                positiveContributors = emptyList(), negativeContributors = emptyList(),
                missingComponents = missing,
                calibrationDaysRemaining = inputs.calibrationDaysRemaining,
                provenance = DataProvenance.UNAVAILABLE,
            )
        }

        // Weighted mean over the inputs that are present; penalty-only inputs stay out of it.
        val weightSum = RecoveryComponent.entries
            .filter { !it.isPenaltyOnly && subScores[it] != null }
            .sumOf { it.nominalWeight }
        val contributions = RecoveryComponent.entries.map { component ->
            val s = subScores[component] ?: return@map unavailable(component)
            if (component.isPenaltyOnly) {
                val points = -component.nominalWeight * (100.0 - s)
                RecoveryContribution(
                    component = component,
                    available = true,
                    subScore = s,
                    nominalWeight = component.nominalWeight,
                    effectiveWeight = 0.0,
                    points = points,
                    impact = points,
                )
            } else {
                val w = component.nominalWeight / weightSum
                RecoveryContribution(
                    component = component,
                    available = true,
                    subScore = s,
                    nominalWeight = component.nominalWeight,
                    effectiveWeight = w,
                    points = w * s,
                    impact = w * (s - component.neutralSubScore),
                )
            }
        }

        val score = contributions.sumOf { it.points }.coerceIn(0.0, 100.0)
        val percent = score.roundToInt()
        val category = when {
            percent >= config.peakThreshold -> RecoveryCategory.PEAK
            percent >= config.moderateThreshold -> RecoveryCategory.MODERATE
            else -> RecoveryCategory.RESTORATIVE
        }

        return RecoveryResult(
            status = RecoveryStatus.SCORED,
            score = score,
            scorePercent = percent,
            category = category,
            recommendation = when (category) {
                RecoveryCategory.PEAK -> TrainingRecommendation.TRAIN_HARD
                RecoveryCategory.MODERATE -> TrainingRecommendation.TRAIN_MODERATE
                RecoveryCategory.RESTORATIVE -> TrainingRecommendation.PRIORITIZE_RECOVERY
            },
            contributions = contributions,
            positiveContributors = contributions
                .filter { it.available && it.impact >= config.contributorMinImpact }
                .sortedByDescending { it.impact },
            negativeContributors = contributions
                .filter { it.available && it.impact <= -config.contributorMinImpact }
                .sortedBy { it.impact },
            missingComponents = missing,
            calibrationDaysRemaining = null,
            provenance = DataProvenance.MATHEMATICALLY_DERIVED,
        )
    }

    /** S = 100 / (1 + e^(−k·z)): 50 at the personal baseline, rising with higher HRV. */
    fun hrvSubScore(z: Double): Double = logistic(z)

    /**
     * S = 100 / (1 + e^(k·z′)), z′ = max(z, floor). A lower resting heart rate than usual scores
     * higher, but only down to [Config.restingHeartRateBenefitFloorZ].
     */
    fun restingHeartRateSubScore(z: Double): Double =
        logistic(-maxOf(z, config.restingHeartRateBenefitFloorZ))

    /** 100 until the breathing rate is more than the threshold above baseline, then linear loss. */
    fun respiratoryRateSubScore(z: Double): Double =
        (100.0 - config.elevatedPenaltyPerSd * maxOf(0.0, z - config.stabilityPenaltyThresholdZ))
            .coerceIn(0.0, 100.0)

    /** Penalises a raised skin temperature, and (half as much) an unusually lowered one. */
    fun skinTemperatureSubScore(z: Double): Double {
        val raised = config.elevatedPenaltyPerSd * maxOf(0.0, z - config.stabilityPenaltyThresholdZ)
        val lowered = config.loweredTemperaturePenaltyPerSd * maxOf(0.0, -z - config.stabilityPenaltyThresholdZ)
        return (100.0 - raised - lowered).coerceIn(0.0, 100.0)
    }

    /** Linear map of the 1–10 rating: 1 → 100, 10 → 0. */
    fun subjectiveFatigueSubScore(rating: Int): Double =
        100.0 * (10 - rating.coerceIn(1, 10)) / 9.0

    /** 100 while the workload ratio is at or below the safe limit, falling linearly to 0. */
    fun trainingLoadSubScore(ratio: Double): Double {
        if (ratio <= config.loadRatioNoPenalty) return 100.0
        val span = config.loadRatioZeroScore - config.loadRatioNoPenalty
        return (100.0 * (config.loadRatioZeroScore - ratio) / span).coerceIn(0.0, 100.0)
    }

    private fun logistic(z: Double): Double = 100.0 / (1.0 + exp(-config.logisticSteepness * z))

    private fun unavailable(component: RecoveryComponent) = RecoveryContribution(
        component = component,
        available = false,
        subScore = null,
        nominalWeight = component.nominalWeight,
        effectiveWeight = 0.0,
        points = 0.0,
        impact = 0.0,
    )
}
