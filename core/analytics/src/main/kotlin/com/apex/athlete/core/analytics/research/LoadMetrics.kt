package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.load.DailyLoad
import com.apex.athlete.core.analytics.stats.Stats
import com.apex.athlete.core.analytics.strain.HeartRateZone

/**
 * EX03. One complete week of daily load.
 *
 * @property monotony mean daily load / SD of daily load. Null when every day carried the same
 *   load (the ratio is undefined) or the week had no load at all.
 * @property strain weekly load × monotony; null whenever [monotony] is.
 */
data class FosterWeek(
    val weeklyLoad: Double,
    val meanDailyLoad: Double,
    val sdDailyLoad: Double,
    val monotony: Double?,
    val strain: Double?,
)

/** One logged exercise session, reduced to what weekly volume needs. */
data class ExerciseSessionSummary(val epochDay: Long, val activeMinutes: Double)

/** Weekly exercise volume and frequency from logged sessions. */
data class WeeklyExerciseVolume(val activeMinutes: Double, val sessions: Int, val exerciseDays: Int)

object LoadMetrics {

    private const val WEEK = 7

    /** Relative SD below which daily loads count as identical. Floating-point tolerance, not physiology. */
    private const val RELATIVE_SD_EPSILON = 1e-9

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
     */
    fun sessionRpeLoad(rpe: Double?, minutes: Double?): Double? {
        if (rpe == null || minutes == null) return null
        if (!rpe.isFinite() || rpe !in 0.0..10.0 || !minutes.isFinite() || minutes <= 0.0) return null
        return rpe * minutes
    }

    /**
     * EX03. Foster's training monotony and strain for one week (Foster 1998):
     *
     *   monotony = mean(daily load) / SD(daily load)        strain = weekly load · monotony
     *
     * Daily loads `[300, 0, 450, 200, 0, 500, 150]` give monotony 1.1446 and strain 1831.3.
     * Foster 1998 followed 25 competitive athletes and related high monotony and strain to
     * illness; the often-quoted "monotony above 2" is a heuristic from that work and has not
     * been validated for predicting injury or illness in an individual, so no threshold is
     * applied. Evidence class C–B; descriptive.
     *
     * This is the strict form: all seven days must be known. A rest day is a load of 0 and
     * belongs in the week; a day without data is null and makes the week incomplete, because
     * dropping it or reading it as rest would both change the ratio. (The `TrainingLoadEngine`
     * reports the same quantities inside its daily result, tolerating one missing day and
     * capping monotony at 10; the two agree on a complete week with varied loads.)
     *
     * @param dailyLoads seven daily loads on one scale (Banister TRIMP, Edwards TRIMP or session
     *   RPE), oldest first.
     */
    fun fosterWeek(dailyLoads: List<Double?>): FosterWeek? {
        if (dailyLoads.size != WEEK) return null
        val loads = dailyLoads.map { it ?: return null }
        if (loads.any { !it.isFinite() || it < 0.0 }) return null
        val mean = Stats.mean(loads)!!
        val sd = Stats.sampleStdDev(loads)!!
        // A week of identical loads has an SD of rounding residue (about 1e-14), not zero.
        val monotony = if (sd > RELATIVE_SD_EPSILON * maxOf(1.0, mean) && mean > 0.0) mean / sd else null
        val total = loads.sum()
        return FosterWeek(total, mean, sd, monotony, monotony?.let { total * it })
    }

    /** [fosterWeek] for the seven days ending on [weekEndDay] of a dated TRIMP history. */
    fun fosterWeek(history: List<DailyLoad>, weekEndDay: Long): FosterWeek? {
        val byDay = history.associateBy({ it.epochDay }, { it.trimp })
        return fosterWeek(((weekEndDay - WEEK + 1)..weekEndDay).map { byDay[it] })
    }

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
