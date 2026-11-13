package com.apex.athlete.ui.workout

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.R
import com.apex.athlete.core.analytics.strain.HeartRateRecoveryResult
import com.apex.athlete.core.analytics.strain.HeartRateZone
import com.apex.athlete.core.analytics.strain.HrrMissing
import com.apex.athlete.core.data.repository.WorkoutDetailState as RepoWorkoutDetail
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.database.entity.WorkoutEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.ApexFormatter
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.ZoneOffset
import kotlin.test.assertEquals

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS", application = android.app.Application::class)
class WorkoutDetailMappingTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val sensor = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    private val derived = DataProvenance.MATHEMATICALLY_DERIVED

    private fun formatter(units: UnitSystem = UnitSystem.METRIC) =
        ApexFormatter(context, units, true, { ZoneOffset.UTC }, { 1_800_000_000_000L })

    private fun workout(full: Boolean) = WorkoutEntity(
        id = "w1", startEpochMillis = 1_000L, endEpochMillis = 2_000L, zoneOffsetSeconds = 0, epochDay = 20_800L,
        exerciseType = "RUNNING", displayName = "Run", activeDurationMillis = 1_000L,
        caloriesKcal = if (full) 512.0 else null,
        distanceMeters = if (full) 5_000.0 else null,
        steps = if (full) 6_100L else null,
        elevationGainMeters = if (full) 100.0 else null,
        activeZoneMinutes = if (full) 38 else null,
        provenance = sensor, updatedAtEpochMillis = 0L,
    )

    private fun detail(
        recovery: HeartRateRecoveryResult?,
        needsZones: Boolean = false,
        zones: Map<HeartRateZone, Double>? = null,
    ) = RepoWorkoutDetail(
        workout = workout(true), isDemo = false, recovery = recovery, recoveryNeedsZones = needsZones,
        zoneMinutes = zones, heartRate = emptyList(),
    )

    @Test fun reportedFieldsCarryTheSessionProvenanceAndMetricUnits() {
        val s = workoutStats(workout(true), detail(null), formatter())
        assertEquals(MetricState.Value(512.0, 0, "kcal", sensor), s.calories)
        assertEquals(MetricState.Value(5.0, 2, "km", sensor), s.distance)
        assertEquals(MetricState.Value(6_100.0, 0, null, sensor), s.steps)
        assertEquals(MetricState.Value(38.0, 0, "min", sensor), s.activeZoneMinutes)
        assertEquals(MetricState.Value(100.0, 0, "m", sensor), s.elevation)
    }

    @Test fun imperialUnitsConvertDistanceAndElevation() {
        val s = workoutStats(workout(true), detail(null), formatter(UnitSystem.IMPERIAL))
        val distance = s.distance as MetricState.Value
        assertEquals(3.1068559611866697, distance.value, 1e-9)
        assertEquals("mi", distance.unit)
        val elevation = s.elevation as MetricState.Value
        assertEquals(328.0839895, elevation.value, 1e-6)
        assertEquals("ft", elevation.unit)
    }

    @Test fun fieldsTheSourceDidNotReportAreUnavailableNotZero() {
        val s = workoutStats(workout(false), detail(null), formatter())
        val none = MetricState.Unavailable(MetricReason.NO_DATA)
        assertEquals(none, s.calories)
        assertEquals(none, s.distance)
        assertEquals(none, s.steps)
        assertEquals(none, s.activeZoneMinutes)
        assertEquals(none, s.elevation)
    }

    @Test fun recoveryDropsAreDerivedValuesInBpm() {
        val s = workoutStats(workout(true), detail(HeartRateRecoveryResult(171.0, 24.0, 41.0, null)), formatter())
        assertEquals(MetricState.Value(24.0, 0, "bpm", derived), s.recovery60)
        assertEquals(MetricState.Value(41.0, 0, "bpm", derived), s.recovery120)
    }

    @Test fun oneMissingDropOnlyRemovesThatDrop() {
        val s = workoutStats(workout(true), detail(HeartRateRecoveryResult(171.0, 24.0, null, null)), formatter())
        assertEquals(MetricState.Value(24.0, 0, "bpm", derived), s.recovery60)
        assertEquals(
            MetricState.Unavailable(MetricReason.NO_DATA, context.getString(R.string.workout_hrr_no_recovery_minutes)),
            s.recovery120,
        )
    }

    @Test fun missingRecoverySaysWhy() {
        val f = formatter()
        fun reason(id: Int) = MetricState.Unavailable(MetricReason.NO_DATA, context.getString(id))
        assertEquals(
            reason(R.string.workout_hrr_needs_zones),
            hrRecoveryState(null, null, needsZones = true, formatter = f),
        )
        assertEquals(
            reason(R.string.workout_hrr_no_peak),
            hrRecoveryState(null, HeartRateRecoveryResult(null, null, null, HrrMissing.PEAK_MINUTES_MISSING), false, f),
        )
        assertEquals(
            reason(R.string.workout_hrr_no_recovery_minutes),
            hrRecoveryState(null, HeartRateRecoveryResult(null, null, null, HrrMissing.RECOVERY_MINUTES_MISSING), false, f),
        )
        assertEquals(
            reason(R.string.workout_hrr_too_easy),
            hrRecoveryState(null, HeartRateRecoveryResult(null, null, null, HrrMissing.PEAK_BELOW_MINIMUM), false, f),
        )
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA), hrRecoveryState(null, null, needsZones = false, formatter = f))
    }

    @Test fun recoveryIsLoadingUntilTheDetailArrives() {
        val s = workoutStats(workout(true), null, formatter())
        assertEquals(MetricState.Loading, s.recovery60)
        assertEquals(MetricState.Loading, s.recovery120)
    }

    @Test fun zoneMinutesCountOnlyWhenAHeartRateMinuteFellInAZone() {
        assertEquals(false, hasMeasuredZoneMinutes(null))
        assertEquals(false, hasMeasuredZoneMinutes(HeartRateZone.entries.associateWith { 0.0 }))
        assertEquals(true, hasMeasuredZoneMinutes(mapOf(HeartRateZone.ZONE_3 to 4.0, HeartRateZone.ZONE_1 to 0.0)))
    }
}
