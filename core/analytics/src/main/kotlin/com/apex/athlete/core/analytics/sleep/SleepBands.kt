package com.apex.athlete.core.analytics.sleep

/** Display band of a sleep figure. Presentation only; every threshold below is a calibration choice. */
enum class SleepBand { POOR, SUFFICIENT, OPTIMAL }

/**
 * Poor / Sufficient / Optimal for the sleep screen, aligned with the formula-version-5 scale (an ordinary adequate
 * night scores about 75-85, an ideal one 100, a short or physiologically poor one about 55-75). Resolves the
 * "Sleep Poor/Sufficient/Optimal bands" open point (docs/FORMULAS.md section 4, docs/OPEN_POINTS.md). None of these
 * thresholds is a validated sleep-quality cut-off; they set where typical nights land.
 */
object SleepBands {
    const val SUFFICIENT_FROM = 70.0
    const val OPTIMAL_FROM = 85.0

    /** Below this share of the duration target the overall label is at most Sufficient (the engine's own 90 % rule). */
    const val SUFFICIENT_DURATION_FRACTION = 0.90

    /** Below this share of the duration target the overall label is Poor whatever the score. */
    const val POOR_DURATION_FRACTION = 0.70

    /** Raw efficiency (asleep / in bed, %): Optimal from 85 % (Ohayon et al. 2017 "good quality" indicator), Poor below 75 %. */
    const val EFFICIENCY_OPTIMAL_PERCENT = 85.0
    const val EFFICIENCY_SUFFICIENT_PERCENT = 75.0

    /** Restoration z: Poor at or below -1 SD (sub-score 50), Optimal from +0.5 SD (sub-score 90). */
    const val RESTORATION_POOR_Z = -1.0
    const val RESTORATION_OPTIMAL_Z = 0.5

    /** A 0..100 figure: Poor below 70, Sufficient from 70, Optimal from 85. Null for a missing or non-finite figure. */
    fun ofScore(score: Double?): SleepBand? = when {
        score == null || !score.isFinite() -> null
        score >= OPTIMAL_FROM -> SleepBand.OPTIMAL
        score >= SUFFICIENT_FROM -> SleepBand.SUFFICIENT
        else -> SleepBand.POOR
    }

    /**
     * Overall score band, capped by duration: a night under 90 % of the target is at most Sufficient and under 70 %
     * Poor, so a short night can never be labelled Optimal on the strength of its other parts.
     */
    fun overall(result: SleepScoreResult): SleepBand {
        val byScore = ofScore(result.score) ?: SleepBand.POOR
        val share = result.asleepMinutes / result.durationTargetMinutes
        return when {
            share < POOR_DURATION_FRACTION -> SleepBand.POOR
            share < SUFFICIENT_DURATION_FRACTION -> minOf(byScore, SleepBand.SUFFICIENT)
            else -> byScore
        }
    }

    /** Duration row on time asleep against the target: Poor below 90 %, Sufficient below 100 %, Optimal when met. */
    fun duration(asleepMinutes: Double, targetMinutes: Double): SleepBand? {
        if (!asleepMinutes.isFinite() || !targetMinutes.isFinite() || targetMinutes <= 0) return null
        val share = asleepMinutes / targetMinutes
        return when {
            share >= 1.0 -> SleepBand.OPTIMAL
            share >= SUFFICIENT_DURATION_FRACTION -> SleepBand.SUFFICIENT
            else -> SleepBand.POOR
        }
    }

    /** Efficiency row on the raw percentage. */
    fun efficiency(percent: Double?): SleepBand? = when {
        percent == null || !percent.isFinite() -> null
        percent >= EFFICIENCY_OPTIMAL_PERCENT -> SleepBand.OPTIMAL
        percent >= EFFICIENCY_SUFFICIENT_PERCENT -> SleepBand.SUFFICIENT
        else -> SleepBand.POOR
    }

    /**
     * Stage-quality row on the engine's QUALITY sub-score, never on the raw deep + REM share (a normal 45 % share would
     * otherwise read as Poor). 80 = the personal usual, so the usual is Sufficient; Optimal from +0.5 SD.
     */
    fun quality(subScore: Double?): SleepBand? = ofScore(subScore)

    /** Consistency row on the consistency sub-score (the Sleep Regularity Index limited to 0..100). */
    fun consistency(subScore: Double?): SleepBand? = ofScore(subScore)

    /** Restoration row on the combined z ([SleepScoreResult.restorationZ]); null while unavailable. */
    fun restoration(z: Double?): SleepBand? = when {
        z == null || !z.isFinite() -> null
        z >= RESTORATION_OPTIMAL_Z -> SleepBand.OPTIMAL
        z > RESTORATION_POOR_Z -> SleepBand.SUFFICIENT
        else -> SleepBand.POOR
    }
}
