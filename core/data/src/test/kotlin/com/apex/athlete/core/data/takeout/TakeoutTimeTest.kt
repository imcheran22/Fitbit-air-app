package com.apex.athlete.core.data.takeout

import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.takeout.parsers.TakeoutParsers
import com.apex.athlete.core.data.takeout.parsers.TakeoutRowBuffer
import com.apex.athlete.core.domain.SleepStage
import java.io.ByteArrayInputStream
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Time is the part of this engine that goes wrong silently. These tests pin the three hard cases
 * with real zone rules (America/New_York 2024): the day clocks go forward (a nonexistent hour), the
 * day they go back (a repeated hour), and a night of sleep that crosses midnight and a clock change.
 * Expected instants come from `java.time`, not from hand arithmetic.
 */
class TakeoutTimeTest {

    private fun utc(y: Int, mo: Int, d: Int, h: Int, mi: Int, s: Int = 0) =
        LocalDateTime.of(y, mo, d, h, mi, s).toInstant(ZoneOffset.UTC).toEpochMilli()

    private fun parseAll(path: String, content: String, time: TakeoutTimeConfig = config()): TakeoutRowBuffer {
        val route = assertNotNull(TakeoutEntryRouter.route(path))
        val parser = TakeoutParsers.open(route, ByteArrayInputStream(content.toByteArray()), time)
        val out = TakeoutRowBuffer()
        while (parser.readInto(out, 100_000)) Unit
        return out
    }

    // --- Repeated hour (clocks go back, 2024-11-03 at 02:00 EDT) -----------------------------------

    @Test
    fun repeatedHourKeepsTheSecondPassAfterTheFirst() {
        val rows = listOf(
            Triple("11/03/24 00:59:50", 60, 2), // EDT
            Triple("11/03/24 01:30:00", 61, 2), // first pass, EDT
            Triple("11/03/24 01:59:50", 62, 2), // first pass, EDT
            Triple("11/03/24 01:00:10", 63, 2), // time runs backwards: second pass, EST
            Triple("11/03/24 01:30:00", 64, 2), // second pass, EST
            Triple("11/03/24 02:00:00", 65, 2), // unambiguous EST
        )
        val out = parseAll("${HR_PATH}2024-11-03.json", heartRateJson(rows))
        assertEquals(
            listOf(
                utc(2024, 11, 3, 4, 59, 50), utc(2024, 11, 3, 5, 30), utc(2024, 11, 3, 5, 59, 50),
                utc(2024, 11, 3, 6, 0, 10), utc(2024, 11, 3, 6, 30), utc(2024, 11, 3, 7, 0),
            ),
            out.heartRate.map { it.epochMillis },
        )
        assertTrue(out.heartRate.zipWithNext().all { (a, b) -> b.epochMillis > a.epochMillis }, "no instant may repeat or run backwards")
    }

    // --- Nonexistent hour (clocks go forward, 2024-03-10 at 02:00 EST) -----------------------------

    @Test
    fun skippedHourMovesForwardByTheGapAndNeverThrows() {
        val rows = listOf(
            Triple("03/10/24 01:59:50", 60, 2), // EST
            Triple("03/10/24 02:30:00", 61, 2), // does not exist
            Triple("03/10/24 03:00:10", 62, 2), // EDT
        )
        val out = parseAll("${HR_PATH}2024-03-10.json", heartRateJson(rows))
        val zone = ZoneId.of("America/New_York")
        assertEquals(utc(2024, 3, 10, 6, 59, 50), out.heartRate[0].epochMillis)
        // 02:30 read with the offset before the change is 03:30 EDT.
        assertEquals(ZonedDateTime.of(2024, 3, 10, 3, 30, 0, 0, zone).toInstant().toEpochMilli(), out.heartRate[1].epochMillis)
        assertEquals(ZonedDateTime.of(2024, 3, 10, 3, 0, 10, 0, zone).toInstant().toEpochMilli(), out.heartRate[2].epochMillis)
    }

    @Test
    fun anOffsetWrittenInTheTimestampBeatsTheZoneRule() {
        val clock = TakeoutClock(ZoneRule.DEVICE_LOCAL, ZoneId.of("America/New_York"))
        val withOffset = assertNotNull(TakeoutTimestamps.parse("2024-11-03T01:30:00-05:00"))
        assertEquals(utc(2024, 11, 3, 6, 30), clock.toEpochMillis(withOffset))
        val zulu = assertNotNull(TakeoutTimestamps.parse("2024-11-03T01:30:00Z"))
        assertEquals(utc(2024, 11, 3, 1, 30), clock.toEpochMillis(zulu))
        assertEquals(0L, clock.ruleApplied, "neither timestamp depended on the zone rule")
    }

    @Test
    fun googleLayoutTimestampsWithoutOffsetAreUtc() {
        val out = parseAll("heart_rate_2024-03-10.csv", "timestamp,beats per minute\n2024-03-10T06:59:50,60\n2024-03-10T07:00:10,61\n")
        assertEquals(listOf(utc(2024, 3, 10, 6, 59, 50), utc(2024, 3, 10, 7, 0, 10)), out.heartRate.map { it.epochMillis })
    }

    @Test
    fun dailyLabelsAreReadLiterallyWhateverTheZone() {
        // A daily value labelled 2024-03-10 stays on 2024-03-10 for an owner far east or west of UTC.
        for (zone in listOf("Pacific/Auckland", "Pacific/Honolulu")) {
            val out = parseAll(
                "Heart Rate Variability/Daily Heart Rate Variability Summary - 2024-03-10.csv",
                "timestamp,rmssd\n2024-03-10T00:00:00,41.5\n",
                config(ZoneId.of(zone)),
            )
            assertEquals(java.time.LocalDate.of(2024, 3, 10).toEpochDay(), out.daily.single().epochDay)
        }
    }

    // --- Sleep -------------------------------------------------------------------------------------

    private fun sleepJson(start: String, end: String, durationMs: Long, vararg segments: Triple<String, String, Int>, short: List<Triple<String, String, Int>> = emptyList()): String {
        fun seg(list: List<Triple<String, String, Int>>) = list.joinToString(",") { (t, l, s) -> """{"dateTime":"$t","level":"$l","seconds":$s}""" }
        return """[{"logId":424242,"startTime":"$start","endTime":"$end","duration":$durationMs,"mainSleep":true,""" +
            """"levels":{"data":[${seg(segments.toList())}],"shortData":[${seg(short)}]}}]"""
    }

    private fun sleepOf(content: String, day: String = "2024-03-10", time: TakeoutTimeConfig = config()): SleepObservation =
        parseAll("Global Export Data/sleep-$day.json", content, time).sleeps.single()

    @Test
    fun midnightSleepIsOneSessionDatedByWakeUpAndKeepsItsStagesInOrder() {
        // 2024-06-10 23:00 to 2024-06-11 07:00, no clock change.
        val json = sleepJson(
            "2024-06-10T23:00:00.000", "2024-06-11T07:00:00.000", 8 * 3_600_000L,
            Triple("2024-06-10T23:00:00.000", "light", 3_600), // ends at 00:00: exactly midnight
            Triple("2024-06-11T00:00:00.000", "deep", 7_200),
            Triple("2024-06-11T02:00:00.000", "rem", 5_400),
            Triple("2024-06-11T03:30:00.000", "light", 12_600),
        )
        val s = sleepOf(json, "2024-06-11")
        val zone = ZoneId.of("America/New_York")
        assertEquals(ZonedDateTime.of(2024, 6, 10, 23, 0, 0, 0, zone).toInstant().toEpochMilli(), s.startEpochMillis)
        assertEquals(ZonedDateTime.of(2024, 6, 11, 7, 0, 0, 0, zone).toInstant().toEpochMilli(), s.endEpochMillis)
        assertEquals(-4 * 3600, s.startZoneOffsetSeconds)
        assertEquals(-4 * 3600, s.endZoneOffsetSeconds)
        assertContiguous(s)
        // The civil day is the wake-up date, derived from the end instant and its own offset.
        val day = java.time.Instant.ofEpochMilli(s.endEpochMillis).atOffset(ZoneOffset.ofTotalSeconds(s.endZoneOffsetSeconds)).toLocalDate()
        assertEquals(java.time.LocalDate.of(2024, 6, 11), day)
    }

    @Test
    fun nightAcrossTheSpringForwardGapIsSixAndAHalfHoursNotSevenAndAHalf() {
        // 2024-03-09 23:15 EST to 2024-03-10 06:45 EDT; the log's own duration is 6.5 h.
        val json = sleepJson(
            "2024-03-09T23:15:00.000", "2024-03-10T06:45:00.000", 23_400_000L,
            Triple("2024-03-09T23:15:00.000", "light", 7_200),
            Triple("2024-03-10T01:15:00.000", "deep", 3_600),
            Triple("2024-03-10T03:15:00.000", "rem", 5_400), // 02:15 never existed on the wall clock
            Triple("2024-03-10T04:45:00.000", "light", 7_200),
        )
        val s = sleepOf(json)
        assertEquals(23_400_000L, s.endEpochMillis - s.startEpochMillis)
        assertEquals(-5 * 3600, s.startZoneOffsetSeconds)
        assertEquals(-4 * 3600, s.endZoneOffsetSeconds)
        assertContiguous(s)
        assertEquals(listOf(SleepStage.LIGHT, SleepStage.DEEP, SleepStage.REM, SleepStage.LIGHT), s.stages.map { it.stage })
    }

    @Test
    fun nightAcrossTheRepeatedHourIsNineHoursAndTheStageInsideTheFoldStaysInOrder() {
        // 2024-11-02 23:30 EDT to 2024-11-03 07:30 EST: nine real hours.
        val json = sleepJson(
            "2024-11-02T23:30:00.000", "2024-11-03T07:30:00.000", 32_400_000L,
            Triple("2024-11-02T23:30:00.000", "light", 7_200), // until 01:30 EDT
            Triple("2024-11-03T01:30:00.000", "deep", 7_200), // ambiguous label: must be the first pass
            Triple("2024-11-03T02:30:00.000", "rem", 7_200), // EST
            Triple("2024-11-03T04:30:00.000", "light", 10_800),
        )
        val s = sleepOf(json, "2024-11-03")
        assertEquals(32_400_000L, s.endEpochMillis - s.startEpochMillis)
        assertEquals(-4 * 3600, s.startZoneOffsetSeconds)
        assertEquals(-5 * 3600, s.endZoneOffsetSeconds)
        assertContiguous(s)
        assertEquals(utc(2024, 11, 3, 5, 30), s.stages[1].startEpochMillis, "the deep segment starts in the first 01:30")
    }

    @Test
    fun ambiguousStartIsResolvedByTheLogsOwnDuration() {
        // 01:30 happens twice; only the second pass (EST) gives the two hours the log states.
        val json = sleepJson("2024-11-03T01:30:00.000", "2024-11-03T03:30:00.000", 7_200_000L)
        val s = sleepOf(json, "2024-11-03")
        assertEquals(utc(2024, 11, 3, 6, 30), s.startEpochMillis)
        assertEquals(utc(2024, 11, 3, 8, 30), s.endEpochMillis)
    }

    @Test
    fun shortAwakeningsAreCutOutOfTheStageUnderneath() {
        val json = sleepJson(
            "2024-06-10T23:00:00.000", "2024-06-11T00:00:00.000", 3_600_000L,
            Triple("2024-06-10T23:00:00.000", "light", 3_600),
            short = listOf(Triple("2024-06-10T23:30:00.000", "wake", 120)),
        )
        val s = sleepOf(json, "2024-06-11")
        assertEquals(listOf(SleepStage.LIGHT, SleepStage.AWAKE, SleepStage.LIGHT), s.stages.map { it.stage })
        assertEquals(120_000L, s.stages[1].endEpochMillis - s.stages[1].startEpochMillis)
        assertContiguous(s)
    }

    private fun assertContiguous(s: SleepObservation) {
        assertEquals(s.startEpochMillis, s.stages.first().startEpochMillis, "first stage starts with the session")
        assertEquals(s.endEpochMillis, s.stages.last().endEpochMillis, "last stage ends with the session")
        s.stages.zipWithNext().forEach { (a, b) -> assertEquals(a.endEpochMillis, b.startEpochMillis, "stages leave no gap and do not overlap") }
    }
}
