package com.apex.athlete.core.data.export

import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.IngestCounts
import com.apex.athlete.core.database.entity.BehaviourDefEntity
import com.apex.athlete.core.database.entity.BehaviourEntryEntity
import com.apex.athlete.core.database.entity.BehaviourKind
import com.apex.athlete.core.database.entity.BloodPressureReadingEntity
import com.apex.athlete.core.database.entity.BloodPressureSource
import com.apex.athlete.core.database.entity.BreatheSessionEntity
import com.apex.athlete.core.database.entity.CoachMessageEntity
import com.apex.athlete.core.database.entity.CoachRole
import com.apex.athlete.core.database.entity.CoachThreadEntity
import com.apex.athlete.core.database.entity.CoachTopic
import com.apex.athlete.core.database.entity.FoodLogEntity
import com.apex.athlete.core.database.entity.FoodSource
import com.apex.athlete.core.database.entity.GoalEntity
import com.apex.athlete.core.database.entity.GoalKind
import com.apex.athlete.core.database.entity.MealKind
import com.apex.athlete.core.database.entity.QuickLogEntity
import com.apex.athlete.core.database.entity.QuickLogKind
import com.apex.athlete.core.domain.DataProvenance
import kotlinx.coroutines.runBlocking
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipInputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

private const val T0 = 1_728_000_000_000L

/** One row in each of the nine local tables, plus an extra thread so a message can be orphaned in the tests. */
private object Samples {
    val defs = listOf(BehaviourDefEntity("custom:sauna", "Sauna", BehaviourKind.YES_NO, "sauna", 5, archived = true))
    val entries = listOf(BehaviourEntryEntity(20_000, "custom:sauna", 1.0, 7))
    val quick = listOf(
        QuickLogEntity("q1", T0, QuickLogKind.WATER_ML, 250.0),
        QuickLogEntity("q2", T0 + 1, QuickLogKind.NOTE, text = "=HYPERLINK(\"x\"), \"quoted\"\nline two"),
    )
    val goals = listOf(GoalEntity("g1", GoalKind.WEEKLY_AZM, 150.0, enabled = false, reminderEnabled = true, createdAtEpochMillis = T0))
    val food = listOf(
        FoodLogEntity("f1", T0, MealKind.LUNCH, "Soup", kcal = null, proteinG = 12.5, source = FoodSource.MANUAL, provenance = DataProvenance.USER_REPORTED),
        FoodLogEntity("f2", T0 + 5, MealKind.SNACK, "Bar", kcal = 210.0, fibreG = 0.0, source = FoodSource.AI_ESTIMATE, provenance = DataProvenance.AI_INTERPRETED),
    )
    val bp = listOf(BloodPressureReadingEntity("b1", T0, 121.5, 79.0, null, BloodPressureSource.MANUAL, DataProvenance.USER_REPORTED))
    val breathe = listOf(BreatheSessionEntity("s1", T0, 300, 240, "box", avgHeartRate = null))
    val threads = listOf(CoachThreadEntity("t1", "Sleep", CoachTopic.SLEEP, T0, T0 + 10))
    val messages = listOf(
        CoachMessageEntity("m1", "t1", CoachRole.USER, "Why tired?", T0 + 1, DataProvenance.USER_REPORTED),
        CoachMessageEntity("m2", "t1", CoachRole.COACH, "Short sleep.", T0 + 2, DataProvenance.AI_INTERPRETED, unverifiedNumerals = "7.5,12"),
        CoachMessageEntity("m3", "t1", CoachRole.COACH, "Rule reply.", T0 + 3, DataProvenance.MATHEMATICALLY_DERIVED),
    )

    fun rows(table: ExtrasTable): List<ExtraRow> = when (table) {
        ExtrasTable.BEHAVIOUR_DEFS -> defs.map { it.toRow() }
        ExtrasTable.BEHAVIOUR_ENTRIES -> entries.map { it.toRow() }
        ExtrasTable.QUICK_LOGS -> quick.map { it.toRow() }
        ExtrasTable.GOALS -> goals.map { it.toRow() }
        ExtrasTable.FOOD_LOGS -> food.map { it.toRow() }
        ExtrasTable.BLOOD_PRESSURE -> bp.map { it.toRow() }
        ExtrasTable.BREATHE_SESSIONS -> breathe.map { it.toRow() }
        ExtrasTable.COACH_THREADS -> threads.map { it.toRow() }
        ExtrasTable.COACH_MESSAGES -> messages.map { it.toRow() }
    }
}

private class ExtrasSource(override val isDemo: Boolean = false, private val rows: (ExtrasTable) -> List<ExtraRow> = Samples::rows) : ExportDataSource {
    override suspend fun daily(emit: suspend (List<DailyRow>) -> Unit) {}
    override suspend fun heartRateMinutes(emit: suspend (List<HeartRateMinuteRow>) -> Unit) {}
    override suspend fun samples(emit: suspend (List<SampleRow>) -> Unit) {}
    override suspend fun sleepSessions(emit: suspend (List<SleepRow>) -> Unit) {}
    override suspend fun workouts(emit: suspend (List<WorkoutRow>) -> Unit) {}
    override val includesExtras: Boolean get() = true
    override suspend fun extras(table: ExtrasTable, emit: suspend (List<ExtraRow>) -> Unit) { val r = rows(table); if (r.isNotEmpty()) emit(r) }
}

private class ExtrasTarget(override val isDemo: Boolean = false, private val knownThreads: Set<String> = emptySet()) : ImportTarget {
    val extras = ArrayList<ExtrasBatch>()
    override suspend fun ingest(batch: HealthBatch) = IngestCounts()
    override fun earliestAffectedDay(): Long? = null
    override suspend fun replayFrom(fromDay: Long) = 0
    override fun notifyChanged() {}
    override suspend fun importExtras(batch: ExtrasBatch): ExtrasImportResult {
        // Like the real target: threads first, then only the messages whose thread exists.
        val threads = knownThreads + extras.flatMap { b -> b.coachThreads.map { it.id } } + batch.coachThreads.map { it.id }
        val (kept, orphans) = batch.coachMessages.partition { it.threadId in threads }
        extras += batch.copy(coachMessages = kept)
        return ExtrasImportResult(batch.size - orphans.size.toLong(), orphans.size.toLong())
    }
    fun all() = ExtrasBatch(
        extras.flatMap { it.behaviourDefs }, extras.flatMap { it.behaviourEntries }, extras.flatMap { it.quickLogs }, extras.flatMap { it.goals },
        extras.flatMap { it.foodLogs }, extras.flatMap { it.bloodPressure }, extras.flatMap { it.breatheSessions },
        extras.flatMap { it.coachThreads }, extras.flatMap { it.coachMessages },
    )
}

class ExtrasExportImportTest {
    private fun exporter(src: ExportDataSource = ExtrasSource()) = DataExporter({ src }, "0.1.0", 7, { 1_700_000_000_000 })
    private fun json(src: ExportDataSource = ExtrasSource()) = ByteArrayOutputStream().also { runBlocking { exporter(src).exportJson(it) } }.toByteArray()
    private fun import(doc: ByteArray, target: ExtrasTarget) = runBlocking { DataImporter({ target }, batchRows = 3).import(ByteArrayInputStream(doc)) }
    private fun import(doc: String, target: ExtrasTarget = ExtrasTarget()) = import(doc.toByteArray(), target) to target

    @Test fun everyTableRoundTripsThroughJson() {
        val target = ExtrasTarget()
        val report = import(json(), target)
        assertEquals(ImportStatus.COMPLETED, report.status)
        assertEquals(0L, report.quarantinedTotal)
        val all = target.all()
        assertEquals(Samples.defs, all.behaviourDefs)
        assertEquals(Samples.entries, all.behaviourEntries)
        assertEquals(Samples.quick, all.quickLogs)
        assertEquals(Samples.goals, all.goals)
        assertEquals(Samples.food, all.foodLogs)
        assertEquals(Samples.bp, all.bloodPressure)
        assertEquals(Samples.breathe, all.breatheSessions)
        assertEquals(Samples.threads, all.coachThreads)
        assertEquals(Samples.messages, all.coachMessages)
        assertEquals(ExtrasTable.entries.sumOf { Samples.rows(it).size }.toLong(), report.extrasWritten)
        assertEquals(report.extrasWritten, report.rowsRead.extraRows)
    }

    @Test fun missingNutrientsAndMissingPulseStayMissing() {
        val target = ExtrasTarget()
        import(json(), target)
        val soup = target.all().foodLogs.first { it.id == "f1" }
        assertNull(soup.kcal); assertNull(soup.carbsG); assertNull(soup.fatG); assertNull(soup.fibreG)
        assertEquals(0.0, target.all().foodLogs.first { it.id == "f2" }.fibreG) // a stated zero stays zero
        assertNull(target.all().bloodPressure.single().pulse)
        assertNull(target.all().breatheSessions.single().avgHeartRate)
        val text = String(json(), Charsets.UTF_8)
        assertTrue(!text.contains("\"kcal\":0"), "an unknown nutrient is never written as 0")
    }

    @Test fun countsAreDeclaredAndExtrasWrittenBeforeCounts() {
        val out = ByteArrayOutputStream()
        val report = runBlocking { exporter().exportJson(out) }
        val text = out.toString(Charsets.UTF_8)
        for (t in ExtrasTable.entries) assertEquals(Samples.rows(t).size.toLong(), report.counts.extras.getValue(t.jsonKey), t.jsonKey)
        assertTrue(text.indexOf("\"coachMessages\"") < text.indexOf("\"counts\""))
        assertTrue(text.indexOf("\"coachThreads\"") < text.indexOf("\"coachMessages\""), "threads before messages")
        assertTrue(!text.contains("token", ignoreCase = true))
    }

    @Test fun importingTwiceGivesTheSameRows() {
        val bytes = json()
        val once = ExtrasTarget(); val twice = ExtrasTarget()
        import(bytes, once)
        import(bytes, twice); import(bytes, twice)
        // The fake appends every batch; the real target upserts by key. Same rows, so de-duplicated they are equal.
        assertEquals(once.all(), twice.all().distinctRows())
    }

    @Test fun csvZipHasAFilePerExtrasTableWithHeadersAndSafeText() {
        val out = ByteArrayOutputStream()
        runBlocking { exporter().exportCsvZip(out) }
        val files = HashMap<String, String>()
        ZipInputStream(ByteArrayInputStream(out.toByteArray())).use { z -> while (true) { val e = z.nextEntry ?: break; files[e.name] = z.readBytes().toString(Charsets.UTF_8) } }
        for (t in ExtrasTable.entries) assertTrue(files.getValue(t.csvFile).startsWith(CsvFormat.headerLine(t)), t.csvFile)
        assertTrue(files.getValue("quick_logs.csv").contains("\"'=HYPERLINK(\"\"x\"\"), \"\"quoted\"\"\nline two\""), "a note starting with = cannot run as a formula")
        assertTrue(files.getValue("food_logs.csv").contains("f1,") && files.getValue("food_logs.csv").contains(",Soup,,12.5,,,,manual,user_reported"))
        assertEquals(4, files.getValue("coach_messages.csv").lines().count { it.isNotBlank() }) // header + 3
        assertTrue(files.getValue("export_info.csv").contains("rows_coach_messages,3"))
    }

    @Test fun aFileWithoutTheseTablesStillImports() {
        val (report, target) = import("""{"format":"apex-export","schemaVersion":1,"daily":[],"counts":{}}""")
        assertEquals(ImportStatus.COMPLETED, report.status)
        assertEquals(0L, report.extrasWritten)
        assertEquals(0, target.all().size)
    }

    @Test fun badRowsAreQuarantinedByReasonAndTheRestImports() {
        val doc = """{"format":"apex-export","schemaVersion":1,
          "quickLogs":[
            {"id":"ok","epochMillis":1728000000000,"kind":"water_ml","numericValue":250.0},
            {"id":"k","epochMillis":1728000000000,"kind":"telepathy"},
            {"id":"neg","epochMillis":1728000000000,"kind":"water_ml","numericValue":-5.0},
            {"id":"long","epochMillis":1728000000000,"kind":"note","text":"${"x".repeat(501)}"},
            {"id":"t","epochMillis":0,"kind":"note","text":"hi"},
            {"id":"bad","epochMillis":"soon","kind":"note"}],
          "foodLogs":[
            {"id":"demo","epochMillis":1728000000000,"mealKind":"lunch","name":"x","source":"manual","provenance":"demo"},
            {"id":"unk","epochMillis":1728000000000,"mealKind":"lunch","name":"x","source":"manual","provenance":"???"},
            {"id":"nut","epochMillis":1728000000000,"mealKind":"lunch","name":"x","kcal":-1.0,"source":"manual","provenance":"user_reported"},
            {"id":"meal","epochMillis":1728000000000,"mealKind":"brunch","name":"x","source":"manual","provenance":"user_reported"}],
          "bloodPressure":[
            {"id":"inv","epochMillis":1728000000000,"systolic":80.0,"diastolic":90.0,"source":"manual","provenance":"user_reported"},
            {"id":"sensor","epochMillis":1728000000000,"systolic":120.0,"diastolic":80.0,"source":"manual","provenance":"ghealth_api"}],
          "coachThreads":[{"id":"t1","title":"x","topic":"general","createdAtEpochMillis":1728000000000,"updatedAtEpochMillis":1728000000000}],
          "coachMessages":[
            {"id":"orphan","threadId":"nope","role":"user","text":"hi","createdAtMillis":1728000000000,"provenance":"user_reported"},
            {"id":"spoof","threadId":"t1","role":"user","text":"hi","createdAtMillis":1728000000000,"provenance":"ai"},
            {"id":"good","threadId":"t1","role":"coach","text":"hi","createdAtMillis":1728000000000,"provenance":"ai","futureField":1}],
          "futureTable":[{"a":1}]}"""
        val (report, target) = import(doc)
        assertEquals(ImportStatus.COMPLETED, report.status)
        assertEquals(listOf("ok"), target.all().quickLogs.map { it.id })
        assertEquals(listOf("t1"), target.all().coachThreads.map { it.id })
        assertEquals(listOf("good"), target.all().coachMessages.map { it.id })
        assertTrue(target.all().foodLogs.isEmpty() && target.all().bloodPressure.isEmpty())
        val q = report.quarantined
        assertEquals(1L, q[QuarantineReason.MALFORMED_ROW], "a text where a number belongs")
        assertEquals(2L, q[QuarantineReason.UNKNOWN_KIND], "an unknown quick-log kind and an unknown meal kind")
        assertEquals(4L, q[QuarantineReason.INVALID_VALUE], "negative water, a 501-character note, negative kcal, diastolic above systolic")
        assertEquals(1L, q[QuarantineReason.INVALID_TIME])
        assertEquals(1L, q[QuarantineReason.UNKNOWN_PROVENANCE])
        assertEquals(3L, q[QuarantineReason.PROVENANCE_NOT_IMPORTABLE], "demo food, sensor blood pressure, a user message marked as AI")
        assertEquals(1L, q[QuarantineReason.NOT_STORED], "a message whose thread is not in the file")
        assertEquals(3L, report.extrasWritten, "one quick log, one thread, one message")
    }

    @Test fun demoStoreIsStillRefusedAndATargetWithoutTheTablesDropsRows() {
        assertFailsWith<DemoStoreRefusedException> { runBlocking { exporter(ExtrasSource(isDemo = true)).exportJson(ByteArrayOutputStream()) } }
        assertFailsWith<DemoStoreRefusedException> { runBlocking { DataImporter({ ExtrasTarget(isDemo = true) }).import(ByteArrayInputStream(json())) } }
        // A target that does not override importExtras (an older fake) reports every row as dropped, never as written.
        val bare = object : ImportTarget {
            override val isDemo = false
            override suspend fun ingest(batch: HealthBatch) = IngestCounts()
            override fun earliestAffectedDay(): Long? = null
            override suspend fun replayFrom(fromDay: Long) = 0
            override fun notifyChanged() {}
        }
        val r = runBlocking { DataImporter({ bare }).import(ByteArrayInputStream(json())) }
        assertEquals(0L, r.extrasWritten)
        assertEquals(ExtrasTable.entries.sumOf { Samples.rows(it).size }.toLong(), r.quarantined[QuarantineReason.NOT_STORED])
    }

    private fun ExtrasBatch.distinctRows() = ExtrasBatch(
        behaviourDefs.distinct(), behaviourEntries.distinct(), quickLogs.distinct(), goals.distinct(), foodLogs.distinct(),
        bloodPressure.distinct(), breatheSessions.distinct(), coachThreads.distinct(), coachMessages.distinct(),
    )
}
