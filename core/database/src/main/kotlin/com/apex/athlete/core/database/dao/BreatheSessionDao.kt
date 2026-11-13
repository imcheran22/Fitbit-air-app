package com.apex.athlete.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.apex.athlete.core.database.entity.BreatheSessionEntity
import kotlinx.coroutines.flow.Flow

/** Guided breathing sessions. Local only. */
@Dao
interface BreatheSessionDao {

    @Upsert
    suspend fun upsert(row: BreatheSessionEntity)

    @Upsert
    suspend fun upsertAll(rows: List<BreatheSessionEntity>)

    @Query("SELECT * FROM breathe_session WHERE id = :id")
    suspend fun byId(id: String): BreatheSessionEntity?

    /** Sessions with [fromMillis] <= start < [toMillis], oldest first. */
    @Query("SELECT * FROM breathe_session WHERE startMillis >= :fromMillis AND startMillis < :toMillis ORDER BY startMillis, id")
    suspend fun between(fromMillis: Long, toMillis: Long): List<BreatheSessionEntity>

    @Query("SELECT * FROM breathe_session WHERE startMillis >= :fromMillis AND startMillis < :toMillis ORDER BY startMillis, id")
    fun observeBetween(fromMillis: Long, toMillis: Long): Flow<List<BreatheSessionEntity>>

    @Query("SELECT * FROM breathe_session ORDER BY startMillis DESC, id LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<BreatheSessionEntity>>

    @Query("SELECT * FROM breathe_session ORDER BY startMillis, id")
    suspend fun all(): List<BreatheSessionEntity>

    @Query("SELECT COUNT(*) FROM breathe_session")
    suspend fun count(): Int

    @Query("DELETE FROM breathe_session WHERE id = :id")
    suspend fun deleteById(id: String): Int

    @Query("DELETE FROM breathe_session")
    suspend fun deleteAll()
}
