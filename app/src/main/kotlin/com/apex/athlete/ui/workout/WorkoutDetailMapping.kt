package com.apex.athlete.ui.workout

import androidx.compose.runtime.Immutable
import com.apex.athlete.R
import com.apex.athlete.core.analytics.strain.HeartRateRecoveryResult
import com.apex.athlete.core.analytics.strain.HeartRateZone
import com.apex.athlete.core.analytics.strain.HrrMissing
import com.apex.athlete.core.data.repository.WorkoutDetailState as RepoWorkoutDetail
import com.apex.athlete.core.database.entity.WorkoutEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.common.distanceInUnits
import com.apex.athlete.ui.common.distanceUnitRes
import com.apex.athlete.ui.common.elevationInUnits
import com.apex.athlete.ui.common.elevationUnitRes

/*
 * What the workout detail adds on top of the stored session: reported calories, distance, steps, active zone minutes and
 * elevation (provenance of the session itself), and heart-rate recovery (calculated by Apex from the minute heart rate).
 * A field the source did not report is Unavailable, never 0; heart-rate recovery says why it is missing.
 */

@Immutable
internal data class WorkoutStatsUi(
    val calories: MetricState,
    val distance: MetricState,
    val steps: MetricState,
    val activeZoneMinutes: MetricState,
    val elevation: MetricState,
    /** Peak minus the first full minute after the workout, in bpm (positive = the heart rate fell). */
    val recovery60: MetricState,
    /** Peak minus the second full minute after the workout, in bpm. */
    val recovery120: MetricState,
)

private fun reported(value: Double?, decimals: Int, unit: String?, provenance: DataProvenance): MetricState =
    if (value != null && value.isFinite()) {
        MetricState.Value(value, decimals, unit, provenance)
    } else {
        MetricState.Unavailable(MetricReason.NO_DATA)
    }

/**
 * Heart-rate recovery drop as a state. [detail] null means the detail is still loading. Without a zone model there is no
 * recovery result at all (it needs a resting and a maximum heart rate); otherwise a missing drop says which minutes were absent.
 */
internal fun hrRecoveryState(
    drop: Double?,
    recovery: HeartRateRecoveryResult?,
    needsZones: Boolean,
    formatter: ApexFormatter,
): MetricState {
    if (drop != null && drop.isFinite()) {
        return MetricState.Value(drop, 0, formatter.string(R.string.workout_unit_bpm), DataProvenance.MATHEMATICALLY_DERIVED)
    }
    val reason = when {
        needsZones -> R.string.workout_hrr_needs_zones
        recovery == null -> null
        recovery.missing == HrrMissing.PEAK_MINUTES_MISSING -> R.string.workout_hrr_no_peak
        recovery.missing == HrrMissing.PEAK_BELOW_MINIMUM -> R.string.workout_hrr_too_easy
        else -> R.string.workout_hrr_no_recovery_minutes
    }
    return MetricState.Unavailable(MetricReason.NO_DATA, reason?.let { formatter.string(it) })
}

internal fun workoutStats(w: WorkoutEntity, detail: RepoWorkoutDetail?, formatter: ApexFormatter): WorkoutStatsUi {
    val units = formatter.units
    val p = w.provenance
    val recovery = detail?.recovery
    val loadingHrr = detail == null
    return WorkoutStatsUi(
        calories = reported(w.caloriesKcal, 0, formatter.string(R.string.workout_unit_kcal), p),
        distance = reported(w.distanceMeters?.let { distanceInUnits(it, units) }, 2, formatter.string(distanceUnitRes(units)), p),
        steps = reported(w.steps?.toDouble(), 0, null, p),
        activeZoneMinutes = reported(w.activeZoneMinutes?.toDouble(), 0, formatter.string(R.string.workout_unit_min), p),
        elevation = reported(w.elevationGainMeters?.let { elevationInUnits(it, units) }, 0, formatter.string(elevationUnitRes(units)), p),
        recovery60 = if (loadingHrr) MetricState.Loading else hrRecoveryState(recovery?.dropAt60, recovery, detail?.recoveryNeedsZones == true, formatter),
        recovery120 = if (loadingHrr) MetricState.Loading else hrRecoveryState(recovery?.dropAt120, recovery, detail?.recoveryNeedsZones == true, formatter),
    )
}

/** True when the workout has heart-rate minutes in at least one zone (zero everywhere means no heart rate during it). */
internal fun hasMeasuredZoneMinutes(minutes: Map<HeartRateZone, Double>?): Boolean =
    minutes?.values?.any { it.isFinite() && it > 0.0 } == true
