package com.apex.athlete.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.apex.athlete.core.database.entity.MetricSampleEntity
import com.apex.athlete.core.database.model.SampleStatsRow
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import kotlinx.coroutines.flow.Flow

/** All time ranges are half-open: fromMillis inclusive, toMillis exclusive. */
@Dao
interface MetricSampleDao {

    @Upsert
    suspend fun upsertAll(rows: List<MetricSampleEntity>)

    @Query(
        """
        SELECT * FROM metric_sample
        WHERE metricType = :metric AND timestampEpochMillis >= :fromMillis AND timestampEpochMillis < :toMillis
        ORDER BY timestampEpochMillis
        """,
    )
    suspend fun range(metric: MetricType, fromMillis: Long, toMillis: Long): List<MetricSampleEntity>

    @Query(
        """
        SELECT * FROM metric_sample
        WHERE metricType = :metric AND timestampEpochMillis >= :fromMillis AND timestampEpochMillis < :toMillis
        ORDER BY timestampEpochMillis
        """,
    )
    fun observeRange(metric: MetricType, fromMillis: Long, toMillis: Long): Flow<List<MetricSampleEntity>>

    @Query(
        """
        SELECT COUNT(*) AS n, AVG(value) AS mean, MIN(value) AS min, MAX(value) AS max, SUM(value) AS sum
        FROM metric_sample
        WHERE metricType = :metric AND timestampEpochMillis >= :fromMillis AND timestampEpochMillis < :toMillis
        """,
    )
    suspend fun stats(metric: MetricType, fromMillis: Long, toMillis: Long): SampleStatsRow

    /** Like [stats], restricted to the samples one source wrote (for example the archive's step buckets). */
    @Query(
        """
        SELECT COUNT(*) AS n, AVG(value) AS mean, MIN(value) AS min, MAX(value) AS max, SUM(value) AS sum
        FROM metric_sample
        WHERE metricType = :metric AND provenance = :provenance
          AND timestampEpochMillis >= :fromMillis AND timestampEpochMillis < :toMillis
        """,
    )
    suspend fun statsFrom(metric: MetricType, provenance: DataProvenance, fromMillis: Long, toMillis: Long): SampleStatsRow

    @Query("SELECT * FROM metric_sample WHERE metricType = :metric ORDER BY timestampEpochMillis DESC LIMIT 1")
    suspend fun latest(metric: MetricType): MetricSampleEntity?

    @Query(
        """
        DELETE FROM metric_sample
        WHERE metricType = :metric AND timestampEpochMillis >= :fromMillis AND timestampEpochMillis < :toMillis
        """,
    )
    suspend fun deleteRange(metric: MetricType, fromMillis: Long, toMillis: Long): Int

    @Query("SELECT COUNT(*) FROM metric_sample")
    suspend fun count(): Int

    @Query("DELETE FROM metric_sample")
    suspend fun deleteAll()
}
