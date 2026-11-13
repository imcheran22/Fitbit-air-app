package com.apex.athlete.core.analytics.stress

/**
 * Plain per-minute inputs shared by the stress and energy engines. A minute is an absolute minute index
 * (UTC epoch seconds / 60). Time zones and DST are resolved by the caller, who also supplies the
 * day window, so a 23- or 25-hour day simply has 1,380 or 1,500 minutes.
 */
data class MinuteHeartRate(val minute: Long, val bpm: Double)

/** Steps counted in one minute. */
data class MinuteSteps(val minute: Long, val steps: Int)

/** Half-open minute interval [startMinute, endMinuteExclusive): a workout, a sleep session, a nap. */
data class MinuteRange(val startMinute: Long, val endMinuteExclusive: Long) {
    init {
        require(endMinuteExclusive >= startMinute) { "range must not be reversed" }
    }

    operator fun contains(minute: Long): Boolean = minute in startMinute until endMinuteExclusive
}

/** A 0..3 stress level for one minute (see [StressEngine]). */
data class MinuteStress(val minute: Long, val level: Double)
