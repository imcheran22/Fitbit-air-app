package com.apex.athlete.core.analytics.breathe

enum class BreathePhaseType { INHALE, TOP_UP_INHALE, HOLD_AFTER_INHALE, EXHALE, HOLD_AFTER_EXHALE }

data class BreathePhase(val type: BreathePhaseType, val durationMillis: Long) {
    init { require(durationMillis > 0) }
}

/**
 * Where a session is at a given time.
 *
 * @property phaseProgress 0.0 (inclusive) to 1.0 (exclusive) through the current phase.
 * @property completedCycles whole cycles finished before this moment.
 * @property elapsedInPhaseMillis time since the current phase began.
 */
data class BreatheState(
    val type: BreathePhaseType,
    val phaseIndex: Int,
    val phaseProgress: Double,
    val elapsedInPhaseMillis: Long,
    val completedCycles: Int,
)

/**
 * Catalogue of paced-breathing patterns and their timing. This is a timer: it makes no claim about effects on health, stress or
 * heart-rate variability beyond describing the pace of the breathing. The phase lengths are the usual published names of each
 * pattern (box 4-4-4-4, 4-7-8, coherent breathing at about 5.5 breaths a minute, 4 in / 6 out) except the physiological sigh,
 * whose 2 s + 1 s inhale and 6 s exhale are an Apex calibration choice (the pattern is "a double inhale, then a long exhale";
 * no source for exact durations was opened). Which pattern to show, and its wording, is up to the caller.
 */
enum class BreathePattern(val phases: List<BreathePhase>) {
    /** Box breathing: 4 s in, 4 s hold, 4 s out, 4 s hold. */
    BOX(listOf(p(BreathePhaseType.INHALE, 4_000), p(BreathePhaseType.HOLD_AFTER_INHALE, 4_000), p(BreathePhaseType.EXHALE, 4_000), p(BreathePhaseType.HOLD_AFTER_EXHALE, 4_000))),

    /** 4-7-8: 4 s in, 7 s hold, 8 s out. */
    FOUR_SEVEN_EIGHT(listOf(p(BreathePhaseType.INHALE, 4_000), p(BreathePhaseType.HOLD_AFTER_INHALE, 7_000), p(BreathePhaseType.EXHALE, 8_000))),

    /** Coherent breathing: 5.5 s in, 5.5 s out (about 5.5 breaths a minute). */
    COHERENT(listOf(p(BreathePhaseType.INHALE, 5_500), p(BreathePhaseType.EXHALE, 5_500))),

    /** Extended exhale: 4 s in, 6 s out. */
    EXTENDED_EXHALE(listOf(p(BreathePhaseType.INHALE, 4_000), p(BreathePhaseType.EXHALE, 6_000))),

    /** Physiological sigh: inhale 2 s, a second short inhale 1 s, then a long exhale 6 s (durations are a calibration choice). */
    PHYSIOLOGICAL_SIGH(listOf(p(BreathePhaseType.INHALE, 2_000), p(BreathePhaseType.TOP_UP_INHALE, 1_000), p(BreathePhaseType.EXHALE, 6_000)));

    val cycleMillis: Long = phases.sumOf { it.durationMillis }

    /** State [elapsedMillis] after the session started. Negative time is an error, not "before the start". */
    fun phaseAt(elapsedMillis: Long): BreatheState {
        require(elapsedMillis >= 0) { "elapsedMillis must not be negative" }
        val completed = elapsedMillis / cycleMillis
        var within = elapsedMillis % cycleMillis
        for ((i, phase) in phases.withIndex()) {
            if (within < phase.durationMillis) {
                return BreatheState(phase.type, i, within.toDouble() / phase.durationMillis, within, completed.toInt())
            }
            within -= phase.durationMillis
        }
        error("unreachable: within < cycleMillis")
    }

    /** Whole cycles that fit in [durationSeconds] (rounded down; a partial last cycle is not counted). */
    fun cyclesFor(durationSeconds: Int): Int {
        require(durationSeconds >= 0) { "durationSeconds must not be negative" }
        return (durationSeconds * 1000L / cycleMillis).toInt()
    }
}

private fun p(type: BreathePhaseType, ms: Long) = BreathePhase(type, ms)
