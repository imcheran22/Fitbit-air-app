package com.apex.athlete.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.apex.athlete.core.domain.DataProvenance

/**
 * Heart rate in one-minute buckets.
 *
 * The wearable samples every few seconds; a full year at that rate would be about fifteen
 * million rows. Strain, zones and charts all work per minute, so samples are folded into
 * one-minute buckets on ingestion (average, minimum, maximum, sample count): about half a
 * million rows per year.
 */
@Entity(tableName = "intraday_heart_rate")
data class IntradayHeartRateEntity(
    /** Start of the minute (UTC epoch milliseconds, aligned to :00 seconds). */
    @PrimaryKey val timestampEpochMillis: Long,
    val avgBpm: Double,
    val minBpm: Int,
    val maxBpm: Int,
    val sampleCount: Int,
    val provenance: DataProvenance,
)
