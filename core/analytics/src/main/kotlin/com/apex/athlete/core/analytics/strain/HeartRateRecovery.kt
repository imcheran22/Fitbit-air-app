package com.apex.athlete.core.analytics.strain

import com.apex.athlete.core.analytics.stress.MinuteHeartRate

enum class HrrMissing { PEAK_MINUTES_MISSING, RECOVERY_MINUTES_MISSING, PEAK_BELOW_MINIMUM }

/**
 * @property workoutEndMinuteExclusive the first minute after the workout; the last workout minute is this minus 1.
 * @property peakWindowMinutes the peak is searched in this many final workout minutes (all must have HR).
 * @property minPeakBpm when set, a peak below it is not scored: recovery after an easy effort says little.
 */
data class HeartRateRecoveryInput(
    val workoutEndMinuteExclusive: Long,
    val heartRate: List<MinuteHeartRate>,
    val peakWindowMinutes: Int = 3,
    val minPeakBpm: Double? = null,
)

/**
 * @property dropAt60 peak minus the mean HR of the first full minute after the workout; positive = HR fell.
 * @property dropAt120 peak minus the mean HR of the second full minute after the workout.
 * @property missing set only when neither drop could be computed.
 */
data class HeartRateRecoveryResult(
    val peakBpm: Double?,
    val dropAt60: Double?,
    val dropAt120: Double?,
    val missing: HrrMissing?,
)

/**
 * Post-workout heart-rate recovery from per-minute mean HR.
 *
 * Reference: heart-rate recovery is the fall in HR after peak exercise (Cole et al., 1999, N Engl J Med
 * 341:1351-1357: HR at peak exercise minus HR one minute after, in patients referred for treadmill testing; a
 * fall of 12 bpm or less after one minute was associated with higher mortality) -- UNVERIFIED, the paper was not
 * opened. Apex does NOT apply that cut-off: the protocol (treadmill, cool-down walk) and population differ from
 * free-living wrist data, so the values are shown as personal trend context only and never as a clinical result.
 *
 * Calibration choices for minute-resolution data:
 *  - Peak = the maximum minute-mean HR over the last [HeartRateRecoveryInput.peakWindowMinutes] (3) workout minutes.
 *    A minute-mean is lower than an instantaneous peak, which understates the drop.
 *  - "HR at 60 s" = the mean HR of the first full minute after the workout, "at 120 s" the second. A mean over a
 *    recovering minute is higher than the HR at its end, which also understates the drop.
 *  - Missing minutes are never filled: a missing peak minute gives no result, a missing recovery minute only
 *    removes that one drop.
 */
object HeartRateRecovery {

    fun compute(input: HeartRateRecoveryInput): HeartRateRecoveryResult {
        val byMinute = input.heartRate.filter { it.bpm.isFinite() && it.bpm > 0.0 }
            .groupBy { it.minute }.mapValues { (_, v) -> v.sumOf { it.bpm } / v.size }
        val end = input.workoutEndMinuteExclusive
        val peakMinutes = (end - input.peakWindowMinutes until end).map { byMinute[it] }
        if (peakMinutes.any { it == null }) return fail(HrrMissing.PEAK_MINUTES_MISSING)
        val peak = peakMinutes.filterNotNull().max()
        if (input.minPeakBpm != null && peak < input.minPeakBpm) return fail(HrrMissing.PEAK_BELOW_MINIMUM, peak)
        val at60 = byMinute[end]
        val at120 = byMinute[end + 1]
        if (at60 == null && at120 == null) return fail(HrrMissing.RECOVERY_MINUTES_MISSING, peak)
        return HeartRateRecoveryResult(peak, at60?.let { peak - it }, at120?.let { peak - it }, null)
    }

    private fun fail(reason: HrrMissing, peak: Double? = null) = HeartRateRecoveryResult(peak, null, null, reason)
}
