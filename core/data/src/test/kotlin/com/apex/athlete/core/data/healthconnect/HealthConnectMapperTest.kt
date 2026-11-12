package com.apex.athlete.core.data.healthconnect

import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SleepStage
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class HealthConnectMapperTest {

    private val utc = ZoneId.of("UTC")
    private val newYork = ZoneId.of("America/New_York")
    private val mapper = HealthConnectMapper(utc, listOf("com.fitbit.FitbitMobile"))

    private fun ms(iso: String) = Instant.parse(iso).toEpochMilli()
    private fun day(iso: String) = LocalDate.parse(iso).toEpochDay()

    private fun steps(origin: String, start: String, end: String, n: Double, off: Int? = null) =
        HcIntervalRecord(HcFamily.STEPS, origin, ms(start), ms(end), off, off, n)

    @Test fun `every platform stage value maps and unknown values are dropped`() {
        assertEquals(SleepStage.AWAKE, mapper.mapStage(HealthConnectMapper.STAGE_AWAKE))
        assertEquals(SleepStage.AWAKE, mapper.mapStage(HealthConnectMapper.STAGE_AWAKE_IN_BED))
        assertEquals(SleepStage.AWAKE, mapper.mapStage(HealthConnectMapper.STAGE_OUT_OF_BED))
        assertEquals(SleepStage.ASLEEP, mapper.mapStage(HealthConnectMapper.STAGE_SLEEPING))
        assertEquals(SleepStage.LIGHT, mapper.mapStage(HealthConnectMapper.STAGE_LIGHT))
        assertEquals(SleepStage.DEEP, mapper.mapStage(HealthConnectMapper.STAGE_DEEP))
        assertEquals(SleepStage.REM, mapper.mapStage(HealthConnectMapper.STAGE_REM))
        assertNull(mapper.mapStage(HealthConnectMapper.STAGE_UNKNOWN))
        assertNull(mapper.mapStage(99))
    }

    @Test fun `sleep crossing midnight keeps offsets and clips stages`() {
        val start = ms("2026-03-10T03:30:00Z") // 22:30 the evening before at UTC-5
        val end = ms("2026-03-10T11:00:00Z") // 06:00 local
        val rec = HcSleepRecord(
            "abc", "com.fitbit.FitbitMobile", start, end, -18000, -18000,
            listOf(
                HcSleepStage(start - 60_000, start + 30 * 60_000, HealthConnectMapper.STAGE_LIGHT), // starts before the session
                HcSleepStage(start + 30 * 60_000, start + 90 * 60_000, HealthConnectMapper.STAGE_DEEP),
                HcSleepStage(start + 90 * 60_000, start + 91 * 60_000, 42), // unknown, dropped
                HcSleepStage(end - 10 * 60_000, end + 5 * 60_000, HealthConnectMapper.STAGE_AWAKE), // runs past the end
            ),
        )
        val s = mapper.sleeps(listOf(rec)).single()
        assertEquals("hc:sleep:abc", s.id)
        assertEquals(-18000, s.startZoneOffsetSeconds)
        assertEquals(-18000, s.endZoneOffsetSeconds)
        assertNull(s.isNap)
        assertNull(s.isMainSleep)
        assertEquals(3, s.stages.size)
        assertEquals(start, s.stages.first().startEpochMillis)
        assertEquals(end, s.stages.last().endEpochMillis)
        assertEquals(day("2026-03-10"), mapper.epochDay(end, -18000))
        assertEquals(day("2026-03-09"), mapper.epochDay(start, -18000))
    }

    @Test fun `two sessions in one night and a nap all survive with distinct ids`() {
        val a = HcSleepRecord("a", "o", ms("2026-03-10T00:00:00Z"), ms("2026-03-10T03:00:00Z"), 0, 0, emptyList())
        val b = HcSleepRecord("b", "o", ms("2026-03-10T03:40:00Z"), ms("2026-03-10T07:00:00Z"), 0, 0, emptyList())
        val nap = HcSleepRecord("n", "o", ms("2026-03-10T14:00:00Z"), ms("2026-03-10T14:25:00Z"), 0, 0, emptyList())
        val out = mapper.sleeps(listOf(a, b, nap, a))
        assertEquals(listOf("hc:sleep:a", "hc:sleep:b", "hc:sleep:n"), out.map { it.id })
    }

    @Test fun `missing offset falls back to the zone rules at that instant (DST)`() {
        val ny = HealthConnectMapper(newYork)
        assertEquals(-5 * 3600, ny.offsetSeconds(ms("2026-03-08T06:59:00Z"), null))
        assertEquals(-4 * 3600, ny.offsetSeconds(ms("2026-03-08T07:01:00Z"), null))
        // An out-of-range offset from a writer is ignored rather than trusted.
        assertEquals(-5 * 3600, ny.offsetSeconds(ms("2026-01-08T07:01:00Z"), 999_999))
        // 04:59Z is 23:59 on Mar 7 in New York; 05:00Z is 00:00 on Mar 8.
        assertEquals(day("2026-03-07"), ny.epochDay(ms("2026-03-08T04:59:00Z"), null))
        assertEquals(day("2026-03-08"), ny.epochDay(ms("2026-03-08T05:00:00Z"), null))
    }

    @Test fun `steps are totalled per local civil day`() {
        val ny = HealthConnectMapper(newYork)
        val recs = listOf(
            steps("o", "2026-03-08T04:30:00Z", "2026-03-08T04:40:00Z", 100.0), // Mar 7 local
            steps("o", "2026-03-08T04:50:00Z", "2026-03-08T04:59:00Z", 50.0), // Mar 7 local
            steps("o", "2026-03-08T05:00:00Z", "2026-03-08T05:10:00Z", 70.0), // Mar 8 local
        )
        val out = ny.dailyTotals(recs, MetricType.STEPS, day("2026-03-07"), day("2026-03-08"))
        assertEquals(listOf(150.0, 70.0), out.map { it.value })
        assertEquals(listOf(day("2026-03-07"), day("2026-03-08")), out.map { it.epochDay })
        // Days outside the requested range are not emitted.
        assertEquals(1, ny.dailyTotals(recs, MetricType.STEPS, day("2026-03-08"), day("2026-03-08")).size)
    }

    @Test fun `two apps writing the same steps are never added together`() {
        val recs = listOf(
            steps("phone.pedometer", "2026-03-10T08:00:00Z", "2026-03-10T09:00:00Z", 3000.0),
            steps("phone.pedometer", "2026-03-10T10:00:00Z", "2026-03-10T11:00:00Z", 2000.0),
            steps("other.band", "2026-03-10T08:00:00Z", "2026-03-10T11:00:00Z", 4000.0),
        )
        val d = day("2026-03-10")
        // No preferred origin present: the larger total wins, not the sum.
        assertEquals(5000.0, mapper.dailyTotals(recs, MetricType.STEPS, d, d).single().value)
        // The preferred origin wins even when smaller.
        val withPreferred = recs + steps("com.fitbit.FitbitMobile", "2026-03-10T08:00:00Z", "2026-03-10T09:00:00Z", 1200.0)
        assertEquals(1200.0, mapper.dailyTotals(withPreferred, MetricType.STEPS, d, d).single().value)
    }

    @Test fun `zero and negative totals are missing not zero`() {
        val recs = listOf(steps("o", "2026-03-10T08:00:00Z", "2026-03-10T09:00:00Z", 0.0), steps("o", "2026-03-11T08:00:00Z", "2026-03-11T09:00:00Z", -5.0))
        assertTrue(mapper.dailyTotals(recs, MetricType.STEPS, day("2026-03-10"), day("2026-03-11")).isEmpty())
    }

    private fun reading(family: HcFamily, t: String, v: Double) = HcInstantRecord(family, "o", ms(t), 0, v)

    @Test fun `nightly mean uses the main sleep only and excludes implausible readings`() {
        val main = HcSleepRecord("m", "o", ms("2026-03-10T00:00:00Z"), ms("2026-03-10T07:00:00Z"), 0, 0, emptyList())
        val nap = HcSleepRecord("n", "o", ms("2026-03-10T14:00:00Z"), ms("2026-03-10T14:30:00Z"), 0, 0, emptyList())
        val readings = listOf(
            reading(HcFamily.HRV_RMSSD, "2026-03-10T02:00:00Z", 60.0),
            reading(HcFamily.HRV_RMSSD, "2026-03-10T04:00:00Z", 80.0),
            reading(HcFamily.HRV_RMSSD, "2026-03-10T05:00:00Z", 0.0), // implausible
            reading(HcFamily.HRV_RMSSD, "2026-03-10T05:30:00Z", 900.0), // implausible
            reading(HcFamily.HRV_RMSSD, "2026-03-10T10:00:00Z", 20.0), // awake daytime: not part of the night
            reading(HcFamily.HRV_RMSSD, "2026-03-10T14:10:00Z", 10.0), // nap: not the main sleep
        )
        val from = ms("2026-03-10T00:00:00Z")
        val to = ms("2026-03-11T00:00:00Z")
        val daily = mapper.nightlyMean(readings, listOf(main, nap), MetricType.HRV_RMSSD, from, to).single()
        assertEquals(70.0, daily.value)
        assertEquals(2, daily.sampleCount)
        assertEquals(day("2026-03-10"), daily.epochDay)
        // Raw samples pass through untouched, including the implausible ones, so the ingestor can count them.
        assertEquals(6, mapper.samples(readings, MetricType.HRV_RMSSD, from, to).size)
    }

    @Test fun `a nightly reading stamped up to two minutes after the sleep ends still belongs to the night`() {
        val main = HcSleepRecord("m", "o", ms("2026-03-10T00:00:00Z"), ms("2026-03-10T07:00:00Z"), 0, 0, emptyList())
        val from = ms("2026-03-10T00:00:00Z")
        val to = ms("2026-03-11T00:00:00Z")
        // Fitbit stamps its one nightly value at or just after the end of the sleep.
        val r = listOf(reading(HcFamily.HRV_RMSSD, "2026-03-10T07:01:30Z", 64.0))
        assertEquals(64.0, mapper.nightlyMean(r, listOf(main), MetricType.HRV_RMSSD, from, to).single().value)
        val atEdge = listOf(reading(HcFamily.HRV_RMSSD, "2026-03-10T07:02:00Z", 64.0))
        assertEquals(1, mapper.nightlyMean(atEdge, listOf(main), MetricType.HRV_RMSSD, from, to).size)
        // Three minutes later it is a daytime reading again.
        val late = listOf(reading(HcFamily.HRV_RMSSD, "2026-03-10T07:03:00Z", 64.0))
        assertTrue(mapper.nightlyMean(late, listOf(main), MetricType.HRV_RMSSD, from, to).isEmpty())
        // A reading before the sleep started is still outside the night.
        val early = listOf(reading(HcFamily.HRV_RMSSD, "2026-03-09T23:59:00Z", 64.0))
        assertTrue(mapper.nightlyMean(early, listOf(main), MetricType.HRV_RMSSD, from, to).isEmpty())
        // The same tolerance applies to SpO2.
        val spo2 = listOf(reading(HcFamily.OXYGEN_SATURATION, "2026-03-10T07:01:00Z", 95.0))
        assertEquals(3, mapper.nightlySpo2(spo2, listOf(main), from, to).size)
    }

    @Test fun `a night belongs to exactly one window and no sleep means no daily value`() {
        val main = HcSleepRecord("m", "o", ms("2026-03-10T00:00:00Z"), ms("2026-03-10T07:00:00Z"), 0, 0, emptyList())
        val r = listOf(reading(HcFamily.HRV_RMSSD, "2026-03-10T02:00:00Z", 60.0))
        val before = mapper.nightlyMean(r, listOf(main), MetricType.HRV_RMSSD, ms("2026-03-09T00:00:00Z"), ms("2026-03-10T07:00:00Z"))
        val after = mapper.nightlyMean(r, listOf(main), MetricType.HRV_RMSSD, ms("2026-03-10T07:00:00Z"), ms("2026-03-11T00:00:00Z"))
        assertTrue(before.isEmpty()) // end == window end is excluded (half-open)
        assertEquals(1, after.size)
        assertTrue(mapper.nightlyMean(r, emptyList(), MetricType.HRV_RMSSD, 0, Long.MAX_VALUE / 2).isEmpty())
    }

    @Test fun `spo2 night yields mean low and high`() {
        val main = HcSleepRecord("m", "o", ms("2026-03-10T00:00:00Z"), ms("2026-03-10T07:00:00Z"), 0, 0, emptyList())
        val r = listOf(
            reading(HcFamily.OXYGEN_SATURATION, "2026-03-10T01:00:00Z", 96.0),
            reading(HcFamily.OXYGEN_SATURATION, "2026-03-10T02:00:00Z", 92.0),
            reading(HcFamily.OXYGEN_SATURATION, "2026-03-10T03:00:00Z", 98.0),
            reading(HcFamily.OXYGEN_SATURATION, "2026-03-10T04:00:00Z", 12.0), // implausible
        )
        val out = mapper.nightlySpo2(r, listOf(main), 0, ms("2026-03-11T00:00:00Z")).associateBy { it.metric }
        assertEquals(95.333, out.getValue(MetricType.SPO2_AVG).value, 0.001)
        assertEquals(92.0, out.getValue(MetricType.SPO2_LOWER_BOUND).value)
        assertEquals(98.0, out.getValue(MetricType.SPO2_UPPER_BOUND).value)
    }

    @Test fun `heart rate points are clipped to the window and not range checked here`() {
        val rec = HcHeartRateRecord("o", listOf(HcHrSample(1_000, 60), HcHrSample(2_000, 0), HcHrSample(3_000, 70), HcHrSample(4_000, -5)))
        val out = mapper.heartRate(listOf(rec), 1_000, 3_000)
        assertEquals(listOf(60, 0), out.map { it.bpm }) // 0 reaches the ingestor, which rejects and counts it
    }

    @Test fun `latest reading per day and implausible resting heart rate skipped`() {
        val recs = listOf(
            HcInstantRecord(HcFamily.RESTING_HEART_RATE, "o", ms("2026-03-10T06:00:00Z"), 0, 52.0),
            HcInstantRecord(HcFamily.RESTING_HEART_RATE, "o", ms("2026-03-10T18:00:00Z"), 0, 54.0),
            HcInstantRecord(HcFamily.RESTING_HEART_RATE, "o", ms("2026-03-11T06:00:00Z"), 0, 3.0),
        )
        val out = mapper.latestPerDay(recs, MetricType.RESTING_HEART_RATE, day("2026-03-10"), day("2026-03-11"))
        assertEquals(1, out.size)
        assertEquals(54.0, out.single().value)
    }

    @Test fun `skin temperature gives deviation and absolute value only with a baseline`() {
        fun rec(baseline: Double?) = HcSkinTempRecord(
            "o", ms("2026-03-10T00:00:00Z"), ms("2026-03-10T07:00:00Z"), 0, 0, baseline,
            listOf(HcTimedValue(ms("2026-03-10T02:00:00Z"), 0.2), HcTimedValue(ms("2026-03-10T03:00:00Z"), 0.4), HcTimedValue(ms("2026-03-10T04:00:00Z"), 55.0)),
        )
        val to = ms("2026-03-11T00:00:00Z")
        val with = mapper.skinTemperature(listOf(rec(34.0)), 0, to).associateBy { it.metric }
        assertEquals(0.3, with.getValue(MetricType.SKIN_TEMP_DEVIATION).value, 1e-9)
        assertEquals(34.3, with.getValue(MetricType.SKIN_TEMP_NIGHTLY).value, 1e-9)
        val without = mapper.skinTemperature(listOf(rec(null)), 0, to)
        assertEquals(listOf(MetricType.SKIN_TEMP_DEVIATION), without.map { it.metric })
    }

    @Test fun `exercise matches heart rate energy and distance from the same app only`() {
        val s = HcExerciseRecord("e1", "app.a", ms("2026-03-10T10:00:00Z"), ms("2026-03-10T11:00:00Z"), 0, "RUNNING", null)
        fun hr(origin: String, vararg b: Long) = HcHeartRateRecord(origin, b.mapIndexed { i, v -> HcHrSample(s.startEpochMillis + i * 60_000L, v) })
        fun interval(f: HcFamily, origin: String, a: String, b: String, v: Double) = HcIntervalRecord(f, origin, ms(a), ms(b), 0, 0, v)
        val w = assertNotNull(
            mapper.workout(
                s,
                heartRate = listOf(hr("app.a", 140, 160, 0, 150), hr("app.b", 60, 60)),
                calories = listOf(
                    interval(HcFamily.TOTAL_CALORIES, "app.a", "2026-03-10T09:30:00Z", "2026-03-10T10:30:00Z", 400.0), // half overlaps
                    interval(HcFamily.TOTAL_CALORIES, "app.b", "2026-03-10T10:00:00Z", "2026-03-10T11:00:00Z", 999.0),
                ),
                distance = listOf(interval(HcFamily.DISTANCE, "app.a", "2026-03-10T10:00:00Z", "2026-03-10T11:00:00Z", 10_000.0)),
                steps = emptyList(),
            ),
        )
        assertEquals("hc:exercise:e1", w.id)
        assertEquals("RUNNING", w.exerciseType)
        assertEquals("Running", w.displayName)
        assertEquals(150, w.averageHeartRate) // the 0 dropout is ignored
        assertEquals(160, w.maxHeartRate)
        assertEquals(200.0, assertNotNull(w.caloriesKcal), 1e-9)
        assertEquals(10_000.0, assertNotNull(w.distanceMeters))
        assertNull(w.steps)
        assertEquals(3_600_000L, w.activeDurationMillis)
    }

    @Test fun `exercise without supporting records keeps those fields missing`() {
        val s = HcExerciseRecord("e2", "app.a", ms("2026-03-10T10:00:00Z"), ms("2026-03-10T10:30:00Z"), 3600, "OTHER_WORKOUT", "  Park run ")
        val w = assertNotNull(mapper.workout(s, emptyList(), emptyList(), emptyList(), emptyList()))
        assertNull(w.averageHeartRate)
        assertNull(w.caloriesKcal)
        assertEquals("Park run", w.displayName)
        assertEquals(3600, w.zoneOffsetSeconds)
        assertNull(mapper.workout(s.copy(endEpochMillis = s.startEpochMillis), emptyList(), emptyList(), emptyList(), emptyList()))
    }
}
