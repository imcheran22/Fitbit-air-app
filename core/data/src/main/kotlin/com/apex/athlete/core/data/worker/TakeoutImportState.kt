package com.apex.athlete.core.data.worker

import com.apex.athlete.core.data.takeout.TakeoutImportProgress
import com.apex.athlete.core.data.takeout.TakeoutImportReport
import com.apex.athlete.core.data.takeout.TakeoutOutcome
import com.apex.athlete.core.data.takeout.TakeoutPartStatus

/**
 * What the screens know about the archive import. Counts, dates and stable codes only: never a
 * health value, a file name or a URI.
 */
sealed interface TakeoutImportState {
    /** Nothing queued, running or recently finished. */
    data object Idle : TakeoutImportState

    /**
     * Queued or running. [filesTotal] is 0 while the archive is still being listed. [currentType] is a
     * `TakeoutCategory.key`, or one of [TakeoutPhase] while no file is being read.
     */
    data class Running(val filesDone: Int, val filesTotal: Int, val rowsWritten: Long, val currentType: String?) : TakeoutImportState

    data class Completed(val summary: TakeoutImportSummary) : TakeoutImportState

    /** [reasonCode] is one of [TakeoutFailure]. */
    data class Failed(val reasonCode: String) : TakeoutImportState
}

object TakeoutPhase {
    const val INSPECTING = "inspecting"
    const val RECALCULATING = "recalculating"
}

/** Stable failure codes; screens map them to text. */
object TakeoutFailure {
    const val DEMO_MODE = "demo_mode"
    const val STORE_UNAVAILABLE = "store_unavailable"
    const val NO_INPUT = "no_input"
    const val NOT_AN_ARCHIVE = "not_an_archive"
    const val NO_RECOGNISED_FILES = "no_recognised_files"

    /** The picked file(s) could not be opened (permission to the file is gone, or storage failed). */
    const val UNREADABLE = "unreadable"

    /** A `.tgz` export; this engine reads ZIP archives. */
    const val UNSUPPORTED_FORMAT = "unsupported_format"
    const val FAILED = "failed"
}

/** Counts of a finished import, in the shape that survives WorkManager's output data. */
data class TakeoutImportSummary(
    val filesImported: Int,
    val filesSkipped: Int,
    val rowsImported: Long,
    val rowsDropped: Long,
    val rowsQuarantined: Long,
    val unknownEntries: Int,
    val recomputedDays: Int,
    /** Civil-day range of the imported rows (days since 1970-01-01); null when none. */
    val firstEpochDay: Long?,
    val lastEpochDay: Long?,
    /** True when some file or part was damaged, truncated or unreadable. */
    val hasWarnings: Boolean,
    /** True when everything in the archive had been imported already. */
    val nothingNew: Boolean,
)

/** Maps the engine's report and progress onto [TakeoutImportState] and onto plain key/value data. Pure, so it is unit-tested. */
object TakeoutImportCodec {
    const val KEY_FILES_DONE = "files_done"
    const val KEY_FILES_TOTAL = "files_total"
    const val KEY_ROWS = "rows"
    const val KEY_TYPE = "type"

    const val KEY_FAILURE = "failure"
    const val KEY_FILES_IMPORTED = "files_imported"
    const val KEY_FILES_SKIPPED = "files_skipped"
    const val KEY_ROWS_DROPPED = "rows_dropped"
    const val KEY_ROWS_QUARANTINED = "rows_quarantined"
    const val KEY_UNKNOWN = "unknown_entries"
    const val KEY_RECOMPUTED = "recomputed_days"
    const val KEY_FIRST_DAY = "first_day"
    const val KEY_LAST_DAY = "last_day"
    const val KEY_WARNINGS = "warnings"
    const val KEY_NOTHING_NEW = "nothing_new"

    private const val NO_DAY = Long.MIN_VALUE

    val INT_KEYS = listOf(KEY_FILES_DONE, KEY_FILES_TOTAL, KEY_FILES_IMPORTED, KEY_FILES_SKIPPED, KEY_UNKNOWN, KEY_RECOMPUTED)
    val LONG_KEYS = listOf(KEY_ROWS, KEY_ROWS_DROPPED, KEY_ROWS_QUARANTINED, KEY_FIRST_DAY, KEY_LAST_DAY)
    val BOOLEAN_KEYS = listOf(KEY_WARNINGS, KEY_NOTHING_NEW)
    val STRING_KEYS = listOf(KEY_TYPE, KEY_FAILURE)

    /** Progress of a running import. Rows are those sent in this run. */
    fun running(progress: TakeoutImportProgress, rowsSoFar: Long, filesTotalSoFar: Int): TakeoutImportState.Running = when (progress) {
        is TakeoutImportProgress.Inspecting -> TakeoutImportState.Running(0, 0, 0, TakeoutPhase.INSPECTING)
        is TakeoutImportProgress.Importing -> TakeoutImportState.Running(
            filesDone = if (progress.fileFinished) progress.fileIndex else progress.fileIndex - 1,
            filesTotal = progress.fileCount,
            rowsWritten = progress.rowsImported,
            currentType = progress.category.key,
        )
        is TakeoutImportProgress.Recalculating -> TakeoutImportState.Running(filesTotalSoFar, filesTotalSoFar, rowsSoFar, TakeoutPhase.RECALCULATING)
    }

    fun progressData(s: TakeoutImportState.Running): Map<String, Any> = buildMap {
        put(KEY_FILES_DONE, s.filesDone)
        put(KEY_FILES_TOTAL, s.filesTotal)
        put(KEY_ROWS, s.rowsWritten)
        s.currentType?.let { put(KEY_TYPE, it) }
    }

    fun runningFrom(data: Map<String, Any?>) = TakeoutImportState.Running(
        filesDone = (data[KEY_FILES_DONE] as? Int) ?: 0,
        filesTotal = (data[KEY_FILES_TOTAL] as? Int) ?: 0,
        rowsWritten = (data[KEY_ROWS] as? Long) ?: 0L,
        currentType = data[KEY_TYPE] as? String,
    )

    fun summaryOf(report: TakeoutImportReport) = TakeoutImportSummary(
        filesImported = report.filesImported,
        filesSkipped = report.filesSkipped,
        rowsImported = report.rowsImported,
        rowsDropped = report.rowsDropped,
        rowsQuarantined = report.rowsQuarantined,
        unknownEntries = report.unknownEntries,
        recomputedDays = report.recomputedDays,
        firstEpochDay = report.dataFirstEpochDay,
        lastEpochDay = report.dataLastEpochDay,
        hasWarnings = report.hasWarnings,
        nothingNew = report.outcome == TakeoutOutcome.NOTHING_NEW,
    )

    fun outputData(s: TakeoutImportSummary): Map<String, Any> = buildMap {
        put(KEY_FILES_IMPORTED, s.filesImported)
        put(KEY_FILES_SKIPPED, s.filesSkipped)
        put(KEY_ROWS, s.rowsImported)
        put(KEY_ROWS_DROPPED, s.rowsDropped)
        put(KEY_ROWS_QUARANTINED, s.rowsQuarantined)
        put(KEY_UNKNOWN, s.unknownEntries)
        put(KEY_RECOMPUTED, s.recomputedDays)
        put(KEY_FIRST_DAY, s.firstEpochDay ?: NO_DAY)
        put(KEY_LAST_DAY, s.lastEpochDay ?: NO_DAY)
        put(KEY_WARNINGS, s.hasWarnings)
        put(KEY_NOTHING_NEW, s.nothingNew)
    }

    fun summaryFrom(data: Map<String, Any?>) = TakeoutImportSummary(
        filesImported = (data[KEY_FILES_IMPORTED] as? Int) ?: 0,
        filesSkipped = (data[KEY_FILES_SKIPPED] as? Int) ?: 0,
        rowsImported = (data[KEY_ROWS] as? Long) ?: 0L,
        rowsDropped = (data[KEY_ROWS_DROPPED] as? Long) ?: 0L,
        rowsQuarantined = (data[KEY_ROWS_QUARANTINED] as? Long) ?: 0L,
        unknownEntries = (data[KEY_UNKNOWN] as? Int) ?: 0,
        recomputedDays = (data[KEY_RECOMPUTED] as? Int) ?: 0,
        firstEpochDay = (data[KEY_FIRST_DAY] as? Long)?.takeIf { it != NO_DAY },
        lastEpochDay = (data[KEY_LAST_DAY] as? Long)?.takeIf { it != NO_DAY },
        hasWarnings = (data[KEY_WARNINGS] as? Boolean) ?: false,
        nothingNew = (data[KEY_NOTHING_NEW] as? Boolean) ?: false,
    )

    fun failureData(code: String): Map<String, Any> = mapOf(KEY_FAILURE to code)

    fun failureFrom(data: Map<String, Any?>): String = (data[KEY_FAILURE] as? String) ?: TakeoutFailure.FAILED

    /** Failure code for an archive the engine could not use at all, or null when it was usable. */
    fun failureOf(report: TakeoutImportReport): String? = when (report.outcome) {
        TakeoutOutcome.NOT_AN_ARCHIVE -> {
            val parts = report.layout.parts.map { it.status }
            when {
                parts.isNotEmpty() && parts.all { it == TakeoutPartStatus.UNREADABLE } -> TakeoutFailure.UNREADABLE
                parts.isNotEmpty() && parts.all { it == TakeoutPartStatus.UNSUPPORTED_TGZ } -> TakeoutFailure.UNSUPPORTED_FORMAT
                else -> TakeoutFailure.NOT_AN_ARCHIVE
            }
        }
        TakeoutOutcome.NO_RECOGNISED_FILES -> TakeoutFailure.NO_RECOGNISED_FILES
        TakeoutOutcome.COMPLETED, TakeoutOutcome.NOTHING_NEW -> null
    }
}

/** The work states the scheduler distinguishes, without depending on WorkManager's types. */
enum class TakeoutWorkPhase { QUEUED_OR_RUNNING, SUCCEEDED, FAILED, STOPPED, NONE }

object TakeoutStateMapper {
    fun map(phase: TakeoutWorkPhase, progress: Map<String, Any?>, output: Map<String, Any?>): TakeoutImportState = when (phase) {
        TakeoutWorkPhase.NONE, TakeoutWorkPhase.STOPPED -> TakeoutImportState.Idle
        TakeoutWorkPhase.QUEUED_OR_RUNNING -> TakeoutImportCodec.runningFrom(progress)
        TakeoutWorkPhase.SUCCEEDED -> TakeoutImportState.Completed(TakeoutImportCodec.summaryFrom(output))
        TakeoutWorkPhase.FAILED -> TakeoutImportState.Failed(TakeoutImportCodec.failureFrom(output))
    }
}
