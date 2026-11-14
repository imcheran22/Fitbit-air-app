package com.apex.athlete.core.analytics.sleep

import com.apex.athlete.core.domain.DataProvenance

/** Why a provider-reported "time to fall asleep" needs a caption next to it. */
enum class SleepLatencyNote {
    /**
     * The provider reported 0 minutes. For automatically detected sleep the Fitbit sleep log reports 0 because the
     * onset was not measured (Fitbit Web API sleep-log documentation, recalled, UNVERIFIED for the Google Health API):
     * it is "not measured", not "fell asleep instantly".
     */
    ZERO_LIKELY_NOT_MEASURED,
}

/**
 * Provider-reported time to fall asleep, shown as reported. Owner decision (docs/DECISIONS.md D17): the value is kept
 * and displayed with its provenance, and nothing in Apex scores on it. [SleepNightInput] has no latency field, so the
 * sleep score cannot use it.
 */
data class SleepLatencyReading(val minutes: Int, val provenance: DataProvenance, val note: SleepLatencyNote?)

object SleepLatency {
    /** Null when the provider sent no value (missing stays missing); a negative value is invalid and also null. */
    fun reading(minutes: Int?, provenance: DataProvenance): SleepLatencyReading? {
        if (minutes == null || minutes < 0) return null
        return SleepLatencyReading(minutes, provenance, if (minutes == 0) SleepLatencyNote.ZERO_LIKELY_NOT_MEASURED else null)
    }
}
