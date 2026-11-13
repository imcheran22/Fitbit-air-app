package com.apex.athlete.core.database

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.database.entity.DailyBiometricSummaryEntity
import com.apex.athlete.core.database.entity.IntradayHeartRateEntity
import com.apex.athlete.core.database.entity.MetricSampleEntity
import com.apex.athlete.core.database.entity.SleepSessionEntity
import com.apex.athlete.core.database.entity.SleepStageSegmentEntity
import com.apex.athlete.core.database.entity.SyncWatermarkEntity
import com.apex.athlete.core.database.entity.WorkoutEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.domain.SyncSource
import com.apex.athlete.core.domain.SyncStatus
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Exercises the DAOs against a real SQLite engine (in memory, unencrypted: encryption is a
 * property of the file-backed factory and needs a device, the SQL is identical).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ApexDatabaseTest {

    private lateinit var db: ApexDatabase

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, ApexDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private fun daily(
        metric: MetricType,
        day: Long,
        value: Double,
        provenance: DataProvenance = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API,
        updatedAt: Long = 1L,
        resolution: Int? = null,
    ) = DailyBiometricSummaryEntity(
        metricType = metric, epochDay = day, value = value, provenance = provenance,
        sourceResolutionSeconds = resolution, updatedAtEpochMillis = updatedAt,
    )

    @Test
    fun rollingStatsMatchHandComputedMeanAndSampleVariance() = runBlocking {
        val dao = db.dailyBiometricSummaryDao()
        val values = listOf(50.0, 52.0, 54.0, 56.0, 58.0, 60.0, 62.0)
        dao.upsertAll(values.mapIndexed { i, v -> daily(MetricType.HRV_RMSSD, 100L + i, v) })
        // Other metrics and out-of-range days must not leak into the aggregate.
        dao.upsertAll(listOf(daily(MetricType.RESTING_HEART_RATE, 101, 999.0), daily(MetricType.HRV_RMSSD, 200, 999.0)))

        val stats = dao.rollingStats(MetricType.HRV_RMSSD, 100, 106)
        assertEquals(7, stats.n)
        assertEquals(56.0, stats.mean!!, 1e-9)
        assertEquals(112.0 / 6.0, stats.sampleVariance!!, 1e-9)
        assertEquals(50.0, stats.min!!, 1e-9)
        assertEquals(62.0, stats.max!!, 1e-9)

        val single = dao.rollingStats(MetricType.HRV_RMSSD, 100, 100)
        assertEquals(1, single.n)
        assertNull(single.sampleVariance)

        val empty = dao.rollingStats(MetricType.SPO2_AVG, 100, 106)
        assertEquals(0, empty.n)
        assertNull(empty.mean)
    }

    @Test
    fun rollingWindowSeriesUsesCalendarDayWindows() = runBlocking {
        val dao = db.dailyBiometricSummaryDao()
        // Days 100..109 hold 10,20,...,100; day 105 is missing.
        dao.upsertAll((0..9).filter { it != 5 }.map { daily(MetricType.RESTING_HEART_RATE, 100L + it, (it + 1) * 10.0) })

        val rows = dao.rollingWindowSeries(MetricType.RESTING_HEART_RATE, 106, 109)
        assertEquals(listOf(106L, 107L, 108L, 109L), rows.map { it.epochDay })

        val day106 = rows.first()
        // 7-day window 100..106 without the missing day 105: 10,20,30,40,50,70.
        assertEquals(6, day106.n7)
        assertEquals(220.0 / 6.0, day106.mean7!!, 1e-9)
        // Baseline excludes the day itself: days 100..104.
        assertEquals(5, day106.baselineN30)
        assertEquals(30.0, day106.baselineMean30!!, 1e-9)

        val day109 = rows.last()
        // 7-day window 103..109: 40,50,70,80,90,100.
        assertEquals(6, day109.n7)
        assertEquals(430.0 / 6.0, day109.mean7!!, 1e-9)
        assertEquals(8, day109.baselineN30)
    }

    @Test
    fun reconcileKeepsThePreferredSourceAndNeverDoubleWrites() = runBlocking {
        val dao = db.dailyBiometricSummaryDao()
        val api = daily(MetricType.STEPS, 100, 9000.0, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, updatedAt = 10)
        val healthConnect = daily(MetricType.STEPS, 100, 8700.0, DataProvenance.IMPORTED_HEALTH_CONNECT, updatedAt = 20)

        assertEquals(1, dao.reconcileAndUpsert(listOf(api)))
        assertEquals(0, dao.reconcileAndUpsert(listOf(healthConnect)))
        assertEquals(9000.0, dao.get(MetricType.STEPS, 100)!!.value, 1e-9)
        assertEquals(1, dao.forDay(100).size)

        // A third-party device (a blood-pressure cuff) reaches the app through Health Connect and wins there.
        val bpApi = daily(MetricType.BLOOD_PRESSURE_SYSTOLIC, 100, 124.0, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)
        val bpHc = daily(MetricType.BLOOD_PRESSURE_SYSTOLIC, 100, 121.0, DataProvenance.IMPORTED_HEALTH_CONNECT)
        dao.reconcileAndUpsert(listOf(bpApi))
        assertEquals(1, dao.reconcileAndUpsert(listOf(bpHc)))
        assertEquals(DataProvenance.IMPORTED_HEALTH_CONNECT, dao.get(MetricType.BLOOD_PRESSURE_SYSTOLIC, 100)!!.provenance)

        // Body metrics are read only from the Google Health API (Health Connect has no weight stream), so it wins there.
        val weightApi = daily(MetricType.WEIGHT, 100, 80.4, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)
        val weightHc = daily(MetricType.WEIGHT, 100, 80.1, DataProvenance.IMPORTED_HEALTH_CONNECT)
        dao.reconcileAndUpsert(listOf(weightApi))
        assertEquals(0, dao.reconcileAndUpsert(listOf(weightHc)))
        assertEquals(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, dao.get(MetricType.WEIGHT, 100)!!.provenance)

        // A fresher value from the same source replaces the older one.
        assertEquals(1, dao.reconcileAndUpsert(listOf(api.copy(value = 9500.0, updatedAtEpochMillis = 30))))
        assertEquals(9500.0, dao.latest(MetricType.STEPS, 150)!!.value, 1e-9)
    }

    @Test
    fun derivedValuesCanBeClearedWithoutTouchingMeasurements() = runBlocking {
        val dao = db.dailyBiometricSummaryDao()
        dao.upsertAll(
            listOf(
                daily(MetricType.HRV_RMSSD, 100, 60.0),
                daily(MetricType.RECOVERY_SCORE, 100, 72.0, DataProvenance.MATHEMATICALLY_DERIVED),
            ),
        )
        assertEquals(1, dao.deleteByProvenance(DataProvenance.MATHEMATICALLY_DERIVED))
        assertNotNull(dao.get(MetricType.HRV_RMSSD, 100))
        assertNull(dao.get(MetricType.RECOVERY_SCORE, 100))
        assertEquals(100L, dao.firstDay(MetricType.HRV_RMSSD))
    }

    @Test
    fun heartRateAggregatesZonesAndDownsampling() = runBlocking {
        val dao = db.intradayHeartRateDao()
        val minute = 60_000L
        val bpm = listOf(60, 62, 95, 115, 130, 150, 170, 172)
        dao.upsertAll(
            bpm.mapIndexed { i, b ->
                IntradayHeartRateEntity(i * minute, b.toDouble(), b - 2, b + 2, 30, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)
            },
        )

        val stats = dao.stats(0, 8 * minute)
        assertEquals(8, stats.minutes)
        assertEquals(bpm.average(), stats.avgBpm!!, 1e-9)
        assertEquals(58, stats.minBpm)
        assertEquals(174, stats.maxBpm)

        val zones = dao.zoneMinutes(0, 8 * minute, 90.0, 108.0, 126.0, 144.0, 162.0)
        assertEquals(listOf(2, 1, 1, 1, 1, 2), listOf(zones.belowZones, zones.zone1, zones.zone2, zones.zone3, zones.zone4, zones.zone5))

        val empty = dao.zoneMinutes(100 * minute, 200 * minute, 90.0, 108.0, 126.0, 144.0, 162.0)
        assertEquals(0, empty.belowZones + empty.zone1 + empty.zone5)

        val buckets = dao.downsampled(0, 8 * minute, 4 * minute)
        assertEquals(2, buckets.size)
        assertEquals(4, buckets[0].minutes)
        assertEquals((60 + 62 + 95 + 115) / 4.0, buckets[0].avgBpm, 1e-9)
        assertEquals(174, buckets[1].maxBpm)

        // The end of a range is exclusive.
        assertEquals(7, dao.range(0, 7 * minute).size)
        assertEquals(172.0, dao.peakMinuteAverage(0)!!, 1e-9)
        assertEquals(7 * minute, dao.latestTimestamp())

        // Re-ingesting a minute replaces it instead of duplicating it.
        dao.upsertAll(listOf(IntradayHeartRateEntity(0, 61.0, 59, 63, 30, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)))
        assertEquals(8, dao.stats(0, 8 * minute).minutes)
    }

    @Test
    fun metricSamplesAreKeyedByTypeAndTime() = runBlocking {
        val dao = db.metricSampleDao()
        dao.upsertAll(
            listOf(
                MetricSampleEntity(MetricType.HRV_RMSSD, 1000, null, 40.0, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API),
                MetricSampleEntity(MetricType.HRV_RMSSD, 2000, null, 60.0, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API),
                MetricSampleEntity(MetricType.SPO2_AVG, 1000, null, 96.0, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API),
            ),
        )
        val stats = dao.stats(MetricType.HRV_RMSSD, 0, 5000)
        assertEquals(2, stats.n)
        assertEquals(50.0, stats.mean!!, 1e-9)
        assertEquals(100.0, stats.sum!!, 1e-9)
        assertEquals(60.0, dao.latest(MetricType.HRV_RMSSD)!!.value, 1e-9)
        assertEquals(1, dao.deleteRange(MetricType.HRV_RMSSD, 0, 1500))
        assertEquals(1, dao.range(MetricType.SPO2_AVG, 0, 5000).size)
    }

    private fun session(id: String, day: Long, asleep: Int, main: Boolean = true) = SleepSessionEntity(
        id = id, startEpochMillis = day * 1000, endEpochMillis = day * 1000 + 500,
        startZoneOffsetSeconds = 3600, endZoneOffsetSeconds = 3600, epochDay = day,
        isMainSleep = main, isNap = !main, hasStages = true,
        minutesAsleep = asleep, minutesAwake = 30, minutesInBed = asleep + 30,
        provenance = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, updatedAtEpochMillis = 1,
    )

    @Test
    fun sleepSessionReplacesItsHypnogramAndCascadesOnDelete() = runBlocking {
        val dao = db.sleepDao()
        val first = listOf(
            SleepStageSegmentEntity("s1", 100_000, 100_100, SleepStage.LIGHT),
            SleepStageSegmentEntity("s1", 100_100, 100_300, SleepStage.DEEP),
        )
        dao.replaceSession(session("s1", 100, 420), first)
        dao.replaceSession(session("nap", 100, 25, main = false), emptyList())

        // The source re-scores the night: the old segments must be gone, not merged.
        val revised = listOf(
            SleepStageSegmentEntity("s1", 100_000, 100_200, SleepStage.LIGHT),
            SleepStageSegmentEntity("s1", 100_200, 100_350, SleepStage.REM),
            SleepStageSegmentEntity("s1", 100_350, 100_500, SleepStage.AWAKE),
        )
        dao.replaceSession(session("s1", 100, 430), revised)

        val loaded = dao.mainSleepWithStagesForDay(100)!!
        assertEquals(430, loaded.session.minutesAsleep)
        assertEquals(listOf(SleepStage.LIGHT, SleepStage.REM, SleepStage.AWAKE), loaded.stages.sortedBy { it.startEpochMillis }.map { it.stage })
        assertEquals(2, dao.sessionsBetween(100, 100).size)
        assertEquals(listOf("s1"), dao.mainSleepsBetween(90, 110).map { it.id })
        assertEquals(1, dao.overlapping(100_400, 100_900).filter { it.id == "s1" }.size)

        assertEquals(1, dao.deleteById("s1"))
        assertTrue(dao.stagesFor("s1").isEmpty())
        assertNull(dao.mainSleepForDay(100))
    }

    @Test
    fun workoutTotalsGroupByDayAndType() = runBlocking {
        val dao = db.workoutDao()
        fun workout(id: String, day: Long, type: String, minutes: Long, trimp: Double?) = WorkoutEntity(
            id = id, startEpochMillis = day * 1000, endEpochMillis = day * 1000 + minutes, zoneOffsetSeconds = 0,
            epochDay = day, exerciseType = type, displayName = type, activeDurationMillis = minutes * 60_000,
            caloriesKcal = minutes * 10.0, derivedTrimp = trimp,
            provenance = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, updatedAtEpochMillis = 1,
        )
        dao.upsertAll(
            listOf(
                workout("a", 100, "RUNNING", 30, 60.0),
                workout("b", 100, "STRENGTH_TRAINING", 45, null),
                workout("c", 102, "RUNNING", 60, 120.0),
            ),
        )
        val days = dao.dailyTotals(100, 102)
        assertEquals(listOf(100L, 102L), days.map { it.epochDay })
        assertEquals(2, days[0].workouts)
        assertEquals(75 * 60_000L, days[0].activeDurationMillis)
        assertEquals(60.0, days[0].trimp!!, 1e-9)

        val types = dao.typeTotals(100, 102)
        assertEquals("RUNNING", types.first().exerciseType)
        assertEquals(2, types.first().workouts)

        assertEquals(1, dao.updateDerivedLoad("b", 35.0, 6.2))
        assertEquals(35.0, dao.byId("b")!!.derivedTrimp!!, 1e-9)
        assertEquals("STRENGTH_TRAINING", dao.byId("b")!!.exerciseType)
    }

    @Test
    fun watermarkOnlyMovesForwardAndFailuresLeaveItInPlace() = runBlocking {
        val dao = db.syncWatermarkDao()
        val source = SyncSource.GOOGLE_HEALTH_API
        assertTrue(dao.insertIfAbsent(SyncWatermarkEntity(source, "heart-rate")) > 0)
        // A second insert must not reset an existing stream.
        dao.advance(source, "heart-rate", 5_000, null, SyncStatus.SUCCESS, nowMillis = 10)
        dao.insertIfAbsent(SyncWatermarkEntity(source, "heart-rate"))
        assertEquals(5_000L, dao.get(source, "heart-rate")!!.lastSyncedEpochMillis)

        // Re-running an older window cannot pull the watermark back.
        dao.advance(source, "heart-rate", 3_000, null, SyncStatus.PARTIAL, nowMillis = 20)
        assertEquals(5_000L, dao.get(source, "heart-rate")!!.lastSyncedEpochMillis)

        dao.recordFailure(source, "heart-rate", SyncStatus.FAILED, "timeout", nowMillis = 30)
        dao.recordFailure(source, "heart-rate", SyncStatus.FAILED, "timeout", nowMillis = 40)
        val failed = dao.get(source, "heart-rate")!!
        assertEquals(5_000L, failed.lastSyncedEpochMillis)
        assertEquals(2, failed.consecutiveFailures)
        assertEquals(SyncStatus.FAILED, failed.status)
        assertEquals(20L, failed.lastSuccessEpochMillis)

        dao.advance(source, "heart-rate", 9_000, "token", SyncStatus.SUCCESS, nowMillis = 50)
        val ok = dao.get(source, "heart-rate")!!
        assertEquals(9_000L, ok.lastSyncedEpochMillis)
        assertEquals(0, ok.consecutiveFailures)
        assertNull(ok.lastError)
        assertEquals("token", ok.cursorToken)

        dao.extendBackfillFloor(source, "heart-rate", 2_000)
        dao.extendBackfillFloor(source, "heart-rate", 4_000)
        assertEquals(2_000L, dao.get(source, "heart-rate")!!.backfillFloorEpochMillis)

        dao.insertIfAbsent(SyncWatermarkEntity(source, "sleep"))
        assertEquals(0L, dao.oldestWatermark(source))
    }

    @Test
    fun rewindMovesAStaleWatermarkBackAndAReplayMarkSurvivesAdvance() = runBlocking {
        val dao = db.syncWatermarkDao()
        val source = SyncSource.GOOGLE_HEALTH_API
        dao.insertIfAbsent(SyncWatermarkEntity(source, "heart-rate"))
        dao.advance(source, "heart-rate", 9_000, null, SyncStatus.SUCCESS, nowMillis = 10)
        // advance stays forward-only; rewindTo is the explicit way back.
        dao.advance(source, "heart-rate", 1_000, null, SyncStatus.SUCCESS, nowMillis = 11)
        assertEquals(9_000L, dao.get(source, "heart-rate")!!.lastSyncedEpochMillis)
        assertEquals(1, dao.rewindTo(source, "heart-rate", 2_000))
        assertEquals(2_000L, dao.get(source, "heart-rate")!!.lastSyncedEpochMillis)

        dao.setCursorToken(source, "heart-rate", "replay-from:20000")
        dao.advance(source, "heart-rate", 3_000, null, SyncStatus.SUCCESS, nowMillis = 12)
        assertEquals("replay-from:20000", dao.get(source, "heart-rate")!!.cursorToken, "a null token keeps the stored one")
        assertEquals(listOf("replay-from:20000"), dao.all().map { it.cursorToken })
        dao.setCursorToken(source, "heart-rate", null)
        assertNull(dao.get(source, "heart-rate")!!.cursorToken)
    }
}
