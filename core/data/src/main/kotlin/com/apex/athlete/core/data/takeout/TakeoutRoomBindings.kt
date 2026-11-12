package com.apex.athlete.core.data.takeout

import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.IngestCounts
import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.data.store.ApexStores
import com.apex.athlete.core.database.ApexDatabase
import com.apex.athlete.core.database.entity.SyncWatermarkEntity
import com.apex.athlete.core.database.entity.TakeoutFileMarkEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SyncSource
import com.apex.athlete.core.domain.SyncStatus
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.ZoneId

/*
 * The only file of the Takeout engine that knows Room. The engine itself (TakeoutZipImporter and
 * everything it uses) is plain JVM and is tested with in-memory doubles; these three classes bind
 * its interfaces to the real store, and are covered by TakeoutRoomBindingsRobolectricTest.
 */

/**
 * Writes batches through the store's [com.apex.athlete.core.data.ingest.HealthIngestor], the single
 * writer of observed data, one batch per [writeMutex] hold so a sync can run between batches but
 * never inside one. One instance is one ingestor session, which is one import run.
 */
class RoomTakeoutSink(private val store: ActiveStore, private val writeMutex: Mutex) : TakeoutSink {
    init {
        check(!store.isDemo) { "The archive import never writes into the demo store" }
    }

    private val session = store.ingestor.newSession()

    override suspend fun write(batch: HealthBatch): IngestCounts = writeMutex.withLock { store.ingestor.ingest(batch, session) }

    override val earliestAffectedDay: Long? get() = session.earliestAffectedDay

    override suspend fun archiveStepStats(fromMillis: Long, toMillis: Long): TakeoutStepStats {
        val row = store.db.metricSampleDao().statsFrom(MetricType.STEPS, DataProvenance.IMPORTED_FILE_ARCHIVE, fromMillis, toMillis)
        return TakeoutStepStats(row.n, row.sum ?: 0.0)
    }
}

/**
 * Per-file marks in `takeout_file_mark`; the latest imported file date per category in
 * `sync_watermark` (source `FITBIT_TAKEOUT_ARCHIVE`, stream `takeout:<category>`), which the Data
 * Sources screen reads.
 */
class RoomTakeoutWatermarks(private val db: ApexDatabase) : TakeoutWatermarkStore {
    private val marks get() = db.takeoutFileMarkDao()

    override suspend fun fileMarks(): List<TakeoutFileMark> = marks.all().mapNotNull { row ->
        // A row of a category this version does not know (a downgrade) is left alone, never deleted or reinterpreted.
        val category = TakeoutCategory.fromKey(row.category) ?: return@mapNotNull null
        TakeoutFileMark(
            category = category, fileKey = row.fileKey, fileEpochDay = row.fileEpochDay, sizeBytes = row.sizeBytes,
            crc32 = row.crc32, complete = row.complete, committedRows = row.committedRows, rowsDropped = row.rowsDropped,
            rowsQuarantined = row.rowsQuarantined, earliestAffectedEpochDay = row.earliestAffectedEpochDay,
            replayPending = row.replayPending, importedAtEpochMillis = row.importedAtEpochMillis,
        )
    }

    override suspend fun upsert(mark: TakeoutFileMark) = marks.upsert(
        TakeoutFileMarkEntity(
            category = mark.category.key, fileKey = mark.fileKey, fileEpochDay = mark.fileEpochDay, sizeBytes = mark.sizeBytes,
            crc32 = mark.crc32, complete = mark.complete, committedRows = mark.committedRows, rowsDropped = mark.rowsDropped,
            rowsQuarantined = mark.rowsQuarantined, earliestAffectedEpochDay = mark.earliestAffectedEpochDay,
            replayPending = mark.replayPending, importedAtEpochMillis = mark.importedAtEpochMillis,
        ),
    )

    override suspend fun advanceCategory(category: TakeoutCategory, fileEpochDay: Long?, signal: String, nowMillis: Long) {
        if (fileEpochDay == null) return
        val dao = db.syncWatermarkDao()
        val source = SyncSource.FITBIT_TAKEOUT_ARCHIVE
        dao.insertIfAbsent(SyncWatermarkEntity(source, category.watermarkStream))
        val through = fileEpochDay * DAY_MS
        // Forward only: an older file never pulls the date back, and never replaces the signal of a newer one.
        val current = dao.get(source, category.watermarkStream)?.lastSyncedEpochMillis ?: 0L
        if (through >= current) dao.advance(source, category.watermarkStream, through, signal, SyncStatus.SUCCESS, nowMillis)
    }

    override suspend fun pendingReplayFromDay(): Long? = marks.pendingReplayFromDay()

    override suspend fun clearPendingReplay() {
        marks.clearPendingReplay()
    }

    private companion object {
        const val DAY_MS = 24L * 60 * 60 * 1000
    }
}

/**
 * Recomputes derived scores oldest day first, in chunks of [CHUNK_DAYS], releasing [writeMutex]
 * between chunks. Each day depends on the days before it, so the order is never relaxed.
 */
class PipelineTakeoutReplayer(private val store: ActiveStore, private val writeMutex: Mutex) : TakeoutReplayer {
    override suspend fun replay(fromDay: Long, onProgress: suspend (done: Int, total: Int) -> Unit): Int {
        val today = store.pipeline.today()
        if (fromDay > today) return 0
        val total = (today - fromDay + 1).toInt()
        var day = fromDay
        var done = 0
        while (day <= today) {
            val to = minOf(day + CHUNK_DAYS - 1, today)
            val before = done
            done += writeMutex.withLock { store.pipeline.replay(day, to) { d, _ -> onProgress(before + d, total) } }
            day = to + 1
        }
        return done
    }

    private companion object {
        const val CHUNK_DAYS = 30L
    }
}

/**
 * The archive importer bound to the real store. The Demo store is unreachable from here: the sink
 * refuses it. [zone] is the zone classic-layout wall-clock times are read in (see [TakeoutTimeConfig]).
 */
fun ApexStores.takeoutImporter(store: ActiveStore, zone: ZoneId = ZoneId.systemDefault()): TakeoutZipImporter =
    TakeoutZipImporter(
        sink = RoomTakeoutSink(store, writeMutex),
        marks = RoomTakeoutWatermarks(store.db),
        replayer = PipelineTakeoutReplayer(store, writeMutex),
        time = TakeoutTimeConfig(localZone = zone),
    )
