package com.apex.athlete.core.data.ingest

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.HeartRatePoint
import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.model.WorkoutObservation
import com.apex.athlete.core.database.ApexDatabase
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
import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The real ingestor on a real (in-memory) Room database: the timestamp floor and ceiling, the bounded
 * per-run heart-rate ledger and the main-sleep floor. Named *Robolectric* because it needs Room.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class HealthIngestorRobolectricTest {
    private val zone = ZoneId.of("UTC")
    private val now = Instant.parse("2026-11-10T14:00:00Z").toEpochMilli()
    private val today = LocalDate.parse("2026-11-10").toEpochDay()
    private val minute = 60_000L
    private val provenance = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    private lateinit var db: ApexDatabase
    private lateinit var ingestor: HealthIngestor

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, ApexDatabase::class.java).allowMainThreadQueries().build()
        ingestor = HealthIngestor(db, { now }, { zone })
    }

    @After
    fun tearDown() = db.close()

    private fun ms(iso: String) = Instant.parse(iso).toEpochMilli()

    // --- timestamp floor and ceiling ---------------------------------------------------------------

    @Test
    fun heartRateBeforeTheFloorOrAfterTheCeilingIsRejectedAndNeverStored(): Unit = runBlocking {
        val session = ingestor.newSession()
        val counts = ingestor.ingest(
            HealthBatch(
                provenance,
                heartRate = listOf(
                    HeartRatePoint(1_000L, 60), // 1970
                    HeartRatePoint(ms("2009-12-31T23:59:00Z"), 61),
                    HeartRatePoint(now + 11 * minute, 62),
                    HeartRatePoint(ms("2010-01-01T00:00:00Z"), 63), // the floor itself is accepted
                    HeartRatePoint(now, 64),
                ),
            ),
            session,
        )
        assertEquals(3, counts.rejected)
        assertEquals(listOf(63, 64), db.intradayHeartRateDao().range(0, Long.MAX_VALUE).map { it.avgBpm.toInt() })
        // The accepted 2010 row is the earliest thing touched; the rejected 1970 row did not drag the replay back.
        assertEquals(LocalDate.parse("2010-01-01").toEpochDay(), session.earliestAffectedDay)
    }

    @Test
    fun aBatchOfOnlyAncientHeartRateTouchesNothingAndSchedulesNoReplay(): Unit = runBlocking {
        val session = ingestor.newSession()
        val counts = ingestor.ingest(HealthBatch(provenance, heartRate = listOf(HeartRatePoint(5L, 60), HeartRatePoint(86_400_000L, 60))), session)
        assertEquals(2, counts.rejected)
        assertEquals(0, db.intradayHeartRateDao().count())
        assertNull(session.earliestAffectedDay)
    }

    @Test
    fun dailyDaysBeforeTheFloorOrAfterTomorrowAreRejected(): Unit = runBlocking {
        val session = ingestor.newSession()
        val counts = ingestor.ingest(
            HealthBatch(
                provenance,
                daily = listOf(
                    DailyObservation(MetricType.STEPS, 0L, 100.0),
                    DailyObservation(MetricType.STEPS, -719_162L, 100.0), // year 1
                    DailyObservation(MetricType.STEPS, LocalDate.parse("2009-12-31").toEpochDay(), 100.0),
                    DailyObservation(MetricType.STEPS, today + 2, 100.0),
                    DailyObservation(MetricType.STEPS, LocalDate.parse("2010-01-01").toEpochDay(), 100.0),
                    DailyObservation(MetricType.STEPS, today + 1, 100.0), // tomorrow is allowed for time zones
                    DailyObservation(MetricType.STEPS, today, 100.0),
                ),
            ),
            session,
        )
        assertEquals(4, counts.rejected)
        assertEquals(
            listOf(LocalDate.parse("2010-01-01").toEpochDay(), today, today + 1),
            db.dailyBiometricSummaryDao().all().map { it.epochDay }.sorted(),
        )
        assertEquals(LocalDate.parse("2010-01-01").toEpochDay(), session.earliestAffectedDay)
    }

    @Test
    fun samplesBeforeTheFloorOrAfterTheCeilingAreRejected(): Unit = runBlocking {
        val session = ingestor.newSession()
        val counts = ingestor.ingest(
            HealthBatch(
                provenance,
                samples = listOf(
                    SampleObservation(MetricType.HRV_RMSSD, 1L, 40.0),
                    SampleObservation(MetricType.HRV_RMSSD, ms("2009-06-01T00:00:00Z"), 40.0),
                    SampleObservation(MetricType.HRV_RMSSD, now + 11 * minute, 40.0),
                    SampleObservation(MetricType.HRV_RMSSD, now - minute, 41.0),
                ),
            ),
            session,
        )
        assertEquals(3, counts.rejected)
        assertEquals(1, db.metricSampleDao().count())
        assertEquals(41.0, db.metricSampleDao().latest(MetricType.HRV_RMSSD)!!.value)
    }

    @Test
    fun sleepAndWorkoutsBeforeTheFloorAreRejected(): Unit = runBlocking {
        val session = ingestor.newSession()
        val counts = ingestor.ingest(
            HealthBatch(
                provenance,
                sleeps = listOf(SleepObservation("old", 1_000L, 1_000L + 400 * minute, 0, 0, minutesAsleep = 400)),
                workouts = listOf(WorkoutObservation("oldw", 1_000L, 1_000L + 60 * minute, 0, "RUNNING", "Run", 3_600_000L)),
            ),
            session,
        )
        assertEquals(2, counts.rejected)
        assertTrue(db.sleepDao().allSessions().isEmpty())
        assertTrue(db.workoutDao().all().isEmpty())
        assertNull(session.earliestAffectedDay)
    }

    // --- bounded session ledger -------------------------------------------------------------------

    @Test
    fun aQuarterMillionHeartRateMinutesKeepTheSessionLedgerBounded(): Unit = runBlocking {
        val session = ingestor.newSession()
        val total = 250_000
        val perCall = 5_000
        val start = now - (total + 60L) * minute
        var peak = 0
        for (call in 0 until total / perCall) {
            val points = (0 until perCall).map { HeartRatePoint(start + (call.toLong() * perCall + it) * minute, 55 + it % 40) }
            ingestor.ingest(HealthBatch(provenance, heartRate = points), session)
            peak = maxOf(peak, session.trackedMinuteCount)
        }
        assertEquals(total, db.intradayHeartRateDao().count())
        assertTrue(peak <= HealthIngestor.BATCH_ROWS + 130, "ledger peaked at $peak")
        assertEquals(total.toLong(), session.counts.heartRateMinutesWritten)
    }

    @Test
    fun aMinuteSplitAcrossTwoBatchesStillMergesWithTheBoundedLedger(): Unit = runBlocking {
        val session = ingestor.newSession()
        val m = ms("2026-11-09T10:00:00Z")
        ingestor.ingest(HealthBatch(provenance, heartRate = listOf(HeartRatePoint(m, 60), HeartRatePoint(m + 1_000, 62))), session)
        ingestor.ingest(HealthBatch(provenance, heartRate = listOf(HeartRatePoint(m + 2_000, 70))), session)
        val row = db.intradayHeartRateDao().range(m, m + minute).single()
        assertEquals(3, row.sampleCount)
        assertEquals(60, row.minBpm)
        assertEquals(70, row.maxBpm)
    }

    // --- main sleep floor -------------------------------------------------------------------------

    private fun sleep(id: String, start: String, minutes: Int, main: Boolean? = true, nap: Boolean? = null) = SleepObservation(
        id, ms(start), ms(start) + minutes * minute, 0, 0, isMainSleep = main, isNap = nap, minutesAsleep = minutes,
    )

    @Test
    fun aTwentyMinuteSleepFlaggedMainIsStoredAsANapAndNeverScoredAsMain(): Unit = runBlocking {
        val session = ingestor.newSession()
        ingestor.ingest(HealthBatch(provenance, sleeps = listOf(sleep("s20", "2026-11-09T23:00:00Z", 20))), session)
        val stored = db.sleepDao().allSessions().single()
        assertEquals(false, stored.isMainSleep)
        assertEquals(true, stored.isNap)
        assertTrue(db.sleepDao().mainSleepsBetween(today - 3, today).isEmpty())
    }

    @Test
    fun aLongSleepFlaggedMainStaysMainAndAShortFlaggedOneOnTheSameDayDoesNotDisplaceIt(): Unit = runBlocking {
        val session = ingestor.newSession()
        ingestor.ingest(
            HealthBatch(
                provenance,
                sleeps = listOf(
                    sleep("long", "2026-11-09T22:00:00Z", 420),
                    sleep("short", "2026-11-10T09:00:00Z", 45),
                ),
            ),
            session,
        )
        val mains = db.sleepDao().mainSleepsBetween(today - 3, today)
        assertEquals(listOf("long"), mains.map { it.id })
        assertEquals(true, db.sleepDao().allSessions().first { it.id == "short" }.isNap)
    }

    @Test
    fun splitNightTheSecondPartIsADemotedNapNotAMainSleep(): Unit = runBlocking {
        // 4 h and 3 h 10 min on the same morning, both flagged main by the source. Both clear the floor,
        // so only the "one main sleep per day" rule decides: the longest keeps the flag and the other
        // is demoted to a nap. This test pins the current behaviour; see docs/REDTEAM.md row 7.
        val session = ingestor.newSession()
        ingestor.ingest(
            HealthBatch(
                provenance,
                sleeps = listOf(
                    sleep("part1", "2026-11-09T21:00:00Z", 240),
                    sleep("part2", "2026-11-10T03:30:00Z", 190),
                ),
            ),
            session,
        )
        val all = db.sleepDao().allSessions().associateBy { it.id }
        assertEquals(true, all.getValue("part1").isMainSleep)
        assertEquals(false, all.getValue("part2").isMainSleep)
        assertEquals(true, all.getValue("part2").isNap)
    }

    @Test
    fun stepSamplesAreStoredIdempotentlyAndDoNotTouchTheDayTotal(): Unit = runBlocking {
        val t0 = ms("2026-11-10T09:00:00Z")
        val batch = HealthBatch(
            provenance,
            daily = listOf(DailyObservation(MetricType.STEPS, today, 350.0)),
            samples = listOf(
                SampleObservation(MetricType.STEPS, t0, 100.0, t0 + minute),
                SampleObservation(MetricType.STEPS, t0 + 10 * minute, 250.0, t0 + 11 * minute),
            ),
        )
        repeat(2) { ingestor.ingest(batch, ingestor.newSession()) }
        val rows = db.metricSampleDao().range(MetricType.STEPS, t0, t0 + 60 * minute)
        assertEquals(listOf(100.0, 250.0), rows.map { it.value })
        assertEquals(t0 + minute, rows.first().endEpochMillis)
        assertEquals(350.0, db.dailyBiometricSummaryDao().get(MetricType.STEPS, today)!!.value)
    }
}
