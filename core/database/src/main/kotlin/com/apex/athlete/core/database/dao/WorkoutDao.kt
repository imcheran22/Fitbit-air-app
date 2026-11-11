package com.apex.athlete.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.apex.athlete.core.database.entity.WorkoutEntity
import com.apex.athlete.core.database.model.WorkoutDayTotalsRow
import com.apex.athlete.core.database.model.WorkoutTypeTotalsRow
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkoutDao {

    @Upsert
    suspend fun upsertAll(rows: List<WorkoutEntity>)

    @Query("SELECT * FROM workout WHERE id = :id")
    suspend fun byId(id: String): WorkoutEntity?

    @Query("SELECT * FROM workout WHERE epochDay BETWEEN :fromDay AND :toDay ORDER BY startEpochMillis")
    suspend fun between(fromDay: Long, toDay: Long): List<WorkoutEntity>

    @Query("SELECT * FROM workout WHERE epochDay BETWEEN :fromDay AND :toDay ORDER BY startEpochMillis DESC")
    fun observeBetween(fromDay: Long, toDay: Long): Flow<List<WorkoutEntity>>

    @Query("SELECT * FROM workout ORDER BY startEpochMillis DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<WorkoutEntity>>

    /** Workouts that overlap a time span; used to spot the same session arriving from two sources. */
    @Query("SELECT * FROM workout WHERE startEpochMillis < :endMillis AND endEpochMillis > :startMillis")
    suspend fun overlapping(startMillis: Long, endMillis: Long): List<WorkoutEntity>

    /** Per-day totals for weekly and monthly volume charts. Days without workouts have no row. */
    @Query(
        """
        SELECT epochDay,
               COUNT(*) AS workouts,
               SUM(activeDurationMillis) AS activeDurationMillis,
               SUM(caloriesKcal) AS caloriesKcal,
               SUM(distanceMeters) AS distanceMeters,
               SUM(derivedTrimp) AS trimp
        FROM workout
        WHERE epochDay BETWEEN :fromDay AND :toDay
        GROUP BY epochDay
        ORDER BY epochDay
        """,
    )
    suspend fun dailyTotals(fromDay: Long, toDay: Long): List<WorkoutDayTotalsRow>

    /** Count and time per exercise type, most time first. */
    @Query(
        """
        SELECT exerciseType, COUNT(*) AS workouts, SUM(activeDurationMillis) AS activeDurationMillis
        FROM workout
        WHERE epochDay BETWEEN :fromDay AND :toDay
        GROUP BY exerciseType
        ORDER BY activeDurationMillis DESC
        """,
    )
    suspend fun typeTotals(fromDay: Long, toDay: Long): List<WorkoutTypeTotalsRow>

    /** Stores the load this app computed for a workout without touching the source's fields. */
    @Query("UPDATE workout SET derivedTrimp = :trimp, derivedStrain = :strain WHERE id = :id")
    suspend fun updateDerivedLoad(id: String, trimp: Double?, strain: Double?): Int

    @Query("SELECT * FROM workout ORDER BY startEpochMillis")
    suspend fun all(): List<WorkoutEntity>

    @Query("DELETE FROM workout WHERE id = :id")
    suspend fun deleteById(id: String): Int

    @Query("DELETE FROM workout")
    suspend fun deleteAll()
}
