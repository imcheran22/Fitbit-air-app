package com.apex.athlete.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.apex.athlete.core.database.entity.FoodLogEntity
import kotlinx.coroutines.flow.Flow

/** Food log. Local only. */
@Dao
interface FoodLogDao {

    @Upsert
    suspend fun upsert(row: FoodLogEntity)

    @Upsert
    suspend fun upsertAll(rows: List<FoodLogEntity>)

    @Query("SELECT * FROM food_log WHERE id = :id")
    suspend fun byId(id: String): FoodLogEntity?

    /** Entries with [fromMillis] <= time < [toMillis], oldest first. */
    @Query("SELECT * FROM food_log WHERE epochMillis >= :fromMillis AND epochMillis < :toMillis ORDER BY epochMillis, id")
    suspend fun between(fromMillis: Long, toMillis: Long): List<FoodLogEntity>

    @Query("SELECT * FROM food_log WHERE epochMillis >= :fromMillis AND epochMillis < :toMillis ORDER BY epochMillis, id")
    fun observeBetween(fromMillis: Long, toMillis: Long): Flow<List<FoodLogEntity>>

    @Query("SELECT * FROM food_log ORDER BY epochMillis DESC, id LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<FoodLogEntity>>

    @Query("SELECT * FROM food_log ORDER BY epochMillis, id")
    suspend fun all(): List<FoodLogEntity>

    @Query("SELECT COUNT(*) FROM food_log")
    suspend fun count(): Int

    @Query("DELETE FROM food_log WHERE id = :id")
    suspend fun deleteById(id: String): Int

    @Query("DELETE FROM food_log")
    suspend fun deleteAll()
}
