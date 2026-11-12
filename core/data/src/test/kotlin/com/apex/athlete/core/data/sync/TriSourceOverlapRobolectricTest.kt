package com.apex.athlete.core.data.sync

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.data.ingest.HealthIngestor
import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.HeartRatePoint
import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.model.WorkoutObservation
import com.apex.athlete.core.data.pipeline.DailyIntelligencePipeline
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.data.source.FixtureReplaySource
import com.apex.athlete.core.data.source.GoogleHealthApiSource
import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.database.ApexDatabase
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SyncSource
import com.apex.athlete.core.network.JitterSource
import com.apex.athlete.core.network.NetworkModule
import com.apex.athlete.core.network.Sleeper
import com.apex.athlete.core.network.auth.InMemoryTokenStore
import com.apex.athlete.core.network.auth.StoredTokens
import com.apex.athlete.core.network.googlehealth.GoogleHealthClientConfig
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The real orchestrator, ingestor, Room database and pipeline with fake bands (FixtureReplaySource) and
 * with the real Google source against a MockWebServer. Named *Robolectric* because it needs Room.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class TriSourceOverlapRobolectricTest {
    private val zone = ZoneId.of("UTC")
    private val now = Instant.parse("2026-11-10T14:00:00Z").toEpochMilli()
    private lateinit var db: ApexDatabase
    private lateinit var store: ActiveStore
    private val config = TriSourceSyncOrchestrator.Config(backfillDays = 6)

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, ApexDatabase::class.java).allowMainThreadQueries().build()
        store = ActiveStore(
            db, false, HealthIngestor(db, { now }, { zone }),
            DailyIntelligencePipeline(db, { UserProfile(birthYear = 1990) }, { zone }, { now }),
        )
    }

    @After
    fun tearDown() = db.close()

    private fun ms(iso: String) = Instant.parse(iso).toEpochMilli()
    private fun day(iso: String) = LocalDate.parse(iso).toEpochDay()
    private fun orchestrator(vararg sources: com.apex.athlete.core.data.source.HealthSource) =
        TriSourceSyncOrchestrator(sources.toList(), Mutex(), { now }, config)

    private fun googleBatch() = HealthBatch(
        DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API,
        heartRate = (0 until 5).map { HeartRatePoint(ms("2026-11-09T10:00:00Z") + it * 1000L, 60 + it) },
        daily = listOf(DailyObservation(MetricType.STEPS, day("2026-11-09"), 5100.0), DailyObservation(MetricType.RESTING_HEART_RATE, day("2026-11-09"), 49.0)),
        sleeps = listOf(SleepObservation("gh:sleep:1", ms("2026-11-08T22:00:00Z"), ms("2026-11-09T06:00:00Z"), 0, 0, minutesAsleep = 400)),
        workouts = listOf(WorkoutObservation("gh:exercise:1", ms("2026-11-09T07:01:00Z"), ms("2026-11-09T08:00:00Z"), 0, "RUNNING", "Run", 3_500_000L, distanceMeters = 9000.0)),
    )

    private fun hcBatch() = HealthBatch(
        DataProvenance.IMPORTED_HEALTH_CONNECT,
        daily = listOf(DailyObservation(MetricType.STEPS, day("2026-11-09"), 5000.0)),
        sleeps = listOf(SleepObservation("hc:sleep:9", ms("2026-11-08T22:05:00Z"), ms("2026-11-09T06:02:00Z"), 0, 0)),
        workouts = listOf(WorkoutObservation("hc:exercise:9", ms("2026-11-09T07:00:00Z"), ms("2026-11-09T08:00:00Z"), 0, "RUNNING", "Run", 3_600_000L)),
    )

    private suspend fun snapshot(): List<String> = buildList {
        add("daily=" + db.dailyBiometricSummaryDao().all().sortedBy { "${it.metricType.storageKey}${it.epochDay}" })
        add("workouts=" + db.workoutDao().all().sortedBy { it.id })
        add("sleeps=" + db.sleepDao().allSessions().sortedBy { it.id })
        add("hr=" + db.intradayHeartRateDao().range(0, Long.MAX_VALUE))
    }

    @Test
    fun syncingTwiceGivesIdenticalState(): Unit = runBlocking {
        val o = orchestrator(FixtureReplaySource(SyncSource.GOOGLE_HEALTH_API, listOf(googleBatch())))
        val first = o.sync(store)
        assertTrue(first.anySuccess, "first sync succeeds")
        val a = snapshot()
        assertTrue(db.workoutDao().all().isNotEmpty(), "the workout is stored")
        // Five readings one second apart fall into one UTC minute: HealthIngestor stores one bucket.
        assertEquals(1, db.intradayHeartRateDao().count(), "heart rate is stored as one minute bucket")
        o.sync(store)
        assertEquals(a, snapshot())
    }

    @Test
    fun overlappingStepsWorkoutsAndSleepFromTwoSourcesAreStoredOnce(): Unit = runBlocking {
        val google = FixtureReplaySource(SyncSource.GOOGLE_HEALTH_API, listOf(googleBatch()))
        val hc = FixtureReplaySource(SyncSource.HEALTH_CONNECT, listOf(hcBatch()))
        orchestrator(google, hc).sync(store)
        orchestrator(google, hc).sync(store) // and again: still once

        val steps = db.dailyBiometricSummaryDao().range(MetricType.STEPS, day("2026-11-09"), day("2026-11-09"))
        assertEquals(1, steps.size)
        assertTrue(steps.single().value in listOf(5000.0, 5100.0), "one source's total, never the sum")
        assertEquals(1, db.workoutDao().all().size)
        assertEquals(1, db.sleepDao().allSessions().size)
        // A metric only one source delivered is still there.
        assertEquals(49.0, db.dailyBiometricSummaryDao().get(MetricType.RESTING_HEART_RATE, day("2026-11-09"))!!.value)
    }

    @Test
    fun watermarkAdvancesOnlyAfterCommittedWindowsAndResumes(): Unit = runBlocking {
        val twoDays = 2L * 24 * 3600_000
        var failAt: Long? = null
        val src = FixtureReplaySource(
            SyncSource.GOOGLE_HEALTH_API, listOf(googleBatch()), windowMillis = twoDays, zone = zone,
            faults = { from, _ -> if (from == failAt) IllegalStateException("boom") else null },
        )
        val floor = now - 6L * 24 * 3600_000
        failAt = floor + twoDays // second window fails
        val dao = db.syncWatermarkDao()
        val r1 = orchestrator(src).sync(store)
        assertEquals(StreamOutcome.FAILED, r1.streams.single().outcome)
        assertEquals(floor + twoDays, dao.get(SyncSource.GOOGLE_HEALTH_API, "fixture")!!.lastSyncedEpochMillis) // first window only
        failAt = null
        val r2 = orchestrator(src).sync(store)
        assertEquals(StreamOutcome.SYNCED, r2.streams.single().outcome)
        assertEquals(now, dao.get(SyncSource.GOOGLE_HEALTH_API, "fixture")!!.lastSyncedEpochMillis)
        assertEquals(1, db.workoutDao().all().size)
    }

    @Test
    fun theRealGoogleSourceThroughTheRealClientIsIdempotent(): Unit = runBlocking {
        val server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.requestUrl!!.encodedPath
                val body = when {
                    path.endsWith("/dataTypes/sleep/dataPoints") ->
                        """{"dataPoints":[{"name":"users/me/dataTypes/sleep/dataPoints/1","sleep":{"interval":{"startTime":"2026-11-08T22:00:00Z","endTime":"2026-11-09T06:00:00Z","startUtcOffset":"0s","endUtcOffset":"0s"},"summary":{"minutesAsleep":"410"},"metadata":{"mainSleep":true}}}]}"""
                    path.endsWith("/dataTypes/steps/dataPoints:reconcile") ->
                        """{"dataPoints":[{"dataPointName":"users/me/dataTypes/steps/dataPoints/a","steps":{"count":"6000","interval":{"startTime":"2026-11-09T09:00:00Z","endTime":"2026-11-09T09:01:00Z"}}}]}"""
                    else -> return MockResponse().setResponseCode(404)
                }
                return MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(body)
            }
        }
        server.start()
        try {
            val tokens = InMemoryTokenStore()
            val id = "123-abc.apps.googleusercontent.com"
            tokens.save(StoredTokens("a", "r", System.currentTimeMillis() + 3_600_000L, emptySet(), id))
            val net = NetworkModule.create(
                id, tokens, tokens,
                clientConfig = GoogleHealthClientConfig(baseUrl = server.url("/").toString(), allowInsecureHttp = true, maxRetries = 0),
                jitter = JitterSource { 0.5 }, sleeper = Sleeper { },
            )
            val o = orchestrator(GoogleHealthApiSource({ net }, { zone }))
            val first = o.sync(store)
            assertTrue(first.streams.none { it.outcome == StreamOutcome.FAILED }, first.streams.toString())
            val a = snapshot()
            assertEquals(6000.0, db.dailyBiometricSummaryDao().get(MetricType.STEPS, day("2026-11-09"))!!.value)
            assertEquals(1, db.sleepDao().allSessions().size)
            o.sync(store)
            assertEquals(a, snapshot())
        } finally {
            server.shutdown()
        }
    }
}
