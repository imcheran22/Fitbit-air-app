package com.apex.athlete.core.data.takeout

/*
 * Watermarks of the archive import.
 *
 * Change signal (docs/DECISIONS.md): a file is "the same as last time" when its category, its file
 * name (which carries the date), its uncompressed size and the CRC-32 of its uncompressed bytes
 * all match what was recorded when it was last imported completely. Size and CRC are computed by
 * the engine while streaming, never read from the ZIP headers, so the signal also works for
 * archives written without sizes in the local headers.
 *
 * Because the signal covers every byte, an unchanged file is never parsed again, not even among
 * the most recent days: identical bytes can only produce identical rows. The "overlap window" of
 * the brief (re-read the newest days because they may have been revised) is therefore covered by
 * the CRC: a revised day has different bytes and is imported again as changed.
 *
 * Two levels are kept:
 * - per file ([TakeoutFileMark]): the signal, how far the import of that file got, and whether the
 *   days it changed still need their derived scores recomputed;
 * - per category (a row in the sync-watermark table): the latest file date imported, which the
 *   Data Sources screen shows. It only moves forward.
 */

/** Import state of one archive file. */
data class TakeoutFileMark(
    val category: TakeoutCategory,
    /** Lower-cased file name. */
    val fileKey: String,
    val fileEpochDay: Long?,
    val sizeBytes: Long,
    val crc32: Long,
    /** True once the whole file has been read and every batch committed. */
    val complete: Boolean,
    /** Rows committed so far; moves forward only after a batch is in the database. */
    val committedRows: Long = 0,
    val rowsDropped: Long = 0,
    val rowsQuarantined: Long = 0,
    /** Earliest civil day this file's committed batches changed. */
    val earliestAffectedEpochDay: Long? = null,
    /** True until a recomputation covering [earliestAffectedEpochDay] has finished. */
    val replayPending: Boolean = false,
    val importedAtEpochMillis: Long,
)

/** Where the watermarks live. The Room implementation is in TakeoutRoomBindings.kt; tests use an in-memory one. */
interface TakeoutWatermarkStore {
    suspend fun fileMarks(): List<TakeoutFileMark>

    /** Inserts or replaces the mark of one file. */
    suspend fun upsert(mark: TakeoutFileMark)

    /**
     * Records that a dated file of [category] was imported completely. The stored date only ever
     * moves forward. [signal] is the change signal of that file, kept beside the date.
     */
    suspend fun advanceCategory(category: TakeoutCategory, fileEpochDay: Long?, signal: String, nowMillis: Long)

    /** Earliest day whose derived scores are stale because an import changed data and no replay has finished since. */
    suspend fun pendingReplayFromDay(): Long?

    /** Called after a replay from [pendingReplayFromDay] has completed. */
    suspend fun clearPendingReplay()
}

/** One whitelisted entry with what the planner decided for it. */
class PlannedEntry(val info: TakeoutEntryInfo, val decision: TakeoutFileDecision)

/**
 * Decides which files of a selection are parsed. Pure: same entries and same marks give the same
 * plan, which is what makes a repeated import a no-op.
 *
 * Rules, in order:
 * 1. The same file name twice in the selection (overlapping exports picked together): the largest
 *    copy is used, the later one on a tie. A newer export of a day is never smaller than an older.
 * 2. A day present in both layouts is read from the classic layout only. Undated Google-layout
 *    files are skipped when the classic layout has files of that category at all.
 * 3. "Force full re-import" imports everything that survived 1 and 2.
 * 4. Never imported: import.
 * 5. Imported only partly, and the bytes are the same: import again from the start (resume).
 *    Different bytes: import as changed.
 * 6. Imported completely, different size or CRC: import, unless the file is smaller than the copy
 *    already imported (an older export of the same day), which must not replace the fuller data.
 * 7. Imported completely and unchanged: skip.
 */
object TakeoutImportPlanner {

    fun plan(
        entries: List<TakeoutEntryInfo>,
        marks: List<TakeoutFileMark>,
        force: Boolean,
    ): List<PlannedEntry> {
        val markByKey = marks.associateBy { it.category to it.fileKey }
        val decisions = HashMap<TakeoutEntryInfo, TakeoutFileDecision>()

        // 1. Duplicates of the same file.
        for ((_, copies) in entries.groupBy { it.route.category to it.route.fileKey }) {
            if (copies.size < 2) continue
            val winner = copies.reduce { best, e -> if (e.sizeBytes >= best.sizeBytes) e else best }
            for (e in copies) if (e !== winner) decisions[e] = TakeoutFileDecision.SKIP_DUPLICATE
        }

        // 2. Layout preference.
        val classic = entries.filter { it.route.layout == TakeoutLayout.CLASSIC && it !in decisions }
        val classicDays = classic.mapNotNull { e -> e.route.fileEpochDay?.let { e.route.category to it } }.toSet()
        val classicCategories = classic.map { it.route.category }.toSet()
        for (e in entries) {
            if (e.route.layout != TakeoutLayout.GOOGLE || e in decisions) continue
            val day = e.route.fileEpochDay
            val shadowed = if (day != null) (e.route.category to day) in classicDays else e.route.category in classicCategories
            if (shadowed) decisions[e] = TakeoutFileDecision.SKIP_OTHER_LAYOUT
        }

        return entries.map { e ->
            val decided = decisions[e]
            if (decided != null) return@map PlannedEntry(e, decided)
            val mark = markByKey[e.route.category to e.route.fileKey]
            val sameBytes = mark != null && mark.sizeBytes == e.sizeBytes && mark.crc32 == e.crc32
            val decision = when {
                force -> TakeoutFileDecision.IMPORT_FORCED
                mark == null -> TakeoutFileDecision.IMPORT_NEW
                !mark.complete -> if (sameBytes) TakeoutFileDecision.IMPORT_RESUME else TakeoutFileDecision.IMPORT_CHANGED
                sameBytes -> TakeoutFileDecision.SKIP_UNCHANGED
                e.sizeBytes < mark.sizeBytes -> TakeoutFileDecision.SKIP_OLDER_VERSION
                else -> TakeoutFileDecision.IMPORT_CHANGED
            }
            PlannedEntry(e, decision)
        }
    }

    /** The change signal as text, for the category row. */
    fun signal(sizeBytes: Long, crc32: Long): String = "$sizeBytes:${java.lang.Long.toHexString(crc32)}"
}
