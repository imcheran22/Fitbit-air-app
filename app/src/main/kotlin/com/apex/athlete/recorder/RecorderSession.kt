package com.apex.athlete.recorder

enum class RecorderPhase { RUNNING, PAUSED, STOPPED }

/**
 * Immutable state of one live recording. Pure: every transition takes the current time as an argument, so the
 * whole state machine is testable on the JVM and a session restored after process death is just this data.
 *
 * Time is wall-clock based (start/stop timestamps), so it stays right while the process is dead. Heart-rate
 * statistics come from strap readings the service samples about once a second; with no strap they stay empty
 * and the workout is time only. Nothing is invented for gaps.
 */
data class RecorderSession(
    val phase: RecorderPhase,
    val startedAtMillis: Long,
    /** Active time of the finished segments (before the current run). */
    val activeBeforeSegmentMillis: Long = 0L,
    /** Start of the running segment; null while paused or stopped. */
    val segmentStartMillis: Long? = null,
    val hrSampleCount: Int = 0,
    val hrSumBpm: Long = 0L,
    val hrMaxBpm: Int? = null,
    val usedStrap: Boolean = false,
) {
    fun elapsedMillis(now: Long): Long {
        val running = segmentStartMillis?.let { (now - it).coerceAtLeast(0L) } ?: 0L
        return activeBeforeSegmentMillis + running
    }

    val averageBpm: Int? get() = if (hrSampleCount > 0) Math.round(hrSumBpm.toDouble() / hrSampleCount).toInt() else null

    fun pause(now: Long): RecorderSession =
        if (phase != RecorderPhase.RUNNING) this
        else copy(phase = RecorderPhase.PAUSED, activeBeforeSegmentMillis = elapsedMillis(now), segmentStartMillis = null)

    fun resume(now: Long): RecorderSession =
        if (phase != RecorderPhase.PAUSED) this else copy(phase = RecorderPhase.RUNNING, segmentStartMillis = now)

    fun stop(now: Long): RecorderSession =
        if (phase == RecorderPhase.STOPPED) this
        else copy(phase = RecorderPhase.STOPPED, activeBeforeSegmentMillis = elapsedMillis(now), segmentStartMillis = null)

    /** Adds one strap reading; ignored unless running and plausible (30..250 bpm). */
    fun withHeartRate(bpm: Int): RecorderSession =
        if (phase != RecorderPhase.RUNNING || bpm !in PLAUSIBLE_BPM) this
        else copy(
            hrSampleCount = hrSampleCount + 1,
            hrSumBpm = hrSumBpm + bpm,
            hrMaxBpm = maxOf(hrMaxBpm ?: bpm, bpm),
            usedStrap = true,
        )

    companion object {
        val PLAUSIBLE_BPM = 30..250

        fun start(now: Long) = RecorderSession(RecorderPhase.RUNNING, startedAtMillis = now, segmentStartMillis = now)
    }
}
