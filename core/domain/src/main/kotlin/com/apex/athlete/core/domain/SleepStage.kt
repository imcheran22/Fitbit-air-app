package com.apex.athlete.core.domain

/**
 * Sleep stage of a hypnogram segment.
 *
 * AWAKE/LIGHT/DEEP/REM come from sessions scored with the stages algorithm. ASLEEP/RESTLESS are
 * the "classic" (movement-only) labels a device reports when stage scoring was not possible,
 * for example on short naps or when heart-rate coverage was too low.
 */
enum class SleepStage(val storageKey: String, val isAsleep: Boolean, val isRestorative: Boolean) {
    AWAKE("awake", isAsleep = false, isRestorative = false),
    LIGHT("light", isAsleep = true, isRestorative = false),
    DEEP("deep", isAsleep = true, isRestorative = true),
    REM("rem", isAsleep = true, isRestorative = true),
    ASLEEP("asleep", isAsleep = true, isRestorative = false),
    RESTLESS("restless", isAsleep = false, isRestorative = false);

    companion object {
        private val byKey = entries.associateBy { it.storageKey }

        fun fromStorageKey(key: String): SleepStage =
            byKey[key] ?: throw IllegalArgumentException("Unknown sleep stage key: $key")
    }
}
