package com.apex.athlete.core.data.pipeline

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.analytics.ANALYTICS_ALGORITHM_VERSION
import com.apex.athlete.core.analytics.research.PatternOutcome
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.data.ingest.HealthIngestor
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

/** Formula version 6: research metrics are exposed on [DayAnalysis.research] and stored as derived rows; missing stays missing. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PipelineV6ResearchRobolectricTest {

    private val zone = ZoneId.of("UTC")
    private val now = Instant.parse("2026-11-10T14:00:00Z").toEpochMilli()
    private lateinit var db: ApexDatabase
    private lateinit var pipeline: DailyIntelligencePipeline
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
            pipeline.replay(session.earliestAffectedDay!!, pipeline.today())
        }
    }

    @After
    fun tearDown() = db.close()

    @Test
    fun researchValuesAreStoredAsDerivedRowsMatchingTheAnalysis(): Unit = runBlocking {
        assertEquals(6, ANALYTICS_ALGORITHM_VERSION)
        val day = pipeline.today() - 1
        val a = pipeline.analyze(day, persist = false)
        val dao = db.dailyBiometricSummaryDao()
        val hrvZ = assertNotNull(a.research.hrvDual?.robustZ, "robust HRV z with a 45-day seed")
        val row = assertNotNull(dao.get(MetricType.HRV_ROBUST_Z, day))
        assertEquals(hrvZ, row.value, 1e-9)
        assertEquals(DataProvenance.MATHEMATICALLY_DERIVED, row.provenance)
        assertEquals(ANALYTICS_ALGORITHM_VERSION, row.algorithmVersion)
        val shortfall = assertNotNull(a.research.guidelineShortfall)
        assertEquals(shortfall.clippedMinutes, dao.get(MetricType.GUIDELINE_SHORTFALL_CLIPPED_7D, day)!!.value, 1e-9)
        assertEquals(shortfall.signedMinutes, dao.get(MetricType.GUIDELINE_SHORTFALL_SIGNED_7D, day)!!.value, 1e-9)
        assertTrue(shortfall.clippedMinutes >= 0.0)
        assertEquals(a.sleepRegularity.index, dao.get(MetricType.SLEEP_REGULARITY_INDEX, day)?.value)
        assertEquals(a.sleep?.availableWeight, dao.get(MetricType.SLEEP_SCORE_CONFIDENCE, day)?.value)
        val mid = assertNotNull(a.research.sleepMidpointMinuteOfDay)
        assertTrue(mid in 0.0..1440.0)
        assertEquals(mid, dao.get(MetricType.SLEEP_MIDPOINT, day)!!.value, 1e-9)
    }

    @Test
    fun patternsAreHedgedAndNeverDiagnostic(): Unit = runBlocking {
        val a = pipeline.analyze(pipeline.today() - 1, persist = false)
        assertEquals(1, a.research.patterns.size)
        val p = a.research.patterns.single()
        if (p.outcome == PatternOutcome.DETECTED) {
            val message = assertNotNull(p.message)
            assertTrue(message.contains("not a diagnosis", ignoreCase = true), message)
        } else {
            assertNull(p.message)
        }
        // Detected-and-allowed is a subset of detected.
        assertTrue(a.research.alertablePatterns.all { it.detected })
    }

    @Test
    fun aDayInProgressHasNoSedentaryMetrics(): Unit = runBlocking {
        val a = pipeline.analyze(pipeline.today(), persist = true)
        assertNull(a.research.sedentary)
        assertNull(a.research.peakCadence30)
        assertEquals(ActivityResearchMissing.DAY_NOT_COMPLETE, a.research.activityMissing)
        assertNull(db.dailyBiometricSummaryDao().get(MetricType.SEDENTARY_LONGEST_BOUT, pipeline.today()))
    }

    @Test
    fun anEmptyStoreGivesAnEmptyResearchBlock(): Unit = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val empty = Room.inMemoryDatabaseBuilder(context, ApexDatabase::class.java).allowMainThreadQueries().build()
        try {
            val p = DailyIntelligencePipeline(empty, { profile }, { zone }, { now })
            // A stale research row whose inputs are gone must be removed, not kept or zero-filled.
            val staleDay = p.today() - 1
            empty.dailyBiometricSummaryDao().upsertAll(
                listOf(
                    com.apex.athlete.core.database.entity.DailyBiometricSummaryEntity(
                        MetricType.SLEEP_WASO, staleDay, 42.0, DataProvenance.MATHEMATICALLY_DERIVED,
                        algorithmVersion = ANALYTICS_ALGORITHM_VERSION, updatedAtEpochMillis = now,
                    ),
                ),
            )
            val a = p.analyze(staleDay, persist = true)
            assertNull(a.research.hrvDual?.robustZ)
            assertNull(a.research.guidelineShortfall)
            assertNull(a.research.sleepMidpointMinuteOfDay)
            assertNull(a.research.wasoMinutes)
            assertEquals(ActivityResearchMissing.NO_STEP_DATA, a.research.activityMissing)
            assertTrue(a.research.patterns.none { it.detected })
            assertNull(empty.dailyBiometricSummaryDao().get(MetricType.SLEEP_WASO, p.today() - 1))
        } finally {
            empty.close()
        }
    }
}
