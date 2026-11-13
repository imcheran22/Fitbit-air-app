package com.apex.athlete.core.data.pipeline

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.analytics.ANALYTICS_ALGORITHM_VERSION
import com.apex.athlete.core.analytics.fitness.MaxHeartRateEstimate
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.database.ApexDatabase
import com.apex.athlete.core.database.entity.DailyBiometricSummaryEntity
import com.apex.athlete.core.database.entity.IntradayHeartRateEntity
import com.apex.athlete.core.database.entity.SleepSessionEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.Instant
import java.time.ZoneId
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Formula version 3 on the real pipeline and a real SQLite database (Robolectric): wear coverage,
 * the TRIMP anchor, robust HRmax, replay after a version change, and an observed sleeping heart rate.
 * Day arithmetic is in UTC so the expected minutes are exact.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PipelineV3RobolectricTest {

    private val zone = ZoneId.of("UTC")
    private val now = Instant.parse("2026-11-10T14:00:00Z").toEpochMilli()
    private val dayMs = 86_400_000L
    private val minuteMs = 60_000L
    private lateinit var db: ApexDatabase
    private lateinit var profile: UserProfile
    private lateinit var pipeline: DailyIntelligencePipeline

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, ApexDatabase::class.java).allowMainThreadQueries().build()
        profile = UserProfile(birthYear = 1986, maxHeartRateOverride = 190) // age 40 in 2026
        pipeline = DailyIntelligencePipeline(db, { profile }, { zone }, { now })
    }

    @After
    fun tearDown() = db.close()

    private val today get() = pipeline.today()

    private suspend fun heartRate(startMillis: Long, minutes: Int, bpm: Double) {
        db.intradayHeartRateDao().upsertAll(
            (0 until minutes).map {
                IntradayHeartRateEntity(startMillis + it * minuteMs, bpm, bpm.toInt(), bpm.toInt(), 12, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)
            },
        )
    }

    private suspend fun daily(metric: MetricType, day: Long, value: Double, provenance: DataProvenance = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, version: Int? = null) {
        db.dailyBiometricSummaryDao().upsertAll(
            listOf(DailyBiometricSummaryEntity(metric, day, value, provenance, algorithmVersion = version, updatedAtEpochMillis = now)),
        )
    }

    private suspend fun restingHeartRate(from: Long, to: Long, bpm: Double) {
        for (d in from..to) daily(MetricType.RESTING_HEART_RATE, d, bpm)
    }

    // --- B2: partly worn finished days ----------------------------------------------------------------

    @Test
    fun aFinishedDayWithFortyMinutesStoresNoDailyTrimpUntilItIsWornLongEnough(): Unit = runBlocking {
        val day = today - 5
        restingHeartRate(day - 10, day, 55.0)
        heartRate(day * dayMs, 40, 150.0)
        pipeline.replay(day, day)
        val dao = db.dailyBiometricSummaryDao()
        assertNull(dao.get(MetricType.DAILY_TRIMP, day))
        assertNotNull(dao.get(MetricType.STRAIN_SCORE, day)) // still shown, as a lower bound

        heartRate(day * dayMs, 700, 150.0)
        pipeline.replay(day, day)
        assertNotNull(dao.get(MetricType.DAILY_TRIMP, day))
    }

    @Test
    fun todayNeverEntersTheLoadSeries(): Unit = runBlocking {
        val day = today
        restingHeartRate(day - 10, day, 55.0)
        heartRate(day * dayMs, 800, 150.0) // 13 h 20 min so far: stored, but not part of the load history
        val a = pipeline.analyze(day, persist = true)
        assertTrue(a.isProvisional)
        assertNull(a.load.series.lastOrNull { it.epochDay == day }?.trimp)
        assertNotNull(db.dailyBiometricSummaryDao().get(MetricType.DAILY_TRIMP, day))
    }

    // --- B10: the TRIMP anchor --------------------------------------------------------------------------

    @Test
    fun aHigherRestingHeartRateTodayDoesNotChangeTheDaysTrimp(): Unit = runBlocking {
        val day = today - 3
        restingHeartRate(day - 10, day - 1, 55.0)
        daily(MetricType.RESTING_HEART_RATE, day, 63.0)
        heartRate(day * dayMs, 700, 150.0)
        val raised = pipeline.analyze(day, persist = false)
        daily(MetricType.RESTING_HEART_RATE, day, 55.0)
        val usual = pipeline.analyze(day, persist = false)
        assertEquals(55.0, raised.cardioProfile!!.restingHeartRate, 1e-9)
        assertEquals(usual.strain!!.trimp, raised.strain!!.trimp, 0.0)
    }

    // --- B5: robust observed HRmax ---------------------------------------------------------------------

    @Test
    fun oneArtefactMinuteDoesNotBecomeTheMaximumHeartRate(): Unit = runBlocking {
        profile = UserProfile(birthYear = 1986) // no override: Tanaka at 40 is 180
        val day = today - 2
        heartRate((day - 3) * dayMs, 700, 180.0)
        heartRate((day - 1) * dayMs + 3 * 3_600_000L, 1, 212.0)
        val a = pipeline.analyze(day, persist = false)
        assertEquals(180.0, a.maxHeartRate!!.bpm, 0.0)
        assertEquals(MaxHeartRateEstimate.Method.AGE_PREDICTED, a.maxHeartRate!!.method)
    }

    @Test
    fun aSustainedHigherMaximumIsAccepted(): Unit = runBlocking {
        profile = UserProfile(birthYear = 1986)
        val day = today - 2
        heartRate((day - 3) * dayMs, 760, 160.0)
        heartRate((day - 2) * dayMs, 40, 196.0)
        val a = pipeline.analyze(day, persist = false)
        assertEquals(196.0, a.maxHeartRate!!.bpm, 0.0)
        assertEquals(MaxHeartRateEstimate.Method.OBSERVED_PEAK, a.maxHeartRate!!.method)
    }

    // --- Replay after a formula change -----------------------------------------------------------------

    @Test
    fun staleDerivedRowsAreReplayedOnceAndObservedRowsAreUntouched(): Unit = runBlocking {
        val day = today - 3
        restingHeartRate(day - 10, day, 55.0)
        // A partial-day load stored by the old formula set (version 2): the new set stores none for it.
        daily(MetricType.DAILY_TRIMP, day, 5.0, DataProvenance.MATHEMATICALLY_DERIVED, version = 2)
        heartRate(day * dayMs, 40, 150.0)
        val dao = db.dailyBiometricSummaryDao()
        assertEquals(day, dao.firstStaleDerivedDay(ANALYTICS_ALGORITHM_VERSION))

        val replayed = pipeline.recomputeIfStale()

        assertTrue(replayed > 0)
        assertNull(dao.get(MetricType.DAILY_TRIMP, day))
        assertNull(dao.firstStaleDerivedDay(ANALYTICS_ALGORITHM_VERSION))
        assertEquals(55.0, dao.get(MetricType.RESTING_HEART_RATE, day)!!.value, 0.0)
        assertEquals(0, pipeline.recomputeIfStale()) // nothing left to do
    }

    @Test
    fun nothingIsReplayedWhenEveryDerivedRowIsCurrent(): Unit = runBlocking {
        daily(MetricType.DAILY_TRIMP, today - 3, 50.0, DataProvenance.MATHEMATICALLY_DERIVED, version = ANALYTICS_ALGORITHM_VERSION)
        assertEquals(0, pipeline.recomputeIfStale())
        assertEquals(50.0, db.dailyBiometricSummaryDao().get(MetricType.DAILY_TRIMP, today - 3)!!.value, 0.0)
    }

    // --- SLEEPING_HEART_RATE observed beside the pipeline's derived value ------------------------------

    private suspend fun night(day: Long, sleepingBpm: Double) {
        val start = day * dayMs - 1 * 3_600_000L // 23:00 the evening before
        val end = day * dayMs + 6 * 3_600_000L   // 06:00
        db.sleepDao().replaceSession(
            SleepSessionEntity(
                id = "test:night:$day", startEpochMillis = start, endEpochMillis = end,
                startZoneOffsetSeconds = 0, endZoneOffsetSeconds = 0, epochDay = day,
                isMainSleep = true, isNap = false, hasStages = false,
                minutesAsleep = 400, minutesAwake = 20, minutesInBed = 420,
                provenance = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, updatedAtEpochMillis = now,
            ),
            emptyList(),
        )
        heartRate(start, 420, sleepingBpm)
    }

    @Test
    fun anObservedSleepingHeartRateIsNotReplacedByTheDerivedOneAndReplayDoesNotFail(): Unit = runBlocking {
        val day = today - 4
        night(day, sleepingBpm = 52.0)
        daily(MetricType.SLEEPING_HEART_RATE, day, 50.0) // observed (vendor) value
        pipeline.replay(day, day)
        pipeline.replay(day, day)
        val row = db.dailyBiometricSummaryDao().get(MetricType.SLEEPING_HEART_RATE, day)!!
        assertEquals(50.0, row.value, 0.0)
        assertEquals(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, row.provenance)
        assertNull(row.algorithmVersion)
    }

    @Test
    fun withoutAnObservedSleepingHeartRateTheDerivedOneFillsTheDay(): Unit = runBlocking {
        val day = today - 4
        night(day, sleepingBpm = 52.0)
        pipeline.replay(day, day)
        val row = db.dailyBiometricSummaryDao().get(MetricType.SLEEPING_HEART_RATE, day)!!
        assertEquals(52.0, row.value, 1e-9)
        assertEquals(DataProvenance.MATHEMATICALLY_DERIVED, row.provenance)
        assertEquals(ANALYTICS_ALGORITHM_VERSION, row.algorithmVersion)
    }
}
