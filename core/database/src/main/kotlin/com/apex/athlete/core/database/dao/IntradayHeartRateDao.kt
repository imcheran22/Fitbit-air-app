package com.apex.athlete.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.apex.athlete.core.database.entity.IntradayHeartRateEntity
import com.apex.athlete.core.database.model.HeartRateBucketRow
import com.apex.athlete.core.database.model.HeartRateStatsRow
import com.apex.athlete.core.database.model.ZoneMinutesRow
import kotlinx.coroutines.flow.Flow

/** All time ranges are half-open: fromMillis inclusive, toMillis exclusive. */
@Dao
interface IntradayHeartRateDao {

    @Upsert
    suspend fun upsertAll(rows: List<IntradayHeartRateEntity>)

    @Query(
        """
        SELECT * FROM intraday_heart_rate
        WHERE timestampEpochMillis >= :fromMillis AND timestampEpochMillis < :toMillis
        ORDER BY timestampEpochMillis
        """,
    )
    suspend fun range(fromMillis: Long, toMillis: Long): List<IntradayHeartRateEntity>

    @Query(
        """
        SELECT * FROM intraday_heart_rate
        WHERE timestampEpochMillis >= :fromMillis AND timestampEpochMillis < :toMillis
        ORDER BY timestampEpochMillis
        """,
    )
    fun observeRange(fromMillis: Long, toMillis: Long): Flow<List<IntradayHeartRateEntity>>

    @Query(
        """
        SELECT COUNT(*) AS minutes, AVG(avgBpm) AS avgBpm, MIN(minBpm) AS minBpm, MAX(maxBpm) AS maxBpm
        FROM intraday_heart_rate
        WHERE timestampEpochMillis >= :fromMillis AND timestampEpochMillis < :toMillis
        """,
    )
    suspend fun stats(fromMillis: Long, toMillis: Long): HeartRateStatsRow

    /**
     * Heart rate folded into buckets of [bucketMillis] for charts, so a 24-hour or multi-day
     * view draws a few hundred points instead of thousands.
     */
    @Query(
        """
        SELECT (timestampEpochMillis - :fromMillis) / :bucketMillis AS bucketIndex,
               AVG(avgBpm) AS avgBpm, MIN(minBpm) AS minBpm, MAX(maxBpm) AS maxBpm, COUNT(*) AS minutes
        FROM intraday_heart_rate
        WHERE timestampEpochMillis >= :fromMillis AND timestampEpochMillis < :toMillis
        GROUP BY bucketIndex
        ORDER BY bucketIndex
        """,
    )
    suspend fun downsampled(fromMillis: Long, toMillis: Long, bucketMillis: Long): List<HeartRateBucketRow>

    /** Minutes spent in each zone; the five arguments are the lower bpm limits of zones 1..5. */
    @Query(
        """
        SELECT COALESCE(SUM(CASE WHEN avgBpm < :zone1 THEN 1 ELSE 0 END), 0) AS belowZones,
               COALESCE(SUM(CASE WHEN avgBpm >= :zone1 AND avgBpm < :zone2 THEN 1 ELSE 0 END), 0) AS zone1,
               COALESCE(SUM(CASE WHEN avgBpm >= :zone2 AND avgBpm < :zone3 THEN 1 ELSE 0 END), 0) AS zone2,
               COALESCE(SUM(CASE WHEN avgBpm >= :zone3 AND avgBpm < :zone4 THEN 1 ELSE 0 END), 0) AS zone3,
               COALESCE(SUM(CASE WHEN avgBpm >= :zone4 AND avgBpm < :zone5 THEN 1 ELSE 0 END), 0) AS zone4,
               COALESCE(SUM(CASE WHEN avgBpm >= :zone5 THEN 1 ELSE 0 END), 0) AS zone5
        FROM intraday_heart_rate
        WHERE timestampEpochMillis >= :fromMillis AND timestampEpochMillis < :toMillis
        """,
    )
    suspend fun zoneMinutes(
        fromMillis: Long,
        toMillis: Long,
        zone1: Double,
        zone2: Double,
        zone3: Double,
        zone4: Double,
        zone5: Double,
    ): ZoneMinutesRow

    /** Highest one-minute average on record since [sinceMillis]; a robust observed peak heart rate. */
    @Query("SELECT MAX(avgBpm) FROM intraday_heart_rate WHERE timestampEpochMillis >= :sinceMillis")
    suspend fun peakMinuteAverage(sinceMillis: Long): Double?

    /** Highest one-minute average inside a half-open time range. */
    @Query("SELECT MAX(avgBpm) FROM intraday_heart_rate WHERE timestampEpochMillis >= :fromMillis AND timestampEpochMillis < :toMillis")
    suspend fun peakMinuteAverageBetween(fromMillis: Long, toMillis: Long): Double?

    @Query("SELECT COUNT(*) FROM intraday_heart_rate")
    suspend fun count(): Int

    @Query("SELECT MAX(timestampEpochMillis) FROM intraday_heart_rate")
    suspend fun latestTimestamp(): Long?

    @Query("SELECT MIN(timestampEpochMillis) FROM intraday_heart_rate")
    suspend fun earliestTimestamp(): Long?

    @Query("DELETE FROM intraday_heart_rate WHERE timestampEpochMillis >= :fromMillis AND timestampEpochMillis < :toMillis")
    suspend fun deleteRange(fromMillis: Long, toMillis: Long): Int

    @Query("DELETE FROM intraday_heart_rate")
    suspend fun deleteAll()
}
