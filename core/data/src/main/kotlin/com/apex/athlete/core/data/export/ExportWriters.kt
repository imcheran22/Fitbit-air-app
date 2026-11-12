package com.apex.athlete.core.data.export

import com.apex.athlete.core.domain.DataProvenance
import kotlinx.serialization.json.JsonPrimitive
import java.io.OutputStream
import java.io.OutputStreamWriter
import java.io.Writer
import java.time.Instant
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** Facts written at the top of an export. */
data class ExportInfo(
    val appVersion: String,
    val algorithmVersion: Int,
    val exportedAtEpochMillis: Long,
)

/** What the exporter feeds. One implementation per file format; both stream, neither keeps rows. */
internal interface ExportSink {
    /** CSV keeps stages in their own file, so the exporter makes a second pass over the sessions for it. */
    val splitsSleepStages: Boolean
    fun start(info: ExportInfo)
    fun beginTable(table: ExportTable)
    fun daily(rows: List<DailyRow>)
    fun heartRate(rows: List<HeartRateMinuteRow>)
    fun samples(rows: List<SampleRow>)
    fun sleep(table: ExportTable, rows: List<SleepRow>)
    fun workouts(rows: List<WorkoutRow>)
    fun endTable(table: ExportTable)
    fun finish(counts: ExportCounts)
}

/** Writes the single JSON document, one row at a time. */
internal class JsonExportSink(out: OutputStream) : ExportSink {
    private val w: Writer = OutputStreamWriter(out, Charsets.UTF_8).buffered(64 * 1024)
    private var firstInTable = true
    override val splitsSleepStages = false

    private fun q(s: String) = JsonPrimitive(s).toString()

    override fun start(info: ExportInfo) {
        w.write("{")
        w.write("\"${ExportFormat.KEY_FORMAT}\":${q(ExportFormat.FORMAT)},")
        w.write("\"${ExportFormat.KEY_SCHEMA_VERSION}\":${ExportFormat.SCHEMA_VERSION},")
        w.write("\"${ExportFormat.KEY_APP_VERSION}\":${q(info.appVersion)},")
        w.write("\"${ExportFormat.KEY_ALGORITHM_VERSION}\":${info.algorithmVersion},")
        w.write("\"${ExportFormat.KEY_EXPORTED_AT_MILLIS}\":${info.exportedAtEpochMillis},")
        w.write("\"${ExportFormat.KEY_EXPORTED_AT}\":${q(Instant.ofEpochMilli(info.exportedAtEpochMillis).toString())},")
        w.write("\"${ExportFormat.KEY_LEGEND}\":{")
        w.write(DataProvenance.entries.joinToString(",") { "${q(it.storageKey)}:${q(it.badge)}" })
        w.write("}")
    }

    override fun beginTable(table: ExportTable) {
        w.write(",\"${table.jsonKey}\":[")
        firstInTable = true
    }

    private fun sep() {
        if (firstInTable) firstInTable = false else w.write(",")
    }

    private val j = ExportFormat.writerJson
    override fun daily(rows: List<DailyRow>) = rows.forEach { sep(); w.write(j.encodeToString(DailyRow.serializer(), it)) }
    override fun heartRate(rows: List<HeartRateMinuteRow>) = rows.forEach { sep(); w.write(j.encodeToString(HeartRateMinuteRow.serializer(), it)) }
    override fun samples(rows: List<SampleRow>) = rows.forEach { sep(); w.write(j.encodeToString(SampleRow.serializer(), it)) }
    override fun sleep(table: ExportTable, rows: List<SleepRow>) = rows.forEach { sep(); w.write(j.encodeToString(SleepRow.serializer(), it)) }
    override fun workouts(rows: List<WorkoutRow>) = rows.forEach { sep(); w.write(j.encodeToString(WorkoutRow.serializer(), it)) }

    override fun endTable(table: ExportTable) = w.write("]")

    override fun finish(counts: ExportCounts) {
        w.write(",\"${ExportFormat.KEY_COUNTS}\":")
        w.write(j.encodeToString(ExportCounts.serializer(), counts))
        w.write("}")
        w.flush()
    }
}

/** Writes a ZIP with one CSV file per table plus `export_info.csv`. The caller closes the stream. */
internal class CsvZipExportSink(out: OutputStream) : ExportSink {
    private val zip = ZipOutputStream(out)
    private val w: Writer = OutputStreamWriter(zip, Charsets.UTF_8).buffered(64 * 1024)
    private var info: ExportInfo? = null
    override val splitsSleepStages = true

    override fun start(info: ExportInfo) {
        this.info = info
    }

    override fun beginTable(table: ExportTable) {
        zip.putNextEntry(ZipEntry(table.csvFile))
        w.write(CsvFormat.headerLine(table))
    }

    override fun daily(rows: List<DailyRow>) = rows.forEach { w.write(CsvFormat.row(it)) }
    override fun heartRate(rows: List<HeartRateMinuteRow>) = rows.forEach { w.write(CsvFormat.row(it)) }
    override fun samples(rows: List<SampleRow>) = rows.forEach { w.write(CsvFormat.row(it)) }
    override fun workouts(rows: List<WorkoutRow>) = rows.forEach { w.write(CsvFormat.row(it)) }
    override fun sleep(table: ExportTable, rows: List<SleepRow>) {
        if (table == ExportTable.SLEEP_STAGES) rows.forEach { s -> s.stages.forEach { w.write(CsvFormat.stageRow(s.id, it)) } }
        else rows.forEach { w.write(CsvFormat.row(it)) }
    }

    override fun endTable(table: ExportTable) {
        w.flush()
        zip.closeEntry()
    }

    override fun finish(counts: ExportCounts) {
        val i = checkNotNull(info)
        zip.putNextEntry(ZipEntry("export_info.csv"))
        w.write(CsvFormat.line("key", "value"))
        w.write(CsvFormat.line("format", ExportFormat.FORMAT))
        w.write(CsvFormat.line("schema_version", ExportFormat.SCHEMA_VERSION.toString()))
        w.write(CsvFormat.line("app_version", CsvFormat.text(i.appVersion)))
        w.write(CsvFormat.line("algorithm_version", i.algorithmVersion.toString()))
        w.write(CsvFormat.line("exported_at_utc", Instant.ofEpochMilli(i.exportedAtEpochMillis).toString()))
        w.write(CsvFormat.line("rows_daily_values", counts.daily.toString()))
        w.write(CsvFormat.line("rows_heart_rate_minutes", counts.heartRateMinutes.toString()))
        w.write(CsvFormat.line("rows_samples", counts.samples.toString()))
        w.write(CsvFormat.line("rows_sleep_sessions", counts.sleepSessions.toString()))
        w.write(CsvFormat.line("rows_sleep_stages", counts.sleepStages.toString()))
        w.write(CsvFormat.line("rows_workouts", counts.workouts.toString()))
        for (p in DataProvenance.entries) w.write(CsvFormat.line("provenance_" + p.storageKey, CsvFormat.text(p.badge)))
        w.flush()
        zip.closeEntry()
        zip.finish()
        zip.flush()
    }
}
