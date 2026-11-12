package com.apex.athlete.core.data.takeout

import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.IngestCounts
import com.apex.athlete.core.data.takeout.parsers.BucketedStepsParser
import com.apex.athlete.core.data.takeout.parsers.TakeoutParseStats
import com.apex.athlete.core.data.takeout.parsers.TakeoutParsers
import com.apex.athlete.core.data.takeout.parsers.TakeoutRowBuffer
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.coroutines.CoroutineContext
import kotlin.coroutines.coroutineContext

/** Count and sum of the archive's own step buckets in a time range. */
data class TakeoutStepStats(val buckets: Int, val steps: Double)

/**
 * Where parsed rows go. Production: the reconciling `HealthIngestor` (one session per run, see
 * TakeoutRoomBindings.kt); tests: an in-memory store with the same keys.
 */
interface TakeoutSink {
    /** Writes one batch and returns once it is durably committed. Idempotent for re-delivered rows. */
    suspend fun write(batch: HealthBatch): IngestCounts

    /** Earliest civil day the writes of this run changed; null while nothing changed. */
    val earliestAffectedDay: Long?

    /** Step buckets the archive itself wrote (provenance archive) with an interval start in [fromMillis, toMillis). */
    suspend fun archiveStepStats(fromMillis: Long, toMillis: Long): TakeoutStepStats
}

/** Recomputes derived scores day by day, in order, from [fromDay] through today. Returns the days recomputed. */
fun interface TakeoutReplayer {
    suspend fun replay(fromDay: Long, onProgress: suspend (done: Int, total: Int) -> Unit): Int
}

/**
 * The Takeout archive import (master prompt §9). Plain JVM: the archive arrives as
 * [TakeoutArchivePart]s, rows leave through a [TakeoutSink], progress is kept in a
 * [TakeoutWatermarkStore].
 *
 * One run:
 * 1. **Inspect** every part without parsing ([TakeoutArchiveInspector]): whitelisted entry names,
 *    their uncompressed size and CRC-32. Nothing else in the archive is opened.
 * 2. **Plan** ([TakeoutImportPlanner]) against the per-file marks: new, changed or interrupted files
 *    are imported; unchanged ones are skipped, so a repeated import writes nothing.
 * 3. **Stream** each planned entry through its parser in batches of at most [batchRows] rows. After
 *    every committed batch the file's mark moves forward; only when the file has been read to the
 *    end is it marked complete. An interrupted file is read again from its start on the next run
 *    (the bytes are the same, so the parser yields the same rows in the same order), but the rows
 *    its mark says were committed are passed over, not written again; a batch that was stored
 *    just before the interruption but not yet marked is simply written twice, which the
 *    idempotent upserts make harmless. Files completed before the interruption are not read again.
 * 4. **Step day totals** for civil days whose every 15-minute bucket is now stored from the archive.
 * 5. **Replay** derived scores in chronological order from the earliest day changed by this run or
 *    by an earlier run whose replay did not finish, then clear the pending flag.
 *
 * Cancellation is checked between batches and between entries; a cancelled run leaves committed
 * batches, their marks and the pending replay in place for the next run. Nothing here logs, and
 * nothing in the report carries a health value.
 *
 * Not thread-safe; the caller serialises runs (the production runner holds the stores' write mutex).
 */
class TakeoutZipImporter(
    private val sink: TakeoutSink,
    private val marks: TakeoutWatermarkStore,
    private val replayer: TakeoutReplayer,
    private val time: TakeoutTimeConfig,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val batchRows: Int = BATCH_ROWS,
    private val io: CoroutineContext = Dispatchers.IO,
) {
    init {
        require(batchRows in 1..BATCH_ROWS) { "batchRows must be between 1 and $BATCH_ROWS" }
    }

    suspend fun import(
        parts: List<TakeoutArchivePart>,
        force: Boolean = false,
        onProgress: suspend (TakeoutImportProgress) -> Unit = {},
    ): TakeoutImportReport = withContext(io) {
        val started = nowMillis()
        val inspection = TakeoutArchiveInspector.inspect(parts) { part, count, seen ->
            onProgress(TakeoutImportProgress.Inspecting(part, count, seen))
        }
        val layout = inspection.report
        val existing = marks.fileMarks().associateBy { it.category to it.fileKey }
        val plan = TakeoutImportPlanner.plan(inspection.entries, existing.values.toList(), force)
        val run = Run(plan.count { it.decision.isImport }, existing)

        if (run.fileCount > 0) {
            val byPart = plan.filter { it.decision.isImport }.groupBy { it.info.partIndex }
            for ((partIndex, planned) in byPart.toSortedMap()) {
                coroutineContext.ensureActive()
                importPart(parts[partIndex], planned.associateBy { it.info.ordinal }, run, onProgress)
            }
        }

        val stepTotals = writeStepDayTotals(run)

        // Replay from the earliest day changed now or left stale by an interrupted earlier run.
        val earliest = listOfNotNull(marks.pendingReplayFromDay(), sink.earliestAffectedDay).minOrNull()
        val recomputed = if (earliest != null) {
            val days = replayer.replay(earliest) { done, total -> onProgress(TakeoutImportProgress.Recalculating(done, total)) }
            marks.clearPendingReplay()
            days
        } else {
            0
        }

        val outcome = when {
            !layout.anyReadablePart -> TakeoutOutcome.NOT_AN_ARCHIVE
            inspection.entries.isEmpty() -> TakeoutOutcome.NO_RECOGNISED_FILES
            run.fileCount == 0 -> TakeoutOutcome.NOTHING_NEW
            else -> TakeoutOutcome.COMPLETED
        }
        TakeoutImportReport(
            startedAtMillis = started,
            finishedAtMillis = nowMillis(),
            outcome = outcome,
            forced = force,
            layout = layout,
            files = run.fileReports(plan),
            categories = run.categoryReports(plan),
            zoneRules = run.zoneRules,
            stepDayTotalsWritten = stepTotals,
            dataFirstEpochDay = run.firstDay,
            dataLastEpochDay = run.lastDay,
            earliestModifiedEpochDay = earliest,
            recomputedDays = recomputed,
        )
    }

    // --- Pass 2 ------------------------------------------------------------------------------------

    private suspend fun importPart(
        part: TakeoutArchivePart,
        planned: Map<Int, PlannedEntry>,
        run: Run,
        onProgress: suspend (TakeoutImportProgress) -> Unit,
    ) {
        var remaining = planned.size
        var current: FileProgress? = null
        val status = TakeoutZipWalker.walk(part) { ordinal, name, open, _ ->
            coroutineContext.ensureActive()
            val entry = planned[ordinal]
            if (entry != null) {
                remaining--
                val route = TakeoutEntryRouter.route(name)
                // The part was replaced between the two passes; this entry is no longer the planned file.
                if (route != null && route.category == entry.info.route.category && route.fileKey == entry.info.route.fileKey) {
                    val file = run.begin(entry)
                    current = file
                    importEntry(file, open(), onProgress)
                    current = null
                }
            }
            remaining > 0
        }
        // The archive ended or failed inside this entry: its committed batches stand, it stays incomplete.
        current?.let { if (status != TakeoutPartStatus.OK) it.status = TakeoutFileStatus.TRUNCATED }
    }

    private suspend fun importEntry(file: FileProgress, stream: TakeoutEntryStream, onProgress: suspend (TakeoutImportProgress) -> Unit) {
        val route = file.entry.info.route
        val parser = TakeoutParsers.open(route, stream, time)
        file.stats = parser.stats
        val buffer = TakeoutRowBuffer()
        // Resume: the bytes are the same as in the interrupted run (the planner only resumes then) and
        // the parsers are deterministic, so the rows come out in the same order. The first
        // `committedRows` of them are already in the database and are passed over, not sent again.
        file.rowsToSkip = if (file.entry.decision == TakeoutFileDecision.IMPORT_RESUME) file.previous?.committedRows ?: 0L else 0L
        while (true) {
            val more = parser.readInto(buffer, batchRows)
            while (buffer.size >= batchRows) submit(file, buffer.drainKeepingOpenMinute(batchRows), onProgress)
            if (!more) {
                while (buffer.size > 0) submit(file, buffer.drain(batchRows), onProgress)
                break
            }
            coroutineContext.ensureActive()
        }
        // Size and CRC cover the whole entry, including anything the parser left unread.
        stream.drain()
        val stats = parser.stats
        file.status = when {
            stats.schemaMismatch -> TakeoutFileStatus.SCHEMA_MISMATCH
            stats.abortedMidStream -> TakeoutFileStatus.MALFORMED
            else -> TakeoutFileStatus.COMPLETE
        }
        // A file this engine cannot read is not recorded as imported, so a later version of the
        // engine reads it. Malformed content is final for these bytes: re-reading gives the same rows.
        if (file.status != TakeoutFileStatus.SCHEMA_MISMATCH) {
            val mark = file.mark(nowMillis(), sink.earliestAffectedDay).copy(
                sizeBytes = stream.bytesRead,
                crc32 = stream.crc32,
                complete = true,
            )
            marks.upsert(mark)
            route.fileEpochDay?.let { day ->
                marks.advanceCategory(route.category, day, TakeoutImportPlanner.signal(stream.bytesRead, stream.crc32), nowMillis())
            }
        }
        file.finished = true
        onProgress(file.run.progress(file))
    }

    /** Passes over the rows an interrupted run already committed, then commits the rest. */
    private suspend fun submit(file: FileProgress, batch: HealthBatch, onProgress: suspend (TakeoutImportProgress) -> Unit) {
        if (file.rowsToSkip > 0) {
            val (done, rest) = batch.splitAfter(minOf(file.rowsToSkip, batch.rowCount().toLong()).toInt())
            file.rowsToSkip -= done.rowCount()
            file.rowsSkipped += done.rowCount()
            // They are part of this file's data range and of the days whose step totals are due.
            file.run.noteDays(done)
            if (done.samples.any { it.metric == MetricType.STEPS }) file.run.noteStepDays(done)
            if (rest.isEmpty) return
            commit(file, rest, onProgress)
        } else {
            commit(file, batch, onProgress)
        }
    }

    private suspend fun commit(file: FileProgress, batch: HealthBatch, onProgress: suspend (TakeoutImportProgress) -> Unit) {
        if (batch.isEmpty) return
        val rows = batch.rowCount()
        check(rows <= batchRows) { "batch larger than the configured bound" }
        val counts = sink.write(batch)
        // The batch is committed; only now may the file's watermark move.
        file.rowsCommitted += rows
        file.counts += counts
        if (counts.totalWritten > 0) file.wroteSomething = true
        file.run.noteDays(batch)
        if (batch.samples.any { it.metric == MetricType.STEPS }) file.run.noteStepDays(batch)
        marks.upsert(file.mark(nowMillis(), sink.earliestAffectedDay))
        onProgress(file.run.progress(file))
        coroutineContext.ensureActive()
    }

    // --- Step day totals ---------------------------------------------------------------------------

    /**
     * A civil day's step total is the sum of its 15-minute buckets, written only when every bucket
     * of that day (92, 96 or 100 on clock-change days) is stored from the archive, possibly from
     * several files or earlier imports. A day the archive covers only in part gets no total:
     * missing stays missing, and a partial sum is never presented as the day's steps.
     */
    private suspend fun writeStepDayTotals(run: Run): Int {
        if (run.stepDays.isEmpty()) return 0
        val zone = time.localZone
        val totals = ArrayList<DailyObservation>()
        for (day in run.stepDays.sorted()) {
            coroutineContext.ensureActive()
            val from = LocalDate.ofEpochDay(day).atStartOfDay(zone).toInstant().toEpochMilli()
            val to = LocalDate.ofEpochDay(day + 1).atStartOfDay(zone).toInstant().toEpochMilli()
            val expected = ((to - from) / BucketedStepsParser.BUCKET_MS).toInt()
            // A zone whose day boundaries do not fall on 15-minute marks cannot be summed exactly.
            if (expected <= 0 || (to - from) % BucketedStepsParser.BUCKET_MS != 0L || Math.floorMod(from, BucketedStepsParser.BUCKET_MS) != 0L) continue
            val stats = sink.archiveStepStats(from, to)
            if (stats.buckets == expected) {
                totals += DailyObservation(MetricType.STEPS, day, stats.steps, sampleCount = stats.buckets)
            }
        }
        var written = 0
        for (chunk in totals.chunked(batchRows)) {
            sink.write(HealthBatch(DataProvenance.IMPORTED_FILE_ARCHIVE, daily = chunk))
            written += chunk.size
        }
        return written
    }

    // --- Run bookkeeping ---------------------------------------------------------------------------

    private inner class Run(val fileCount: Int, val existing: Map<Pair<TakeoutCategory, String>, TakeoutFileMark>) {
        val files = LinkedHashMap<PlannedEntry, FileProgress>()
        val zoneRules = LinkedHashMap<String, ZoneRule>()
        val stepDays = HashSet<Long>()
        var firstDay: Long? = null
        var lastDay: Long? = null
        var rowsCommitted = 0L
        private var started = 0

        fun begin(entry: PlannedEntry): FileProgress {
            started++
            val route = entry.info.route
            zoneRules["${route.category.key}/${route.layout.name.lowercase()}"] = time.ruleFor(route)
            return FileProgress(this, entry, started, existing[route.category to route.fileKey]).also { files[entry] = it }
        }

        fun progress(current: FileProgress): TakeoutImportProgress.Importing {
            var dropped = 0L
            var quarantined = 0L
            for (f in files.values) {
                val s = f.stats ?: continue
                dropped += s.droppedLowConfidence + s.droppedEmpty
                quarantined += s.quarantined
            }
            return TakeoutImportProgress.Importing(
                fileIndex = current.index,
                fileCount = fileCount,
                category = current.entry.info.route.category,
                rowsImported = files.values.sumOf { it.rowsCommitted },
                rowsDropped = dropped,
                rowsQuarantined = quarantined,
                fileFinished = current.finished,
            )
        }

        private fun day(epochMillis: Long): Long = Math.floorDiv(epochMillis + time.localZone.rules.getOffset(Instant.ofEpochMilli(epochMillis)).totalSeconds * 1000L, DAY_MS)

        private fun include(day: Long) {
            firstDay = minOf(firstDay ?: day, day)
            lastDay = maxOf(lastDay ?: day, day)
        }

        fun noteDays(batch: HealthBatch) {
            if (batch.heartRate.isNotEmpty()) {
                include(day(batch.heartRate.minOf { it.epochMillis }))
                include(day(batch.heartRate.maxOf { it.epochMillis }))
            }
            for (d in batch.daily) include(d.epochDay)
            if (batch.samples.isNotEmpty()) {
                include(day(batch.samples.minOf { it.epochMillis }))
                include(day(batch.samples.maxOf { it.epochMillis }))
            }
            for (s in batch.sleeps) {
                include(Instant.ofEpochMilli(s.endEpochMillis).atOffset(ZoneOffset.ofTotalSeconds(s.endZoneOffsetSeconds)).toLocalDate().toEpochDay())
            }
            for (w in batch.workouts) {
                include(Instant.ofEpochMilli(w.startEpochMillis).atOffset(ZoneOffset.ofTotalSeconds(w.zoneOffsetSeconds)).toLocalDate().toEpochDay())
            }
        }

        fun noteStepDays(batch: HealthBatch) {
            for (s in batch.samples) if (s.metric == MetricType.STEPS) stepDays += day(s.epochMillis)
        }

        fun fileReports(plan: List<PlannedEntry>): List<TakeoutFileReport> {
            val out = ArrayList<TakeoutFileReport>()
            var imported = 0
            for (p in plan) {
                if (!p.decision.isImport) continue
                val f = files[p]
                val status = f?.status ?: TakeoutFileStatus.NOT_REACHED
                // Every problem is listed; clean imports up to a cap, so the report stays small.
                if (status == TakeoutFileStatus.COMPLETE && imported++ >= MAX_FILE_REPORTS) continue
                val s = f?.stats
                val route = p.info.route
                out += TakeoutFileReport(
                    fileKey = route.fileKey,
                    category = route.category,
                    layout = route.layout,
                    decision = p.decision,
                    status = status,
                    sizeBytes = p.info.sizeBytes,
                    rowsRead = s?.rowsRead ?: 0,
                    rowsCommitted = f?.rowsCommitted ?: 0,
                    rowsAlreadyCommitted = f?.rowsSkipped ?: 0,
                    rowsWritten = f?.counts?.totalWritten ?: 0,
                    droppedLowConfidence = s?.droppedLowConfidence ?: 0,
                    droppedEmpty = s?.droppedEmpty ?: 0,
                    quarantined = s?.quarantined ?: 0,
                    rejectedImplausible = f?.counts?.rejected ?: 0,
                    keptExisting = f?.counts?.let { it.heartRateMinutesKept + it.dailyKept + it.sleepsKept + it.workoutsKept } ?: 0,
                )
            }
            return out
        }

        fun categoryReports(plan: List<PlannedEntry>): List<TakeoutCategoryReport> =
            plan.groupBy { it.info.route.category }.toSortedMap(compareBy { it.ordinal }).map { (category, entries) ->
                val progress = entries.mapNotNull { files[it] }
                val stats = progress.mapNotNull { it.stats }
                TakeoutCategoryReport(
                    category = category,
                    filesInArchive = entries.size,
                    filesImported = progress.count { it.finished },
                    filesSkipped = entries.count { !it.decision.isImport },
                    rowsRead = stats.sumOf { it.rowsRead },
                    rowsCommitted = progress.sumOf { it.rowsCommitted },
                    rowsWritten = progress.sumOf { it.counts.totalWritten },
                    droppedLowConfidence = stats.sumOf { it.droppedLowConfidence },
                    droppedEmpty = stats.sumOf { it.droppedEmpty },
                    quarantined = stats.sumOf { it.quarantined },
                    rejectedImplausible = progress.sumOf { it.counts.rejected },
                    keptExisting = progress.sumOf { it.counts.heartRateMinutesKept + it.counts.dailyKept + it.counts.sleepsKept + it.counts.workoutsKept },
                )
            }
    }

    private class FileProgress(val run: Run, val entry: PlannedEntry, val index: Int, val previous: TakeoutFileMark?) {
        /**
         * The parser's counters: a few numbers. The parser itself (readers, buffers) is never kept
         * past its file, because a multi-year archive has thousands of files.
         */
        var stats: TakeoutParseStats? = null
        var status: TakeoutFileStatus = TakeoutFileStatus.NOT_REACHED
        var finished = false
        var rowsCommitted = 0L

        /** Rows still to pass over on a resumed file. */
        var rowsToSkip = 0L

        /** Rows passed over because an earlier run had committed them. */
        var rowsSkipped = 0L
        var counts = IngestCounts()
        var wroteSomething = false

        /**
         * The mark after the batches committed so far. A recomputation still owed by the previous
         * mark of this file is carried over, never dropped.
         */
        fun mark(now: Long, earliestAffected: Long?): TakeoutFileMark {
            val route = entry.info.route
            val stats = this.stats
            val carried = previous?.takeIf { it.replayPending }
            val pending = wroteSomething || carried != null
            val earliest = listOfNotNull(
                carried?.earliestAffectedEpochDay,
                if (wroteSomething) earliestAffected else null,
            ).minOrNull()
            return TakeoutFileMark(
                category = route.category,
                fileKey = route.fileKey,
                fileEpochDay = route.fileEpochDay,
                sizeBytes = entry.info.sizeBytes,
                crc32 = entry.info.crc32,
                complete = false,
                committedRows = rowsSkipped + rowsCommitted,
                rowsDropped = (stats?.droppedLowConfidence ?: 0) + (stats?.droppedEmpty ?: 0),
                rowsQuarantined = stats?.quarantined ?: 0,
                earliestAffectedEpochDay = earliest,
                replayPending = pending,
                importedAtEpochMillis = now,
            )
        }
    }

    companion object {
        /** Rows per committed batch (§9.4). */
        const val BATCH_ROWS = 2_500

        /** Cleanly imported files listed one by one in a report; problems are always listed. */
        const val MAX_FILE_REPORTS = 400

        private const val DAY_MS = 24L * 60 * 60 * 1000
    }
}

/** Rows in a batch, counting every observation once. */
fun HealthBatch.rowCount(): Int = heartRate.size + daily.size + samples.size + sleeps.size + workouts.size

/**
 * Splits a batch after its first [n] rows, in the order the row buffer drains them (heart rate,
 * samples, daily values, sleeps, workouts), which is the order they were committed in.
 */
internal fun HealthBatch.splitAfter(n: Int): Pair<HealthBatch, HealthBatch> {
    var room = n
    fun <T> split(list: List<T>): Pair<List<T>, List<T>> {
        val k = minOf(room, list.size)
        room -= k
        return list.subList(0, k).toList() to list.subList(k, list.size).toList()
    }
    val hr = split(heartRate)
    val samplesSplit = split(samples)
    val dailySplit = split(daily)
    val sleepSplit = split(sleeps)
    val workoutSplit = split(workouts)
    return HealthBatch(provenance, hr.first, dailySplit.first, samplesSplit.first, sleepSplit.first, workoutSplit.first) to
        HealthBatch(provenance, hr.second, dailySplit.second, samplesSplit.second, sleepSplit.second, workoutSplit.second)
}
