package com.apex.athlete.core.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.analytics.recovery.RecoveryStatus
import com.apex.athlete.core.data.coach.RuleBasedCoachEngine
import com.apex.athlete.core.data.ingest.HealthIngestor
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.HeartRatePoint
import com.apex.athlete.core.data.pipeline.DailyIntelligencePipeline
import com.apex.athlete.core.data.pipeline.MissingReason
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.data.source.DemoSource
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
import java.time.ZoneId
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * End-to-end on the JVM: the demo simulator through the real ingestor, a real SQLite database and
 * the real pipeline. This is the walking skeleton every screen sits on.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class DemoPipelineTest {

    private val zone = ZoneId.of("UTC")
    private val now = Instant.parse("2026-11-10T14:00:00Z").toEpochMilli()
    private val days = 45
    private lateinit var db: ApexDatabase
    private lateinit var ingestor: HealthIngestor
    private lateinit var pipeline: DailyIntelligencePipeline

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, ApexDatabase::class.java).allowMainThreadQueries().build()
        ingestor = HealthIngestor(db, { now }, { zone })
        pipeline = DailyIntelligencePipeline(db, { UserProfile(birthYear = 1990) }, { zone }, { now })
        runBlocking { seed() }
    }

    @After
    fun tearDown() = db.close()

    private suspend fun seed(): Int {
        val session = ingestor.newSession()
        for (batch in DemoSource(days = days, zone = zone, nowMillis = { now }).batches()) ingestor.ingest(batch, session)
        return pipeline.replay(session.earliestAffectedDay!!, pipeline.today())
    }

    @Test
    fun todayHasEveryHeroScore(): Unit = runBlocking {
        val a = pipeline.analyze(pipeline.today(), persist = false)
        assertEquals(RecoveryStatus.SCORED, a.recovery.status)
        assertTrue(a.recovery.scorePercent!! in 0..100)
        assertNotNull(a.sleep)
        assertTrue(a.sleep!!.scorePercent in 0..100)
        assertNotNull(a.strain)
        assertTrue(a.strain!!.strain in 0.0..21.0)
        assertNotNull(a.strainTarget)
        assertTrue(a.isProvisional)
    }

    @Test
    fun firstWeekIsCalibratingNotScored(): Unit = runBlocking {
        val first = pipeline.today() - days + 1
        for (day in first..first + 5) {
            val a = pipeline.analyze(day, persist = false)
            assertTrue(a.recovery.status != RecoveryStatus.SCORED, "day ${day - first} must not be scored without a baseline")
            assertNull(db.dailyBiometricSummaryDao().get(MetricType.RECOVERY_SCORE, day))
        }
    }

    @Test
    fun bandOffDayStaysMissing(): Unit = runBlocking {
        val day = pipeline.today() - 19
        val a = pipeline.analyze(day, persist = false)
        assertNull(a.strain)
        assertEquals(MissingReason.NO_HEART_RATE_DATA, a.strainMissing)
        assertNull(db.dailyBiometricSummaryDao().get(MetricType.STRAIN_SCORE, day))
        assertNull(db.dailyBiometricSummaryDao().get(MetricType.DAILY_TRIMP, day))
    }

    @Test
    fun reIngestingIsIdempotent(): Unit = runBlocking {
        val today = pipeline.today()
        val hrBefore = db.intradayHeartRateDao().count()
        val dailyBefore = db.dailyBiometricSummaryDao().all()
        val sleepsBefore = db.sleepDao().allSessions().size
        val workoutsBefore = db.workoutDao().all().size
        val scoreBefore = pipeline.analyze(today, persist = false).recovery.score

        seed()

        assertEquals(hrBefore, db.intradayHeartRateDao().count())
        assertEquals(sleepsBefore, db.sleepDao().allSessions().size)
        assertEquals(workoutsBefore, db.workoutDao().all().size)
        val dailyAfter = db.dailyBiometricSummaryDao().all()
        assertEquals(dailyBefore.map { Triple(it.metricType, it.epochDay, it.value) }, dailyAfter.map { Triple(it.metricType, it.epochDay, it.value) })
        assertEquals(scoreBefore, pipeline.analyze(today, persist = false).recovery.score)
    }

    @Test
    fun coarserSourceNeverOverwritesFinerHeartRate(): Unit = runBlocking {
        val minute = Instant.parse("2026-11-09T10:00:00Z").toEpochMilli()
        val fine = (0 until 12).map { HeartRatePoint(minute + it * 5_000L, 100) }
        val session = ingestor.newSession()
        ingestor.ingest(HealthBatch(DataProvenance.IMPORTED_FILE_ARCHIVE, heartRate = fine), session)
        val counts = ingestor.ingest(
            HealthBatch(DataProvenance.IMPORTED_HEALTH_CONNECT, heartRate = listOf(HeartRatePoint(minute, 60))),
            ingestor.newSession(),
        )
        assertEquals(1, counts.heartRateMinutesKept)
        val row = db.intradayHeartRateDao().range(minute, minute + 60_000).single()
        assertEquals(100.0, row.avgBpm)
        assertEquals(DataProvenance.IMPORTED_FILE_ARCHIVE, row.provenance)
    }

    @Test
    fun minuteSplitAcrossBatchesIsMergedNotReplaced(): Unit = runBlocking {
        val minute = Instant.parse("2026-11-08T10:00:00Z").toEpochMilli()
        val session = ingestor.newSession()
        ingestor.ingest(HealthBatch(DataProvenance.IMPORTED_FILE_ARCHIVE, heartRate = listOf(HeartRatePoint(minute, 100), HeartRatePoint(minute + 5_000, 100))), session)
        ingestor.ingest(HealthBatch(DataProvenance.IMPORTED_FILE_ARCHIVE, heartRate = listOf(HeartRatePoint(minute + 10_000, 130), HeartRatePoint(minute + 15_000, 130))), session)
        val row = db.intradayHeartRateDao().range(minute, minute + 60_000).single()
        assertEquals(4, row.sampleCount)
        assertEquals(115.0, row.avgBpm)
        assertEquals(100, row.minBpm)
        assertEquals(130, row.maxBpm)
    }

    @Test
    fun implausibleValuesAreRejectedAndCounted(): Unit = runBlocking {
        val t = Instant.parse("2026-11-07T10:00:00Z").toEpochMilli()
        val counts = ingestor.ingest(
            HealthBatch(
                DataProvenance.IMPORTED_HEALTH_CONNECT,
                heartRate = listOf(HeartRatePoint(t, 0), HeartRatePoint(t, -5), HeartRatePoint(t, 400), HeartRatePoint(now + 86_400_000, 80)),
            ),
            ingestor.newSession(),
        )
        assertEquals(4, counts.rejected)
        assertEquals(0, counts.heartRateMinutesWritten)
    }

    @Test
    fun everyNumeralInTheBriefingIsATemplateSlot(): Unit = runBlocking {
        val coach = RuleBasedCoachEngine()
        val today = pipeline.today()
        val numeral = Regex("""\d+(?:\.\d+)?""")
        for (day in (today - days + 1)..today) {
            val briefing = coach.briefing(pipeline.analyze(day, persist = false))
            assertTrue(briefing.lines.isNotEmpty())
            for (line in briefing.lines) {
                val allowed = line.numbers.flatMap { slot -> numeral.findAll(slot).map { it.value } }.toMutableList()
                for (found in numeral.findAll(line.text).map { it.value }) {
                    assertTrue(allowed.remove(found), "\"$found\" in \"${line.text}\" is not bound to a slot")
                }
            }
        }
    }

    @Test
    fun imperialBriefingWritesFahrenheitAndNoLineNamesAnIllness(): Unit = runBlocking {
        val coach = RuleBasedCoachEngine()
        val today = pipeline.today()
        for (day in (today - days + 1)..today) {
            val a = pipeline.analyze(day, persist = false)
            val imperial = coach.briefing(a, com.apex.athlete.core.data.settings.UnitSystem.IMPERIAL)
            val metric = coach.briefing(a, com.apex.athlete.core.data.settings.UnitSystem.METRIC)
            for (line in imperial.lines) {
                assertTrue("°C" !in line.text, "imperial briefing shows Celsius: \"${line.text}\"")
                assertTrue("illness" !in line.text.lowercase(), "diagnostic wording: \"${line.text}\"")
            }
            for (line in metric.lines) assertTrue("°F" !in line.text, "metric briefing shows Fahrenheit: \"${line.text}\"")
        }
    }

    @Test
    fun replayIsDeterministic(): Unit = runBlocking {
        val dao = db.dailyBiometricSummaryDao()
        val before = dao.all().filter { it.provenance == DataProvenance.MATHEMATICALLY_DERIVED }.map { Triple(it.metricType, it.epochDay, it.value) }
        pipeline.replay(pipeline.today() - days + 1, pipeline.today())
        val after = dao.all().filter { it.provenance == DataProvenance.MATHEMATICALLY_DERIVED }.map { Triple(it.metricType, it.epochDay, it.value) }
        assertEquals(before, after)
    }
}
