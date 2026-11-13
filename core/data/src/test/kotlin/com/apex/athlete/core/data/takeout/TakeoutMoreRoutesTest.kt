package com.apex.athlete.core.data.takeout

import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.data.takeout.parsers.TakeoutEntryParser
import com.apex.athlete.core.data.takeout.parsers.TakeoutParsers
import com.apex.athlete.core.data.takeout.parsers.TakeoutRowBuffer
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SleepStage
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.io.ByteArrayInputStream
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.coroutines.coroutineContext
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Calories, distance, active zone minutes, active minutes, VO2 max, weight, and the Google layout's
 * sleep and exercise files (DATA_FLOW_E2E item 14). Every fixture is synthetic: arbitrary numbers, file
 * names and headers as the reference repos describe them, all UNVERIFIED against a real archive
 * (docs/API_VALIDATION.md).
 *
 * Invariants proved here: each route lands on the intended metric with archive provenance; units are
 * never guessed (a header without a unit is a schema mismatch, not a number); bad rows are counted and
 * skipped, the rest of the file survives; a day total is written only for a day the archive covers
 * completely (DST days included); a repeat or forced re-import creates no new rows; a resumed file ends
 * in the state of an uninterrupted one.
 */
class TakeoutMoreRoutesTest {

    private val sink = MemorySink()
    private val marks = MemoryMarks()
    private val replayer = RecordingReplayer()

    private fun run(vararg parts: ByteArray, force: Boolean = false, batchRows: Int = TakeoutZipImporter.BATCH_ROWS): TakeoutImportReport =
        runBlocking {
            sink.beginRun()
            importer(sink, marks, replayer, batchRows).import(parts.mapIndexed { i, b -> partOf(b, "part-$i.zip") }, force)
        }

    private fun parse(path: String, content: String, zone: ZoneId = NEW_YORK): Pair<TakeoutRowBuffer, TakeoutEntryParser> {
        val route = assertNotNull(TakeoutEntryRouter.route(path), path)
        val parser = TakeoutParsers.open(route, ByteArrayInputStream(content.toByteArray()), config(zone))
        val out = TakeoutRowBuffer()
        while (parser.readInto(out, 1_000_000)) Unit
        return out to parser
    }

    private fun day(iso: String) = LocalDate.parse(iso).toEpochDay()
    private fun utcMs(y: Int, mo: Int, d: Int, h: Int, mi: Int) = LocalDateTime.of(y, mo, d, h, mi).toInstant(ZoneOffset.UTC).toEpochMilli()
    private fun localMs(y: Int, mo: Int, d: Int, h: Int, mi: Int) = LocalDateTime.of(y, mo, d, h, mi).atZone(NEW_YORK).toInstant().toEpochMilli()

    private fun TakeoutRowBuffer.of(metric: MetricType): List<SampleObservation> = samples.filter { it.metric == metric }
    private fun TakeoutRowBuffer.dailyOf(metric: MetricType) = daily.filter { it.metric == metric }.associate { it.epochDay to it.value }

    private val classic = "Takeout/Fitbit/Global Export Data/"
    private val google = "Takeout/Google Health/Physical Activity_GoogleData/"

    // --- Routes ------------------------------------------------------------------------------------

    @Test
    fun routesNameTheNewFilesInBothLayoutsAndRefuseTheOnesWeCannotReadSafely() {
        fun check(name: String, category: TakeoutCategory, layout: TakeoutLayout, format: TakeoutFormat, date: String? = null) {
            val route = assertNotNull(TakeoutEntryRouter.route(name), name)
            assertEquals(category, route.category, name)
            assertEquals(layout, route.layout, name)
            assertEquals(format, route.format, name)
            assertEquals(date?.let(::day), route.fileEpochDay, name)
        }
        check("${classic}calories-2024-03-10.json", TakeoutCategory.CALORIES, TakeoutLayout.CLASSIC, TakeoutFormat.JSON, "2024-03-10")
        check("${classic}distance-2024-03-10.json", TakeoutCategory.DISTANCE, TakeoutLayout.CLASSIC, TakeoutFormat.JSON, "2024-03-10")
        for (n in listOf("sedentary_minutes", "lightly_active_minutes", "moderately_active_minutes", "very_active_minutes")) {
            check("$classic$n-2024-03-10.json", TakeoutCategory.ACTIVE_MINUTES, TakeoutLayout.CLASSIC, TakeoutFormat.JSON, "2024-03-10")
        }
        check("Takeout/Fitbit/Active Zone Minutes/Active Zone Minutes - 2024-03-10.csv", TakeoutCategory.ACTIVE_ZONE_MINUTES, TakeoutLayout.CLASSIC, TakeoutFormat.CSV, "2024-03-10")
        check("${classic}demographic_vo2_max-2024-03-10.json", TakeoutCategory.VO2_MAX, TakeoutLayout.CLASSIC, TakeoutFormat.JSON, "2024-03-10")

        check("${google}calories_2024-03-10.csv", TakeoutCategory.CALORIES, TakeoutLayout.GOOGLE, TakeoutFormat.CSV, "2024-03-10")
        check("${google}active_energy_burned_2024-03-10.csv", TakeoutCategory.ACTIVE_ENERGY, TakeoutLayout.GOOGLE, TakeoutFormat.CSV, "2024-03-10")
        check("${google}distance_2024-03-10.csv", TakeoutCategory.DISTANCE, TakeoutLayout.GOOGLE, TakeoutFormat.CSV, "2024-03-10")
        check("${google}active_zone_minutes_2024-03-10.csv", TakeoutCategory.ACTIVE_ZONE_MINUTES, TakeoutLayout.GOOGLE, TakeoutFormat.CSV, "2024-03-10")
        check("${google}activity_level_2024-03-10.csv", TakeoutCategory.ACTIVE_MINUTES, TakeoutLayout.GOOGLE, TakeoutFormat.CSV, "2024-03-10")
        check("${google}weight.csv", TakeoutCategory.WEIGHT, TakeoutLayout.GOOGLE, TakeoutFormat.CSV)
        check("Takeout/Google Health/Health Fitness Data_GoogleData/UserExercises_2024-03-10.csv", TakeoutCategory.EXERCISE, TakeoutLayout.GOOGLE, TakeoutFormat.CSV, "2024-03-10")
        check("Takeout/Google Health/Health Fitness Data_GoogleData/UserSleepStages_2024-03-10.csv", TakeoutCategory.SLEEP, TakeoutLayout.GOOGLE, TakeoutFormat.CSV, "2024-03-10")

        // Weight in the classic export is written in the account's own unit and says which nowhere: not read.
        assertNull(TakeoutEntryRouter.route("${classic}weight-2024-03-10.json"))
        // Looks similar, is a different quantity.
        assertNull(TakeoutEntryRouter.route("${google}calories_in_heart_rate_zone_2024-03-10.csv"))
        assertNull(TakeoutEntryRouter.route("${google}time_in_heart_rate_zone_2024-03-10.csv"))
        assertNull(TakeoutEntryRouter.route("${classic}calories-2024-13-10.json"), "an impossible date is not one of our files")
    }

    // --- Calories ----------------------------------------------------------------------------------

    @Test
    fun classicCaloriesAreFoldedIntoFifteenMinuteBucketsOnTheTotalCaloriesMetric() {
        val rows = (0 until 30).joinToString(",", "[", "]") { """{"dateTime":"03/09/24 00:%02d:00","value":"1.5"}""".format(it) }
        val (out, parser) = parse("${classic}calories-2024-03-09.json", rows)
        val buckets = out.of(MetricType.CALORIES_TOTAL)
        assertEquals(listOf(localMs(2024, 3, 9, 0, 0), localMs(2024, 3, 9, 0, 15)), buckets.map { it.epochMillis })
        assertEquals(listOf(22.5, 22.5), buckets.map { it.value })
        assertEquals(buckets.map { it.epochMillis + 900_000L }, buckets.map { it.endEpochMillis })
        assertEquals(30L, parser.stats.rowsRead)
    }

    @Test
    fun googleCaloriesAndActiveEnergyGoToTheirOwnMetrics() {
        val calories = "timestamp,calories,data source\n2024-03-09T05:00:00Z,2.0,Radiance\n2024-03-09T05:01:00Z,2.0,Radiance\n2024-03-09T05:16:00Z,2.0,Radiance\n"
        val (c, _) = parse("${google}calories_2024-03-09.csv", calories)
        assertEquals(listOf(utcMs(2024, 3, 9, 5, 0) to 4.0, utcMs(2024, 3, 9, 5, 15) to 2.0), c.of(MetricType.CALORIES_TOTAL).map { it.epochMillis to it.value })

        val active = "timestamp,kilocalories\n2024-03-09T05:00:00Z,0.5\n2024-03-09T05:02:00Z,0.25\n"
        val (a, _) = parse("${google}active_energy_burned_2024-03-09.csv", active)
        assertEquals(listOf(0.75), a.of(MetricType.CALORIES_ACTIVE).map { it.value })
        assertTrue(a.of(MetricType.CALORIES_TOTAL).isEmpty(), "active energy is never filed as total energy")
    }

    @Test
    fun caloriesRowsThatCannotBeReadAreCountedAndTheRestOfTheFileSurvives() {
        val csv = "timestamp,calories\n2024-03-09T05:00:00Z,2.0\nnot a time,2.0\n2024-03-09T05:01:00Z,abc\n2024-03-09T05:02:00Z,-4\n2024-03-09T05:03:00Z,1.0\n"
        val (out, parser) = parse("${google}calories_2024-03-09.csv", csv)
        assertEquals(listOf(3.0), out.of(MetricType.CALORIES_TOTAL).map { it.value })
        assertEquals(3L, parser.stats.quarantined)
        assertEquals(5L, parser.stats.rowsRead)
    }

    // --- Distance ----------------------------------------------------------------------------------

    @Test
    fun classicDistanceIsCentimetresPerMinuteAndIsStoredInMetres() {
        val rows = (0 until 3).joinToString(",", "[", "]") { """{"dateTime":"03/09/24 00:0$it:00","value":"12000"}""" }
        val (out, _) = parse("${classic}distance-2024-03-09.json", rows)
        assertEquals(listOf(360.0), out.of(MetricType.DISTANCE).map { it.value })
    }

    @Test
    fun googleDistanceNeedsAUnitInTheHeaderAndIsNeverGuessed() {
        val (mm, _) = parse("${google}distance_2024-03-09.csv", "timestamp,distance_millimeters\n2024-03-09T05:00:00Z,5000\n2024-03-09T05:01:00Z,5000\n")
        assertEquals(listOf(10.0), mm.of(MetricType.DISTANCE).map { it.value })
        val (km, _) = parse("${google}distance_2024-03-09.csv", "timestamp,distance_kilometers\n2024-03-09T05:00:00Z,0.5\n")
        assertEquals(listOf(500.0), km.of(MetricType.DISTANCE).map { it.value })

        val (bare, parser) = parse("${google}distance_2024-03-09.csv", "timestamp,distance\n2024-03-09T05:00:00Z,5000\n")
        assertTrue(parser.stats.schemaMismatch, "a bare 'distance' could be any unit")
        assertEquals(0, bare.size)
    }

    // --- Active zone minutes -----------------------------------------------------------------------

    @Test
    fun activeZoneMinutesOfBothLayoutsAreSummedPerBucketAndTheZoneNameIsIgnored() {
        val classicCsv = "date_time,heart_zone_id,total_minutes\n2024-03-09T07:00:00,FAT_BURN,1\n2024-03-09T07:05:00,CARDIO,2\n" +
            "2024-03-09T07:20:00,PEAK,2\n2024-03-09T07:21:00,PEAK,abc\n2024-03-09T07:22:00,PEAK,\n"
        val (c, cp) = parse("Takeout/Fitbit/Active Zone Minutes/Active Zone Minutes - 2024-03-09.csv", classicCsv)
        assertEquals(listOf(localMs(2024, 3, 9, 7, 0) to 3.0, localMs(2024, 3, 9, 7, 15) to 2.0), c.of(MetricType.ACTIVE_ZONE_MINUTES).map { it.epochMillis to it.value })
        assertEquals(1L, cp.stats.quarantined)

        val googleCsv = "timestamp,heart_rate_zone,total_minutes,data source\n2024-03-09T12:00:00Z,CARDIO,2,Radiance\n2024-03-09T12:01:00Z,PEAK,2,Radiance\n"
        val (g, _) = parse("${google}active_zone_minutes_2024-03-09.csv", googleCsv)
        assertEquals(listOf(4.0), g.of(MetricType.ACTIVE_ZONE_MINUTES).map { it.value })
    }

    // --- Active minutes ----------------------------------------------------------------------------

    @Test
    fun eachClassicActiveMinutesFileFeedsItsOwnMetricAsADailyValue() {
        val body = """[{"dateTime":"03/01/24 00:00:00","value":"20"},{"dateTime":"03/02/24 00:00:00","value":"35"},{"dateTime":"03/03/24 00:00:00","value":"0"}]"""
        val expected = mapOf(
            "sedentary_minutes" to MetricType.SEDENTARY_MINUTES, "lightly_active_minutes" to MetricType.LIGHTLY_ACTIVE_MINUTES,
            "moderately_active_minutes" to MetricType.MODERATELY_ACTIVE_MINUTES, "very_active_minutes" to MetricType.VERY_ACTIVE_MINUTES,
        )
        for ((name, metric) in expected) {
            val (out, parser) = parse("$classic$name-2024-03-01.json", body)
            assertEquals(mapOf(day("2024-03-01") to 20.0, day("2024-03-02") to 35.0), out.dailyOf(metric), name)
            assertEquals(1L, parser.stats.droppedEmpty, "a zero day is 'no value', not a measured zero ($name)")
            assertEquals(out.daily.size, out.size, "only daily rows ($name)")
        }
    }

    @Test
    fun anIntradayActiveMinutesFileSumsPerDayAndNeverReportsTheDaysAtItsEdges() {
        // Minute rows: 03/09 has one row (the file starts late that day), 03/10 two, 03/11 one (the file ends early).
        val body = """[{"dateTime":"03/09/24 23:59:00","value":"1"},{"dateTime":"03/10/24 00:00:00","value":"1"},""" +
            """{"dateTime":"03/10/24 00:01:00","value":"1"},{"dateTime":"03/11/24 00:00:00","value":"1"}]"""
        val (out, parser) = parse("${classic}very_active_minutes-2024-03-09.json", body)
        assertEquals(mapOf(day("2024-03-10") to 2.0), out.dailyOf(MetricType.VERY_ACTIVE_MINUTES))
        assertEquals(2L, parser.stats.droppedEmpty, "the two edge days are counted as dropped")
    }

    @Test
    fun googleActivityLevelRowsAreOneMinuteEachAndLandOnTheirLevelsMetric() {
        val csv = "timestamp,level,data source\n2024-03-09T12:00:00Z,SEDENTARY,Radiance\n2024-03-09T12:01:00Z,SEDENTARY,Radiance\n" +
            "2024-03-09T12:02:00Z,LIGHT,Radiance\n2024-03-09T12:20:00Z,VIGOROUS,Radiance\n2024-03-09T12:21:00Z,MODERATE,Radiance\n2024-03-09T12:22:00Z,BANANA,Radiance\n"
        val (out, parser) = parse("${google}activity_level_2024-03-09.csv", csv)
        assertEquals(listOf(2.0), out.of(MetricType.SEDENTARY_MINUTES).map { it.value })
        assertEquals(listOf(1.0), out.of(MetricType.LIGHTLY_ACTIVE_MINUTES).map { it.value })
        assertEquals(listOf(1.0), out.of(MetricType.MODERATELY_ACTIVE_MINUTES).map { it.value })
        assertEquals(listOf(1.0), out.of(MetricType.VERY_ACTIVE_MINUTES).map { it.value })
        assertEquals(1L, parser.stats.quarantined, "an unknown level is not guessed")
    }

    // --- VO2 max -----------------------------------------------------------------------------------

    @Test
    fun vo2MaxIsADailyValueReadFromTheNestedObjectWithTheFilteredValueAsFallback() {
        val body = """[{"dateTime":"03/09/24 00:00:00","value":{"demographicVO2Max":42.5,"demographicVO2MaxError":2.0,"filteredDemographicVO2Max":42.1}},""" +
            """{"dateTime":"03/10/24 00:00:00","value":{"filteredDemographicVO2Max":43.0}},""" +
            """{"dateTime":"03/11/24 00:00:00","value":{"demographicVO2Max":0}},"junk",{"dateTime":"nope","value":{"demographicVO2Max":40}}]"""
        val (out, parser) = parse("${classic}demographic_vo2_max-2024-03-09.json", body)
        assertEquals(mapOf(day("2024-03-09") to 42.5, day("2024-03-10") to 43.0), out.dailyOf(MetricType.VO2_MAX))
        assertEquals(1L, parser.stats.droppedEmpty)
        assertEquals(2L, parser.stats.quarantined)
        assertEquals(5L, parser.stats.rowsRead)
    }

    // --- Weight ------------------------------------------------------------------------------------

    @Test
    fun weightIsTheLastWeighInOfTheLocalDayInKilogramsEvenWhenTheUtcDateDiffers() {
        val csv = "timestamp,weight_grams,data source\n" +
            "2024-03-09T13:00:00Z,80500,Fitbit App\n2024-03-09T23:30:00Z,80300,Fitbit App\n" +
            "2024-03-10T03:30:00Z,80100,Fitbit App\n" + // 22:30 on 9 March in New York: still that day
            "2024-03-10T15:00:00Z,80000,Fitbit App\n" + // 11:00 EDT, after the clock change
            "2024-03-12T12:00:00Z,abc,Fitbit App\n"
        val (out, parser) = parse("${google}weight.csv", csv)
        assertEquals(mapOf(day("2024-03-09") to 80.1, day("2024-03-10") to 80.0), out.dailyOf(MetricType.WEIGHT))
        assertEquals(1L, parser.stats.quarantined)
    }

    @Test
    fun weightHonoursAKilogramHeaderAndRefusesOneWithoutAUnit() {
        val (kg, _) = parse("${google}weight.csv", "timestamp,weight_kilograms\n2024-03-09T13:00:00Z,80.5\n")
        assertEquals(mapOf(day("2024-03-09") to 80.5), kg.dailyOf(MetricType.WEIGHT))
        val (bare, parser) = parse("${google}weight.csv", "timestamp,weight\n2024-03-09T13:00:00Z,80500\n")
        assertTrue(parser.stats.schemaMismatch)
        assertEquals(0, bare.size)
    }

    // --- Google exercise and sleep -----------------------------------------------------------------

    @Test
    fun googleExerciseRowsBecomeWorkoutsWithStableIdsAndOnlyStatedUnits() {
        val csv = "exercise_id,start_time,end_time,exercise_type,calories,average_heart_rate,distance_meters,steps\n" +
            "9001,2024-03-09T15:00:00Z,2024-03-09T15:30:00Z,Run,300.5,150,5000,4200\n" +
            "9002,2024-03-09T18:00:00Z,,Walk,100,,,\n" + // no end and no duration: not a workout
            "9003,not a time,2024-03-09T19:00:00Z,Walk,100,,,\n"
        val path = "Takeout/Google Health/Health Fitness Data_GoogleData/UserExercises_2024-03-09.csv"
        val (out, parser) = parse(path, csv)
        val w = out.workouts.single()
        assertEquals("takeout:exercise:9001", w.id)
        assertEquals(utcMs(2024, 3, 9, 15, 0), w.startEpochMillis)
        assertEquals(utcMs(2024, 3, 9, 15, 30), w.endEpochMillis)
        assertEquals(-5 * 3600, w.zoneOffsetSeconds)
        assertEquals("RUNNING", w.exerciseType)
        assertEquals(300.5, w.caloriesKcal)
        assertEquals(150, w.averageHeartRate)
        assertEquals(5000.0, w.distanceMeters)
        assertEquals(4200L, w.steps)
        assertEquals(2L, parser.stats.quarantined)
        assertEquals(listOf(w), parse(path, csv).first.workouts, "the same bytes give the same rows")
    }

    @Test
    fun googleExerciseWithoutAnEndUsesItsDurationAndWithoutAnIdTheStartTime() {
        val csv = "start_time,duration_seconds,exercise_type\n2024-03-09T15:00:00Z,1800,Bike\n"
        val (out, _) = parse("Takeout/Google Health/Health Fitness Data_GoogleData/UserExercises_2024-03-09.csv", csv)
        val w = out.workouts.single()
        assertEquals(utcMs(2024, 3, 9, 15, 30), w.endEpochMillis)
        assertEquals("takeout:exercise:${utcMs(2024, 3, 9, 15, 0)}", w.id)
        assertNull(w.distanceMeters, "no unit, no distance")
    }

    @Test
    fun googleSleepStageRowsAreGroupedIntoNightsAndAnUnknownStageIsSkipped() {
        val csv = "start_time,end_time,stage\n" +
            "2024-03-09T03:00:00Z,2024-03-09T03:30:00Z,LIGHT\n2024-03-09T03:30:00Z,2024-03-09T04:00:00Z,DEEP\n" +
            "2024-03-09T04:00:00Z,2024-03-09T04:10:00Z,AWAKE\n2024-03-09T04:10:00Z,2024-03-09T05:00:00Z,REM\n" +
            "2024-03-09T05:00:00Z,2024-03-09T05:05:00Z,BANANA\n" +
            "2024-03-09T10:00:00Z,2024-03-09T10:45:00Z,LIGHT\n"
        val (out, parser) = parse("Takeout/Google Health/Health Fitness Data_GoogleData/UserSleepStages_2024-03-09.csv", csv)
        assertEquals(2, out.sleeps.size, "a gap of more than an hour separates two sleeps")
        val night = out.sleeps[0]
        assertEquals("takeout:sleep:${utcMs(2024, 3, 9, 3, 0)}", night.id)
        assertEquals(utcMs(2024, 3, 9, 3, 0), night.startEpochMillis)
        assertEquals(utcMs(2024, 3, 9, 5, 0), night.endEpochMillis)
        assertEquals(listOf(SleepStage.LIGHT, SleepStage.DEEP, SleepStage.AWAKE, SleepStage.REM), night.stages.map { it.stage })
        assertEquals(utcMs(2024, 3, 9, 10, 45), out.sleeps[1].endEpochMillis)
        assertEquals(1L, parser.stats.quarantined)
    }

    @Test
    fun googleSleepRowsWithASessionIdAreGroupedByThatId() {
        val csv = "sleep_id,start_time,end_time,stage\n" +
            "77,2024-03-09T03:00:00Z,2024-03-09T04:00:00Z,LIGHT\n78,2024-03-09T04:00:00Z,2024-03-09T05:00:00Z,DEEP\n"
        val (out, _) = parse("Takeout/Google Health/Health Fitness Data_GoogleData/UserSleepStages_2024-03-09.csv", csv)
        assertEquals(listOf("takeout:sleep:77", "takeout:sleep:78"), out.sleeps.map { it.id })
    }

    // --- Day totals through the importer -----------------------------------------------------------

    private fun quarterHours(from: String = "00:00", count: Int): List<String> {
        val (h, m) = from.split(':').map { it.toInt() }
        return (0 until count).map { i -> val t = h * 60 + m + i * 15; "%02d:%02d:00".format(t / 60, t % 60) }
    }

    private fun series(mmddyy: String, times: List<String>, value: String) =
        times.joinToString(",", "[", "]") { """{"dateTime":"$mmddyy $it","value":"$value"}""" }

    /** 23 h (92 buckets) on the day clocks go forward, 25 h (100) on the day they go back. */
    private val springForward: List<String> = quarterHours(count = 8) + quarterHours("03:00", 84)
    private val fallBack: List<String> = quarterHours(count = 8) + quarterHours("01:00", 4) + quarterHours("02:00", 88)

    @Test
    fun calorieDayTotalsAreWrittenOnlyForCompleteDaysIncludingTheClockChangeDays() {
        val archive = zipOf(
            "${classic}calories-2024-03-10.json" to series("03/10/24", springForward, "1.0").dropLast(1) + "," +
                series("03/11/24", quarterHours(count = 50), "1.0").drop(1), // 03/11 is a partial day
            "${classic}calories-2024-11-03.json" to series("11/03/24", fallBack, "2.0"),
        )
        val report = run(archive)
        assertEquals(92.0, sink.daily[MetricType.CALORIES_TOTAL.storageKey to day("2024-03-10")], "23 h day: 92 buckets")
        assertNull(sink.daily[MetricType.CALORIES_TOTAL.storageKey to day("2024-03-11")], "a partial day is never presented as the day's calories")
        assertEquals(200.0, sink.daily[MetricType.CALORIES_TOTAL.storageKey to day("2024-11-03")], "25 h day: 100 buckets")
        assertEquals(2, report.dayTotalsWritten)
        assertEquals(0, report.stepDayTotalsWritten)
    }

    @Test
    fun activeZoneMinutesGetADayTotalOnlyOnDaysTheStepsFeedCoversCompletely() {
        val steps = series("03/09/24", quarterHours(count = 96), "10").dropLast(1) + "," + series("03/10/24", quarterHours(count = 6), "10").drop(1)
        val azm = "timestamp,heart_rate_zone,total_minutes\n2024-03-09T15:00:00Z,CARDIO,2\n2024-03-09T15:05:00Z,FAT_BURN,1\n2024-03-09T20:00:00Z,PEAK,2\n" +
            "2024-03-10T16:00:00Z,CARDIO,2\n"
        val archive = zipOf("${classic}steps-2024-03-09.json" to steps, "${google}active_zone_minutes_2024-03-09.csv" to azm)
        run(archive)
        assertEquals(5.0, sink.daily[MetricType.ACTIVE_ZONE_MINUTES.storageKey to day("2024-03-09")], "covered day: sum of its buckets")
        assertNull(sink.daily[MetricType.ACTIVE_ZONE_MINUTES.storageKey to day("2024-03-10")], "the archive's steps stop mid-day: no total")
        assertEquals(2, sink.samples.keys.count { it.first == MetricType.ACTIVE_ZONE_MINUTES.storageKey && it.second < localMs(2024, 3, 10, 0, 0) }, "the buckets themselves are stored")

        val alone = MemorySink()
        runBlocking { importer(alone, MemoryMarks(), RecordingReplayer()).import(listOf(partOf(zipOf("${google}active_zone_minutes_2024-03-09.csv" to azm)))) }
        assertTrue(alone.daily.keys.none { it.first == MetricType.ACTIVE_ZONE_MINUTES.storageKey }, "without a covering feed nothing is totalled")
    }

    // --- Steps without zero minutes (OPEN_POINTS T3) -----------------------------------------------

    @Test
    fun stepDayTotalsDoNotNeedMinutesWithZeroSteps() {
        // Waking hours only (07:00-22:45), zero minutes omitted, three days in one file.
        val waking = quarterHours("07:00", 64)
        val body = listOf("03/05/24", "03/06/24", "03/07/24").joinToString(",", "[", "]") { d -> series(d, waking, "10").removeSurrounding("[", "]") }
        val archive = zipOf("${classic}steps-2024-03-05.json" to body)
        val report = run(archive)
        assertEquals(640.0, sink.daily[MetricType.STEPS.storageKey to day("2024-03-06")], "the middle day is inside the file's span: its silent night is zero steps")
        assertNull(sink.daily[MetricType.STEPS.storageKey to day("2024-03-05")], "the file may start after midnight: the first day is not known to be complete")
        assertNull(sink.daily[MetricType.STEPS.storageKey to day("2024-03-07")], "and may end before it: so is the last")
        assertEquals(1, report.stepDayTotalsWritten)
        assertEquals(96, sink.samples.keys.count { it.first == MetricType.STEPS.storageKey && it.second >= localMs(2024, 3, 6, 0, 0) && it.second < localMs(2024, 3, 7, 0, 0) }, "silent buckets are stored as zeros")
    }

    @Test
    fun aGapOfADayOrMoreIsAMissingStretchNotZeroSteps() {
        val body = listOf("03/05/24", "03/06/24", "03/07/24").joinToString(",", "[", "]") { d -> series(d, listOf("12:00:00"), "10").removeSurrounding("[", "]") }
        val report = run(zipOf("${classic}steps-2024-03-05.json" to body))
        assertEquals(0, report.stepDayTotalsWritten, "24 hours apart is not a quiet night; the band may have been off")
        assertTrue(sink.daily.keys.none { it.first == MetricType.STEPS.storageKey })
    }

    // --- Repeat, force, resume, truncation ---------------------------------------------------------

    private fun everyRouteArchive(): ByteArray = zipOf(
        "${classic}calories-2024-03-09.json" to series("03/09/24", quarterHours(count = 96), "1.5"),
        "${classic}distance-2024-03-09.json" to series("03/09/24", quarterHours(count = 96), "1200"),
        "${classic}steps-2024-03-09.json" to series("03/09/24", quarterHours(count = 96), "10"),
        "${classic}very_active_minutes-2024-03-09.json" to """[{"dateTime":"03/09/24 00:00:00","value":"20"}]""",
        "${classic}demographic_vo2_max-2024-03-09.json" to """[{"dateTime":"03/09/24 00:00:00","value":{"demographicVO2Max":42.5}}]""",
        "Takeout/Fitbit/Active Zone Minutes/Active Zone Minutes - 2024-03-09.csv" to "date_time,heart_zone_id,total_minutes\n2024-03-09T07:00:00,CARDIO,2\n",
        "${google}weight.csv" to "timestamp,weight_grams\n2024-03-09T13:00:00Z,80500\n",
        // Another date than the classic file above: a Google file is skipped when a classic file of the same type and date exists.
        "${google}activity_level_2024-03-08.csv" to "timestamp,level\n2024-03-08T12:00:00Z,SEDENTARY\n",
        "Takeout/Google Health/Health Fitness Data_GoogleData/UserExercises_2024-03-09.csv" to
            "exercise_id,start_time,end_time,exercise_type\n9001,2024-03-09T15:00:00Z,2024-03-09T15:30:00Z,Run\n",
        "Takeout/Google Health/Health Fitness Data_GoogleData/UserSleepStages_2024-03-09.csv" to
            "start_time,end_time,stage\n2024-03-09T03:00:00Z,2024-03-09T05:00:00Z,LIGHT\n",
    )

    @Test
    fun aRepeatedAndAForcedImportOfEveryNewRouteCreateNoNewRows() {
        val archive = everyRouteArchive()
        val first = run(archive)
        assertEquals(TakeoutOutcome.COMPLETED, first.outcome)
        assertTrue(first.files.all { it.status == TakeoutFileStatus.COMPLETE }, first.files.toString())
        assertEquals(10, first.filesImported)
        assertEquals(20.0, sink.daily[MetricType.VERY_ACTIVE_MINUTES.storageKey to day("2024-03-09")])
        assertEquals(42.5, sink.daily[MetricType.VO2_MAX.storageKey to day("2024-03-09")])
        assertEquals(80.5, sink.daily[MetricType.WEIGHT.storageKey to day("2024-03-09")])
        assertEquals(144.0, sink.daily[MetricType.CALORIES_TOTAL.storageKey to day("2024-03-09")])
        assertEquals(1, sink.workouts.size)
        assertEquals(1, sink.sleeps.size)
        val state = sink.snapshot()
        val rows = sink.totalRows
        val calls = sink.writeCalls

        val again = run(archive)
        assertEquals(TakeoutOutcome.NOTHING_NEW, again.outcome)
        assertEquals(calls, sink.writeCalls, "not one batch is sent for an archive already imported")
        assertEquals(state, sink.snapshot())

        run(archive, force = true)
        assertEquals(rows, sink.totalRows, "a forced re-import rewrites the same rows, it adds none")
        assertEquals(state, sink.snapshot())
    }

    @Test
    fun aCaloriesFileCancelledMidWayAndResumedEndsInTheStateOfAnUninterruptedRun() {
        // 92 buckets on the clock-forward day, then 96: two day totals, and a batch boundary at the day edge.
        val body = series("03/10/24", springForward, "1.0").dropLast(1) + "," + series("03/11/24", quarterHours(count = 96), "1.0").drop(1)
        val archive = zipOf("${classic}calories-2024-03-10.json" to body)
        val reference = MemorySink()
        runBlocking { importer(reference, MemoryMarks(), RecordingReplayer(), 92).import(listOf(partOf(archive))) }

        runBlocking {
            val job: Job = launch {
                sink.afterApply = { call -> if (call == 1) coroutineContext[Job]!!.cancel() }
                importer(sink, marks, replayer, 92).import(listOf(partOf(archive)))
            }
            job.join()
            assertTrue(job.isCancelled)
        }
        assertTrue(sink.daily.keys.none { it.first == MetricType.CALORIES_TOTAL.storageKey }, "no total while the file is unfinished")
        val mark = assertNotNull(marks.marks[TakeoutCategory.CALORIES to "calories-2024-03-10.json"])
        assertEquals(92L, mark.committedRows)
        assertTrue(!mark.complete)
        sink.afterApply = {}

        val report = run(archive, batchRows = 92)

        assertEquals(92L, report.files.single().rowsAlreadyCommitted)
        assertEquals(reference.snapshot(), sink.snapshot())
        assertEquals(92.0, sink.daily[MetricType.CALORIES_TOTAL.storageKey to day("2024-03-10")])
        assertEquals(96.0, sink.daily[MetricType.CALORIES_TOTAL.storageKey to day("2024-03-11")])
    }

    @Test
    fun aTruncatedArchiveKeepsTheNewRouteFilesBeforeTheDamage() {
        val whole = zipOf(
            "Takeout/Fitbit/Active Zone Minutes/Active Zone Minutes - 2024-03-09.csv" to "date_time,heart_zone_id,total_minutes\n2024-03-09T07:00:00,CARDIO,2\n",
            "${classic}calories-2024-03-09.json" to series("03/09/24", quarterHours(count = 96), "1.5"),
        )
        var seen = 0
        var second = -1
        for (i in 0 until whole.size - 3) {
            if (whole[i] == 'P'.code.toByte() && whole[i + 1] == 'K'.code.toByte() && whole[i + 2] == 3.toByte() && whole[i + 3] == 4.toByte() && ++seen == 2) { second = i; break }
        }
        val report = run(whole.copyOf(second + 150))
        assertEquals(TakeoutPartStatus.TRUNCATED, report.layout.parts.single().status)
        assertEquals(TakeoutFileStatus.COMPLETE, report.files.first { it.category == TakeoutCategory.ACTIVE_ZONE_MINUTES }.status)
        assertTrue(sink.samples.keys.any { it.first == MetricType.ACTIVE_ZONE_MINUTES.storageKey })
        assertTrue(marks.marks.keys.none { it.first == TakeoutCategory.CALORIES }, "the damaged file stays unimported for a complete archive")
    }

    @Test
    fun aFileWithTheWrongShapeIsReportedPerRouteAndNotMarkedImported() {
        val report = run(zipOf("${google}distance_2024-03-09.csv" to "timestamp,distance\n2024-03-09T05:00:00Z,5000\n"))
        assertEquals(TakeoutFileStatus.SCHEMA_MISMATCH, report.files.single().status)
        assertTrue(marks.marks.isEmpty(), "a later version of the engine reads it")
        assertEquals(0, sink.totalRows)
    }
}
