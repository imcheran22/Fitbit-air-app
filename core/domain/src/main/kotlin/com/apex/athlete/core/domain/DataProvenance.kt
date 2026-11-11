package com.apex.athlete.core.domain

/**
 * Where a stored value came from. Every daily value, time-series bucket, sleep session and
 * workout carries exactly one of these, and the UI renders it as a provenance pill.
 *
 * The app never upgrades a value's provenance: a number computed by the analytics engine is
 * [MATHEMATICALLY_DERIVED] even when all of its inputs were sensor measurements, and a value
 * that could not be obtained is [UNAVAILABLE] rather than filled in.
 *
 * Note on naming: the original product spec called the first entry `DIRECT_SENSOR_FITBIT_API`.
 * Google retired the legacy Fitbit Web API at the end of October 2026; wearable data recorded by a Fitbit
 * device is now served by the Google Health API, so the entry is named for the API that actually
 * delivers the data.
 */
enum class DataProvenance(
    /** Stable key persisted in the database. Never rename; add new entries instead. */
    val storageKey: String,
    /** Short label shown in the provenance pill. */
    val badge: String,
    /** True when the number is a reading reported by a device or an authorised source. */
    val isObserved: Boolean,
) {
    /** Recorded by the wearable's sensors and read through the Google Health API. */
    DIRECT_SENSOR_GOOGLE_HEALTH_API("ghealth_api", "MEASURED", true),

    /** Read from Android Health Connect (any app or device the user authorised there). */
    IMPORTED_HEALTH_CONNECT("health_connect", "HEALTH CONNECT", true),

    /** Parsed from a data-export file the user explicitly chose to import. */
    IMPORTED_FILE_ARCHIVE("file_archive", "IMPORTED", true),

    /** Typed in by the user (perceived fatigue, soreness, manual weight, ...). */
    USER_REPORTED("user_reported", "SELF-REPORTED", true),

    /** Computed by this app from observed values with a documented formula. */
    MATHEMATICALLY_DERIVED("derived", "DERIVED", false),

    /** Text or judgement produced by the AI coach from the user's data. */
    AI_INTERPRETED("ai", "AI", false),

    /** A model-based approximation of something that was not measured (e.g. age-predicted max HR). */
    ESTIMATED("estimated", "ESTIMATED", false),

    /** The value does not exist for this day/source. Shown as a gap, never substituted. */
    UNAVAILABLE("unavailable", "UNAVAILABLE", false),

    /** Synthetic reading produced by Demo mode. Exists only in the separate demo store. */
    SYNTHETIC_DEMO("demo", "DEMO", false);

    companion object {
        private val byKey = entries.associateBy { it.storageKey }

        fun fromStorageKey(key: String): DataProvenance =
            byKey[key] ?: throw IllegalArgumentException("Unknown provenance key: $key")
    }
}
