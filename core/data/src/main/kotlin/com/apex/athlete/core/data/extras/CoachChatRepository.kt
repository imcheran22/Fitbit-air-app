package com.apex.athlete.core.data.extras

import androidx.room.withTransaction
import com.apex.athlete.core.database.entity.CoachMessageEntity
import com.apex.athlete.core.database.entity.CoachRole
import com.apex.athlete.core.database.entity.CoachThreadEntity
import com.apex.athlete.core.database.entity.CoachTopic
import com.apex.athlete.core.domain.DataProvenance
import kotlinx.coroutines.flow.Flow

/**
 * Coach conversations kept on the phone. The owner's messages are [DataProvenance.USER_REPORTED]; a reply from a model
 * is [DataProvenance.AI_INTERPRETED] and a rule-based reply [DataProvenance.MATHEMATICALLY_DERIVED]. Nothing here
 * sends anything anywhere: the optional Ask Apex request is built and previewed elsewhere.
 */
class CoachChatRepository internal constructor(
    private val access: ExtrasStoreAccess,
    private val clock: ExtrasClock,
    private val newId: () -> String,
) {
    /** Threads, most recently active first. */
    fun observeThreads(): Flow<List<CoachThreadEntity>> =
        access.observe<List<CoachThreadEntity>>(emptyList()) { it.db.coachChatDao().observeThreads() }

    /** The messages of a thread, oldest first. */
    fun observeMessages(threadId: String): Flow<List<CoachMessageEntity>> =
        access.observe<List<CoachMessageEntity>>(emptyList()) { it.db.coachChatDao().observeMessages(threadId) }

    suspend fun createThread(title: String, topic: CoachTopic = CoachTopic.GENERAL): String {
        val clean = requireTitle(title)
        val now = clock.now()
        val thread = CoachThreadEntity(newId(), clean, topic, now, now)
        access.write { it.db.coachChatDao().upsertThread(thread) }
        return thread.id
    }

    suspend fun renameThread(id: String, title: String) {
        val clean = requireTitle(title)
        access.write { store ->
            require(store.db.coachChatDao().renameThread(id, clean, clock.now()) == 1) { "Unknown thread." }
        }
    }

    /** Deletes the thread and, with it, all its messages. */
    suspend fun deleteThread(id: String) {
        access.write { it.db.coachChatDao().deleteThread(id) }
    }

    /** Adds the owner's message to a thread and returns its id. */
    suspend fun appendUserMessage(threadId: String, text: String): String =
        append(threadId, CoachRole.USER, text, DataProvenance.USER_REPORTED, null)

    /**
     * Adds a coach reply and returns its id. [fromModel] = true marks it [DataProvenance.AI_INTERPRETED] (a model wrote it),
     * false [DataProvenance.MATHEMATICALLY_DERIVED] (the rule-based coach). [unverifiedNumerals] are the numbers of a model
     * reply that the numeral check could not match to the supplied facts; they are kept so the screen can flag them.
     */
    suspend fun appendCoachMessage(threadId: String, text: String, fromModel: Boolean, unverifiedNumerals: List<String> = emptyList()): String {
        require(unverifiedNumerals.none { it.contains(',') || it.isBlank() }) { "A numeral must be non-empty and contain no comma." }
        return append(
            threadId, CoachRole.COACH, text,
            if (fromModel) DataProvenance.AI_INTERPRETED else DataProvenance.MATHEMATICALLY_DERIVED,
            unverifiedNumerals.takeIf { it.isNotEmpty() }?.joinToString(","),
        )
    }

    private suspend fun append(threadId: String, role: CoachRole, text: String, provenance: DataProvenance, unverified: String?): String {
        require(text.isNotBlank() && text.length <= ExtrasLimits.MAX_MESSAGE_CHARS) { "The message must be 1 to ${ExtrasLimits.MAX_MESSAGE_CHARS} characters." }
        val now = clock.now()
        val message = CoachMessageEntity(newId(), threadId, role, text, now, provenance, unverified)
        access.write { store ->
            store.db.withTransaction {
                val dao = store.db.coachChatDao()
                require(dao.threadById(threadId) != null) { "Unknown thread." }
                dao.upsertMessage(message)
                dao.touchThread(threadId, now)
            }
        }
        return message.id
    }

    private fun requireTitle(title: String): String {
        val clean = title.trim()
        require(clean.isNotEmpty() && clean.length <= ExtrasLimits.MAX_TITLE_CHARS) { "The title must be 1 to ${ExtrasLimits.MAX_TITLE_CHARS} characters." }
        return clean
    }
}
