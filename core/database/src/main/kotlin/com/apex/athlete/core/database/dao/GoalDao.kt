package com.apex.athlete.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.apex.athlete.core.database.entity.GoalEntity
import kotlinx.coroutines.flow.Flow

/** The owner's goals. Local only. */
@Dao
interface GoalDao {

    @Upsert
    suspend fun upsert(row: GoalEntity)

    @Upsert
    suspend fun upsertAll(rows: List<GoalEntity>)

    @Query("SELECT * FROM goal WHERE id = :id")
    suspend fun byId(id: String): GoalEntity?

    @Query("SELECT * FROM goal ORDER BY createdAtEpochMillis, id")
    fun observeAll(): Flow<List<GoalEntity>>

    @Query("SELECT * FROM goal ORDER BY createdAtEpochMillis, id")
    suspend fun all(): List<GoalEntity>

    @Query("SELECT COUNT(*) FROM goal")
    suspend fun count(): Int

    @Query("DELETE FROM goal WHERE id = :id")
    suspend fun deleteById(id: String): Int

    @Query("DELETE FROM goal")
    suspend fun deleteAll()
}
