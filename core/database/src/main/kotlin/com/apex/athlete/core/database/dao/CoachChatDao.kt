package com.apex.athlete.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.apex.athlete.core.database.entity.CoachMessageEntity
import com.apex.athlete.core.database.entity.CoachThreadEntity
import kotlinx.coroutines.flow.Flow

/** Coach conversations. Local only. Deleting a thread deletes its messages (foreign key cascade). */
@Dao
interface CoachChatDao {

    @Upsert
    suspend fun upsertThread(row: CoachThreadEntity)

    @Upsert
    suspend fun upsertThreads(rows: List<CoachThreadEntity>)

    @Upsert
    suspend fun upsertMessage(row: CoachMessageEntity)

    @Upsert
    suspend fun upsertMessages(rows: List<CoachMessageEntity>)

    @Query("SELECT * FROM coach_thread WHERE id = :id")
    suspend fun threadById(id: String): CoachThreadEntity?

    @Query("SELECT id FROM coach_thread")
    suspend fun threadIds(): List<String>

    @Query("SELECT * FROM coach_thread ORDER BY updatedAtEpochMillis DESC, id")
    fun observeThreads(): Flow<List<CoachThreadEntity>>

    @Query("SELECT * FROM coach_thread ORDER BY createdAtEpochMillis, id")
    suspend fun allThreads(): List<CoachThreadEntity>

    @Query("SELECT * FROM coach_message WHERE threadId = :threadId ORDER BY createdAtMillis, id")
    fun observeMessages(threadId: String): Flow<List<CoachMessageEntity>>

    @Query("SELECT * FROM coach_message WHERE threadId = :threadId ORDER BY createdAtMillis, id")
    suspend fun messages(threadId: String): List<CoachMessageEntity>

    @Query("SELECT * FROM coach_message ORDER BY createdAtMillis, id")
    suspend fun allMessages(): List<CoachMessageEntity>

    @Query("UPDATE coach_thread SET title = :title, updatedAtEpochMillis = :updatedAtEpochMillis WHERE id = :id")
    suspend fun renameThread(id: String, title: String, updatedAtEpochMillis: Long): Int

    @Query("UPDATE coach_thread SET updatedAtEpochMillis = :updatedAtEpochMillis WHERE id = :id")
    suspend fun touchThread(id: String, updatedAtEpochMillis: Long): Int

    @Query("SELECT COUNT(*) FROM coach_thread")
    suspend fun threadCount(): Int

    @Query("SELECT COUNT(*) FROM coach_message")
    suspend fun messageCount(): Int

    @Query("DELETE FROM coach_thread WHERE id = :id")
    suspend fun deleteThread(id: String): Int

    @Query("DELETE FROM coach_message")
    suspend fun deleteAllMessages()

    @Query("DELETE FROM coach_thread")
    suspend fun deleteAllThreads()
}
