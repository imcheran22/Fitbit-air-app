package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.stats.Stats
import com.apex.athlete.core.analytics.strain.HeartRateSample

/**
 * One heart-rate reading placed on a time axis in seconds. The origin depends on the use: the
 * end of the exercise for heart-rate recovery, the start of the session for drift.
 */
data class TimedHeartRate(val seconds: Double, val bpm: Double)

/** CV04 context: this session's HRR against the median of the person's recent comparable sessions. */
data class RecoveryComparison(val medianOfPrevious: Double, val delta: Double, val sessionsCompared: Int)

/** CV05. Mean heart rate of the two halves of a steady session and the rise between them. */
data class HeartRateDrift(
    val firstHalfMeanBpm: Double,
    val secondHalfMeanBpm: Double,
    val driftPercent: Double,
    val durationMinutes: Double,
)

/** CV07. Minutes above resting heart rate + offset, out of the minutes that had a reading. */
data class ActiveThresholdTime(val thresholdBpm: Double, val minutesAbove: Double, val recordedMinutes: Double)

object CardioMetrics {

    /** Heart-rate readings outside this range are sensor artefacts and are dropped and counted. */
    const val MIN_PLAUSIBLE_BPM = 25.0
    const val MAX_PLAUSIBLE_BPM = 250.0

    private fun plausible(bpm: Double): Boolean = bpm.isFinite() && bpm in MIN_PLAUSIBLE_BPM..MAX_PLAUSIBLE_BPM

    /**
     * CV02. Day-to-day spread of resting heart rate: mean, SD and `CV = 100 · SD / mean` over the
     * [windowDays] days ending on [asOfDay].
     *
     * Evidence class C: no study supports a threshold for the CV of a consumer device's daily
     * resting heart rate, and its noise floor is undefined. Descriptive context only. The
     * 14-day window follows the research; requiring 10 valid days is a calibration choice.
     */
    fun restingHeartRateVariability(
        history: List<DailyValue>,
        asOfDay: Long,
        windowDays: Int = 14,
        minValidDays: Int = 10,
    ): DescriptiveSummary? {
        val values = history.windowValues(asOfDay - windowDays + 1, asOfDay + 1).filter(::plausible)
        if (values.size < maxOf(minValidDays, 2)) return null
        return InterpretationStats.describe(values)
    }

    // CV04 heart-rate recovery itself is strain/HeartRateRecovery.kt (per-minute peak minus the first and second
    // full minute after the workout; Cole et al. 1999 cut-off deliberately not applied). The research's duplicate
    // (±5 s smoothing of sub-minute samples) was removed; only the session comparison below is new.

    /**
     * CV04 context: [currentHrr] (a drop from [com.apex.athlete.core.analytics.strain.HeartRateRecovery], e.g.
     * `dropAt60`) minus the median of the last [sessions] comparable sessions
     * (most recent last). The research asks for the last five; accepting three is a calibration
     * choice. "Comparable" (same activity, same way of stopping) is the caller's responsibility.
     */
    fun compareWithRecentSessions(
        currentHrr: Double,
        previousHrr: List<Double>,
        sessions: Int = 5,
        minSessions: Int = 3,
    ): RecoveryComparison? {
        val recent = previousHrr.filter { it.isFinite() }.takeLast(sessions)
        if (recent.size < minSessions) return null
        val median = Stats.median(recent)!!
        return RecoveryComparison(median, currentHrr - median, recent.size)
    }

    /**
     * CV05. Heart-rate drift, `100 · (HR₂ − HR₁) / HR₁`, the rise of mean heart rate from the
     * first to the second half of a steady session. 138 → 146 bpm is +5.8 %.
     *
     * Evidence class C: used in training practice, no validated threshold. Heat, hydration,
     * terrain and caffeine all raise it. Descriptive only.
     */
    fun heartRateDriftPercent(firstHalfMeanBpm: Double, secondHalfMeanBpm: Double): Double? {
        if (!plausible(firstHalfMeanBpm) || !plausible(secondHalfMeanBpm)) return null
        return 100.0 * (secondHalfMeanBpm - firstHalfMeanBpm) / firstHalfMeanBpm
    }

    /**
     * CV05 from a recorded series: the session is split at the middle of its time span and the
     * mean heart rates of the halves are compared with [heartRateDriftPercent].
     *
     * Whether the session was steady (constant pace, no intervals) cannot be seen from heart
     * rate alone; the caller must only pass sessions it knows to be steady. The 20-minute minimum
     * and the 10 readings per half are calibration choices.
     */
    fun heartRateDrift(
        samples: List<TimedHeartRate>,
        minDurationMinutes: Double = 20.0,
        minSamplesPerHalf: Int = 10,
    ): HeartRateDrift? {
        val valid = samples.filter { it.seconds.isFinite() && plausible(it.bpm) }
        if (valid.isEmpty()) return null
        val start = valid.minOf { it.seconds }
        val end = valid.maxOf { it.seconds }
        val minutes = (end - start) / 60.0
        if (minutes < minDurationMinutes) return null
        val middle = (start + end) / 2
        val first = valid.filter { it.seconds < middle }.map { it.bpm }
        val second = valid.filter { it.seconds >= middle }.map { it.bpm }
        if (first.size < minSamplesPerHalf || second.size < minSamplesPerHalf) return null
        val m1 = Stats.mean(first)!!
        val m2 = Stats.mean(second)!!
        return HeartRateDrift(m1, m2, heartRateDriftPercent(m1, m2) ?: return null, minutes)
    }

    /**
     * CV05 with pace: aerobic decoupling, `100 · (EF₁ − EF₂) / EF₁` with the efficiency factor
     * `EF = speed / heart rate` of each half. 0.050 → 0.0464 is 7.2 %. Needs speed from a
     * phone-GPS workout; the band has no GPS. Evidence class C, descriptive, same confounders as
     * [heartRateDriftPercent].
     */
    fun aerobicDecouplingPercent(
        firstHalfSpeed: Double,
        firstHalfMeanBpm: Double,
        secondHalfSpeed: Double,
        secondHalfMeanBpm: Double,
    ): Double? {
        if (!plausible(firstHalfMeanBpm) || !plausible(secondHalfMeanBpm)) return null
        if (!(firstHalfSpeed > 0.0) || !(secondHalfSpeed > 0.0)) return null
        if (!firstHalfSpeed.isFinite() || !secondHalfSpeed.isFinite()) return null
        val ef1 = firstHalfSpeed / firstHalfMeanBpm
        val ef2 = secondHalfSpeed / secondHalfMeanBpm
        return 100.0 * (ef1 - ef2) / ef1
    }

    /**
     * CV07. Time with heart rate above `resting heart rate + offset`.
     *
     * The 20 bpm offset is a calibration choice with no clinical meaning, and the metric is
     * evidence class C: optical heart rate cannot tell movement from posture, heat or stress.
     * The caller must leave recorded exercise sessions and sleep out of [samples].
     *
     * @return null when the resting heart rate is unknown or no plausible reading exists; a
     *   result of zero minutes therefore always means "measured, and never above".
     */
    fun minutesAboveActiveThreshold(
        samples: List<HeartRateSample>,
        restingHeartRate: Double?,
        offsetBpm: Double = 20.0,
    ): ActiveThresholdTime? {
        if (restingHeartRate == null || !plausible(restingHeartRate)) return null
        val threshold = restingHeartRate + offsetBpm
        var above = 0.0
        var recorded = 0.0
        for (s in samples) {
            if (s.durationMinutes <= 0.0 || !plausible(s.bpm)) continue
            recorded += s.durationMinutes
            if (s.bpm > threshold) above += s.durationMinutes
        }
        if (recorded <= 0.0) return null
        return ActiveThresholdTime(threshold, above, recorded)
    }

    // AR04 sleeping heart-rate dip is sleep/HeartRateDip.kt (persisted as HR_DIP since formula version 4). The
    // research's duplicate was removed; see docs/RESEARCH_GAP_MATRIX.md for its stricter coverage rule and its
    // objection to the 10 % blood-pressure threshold, which HeartRateDip still uses as a labelled calibration.
}
