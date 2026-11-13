package com.apex.athlete.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.apex.athlete.core.database.entity.DailyBiometricSummaryEntity
import com.apex.athlete.core.database.model.RollingStatsRow
import com.apex.athlete.core.database.model.RollingWindowRow
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SourceCandidate
import com.apex.athlete.core.domain.SourceReconciler
import kotlinx.coroutines.flow.Flow

@Dao
abstract class DailyBiometricSummaryDao {

    /** Unconditional write. Use [reconcileAndUpsert] for values arriving from a data source. */
    @Upsert
    abstract suspend fun upsertAll(rows: List<DailyBiometricSummaryEntity>)

    @Query("SELECT * FROM daily_biometric_summary WHERE metricType = :metric AND epochDay = :epochDay")
    abstract suspend fun get(metric: MetricType, epochDay: Long): DailyBiometricSummaryEntity?

    @Query("SELECT * FROM daily_biometric_summary WHERE epochDay = :epochDay")
    abstract suspend fun forDay(epochDay: Long): List<DailyBiometricSummaryEntity>

    @Query("SELECT * FROM daily_biometric_summary WHERE epochDay = :epochDay")
    abstract fun observeForDay(epochDay: Long): Flow<List<DailyBiometricSummaryEntity>>

    @Query(
        """
        SELECT * FROM daily_biometric_summary
        WHERE metricType = :metric AND epochDay BETWEEN :fromDay AND :toDay
        ORDER BY epochDay
        """,
    )
    abstract suspend fun range(metric: MetricType, fromDay: Long, toDay: Long): List<DailyBiometricSummaryEntity>

    @Query(
        """
        SELECT * FROM daily_biometric_summary
        WHERE metricType = :metric AND epochDay BETWEEN :fromDay AND :toDay
        ORDER BY epochDay
        """,
    )
    abstract fun observeRange(metric: MetricType, fromDay: Long, toDay: Long): Flow<List<DailyBiometricSummaryEntity>>

    /** Every stored value in a day range, for assembling multi-metric views in one query. */
    @Query("SELECT * FROM daily_biometric_summary WHERE epochDay BETWEEN :fromDay AND :toDay ORDER BY epochDay")
    abstract suspend fun allInRange(fromDay: Long, toDay: Long): List<DailyBiometricSummaryEntity>

    /** Most recent value on or before a day; the "current reading" when today has none yet. */
    @Query(
        """
        SELECT * FROM daily_biometric_summary
        WHERE metricType = :metric AND epochDay <= :onOrBeforeDay
        ORDER BY epochDay DESC LIMIT 1
        """,
    )
    abstract suspend fun latest(metric: MetricType, onOrBeforeDay: Long): DailyBiometricSummaryEntity?

    /**
     * Count, mean, sample variance, minimum and maximum of a metric over a day range.
     * The variance is computed as (Σx² − n·mean²) / (n − 1); take its square root for σ.
     * For the 30-day personal baseline of day D, pass fromDay = D − 30 and toDay = D − 1.
     */
    @Query(
        """
        SELECT COUNT(*) AS n,
               AVG(value) AS mean,
               CASE WHEN COUNT(*) > 1
                    THEN MAX(0.0, (SUM(value * value) - COUNT(*) * AVG(value) * AVG(value)) / (COUNT(*) - 1))
                    ELSE NULL END AS sampleVariance,
               MIN(value) AS min,
               MAX(value) AS max
        FROM daily_biometric_summary
        WHERE metricType = :metric AND epochDay BETWEEN :fromDay AND :toDay
        """,
    )
    abstract suspend fun rollingStats(metric: MetricType, fromDay: Long, toDay: Long): RollingStatsRow

    /**
     * Each day's value with its trailing 7-day mean and the mean of the preceding 30 days,
     * computed with window functions in a single pass. Windows are ranges of calendar days, so
     * gaps in the data shrink the sample (see the n columns) instead of stretching the window.
     */
    @Query(
        """
        SELECT epochDay, value, provenance, mean7, n7, baselineMean30, baselineN30 FROM (
            SELECT epochDay, value, provenance,
                   AVG(value) OVER (ORDER BY epochDay RANGE BETWEEN 6 PRECEDING AND CURRENT ROW) AS mean7,
                   COUNT(value) OVER (ORDER BY epochDay RANGE BETWEEN 6 PRECEDING AND CURRENT ROW) AS n7,
                   AVG(value) OVER (ORDER BY epochDay RANGE BETWEEN 30 PRECEDING AND 1 PRECEDING) AS baselineMean30,
                   COUNT(value) OVER (ORDER BY epochDay RANGE BETWEEN 30 PRECEDING AND 1 PRECEDING) AS baselineN30
            FROM daily_biometric_summary
            WHERE metricType = :metric AND epochDay BETWEEN :fromDay - 30 AND :toDay
        )
        WHERE epochDay >= :fromDay
        ORDER BY epochDay
        """,
    )
    abstract suspend fun rollingWindowSeries(metric: MetricType, fromDay: Long, toDay: Long): List<RollingWindowRow>

    @Query("SELECT MIN(epochDay) FROM daily_biometric_summary WHERE metricType = :metric")
    abstract suspend fun firstDay(metric: MetricType): Long?

    @Query("SELECT MAX(epochDay) FROM daily_biometric_summary WHERE metricType = :metric")
    abstract suspend fun lastDay(metric: MetricType): Long?

    @Query("SELECT * FROM daily_biometric_summary WHERE epochDay BETWEEN :fromDay AND :toDay AND metricType IN (:metricKeys)")
    protected abstract suspend fun existingFor(metricKeys: List<String>, fromDay: Long, toDay: Long): List<DailyBiometricSummaryEntity>

    /** Removes every value with the given provenance, e.g. all derived scores before a recompute. */
    @Query("DELETE FROM daily_biometric_summary WHERE provenance = :provenance")
    abstract suspend fun deleteByProvenance(provenance: DataProvenance): Int

    /** Oldest day holding a derived value computed with a formula version older than [version]; null when none is stale. */
    @Query("SELECT MIN(epochDay) FROM daily_biometric_summary WHERE algorithmVersion IS NOT NULL AND algorithmVersion < :version")
    abstract suspend fun firstStaleDerivedDay(version: Int): Long?

    /** Removes derived values computed with a formula version older than [version]; observed values carry no version and stay. */
    @Query("DELETE FROM daily_biometric_summary WHERE algorithmVersion IS NOT NULL AND algorithmVersion < :version")
    abstract suspend fun deleteStaleDerived(version: Int): Int

    /** Removes one metric's value for one day (a derived score whose inputs disappeared). */
    @Query("DELETE FROM daily_biometric_summary WHERE metricType = :metric AND epochDay = :epochDay")
    abstract suspend fun delete(metric: MetricType, epochDay: Long): Int

    /** Every stored value, oldest first, for export. */
    @Query("SELECT * FROM daily_biometric_summary ORDER BY epochDay, metricType")
    abstract suspend fun all(): List<DailyBiometricSummaryEntity>

    @Query("SELECT COUNT(*) FROM daily_biometric_summary")
    abstract suspend fun count(): Int

    @Query("DELETE FROM daily_biometric_summary")
    abstract suspend fun deleteAll()

    /**
     * Writes values arriving from a source, keeping whichever copy [SourceReconciler] prefers
     * when a value for the same metric and day already exists. Returns the number of rows written.
     */
    @Transaction
    open suspend fun reconcileAndUpsert(incoming: List<DailyBiometricSummaryEntity>): Int {
        if (incoming.isEmpty()) return 0
        val existing = existingFor(
            metricKeys = incoming.map { it.metricType.storageKey }.distinct(),
            fromDay = incoming.minOf { it.epochDay },
            toDay = incoming.maxOf { it.epochDay },
        ).associateBy { it.metricType to it.epochDay }

        val accepted = incoming.filter { row ->
            val current = existing[row.metricType to row.epochDay]
            SourceReconciler.shouldReplace(
                metric = row.metricType,
                existing = current?.let {
                    SourceCandidate(it.provenance, it.sourceResolutionSeconds, it.updatedAtEpochMillis)
                },
                incoming = SourceCandidate(row.provenance, row.sourceResolutionSeconds, row.updatedAtEpochMillis),
            )
        }
        if (accepted.isNotEmpty()) upsertAll(accepted)
        return accepted.size
    }
}
