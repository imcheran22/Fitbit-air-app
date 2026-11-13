package com.apex.athlete.core.analytics.sleep

enum class DipCategory {
    /** Sleeping HR at least 10 % below the daytime mean. */
    DIPPER,

    /** 0 % to under 10 % below: the night-time fall is smaller than the 10 % convention. */
    BLUNTED,

    /** Sleeping HR above the daytime mean. */
    REVERSED,
}

enum class DipMissing { NO_DAYTIME_HEART_RATE, NO_SLEEPING_HEART_RATE, INVALID_INPUT, TOO_FEW_MINUTES }

/** [dipFraction] is signed (negative = sleeping HR above daytime) and null with a [missing] reason when it cannot be computed. */
data class HeartRateDipResult(val dipFraction: Double?, val category: DipCategory?, val missing: DipMissing?)

/**
 * Sleeping heart-rate dip: (daytime mean HR - sleeping mean HR) / daytime mean HR.
 *
 * Callers pass the mean over awake, non-exercise minutes as the daytime value (a workout would inflate it) and
 * the mean over the main sleep as the sleeping value.
 *
 * Source and caveats:
 *  - The formula and the 10 % dipper threshold are the nocturnal "dipping" convention from ambulatory blood-pressure
 *    monitoring (a >= 10 % night fall in BP). Applying it to heart rate is by analogy: UNVERIFIED for HR, and the
 *    threshold is a calibration choice here, not a validated heart-rate cut-off.
 *  - The Pulse reference (engine/sleep.ts `hrDip`) divides by an inactive-HR baseline instead of the day's mean and
 *    floors at 0; Apex keeps the sign so a reversed pattern stays visible.
 *  - A blunted or reversed value can follow late exercise, alcohol, heat, illness or a short night. It is context
 *    and "may indicate" at most, never a diagnosis.
 */
object HeartRateDip {

    /** The dipper threshold (fraction). Calibration choice, see the class comment. */
    const val DIPPER_THRESHOLD = 0.10

    /** Minutes of HR each side needs when computing from minute lists. Calibration choice (30 min). */
    const val MIN_MINUTES = 30

    fun compute(daytimeMeanHr: Double?, sleepingMeanHr: Double?): HeartRateDipResult {
        if (daytimeMeanHr == null) return missing(DipMissing.NO_DAYTIME_HEART_RATE)
        if (sleepingMeanHr == null) return missing(DipMissing.NO_SLEEPING_HEART_RATE)
        if (!daytimeMeanHr.isFinite() || daytimeMeanHr <= 0.0 || !sleepingMeanHr.isFinite() || sleepingMeanHr <= 0.0) {
            return missing(DipMissing.INVALID_INPUT)
        }
        val dip = (daytimeMeanHr - sleepingMeanHr) / daytimeMeanHr
        val cat = when {
            dip >= DIPPER_THRESHOLD -> DipCategory.DIPPER
            dip >= 0.0 -> DipCategory.BLUNTED
            else -> DipCategory.REVERSED
        }
        return HeartRateDipResult(dip, cat, null)
    }

    /** As [compute], from per-minute HR lists; either list with fewer than [MIN_MINUTES] valid values is treated as missing. */
    fun fromMinutes(daytimeBpm: List<Double>, sleepingBpm: List<Double>): HeartRateDipResult {
        val day = daytimeBpm.filter { it.isFinite() && it > 0.0 }
        val sleep = sleepingBpm.filter { it.isFinite() && it > 0.0 }
        if (day.size < MIN_MINUTES || sleep.size < MIN_MINUTES) return missing(DipMissing.TOO_FEW_MINUTES)
        return compute(day.average(), sleep.average())
    }

    private fun missing(reason: DipMissing) = HeartRateDipResult(null, null, reason)
}
