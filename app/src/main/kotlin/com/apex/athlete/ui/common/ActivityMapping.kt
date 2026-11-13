package com.apex.athlete.ui.common

import androidx.annotation.StringRes
import com.apex.athlete.R
import com.apex.athlete.core.data.repository.MetricReading
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState

/*
 * Activity figures (steps, distance, calories, active zone minutes ...) as MetricState, shared by the Overview,
 * Strain and Workout detail screens. Distance is stored in metres and elevation in metres; both follow the
 * owner's unit system. A missing reading is Unavailable, never 0.
 */

internal const val ACTIVITY_METERS_PER_KM = 1000.0
internal const val ACTIVITY_METERS_PER_MILE = 1609.344
internal const val ACTIVITY_FEET_PER_METER = 3.280839895

/** Distance in the display unit: kilometres or miles. */
internal fun distanceInUnits(meters: Double, units: UnitSystem): Double =
    if (units == UnitSystem.IMPERIAL) meters / ACTIVITY_METERS_PER_MILE else meters / ACTIVITY_METERS_PER_KM

/** Elevation in the display unit: metres or feet. */
internal fun elevationInUnits(meters: Double, units: UnitSystem): Double =
    if (units == UnitSystem.IMPERIAL) meters * ACTIVITY_FEET_PER_METER else meters

/** Unit label resources for the owner's unit system. */
@StringRes
internal fun distanceUnitRes(units: UnitSystem): Int =
    if (units == UnitSystem.IMPERIAL) R.string.common_unit_mi else R.string.common_unit_km

@StringRes
internal fun elevationUnitRes(units: UnitSystem): Int =
    if (units == UnitSystem.IMPERIAL) R.string.activity_unit_ft else R.string.activity_unit_m

/** Label of an activity metric; null for a metric the activity section does not show. */
@StringRes
internal fun activityLabelRes(metric: MetricType): Int? = when (metric) {
    MetricType.STEPS -> R.string.activity_steps
    MetricType.DISTANCE -> R.string.activity_distance
    MetricType.FLOORS -> R.string.activity_floors
    MetricType.CALORIES_TOTAL -> R.string.activity_calories_total
    MetricType.CALORIES_ACTIVE -> R.string.activity_calories_active
    MetricType.ACTIVE_ZONE_MINUTES -> R.string.activity_azm
    MetricType.LIGHTLY_ACTIVE_MINUTES -> R.string.activity_light_minutes
    MetricType.MODERATELY_ACTIVE_MINUTES -> R.string.activity_moderate_minutes
    MetricType.VERY_ACTIVE_MINUTES -> R.string.activity_very_minutes
    MetricType.SEDENTARY_MINUTES -> R.string.activity_sedentary_minutes
    else -> null
}

/**
 * One activity reading as a state. No value (or a non-finite one) is Unavailable with the no-data reason; a value carries
 * the provenance of its source, and is provisional while the day is still accumulating ([provisional]).
 */
internal fun activityState(reading: MetricReading?, formatter: ApexFormatter, provisional: Boolean): MetricState {
    val raw = reading?.value
    if (reading == null || raw == null || !raw.isFinite()) return MetricState.Unavailable(MetricReason.NO_DATA)
    val units = formatter.units
    return when (reading.metric) {
        MetricType.DISTANCE -> MetricState.Value(
            distanceInUnits(raw, units), 2, formatter.string(distanceUnitRes(units)), reading.provenance, isProvisional = provisional,
        )
        MetricType.CALORIES_TOTAL, MetricType.CALORIES_ACTIVE -> MetricState.Value(
            raw, 0, formatter.string(R.string.activity_unit_kcal), reading.provenance, isProvisional = provisional,
        )
        MetricType.ACTIVE_ZONE_MINUTES, MetricType.LIGHTLY_ACTIVE_MINUTES, MetricType.MODERATELY_ACTIVE_MINUTES,
        MetricType.VERY_ACTIVE_MINUTES, MetricType.SEDENTARY_MINUTES -> MetricState.Value(
            raw, 0, formatter.string(R.string.activity_unit_min), reading.provenance, isProvisional = provisional,
        )
        else -> MetricState.Value(raw, 0, null, reading.provenance, isProvisional = provisional)
    }
}


/** One activity figure ready to draw. */
@androidx.compose.runtime.Immutable
data class ActivityRowUi(val metric: MetricType, val state: MetricState)

/**
 * The rows for [metrics] in the given order, one per metric: a metric the day has no reading for is Unavailable (never absent
 * and never 0), so the screen always shows the full list.
 */
internal fun activityRows(
    readings: Map<MetricType, MetricReading>,
    metrics: List<MetricType>,
    formatter: ApexFormatter,
    provisional: Boolean,
): List<ActivityRowUi> = metrics.map { ActivityRowUi(it, activityState(readings[it], formatter, provisional)) }
