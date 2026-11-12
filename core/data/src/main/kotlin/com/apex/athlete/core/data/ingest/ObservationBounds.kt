package com.apex.athlete.core.data.ingest

/**
 * The window of times and days an observation may fall in. Anything outside is a parsing or clock fault,
 * not a reading: it is rejected and counted, never stored. The floor also stops one malformed row dated
 * 1970 or year 1 from making a run replay every day since then.
 */
object ObservationBounds {
    /** 2010-01-01T00:00:00Z. No supported source holds data older than this. */
    const val MIN_EPOCH_MILLIS = 1_262_304_000_000L

    /** 2010-01-01 as days since 1970-01-01. */
    const val MIN_EPOCH_DAY = 14_610L

    /** How far past "now" a timestamp may be (clock skew between band, phone and server). */
    const val FUTURE_TOLERANCE_MS = 10 * 60_000L

    fun isPlausibleInstant(epochMillis: Long, nowMillis: Long): Boolean =
        epochMillis in MIN_EPOCH_MILLIS..(nowMillis + FUTURE_TOLERANCE_MS)

    /** [today] is the civil day of "now" in the user's zone; tomorrow is allowed for zone differences. */
    fun isPlausibleDay(epochDay: Long, today: Long): Boolean = epochDay in MIN_EPOCH_DAY..(today + 1)
}
