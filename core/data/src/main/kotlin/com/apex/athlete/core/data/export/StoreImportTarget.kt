package com.apex.athlete.core.data.export

import androidx.room.withTransaction
import com.apex.athlete.core.data.ingest.HealthIngestor
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.IngestCounts
import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.data.store.ApexStores
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Writes an import into a store through its [HealthIngestor], taking [writeMutex] around every
 * batch (and every replay chunk) so a sync can run in between but never at the same time.
 */
class StoreImportTarget(
    private val store: ActiveStore,
    private val writeMutex: Mutex,
    private val onChanged: () -> Unit,
) : ImportTarget {
    private val session = store.ingestor.newSession()

    override val isDemo: Boolean get() = store.isDemo

    override suspend fun ingest(batch: HealthBatch): IngestCounts =
        writeMutex.withLock { store.ingestor.ingest(batch, session) }

    /**
     * Writes the local logging rows in one transaction under the write mutex: definitions, entries, then threads before
     * messages. A message whose thread is neither in the store nor in this batch is dropped (counted), never written
     * without its parent. Rows are upserted by id, so importing the same file twice leaves the same rows.
     */
    override suspend fun importExtras(batch: ExtrasBatch): ExtrasImportResult {
        if (batch.size == 0) return ExtrasImportResult(0, 0)
        return writeMutex.withLock {
            store.db.withTransaction {
                val db = store.db
                db.behaviourDao().upsertDefs(batch.behaviourDefs)
                db.behaviourDao().upsertEntries(batch.behaviourEntries)
                db.quickLogDao().upsertAll(batch.quickLogs)
                db.goalDao().upsertAll(batch.goals)
                db.foodLogDao().upsertAll(batch.foodLogs)
                db.bloodPressureDao().upsertAll(batch.bloodPressure)
                db.breatheSessionDao().upsertAll(batch.breatheSessions)
                db.coachChatDao().upsertThreads(batch.coachThreads)
                val threadIds = db.coachChatDao().threadIds().toHashSet()
                val (messages, orphans) = batch.coachMessages.partition { it.threadId in threadIds }
                db.coachChatDao().upsertMessages(messages)
                ExtrasImportResult(written = (batch.size - orphans.size).toLong(), dropped = orphans.size.toLong())
            }
        }
    }

    override fun earliestAffectedDay(): Long? = session.earliestAffectedDay

    override suspend fun replayFrom(fromDay: Long): Int {
        val today = store.pipeline.today()
        var day = fromDay
        var done = 0
        // Days depend on earlier days, so chunks go oldest first; the lock is released between chunks.
        while (day <= today) {
            val to = minOf(day + REPLAY_CHUNK_DAYS - 1, today)
            done += writeMutex.withLock { store.pipeline.replay(day, to) }
            day = to + 1
        }
        return done
    }

    override fun notifyChanged() = onChanged()

    private companion object {
        const val REPLAY_CHUNK_DAYS = 30L
    }
}

/** The importer for the app's real store. The Demo store is never reachable from here. */
fun ApexStores.dataImporter(): DataImporter =
    DataImporter(openTarget = { StoreImportTarget(realStore(), writeMutex, ::notifyChanged) })
