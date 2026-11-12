package com.apex.athlete.core.data.export

import com.apex.athlete.core.analytics.ANALYTICS_ALGORITHM_VERSION
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.OutputStream

/** What an export wrote. Counts only. */
data class ExportReport(val counts: ExportCounts, val format: Format) {
    enum class Format { JSON, CSV_ZIP }
}

/**
 * Streams the real store to a file the owner chose (a `content://` stream from the document picker).
 *
 * - Refuses the Demo store ([DemoStoreRefusedException]).
 * - Writes while reading: rows go from the database to the stream in batches; nothing is collected.
 * - Contains readings with provenance only: no tokens, API keys, client ids or settings.
 * - Read-only: it never writes to the database, Health Connect or Google.
 *
 * Does not close [OutputStream]; the caller owns it.
 */
class DataExporter(
    private val openSource: suspend () -> ExportDataSource,
    private val appVersion: String,
    private val algorithmVersion: Int = ANALYTICS_ALGORITHM_VERSION,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) {
    /** One JSON document. */
    suspend fun exportJson(out: OutputStream): ExportReport =
        ExportReport(run(JsonExportSink(out)), ExportReport.Format.JSON)

    /** A ZIP of CSV files, one per table, each with a header row. */
    suspend fun exportCsvZip(out: OutputStream): ExportReport =
        ExportReport(run(CsvZipExportSink(out)), ExportReport.Format.CSV_ZIP)

    private suspend fun run(sink: ExportSink): ExportCounts = withContext(io) {
        val source = openSource()
        if (source.isDemo) throw DemoStoreRefusedException()

        var daily = 0L; var hr = 0L; var samples = 0L; var sleeps = 0L; var stages = 0L; var workouts = 0L; var skipped = 0L

        sink.start(ExportInfo(appVersion, algorithmVersion, nowMillis()))

        sink.beginTable(ExportTable.DAILY)
        source.daily { rows ->
            val ok = rows.filter { it.value.isFinite() }
            skipped += rows.size - ok.size; daily += ok.size; sink.daily(ok)
        }
        sink.endTable(ExportTable.DAILY)

        sink.beginTable(ExportTable.HEART_RATE)
        source.heartRateMinutes { rows ->
            val ok = rows.filter { it.avg.isFinite() }
            skipped += rows.size - ok.size; hr += ok.size; sink.heartRate(ok)
        }
        sink.endTable(ExportTable.HEART_RATE)

        sink.beginTable(ExportTable.SAMPLES)
        source.samples { rows ->
            val ok = rows.filter { it.value.isFinite() }
            skipped += rows.size - ok.size; samples += ok.size; sink.samples(ok)
        }
        sink.endTable(ExportTable.SAMPLES)

        sink.beginTable(ExportTable.SLEEP_SESSIONS)
        source.sleepSessions { rows ->
            sleeps += rows.size; stages += rows.sumOf { it.stages.size }; sink.sleep(ExportTable.SLEEP_SESSIONS, rows)
        }
        sink.endTable(ExportTable.SLEEP_SESSIONS)
        if (sink.splitsSleepStages) {
            sink.beginTable(ExportTable.SLEEP_STAGES)
            source.sleepSessions { rows -> sink.sleep(ExportTable.SLEEP_STAGES, rows) }
            sink.endTable(ExportTable.SLEEP_STAGES)
        }

        sink.beginTable(ExportTable.WORKOUTS)
        source.workouts { rows ->
            val ok = rows.filter { r -> listOfNotNull(r.caloriesKcal, r.distanceMeters, r.elevationGainMeters, r.derivedTrimp, r.derivedStrain).all { it.isFinite() } }
            skipped += rows.size - ok.size; workouts += ok.size; sink.workouts(ok)
        }
        sink.endTable(ExportTable.WORKOUTS)

        val counts = ExportCounts(daily, hr, samples, sleeps, stages, workouts, skipped)
        sink.finish(counts)
        counts
    }
}
