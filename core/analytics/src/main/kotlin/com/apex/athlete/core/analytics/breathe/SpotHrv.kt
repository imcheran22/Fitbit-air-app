package com.apex.athlete.core.analytics.breathe

import com.apex.athlete.core.domain.DataProvenance
import kotlin.math.abs
import kotlin.math.sqrt

enum class SpotHrvMissingReason {
    /** Fewer than [SpotHrv.MIN_ACCEPTED_BEATS] beats survived artifact rejection (includes an empty input). */
    TOO_FEW_BEATS,
    /** Enough beats but under [SpotHrv.MIN_RECORDING_SECONDS] of recording. */
    TOO_SHORT_RECORDING,
    /** No two accepted beats were next to each other, so no successive difference exists. */
    NO_ADJACENT_BEATS,
}

/**
 * @property rmssdMs null unless the recording qualifies (see [missingReason]).
 * @property meanHeartRateBpm 60000 / mean accepted RR; null when [rmssdMs] is null.
 * @property acceptedBeats / [rejectedBeats] counted over the input intervals.
 * @property recordingSeconds sum of the intervals inside 300..2000 ms (the time the sensor was listening, before the median filter).
 * @property provenanceHint always ESTIMATED: a short wrist or strap RR snapshot is not a laboratory HRV measurement.
 */
data class SpotHrvResult(
    val rmssdMs: Double?,
    val meanHeartRateBpm: Double?,
    val acceptedBeats: Int,
    val rejectedBeats: Int,
    val recordingSeconds: Double,
    val missingReason: SpotHrvMissingReason?,
    val provenanceHint: DataProvenance = SpotHrv.PROVENANCE_HINT,
)

/**
 * RMSSD of a short, on-demand RR recording.
 *
 *   1. Drop intervals that are not finite or lie outside 300..2000 ms (inclusive range kept; 30-200 bpm).
 *   2. For every remaining beat take the median of the range-valid beats in the window of 5 consecutive beats centred on it
 *      (itself included; shortened at the ends and where beats were dropped). Drop the beat when it differs from that median
 *      by more than 20 % (exactly 20 % is kept). The windows use the range-filtered values, not the already-median-filtered
 *      ones, so one bad beat cannot cascade.
 *   3. RMSSD = sqrt(mean of squared differences) over pairs of beats that are adjacent in the recording and both accepted;
 *      a difference is never taken across a dropped beat.
 *   4. Needs at least [MIN_ACCEPTED_BEATS] = 30 accepted beats and at least [MIN_RECORDING_SECONDS] = 60 s, otherwise null with a reason.
 *
 * Evidence: RMSSD is the standard time-domain vagal index of the Task Force of the ESC and NASPE (1996, Circulation 93:1043;
 * recalled, UNVERIFIED), and ultra-short recordings of about 60 s have been compared with 5-minute values in the literature
 * (Esco and Flatt 2014; recalled, UNVERIFIED). The 300..2000 ms range, the 5-beat median, the 20 % rule, 30 beats and 60 s are
 * Apex calibration choices (the 20 % successive-difference rule is a common artifact filter, not a validated one). A spot value is
 * affected by posture, breathing and time of day and must not be compared with the overnight RMSSD that feeds the recovery score.
 * Missing stays missing: no value is produced when the recording does not qualify.
 */
object SpotHrv {
    const val MIN_RR_MS: Double = 300.0
    const val MAX_RR_MS: Double = 2000.0
    const val MEDIAN_WINDOW_BEATS: Int = 5
    const val MAX_MEDIAN_DEVIATION: Double = 0.20
    const val MIN_ACCEPTED_BEATS: Int = 30
    const val MIN_RECORDING_SECONDS: Double = 60.0

    /** The caller labels the value with this provenance. */
    val PROVENANCE_HINT: DataProvenance = DataProvenance.ESTIMATED

    fun analyse(rrMs: List<Double>): SpotHrvResult {
        val n = rrMs.size
        val inRange = BooleanArray(n) { rrMs[it].isFinite() && rrMs[it] in MIN_RR_MS..MAX_RR_MS }
        val recordingSeconds = (0 until n).filter { inRange[it] }.sumOf { rrMs[it] } / 1000.0
        val half = MEDIAN_WINDOW_BEATS / 2

        val accepted = BooleanArray(n)
        for (i in 0 until n) {
            if (!inRange[i]) continue
            val window = ((i - half)..(i + half)).filter { it in 0 until n && inRange[it] }.map { rrMs[it] }.sorted()
            val mid = window.size / 2
            val median = if (window.size % 2 == 1) window[mid] else (window[mid - 1] + window[mid]) / 2.0
            accepted[i] = abs(rrMs[i] - median) <= MAX_MEDIAN_DEVIATION * median
        }
        val acceptedCount = accepted.count { it }
        val rejected = n - acceptedCount

        fun missing(reason: SpotHrvMissingReason) = SpotHrvResult(null, null, acceptedCount, rejected, recordingSeconds, reason)
        if (acceptedCount < MIN_ACCEPTED_BEATS) return missing(SpotHrvMissingReason.TOO_FEW_BEATS)
        if (recordingSeconds < MIN_RECORDING_SECONDS) return missing(SpotHrvMissingReason.TOO_SHORT_RECORDING)

        var sumSq = 0.0
        var pairs = 0
        for (i in 0 until n - 1) {
            if (accepted[i] && accepted[i + 1]) {
                val d = rrMs[i + 1] - rrMs[i]
                sumSq += d * d
                pairs++
            }
        }
        if (pairs == 0) return missing(SpotHrvMissingReason.NO_ADJACENT_BEATS)
        val meanRr = (0 until n).filter { accepted[it] }.sumOf { rrMs[it] } / acceptedCount
        return SpotHrvResult(sqrt(sumSq / pairs), 60_000.0 / meanRr, acceptedCount, rejected, recordingSeconds, null)
    }
}
