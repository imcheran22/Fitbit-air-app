package com.apex.athlete.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType

/**
 * One value of one metric for one civil day.
 *
 * The daily summary is stored "tall" (a row per metric per day) rather than as one wide row per
 * day. A day's readings routinely come from different places (HRV from the wearable, weight from
 * a scale via Health Connect, fatigue typed in by the user, recovery computed here), and a tall
 * row lets each value carry exactly one truthful [provenance]. It also means a new metric never
 * needs a schema migration, and rolling-window queries are the same SQL for every metric.
 *
 * The primary key (metricType, epochDay) doubles as the index that serves range scans.
 */
@Entity(
    tableName = "daily_biometric_summary",
    primaryKeys = ["metricType", "epochDay"],
    indices = [Index("epochDay")],
)
data class DailyBiometricSummaryEntity(
    val metricType: MetricType,
    /** Days since 1970-01-01 in the user's local calendar. */
    val epochDay: Long,
    val value: Double,
    val provenance: DataProvenance,
    /** Sampling resolution of the stream the value was built from, in seconds, when known. */
    val sourceResolutionSeconds: Int? = null,
    /** Number of underlying samples, when the source reports it. */
    val sampleCount: Int? = null,
    /** Analytics formula version for derived values; null for observed values. */
    val algorithmVersion: Int? = null,
    val updatedAtEpochMillis: Long,
)
