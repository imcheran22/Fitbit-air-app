package com.apex.athlete.core.data.model

import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SleepStage

/*
 * The one shape every source (Demo, Health Connect, Google Health API, Takeout archive, fixtures)
 * converts its records into. Sources never touch the database; they hand batches to the ingestor,
 * which is the only place reconciliation and de-duplication happen.
 */

/** One heart-rate reading at an instant (UTC epoch milliseconds). */
data class HeartRatePoint(val epochMillis: Long, val bpm: Int)

/** One value of a metric for one civil day (days since 1970-01-01 in the calendar it was recorded in). */
data class DailyObservation(
    val metric: MetricType,
    val epochDay: Long,
    val value: Double,
    val resolutionSeconds: Int? = null,
    val sampleCount: Int? = null,
)

/** A timestamped sample of a metric other than heart rate. */
data class SampleObservation(
    val metric: MetricType,
    val epochMillis: Long,
    val value: Double,
    val endEpochMillis: Long? = null,
)

data class SleepStageObservation(val startEpochMillis: Long, val endEpochMillis: Long, val stage: SleepStage)

data class SleepObservation(
    /** Source-scoped stable identifier, for example "hc:<record id>". */
    val id: String,
    val startEpochMillis: Long,
    val endEpochMillis: Long,
    val startZoneOffsetSeconds: Int,
    val endZoneOffsetSeconds: Int,
    /** Null when the source does not say; the ingestor then decides from duration. */
    val isMainSleep: Boolean? = null,
    val isNap: Boolean? = null,
    val minutesAsleep: Int? = null,
    val minutesAwake: Int? = null,
    val minutesToFallAsleep: Int? = null,
    val stages: List<SleepStageObservation> = emptyList(),
)

data class WorkoutObservation(
    val id: String,
    val startEpochMillis: Long,
    val endEpochMillis: Long,
    val zoneOffsetSeconds: Int,
    val exerciseType: String,
    val displayName: String,
    val activeDurationMillis: Long,
    val averageHeartRate: Int? = null,
    val maxHeartRate: Int? = null,
    val caloriesKcal: Double? = null,
    val distanceMeters: Double? = null,
    val steps: Long? = null,
    val elevationGainMeters: Double? = null,
    val activeZoneMinutes: Int? = null,
    val perceivedExertion: Int? = null,
)

/** A chunk of records from one source. Any list may be empty. */
data class HealthBatch(
    val provenance: DataProvenance,
    val heartRate: List<HeartRatePoint> = emptyList(),
    val daily: List<DailyObservation> = emptyList(),
    val samples: List<SampleObservation> = emptyList(),
    val sleeps: List<SleepObservation> = emptyList(),
    val workouts: List<WorkoutObservation> = emptyList(),
) {
    val isEmpty: Boolean
        get() = heartRate.isEmpty() && daily.isEmpty() && samples.isEmpty() && sleeps.isEmpty() && workouts.isEmpty()
}

/** What an ingestion run did; counts only, never values, so it is safe to show and to log. */
data class IngestCounts(
    val heartRatePoints: Long = 0,
    val heartRateMinutesWritten: Long = 0,
    val heartRateMinutesKept: Long = 0,
    val dailyWritten: Long = 0,
    val dailyKept: Long = 0,
    val samplesWritten: Long = 0,
    val sleepsWritten: Long = 0,
    val sleepsKept: Long = 0,
    val workoutsWritten: Long = 0,
    val workoutsKept: Long = 0,
    val rejected: Long = 0,
) {
    operator fun plus(o: IngestCounts) = IngestCounts(
        heartRatePoints + o.heartRatePoints,
        heartRateMinutesWritten + o.heartRateMinutesWritten,
        heartRateMinutesKept + o.heartRateMinutesKept,
        dailyWritten + o.dailyWritten,
        dailyKept + o.dailyKept,
        samplesWritten + o.samplesWritten,
        sleepsWritten + o.sleepsWritten,
        sleepsKept + o.sleepsKept,
        workoutsWritten + o.workoutsWritten,
        workoutsKept + o.workoutsKept,
        rejected + o.rejected,
    )

    val totalWritten: Long
        get() = heartRateMinutesWritten + dailyWritten + samplesWritten + sleepsWritten + workoutsWritten
}
