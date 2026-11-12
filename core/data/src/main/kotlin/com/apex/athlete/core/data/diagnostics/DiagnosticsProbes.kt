package com.apex.athlete.core.data.diagnostics

import com.apex.athlete.core.data.takeout.TakeoutFileStatus
import com.apex.athlete.core.data.takeout.TakeoutImportReport
import java.time.LocalDate

/** Pure helpers that turn stored aggregates into the diagnostics model. No Android, no database. */
object DiagnosticsProbes {

    /**
     * [sampleCounts] holds one entry per stored one-minute bucket in the window (the bucket's raw sample
     * count). A bucket with `n` samples implies about 60 / n seconds between samples; the median over
     * buckets is the estimate. Buckets with a non-positive count are ignored for the interval but still
     * count as present.
     */
    fun heartRateProbe(sampleCounts: List<Int>, windowDays: Int): HeartRateProbe {
        val intervals = sampleCounts.filter { it > 0 }.map { 60.0 / it }.sorted()
        val median = when {
            intervals.isEmpty() -> null
            intervals.size % 2 == 1 -> intervals[intervals.size / 2]
            else -> (intervals[intervals.size / 2 - 1] + intervals[intervals.size / 2]) / 2.0
        }
        return HeartRateProbe(
            windowDays = windowDays,
            bucketsPresent = sampleCounts.size,
            windowMinutes = windowDays * 24 * 60,
            medianIntervalSeconds = median,
        )
    }

    fun epochDay(day: Long?): LocalDate? = day?.let { LocalDate.ofEpochDay(it) }

    /** Value-free summary of an import: counts, enum names, civil days. No file names, no clock times. */
    fun takeoutSummary(report: TakeoutImportReport): String = buildString {
        appendLine("Import outcome: ${report.outcome}${if (report.forced) " (forced re-import)" else ""}")
        appendLine("Files imported: ${report.filesImported}, skipped: ${report.filesSkipped}")
        appendLine("Rows imported: ${report.rowsImported}, left out: ${report.rowsDropped}, set aside: ${report.rowsQuarantined}")
        appendLine("Other entries ignored: ${report.unknownEntries}")
        appendLine("Days recalculated: ${report.recomputedDays}")
        appendLine("Data from ${epochDay(report.dataFirstEpochDay) ?: "--"} to ${epochDay(report.dataLastEpochDay) ?: "--"}")
        appendLine("Step day totals written: ${report.stepDayTotalsWritten}")
        val problems = report.files.groupingBy { it.status }.eachCount().filterKeys { it != TakeoutFileStatus.COMPLETE }
        appendLine("File problems: ${if (problems.isEmpty()) "none" else problems.entries.joinToString { "${it.key} x ${it.value}" }}")
        if (report.zoneRules.isNotEmpty()) {
            appendLine("Time zone rule per file type (unverified):")
            report.zoneRules.toSortedMap().forEach { (k, v) -> appendLine("  $k: $v") }
        }
        appendLine("By category (key: in archive, imported, skipped, rows read, rows written):")
        report.categories.forEach {
            appendLine("  ${it.category.key}: ${it.filesInArchive}, ${it.filesImported}, ${it.filesSkipped}, ${it.rowsRead}, ${it.rowsWritten}")
        }
    }.trimEnd()
}
