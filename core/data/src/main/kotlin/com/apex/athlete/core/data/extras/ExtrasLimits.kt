package com.apex.athlete.core.data.extras

/** Size and value limits of the local logging tables, shared by the repositories (reject on write) and the importer (quarantine on read). */
object ExtrasLimits {
    /** A quick-log note and the free text of a quick-log entry. */
    const val MAX_NOTE_CHARS = 500
    const val MAX_ID_CHARS = 100
    const val MAX_NAME_CHARS = 60
    const val MAX_LABEL_CHARS = 100
    const val MAX_ICON_KEY_CHARS = 40
    const val MAX_TITLE_CHARS = 120
    const val MAX_MESSAGE_CHARS = 20_000

    const val SCALE_MIN = 0.0
    const val SCALE_MAX = 4.0

    // Plausibility of a typed or imported blood pressure reading, mmHg and beats per minute.
    const val SYSTOLIC_MIN = 40.0
    const val SYSTOLIC_MAX = 300.0
    const val DIASTOLIC_MIN = 20.0
    const val DIASTOLIC_MAX = 200.0
    const val PULSE_MIN = 25
    const val PULSE_MAX = 240

    const val MAX_SESSION_SECONDS = 24 * 3600
}
