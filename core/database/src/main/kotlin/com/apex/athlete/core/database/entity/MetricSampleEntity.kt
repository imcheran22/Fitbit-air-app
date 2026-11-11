package com.apex.athlete.core.database.entity

import androidx.room.Entity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType

/**
 * A timestamped sample of any metric other than heart rate: overnight HRV readings, SpO2
 * readings, step intervals, weigh-ins, blood-pressure readings and so on.
 *
 * The primary key (metricType, timestampEpochMillis) is the index every time-range query uses.
 */
@Entity(tableName = "metric_sample", primaryKeys = ["metricType", "timestampEpochMillis"])
data class MetricSampleEntity(
    val metricType: MetricType,
    /** Sample time, or interval start for interval metrics such as steps (UTC epoch milliseconds). */
    val timestampEpochMillis: Long,
    /** Interval end for interval metrics; null for instantaneous samples. */
    val endEpochMillis: Long? = null,
    val value: Double,
    val provenance: DataProvenance,
)
