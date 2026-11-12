package com.apex.athlete.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.apex.athlete.core.database.entity.TakeoutFileMarkEntity

/** Per-file watermarks of the Takeout archive import. */
@Dao
interface TakeoutFileMarkDao {

    @Query("SELECT * FROM takeout_file_mark ORDER BY category, fileKey")
    suspend fun all(): List<TakeoutFileMarkEntity>

    @Query("SELECT * FROM takeout_file_mark WHERE category = :category AND fileKey = :fileKey")
    suspend fun get(category: String, fileKey: String): TakeoutFileMarkEntity?

    @Upsert
    suspend fun upsert(row: TakeoutFileMarkEntity)

    /** Earliest day whose derived scores are stale because of an import whose recomputation has not finished. */
    @Query("SELECT MIN(earliestAffectedEpochDay) FROM takeout_file_mark WHERE replayPending = 1")
    suspend fun pendingReplayFromDay(): Long?

    @Query("UPDATE takeout_file_mark SET replayPending = 0 WHERE replayPending = 1")
    suspend fun clearPendingReplay(): Int

    @Query("SELECT COUNT(*) FROM takeout_file_mark")
    suspend fun count(): Int

    @Query("DELETE FROM takeout_file_mark")
    suspend fun deleteAll()
}
