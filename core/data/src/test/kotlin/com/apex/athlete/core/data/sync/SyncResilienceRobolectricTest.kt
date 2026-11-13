package com.apex.athlete.core.data.sync

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.data.ingest.HealthIngestor
import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.HeartRatePoint
import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.pipeline.DailyIntelligencePipeline
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.data.source.FixtureReplaySource
import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.database.ApexDatabase
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SyncSource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
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
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The real orchestrator, ingestor, Room database and pipeline: a phone clock that was set ahead must
 * not strand the watermark, and an interrupted run must not leave committed days unscored.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class SyncResilienceRobolectricTest {
    private val zone = ZoneId.of("UTC")
    private val now = Instant.parse("2026-11-10T14:00:00Z").toEpochMilli()
    private val dayMs = 24L * 3600_000
    private val stream = "fixture"
    private lateinit var db: ApexDatabase
    private lateinit var store: ActiveStore

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

    // --- clock set ahead ----------------------------------------------------------------------------

    @Test
    fun aClockSetAheadDoesNotStrandTheWatermarkOnceItIsCorrected(): Unit = runBlocking {
        val config = TriSourceSyncOrchestrator.Config(backfillDays = 6)
        val early = HealthBatch(
            DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API,
            heartRate = listOf(HeartRatePoint(now - 26 * 3600_000L, 58)),
            daily = listOf(DailyObservation(MetricType.STEPS, day("2026-11-09"), 5000.0)),
        )
        // Arrives after the first sync ran: the in-between period the wrong clock would hide.
        val gap = HealthBatch(
            DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API,
            heartRate = listOf(HeartRatePoint(now - 2 * 3600_000L, 61), HeartRatePoint(now - 30 * 60_000L, 63)),
            daily = listOf(DailyObservation(MetricType.RESTING_HEART_RATE, day("2026-11-10"), 50.0)),
        )
        val fixtures = mutableListOf(early)
        val source = FixtureReplaySource(SyncSource.GOOGLE_HEALTH_API, fixtures, windowMillis = 2 * dayMs)
        val dao = db.syncWatermarkDao()

        val wrongClock = now + 3 * dayMs
        val ahead = TriSourceSyncOrchestrator(listOf(source), Mutex(), { wrongClock }, config)
        ahead.sync(store)
        assertEquals(wrongClock, dao.get(SyncSource.GOOGLE_HEALTH_API, stream)!!.lastSyncedEpochMillis)
        assertEquals(1, db.intradayHeartRateDao().count())

        fixtures += gap
        TriSourceSyncOrchestrator(listOf(source), Mutex(), { now }, config).sync(store)

        assertEquals(3, db.intradayHeartRateDao().count(), "the gap rows arrive")
        assertEquals(50.0, db.dailyBiometricSummaryDao().get(MetricType.RESTING_HEART_RATE, day("2026-11-10"))!!.value)
        assertEquals(now, dao.get(SyncSource.GOOGLE_HEALTH_API, stream)!!.lastSyncedEpochMillis, "the watermark is back on the real clock")
    }

    @Test
    fun aHealthyWatermarkIsNeverRewound(): Unit = runBlocking {
        val config = TriSourceSyncOrchestrator.Config(backfillDays = 6)
        val source = FixtureReplaySource(SyncSource.GOOGLE_HEALTH_API, emptyList(), windowMillis = 2 * dayMs)
        val dao = db.syncWatermarkDao()
        TriSourceSyncOrchestrator(listOf(source), Mutex(), { now }, config).sync(store)
        val later = now + 5 * 60_000L // five minutes later: ordinary use, within the tolerance
        TriSourceSyncOrchestrator(listOf(source), Mutex(), { later }, config).sync(store)
        assertEquals(later, dao.get(SyncSource.GOOGLE_HEALTH_API, stream)!!.lastSyncedEpochMillis)
        // Second run reads only from the stored watermark (now) minus the overlap, never from the floor.
        assertEquals(now - config.overlapMillis, source.pulledWindows.last().first)
    }

    // --- capped runs must advance, and today must arrive first -------------------------------------

    @Test
    fun cappedRunsWalkForwardAndTheNewestWindowArrivesOnTheFirstRun(): Unit = runBlocking {
        // 12 h windows, three per run, the default 36 h overlap: re-reading the overlap after a capped run
        // would cancel every run's progress and the watermark would never leave the floor.
        val config = TriSourceSyncOrchestrator.Config(backfillDays = 6, maxWindowsPerStream = 3)
        val floor = now - 6 * dayMs
        val points = (0 until 24).map { HeartRatePoint(floor + 3600_000L + it * 6 * 3600_000L, 60 + it % 10) } +
            HeartRatePoint(now - 10 * 60_000L, 72)
        val source = FixtureReplaySource(
            SyncSource.GOOGLE_HEALTH_API,
            listOf(HealthBatch(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, heartRate = points)),
            windowMillis = dayMs / 2,
        )
        val dao = db.syncWatermarkDao()
        val orchestrator = TriSourceSyncOrchestrator(listOf(source), Mutex(), { now }, config)

        orchestrator.sync(store)
        assertTrue(db.intradayHeartRateDao().range(now - 10 * 60_000L, now).isNotEmpty(), "today is stored on the first run")
        assertEquals(floor + 3 * dayMs / 2, dao.get(SyncSource.GOOGLE_HEALTH_API, stream)!!.lastSyncedEpochMillis)

        orchestrator.sync(store)
        assertEquals(floor + 3 * dayMs, dao.get(SyncSource.GOOGLE_HEALTH_API, stream)!!.lastSyncedEpochMillis, "the second run resumes, not re-reads")

        orchestrator.sync(store)
        orchestrator.sync(store)
        assertEquals(now, dao.get(SyncSource.GOOGLE_HEALTH_API, stream)!!.lastSyncedEpochMillis, "caught up after four runs")
        assertEquals(points.size, db.intradayHeartRateDao().count(), "every point once, none doubled")
    }

    // --- window edges are whole minutes (DATA_FLOW_E2E item 11) -------------------------------------

    @Test
    fun aHeartRateMinuteSplitAcrossAWindowEdgeAndTwoRunsIsMergedNotReplaced(): Unit = runBlocking {
        // The clock reads :37 into the minute. With an unrounded floor the second window starts at :37, so the
        // readings at :10 and :50 of that minute are delivered by different windows, and a run capped at one
        // window per stream hands the second one to a new session that has forgotten the first.
        val unalignedNow = now + 37_000L
        val edgeMinute = ms("2026-11-06T14:00:00Z")
        val source = FixtureReplaySource(
            SyncSource.GOOGLE_HEALTH_API,
            listOf(
                HealthBatch(
                    DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API,
                    heartRate = listOf(HeartRatePoint(edgeMinute + 10_000L, 60), HeartRatePoint(edgeMinute + 50_000L, 80)),
                ),
            ),
            windowMillis = 2 * dayMs,
        )
        val config = TriSourceSyncOrchestrator.Config(backfillDays = 6, maxWindowsPerStream = 1)
        val orchestrator = TriSourceSyncOrchestrator(listOf(source), Mutex(), { unalignedNow }, config)

        orchestrator.sync(store)
        orchestrator.sync(store)

        for ((from, to) in source.pulledWindows) {
            assertEquals(0L, from % 60_000L, "window start $from")
            assertEquals(0L, to % 60_000L, "window end $to")
        }
        val bucket = db.intradayHeartRateDao().range(edgeMinute, edgeMinute + 60_000L).single()
        assertEquals(2, bucket.sampleCount, "both readings of the minute are in its bucket")
        assertEquals(70.0, bucket.avgBpm)
    }

    // --- interrupted run owes a replay --------------------------------------------------------------

    private fun nights(): HealthBatch = HealthBatch(
        DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API,
        sleeps = (5..10).map { d ->
            val end = ms("2026-11-%02dT06:00:00Z".format(d))
            SleepObservation("night:$d", end - 420 * 60_000L, end, 0, 0, minutesAsleep = 400)
        },
    )

    private suspend fun scoredDays(): Set<Long> =
        db.dailyBiometricSummaryDao().all().filter { it.metricType == MetricType.SLEEP_DURATION }.map { it.epochDay }.toSet()

    @Test
    fun anInterruptedSyncLeavesAMarkAndTheNextRunScoresEveryCommittedDay(): Unit = runBlocking {
        val config = TriSourceSyncOrchestrator.Config(backfillDays = 6, overlapMillis = 0)
        var cancelAt: Long? = null
        val source = FixtureReplaySource(
            SyncSource.GOOGLE_HEALTH_API, listOf(nights()), windowMillis = 2 * dayMs,
            faults = { from, _ -> if (from == cancelAt) CancellationException("stop") else null },
        )
        val floor = now - 6 * dayMs
        cancelAt = floor + 2 * dayMs // window 1 commits, window 2 is cancelled
        val dao = db.syncWatermarkDao()

        assertFailsWith<CancellationException> { TriSourceSyncOrchestrator(listOf(source), Mutex(), { now }, config).sync(store) }
        assertEquals(floor + 2 * dayMs, dao.get(SyncSource.GOOGLE_HEALTH_API, stream)!!.lastSyncedEpochMillis)
        assertEquals(2, db.sleepDao().allSessions().size, "window 1 committed two nights")
        assertTrue(scoredDays().isEmpty(), "nothing was replayed yet")
        assertNotNull(SyncResumePlan.decodeReplayMark(dao.get(SyncSource.GOOGLE_HEALTH_API, stream)!!.cursorToken), "the debt is persisted")

        cancelAt = null
        val report = TriSourceSyncOrchestrator(listOf(source), Mutex(), { now }, config).sync(store)

        val expected = (5..10).map { day("2026-11-%02d".format(it)) }.toSet()
        assertEquals(expected, scoredDays(), "every committed day is scored, including the ones from the interrupted run")
        assertTrue(report.recomputedDays >= 6)
        assertNull(dao.get(SyncSource.GOOGLE_HEALTH_API, stream)!!.cursorToken, "the mark is cleared after a successful replay")
    }

    @Test
    fun aReplayThatThrowsKeepsTheMarkSoTheNextRunTriesAgain(): Unit = runBlocking {
        val config = TriSourceSyncOrchestrator.Config(backfillDays = 6, overlapMillis = 0)
        val source = FixtureReplaySource(SyncSource.GOOGLE_HEALTH_API, listOf(nights()), windowMillis = 2 * dayMs)
        val dao = db.syncWatermarkDao()
        val exploding = ActiveStore(
            db, false, store.ingestor,
            DailyIntelligencePipeline(db, { throw IllegalStateException("profile unavailable") }, { zone }, { now }),
        )
        assertFailsWith<IllegalStateException> { TriSourceSyncOrchestrator(listOf(source), Mutex(), { now }, config).sync(exploding) }
        assertNotNull(SyncResumePlan.decodeReplayMark(dao.get(SyncSource.GOOGLE_HEALTH_API, stream)!!.cursorToken))
        assertTrue(scoredDays().isEmpty())

        TriSourceSyncOrchestrator(listOf(source), Mutex(), { now }, config).sync(store)
        assertEquals(6, scoredDays().size)
        assertNull(dao.get(SyncSource.GOOGLE_HEALTH_API, stream)!!.cursorToken)
    }

    @Test
    fun rerunningACompletedSyncChangesNothing(): Unit = runBlocking {
        val config = TriSourceSyncOrchestrator.Config(backfillDays = 6)
        val source = FixtureReplaySource(SyncSource.GOOGLE_HEALTH_API, listOf(nights()), windowMillis = 2 * dayMs)
        val o = TriSourceSyncOrchestrator(listOf(source), Mutex(), { now }, config)
        o.sync(store)
        val before = db.dailyBiometricSummaryDao().all().sortedBy { "${it.metricType.storageKey}${it.epochDay}" }.map { it.copy(updatedAtEpochMillis = 0) }
        o.sync(store)
        val after = db.dailyBiometricSummaryDao().all().sortedBy { "${it.metricType.storageKey}${it.epochDay}" }.map { it.copy(updatedAtEpochMillis = 0) }
        assertEquals(before, after)
    }
}
