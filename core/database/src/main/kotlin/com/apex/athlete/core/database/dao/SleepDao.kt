package com.apex.athlete.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.apex.athlete.core.database.entity.SleepSessionEntity
import com.apex.athlete.core.database.entity.SleepSessionWithStages
import com.apex.athlete.core.database.entity.SleepStageSegmentEntity
import kotlinx.coroutines.flow.Flow

@Dao
abstract class SleepDao {

    @Upsert
    protected abstract suspend fun upsertSession(session: SleepSessionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    protected abstract suspend fun insertStages(stages: List<SleepStageSegmentEntity>)

    @Query("DELETE FROM sleep_stage_segment WHERE sessionId = :sessionId")
    protected abstract suspend fun deleteStages(sessionId: String)

    /**
     * Stores a session together with its hypnogram. Sources revise a night after the first
     * upload (stage scoring finishes later), so existing segments are replaced, not merged.
     */
    @Transaction
    open suspend fun replaceSession(session: SleepSessionEntity, stages: List<SleepStageSegmentEntity>) {
        upsertSession(session)
        deleteStages(session.id)
        if (stages.isNotEmpty()) insertStages(stages)
    }

    /** The main sleep that ended on a day; the longest one if a source ever reports two. */
    @Query(
        """
        SELECT * FROM sleep_session
        WHERE epochDay = :epochDay AND isMainSleep = 1
        ORDER BY minutesAsleep DESC LIMIT 1
        """,
    )
    abstract suspend fun mainSleepForDay(epochDay: Long): SleepSessionEntity?

    @Transaction
    @Query(
        """
        SELECT * FROM sleep_session
        WHERE epochDay = :epochDay AND isMainSleep = 1
        ORDER BY minutesAsleep DESC LIMIT 1
        """,
    )
    abstract suspend fun mainSleepWithStagesForDay(epochDay: Long): SleepSessionWithStages?

    @Transaction
    @Query(
        """
        SELECT * FROM sleep_session
        WHERE epochDay = :epochDay AND isMainSleep = 1
        ORDER BY minutesAsleep DESC LIMIT 1
        """,
    )
    abstract fun observeMainSleepWithStagesForDay(epochDay: Long): Flow<SleepSessionWithStages?>

    /** Main sleeps in a day range, oldest first: the input for sleep need, debt and consistency. */
    @Query(
        """
        SELECT * FROM sleep_session
        WHERE isMainSleep = 1 AND epochDay BETWEEN :fromDay AND :toDay
        ORDER BY epochDay, minutesAsleep DESC
        """,
    )
    abstract suspend fun mainSleepsBetween(fromDay: Long, toDay: Long): List<SleepSessionEntity>

    /** Every session (main sleeps and naps) in a day range. */
    @Query("SELECT * FROM sleep_session WHERE epochDay BETWEEN :fromDay AND :toDay ORDER BY startEpochMillis")
    abstract suspend fun sessionsBetween(fromDay: Long, toDay: Long): List<SleepSessionEntity>

    @Query("SELECT * FROM sleep_session WHERE epochDay BETWEEN :fromDay AND :toDay ORDER BY startEpochMillis")
    abstract fun observeSessionsBetween(fromDay: Long, toDay: Long): Flow<List<SleepSessionEntity>>

    /** Sessions that overlap a time span; used to spot the same night arriving from two sources. */
    @Query("SELECT * FROM sleep_session WHERE startEpochMillis < :endMillis AND endEpochMillis > :startMillis")
    abstract suspend fun overlapping(startMillis: Long, endMillis: Long): List<SleepSessionEntity>

    @Query("SELECT * FROM sleep_stage_segment WHERE sessionId = :sessionId ORDER BY startEpochMillis")
    abstract suspend fun stagesFor(sessionId: String): List<SleepStageSegmentEntity>

    @Query("SELECT * FROM sleep_session ORDER BY startEpochMillis")
    abstract suspend fun allSessions(): List<SleepSessionEntity>

    @Query("DELETE FROM sleep_session WHERE id = :id")
    abstract suspend fun deleteById(id: String): Int

    @Query("DELETE FROM sleep_session")
    abstract suspend fun deleteAll()
}
