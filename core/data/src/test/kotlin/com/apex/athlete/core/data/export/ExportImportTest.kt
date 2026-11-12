package com.apex.athlete.core.data.export

import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.IngestCounts
import kotlinx.coroutines.runBlocking
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipInputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

private class FakeSource(override val isDemo: Boolean = false) : ExportDataSource {
    val daily = listOf(
        DailyRow("hrv_rmssd", 20000, 55.5, "ghealth_api", 300, 12, null, 1),
        DailyRow("steps", 20000, 9000.0, "health_connect"),
        DailyRow("recovery_score", 20000, 71.0, "derived", algorithmVersion = 3),
        DailyRow("hrv_rmssd", 20001, Double.NaN, "ghealth_api"),
    )
    val hr = listOf(
        HeartRateMinuteRow(1_728_000_000_000, 61.5, 60, 63, 4, "ghealth_api"),
        HeartRateMinuteRow(1_728_000_060_000, 70.0, 70, 70, 1, "health_connect"),
    )
    val samples = listOf(SampleRow("spo2_avg", 1_728_000_000_000, 96.0, "ghealth_api"))
    val sleeps = listOf(
        SleepRow(
            "s1", 1_728_000_000_000, 1_728_028_800_000, 0, 0, 20000, true, false, true, 420, 60, 480, 10, 90, 100, 230, 2, "ghealth_api", 5,
            listOf(SleepStageRow(1_728_000_000_000, 1_728_014_400_000, "light"), SleepStageRow(1_728_014_400_000, 1_728_028_800_000, "deep")),
        ),
    )
    val workouts = listOf(
        WorkoutRow("w1", 1_728_000_000_000, 1_728_003_600_000, 0, 20000, "run", "=Evening, \"fast\"\nrun", 3_500_000, 140, 170, 500.5, 8000.0, 9000, null, 30, provenance = "health_connect"),
    )
    override suspend fun daily(emit: suspend (List<DailyRow>) -> Unit) = emit(daily)
    override suspend fun heartRateMinutes(emit: suspend (List<HeartRateMinuteRow>) -> Unit) = emit(hr)
    override suspend fun samples(emit: suspend (List<SampleRow>) -> Unit) = emit(samples)
    override suspend fun sleepSessions(emit: suspend (List<SleepRow>) -> Unit) = emit(sleeps)
    override suspend fun workouts(emit: suspend (List<WorkoutRow>) -> Unit) = emit(workouts)
}

private class FakeTarget(override val isDemo: Boolean = false) : ImportTarget {
    val batches = ArrayList<HealthBatch>()
    var replayedFrom: Long? = null
    override suspend fun ingest(batch: HealthBatch): IngestCounts { batches += batch; return IngestCounts(samplesWritten = batch.samples.size.toLong()) }
    override fun earliestAffectedDay(): Long? = batches.filter { !it.isEmpty }.minOfOrNull { b -> b.daily.minOfOrNull { it.epochDay } ?: 20000L }
    override suspend fun replayFrom(fromDay: Long): Int { replayedFrom = fromDay; return 1 }
    override fun notifyChanged() {}
}

class ExportImportTest {
    private fun exporter(src: ExportDataSource = FakeSource()) = DataExporter({ src }, "0.1.0", 7, { 1_700_000_000_000 })

    private fun json(): ByteArray = ByteArrayOutputStream().also { runBlocking { exporter().exportJson(it) } }.toByteArray()

    @Test fun jsonEnvelopeAndCounts() {
        val out = ByteArrayOutputStream()
        val report = runBlocking { exporter().exportJson(out) }
        val text = out.toString(Charsets.UTF_8)
        assertTrue(text.startsWith("{\"format\":\"apex-export\",\"schemaVersion\":1,\"appVersion\":\"0.1.0\",\"algorithmVersion\":7"))
        assertEquals(3, report.counts.daily) // NaN row skipped
        assertEquals(1, report.counts.skipped)
        assertEquals(2, report.counts.heartRateMinutes)
        assertEquals(2, report.counts.sleepStages)
        assertTrue(!text.contains("token", ignoreCase = true))
    }

    @Test fun demoStoreRefusedByExportAndImport() {
        assertFailsWith<DemoStoreRefusedException> { runBlocking { exporter(FakeSource(isDemo = true)).exportJson(ByteArrayOutputStream()) } }
        assertFailsWith<DemoStoreRefusedException> { runBlocking { exporter(FakeSource(isDemo = true)).exportCsvZip(ByteArrayOutputStream()) } }
        assertFailsWith<DemoStoreRefusedException> { runBlocking { DataImporter({ FakeTarget(isDemo = true) }).import(ByteArrayInputStream(json())) } }
    }

    @Test fun importKeepsProvenanceGroupsByItAndSkipsDerived() {
        val target = FakeTarget()
        val r = runBlocking { DataImporter({ target }).import(ByteArrayInputStream(json())) }
        assertEquals(ImportStatus.COMPLETED, r.status)
        assertEquals(1, r.skippedDerived)
        val provs = target.batches.map { it.provenance.storageKey }.toSet()
        assertEquals(setOf("ghealth_api", "health_connect"), provs)
        val api = target.batches.first { it.provenance.storageKey == "ghealth_api" }
        assertEquals(55.5, api.daily.single().value)
        assertEquals(4, api.heartRate.size)
        assertEquals(60, api.heartRate.minOf { it.bpm })
        assertEquals(2, api.sleeps.single().stages.size)
        assertEquals(20000L, target.replayedFrom)
        assertEquals(3, r.declaredCounts!!.daily)
    }

    @Test fun importTwiceGivesIdenticalBatches() {
        val bytes = json()
        val a = FakeTarget(); val b = FakeTarget()
        runBlocking { DataImporter({ a }).import(ByteArrayInputStream(bytes)); DataImporter({ b }).import(ByteArrayInputStream(bytes)) }
        assertEquals(a.batches, b.batches)
    }

    @Test fun tolerantReaderQuarantinesBadRowsAndIgnoresUnknownFields() {
        val doc = """{"format":"apex-export","schemaVersion":1,"future":{"x":[1,2]},"newTable":[{"a":1}],
          "daily":[{"metric":"steps","epochDay":1,"value":5.0,"provenance":"health_connect","extra":"ignored"},
                   {"metric":"nope","epochDay":1,"value":5.0,"provenance":"health_connect"},
                   {"metric":"steps","epochDay":1,"value":"abc","provenance":"health_connect"},
                   {"metric":"steps","epochDay":2,"value":1.0,"provenance":"demo"},
                   {"metric":"steps","epochDay":3,"value":1.0,"provenance":"???"}],
          "heartRateMinutes":[{"t":1728000000000,"avg":60.0,"min":60,"max":60,"n":999999,"provenance":"ghealth_api"}]}"""
        val target = FakeTarget()
        val r = runBlocking { DataImporter({ target }).import(ByteArrayInputStream(doc.toByteArray())) }
        assertEquals(ImportStatus.COMPLETED, r.status)
        assertEquals(1, target.batches.sumOf { it.daily.size })
        assertEquals(1, r.quarantined[QuarantineReason.UNKNOWN_METRIC])
        assertEquals(1, r.quarantined[QuarantineReason.MALFORMED_ROW])
        assertEquals(1, r.quarantined[QuarantineReason.PROVENANCE_NOT_IMPORTABLE])
        assertEquals(1, r.quarantined[QuarantineReason.UNKNOWN_PROVENANCE])
        assertEquals(1, r.quarantined[QuarantineReason.INVALID_VALUE])
    }

    @Test fun versionAndFormatChecks() {
        fun run(doc: String) = runBlocking { DataImporter({ FakeTarget() }).import(ByteArrayInputStream(doc.toByteArray())) }.status
        assertEquals(ImportStatus.NEWER_VERSION, run("""{"format":"apex-export","schemaVersion":99,"daily":[{"metric":"steps"}]}"""))
        assertEquals(ImportStatus.NOT_AN_EXPORT, run("""{"daily":[{"metric":"steps"}]}"""))
        assertEquals(ImportStatus.NOT_AN_EXPORT, run("not json"))
    }

    @Test fun truncatedFileIsPartialAndKeepsEarlierRows() {
        val full = String(json(), Charsets.UTF_8)
        val cut = full.substring(0, full.indexOf("\"heartRateMinutes\"") + 40)
        val target = FakeTarget()
        val r = runBlocking { DataImporter({ target }).import(ByteArrayInputStream(cut.toByteArray())) }
        assertEquals(ImportStatus.PARTIAL, r.status)
        assertTrue(target.batches.sumOf { it.daily.size } >= 2)
    }

    @Test fun csvZipHasOneFilePerTableWithHeaders() {
        val out = ByteArrayOutputStream()
        runBlocking { exporter().exportCsvZip(out) }
        val files = HashMap<String, String>()
        ZipInputStream(ByteArrayInputStream(out.toByteArray())).use { z ->
            while (true) { val e = z.nextEntry ?: break; files[e.name] = z.readBytes().toString(Charsets.UTF_8) }
        }
        assertEquals(setOf("daily_values.csv", "heart_rate_minutes.csv", "samples.csv", "sleep_sessions.csv", "sleep_stages.csv", "workouts.csv", "export_info.csv"), files.keys)
        for (t in ExportTable.entries) assertTrue(files.getValue(t.csvFile).startsWith(CsvFormat.headerLine(t)), t.csvFile)
        assertTrue(files.getValue("daily_values.csv").contains("hrv_rmssd,2024-10-04,20000,55.5,ghealth_api,300,12,,1970-01-01T00:00:00.001Z"))
        assertEquals(3, files.getValue("sleep_stages.csv").lines().count { it.isNotBlank() })
        assertTrue(files.getValue("workouts.csv").contains("\"'=Evening, \"\"fast\"\"\nrun\""))
    }
}
