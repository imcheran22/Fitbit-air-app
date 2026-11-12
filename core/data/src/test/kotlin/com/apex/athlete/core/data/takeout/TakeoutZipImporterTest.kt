package com.apex.athlete.core.data.takeout

import com.apex.athlete.core.domain.MetricType
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
import kotlin.coroutines.coroutineContext
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The engine end to end on small synthetic archives (built in memory; nothing from a real export):
 * what is imported, that a repeat writes nothing, that an interrupted file resumes from its
 * committed rows, and that damaged input is reported rather than fatal.
 */
class TakeoutZipImporterTest {

    private val sink = MemorySink()
    private val marks = MemoryMarks()
    private val replayer = RecordingReplayer()

    private fun engine(batchRows: Int = TakeoutZipImporter.BATCH_ROWS) = importer(sink, marks, replayer, batchRows)

    private fun run(vararg parts: ByteArray, force: Boolean = false, batchRows: Int = TakeoutZipImporter.BATCH_ROWS): TakeoutImportReport =
        runBlocking {
            sink.beginRun()
            engine(batchRows).import(parts.mapIndexed { i, b -> partOf(b, "part-$i.zip") }, force) }

    private fun day(iso: String) = LocalDate.parse(iso).toEpochDay()
    private fun utcMs(y: Int, mo: Int, d: Int, h: Int, mi: Int, s: Int = 0) = LocalDateTime.of(y, mo, d, h, mi, s).toInstant(ZoneOffset.UTC).toEpochMilli()

    /** Classic-layout files without an offset are read as the device's wall clock (New York in these tests). */
    private fun localMs(y: Int, mo: Int, d: Int, h: Int, mi: Int, s: Int = 0) =
        LocalDateTime.of(y, mo, d, h, mi, s).atZone(NEW_YORK).toInstant().toEpochMilli()

    private fun TakeoutImportReport.category(c: TakeoutCategory) = categories.single { it.category == c }
    private fun TakeoutImportReport.file(name: String) = files.single { it.fileKey == name }

    // --- Synthetic archive pieces -----------------------------------------------------------------

    /** Steps for a civil day: one row per 15 local minutes from 00:00, skipping [skip] local clock texts. */
    private fun stepsJson(mmddyy: String, localTimes: List<String>, perRow: Int = 10): String =
        localTimes.joinToString(",", "[", "]") { """{"dateTime":"$mmddyy $it","value":"$perRow"}""" }

    private fun quarterHours(from: String = "00:00", count: Int): List<String> {
        val (h, m) = from.split(':').map { it.toInt() }
        return (0 until count).map { i -> val t = h * 60 + m + i * 15; "%02d:%02d:00".format(t / 60, t % 60) }
    }

    private val springForwardDayTimes: List<String> = quarterHours(count = 8) + quarterHours("03:00", 84) // 92 buckets: 02:00-02:45 does not exist
    private val fallBackDayTimes: List<String> = quarterHours(count = 8) + quarterHours("01:00", 4) + quarterHours("02:00", 88) // 100 buckets: 01:00-01:45 twice

    private fun mainArchive(): ByteArray = zipOf(
        "$HR_PATH" + "2024-11-03.json" to heartRateJson(
            listOf(
                Triple("11/03/24 00:59:50", 60, 2), Triple("11/03/24 01:30:00", 61, 2), Triple("11/03/24 01:59:50", 62, 3),
                Triple("11/03/24 01:00:10", 63, 1), Triple("11/03/24 01:30:00", 64, 0), Triple("11/03/24 02:00:00", 65, 2),
            ),
        ),
        "Takeout/Fitbit/Global Export Data/steps-2024-03-10.json" to stepsJson("03/10/24", springForwardDayTimes),
        "Takeout/Fitbit/Global Export Data/steps-2024-11-03.json" to stepsJson("11/03/24", fallBackDayTimes),
        "Takeout/Fitbit/Global Export Data/steps-2024-03-11.json" to stepsJson("03/11/24", quarterHours(count = 50)), // a partial day
        "Takeout/Fitbit/Global Export Data/sleep-2024-03-10.json" to
            """[{"logId":424242,"startTime":"2024-03-09T23:15:00.000","endTime":"2024-03-10T06:45:00.000","duration":23400000,"mainSleep":true,"minutesAsleep":370,"minutesAwake":20,""" +
            """"levels":{"data":[{"dateTime":"2024-03-09T23:15:00.000","level":"light","seconds":23400}]}}]""",
        "Takeout/Fitbit/Global Export Data/exercise-0.json" to
            """[{"logId":777,"activityName":"Run","startTime":"03/09/24 10:00:00","duration":1800000,"activeDuration":1800000,"averageHeartRate":150,"calories":300.5,"steps":4200}]""",
        "Takeout/Fitbit/Global Export Data/resting_heart_rate-2024-03-10.json" to
            """[{"dateTime":"03/10/24 00:00:00","value":{"date":"03/10/24","value":53.7,"error":1.0}}]""",
        "Takeout/Fitbit/Heart Rate Variability/Daily Heart Rate Variability Summary - 2024-03-10.csv" to "timestamp,rmssd,deep_rmssd\n2024-03-10T00:00:00,41.5,38.2\n",
        "Takeout/Fitbit/Heart Rate Variability/Heart Rate Variability Details - 2024-03-10.csv" to
            "timestamp,rmssd,coverage,low_frequency,high_frequency\n2024-03-10T03:00:00,40.0,1.0,500.0,600.0\n2024-03-10T03:05:00,0,0,0,0\n",
        "Takeout/Fitbit/Oxygen Saturation (SpO2)/Minute SpO2 - 2024-03-10.csv" to "Extra,Value,Timestamp\nx,96.5,2024-03-10T03:00:00\nx,0,2024-03-10T03:01:00\n",
        "Takeout/Fitbit/Temperature/Device Temperature - 2024-03-10.csv" to "recorded_time,temperature,sensor_type\n2024-03-10T03:00:00,0.4,SKIN\n",
        // Personal and unrelated entries: never opened, only counted.
        "Takeout/Jane Doe/Profile/Profile.csv" to "name,birthday\nJane Doe,1990-01-01\n",
        "Takeout/Location History/Records.json" to """{"locations":[{"latitudeE7":1}]}""",
    )

    // --- First import ------------------------------------------------------------------------------

    @Test
    fun importsEveryWhitelistedFileAndIgnoresTheRest() {
        val report = run(mainArchive())

        assertEquals(TakeoutOutcome.COMPLETED, report.outcome)
        assertEquals(2, report.unknownEntries)
        assertFalse(report.layout.toRedactedText().contains("Jane", ignoreCase = true), "a personal folder name must never reach a report")
        assertTrue(report.layout.missingCategories.contains(TakeoutCategory.COMPUTED_TEMPERATURE), "a missing category is 'not in this archive'")
        assertTrue(report.files.all { it.status == TakeoutFileStatus.COMPLETE })

        // Heart rate: six points, one at confidence 0 dropped and counted.
        assertEquals(5, sink.heartRate.size)
        assertEquals(1, report.category(TakeoutCategory.HEART_RATE).droppedLowConfidence)
        assertEquals(setOf(60, 61, 62, 63, 65), sink.heartRate.values.toSet())

        // Daily and sample values arrived under their metrics, nothing from the ignored entries.
        assertEquals(53.7, sink.daily[MetricType.RESTING_HEART_RATE.storageKey to day("2024-03-10")])
        assertEquals(41.5, sink.daily[MetricType.HRV_RMSSD.storageKey to day("2024-03-10")])
        assertEquals(96.5, sink.samples[MetricType.SPO2_AVG.storageKey to localMs(2024, 3, 10, 3, 0)])
        assertEquals(1, sink.samples.keys.count { it.first == MetricType.SPO2_AVG.storageKey }, "a zero reading means no reading")
        assertEquals(0.4, sink.samples[MetricType.SKIN_TEMP_DEVIATION.storageKey to localMs(2024, 3, 10, 3, 0)])
        assertEquals(1, sink.workouts.size)
        assertEquals(1, sink.sleeps.size)
        assertEquals(1, report.category(TakeoutCategory.HRV_DETAILS).droppedLowConfidence + report.category(TakeoutCategory.HRV_DETAILS).droppedEmpty)

        // Date range covers the data and the replay starts at the earliest changed day.
        assertEquals(day("2024-03-09"), report.dataFirstEpochDay)
        assertEquals(day("2024-11-03"), report.dataLastEpochDay)
        assertEquals(listOf(day("2024-03-09")), replayer.calls)
        assertEquals(day("2024-03-09"), report.earliestModifiedEpochDay)
        assertEquals(3, report.recomputedDays)

        // The category watermark is the latest dated file imported and only the signal of that file.
        assertEquals(day("2024-11-03"), marks.categoryDays[TakeoutCategory.HEART_RATE])
        assertEquals(day("2024-11-03"), marks.categoryDays[TakeoutCategory.STEPS])
    }

    @Test
    fun heartRateOnTheRepeatedHourDayKeepsBothPasses() {
        run(mainArchive())
        val first = utcMs(2024, 11, 3, 5, 30) // 01:30 EDT
        val second = utcMs(2024, 11, 3, 6, 30) // 01:30 EST: the confidence-0 point, dropped
        assertEquals(61, sink.heartRate[first])
        assertNull(sink.heartRate[second])
        assertEquals(63, sink.heartRate[utcMs(2024, 11, 3, 6, 0, 10)], "the second pass of 01:00 is an hour after the first")
    }

    @Test
    fun stepDayTotalsAreWrittenOnlyForDaysWhoseEveryBucketIsStored() {
        val report = run(mainArchive())
        // 2024-03-10 has 23 hours (92 buckets), 2024-11-03 has 25 hours (100 buckets); 2024-03-11 has 50 of 96.
        assertEquals(920.0, sink.daily[MetricType.STEPS.storageKey to day("2024-03-10")])
        assertEquals(1000.0, sink.daily[MetricType.STEPS.storageKey to day("2024-11-03")])
        assertNull(sink.daily[MetricType.STEPS.storageKey to day("2024-03-11")], "a partial day is never presented as the day's steps")
        assertEquals(2, report.stepDayTotalsWritten)
    }

    @Test
    fun theWrittenNightCrossingMidnightAndTheClockChangeKeepsItsRealLength() {
        run(mainArchive())
        val s = sink.sleeps.values.single()
        assertEquals(23_400_000L, s.endEpochMillis - s.startEpochMillis)
        assertEquals(-5 * 3600, s.startZoneOffsetSeconds)
        assertEquals(-4 * 3600, s.endZoneOffsetSeconds)
    }

    @Test
    fun theReportCarriesCountsAndNamesButNoValuesAndNoPersonalNames() {
        val report = run(mainArchive())
        val text = Json.encodeToString(report) + report.toString() + report.layout.toRedactedText()
        for (secret in listOf("53.7", "41.5", "96.5", "Jane", "Doe", "birthday")) {
            assertFalse(text.contains(secret), "report leaked '$secret'")
        }
    }

    // --- Repeat, change, force ---------------------------------------------------------------------

    @Test
    fun aRepeatedImportWritesNothingAndChangesNothing() {
        val archive = mainArchive()
        run(archive)
        val before = sink.snapshot()
        val callsBefore = sink.writeCalls
        val marksBefore = marks.marks.toMap()
        replayer.calls.clear()

        val again = run(archive)

        assertEquals(TakeoutOutcome.NOTHING_NEW, again.outcome)
        assertEquals(callsBefore, sink.writeCalls, "not one batch may be sent")
        assertEquals(before, sink.snapshot())
        assertEquals(0, again.filesImported)
        assertEquals(0L, again.rowsImported)
        assertEquals(marksBefore, marks.marks.toMap(), "marks are untouched")
        assertTrue(replayer.calls.isEmpty(), "nothing changed, nothing to recompute")
        assertTrue(again.files.isEmpty())
        assertEquals(again.layout.recognisedEntries, again.filesSkipped)
    }

    @Test
    fun aRevisedDayIsImportedAgainAndOnlyThatDay() {
        val name = "$HR_PATH" + "2024-06-10.json"
        val v1 = zipOf(name to heartRateJson(clockTexts("06/10/24", 10).map { Triple(it, 60, 2) }), "$HR_PATH" + "2024-06-11.json" to heartRateJson(clockTexts("06/11/24", 5).map { Triple(it, 70, 2) }))
        run(v1)
        val v2 = zipOf(name to heartRateJson(clockTexts("06/10/24", 15).map { Triple(it, 60, 2) }), "$HR_PATH" + "2024-06-11.json" to heartRateJson(clockTexts("06/11/24", 5).map { Triple(it, 70, 2) }))
        replayer.calls.clear()
        val report = run(v2)

        assertEquals(TakeoutFileDecision.IMPORT_CHANGED, report.file("heart_rate-2024-06-10.json").decision)
        assertEquals(1, report.filesImported)
        assertEquals(1, report.filesSkipped)
        assertEquals(20, sink.heartRate.size, "10 earlier rows are overwritten, 5 are new, none duplicated")
        assertEquals(listOf(day("2024-06-10")), replayer.calls)
    }

    @Test
    fun anOlderSmallerExportOfTheSameDayNeverReplacesTheFullerData() {
        val name = "$HR_PATH" + "2024-06-10.json"
        run(zipOf(name to heartRateJson(clockTexts("06/10/24", 15).map { Triple(it, 60, 2) })))
        val before = sink.snapshot()
        val report = run(zipOf(name to heartRateJson(clockTexts("06/10/24", 10).map { Triple(it, 60, 2) })))
        assertEquals(before, sink.snapshot())
        assertEquals(TakeoutOutcome.NOTHING_NEW, report.outcome)
    }

    @Test
    fun forceReimportReadsEverythingAgainToTheSameState() {
        val archive = mainArchive()
        run(archive)
        val before = sink.snapshot()
        val callsBefore = sink.writeCalls

        val report = run(archive, force = true)

        assertTrue(sink.writeCalls > callsBefore)
        assertEquals(before, sink.snapshot(), "force changes how much is read, never what the result is")
        assertEquals(report.layout.recognisedEntries, report.filesImported)
        assertTrue(report.forced)
        assertTrue(report.files.all { it.decision == TakeoutFileDecision.IMPORT_FORCED })
    }

    @Test
    fun theSameFilePickedTwiceIsImportedOnceFromTheLargestCopy() {
        val name = "$HR_PATH" + "2024-06-10.json"
        val small = zipOf(name to heartRateJson(clockTexts("06/10/24", 5).map { Triple(it, 60, 2) }))
        val large = zipOf(name to heartRateJson(clockTexts("06/10/24", 9).map { Triple(it, 60, 2) }))
        val report = run(small, large)
        assertEquals(9, sink.heartRate.size)
        assertEquals(1, report.filesImported)
        assertEquals(2, report.layout.parts.size)
    }

    @Test
    fun anArchiveSplitAcrossPartsIsImportedAsOne() {
        val a = zipOf("$HR_PATH" + "2024-06-10.json" to heartRateJson(clockTexts("06/10/24", 5).map { Triple(it, 60, 2) }))
        val b = zipOf("$HR_PATH" + "2024-06-11.json" to heartRateJson(clockTexts("06/11/24", 6).map { Triple(it, 61, 2) }))
        val report = run(a, b)
        assertEquals(11, sink.heartRate.size)
        assertEquals(2, report.filesImported)
        assertEquals(listOf(TakeoutPartStatus.OK, TakeoutPartStatus.OK), report.layout.parts.map { it.status })
    }

    // --- Cancel and resume -------------------------------------------------------------------------

    private val bigDay = heartRateJson(clockTexts("06/10/24", 1_200).map { Triple(it, 60 + it.takeLast(5).take(2).toInt() % 30, 2) })
    private val bigArchive get() = zipOf("$HR_PATH" + "2024-06-10.json" to bigDay)
    private val bigKey = "heart_rate-2024-06-10.json"

    private fun reference(): String {
        val s = MemorySink()
        runBlocking { importer(s, MemoryMarks(), RecordingReplayer(), 200).import(listOf(partOf(bigArchive))) }
        return s.snapshot()
    }

    @Test
    fun cancelledInTheMiddleOfAFileThenResumedSendsOnlyTheUncommittedRowsAndEndsInTheSameState() {
        val expected = reference()
        runBlocking {
            val job: Job = launch {
                sink.afterApply = { call -> if (call == 3) coroutineContext[Job]!!.cancel() }
                engine(200).import(listOf(partOf(bigArchive)))
            }
            job.join()
            assertTrue(job.isCancelled)
        }
        val committed = sink.batchSizes.sum().toLong()
        assertEquals(3, sink.writeCalls)
        val mark = assertNotNull(marks.marks[TakeoutCategory.HEART_RATE to bigKey])
        assertFalse(mark.complete, "an interrupted file is never marked complete")
        assertEquals(committed, mark.committedRows, "the mark moved forward after each committed batch, to exactly what is stored")
        assertTrue(mark.replayPending)
        assertTrue(replayer.calls.isEmpty(), "no recomputation on a cancelled run")
        assertNull(marks.categoryDays[TakeoutCategory.HEART_RATE], "the category date moves only when a file completes")

        sink.afterApply = {}
        val deliveredBefore = sink.rowsDelivered
        val report = run(bigArchive, batchRows = 200)

        val file = report.file(bigKey)
        assertEquals(TakeoutFileDecision.IMPORT_RESUME, file.decision)
        assertEquals(TakeoutFileStatus.COMPLETE, file.status)
        assertEquals(committed, file.rowsAlreadyCommitted)
        assertEquals(1_200L - committed, sink.rowsDelivered - deliveredBefore, "rows committed before the interruption are not sent again")
        assertEquals(expected, sink.snapshot())
        assertEquals(1_200, sink.heartRate.size)
        assertTrue(marks.marks.getValue(TakeoutCategory.HEART_RATE to bigKey).complete)
        assertEquals(1_200L, marks.marks.getValue(TakeoutCategory.HEART_RATE to bigKey).committedRows)
        assertEquals(listOf(day("2024-06-10")), replayer.calls, "the recomputation the cancelled run owed is done by the resumed run")
        assertTrue(marks.marks.values.none { it.replayPending })
    }

    @Test
    fun processDeathBetweenACommitAndItsMarkRewritesThatBatchHarmlessly() {
        val expected = reference()
        sink.afterApply = { call -> if (call == 3) throw IllegalStateException("process killed") }
        assertFailsWith<IllegalStateException> { run(bigArchive, batchRows = 200) }
        // Three batches are stored, but the mark only knows about two.
        val mark = assertNotNull(marks.marks[TakeoutCategory.HEART_RATE to bigKey])
        assertEquals(sink.batchSizes.take(2).sum().toLong(), mark.committedRows)
        assertTrue(sink.batchSizes.take(3).sum() > mark.committedRows)

        sink.afterApply = {}
        val deliveredBefore = sink.rowsDelivered
        val report = run(bigArchive, batchRows = 200)
        assertEquals(TakeoutFileDecision.IMPORT_RESUME, report.file(bigKey).decision)
        assertEquals(1_200L - mark.committedRows, sink.rowsDelivered - deliveredBefore, "resumes from the mark, so the unmarked batch is sent again")
        assertEquals(expected, sink.snapshot(), "idempotent keys: the batch written twice changes nothing")
        assertEquals(1_200, sink.heartRate.size)
    }

    @Test
    fun aFileChangedAfterAnInterruptionStartsOverInsteadOfResuming() {
        sink.afterApply = { call -> if (call == 2) throw IllegalStateException("killed") }
        assertFailsWith<IllegalStateException> { run(bigArchive, batchRows = 200) }
        sink.afterApply = {}
        val revised = zipOf("$HR_PATH" + "2024-06-10.json" to heartRateJson(clockTexts("06/10/24", 1_300).map { Triple(it, 66, 2) }))
        val report = run(revised, batchRows = 200)
        assertEquals(TakeoutFileDecision.IMPORT_CHANGED, report.file(bigKey).decision)
        assertEquals(0L, report.file(bigKey).rowsAlreadyCommitted)
        assertEquals(1_300, sink.heartRate.size)
        assertTrue(sink.heartRate.values.all { it == 66 } || sink.heartRate.size == 1_300)
    }

    @Test
    fun cancelledWithAnOwedRecomputationKeepsTheDebtAcrossMoreThanOneRun() {
        sink.afterApply = { call -> if (call == 2) coroutineContext[Job]!!.let { it.cancel() } }
        runBlocking { launch { engine(200).import(listOf(partOf(bigArchive))) }.join() }
        assertNotNull(pending())
        // A second interruption before the file completes still keeps the debt.
        val firstOfThisRun = sink.writeCalls + 1
        sink.afterApply = { call -> if (call == firstOfThisRun) throw IllegalStateException("killed again") }
        assertFailsWith<IllegalStateException> { run(bigArchive, batchRows = 200) }
        assertEquals(day("2024-06-10"), pending())
        sink.afterApply = {}
        run(bigArchive, batchRows = 200)
        assertEquals(listOf(day("2024-06-10")), replayer.calls)
        assertNull(pending())
    }

    @Test
    fun aResumedStepsFileStillWritesTheDayTotalsOfTheRowsItPassedOver() {
        // Two civil days in one file: 23 h (92 buckets) then 24 h (96 buckets). The first batch holds day one only.
        val times = springForwardDayTimes.map { "03/10/24 $it" } + quarterHours(count = 96).map { "03/11/24 $it" }
        val json = times.joinToString(",", "[", "]") { """{"dateTime":"$it","value":"10"}""" }
        val archive = zipOf("Takeout/Fitbit/Global Export Data/steps-2024-03-10.json" to json)
        sink.afterApply = { call -> if (call == 1) coroutineContext[Job]!!.cancel() }
        runBlocking { launch { engine(92).import(listOf(partOf(archive))) }.join() }
        assertNull(sink.daily[MetricType.STEPS.storageKey to day("2024-03-10")], "no total while the run is interrupted")
        sink.afterApply = {}

        val report = run(archive, batchRows = 92)

        assertEquals(92L, report.file("steps-2024-03-10.json").rowsAlreadyCommitted)
        assertEquals(920.0, sink.daily[MetricType.STEPS.storageKey to day("2024-03-10")], "day one was committed by the interrupted run")
        assertEquals(960.0, sink.daily[MetricType.STEPS.storageKey to day("2024-03-11")])
        assertEquals(2, report.stepDayTotalsWritten)
    }

    // --- Replay ------------------------------------------------------------------------------------

    @Test
    fun recomputationStartsAfterEveryWriteAndAtTheEarliestChangedDay() {
        val events = ArrayList<String>()
        sink.afterApply = { events += "write" }
        val spy = object : TakeoutReplayer {
            override suspend fun replay(fromDay: Long, onProgress: suspend (Int, Int) -> Unit): Int {
                events += "replay:$fromDay"
                return 1
            }
        }
        val a = zipOf(
            "$HR_PATH" + "2024-06-12.json" to heartRateJson(clockTexts("06/12/24", 3).map { Triple(it, 60, 2) }),
            "$HR_PATH" + "2024-06-10.json" to heartRateJson(clockTexts("06/10/24", 3).map { Triple(it, 60, 2) }),
        )
        runBlocking { TakeoutZipImporter(sink, marks, spy, config(), nowMillis = { NOW_MS }).import(listOf(partOf(a))) }
        assertEquals("replay:${day("2024-06-10")}", events.last())
        assertEquals(1, events.count { it.startsWith("replay") })
        assertTrue(events.dropLast(1).all { it == "write" })
    }

    // --- Damaged and unexpected input --------------------------------------------------------------

    @Test
    fun malformedJsonMidStreamKeepsTheRowsBeforeItAndTheOtherFilesStillImport() {
        val broken = """[{"dateTime":"06/10/24 10:00:00","value":{"bpm":60,"confidence":2}},""" +
            """{"dateTime":"06/10/24 10:01:00","value":{"bpm":61,"confidence":2}},""" +
            """{"dateTime":"06/10/24 10:02:00","value":{"bpm":6"""
        val report = run(
            zipOf(
                "$HR_PATH" + "2024-06-10.json" to broken,
                "$HR_PATH" + "2024-06-11.json" to heartRateJson(clockTexts("06/11/24", 4).map { Triple(it, 70, 2) }),
            ),
        )
        assertEquals(TakeoutFileStatus.MALFORMED, report.file("heart_rate-2024-06-10.json").status)
        assertEquals(TakeoutFileStatus.COMPLETE, report.file("heart_rate-2024-06-11.json").status)
        assertEquals(6, sink.heartRate.size)
        assertTrue(report.hasWarnings)
        assertEquals(TakeoutOutcome.COMPLETED, report.outcome)
        // The damaged bytes are final: the same file is not read again.
        assertEquals(TakeoutOutcome.NOTHING_NEW, run(zipOf("$HR_PATH" + "2024-06-10.json" to broken)).outcome)
    }

    @Test
    fun badRowsAreQuarantinedAndCountedAndNeverStored() {
        val json = """[
            {"dateTime":"06/10/24 10:00:00","value":{"bpm":60,"confidence":2}},
            {"dateTime":"not a time","value":{"bpm":61,"confidence":2}},
            {"dateTime":"06/10/24 10:02:00","value":{"bpm":"abc","confidence":2}},
            "stray string",
            {"dateTime":"06/10/24 10:04:00","value":{"bpm":64,"confidence":0}},
            {"dateTime":"06/10/24 10:05:00","value":{"bpm":65,"confidence":3}}
        ]"""
        val report = run(zipOf("$HR_PATH" + "2024-06-10.json" to json))
        val file = report.file("heart_rate-2024-06-10.json")
        assertEquals(3, file.quarantined)
        assertEquals(1, file.droppedLowConfidence)
        assertEquals(2, file.rowsCommitted)
        assertEquals(2, sink.heartRate.size)
        assertEquals(TakeoutFileStatus.COMPLETE, file.status)
    }

    @Test
    fun csvColumnsAreFoundByNameInAnyOrderAndBadRowsAreQuarantined() {
        val csv = "﻿Value;extra;TIMESTAMP\n" + // BOM, semicolon delimiter, shuffled and upper-case headers
            "96,5;x;2024-06-10T03:00:00\n" +
            "oops;x;2024-06-10T03:01:00\n" +
            "97;x;garbage\n" +
            "\n" +
            "95,0;x;2024-06-10T03:02:00\n"
        val report = run(zipOf("Takeout/Fitbit/Oxygen Saturation (SpO2)/Minute SpO2 - 2024-06-10.csv" to csv))
        val file = report.file("minute spo2 - 2024-06-10.csv")
        assertEquals(2, file.rowsCommitted)
        assertEquals(2, file.quarantined)
        assertEquals(96.5, sink.samples[MetricType.SPO2_AVG.storageKey to localMs(2024, 6, 10, 3, 0)])
    }

    @Test
    fun aFileWithTheWrongShapeIsReportedAndNotMarkedImported() {
        val report = run(
            zipOf(
                "Takeout/Fitbit/Oxygen Saturation (SpO2)/Minute SpO2 - 2024-06-10.csv" to "foo,bar\n1,2\n",
                "$HR_PATH" + "2024-06-10.json" to """{"not":"an array"}""",
            ),
        )
        assertTrue(report.files.all { it.status == TakeoutFileStatus.SCHEMA_MISMATCH })
        assertEquals(0, sink.totalRows)
        assertTrue(marks.marks.isEmpty(), "a file this version cannot read is not recorded, so a later version reads it")
        assertEquals(TakeoutOutcome.COMPLETED, report.outcome)
    }

    @Test
    fun aTruncatedZipKeepsTheCompleteEntriesBeforeTheDamage() {
        val rows = (0 until 3_000).map { Triple("06/11/24 %02d:%02d:%02d".format(it / 3600, (it / 60) % 60, it % 60), 55 + (it * 7919) % 40, 2) }
        val whole = zipOf(
            "$HR_PATH" + "2024-06-10.json" to heartRateJson(clockTexts("06/10/24", 20).map { Triple(it, 60, 2) }),
            "$HR_PATH" + "2024-06-11.json" to heartRateJson(rows),
        )
        val secondHeader = indexOfSecondLocalHeader(whole)
        val truncated = whole.copyOf(secondHeader + 200) // inside the second entry's data

        val report = run(truncated)

        assertEquals(TakeoutPartStatus.TRUNCATED, report.layout.parts.single().status)
        assertEquals(TakeoutFileStatus.COMPLETE, report.file("heart_rate-2024-06-10.json").status)
        assertEquals(20, sink.heartRate.size, "the entry before the damage is imported; the damaged one is not guessed at")
        assertTrue(report.hasWarnings)
        assertTrue(marks.marks.keys.none { it.second.endsWith("06-11.json") }, "the damaged file stays unimported for a later, complete archive")
    }

    @Test
    fun aFileThatIsNotAZipOrIsAGzipIsReportedNotThrown() {
        val notZip = run("this is not an archive".toByteArray())
        assertEquals(TakeoutOutcome.NOT_AN_ARCHIVE, notZip.outcome)
        assertEquals(TakeoutPartStatus.NOT_A_ZIP, notZip.layout.parts.single().status)
        val gzip = run(byteArrayOf(0x1f, 0x8b.toByte(), 8, 0, 0, 0, 0, 0))
        assertEquals(TakeoutPartStatus.UNSUPPORTED_TGZ, gzip.layout.parts.single().status)
        assertEquals(0, sink.writeCalls)
    }

    @Test
    fun anArchiveWithNothingWeReadIsNotAnError() {
        val report = run(zipOf("Takeout/Fitbit/Profile/Profile.csv" to "a,b\n1,2\n"))
        assertEquals(TakeoutOutcome.NO_RECOGNISED_FILES, report.outcome)
        assertEquals(TakeoutCategory.entries.toSet(), report.layout.missingCategories.toSet())
    }

    @Test
    fun entryPathsAreOnlyMatchedAndNeverWrittenAnywhere() {
        // A hostile path is matched by its file name alone; the engine has no code that opens a file.
        val route = assertNotNull(TakeoutEntryRouter.route("../../etc/heart_rate-2024-06-10.json"))
        assertEquals("heart_rate-2024-06-10.json", route.fileKey)
        assertNull(TakeoutEntryRouter.route("Takeout/Fitbit/heart_rate-2024-13-45.json"))
        assertNull(TakeoutEntryRouter.route("Takeout/Fitbit/.heart_rate-2024-06-10.json"))
        assertNull(TakeoutEntryRouter.route("Takeout/Fitbit/heart_rate-2024-06-10.json.bak"))
    }

    @Test
    fun batchesNeverExceedTheConfiguredBound() {
        run(zipOf("$HR_PATH" + "2024-06-10.json" to heartRateJson(clockTexts("06/10/24", 1_200).map { Triple(it, 60, 2) })), batchRows = 100)
        assertTrue(sink.batchSizes.isNotEmpty() && sink.batchSizes.all { it in 1..100 }, "batches: ${sink.batchSizes.maxOrNull()}")
        assertFailsWith<IllegalArgumentException> { importer(sink, marks, replayer, batchRows = TakeoutZipImporter.BATCH_ROWS + 1) }
    }

    private fun pending(): Long? = runBlocking { marks.pendingReplayFromDay() }

    // --- helpers -----------------------------------------------------------------------------------

    private fun indexOfSecondLocalHeader(zip: ByteArray): Int {
        var seen = 0
        for (i in 0 until zip.size - 3) {
            if (zip[i] == 'P'.code.toByte() && zip[i + 1] == 'K'.code.toByte() && zip[i + 2] == 3.toByte() && zip[i + 3] == 4.toByte()) {
                if (++seen == 2) return i
            }
        }
        error("no second entry")
    }

    @Suppress("unused")
    private fun unusedCancellation(): CancellationException = CancellationException()
}
