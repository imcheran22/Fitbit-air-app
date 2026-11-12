package com.apex.athlete.core.data.googlehealth

import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.model.SleepStageObservation
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.network.NetworkJson
import com.apex.athlete.core.network.googlehealth.DataPoint
import com.apex.athlete.core.network.googlehealth.GhActiveEnergyBurned
import com.apex.athlete.core.network.googlehealth.GhActiveMinutes
import com.apex.athlete.core.network.googlehealth.GhActiveMinutesByLevel
import com.apex.athlete.core.network.googlehealth.GhActiveZoneMinutes
import com.apex.athlete.core.network.googlehealth.GhBasalEnergyBurned
import com.apex.athlete.core.network.googlehealth.GhBodyFat
import com.apex.athlete.core.network.googlehealth.GhDailyHeartRateVariability
import com.apex.athlete.core.network.googlehealth.GhDailyOxygenSaturation
import com.apex.athlete.core.network.googlehealth.GhDailyRespiratoryRate
import com.apex.athlete.core.network.googlehealth.GhDailyRestingHeartRate
import com.apex.athlete.core.network.googlehealth.GhDailySleepTemperatureDerivations
import com.apex.athlete.core.network.googlehealth.GhDailyVo2Max
import com.apex.athlete.core.network.googlehealth.GhDataSource
import com.apex.athlete.core.network.googlehealth.GhDate
import com.apex.athlete.core.network.googlehealth.GhDistance
import com.apex.athlete.core.network.googlehealth.GhExercise
import com.apex.athlete.core.network.googlehealth.GhFloors
import com.apex.athlete.core.network.googlehealth.GhHeartRate
import com.apex.athlete.core.network.googlehealth.GhHeartRateVariability
import com.apex.athlete.core.network.googlehealth.GhInterval
import com.apex.athlete.core.network.googlehealth.GhMetricsSummary
import com.apex.athlete.core.network.googlehealth.GhOxygenSaturation
import com.apex.athlete.core.network.googlehealth.GhSampleTime
import com.apex.athlete.core.network.googlehealth.GhSedentaryPeriod
import com.apex.athlete.core.network.googlehealth.GhSleep
import com.apex.athlete.core.network.googlehealth.GhSleepMetadata
import com.apex.athlete.core.network.googlehealth.GhSleepStage
import com.apex.athlete.core.network.googlehealth.GhSleepSummary
import com.apex.athlete.core.network.googlehealth.GhSteps
import com.apex.athlete.core.network.googlehealth.GhVo2Max
import com.apex.athlete.core.network.googlehealth.GhWeight
import com.apex.athlete.core.network.googlehealth.GoogleHealthDataType
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class GoogleHealthMapperTest {
    private val utc = GoogleHealthMapper(ZoneId.of("UTC"))
    private val ny = GoogleHealthMapper(ZoneId.of("America/New_York"))

    private fun ms(iso: String) = Instant.parse(iso).toEpochMilli()
    private fun day(iso: String) = LocalDate.parse(iso).toEpochDay()
    private fun date(iso: String) = LocalDate.parse(iso).let { GhDate(it.year, it.monthValue, it.dayOfMonth) }
    private fun st(iso: String, offset: String? = null) = GhSampleTime(physicalTime = iso, utcOffset = offset)
    private fun iv(start: String, end: String, so: String? = null, eo: String? = null) =
        GhInterval(startTime = start, endTime = end, startUtcOffset = so, endUtcOffset = eo)

    // --- Heart rate ----------------------------------------------------------------------------------

    @Test
    fun heartRateWindowDuplicatesAndBadPoints() {
        val points = listOf(
            DataPoint(heartRate = GhHeartRate(60, st("2026-11-10T10:00:00Z"))),
            DataPoint(heartRate = GhHeartRate(62, st("2026-11-10T10:00:00Z"))), // same instant again
            DataPoint(heartRate = GhHeartRate(61, st("2026-11-10T10:00:01Z"))),
            DataPoint(heartRate = GhHeartRate(300, st("2026-11-10T10:00:02Z"))), // implausible
            DataPoint(heartRate = GhHeartRate(70, st("2026-11-09T10:00:00Z"))), // before window
            DataPoint(heartRate = GhHeartRate(null, st("2026-11-10T10:00:03Z"))), // no value
            DataPoint(heartRate = GhHeartRate(65, GhSampleTime(physicalTime = "not a time"))),
            DataPoint(steps = GhSteps()), // not a heart-rate point
        )
        val seen = HashSet<Long>()
        val m = utc.heartRate(points, ms("2026-11-10T00:00:00Z"), ms("2026-11-11T00:00:00Z"), seen)
        assertEquals(listOf(60, 61), m.items.map { it.bpm })
        assertEquals(ms("2026-11-10T10:00:00Z"), m.items[0].epochMillis)
        assertEquals(2, m.malformed)
        assertEquals(1, m.implausible)
        assertEquals(1, m.ignored)
        // A later page repeating the same instant adds nothing.
        val again = utc.heartRate(points.take(1), ms("2026-11-10T00:00:00Z"), ms("2026-11-11T00:00:00Z"), seen)
        assertTrue(again.items.isEmpty())
    }

    // --- Daily summaries -----------------------------------------------------------------------------

    @Test
    fun dailyTypesMapToTheirMetrics() {
        val d = date("2026-11-10")
        val e = day("2026-11-10")
        assertEquals(
            listOf(MetricType.RESTING_HEART_RATE to 48.0),
            utc.daily(GoogleHealthDataType.DAILY_RESTING_HEART_RATE, listOf(DataPoint(dailyRestingHeartRate = GhDailyRestingHeartRate(48, d)))).items
                .map { it.metric to it.value },
        )
        val hrv = utc.daily(
            GoogleHealthDataType.DAILY_HEART_RATE_VARIABILITY,
            listOf(DataPoint(dailyHeartRateVariability = GhDailyHeartRateVariability(averageHeartRateVariabilityMilliseconds = 62.5, deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds = 71.0, date = d))),
        )
        assertEquals(mapOf(MetricType.HRV_RMSSD to 62.5, MetricType.HRV_DEEP_SLEEP_RMSSD to 71.0), hrv.items.associate { it.metric to it.value })
        assertTrue(hrv.items.all { it.epochDay == e })
        val spo2 = utc.daily(
            GoogleHealthDataType.DAILY_OXYGEN_SATURATION,
            listOf(DataPoint(dailyOxygenSaturation = GhDailyOxygenSaturation(d, 96.5, 92.0, 99.0))),
        )
        assertEquals(
            mapOf(MetricType.SPO2_AVG to 96.5, MetricType.SPO2_LOWER_BOUND to 92.0, MetricType.SPO2_UPPER_BOUND to 99.0),
            spo2.items.associate { it.metric to it.value },
        )
        val resp = utc.daily(GoogleHealthDataType.DAILY_RESPIRATORY_RATE, listOf(DataPoint(dailyRespiratoryRate = GhDailyRespiratoryRate(14.2, d))))
        assertEquals(14.2, resp.items.single().value)
        val vo2 = utc.daily(GoogleHealthDataType.DAILY_VO2_MAX, listOf(DataPoint(dailyVo2Max = GhDailyVo2Max(d, 47.3, "GOOD", true))))
        assertEquals(MetricType.VO2_MAX, vo2.items.single().metric)
        assertEquals(47.3, vo2.items.single().value)
    }

    @Test
    fun skinTemperatureDeviationNeedsBothInputs() {
        val d = date("2026-11-10")
        val both = utc.daily(
            GoogleHealthDataType.DAILY_SLEEP_TEMPERATURE_DERIVATIONS,
            listOf(DataPoint(dailySleepTemperatureDerivations = GhDailySleepTemperatureDerivations(d, 36.75, 36.5))),
        ).items.associate { it.metric to it.value }
        assertEquals(36.75, both[MetricType.SKIN_TEMP_NIGHTLY])
        assertEquals(0.25, both[MetricType.SKIN_TEMP_DEVIATION]!!, 1e-9)

        val noBaseline = utc.daily(
            GoogleHealthDataType.DAILY_SLEEP_TEMPERATURE_DERIVATIONS,
            listOf(DataPoint(dailySleepTemperatureDerivations = GhDailySleepTemperatureDerivations(d, 36.75, null))),
        ).items.associate { it.metric to it.value }
        assertEquals(setOf(MetricType.SKIN_TEMP_NIGHTLY), noBaseline.keys) // deviation stays missing

        val noNight = utc.daily(
            GoogleHealthDataType.DAILY_SLEEP_TEMPERATURE_DERIVATIONS,
            listOf(DataPoint(dailySleepTemperatureDerivations = GhDailySleepTemperatureDerivations(d, null, 36.5))),
        )
        assertTrue(noNight.items.isEmpty())
    }

    @Test
    fun dailyMalformedImplausibleAndWrongKind() {
        val m = utc.daily(
            GoogleHealthDataType.DAILY_RESTING_HEART_RATE,
            listOf(
                DataPoint(dailyRestingHeartRate = GhDailyRestingHeartRate(50, GhDate(2026, 2, 30))), // no such date
                DataPoint(dailyRestingHeartRate = GhDailyRestingHeartRate(50, null)),
                DataPoint(dailyRestingHeartRate = GhDailyRestingHeartRate(500, date("2026-11-10"))), // implausible
                DataPoint(dailyRestingHeartRate = GhDailyRestingHeartRate(null, date("2026-11-10"))),
                DataPoint(steps = GhSteps()),
            ),
        )
        assertTrue(m.items.isEmpty())
        assertEquals(3, m.malformed)
        assertEquals(1, m.implausible)
        assertEquals(1, m.ignored)
        // A type the mapper does not read is ignored, not fatal.
        val other = utc.daily(GoogleHealthDataType.DAILY_HEART_RATE_ZONES, listOf(DataPoint()))
        assertEquals(1, other.ignored)
    }

    // --- Samples -------------------------------------------------------------------------------------

    @Test
    fun sampleTypes() {
        val from = ms("2026-11-10T00:00:00Z")
        val to = ms("2026-11-11T00:00:00Z")
        val hrv = utc.samples(
            GoogleHealthDataType.HEART_RATE_VARIABILITY,
            listOf(DataPoint(heartRateVariability = GhHeartRateVariability(rootMeanSquareOfSuccessiveDifferencesMilliseconds = 55.0, sampleTime = st("2026-11-10T03:00:00Z")))),
            from, to,
        )
        assertEquals(MetricType.HRV_RMSSD, hrv.items.single().metric)
        assertEquals(55.0, hrv.items.single().value)
        val spo2 = utc.samples(
            GoogleHealthDataType.OXYGEN_SATURATION,
            listOf(
                DataPoint(oxygenSaturation = GhOxygenSaturation(st("2026-11-10T03:00:00Z"), 97.0)),
                DataPoint(oxygenSaturation = GhOxygenSaturation(st("2026-11-10T03:05:00Z"), 20.0)), // implausible
            ),
            from, to,
        )
        assertEquals(1, spo2.items.size)
        assertEquals(1, spo2.implausible)
        val vo2 = utc.samples(GoogleHealthDataType.VO2_MAX, listOf(DataPoint(vo2Max = GhVo2Max(st("2026-11-10T03:00:00Z"), 46.0))), from, to)
        assertEquals(MetricType.VO2_MAX, vo2.items.single().metric)
        // run-vo2-max is deliberately not mapped
        val run = utc.samples(GoogleHealthDataType.RUN_VO2_MAX, listOf(DataPoint()), from, to)
        assertTrue(run.items.isEmpty())
        assertEquals(1, run.ignored)
    }

    @Test
    fun weightConvertsGramsAndSeparatesManualEntries() {
        val from = ms("2026-11-01T00:00:00Z")
        val to = ms("2026-12-01T00:00:00Z")
        val r = utc.body(
            GoogleHealthDataType.WEIGHT,
            listOf(
                DataPoint(weight = GhWeight(st("2026-11-10T07:00:00Z"), 81_250.0), dataSource = GhDataSource(recordingMethod = "PASSIVELY_MEASURED")),
                DataPoint(weight = GhWeight(st("2026-11-11T07:00:00Z"), 80_900.0), dataSource = GhDataSource(recordingMethod = "MANUAL")),
                DataPoint(weight = GhWeight(st("2026-11-12T07:00:00Z"), 5.0)), // 0.005 kg
                DataPoint(weight = GhWeight(null, 80_000.0)),
            ),
            from, to,
        )
        assertEquals(81.25, r.measured.single().value, 1e-9)
        assertEquals(MetricType.WEIGHT, r.measured.single().metric)
        assertEquals(80.9, r.manual.single().value, 1e-9)
        assertEquals(1, r.implausible)
        assertEquals(1, r.malformed)
        val fat = utc.body(
            GoogleHealthDataType.BODY_FAT,
            listOf(DataPoint(bodyFat = GhBodyFat(st("2026-11-10T07:00:00Z"), 18.5))),
            from, to,
        )
        assertEquals(MetricType.BODY_FAT, fat.measured.single().metric)
        assertEquals(18.5, fat.measured.single().value)
    }

    // --- Interval totals -----------------------------------------------------------------------------

    private fun steps(name: String?, start: String, end: String, count: Long?, offset: String? = null) =
        DataPoint(name = name, steps = GhSteps(iv(start, end, offset, offset), count))

    @Test
    fun stepsSumPerCivilDayUsingTheRecordOffset() {
        // 03:30Z is 22:30 the previous evening at -05:00 (the record's own offset wins over the device zone).
        val pts = listOf(
            steps("p/1", "2026-11-10T03:30:00Z", "2026-11-10T03:31:00Z", 100, "-18000s"),
            steps("p/2", "2026-11-10T15:00:00Z", "2026-11-10T15:01:00Z", 250, "-18000s"),
            steps("p/3", "2026-11-10T16:00:00Z", "2026-11-10T16:01:00Z", 50, "-18000s"),
        )
        val m = utc.dailyTotals(GoogleHealthDataType.STEPS, pts, day("2026-11-09"), day("2026-11-10"))
        val byDay = m.items.associate { it.epochDay to it.value }
        assertEquals(100.0, byDay[day("2026-11-09")])
        assertEquals(300.0, byDay[day("2026-11-10")])
        assertEquals(2, m.items.first { it.epochDay == day("2026-11-10") }.sampleCount)
    }

    @Test
    fun stepsWithoutOffsetUseTheZoneRulesAcrossDstEnd() {
        // New York leaves DST on 2026-11-01 at 06:00Z.
        val pts = listOf(
            steps(null, "2026-11-01T03:30:00Z", "2026-11-01T03:31:00Z", 10), // 23:30 EDT, Oct 31
            steps(null, "2026-11-01T04:30:00Z", "2026-11-01T04:31:00Z", 20), // 00:30 EDT, Nov 1
            steps(null, "2026-11-01T05:30:00Z", "2026-11-01T05:31:00Z", 30), // 01:30 EDT, Nov 1
            steps(null, "2026-11-01T06:30:00Z", "2026-11-01T06:31:00Z", 40), // 01:30 EST, Nov 1 (repeated hour)
            steps(null, "2026-11-02T04:30:00Z", "2026-11-02T04:31:00Z", 99), // 23:30 EST, Nov 1
            steps(null, "2026-11-02T05:30:00Z", "2026-11-02T05:31:00Z", 7), // 00:30 EST, Nov 2
        )
        val m = ny.dailyTotals(GoogleHealthDataType.STEPS, pts, day("2026-10-31"), day("2026-11-02"))
        val byDay = m.items.associate { it.epochDay to it.value }
        assertEquals(10.0, byDay[day("2026-10-31")])
        assertEquals(20.0 + 30 + 40 + 99, byDay[day("2026-11-01")])
        assertEquals(7.0, byDay[day("2026-11-02")])
    }

    @Test
    fun duplicatePointsAreCountedOnce() {
        val named = listOf(
            steps("users/me/dataTypes/steps/dataPoints/a", "2026-11-10T10:00:00Z", "2026-11-10T10:01:00Z", 100),
            steps("users/me/dataTypes/steps/dataPoints/a", "2026-11-10T10:00:00Z", "2026-11-10T10:01:00Z", 100), // next page repeats it
            steps("users/me/dataTypes/steps/dataPoints/b", "2026-11-10T10:01:00Z", "2026-11-10T10:02:00Z", 100), // same value, different point
        )
        assertEquals(200.0, utc.dailyTotals(GoogleHealthDataType.STEPS, named, day("2026-11-10"), day("2026-11-10")).items.single().value)
        val unnamed = listOf(
            steps(null, "2026-11-10T10:00:00Z", "2026-11-10T10:01:00Z", 100),
            steps(null, "2026-11-10T10:00:00Z", "2026-11-10T10:01:00Z", 100),
            steps(null, "2026-11-10T10:01:00Z", "2026-11-10T10:02:00Z", 100),
        )
        assertEquals(200.0, utc.dailyTotals(GoogleHealthDataType.STEPS, unnamed, day("2026-11-10"), day("2026-11-10")).items.single().value)
    }

    @Test
    fun totalsSkipOutOfRangeDaysZeroAndBadPoints() {
        val pts = listOf(
            steps("a", "2026-11-09T10:00:00Z", "2026-11-09T10:01:00Z", 100), // before range
            steps("b", "2026-11-10T10:00:00Z", "2026-11-10T10:01:00Z", 0), // zero total: not emitted
            steps("c", "bad", "2026-11-10T10:01:00Z", 5),
            steps("d", "2026-11-10T11:00:00Z", "2026-11-10T11:01:00Z", null),
            steps("e", "2026-11-10T12:00:00Z", "2026-11-10T12:01:00Z", -5),
            DataPoint(distance = GhDistance()), // wrong kind for a steps read
        )
        val m = utc.dailyTotals(GoogleHealthDataType.STEPS, pts, day("2026-11-10"), day("2026-11-10"))
        assertTrue(m.items.isEmpty())
        assertEquals(3, m.malformed)
        assertEquals(1, m.ignored)
    }

    @Test
    fun distanceFloorsAndEnergyUnits() {
        val i = iv("2026-11-10T10:00:00Z", "2026-11-10T10:10:00Z")
        val d = day("2026-11-10")
        val dist = utc.dailyTotals(GoogleHealthDataType.DISTANCE, listOf(DataPoint(name = "a", distance = GhDistance(i, 1_500_000))), d, d)
        assertEquals(MetricType.DISTANCE, dist.items.single().metric)
        assertEquals(1500.0, dist.items.single().value, 1e-9) // mm to m
        val floors = utc.dailyTotals(GoogleHealthDataType.FLOORS, listOf(DataPoint(name = "a", floors = GhFloors(i, 12))), d, d)
        assertEquals(12.0, floors.items.single().value)
        val active = utc.dailyTotals(GoogleHealthDataType.ACTIVE_ENERGY_BURNED, listOf(DataPoint(name = "a", activeEnergyBurned = GhActiveEnergyBurned(i, 321.5))), d, d)
        assertEquals(MetricType.CALORIES_ACTIVE, active.items.single().metric)
        // Basal is never a metric of its own.
        val basal = utc.dailyTotals(GoogleHealthDataType.BASAL_ENERGY_BURNED, listOf(DataPoint(name = "a", basalEnergyBurned = GhBasalEnergyBurned(i, 70.0))), d, d)
        assertTrue(basal.items.isEmpty())
    }

    @Test
    fun totalCaloriesAreActivePlusBasalOnlyWhenBothExist() {
        val d1 = day("2026-11-09")
        val d2 = day("2026-11-10")
        fun act(n: String, day: String, kcal: Double) =
            DataPoint(name = n, activeEnergyBurned = GhActiveEnergyBurned(iv("${day}T10:00:00Z", "${day}T10:10:00Z"), kcal))
        fun bas(n: String, day: String, kcal: Double) =
            DataPoint(name = n, basalEnergyBurned = GhBasalEnergyBurned(iv("${day}T00:00:00Z", "${day}T12:00:00Z"), kcal))
        val m = utc.calories(
            active = listOf(act("a1", "2026-11-09", 300.0), act("a2", "2026-11-09", 100.0), act("a3", "2026-11-10", 200.0)),
            basal = listOf(bas("b1", "2026-11-09", 900.0)), // no basal for the 10th
            fromDay = d1, toDay = d2,
        )
        val byKey = m.items.associate { (it.metric to it.epochDay) to it.value }
        assertEquals(400.0, byKey[MetricType.CALORIES_ACTIVE to d1])
        assertEquals(200.0, byKey[MetricType.CALORIES_ACTIVE to d2])
        assertEquals(1300.0, byKey[MetricType.CALORIES_TOTAL to d1])
        assertNull(byKey[MetricType.CALORIES_TOTAL to d2]) // missing half stays missing
    }

    @Test
    fun activeZoneMinutesActiveMinutesAndSedentary() {
        val d = day("2026-11-10")
        val i = iv("2026-11-10T10:00:00Z", "2026-11-10T10:05:00Z")
        val azm = utc.dailyTotals(
            GoogleHealthDataType.ACTIVE_ZONE_MINUTES,
            listOf(
                DataPoint(name = "a", activeZoneMinutes = GhActiveZoneMinutes(i, "FAT_BURN", 5)),
                DataPoint(name = "b", activeZoneMinutes = GhActiveZoneMinutes(i, "FUTURE_ZONE", 8)), // unknown zone still counts
            ),
            d, d,
        )
        assertEquals(MetricType.ACTIVE_ZONE_MINUTES, azm.items.single().metric)
        assertEquals(13.0, azm.items.single().value)

        val am = utc.dailyTotals(
            GoogleHealthDataType.ACTIVE_MINUTES,
            listOf(
                DataPoint(
                    name = "a",
                    activeMinutes = GhActiveMinutes(
                        i,
                        listOf(
                            GhActiveMinutesByLevel("LIGHT", 3),
                            GhActiveMinutesByLevel("MODERATE", 2),
                            GhActiveMinutesByLevel("VIGOROUS", 1),
                            GhActiveMinutesByLevel("ULTRA", 9), // unknown level: left out
                        ),
                    ),
                ),
            ),
            d, d,
        )
        assertEquals(
            mapOf(MetricType.LIGHTLY_ACTIVE_MINUTES to 3.0, MetricType.MODERATELY_ACTIVE_MINUTES to 2.0, MetricType.VERY_ACTIVE_MINUTES to 1.0),
            am.items.associate { it.metric to it.value },
        )

        val sed = utc.dailyTotals(
            GoogleHealthDataType.SEDENTARY_PERIOD,
            listOf(
                DataPoint(name = "a", sedentaryPeriod = GhSedentaryPeriod(iv("2026-11-10T10:00:00Z", "2026-11-10T10:45:00Z"))),
                DataPoint(name = "b", sedentaryPeriod = GhSedentaryPeriod(iv("2026-11-10T12:00:00Z", "2026-11-10T12:15:00Z"))),
            ),
            d, d,
        )
        assertEquals(MetricType.SEDENTARY_MINUTES, sed.items.single().metric)
        assertEquals(60.0, sed.items.single().value, 1e-9)
    }

    // --- Sleep ---------------------------------------------------------------------------------------

    private fun stage(type: String, s: String, e: String) = GhSleepStage(type = type, startTime = s, endTime = e)

    @Test
    fun sleepAcrossMidnightKeepsOffsetsStagesAndSummary() {
        // Local 23:10 (Nov 9) to 06:40 (Nov 10) at -05:00.
        val sleep = GhSleep(
            type = "STAGES",
            interval = iv("2026-11-10T04:10:00Z", "2026-11-10T11:40:00Z", "-18000s", "-18000s"),
            stages = listOf(
                stage("LIGHT", "2026-11-10T04:10:00Z", "2026-11-10T05:00:00Z"),
                stage("DEEP", "2026-11-10T05:00:00Z", "2026-11-10T06:00:00Z"),
                stage("MYSTERY", "2026-11-10T06:00:00Z", "2026-11-10T06:30:00Z"), // unknown: dropped
                stage("REM", "2026-11-10T06:30:00Z", "2026-11-10T12:30:00Z"), // runs past the end: clamped
                stage("AWAKE", "bad", "2026-11-10T12:30:00Z"), // unreadable: dropped
            ),
            summary = GhSleepSummary(minutesAsleep = 400, minutesAwake = 30, minutesToFallAsleep = 12),
            metadata = GhSleepMetadata(mainSleep = true, nap = false),
        )
        val m = utc.sleeps(listOf(DataPoint(name = "users/me/dataTypes/sleep/dataPoints/777", sleep = sleep)))
        val s = m.items.single()
        assertEquals("gh:sleep:777", s.id)
        assertEquals(ms("2026-11-10T04:10:00Z"), s.startEpochMillis)
        assertEquals(ms("2026-11-10T11:40:00Z"), s.endEpochMillis)
        assertEquals(-18000, s.startZoneOffsetSeconds)
        assertEquals(-18000, s.endZoneOffsetSeconds)
        assertEquals(true, s.isMainSleep)
        assertEquals(false, s.isNap)
        assertEquals(400, s.minutesAsleep)
        assertEquals(30, s.minutesAwake)
        assertEquals(12, s.minutesToFallAsleep)
        assertEquals(listOf(SleepStage.LIGHT, SleepStage.DEEP, SleepStage.REM), s.stages.map { it.stage })
        assertEquals(ms("2026-11-10T11:40:00Z"), s.stages.last().endEpochMillis) // clamped to the session
        assertEquals(0, m.malformed)
    }

    @Test
    fun sleepOnTheNightTheClocksGoBackHasDifferentOffsetsAtStartAndEnd() {
        // 2026-11-01: 22:30 EDT (-4h) to 06:30 EST (-5h) is 9 hours elapsed.
        val sleep = GhSleep(interval = iv("2026-11-02T02:30:00Z", "2026-11-02T11:30:00Z", "-14400s", "-18000s"))
        val s = ny.sleeps(listOf(DataPoint(name = "x/1", sleep = sleep))).items.single()
        assertEquals(-14400, s.startZoneOffsetSeconds)
        assertEquals(-18000, s.endZoneOffsetSeconds)
        assertEquals(9 * 60L, (s.endEpochMillis - s.startEpochMillis) / 60_000)
        assertNull(s.isMainSleep)
        assertNull(s.minutesAsleep) // no summary: stays missing, the ingestor derives from stages or duration
    }

    @Test
    fun sleepWithoutOffsetsUsesTheZoneRules() {
        // The clocks go back at 06:00Z on 2026-11-01: a night before it is EDT, a night after it is EST.
        val before = GhSleep(interval = iv("2026-10-31T02:30:00Z", "2026-10-31T10:30:00Z"))
        val after = GhSleep(interval = iv("2026-11-02T02:30:00Z", "2026-11-02T11:30:00Z"))
        val a = ny.sleeps(listOf(DataPoint(name = "x/2", sleep = before))).items.single()
        val b = ny.sleeps(listOf(DataPoint(name = "x/3", sleep = after))).items.single()
        assertEquals(-14400, a.startZoneOffsetSeconds)
        assertEquals(-18000, b.startZoneOffsetSeconds)
    }

    @Test
    fun sleepMalformedUnnamedAndRevisedCopies() {
        val ok = GhSleep(interval = iv("2026-11-10T04:10:00Z", "2026-11-10T11:40:00Z", "0s", "0s"))
        val revised = ok.copy(summary = GhSleepSummary(minutesAsleep = 410))
        val m = utc.sleeps(
            listOf(
                DataPoint(name = "n/9", sleep = ok),
                DataPoint(name = "n/9", sleep = revised), // same night read twice: the later copy wins
                DataPoint(sleep = GhSleep(interval = iv("2026-11-10T12:00:00Z", "2026-11-10T11:00:00Z"))), // ends before it starts
                DataPoint(sleep = GhSleep(interval = null)),
                DataPoint(sleep = ok.copy(interval = iv("2026-11-10T13:00:00Z", "2026-11-10T13:45:00Z"))), // unnamed: id from start
                DataPoint(steps = GhSteps()),
            ),
        )
        assertEquals(2, m.items.size)
        assertEquals(410, m.items.first { it.id == "gh:sleep:9" }.minutesAsleep)
        assertTrue(m.items.any { it.id == "gh:sleep:${ms("2026-11-10T13:00:00Z")}" })
        assertEquals(2, m.malformed)
        assertEquals(1, m.ignored)
        // Out of range minutes are dropped rather than trusted.
        val absurd = utc.sleeps(listOf(DataPoint(name = "n/1", sleep = ok.copy(summary = GhSleepSummary(minutesAsleep = 999_999)))))
        assertNull(absurd.items.single().minutesAsleep)
    }

    // --- Exercise ------------------------------------------------------------------------------------

    @Test
    fun exerciseUnitsTrimmingAndTolerance() {
        val from = ms("2026-11-10T00:00:00Z")
        val to = ms("2026-11-11T00:00:00Z")
        fun ex(name: String, start: String, end: String, type: String? = "RUNNING", display: String? = "Morning run") = DataPoint(
            name = "users/me/dataTypes/exercise/dataPoints/$name",
            exercise = GhExercise(
                exerciseType = type, displayName = display,
                interval = iv(start, end, "3600s", "3600s"),
                activeDuration = "1500s",
                metricsSummary = GhMetricsSummary(
                    caloriesKcal = 410.5, distanceMillimeters = 5_200_000.0, steps = 6100,
                    averageHeartRateBeatsPerMinute = 152, activeZoneMinutes = 31, elevationGainMillimeters = 42_000.0,
                ),
            ),
        )
        val m = utc.workouts(
            listOf(
                ex("w1", "2026-11-10T06:00:00Z", "2026-11-10T06:30:00Z"),
                ex("w2", "2026-11-09T23:59:00Z", "2026-11-10T00:30:00Z"), // started before the window: trimmed (widened server filter)
                ex("w3", "2026-11-10T08:00:00Z", "2026-11-10T08:45:00Z", type = "HOVERBOARDING", display = null), // unknown type kept as text
                ex("w4", "2026-11-10T09:00:00Z", "2026-11-10T08:00:00Z"), // ends before it starts
                DataPoint(steps = GhSteps()),
            ),
            from, to,
        )
        assertEquals(listOf("gh:exercise:w1", "gh:exercise:w3"), m.items.map { it.id })
        val w = m.items.first()
        assertEquals("RUNNING", w.exerciseType)
        assertEquals("Morning run", w.displayName)
        assertEquals(3600, w.zoneOffsetSeconds)
        assertEquals(1_500_000L, w.activeDurationMillis)
        assertEquals(5200.0, w.distanceMeters!!, 1e-9) // mm to m
        assertEquals(42.0, w.elevationGainMeters!!, 1e-9)
        assertEquals(410.5, w.caloriesKcal)
        assertEquals(6100L, w.steps)
        assertEquals(152, w.averageHeartRate)
        assertNull(w.maxHeartRate)
        assertEquals(31, w.activeZoneMinutes)
        val unknown = m.items[1]
        assertEquals("HOVERBOARDING", unknown.exerciseType)
        assertEquals("Hoverboarding", unknown.displayName)
        assertEquals(1, m.malformed)
        assertEquals(1, m.ignored)
    }

    @Test
    fun exerciseWithoutSummaryKeepsMissingValuesMissing() {
        val p = DataPoint(name = "e/1", exercise = GhExercise(interval = iv("2026-11-10T06:00:00Z", "2026-11-10T06:30:00Z")))
        val w = utc.workouts(listOf(p), ms("2026-11-10T00:00:00Z"), ms("2026-11-11T00:00:00Z")).items.single()
        assertNull(w.caloriesKcal)
        assertNull(w.distanceMeters)
        assertNull(w.steps)
        assertNull(w.averageHeartRate)
        assertEquals("OTHER", w.exerciseType)
        assertEquals(30 * 60_000L, w.activeDurationMillis) // no activeDuration: the whole interval
    }

    // --- Real JSON shapes ----------------------------------------------------------------------------

    @Test
    fun decodedJsonWithStringInt64AndUnknownFieldsMaps() {
        val body = """
            {"name":"users/me/dataTypes/steps/dataPoints/abc","futureField":{"x":1},
             "steps":{"count":"1234","interval":{"startTime":"2026-11-10T10:00:00Z","endTime":"2026-11-10T10:01:00Z","startUtcOffset":"-18000s","endUtcOffset":"-18000s"},"newThing":true}}
        """.trimIndent()
        val p = NetworkJson.instance.decodeFromString(DataPoint.serializer(), body)
        val m = utc.dailyTotals(GoogleHealthDataType.STEPS, listOf(p), day("2026-11-10"), day("2026-11-10"))
        assertEquals(1234.0, m.items.single().value)
    }

    // --- sleep-stage HRV, estimated VO2, non-REM HR --------------------------------------------------

    private fun night(vararg stages: Triple<SleepStage, String, String>) = SleepObservation(
        id = "gh:sleep:n", startEpochMillis = ms("2026-11-10T22:00:00Z"), endEpochMillis = ms("2026-11-11T06:00:00Z"),
        startZoneOffsetSeconds = 0, endZoneOffsetSeconds = 0,
        stages = stages.map { (st, a, b) -> SleepStageObservation(ms(a), ms(b), st) },
    )

    private fun hrv(iso: String, v: Double?) = DataPoint(heartRateVariability = GhHeartRateVariability(rootMeanSquareOfSuccessiveDifferencesMilliseconds = v, sampleTime = st(iso)))

    @Test
    fun sleepHrvExcludesAwakeAndRestlessSegmentsAndOutOfNightSamples() {
        val n = night(
            Triple(SleepStage.LIGHT, "2026-11-10T22:00:00Z", "2026-11-11T02:00:00Z"),
            Triple(SleepStage.AWAKE, "2026-11-11T02:00:00Z", "2026-11-11T03:00:00Z"),
            Triple(SleepStage.RESTLESS, "2026-11-11T03:00:00Z", "2026-11-11T03:30:00Z"),
            Triple(SleepStage.REM, "2026-11-11T03:30:00Z", "2026-11-11T06:00:00Z"),
        )
        val out = utc.hrvDuringSleep(
            n,
            listOf(
                hrv("2026-11-10T23:00:00Z", 30.0),
                hrv("2026-11-11T02:30:00Z", 300.0), // awake
                hrv("2026-11-11T03:10:00Z", 250.0), // restless
                hrv("2026-11-11T04:00:00Z", 50.0),
                hrv("2026-11-11T04:00:00Z", 50.0), // same instant twice
                hrv("2026-11-11T06:00:00Z", 90.0), // at the end: outside [start, end)
                hrv("2026-11-10T21:00:00Z", 90.0), // before bed
                hrv("2026-11-11T05:00:00Z", null), // malformed
            ),
        )
        val row = out.items.single()
        assertEquals(MetricType.HRV_SLEEP_SAMPLES, row.metric)
        assertEquals(40.0, row.value, 1e-9)
        assertEquals(2, row.sampleCount)
        assertEquals(day("2026-11-11"), row.epochDay)
        assertEquals(1, out.malformed)
    }

    @Test
    fun sleepHrvNeedsStagesAndAnAsleepSample() {
        assertTrue(utc.hrvDuringSleep(night(), listOf(hrv("2026-11-11T01:00:00Z", 50.0))).items.isEmpty())
        val awakeOnly = night(Triple(SleepStage.AWAKE, "2026-11-10T22:00:00Z", "2026-11-11T06:00:00Z"))
        assertTrue(utc.hrvDuringSleep(awakeOnly, listOf(hrv("2026-11-11T01:00:00Z", 50.0))).items.isEmpty())
        val implausible = night(Triple(SleepStage.DEEP, "2026-11-10T22:00:00Z", "2026-11-11T06:00:00Z"))
        val out = utc.hrvDuringSleep(implausible, listOf(hrv("2026-11-11T01:00:00Z", 900.0)))
        assertTrue(out.items.isEmpty())
        assertEquals(1, out.implausible)
    }

    @Test
    fun vo2MaxIsSplitByTheEstimatedFlag() {
        fun p(dayOfMonth: Int, v: Double, est: Boolean?) = DataPoint(dailyVo2Max = GhDailyVo2Max(GhDate(2026, 11, dayOfMonth), v, "GOOD", est))
        val out = utc.dailyVo2Max(listOf(p(8, 41.0, true), p(9, 42.0, false), p(10, 43.0, null), p(11, 500.0, true)))
        assertEquals(listOf(41.0), out.estimated.map { it.value })
        assertEquals(listOf(42.0, 43.0), out.measured.map { it.value })
        assertEquals(1, out.implausible)
        assertTrue((out.measured + out.estimated).all { it.metric == MetricType.VO2_MAX })
    }

    @Test
    fun nonRemHeartRateBecomesTheObservedSleepingHeartRate() {
        val d = date("2026-11-10")
        val out = utc.daily(
            GoogleHealthDataType.DAILY_HEART_RATE_VARIABILITY,
            listOf(DataPoint(dailyHeartRateVariability = GhDailyHeartRateVariability(nonRemHeartRateBeatsPerMinute = 54, date = d))),
        )
        assertEquals(listOf(MetricType.SLEEPING_HEART_RATE to 54.0), out.items.map { it.metric to it.value })
        val bad = utc.daily(
            GoogleHealthDataType.DAILY_HEART_RATE_VARIABILITY,
            listOf(DataPoint(dailyHeartRateVariability = GhDailyHeartRateVariability(nonRemHeartRateBeatsPerMinute = 5, date = d))),
        )
        assertTrue(bad.items.isEmpty())
        assertEquals(1, bad.implausible)
    }
}
