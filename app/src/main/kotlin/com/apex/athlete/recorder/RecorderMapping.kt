package com.apex.athlete.recorder

/** Arguments for `AthleteRepository.addManualWorkout`, built from a stopped session. */
data class ManualWorkoutArgs(val startMillis: Long, val durationMinutes: Int, val name: String, val type: String, val rpe: Int)

object RecorderMapping {
    /** Shorter recordings are offered for discard only: the repository stores whole minutes. */
    const val MIN_SAVABLE_MILLIS = 30_000L
    const val MAX_MINUTES = 600
    const val DEFAULT_TYPE = "OTHER_WORKOUT"

    fun isSavable(session: RecorderSession): Boolean =
        session.phase == RecorderPhase.STOPPED && session.activeBeforeSegmentMillis >= MIN_SAVABLE_MILLIS

    /** Null when the session is not stopped, too short, or the rating is outside 1..10. */
    fun toManualWorkout(session: RecorderSession, rpe: Int, name: String, type: String = DEFAULT_TYPE): ManualWorkoutArgs? {
        if (!isSavable(session) || rpe !in 1..10) return null
        val minutes = Math.round(session.activeBeforeSegmentMillis / 60_000.0).toInt().coerceIn(1, MAX_MINUTES)
        return ManualWorkoutArgs(session.startedAtMillis, minutes, name.trim().take(60), type, rpe)
    }
}
