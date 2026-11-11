package com.apex.athlete.core.database.model

import com.apex.athlete.core.domain.DataProvenance

/**
 * Aggregate of one metric over a day range.
 * [sampleVariance] uses the n − 1 denominator and is null when fewer than two days have a value.
 */
data class RollingStatsRow(
    val n: Int,
    val mean: Double?,
    val sampleVariance: Double?,
    val min: Double?,
    val max: Double?,
)

/**
 * One day of a metric together with its trailing averages, computed in SQL.
 *
 * @property mean7 mean of the values in the 7 days ending on this day.
 * @property baselineMean30 mean of the values in the 30 days before this day (this day excluded).
 */
data class RollingWindowRow(
    val epochDay: Long,
    val value: Double,
    val provenance: DataProvenance,
    val mean7: Double?,
    val n7: Int,
    val baselineMean30: Double?,
    val baselineN30: Int,
)

data class HeartRateStatsRow(
    val minutes: Int,
    val avgBpm: Double?,
    val minBpm: Int?,
    val maxBpm: Int?,
)

/** Heart rate folded into wider buckets for charting. */
data class HeartRateBucketRow(
    /** Zero-based index of the bucket counted from the query's start time. */
    val bucketIndex: Long,
    val avgBpm: Double,
    val minBpm: Int,
    val maxBpm: Int,
    val minutes: Int,
)

/** Minutes of recorded heart rate in each zone for a time range. */
data class ZoneMinutesRow(
    val belowZones: Int,
    val zone1: Int,
    val zone2: Int,
    val zone3: Int,
    val zone4: Int,
    val zone5: Int,
)

data class SampleStatsRow(
    val n: Int,
    val mean: Double?,
    val min: Double?,
    val max: Double?,
    val sum: Double?,
)

data class WorkoutDayTotalsRow(
    val epochDay: Long,
    val workouts: Int,
    val activeDurationMillis: Long,
    val caloriesKcal: Double?,
    val distanceMeters: Double?,
    val trimp: Double?,
)

data class WorkoutTypeTotalsRow(
    val exerciseType: String,
    val workouts: Int,
    val activeDurationMillis: Long,
)
