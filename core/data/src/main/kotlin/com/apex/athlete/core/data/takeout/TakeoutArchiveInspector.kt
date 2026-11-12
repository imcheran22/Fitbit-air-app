package com.apex.athlete.core.data.takeout

import kotlinx.coroutines.ensureActive
import kotlin.coroutines.coroutineContext

/** One whitelisted entry found by the inspector, with the change signal the planner compares. */
class TakeoutEntryInfo(
    /** Index of the picked file in the selection, starting at 0. */
    val partIndex: Int,
    /** Position of the entry inside its ZIP; identifies it on the second pass even if names repeat. */
    val ordinal: Int,
    val route: TakeoutRoute,
    /** Uncompressed size, counted while reading. */
    val sizeBytes: Long,
    /** CRC-32 of the uncompressed bytes, computed while reading. */
    val crc32: Long,
)

/** Result of the first pass: the shareable report and the exact entry list the planner works from. */
class TakeoutInspection(val report: TakeoutLayoutReport, val entries: List<TakeoutEntryInfo>)

/**
 * First pass over the picked archive: lists what is in it without parsing anything.
 *
 * For whitelisted entries the bytes are read through once to count them and compute their CRC-32;
 * together with the date in the file name that is the change signal that lets a later import skip
 * files it has already seen (the size and CRC fields of a streamed ZIP's headers are often empty,
 * so they are not trusted). Every other entry is skipped by the ZIP reader without being looked
 * at. Nothing is written to disk and nothing but a small read buffer is held in memory.
 *
 * The report groups names by redacted pattern ([TakeoutRedaction]), so it shows layout drift
 * (a renamed folder, a new file family) without showing anything personal.
 */
object TakeoutArchiveInspector {

    /**
     * Cancellable between entries. Does blocking stream reads, so call it on an I/O dispatcher.
     *
     * @param onProgress called now and then with (part number from 1, part count, entries seen so far).
     */
    suspend fun inspect(
        parts: List<TakeoutArchivePart>,
        onProgress: suspend (part: Int, partCount: Int, entriesSeen: Int) -> Unit = { _, _, _ -> },
    ): TakeoutInspection {
        val entries = ArrayList<TakeoutEntryInfo>()
        val partReports = ArrayList<TakeoutPartReport>()
        val recognised = LinkedHashMap<String, PatternTally>()
        val unknown = LinkedHashMap<String, PatternTally>()
        var unknownEntries = 0
        var seen = 0

        parts.forEachIndexed { partIndex, part ->
            var entryCount = 0
            var recognisedCount = 0
            val status = TakeoutZipWalker.walk(part) { ordinal, name, open, size ->
                coroutineContext.ensureActive()
                entryCount++
                seen++
                val route = TakeoutEntryRouter.route(name)
                if (route != null) {
                    val stream = open()
                    stream.drain()
                    entries += TakeoutEntryInfo(partIndex, ordinal, route, stream.bytesRead, stream.crc32)
                    recognisedCount++
                    recognised.getOrPut(TakeoutRedaction.redactPath(name)) { PatternTally(route.category) }.add(stream.bytesRead)
                } else {
                    unknownEntries++
                    val key = TakeoutRedaction.redactPath(name)
                    val tally = unknown[key] ?: if (unknown.size < MAX_UNKNOWN_PATTERNS) PatternTally(null).also { unknown[key] = it } else null
                    (tally ?: unknown.getOrPut(OTHER_PATTERN) { PatternTally(null) }).add(size())
                }
                if (seen % PROGRESS_EVERY == 0) onProgress(partIndex + 1, parts.size, seen)
                true
            }
            partReports += TakeoutPartReport(partIndex + 1, status, entryCount, recognisedCount)
            onProgress(partIndex + 1, parts.size, seen)
        }

        val byCategory = entries.groupBy { it.route.category }
        val summaries = TakeoutCategory.entries.mapNotNull { category ->
            val list = byCategory[category] ?: return@mapNotNull null
            val days = list.mapNotNull { it.route.fileEpochDay }
            TakeoutCategorySummary(category, list.size, list.sumOf { it.sizeBytes }, days.minOrNull(), days.maxOrNull())
        }
        val report = TakeoutLayoutReport(
            parts = partReports,
            categories = summaries,
            missingCategories = TakeoutCategory.entries.filter { it !in byCategory },
            recognisedPatterns = recognised.map { (pattern, t) -> TakeoutNamePattern(pattern, t.count, t.bytes, t.category) },
            unknownPatterns = unknown.map { (pattern, t) -> TakeoutNamePattern(pattern, t.count, t.bytes) },
            unknownEntries = unknownEntries,
        )
        return TakeoutInspection(report, entries)
    }

    private class PatternTally(val category: TakeoutCategory?) {
        var count = 0
        var bytes = 0L

        fun add(size: Long) {
            count++
            bytes = if (size < 0 || bytes < 0) -1 else bytes + size
        }
    }

    private const val MAX_UNKNOWN_PATTERNS = 300
    private const val OTHER_PATTERN = "(further patterns not listed)"
    private const val PROGRESS_EVERY = 25
}
