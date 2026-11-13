package com.apex.athlete.core.data.takeout

import kotlinx.serialization.Serializable

/*
 * What an import did, in a form that is safe to keep, show and pass on: counts, dates, redacted
 * name patterns and enum values. No reading, no file content, no file path as picked, no URI.
 */

@Serializable
enum class TakeoutOutcome {
    /** At least one file was imported (possibly with warnings; see the per-file statuses). */
    COMPLETED,

    /** The archive was read, and everything in it was already imported and unchanged. */
    NOTHING_NEW,

    /** A readable ZIP, but none of its entries is a file this app reads. */
    NO_RECOGNISED_FILES,

    /** None of the picked files could be read as a ZIP. */
    NOT_AN_ARCHIVE,
}

/** Why a file was or was not imported. */
@Serializable
enum class TakeoutFileDecision {
    IMPORT_NEW,
    IMPORT_CHANGED,
    IMPORT_FORCED,

    /** A previous import of this file did not finish. */
    IMPORT_RESUME,
    SKIP_UNCHANGED,

    /** Smaller than the copy already imported: an older export of the same day. */
    SKIP_OLDER_VERSION,

    /** The same file appears more than once in the selection; the largest copy is used. */
    SKIP_DUPLICATE,

    /** The same day is present in the classic layout, which is preferred. */
    SKIP_OTHER_LAYOUT,
    ;

    val isImport: Boolean get() = this == IMPORT_NEW || this == IMPORT_CHANGED || this == IMPORT_FORCED || this == IMPORT_RESUME
}

@Serializable
enum class TakeoutFileStatus {
    COMPLETE,

    /** The content stopped being valid part-way; rows before that point were imported. */
    MALFORMED,

    /** The file does not have the expected header or root; nothing was read from it. */
    SCHEMA_MISMATCH,

    /** The archive ended or failed inside this file; it will be imported again from a complete archive. */
    TRUNCATED,

    /** Planned, but the archive could not be read as far as this file on the second pass. */
    NOT_REACHED,
}

@Serializable
data class TakeoutPartReport(
    /** Position in the selection, starting at 1. The picked file's name is not kept. */
    val index: Int,
    val status: TakeoutPartStatus,
    val entries: Int,
    val recognised: Int,
)

@Serializable
data class TakeoutCategorySummary(
    val category: TakeoutCategory,
    val files: Int,
    val bytes: Long,
    val firstEpochDay: Long?,
    val lastEpochDay: Long?,
)

@Serializable
data class TakeoutNamePattern(
    /** Redacted path with dates and numbers generalised, e.g. `Takeout/Fitbit/Global Export Data/heart_rate-YYYY-MM-DD.json`. */
    val pattern: String,
    val count: Int,
    /** Total uncompressed size where the archive states it; -1 when unknown. */
    val bytes: Long,
    /** Null for entries that are not on the whitelist. */
    val category: TakeoutCategory? = null,
)

/**
 * The layout of the picked archive: what is in it, by redacted name pattern and by category,
 * produced without parsing any file. A category in [missingCategories] is simply
 * "not in this archive", never an error.
 */
@Serializable
data class TakeoutLayoutReport(
    val parts: List<TakeoutPartReport>,
    val categories: List<TakeoutCategorySummary>,
    val missingCategories: List<TakeoutCategory>,
    val recognisedPatterns: List<TakeoutNamePattern>,
    val unknownPatterns: List<TakeoutNamePattern>,
    val unknownEntries: Int,
) {
    val recognisedEntries: Int get() = categories.sumOf { it.files }
    val anyReadablePart: Boolean get() = parts.any { it.status == TakeoutPartStatus.OK || it.status == TakeoutPartStatus.TRUNCATED }

    /** Plain-text form for the Diagnostics screen and for a report the owner chooses to share. */
    fun toRedactedText(): String = buildString {
        appendLine("Archive layout (names redacted, nothing parsed)")
        for (p in parts) appendLine("part ${p.index}: ${p.status}, ${p.entries} entries, ${p.recognised} recognised")
        appendLine("By category:")
        for (c in categories) appendLine("  ${c.category.key}: ${c.files} files, ${c.bytes} bytes")
        for (c in missingCategories) appendLine("  ${c.key}: not in this archive")
        appendLine("Recognised name patterns:")
        for (p in recognisedPatterns) appendLine("  ${p.count} x ${p.pattern}")
        appendLine("Other entries (ignored, never read): $unknownEntries")
        for (p in unknownPatterns) appendLine("  ${p.count} x ${p.pattern}")
    }
}

@Serializable
data class TakeoutFileReport(
    /** Lower-cased file name; whitelisted names hold only a data type and dates. */
    val fileKey: String,
    val category: TakeoutCategory,
    val layout: TakeoutLayout,
    val decision: TakeoutFileDecision,
    val status: TakeoutFileStatus,
    val sizeBytes: Long,
    val rowsRead: Long = 0,
    /** Rows handed to the ingestor in committed batches. */
    val rowsCommitted: Long = 0,
    /**
     * Rows of an interrupted earlier run that were already committed and are not sent again
     * (resume); [rowsCommitted] counts only what this run sent.
     */
    val rowsAlreadyCommitted: Long = 0,
    /** Database rows the ingestor wrote (heart rate is counted in one-minute buckets). */
    val rowsWritten: Long = 0,
    val droppedLowConfidence: Long = 0,
    val droppedEmpty: Long = 0,
    val quarantined: Long = 0,
    /** Rows the ingestor rejected as physiologically impossible. */
    val rejectedImplausible: Long = 0,
    /** Rows not written because a better copy from another source is already stored. */
    val keptExisting: Long = 0,
)

@Serializable
data class TakeoutCategoryReport(
    val category: TakeoutCategory,
    val filesInArchive: Int,
    val filesImported: Int,
    val filesSkipped: Int,
    val rowsRead: Long,
    val rowsCommitted: Long,
    val rowsWritten: Long,
    val droppedLowConfidence: Long,
    val droppedEmpty: Long,
    val quarantined: Long,
    val rejectedImplausible: Long,
    val keptExisting: Long,
)

@Serializable
data class TakeoutImportReport(
    val startedAtMillis: Long,
    val finishedAtMillis: Long,
    val outcome: TakeoutOutcome,
    val forced: Boolean,
    val layout: TakeoutLayoutReport,
    /** One entry per file that was imported or had a problem. Unchanged, skipped files are only counted. */
    val files: List<TakeoutFileReport>,
    val categories: List<TakeoutCategoryReport>,
    /** The zone rule each imported file type was read with, keyed `category/layout`. All are unverified. */
    val zoneRules: Map<String, ZoneRule>,
    /** Day totals of steps written from the archive's step buckets (only for days the archive covers completely). */
    val stepDayTotalsWritten: Int,
    /** Day totals of every summed series (steps included) written from the archive's buckets. */
    val dayTotalsWritten: Int = 0,
    /** Civil-day range of the rows read from the imported files (UTC instants mapped to the local zone); null when none. */
    val dataFirstEpochDay: Long?,
    val dataLastEpochDay: Long?,
    /** Earliest civil day whose stored data changed (this run, or an earlier run whose recomputation had not finished). */
    val earliestModifiedEpochDay: Long?,
    /** Days recomputed in chronological order after the import. */
    val recomputedDays: Int,
) {
    val filesImported: Int get() = categories.sumOf { it.filesImported }
    val filesSkipped: Int get() = categories.sumOf { it.filesSkipped }
    val rowsImported: Long get() = categories.sumOf { it.rowsCommitted }
    val rowsDropped: Long get() = categories.sumOf { it.droppedLowConfidence + it.droppedEmpty }
    val rowsQuarantined: Long get() = categories.sumOf { it.quarantined }
    val unknownEntries: Int get() = layout.unknownEntries
    val hasWarnings: Boolean
        get() = files.any { it.status != TakeoutFileStatus.COMPLETE } || layout.parts.any { it.status != TakeoutPartStatus.OK }
}
