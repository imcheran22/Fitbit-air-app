package com.apex.athlete.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.apex.athlete.core.database.entity.BehaviourDefEntity
import com.apex.athlete.core.database.entity.BehaviourEntryEntity
import com.apex.athlete.core.database.entity.DailyBiometricSummaryEntity
import kotlinx.coroutines.flow.Flow

/** Custom behaviours (and overrides of the built-in journal factors) and their daily values. Local only. */
@Dao
interface BehaviourDao {

    @Upsert
    suspend fun upsertDef(def: BehaviourDefEntity)

    @Upsert
    suspend fun upsertDefs(defs: List<BehaviourDefEntity>)

    @Query("SELECT * FROM behaviour_def WHERE id = :id")
    suspend fun defById(id: String): BehaviourDefEntity?

    @Query("SELECT * FROM behaviour_def ORDER BY sortOrder, id")
    suspend fun defs(): List<BehaviourDefEntity>

    @Query("SELECT * FROM behaviour_def ORDER BY sortOrder, id")
    fun observeDefs(): Flow<List<BehaviourDefEntity>>

    @Query("SELECT MAX(sortOrder) FROM behaviour_def")
    suspend fun maxSortOrder(): Int?

    @Upsert
    suspend fun upsertEntry(entry: BehaviourEntryEntity)

    @Upsert
    suspend fun upsertEntries(entries: List<BehaviourEntryEntity>)

    @Query("DELETE FROM behaviour_entry WHERE epochDay = :epochDay AND behaviourId = :behaviourId")
    suspend fun deleteEntry(epochDay: Long, behaviourId: String): Int

    @Query("DELETE FROM behaviour_entry WHERE behaviourId = :behaviourId")
    suspend fun deleteEntriesOf(behaviourId: String): Int

    @Query("DELETE FROM behaviour_def WHERE id = :id")
    suspend fun deleteDef(id: String): Int

    @Query("SELECT * FROM behaviour_entry WHERE epochDay BETWEEN :fromDay AND :toDay ORDER BY epochDay, behaviourId")
    suspend fun entriesBetween(fromDay: Long, toDay: Long): List<BehaviourEntryEntity>

    @Query("SELECT * FROM behaviour_entry WHERE epochDay BETWEEN :fromDay AND :toDay ORDER BY epochDay, behaviourId")
    fun observeEntriesBetween(fromDay: Long, toDay: Long): Flow<List<BehaviourEntryEntity>>

    /**
     * The values of the built-in behaviours, which live in `daily_biometric_summary` as yes/no metrics
     * ([metricKeys] are the metrics' storage keys). Re-emits when that table changes.
     */
    @Query(
        """
        SELECT * FROM daily_biometric_summary
        WHERE metricType IN (:metricKeys) AND epochDay BETWEEN :fromDay AND :toDay
        ORDER BY epochDay, metricType
        """,
    )
    fun observeBuiltInValues(metricKeys: List<String>, fromDay: Long, toDay: Long): Flow<List<DailyBiometricSummaryEntity>>

    @Query("SELECT * FROM behaviour_entry ORDER BY epochDay, behaviourId")
    suspend fun allEntries(): List<BehaviourEntryEntity>

    @Query("SELECT COUNT(*) FROM behaviour_def")
    suspend fun defCount(): Int

    @Query("SELECT COUNT(*) FROM behaviour_entry")
    suspend fun entryCount(): Int

    @Query("DELETE FROM behaviour_entry")
    suspend fun deleteAllEntries()

    @Query("DELETE FROM behaviour_def")
    suspend fun deleteAllDefs()
}
