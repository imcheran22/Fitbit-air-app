package com.apex.athlete.core.data.ingest

/**
 * Decides main sleep versus nap. A source flag may say "main", but a sleep shorter than the minimum
 * (180 minutes asleep) is never a main sleep, so a 20-minute doze cannot become the night that is scored.
 */
internal object SleepClassification {
    const val MAIN_SLEEP_MIN_MINUTES = 180

    data class Result(val isMain: Boolean, val isNap: Boolean)

    fun classify(minutesAsleep: Int, flaggedMain: Boolean?, flaggedNap: Boolean?): Result {
        if (minutesAsleep < MAIN_SLEEP_MIN_MINUTES) return Result(isMain = false, isNap = true)
        val isNap = flaggedNap ?: false
        return Result(isMain = flaggedMain ?: !isNap, isNap = isNap)
    }
}
