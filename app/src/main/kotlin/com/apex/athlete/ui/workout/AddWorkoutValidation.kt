package com.apex.athlete.ui.workout

import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/**
 * Pure validation for the manual workout form. No Android types: tested on the JVM.
 *
 * Rules (the owner can only log what already happened):
 *  - duration is a whole number of minutes, 1 to 600
 *  - the start time, on the chosen day, is not in the future
 *  - the type is one the app knows ([SUPPORTED_TYPES])
 *  - the rating of perceived exertion is 1 to 10 (Borg CR-10)
 *  - a blank name is allowed and replaced by the caller's fallback (the type's label)
 */

/** Exercise type constants the pipeline stores and the Health Connect and Takeout importers produce. */
internal val SUPPORTED_TYPES: List<String> = listOf(
    "RUNNING",
    "RUNNING_TREADMILL",
    "WALKING",
    "HIKING",
    "BIKING",
    "BIKING_STATIONARY",
    "SWIMMING_POOL",
    "SWIMMING_OPEN_WATER",
    "STRENGTH_TRAINING",
    "WEIGHTLIFTING",
    "HIGH_INTENSITY_INTERVAL_TRAINING",
    "YOGA",
    "PILATES",
    "ELLIPTICAL",
    "ROWING",
    "ROWING_MACHINE",
    "STAIR_CLIMBING_MACHINE",
    "STRETCHING",
    "DANCING",
    "OTHER_WORKOUT",
)

internal const val MIN_DURATION_MINUTES = 1
internal const val MAX_DURATION_MINUTES = 600
internal const val MIN_RPE = 1
internal const val MAX_RPE = 10
internal const val MAX_NAME_LENGTH = 60
internal const val DEFAULT_TYPE = "OTHER_WORKOUT"

internal enum class WorkoutFormError {
    /** The duration field is empty or not a whole number. */
    DURATION_NOT_A_NUMBER,

    /** The duration is a number outside 1 to 600. */
    DURATION_OUT_OF_RANGE,

    /** The start time on the chosen day is after now. */
    START_IN_FUTURE,

    TYPE_UNSUPPORTED,
    RPE_MISSING,
    NAME_TOO_LONG,
}

internal data class WorkoutFormInput(
    val name: String,
    val type: String,
    /** Minutes after local midnight of the chosen day, 0 to 1439. */
    val startMinuteOfDay: Int,
    val durationText: String,
    val rpe: Int?,
)

/** What [com.apex.athlete.core.data.repository.AthleteRepository.addManualWorkout] is called with. */
internal data class ValidWorkout(
    val startMillis: Long,
    val durationMinutes: Int,
    val name: String,
    val type: String,
    val rpe: Int,
)

internal sealed interface WorkoutValidation {
    data class Valid(val workout: ValidWorkout) : WorkoutValidation
    data class Invalid(val errors: Set<WorkoutFormError>) : WorkoutValidation
}

/** Parses the duration field. Null for anything that is not a whole number (no sign, no decimals). */
internal fun parseDuration(text: String): Int? {
    val trimmed = text.trim()
    if (trimmed.isEmpty() || trimmed.length > 4 || !trimmed.all { it in '0'..'9' }) return null
    return trimmed.toIntOrNull()
}

/** Epoch millis of [minuteOfDay] on [day] in [zone]. A time inside a daylight-saving gap moves forward, as java.time does. */
internal fun startMillisOf(day: LocalDate, minuteOfDay: Int, zone: ZoneId): Long {
    val clamped = minuteOfDay.coerceIn(0, 24 * 60 - 1)
    return day.atTime(LocalTime.of(clamped / 60, clamped % 60)).atZone(zone).toInstant().toEpochMilli()
}

internal fun validateWorkout(
    input: WorkoutFormInput,
    day: LocalDate,
    zone: ZoneId,
    nowMillis: Long,
    fallbackName: String,
): WorkoutValidation {
    val errors = linkedSetOf<WorkoutFormError>()

    val duration = parseDuration(input.durationText)
    when {
        duration == null -> errors += WorkoutFormError.DURATION_NOT_A_NUMBER
        duration !in MIN_DURATION_MINUTES..MAX_DURATION_MINUTES -> errors += WorkoutFormError.DURATION_OUT_OF_RANGE
    }

    val startMillis = startMillisOf(day, input.startMinuteOfDay, zone)
    if (startMillis > nowMillis) errors += WorkoutFormError.START_IN_FUTURE

    if (input.type !in SUPPORTED_TYPES) errors += WorkoutFormError.TYPE_UNSUPPORTED

    if (input.rpe == null || input.rpe !in MIN_RPE..MAX_RPE) errors += WorkoutFormError.RPE_MISSING

    val name = input.name.trim().ifEmpty { fallbackName.trim() }
    if (name.length > MAX_NAME_LENGTH) errors += WorkoutFormError.NAME_TOO_LONG

    if (errors.isNotEmpty() || duration == null || input.rpe == null) return WorkoutValidation.Invalid(errors)
    return WorkoutValidation.Valid(ValidWorkout(startMillis, duration, name, input.type, input.rpe))
}

/** Start time suggested when the form opens: now (to 5 minutes) on today, noon on an earlier day. */
internal fun defaultStartMinute(day: LocalDate, zone: ZoneId, nowMillis: Long): Int {
    val now = java.time.Instant.ofEpochMilli(nowMillis).atZone(zone)
    if (now.toLocalDate() != day) return 12 * 60
    val minute = now.hour * 60 + now.minute
    return minute - minute % 5
}
