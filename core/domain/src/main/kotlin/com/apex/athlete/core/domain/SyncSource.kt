package com.apex.athlete.core.domain

/** A place the app pulls data from. Each (source, stream) pair has its own sync watermark. */
enum class SyncSource(val storageKey: String) {
    /** REST API at health.googleapis.com; carries what the wearable uploaded via the Google Health app. */
    GOOGLE_HEALTH_API("ghealth_api"),

    /** On-device Health Connect store. */
    HEALTH_CONNECT("health_connect"),

    /** A Google Takeout export of Fitbit data that the user picked; parsed on the phone, never stored. */
    FITBIT_TAKEOUT_ARCHIVE("fitbit_takeout");

    companion object {
        private val byKey = entries.associateBy { it.storageKey }

        fun fromStorageKey(key: String): SyncSource =
            byKey[key] ?: throw IllegalArgumentException("Unknown sync source key: $key")
    }
}

/** Outcome of the most recent sync attempt for one stream. */
enum class SyncStatus(val storageKey: String) {
    NEVER_SYNCED("never"),
    SUCCESS("success"),
    /** Some windows were ingested before the run stopped; the watermark marks how far it got. */
    PARTIAL("partial"),
    FAILED("failed"),
    /** The user has not granted the scope/permission this stream needs. */
    PERMISSION_MISSING("permission_missing");

    companion object {
        private val byKey = entries.associateBy { it.storageKey }

        fun fromStorageKey(key: String): SyncStatus =
            byKey[key] ?: throw IllegalArgumentException("Unknown sync status key: $key")
    }
}
