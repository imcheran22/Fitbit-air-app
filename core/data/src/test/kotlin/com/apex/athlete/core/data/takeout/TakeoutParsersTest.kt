package com.apex.athlete.core.data.takeout

import com.apex.athlete.core.data.takeout.parsers.CsvStreamParser
import com.apex.athlete.core.data.takeout.parsers.JsonTokenReader
import com.apex.athlete.core.data.takeout.parsers.MalformedJsonException
import com.apex.athlete.core.data.takeout.parsers.TakeoutEntryParser
import com.apex.athlete.core.data.takeout.parsers.TakeoutParsers
import com.apex.athlete.core.data.takeout.parsers.TakeoutRowBuffer
import com.apex.athlete.core.domain.MetricType
import java.io.ByteArrayInputStream
import java.io.StringReader
import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TakeoutParsersTest {

    private fun parse(path: String, content: String, zone: ZoneId = NEW_YORK): Pair<TakeoutRowBuffer, TakeoutEntryParser> {
        val route = assertNotNull(TakeoutEntryRouter.route(path), path)
        val parser = TakeoutParsers.open(route, ByteArrayInputStream(content.toByteArray()), config(zone))
        val out = TakeoutRowBuffer()
        while (parser.readInto(out, 1_000_000)) Unit
        return out to parser
    }

    // --- CSV ---------------------------------------------------------------------------------------

    @Test
    fun csvFollowsRfc4180AndToleratesBomCrlfAndBlankLines() {
        val text = "\uFEFFTimestamp,Note,Value\r\n2024-01-01T00:00:00,\"a, \"\"quoted\"\" note\nwith a line break\",1.5\r\n\r\n2024-01-01T00:01:00,plain,2\r\n"
        val csv = CsvStreamParser(StringReader(text))
        assertEquals(listOf("timestamp", "note", "value"), csv.header)
        assertTrue(csv.next())
        assertEquals("a, \"quoted\" note\nwith a line break", csv.get(csv.column("note")))
        assertEquals("1.5", csv.get(csv.column("value")))
        assertTrue(csv.next())
        assertEquals("2", csv.get(csv.column("value")))
        assertFalse(csv.next())
    }

    @Test
    fun csvHeaderNamesAreFoldedAndUnknownColumnsIgnored() {
        assertEquals("daily_spo2", CsvStreamParser.normalise(" Daily SpO2 (%) "))
        assertEquals("beats_per_minute", CsvStreamParser.normalise("Beats Per Minute"))
        val csv = CsvStreamParser(StringReader("Z Unknown,Beats per Minute\n1,2\n"))
        assertEquals(1, csv.column("beats_per_minute"))
        assertEquals(-1, csv.column("timestamp"))
    }

    @Test
    fun anOversizedRecordIsFlaggedNotKeptAndTheNextOneStillReads() {
        val huge = "x".repeat(200_000)
        val csv = CsvStreamParser(StringReader("a,b\n$huge,1\n3,4\n"), maxRecordChars = 1_000)
        assertTrue(csv.next())
        assertTrue(csv.oversized)
        assertTrue(csv.next())
        assertFalse(csv.oversized)
        assertEquals("3", csv.get(0))
    }

    @Test
    fun anUnterminatedQuoteAtTheEndOfTheFileIsFlagged() {
        val csv = CsvStreamParser(StringReader("a,b\n1,\"never closed\n"))
        assertTrue(csv.next())
        assertTrue(csv.unterminatedQuote)
    }

    // --- JSON --------------------------------------------------------------------------------------

    @Test
    fun jsonReaderStreamsEscapesAndSkipsUnknownValues() {
        val json = JsonTokenReader(StringReader("""[{"a":"x\"y\u00e9\n","skip":{"deep":[1,2,{"z":null}]},"n":-1.5e2}]"""))
        json.beginArray()
        json.beginObject()
        assertEquals("a", json.nextName())
        assertEquals("x\"y\u00e9\n", json.nextStringOrNull())
        assertEquals("skip", json.nextName())
        json.skipValue()
        assertEquals("n", json.nextName())
        assertEquals(-150.0, json.nextDoubleOrNull())
        json.endObject()
        json.endArray()
    }

    @Test
    fun jsonReaderRejectsTruncatedAndOverNestedInputWithoutHangingOrCrashing() {
        assertFailsWith<MalformedJsonException> {
            val r = JsonTokenReader(StringReader("""[{"a":1},{"a":"""))
            r.beginArray(); r.beginObject(); r.nextName(); r.nextDoubleOrNull(); r.endObject()
            r.beginObject(); r.nextName(); r.nextDoubleOrNull(); r.endObject(); r.hasNext()
        }
        assertFailsWith<MalformedJsonException> {
            val r = JsonTokenReader(StringReader("[".repeat(500)))
            repeat(500) { r.beginArray() }
        }
    }

    @Test
    fun aHugeStringValueIsCutNotBuffered() {
        val r = JsonTokenReader(StringReader("[\"" + "a".repeat(5_000_000) + "\"]"), maxStringChars = 100)
        r.beginArray()
        assertEquals(100, r.nextStringOrNull()!!.length)
        r.endArray()
    }

    // --- Per-type parsers --------------------------------------------------------------------------

    @Test
    fun heartRateAcceptsTheBareRateShapeAndQuotedNumbers() {
        val (out, p) = parse(
            "${HR_PATH}2024-06-10.json",
            """[{"dateTime":"06/10/24 10:00:00","bpm":"61","confidence":"2"},{"dateTime":"06/10/24 10:00:05","value":62}]""",
        )
        assertEquals(listOf(61, 62), out.heartRate.map { it.bpm })
        assertEquals(0, p.stats.quarantined)
    }

    @Test
    fun hrvDetailsEmitsRmssdAndTheFrequencyBandsAndDropsEmptyWindows() {
        val (out, p) = parse(
            "Heart Rate Variability/Heart Rate Variability Details - 2024-06-10.csv",
            "timestamp,rmssd,coverage,low_frequency,high_frequency\n2024-06-10T03:00:00,40,1,500,600\n2024-06-10T03:05:00,41,0,1,1\n2024-06-10T03:10:00,,1,1,1\n2024-06-10T03:15:00,x,1,1,1\n",
        )
        assertEquals(setOf(MetricType.HRV_RMSSD, MetricType.HRV_LOW_FREQUENCY, MetricType.HRV_HIGH_FREQUENCY), out.samples.map { it.metric }.toSet())
        assertEquals(3, out.samples.size)
        assertEquals(1, p.stats.droppedLowConfidence)
        assertEquals(1, p.stats.droppedEmpty)
        assertEquals(1, p.stats.quarantined)
    }

    @Test
    fun deviceTemperatureRoutesByRangeAndQuarantinesTheImpossible() {
        val (out, p) = parse(
            "Temperature/Device Temperature - 2024-06-10.csv",
            "recorded_time,temperature\n2024-06-10T03:00:00,-0.3\n2024-06-10T03:01:00,33.4\n2024-06-10T03:02:00,15\n",
        )
        assertEquals(listOf(MetricType.SKIN_TEMP_DEVIATION, MetricType.SKIN_TEMP_NIGHTLY), out.samples.map { it.metric })
        assertEquals(1, p.stats.quarantined)
    }

    @Test
    fun computedTemperatureStoresTheDifferenceFromAnAbsoluteBaselineAndNeverEstimates() {
        val (out, _) = parse(
            "Temperature/Computed Temperature - 2024-06-10.csv",
            "sleep_end,nightly_temperature,baseline_temperature_celsius\n2024-06-10T06:30:00,34.5,34.0\n2024-06-11T06:30:00,34.5,\n",
        )
        val first = out.daily.filter { it.epochDay == LocalDate.of(2024, 6, 10).toEpochDay() }
        assertEquals(0.5, first.single { it.metric == MetricType.SKIN_TEMP_DEVIATION }.value, 1e-9)
        val second = out.daily.filter { it.epochDay == LocalDate.of(2024, 6, 11).toEpochDay() }
        assertEquals(listOf(MetricType.SKIN_TEMP_NIGHTLY), second.map { it.metric }, "without a baseline there is no deviation")
    }

    @Test
    fun exerciseDistanceNeedsAKnownUnitAndElevationIsNeverGuessed() {
        val (out, _) = parse(
            "Global Export Data/exercise-0.json",
            """[{"logId":1,"activityName":"Run","startTime":"06/10/24 07:00:00","duration":3600000,"distance":5.0,"distanceUnit":"Kilometer","elevationGain":100},
               {"logId":2,"activityName":"Walk","startTime":"06/11/24 07:00:00","duration":1800000,"distance":3.0},
               {"logId":3,"activityName":"Bad","startTime":"06/12/24 07:00:00","duration":0}]""",
        )
        assertEquals(2, out.workouts.size)
        assertEquals(5000.0, out.workouts[0].distanceMeters)
        assertNull(out.workouts[1].distanceMeters, "a distance without a stated unit is not stored")
        assertNull(out.workouts[0].elevationGainMeters)
    }

    @Test
    fun theGoogleLayoutDailyFilesUseTheSameParsersWithTheirOwnColumnNames() {
        val (out, _) = parse("daily_respiratory_rate.csv", "timestamp,full sleep breathing rate\n2024-06-10T00:00:00Z,14.2\n")
        assertEquals(14.2, out.daily.single().value)
        assertEquals(LocalDate.of(2024, 6, 10).toEpochDay(), out.daily.single().epochDay)
    }

    // --- Router and redaction ----------------------------------------------------------------------

    @Test
    fun routerMatchesOnlyWhitelistedNamesByLastSegmentAndCaseInsensitively() {
        assertEquals(TakeoutCategory.HRV_DETAILS, TakeoutEntryRouter.route("Takeout/Fitbit/Heart Rate Variability/HEART RATE VARIABILITY DETAILS - 2024-03-10.CSV")?.category)
        assertEquals(TakeoutLayout.GOOGLE, TakeoutEntryRouter.route("Takeout/Fitbit/steps_2024-03-10.csv")?.layout)
        for (name in listOf("Takeout/Fitbit/Profile.json", "Takeout/Location History/Records.json", "Takeout/Fitbit/Sleep Score/sleep_score.csv", "", "dir/")) {
            assertNull(TakeoutEntryRouter.route(name), name)
        }
    }

    @Test
    fun redactionKeepsStructureAndDropsEverythingPersonal() {
        val redacted = TakeoutRedaction.redactPath("Takeout/Jane Doe 1990/Fitbit/Global Export Data/heart_rate-2024-06-10.json")
        assertEquals("Takeout/* * #/Fitbit/Global Export Data/heart_rate-YYYY-MM-DD.json", redacted)
    }

    @Test
    fun planOrderingPrefersTheClassicLayoutForTheSameDay() {
        val classic = TakeoutEntryInfo(0, 0, TakeoutEntryRouter.route("Global Export Data/heart_rate-2024-06-10.json")!!, 10, 1)
        val google = TakeoutEntryInfo(0, 1, TakeoutEntryRouter.route("heart_rate_2024-06-10.csv")!!, 99, 2)
        val otherDay = TakeoutEntryInfo(0, 2, TakeoutEntryRouter.route("heart_rate_2024-06-11.csv")!!, 99, 3)
        val plan = TakeoutImportPlanner.plan(listOf(classic, google, otherDay), emptyList(), force = false)
        assertEquals(
            listOf(TakeoutFileDecision.IMPORT_NEW, TakeoutFileDecision.SKIP_OTHER_LAYOUT, TakeoutFileDecision.IMPORT_NEW),
            plan.map { it.decision },
        )
    }
}
