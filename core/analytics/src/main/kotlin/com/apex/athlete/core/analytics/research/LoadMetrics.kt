package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.strain.HeartRateZone

/** One logged exercise session, reduced to what weekly volume needs. */
data class ExerciseSessionSummary(val epochDay: Long, val activeMinutes: Double)

/** Weekly exercise volume and frequency from logged sessions. */
data class WeeklyExerciseVolume(val activeMinutes: Double, val sessions: Int, val exerciseDays: Int)

object LoadMetrics {

    private const val WEEK = 7

    /**
     * EX02. Edwards' summated heart-rate-zone score:
     *
     *   TRIMP = Σ minutes in zone k · k,   k = 1…5
     *
     * with zones at 50–60, 60–70, 70–80, 80–90 and 90–100 % of maximum heart rate (Edwards
     * 1993), the same boundaries as `ZoneMethod.PERCENT_OF_MAX_HEART_RATE`. Zone minutes
     * `[10, 20, 15, 0, 0]` score 95. The method comes from a coaching book; its peer-reviewed
     * standing is its use as the heart-rate criterion against which session RPE was validated
     * (Foster et al. 2001). Evidence class B: an established load formula with no validation
     * for individual decisions from a wrist device. The integer weights are part of the method,
     * not physiology. Complements the Banister TRIMP in
     * [com.apex.athlete.core.analytics.strain.Trimp]; the two are on different scales and must
     * not be mixed in one series.
     *
     * @param zoneMinutes minutes in zones 1 to 5, in that order.
     */
    fun edwardsTrimp(zoneMinutes: List<Double>): Double {
        require(zoneMinutes.size == 5) { "exactly five zone durations are required" }
        require(zoneMinutes.all { it.isFinite() && it >= 0.0 }) { "zone minutes must be >= 0" }
        return zoneMinutes.withIndex().sumOf { (i, minutes) -> (i + 1) * minutes }
    }

    /** Edwards TRIMP from a zone breakdown such as `StrainResult.minutesByZone`. Time below zone 1 scores nothing. */
    fun edwardsTrimp(minutesByZone: Map<HeartRateZone, Double>): Double =
        edwardsTrimp(
            HeartRateZone.entries
                .filter { it != HeartRateZone.BELOW_ZONES }
                .sortedBy { it.number }
                .map { minutesByZone[it] ?: 0.0 },
        )

    /**
     * Session-RPE load, `RPE (CR-10) × minutes` (Foster et al. 2001). A 6 held for 40 minutes is
     * 240 AU. The API carries no RPE, so this only exists when the user rates a session. Null
     * for a rating outside 0–10 or a non-positive duration.
     *
     * Not wired into load: whether manual-workout RPE feeds load is an open owner decision (docs/FORMULAS.md
     * section 5, "Open point: manual workouts and session-RPE"); the app's rating is 1–10, not CR-10 0–10.
     */
    fun sessionRpeLoad(rpe: Double?, minutes: Double?): Double? {
        if (rpe == null || minutes == null) return null
        if (!rpe.isFinite() || rpe !in 0.0..10.0 || !minutes.isFinite() || minutes <= 0.0) return null
        return rpe * minutes
    }

    // EX03 Foster monotony and strain are reported by load/TrainingLoadEngine (monotony, fosterStrain: last 7 days,
    // at least 6 recorded, monotony capped at 10 when the loads barely vary). The research's strict duplicate
    // (all seven days known, undefined for identical loads) was removed; the research vector T-EX03-a is checked
    // against the engine in LoadMetricsTest.

    /**
     * Weekly exercise volume and frequency: the sum of active minutes, the number of sessions
     * and the number of distinct days with a session in the seven days ending on [weekEndDay].
     * Counts of what was logged; a week without logged sessions is a true zero only if the
     * week has synced, which the caller must know.
     */
    fun weeklyExerciseVolume(sessions: List<ExerciseSessionSummary>, weekEndDay: Long): WeeklyExerciseVolume {
        val week = sessions.filter {
            it.epochDay in (weekEndDay - WEEK + 1)..weekEndDay && it.activeMinutes.isFinite() && it.activeMinutes > 0.0
        }
        return WeeklyExerciseVolume(
            activeMinutes = week.sumOf { it.activeMinutes },
            sessions = week.size,
            exerciseDays = week.map { it.epochDay }.distinct().size,
        )
    }
}
