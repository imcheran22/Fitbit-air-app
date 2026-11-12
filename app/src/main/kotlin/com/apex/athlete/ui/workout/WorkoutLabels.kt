package com.apex.athlete.ui.workout

import androidx.annotation.StringRes
import com.apex.athlete.R
import java.util.Locale

/** Label for an exercise type constant, or null when the app has no wording for it (use [humanizeType]). */
@StringRes
internal fun workoutTypeLabelRes(type: String): Int? = when (type) {
    "RUNNING" -> R.string.workout_type_running
    "RUNNING_TREADMILL" -> R.string.workout_type_running_treadmill
    "WALKING" -> R.string.workout_type_walking
    "HIKING" -> R.string.workout_type_hiking
    "BIKING" -> R.string.workout_type_biking
    "BIKING_STATIONARY" -> R.string.workout_type_biking_stationary
    "SWIMMING_POOL" -> R.string.workout_type_swimming_pool
    "SWIMMING_OPEN_WATER" -> R.string.workout_type_swimming_open_water
    "STRENGTH_TRAINING" -> R.string.workout_type_strength_training
    "WEIGHTLIFTING" -> R.string.workout_type_weightlifting
    "HIGH_INTENSITY_INTERVAL_TRAINING" -> R.string.workout_type_hiit
    "YOGA" -> R.string.workout_type_yoga
    "PILATES" -> R.string.workout_type_pilates
    "ELLIPTICAL" -> R.string.workout_type_elliptical
    "ROWING" -> R.string.workout_type_rowing
    "ROWING_MACHINE" -> R.string.workout_type_rowing_machine
    "STAIR_CLIMBING_MACHINE" -> R.string.workout_type_stair_climbing
    "STRETCHING" -> R.string.workout_type_stretching
    "DANCING" -> R.string.workout_type_dancing
    "OTHER_WORKOUT" -> R.string.workout_type_other
    else -> null
}

/** "CROSS_COUNTRY_SKIING" to "Cross country skiing", for a type from another source that has no string. */
internal fun humanizeType(type: String): String {
    val words = type.lowercase(Locale.ROOT).replace('_', ' ').trim()
    return words.replaceFirstChar { it.titlecase(Locale.ROOT) }
}

@StringRes
internal fun rpeWordRes(rpe: Int): Int = when (rpe) {
    1 -> R.string.workout_rpe_1
    2 -> R.string.workout_rpe_2
    3 -> R.string.workout_rpe_3
    4 -> R.string.workout_rpe_4
    5 -> R.string.workout_rpe_5
    6 -> R.string.workout_rpe_6
    7 -> R.string.workout_rpe_7
    8 -> R.string.workout_rpe_8
    9 -> R.string.workout_rpe_9
    else -> R.string.workout_rpe_10
}

@StringRes
internal fun errorRes(error: WorkoutFormError): Int = when (error) {
    WorkoutFormError.DURATION_NOT_A_NUMBER -> R.string.workout_error_duration_number
    WorkoutFormError.DURATION_OUT_OF_RANGE -> R.string.workout_error_duration_range
    WorkoutFormError.START_IN_FUTURE -> R.string.workout_error_start_future
    WorkoutFormError.TYPE_UNSUPPORTED -> R.string.workout_error_type
    WorkoutFormError.RPE_MISSING -> R.string.workout_error_rpe
    WorkoutFormError.NAME_TOO_LONG -> R.string.workout_error_name_long
}
