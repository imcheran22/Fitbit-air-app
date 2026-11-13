package com.apex.athlete.core.data.export

import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.HeartRatePoint
import com.apex.athlete.core.data.model.IngestCounts
import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.model.WorkoutObservation
import com.apex.athlete.core.domain.DataProvenance
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.jsonPrimitive
import java.io.InputStream

/**
 * Where an import writes. The app's implementation ([StoreImportTarget]) takes the store's write
 * mutex around every call, so an import never interleaves with a sync; tests supply a fake.
 */
interface ImportTarget {
    /** True for the Demo store. The importer refuses it. */
    val isDemo: Boolean

    /** Writes one batch through the ingestor (which applies reconciliation, plausibility and de-duplication). */
    suspend fun ingest(batch: HealthBatch): IngestCounts

    /** Earliest civil day the import has changed so far, or null if nothing was written. */
    fun earliestAffectedDay(): Long?

    /** Recomputes derived values from [fromDay] to today, oldest first. Returns the number of days. */
    suspend fun replayFrom(fromDay: Long): Int

    /**
     * Writes rows of the local logging tables (behaviours, quick log, goals, food, blood pressure, breathing, coach chats)
     * under the same write mutex. A target without these tables drops everything and says so.
     */
    suspend fun importExtras(batch: ExtrasBatch): ExtrasImportResult = ExtrasImportResult(written = 0, dropped = batch.size.toLong())

    /** Tells screens to refresh. */
    fun notifyChanged()
}

enum class ImportStatus {
    COMPLETED,

    /** The file ended or broke part-way. Everything before the break was imported and replayed. */
    PARTIAL,

    /** Not an Apex export file. Nothing was imported. */
    NOT_AN_EXPORT,

    /** Written by a newer version of Apex than this one understands. Nothing was imported. */
    NEWER_VERSION,
}

data class ImportReport(
    val status: ImportStatus,
    val fileSchemaVersion: Int?,
    val rowsRead: ExportCounts,
    val ingested: IngestCounts,
    /** Rows that were dropped, per reason. Never includes the rows' content. */
    val quarantined: Map<QuarantineReason, Long>,
    val replayedDays: Int,
    /** The counts the file itself declared at its end (null if it was cut off before them). */
    val declaredCounts: ExportCounts?,
    /** Rows of the local logging tables that were written (the rest of those read are in [quarantined]). */
    val extrasWritten: Long = 0,
) {
    val quarantinedTotal: Long get() = quarantined.values.sum()
    val skippedDerived: Long get() = quarantined[QuarantineReason.DERIVED_VALUE_SKIPPED] ?: 0
}

/**
 * Reads an Apex JSON export back into the real store.
 *
 * - **Tolerant reader:** unknown fields are ignored; a damaged or unknown-valued row is quarantined
 *   and counted, the rest still imports. The schema version is checked first.
 * - **Provenance kept:** each row goes in with the provenance it had, grouped into batches by it.
 *   Demo, AI and unavailable markers are refused. Computed values are not imported; the replay
 *   recomputes them.
 * - **Idempotent:** same-source rows are overwritten with identical content, so importing the same
 *   file twice leaves the same state.
 * - **Never the Demo store** ([DemoStoreRefusedException]).
 * - Memory stays flat: the file is read as a stream and written in batches of [batchRows].
 */
class DataImporter(
    private val openTarget: suspend () -> ImportTarget,
    private val batchRows: Int = 5_000,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) {
    suspend fun import(input: InputStream, onProgress: (rowsRead: Long) -> Unit = {}): ImportReport = withContext(io) {
        val target = openTarget()
        if (target.isDemo) throw DemoStoreRefusedException()

        val json = ExportFormat.readerJson
        val read = Counter()
        val quarantine = LinkedHashMap<QuarantineReason, Long>()
        fun reject(r: QuarantineReason) { quarantine[r] = (quarantine[r] ?: 0) + 1 }
        var ingested = IngestCounts()
        var version: Int? = null
        var formatOk = false
        var declared: ExportCounts? = null
        var status = ImportStatus.COMPLETED
        var buffered = 0
        var total = 0L
        val extrasBuffer = ExtrasAccumulator()
        val extrasRead = LinkedHashMap<String, Long>()
        var extrasWritten = 0L

        val daily = HashMap<DataProvenance, MutableList<DailyObservation>>()
        val hr = HashMap<DataProvenance, MutableList<HeartRatePoint>>()
        val samples = HashMap<DataProvenance, MutableList<SampleObservation>>()
        val sleeps = HashMap<DataProvenance, MutableList<SleepObservation>>()
        val workouts = HashMap<DataProvenance, MutableList<WorkoutObservation>>()

        suspend fun flush() {
            val keys = (daily.keys + hr.keys + samples.keys + sleeps.keys + workouts.keys).toList()
            for (p in keys) {
                val batch = HealthBatch(
                    provenance = p,
                    heartRate = hr[p].orEmpty(), daily = daily[p].orEmpty(), samples = samples[p].orEmpty(),
                    sleeps = sleeps[p].orEmpty(), workouts = workouts[p].orEmpty(),
                )
                ingested += target.ingest(batch)
            }
            daily.clear(); hr.clear(); samples.clear(); sleeps.clear(); workouts.clear()
            if (extrasBuffer.size > 0) {
                val result = target.importExtras(extrasBuffer.drain())
                extrasWritten += result.written
                if (result.dropped > 0) quarantine[QuarantineReason.NOT_STORED] = (quarantine[QuarantineReason.NOT_STORED] ?: 0) + result.dropped
            }
            buffered = 0
        }

        suspend fun takeExtra(table: ExtrasTable, raw: String) {
            total++
            extrasRead[table.jsonKey] = (extrasRead[table.jsonKey] ?: 0) + 1
            when (val m = ExtrasImportMapping.map(table, raw, json)) {
                is ExtrasMapped.Rejected -> reject(m.reason)
                is ExtrasMapped.Ok -> { extrasBuffer.add(m.entity); buffered++ }
            }
            if (buffered >= batchRows) flush()
            if (total % 5_000 == 0L) onProgress(total)
        }

        suspend fun <R, T> take(raw: String, ser: kotlinx.serialization.KSerializer<R>, map: (R) -> Mapped<T>, add: (DataProvenance, T) -> Unit, bump: () -> Unit) {
            bump()
            total++
            val row = try { json.decodeFromString(ser, raw) } catch (_: SerializationException) { reject(QuarantineReason.MALFORMED_ROW); return } catch (_: IllegalArgumentException) { reject(QuarantineReason.MALFORMED_ROW); return }
            when (val m = map(row)) {
                is Mapped.Rejected -> reject(m.reason)
                is Mapped.Ok -> { add(m.provenance, m.value); buffered++ }
            }
            if (buffered >= batchRows) flush()
            if (total % 5_000 == 0L) onProgress(total)
        }

        try {
            val scanner = JsonStreamScanner(input.bufferedReader(Charsets.UTF_8), json = json)
            for (token in scanner.tokens()) {
                when (token) {
                    is ScanToken.Field -> when (token.key) {
                        ExportFormat.KEY_FORMAT -> formatOk = token.value.asString() == ExportFormat.FORMAT
                        ExportFormat.KEY_SCHEMA_VERSION -> version = token.value.asInt()
                        ExportFormat.KEY_COUNTS -> declared = try { json.decodeFromJsonElement(ExportCounts.serializer(), token.value) } catch (_: Exception) { null }
                        else -> Unit
                    }
                    is ScanToken.Element -> {
                        val table = ExportTable.entries.firstOrNull { it.jsonKey == token.key && it != ExportTable.SLEEP_STAGES }
                        val extrasTable = if (table == null) ExtrasTable.fromJsonKey(token.key) else null
                        if (table == null && extrasTable == null) continue // an array this version does not know: skip it
                        // The header must have come first; without it this is some other JSON file.
                        if (!formatOk || version == null) {
                            return@withContext emptyReport(ImportStatus.NOT_AN_EXPORT, version)
                        }
                        if (version!! > ExportFormat.SCHEMA_VERSION) {
                            return@withContext emptyReport(ImportStatus.NEWER_VERSION, version)
                        }
                        if (extrasTable != null) {
                            takeExtra(extrasTable, token.raw)
                            continue
                        }
                        when (table) {
                            null -> Unit
                            ExportTable.DAILY -> take(token.raw, DailyRow.serializer(), ImportMapping::daily, { p, v -> daily.getOrPut(p) { ArrayList() } += v }) { read.daily++ }
                            ExportTable.HEART_RATE -> take(token.raw, HeartRateMinuteRow.serializer(), ImportMapping::heartRate, { p, v -> hr.getOrPut(p) { ArrayList() } += v }) { read.hr++ }
                            ExportTable.SAMPLES -> take(token.raw, SampleRow.serializer(), ImportMapping::sample, { p, v -> samples.getOrPut(p) { ArrayList() } += v }) { read.samples++ }
                            ExportTable.SLEEP_SESSIONS -> take(token.raw, SleepRow.serializer(), ImportMapping::sleep, { p, v -> sleeps.getOrPut(p) { ArrayList() } += v }) { read.sleeps++ }
                            ExportTable.WORKOUTS -> take(token.raw, WorkoutRow.serializer(), ImportMapping::workout, { p, v -> workouts.getOrPut(p) { ArrayList() } += v }) { read.workouts++ }
                            ExportTable.SLEEP_STAGES -> Unit
                        }
                    }
                }
            }
            if (!formatOk || version == null) return@withContext emptyReport(ImportStatus.NOT_AN_EXPORT, version)
            if (version!! > ExportFormat.SCHEMA_VERSION) return@withContext emptyReport(ImportStatus.NEWER_VERSION, version)
        } catch (_: MalformedJsonException) {
            status = if (formatOk && version != null && version!! <= ExportFormat.SCHEMA_VERSION) ImportStatus.PARTIAL else {
                return@withContext emptyReport(ImportStatus.NOT_AN_EXPORT, version)
            }
        }

        flush()
        val earliest = target.earliestAffectedDay()
        val replayed = if (earliest != null) target.replayFrom(earliest) else 0
        if (earliest != null || extrasWritten > 0) target.notifyChanged()
        onProgress(total)

        ImportReport(
            status = status,
            fileSchemaVersion = version,
            rowsRead = ExportCounts(read.daily, read.hr, read.samples, read.sleeps, 0, read.workouts, extras = extrasRead),
            ingested = ingested,
            quarantined = quarantine,
            replayedDays = replayed,
            declaredCounts = declared,
            extrasWritten = extrasWritten,
        )
    }

    private class Counter { var daily = 0L; var hr = 0L; var samples = 0L; var sleeps = 0L; var workouts = 0L }

    private fun emptyReport(status: ImportStatus, version: Int?) =
        ImportReport(status, version, ExportCounts(), IngestCounts(), emptyMap(), 0, null)

    private fun kotlinx.serialization.json.JsonElement.asString(): String? = try { jsonPrimitive.content } catch (_: Exception) { null }
    private fun kotlinx.serialization.json.JsonElement.asInt(): Int? = try { jsonPrimitive.content.toInt() } catch (_: Exception) { null }
}
