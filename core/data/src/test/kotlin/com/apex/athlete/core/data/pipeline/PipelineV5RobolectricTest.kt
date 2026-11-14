package com.apex.athlete.core.data.pipeline

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.analytics.ANALYTICS_ALGORITHM_VERSION
import com.apex.athlete.core.analytics.recovery.RecoveryComponent
import com.apex.athlete.core.analytics.sleep.SleepComponent
import com.apex.athlete.core.analytics.sleep.SleepScoreConfidence
import com.apex.athlete.core.analytics.sleep.SleepScoreEngine
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.data.ingest.HealthIngestor
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.data.source.DemoSource
import com.apex.athlete.core.database.ApexDatabase
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
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Formula version 5 on the real pipeline: the sleep score's restoration part receives the night's sleeping-HR, HRV and
 * breathing-rate z against their own baselines, a part without a baseline stays missing, and recovery receives the
 * behavioural sleep score (no double counting). Demo seed through the real ingestor, UTC, fixed clock.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PipelineV5RobolectricTest {

    private val zone = ZoneId.of("UTC")
    private val now = Instant.parse("2026-11-10T14:00:00Z").toEpochMilli()
    private lateinit var db: ApexDatabase
    private lateinit var pipeline: DailyIntelligencePipeline
    private var firstDay = 0L
    private val profile = UserProfile(birthYear = 1990, sex = Sex.MALE, heightCm = 180.0)

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, ApexDatabase::class.java).allowMainThreadQueries().build()
        val ingestor = HealthIngestor(db, { now }, { zone })
        pipeline = DailyIntelligencePipeline(db, { profile }, { zone }, { now })
        runBlocking {
            val session = ingestor.newSession()
            for (batch in DemoSource(days = 45, zone = zone, nowMillis = { now }).batches()) ingestor.ingest(batch, session)
            firstDay = session.earliestAffectedDay!!
            pipeline.replay(session.earliestAffectedDay!!, pipeline.today())
        }
    }

    @After
    fun tearDown() = db.close()

    @Test
    fun restorationUsesTheNightsOwnZScoresAndRecoveryGetsTheBehaviouralScore(): Unit = runBlocking {
        assertEquals(7, ANALYTICS_ALGORITHM_VERSION)
        val day = pipeline.today() - 1
        val a = pipeline.analyze(day, persist = false)
        val sleep = assertNotNull(a.sleep)
        // The demo seed has six weeks of nightly HRV and sleeping heart rate, so both baselines are established.
        val hrZ = assertNotNull(a.sleepingHeartRate.zScore, "sleeping HR z")
        val hrvZ = assertNotNull(a.hrv.zScore, "HRV z")
        val engine = SleepScoreEngine()
        assertEquals(engine.restorationZ(hrZ, hrvZ, a.respiratoryRate.zScore)!!, sleep.restorationZ!!, 1e-12)
        val restoration = sleep.contributions.first { it.component == SleepComponent.RESTORATION }
        assertTrue(restoration.available)
        assertEquals(engine.restorationSubScoreForZ(sleep.restorationZ!!), restoration.subScore!!, 1e-12)
        // Score = 0.75-weighted behavioural part + 0.25 restoration when every behavioural part is present; in
        // general the points add up and the behavioural score is the re-weighted mean without restoration.
        assertEquals(sleep.score, sleep.contributions.sumOf { it.points }, 1e-9)
        val behavioural = sleep.contributions.filter { it.available && it.component.isBehavioural }
        val expectedBehavioural = behavioural.sumOf { it.component.nominalWeight * it.subScore!! } / behavioural.sumOf { it.component.nominalWeight }
        assertEquals(expectedBehavioural, sleep.behaviouralScore, 1e-9)
        // Recovery's sleep input is the behavioural score, not the full score.
        val recoverySleep = a.recovery.contributions.first { it.component == RecoveryComponent.SLEEP }
        assertEquals(sleep.behaviouralScore, recoverySleep.subScore!!, 1e-9)
        // The stored sleep score is the full score, stamped with the current version.
        val stored = assertNotNull(db.dailyBiometricSummaryDao().get(MetricType.SLEEP_SCORE, day))
        assertEquals(sleep.score, stored.value, 1e-9)
        assertEquals(ANALYTICS_ALGORITHM_VERSION, stored.algorithmVersion)
    }

    @Test
    fun withoutBaselinesRestorationStaysMissingAndTheScoreIsFlaggedPartial(): Unit = runBlocking {
        // The first recorded nights: fewer than 7 nights of HRV and sleeping heart rate, so neither has a baseline.
        val a = (firstDay..firstDay + 5).map { pipeline.analyze(it, persist = false) }.first { it.sleep != null }
        val sleep = a.sleep!!
        assertFalse(a.sleepingHeartRate.baseline.isEstablished)
        assertFalse(a.hrv.baseline.isEstablished)
        val restoration = sleep.contributions.first { it.component == SleepComponent.RESTORATION }
        assertFalse(restoration.available)
        assertEquals(null, restoration.subScore)
        assertTrue(sleep.availableWeight <= 0.75 + 1e-9)
        assertTrue(sleep.confidence != SleepScoreConfidence.HIGH)
    }
}
