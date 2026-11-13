package com.apex.athlete.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.apex.athlete.core.database.entity.BloodPressureReadingEntity
import kotlinx.coroutines.flow.Flow

/** Blood pressure readings. Local only. */
@Dao
interface BloodPressureDao {

    @Upsert
    suspend fun upsert(row: BloodPressureReadingEntity)

    @Upsert
    suspend fun upsertAll(rows: List<BloodPressureReadingEntity>)

    @Query("SELECT * FROM blood_pressure_reading WHERE id = :id")
    suspend fun byId(id: String): BloodPressureReadingEntity?

    /** Readings with [fromMillis] <= time < [toMillis], oldest first. */
    @Query("SELECT * FROM blood_pressure_reading WHERE epochMillis >= :fromMillis AND epochMillis < :toMillis ORDER BY epochMillis, id")
    suspend fun between(fromMillis: Long, toMillis: Long): List<BloodPressureReadingEntity>

    @Query("SELECT * FROM blood_pressure_reading WHERE epochMillis >= :fromMillis AND epochMillis < :toMillis ORDER BY epochMillis, id")
    fun observeBetween(fromMillis: Long, toMillis: Long): Flow<List<BloodPressureReadingEntity>>

    @Query("SELECT * FROM blood_pressure_reading ORDER BY epochMillis DESC, id LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<BloodPressureReadingEntity>>

    @Query("SELECT * FROM blood_pressure_reading ORDER BY epochMillis, id")
    suspend fun all(): List<BloodPressureReadingEntity>

    @Query("SELECT COUNT(*) FROM blood_pressure_reading")
    suspend fun count(): Int

    @Query("DELETE FROM blood_pressure_reading WHERE id = :id")
    suspend fun deleteById(id: String): Int

    @Query("DELETE FROM blood_pressure_reading")
    suspend fun deleteAll()
}
