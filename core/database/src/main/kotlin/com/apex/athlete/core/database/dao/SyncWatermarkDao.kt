package com.apex.athlete.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.apex.athlete.core.database.entity.SyncWatermarkEntity
import com.apex.athlete.core.domain.SyncSource
import com.apex.athlete.core.domain.SyncStatus
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncWatermarkDao {

    /** Creates the row for a stream if it does not exist yet; an existing row is left untouched. */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIfAbsent(row: SyncWatermarkEntity): Long

    @Query("SELECT * FROM sync_watermark WHERE source = :source AND stream = :stream")
    suspend fun get(source: SyncSource, stream: String): SyncWatermarkEntity?

    @Query("SELECT * FROM sync_watermark ORDER BY source, stream")
    fun observeAll(): Flow<List<SyncWatermarkEntity>>

    @Query("SELECT * FROM sync_watermark WHERE source = :source ORDER BY stream")
    suspend fun forSource(source: SyncSource): List<SyncWatermarkEntity>

    /**
     * Records a window that was fully written to the database. The watermark only ever moves
     * forward: re-running an older window can never pull it back and cause re-downloads.
     */
    @Query(
        """
        UPDATE sync_watermark
        SET lastSyncedEpochMillis = MAX(lastSyncedEpochMillis, :syncedThroughMillis),
            cursorToken = :cursorToken,
            lastAttemptEpochMillis = :nowMillis,
            lastSuccessEpochMillis = :nowMillis,
            status = :status,
            lastError = NULL,
            consecutiveFailures = 0
        WHERE source = :source AND stream = :stream
        """,
    )
    suspend fun advance(
        source: SyncSource,
        stream: String,
        syncedThroughMillis: Long,
        cursorToken: String?,
        status: SyncStatus,
        nowMillis: Long,
    ): Int

    /** Records a failed attempt. The watermark stays where it was, so the next run retries the gap. */
    @Query(
        """
        UPDATE sync_watermark
        SET lastAttemptEpochMillis = :nowMillis,
            status = :status,
            lastError = :error,
            consecutiveFailures = consecutiveFailures + 1
        WHERE source = :source AND stream = :stream
        """,
    )
    suspend fun recordFailure(source: SyncSource, stream: String, status: SyncStatus, error: String?, nowMillis: Long): Int

    /** Extends how far back historical backfill has reached; the floor only ever moves earlier. */
    @Query(
        """
        UPDATE sync_watermark
        SET backfillFloorEpochMillis = CASE
                WHEN backfillFloorEpochMillis IS NULL THEN :floorMillis
                ELSE MIN(backfillFloorEpochMillis, :floorMillis) END
        WHERE source = :source AND stream = :stream
        """,
    )
    suspend fun extendBackfillFloor(source: SyncSource, stream: String, floorMillis: Long): Int

    /** The stream of a source that is furthest behind; drives the "last synced" display. */
    @Query("SELECT MIN(lastSyncedEpochMillis) FROM sync_watermark WHERE source = :source")
    suspend fun oldestWatermark(source: SyncSource): Long?

    @Query("DELETE FROM sync_watermark WHERE source = :source")
    suspend fun deleteForSource(source: SyncSource): Int

    @Query("DELETE FROM sync_watermark")
    suspend fun deleteAll()
}
