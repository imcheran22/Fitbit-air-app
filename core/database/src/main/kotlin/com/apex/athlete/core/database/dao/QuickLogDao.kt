package com.apex.athlete.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.apex.athlete.core.database.entity.QuickLogEntity
import com.apex.athlete.core.database.entity.QuickLogKind
import kotlinx.coroutines.flow.Flow

/** Quick log entries (water, mood, symptom, note). Local only. */
@Dao
interface QuickLogDao {

    @Upsert
    suspend fun upsert(row: QuickLogEntity)

    @Upsert
    suspend fun upsertAll(rows: List<QuickLogEntity>)

    @Query("SELECT * FROM quick_log WHERE id = :id")
    suspend fun byId(id: String): QuickLogEntity?

    /** Entries with [fromMillis] <= time < [toMillis], oldest first. */
    @Query("SELECT * FROM quick_log WHERE epochMillis >= :fromMillis AND epochMillis < :toMillis ORDER BY epochMillis, id")
    suspend fun between(fromMillis: Long, toMillis: Long): List<QuickLogEntity>

    @Query("SELECT * FROM quick_log WHERE epochMillis >= :fromMillis AND epochMillis < :toMillis ORDER BY epochMillis DESC, id")
    fun observeBetween(fromMillis: Long, toMillis: Long): Flow<List<QuickLogEntity>>

    @Query("SELECT * FROM quick_log ORDER BY epochMillis DESC, id LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<QuickLogEntity>>

    /** Sum of [QuickLogEntity.numericValue] of one kind in a time range; null when there is no entry with a value. */
    @Query("SELECT SUM(numericValue) FROM quick_log WHERE kind = :kind AND epochMillis >= :fromMillis AND epochMillis < :toMillis")
    fun observeSum(kind: QuickLogKind, fromMillis: Long, toMillis: Long): Flow<Double?>

    @Query("SELECT * FROM quick_log ORDER BY epochMillis, id")
    suspend fun all(): List<QuickLogEntity>

    @Query("SELECT COUNT(*) FROM quick_log")
    suspend fun count(): Int

    @Query("DELETE FROM quick_log WHERE id = :id")
    suspend fun deleteById(id: String): Int

    @Query("DELETE FROM quick_log")
    suspend fun deleteAll()
}
