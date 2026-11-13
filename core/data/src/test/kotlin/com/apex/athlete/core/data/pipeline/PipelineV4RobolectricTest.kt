package com.apex.athlete.core.data.pipeline

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.analytics.ANALYTICS_ALGORITHM_VERSION
import com.apex.athlete.core.analytics.fitness.Vo2CategoryMissing
import com.apex.athlete.core.analytics.sleep.DipCategory
import com.apex.athlete.core.analytics.strain.CardioProfile
import com.apex.athlete.core.analytics.strain.HeartRateZoneModel
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.analytics.trend.WeeklyHrvState
import com.apex.athlete.core.analytics.journal.JournalSkipReason
import com.apex.athlete.core.data.ingest.HealthIngestor
import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.data.source.DemoSource
import com.apex.athlete.core.database.ApexDatabase
import com.apex.athlete.core.database.entity.IntradayHeartRateEntity
import com.apex.athlete.core.database.entity.WorkoutEntity
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
 * Formula version 4 on the real pipeline and a real SQLite database: the demo simulator through the real ingestor,
 * then stress, energy, heart-rate dip, zone minutes, journal effects, fitness category and replay.
 * UTC and a fixed clock, so every day is exactly 1,440 minutes.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PipelineV4RobolectricTest {

    private val zone = ZoneId.of("UTC")
    private val now = Instant.parse("2026-11-10T14:00:00Z").toEpochMilli()
    private val days = 45
    private val dayMs = 86_400_000L
    private val minuteMs = 60_000L
    private lateinit var db: ApexDatabase
    private lateinit var ingestor: HealthIngestor
    private lateinit var pipeline: DailyIntelligencePipeline
    private var profile = UserProfile(birthYear = 1990, sex = Sex.MALE, heightCm = 180.0)

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, ApexDatabase::class.java).allowMainThreadQueries().build()
        ingestor = HealthIngestor(db, { now }, { zone })
        pipeline = DailyIntelligencePipeline(db, { profile }, { zone }, { now })
        runBlocking {
            val session = ingestor.newSession()
            for (batch in DemoSource(days = days, zone = zone, nowMillis = { now }).batches()) ingestor.ingest(batch, session)
            pipeline.replay(session.earliestAffectedDay!!, pipeline.today())
        }
    }

    @After
    fun tearDown() = db.close()

    private val today get() = pipeline.today()
    private val dao get() = db.dailyBiometricSummaryDao()

    // --- Today with the demo seed ------------------------------------------------------------------

    @Test
    fun todayHasStressEnergyHeartRateDipAndZoneMinutes(): Unit = runBlocking {
        val a = pipeline.analyze(today, persist = false)

        assertNull(a.stressMissing)
        val stress = assertNotNull(a.stress)
        assertTrue(stress.scoredMinutes >= 120, "scored minutes ${stress.scoredMinutes}")
        assertTrue(stress.meanLevel in 0.0..3.0)
        assertEquals(stress.scoredMinutes, stress.lowMinutes + stress.mediumMinutes + stress.highMinutes)
        assertEquals(stress.scoredMinutes, a.stressMinuteLevels.size)
        assertNotNull(a.stressDayAggregateBpm)
        assertNotNull(a.stressBaseline)

        assertNull(a.energyMissing)
        val energy = assertNotNull(a.energy)
        assertEquals(a.recovery.score!!, energy.startLevel, 1e-9)
        assertTrue(energy.curve.isNotEmpty())
        assertTrue(energy.currentLevel in 0.0..100.0)
        assertTrue(energy.curve.last().minute <= now / minuteMs, "a day in progress stops at the clock")

        val dip = assertNotNull(a.heartRateDip.dipFraction)
        assertTrue(dip > 0.10, "the demo sleeps well below its daytime heart rate, got $dip")
        assertEquals(DipCategory.DIPPER, a.heartRateDip.category)

        val zoneMinutes = assertNotNull(a.zoneMinutes)
        assertEquals(a.strain!!.minutesByZone, zoneMinutes)
        assertTrue(zoneMinutes.values.sum() > 0.0)

        assertNull(a.journalEffects, "nothing was journalled, so there is nothing to analyse")
        assertTrue(a.isProvisional)
    }

    @Test
    fun aBandOffDayLeavesStressAndEnergyNullWithAReason(): Unit = runBlocking {
        val day = today - 19
        val a = pipeline.analyze(day, persist = false)
        assertNull(a.stress)
        assertTrue(a.stressMinuteLevels.isEmpty())
        assertNull(a.stressDayAggregateBpm)
        assertEquals(StressMissingReason.NO_HEART_RATE_DATA, a.stressMissing)
        assertNull(a.energy)
        assertNotNull(a.energyMissing)
        assertNull(a.heartRateDip.dipFraction)
        assertNotNull(a.heartRateDip.missing)
        assertNull(a.zoneMinutes)
        for (m in listOf(MetricType.STRESS_SCORE, MetricType.STRESS_DAY_AGGREGATE_BPM, MetricType.STRESS_HIGH_MINUTES, MetricType.HR_DIP)) {
            assertNull(dao.get(m, day), "$m must stay missing, not 0")
        }
    }

    @Test
    fun withoutStepIntervalsStressIsWithheldButEnergyStillRunsAndSaysSo(): Unit = runBlocking {
        val day = today - 3
        val start = day * dayMs
        db.metricSampleDao().deleteRange(MetricType.STEPS, start, start + dayMs)
        val a = pipeline.analyze(day, persist = false)
        assertNull(a.stress)
        assertNull(a.stressDayAggregateBpm)
        assertEquals(StressMissingReason.NO_MOTION_DATA, a.stressMissing)
        assertNotNull(a.recovery.score)
        val energy = assertNotNull(a.energy, "energy only needs recovery, wake time, zones and heart rate")
        assertTrue(energy.unscoredStressMinutes > 0, "minutes without a stress level are counted, not assumed calm")
    }

    @Test
    fun liveStyleMinuteStepSamplesLiftTheNoMotionGate(): Unit = runBlocking {
        val day = today - 3
        val start = day * dayMs
        db.metricSampleDao().deleteRange(MetricType.STEPS, start, start + dayMs)
        assertEquals(StressMissingReason.NO_MOTION_DATA, pipeline.analyze(day, persist = false).stressMissing)

        // What a live Google Health / Health Connect sync now delivers: sparse minute intervals plus the day total.
        val samples = (8 * 60 until 22 * 60 step 30).map {
            com.apex.athlete.core.data.model.SampleObservation(MetricType.STEPS, start + it * minuteMs, 90.0, start + (it + 1) * minuteMs)
        }
        ingestor.ingest(HealthBatch(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, samples = samples), ingestor.newSession())

        val a = pipeline.analyze(day, persist = false)
        assertTrue(a.stressMissing != StressMissingReason.NO_MOTION_DATA, "got ${a.stressMissing}")
        assertNotNull(a.stressDayAggregateBpm)
    }

    // --- Persistence --------------------------------------------------------------------------------

    @Test
    fun stressAndDipAreStoredAsDerivedDailyMetricsOfTheCurrentVersion(): Unit = runBlocking {
        val a = pipeline.analyze(today, persist = false)
        val aggregate = assertNotNull(dao.get(MetricType.STRESS_DAY_AGGREGATE_BPM, today))
        assertEquals(DataProvenance.MATHEMATICALLY_DERIVED, aggregate.provenance)
        assertEquals(ANALYTICS_ALGORITHM_VERSION, aggregate.algorithmVersion)
        assertEquals(a.stressDayAggregateBpm!!, aggregate.value, 1e-9)
        assertEquals(a.stress!!.meanLevel, dao.get(MetricType.STRESS_SCORE, today)!!.value, 1e-9)
        assertEquals(a.stress!!.highMinutes.toDouble(), dao.get(MetricType.STRESS_HIGH_MINUTES, today)!!.value, 0.0)
        assertEquals(a.heartRateDip.dipFraction!! * 100.0, dao.get(MetricType.HR_DIP, today)!!.value, 1e-9)
    }

    @Test
    fun theFirstWeekHasAnAggregateButNoStressScoreBecauseTheBaselineIsCalibrating(): Unit = runBlocking {
        val first = today - days + 1
        for (day in first..first + 6) assertNull(dao.get(MetricType.STRESS_SCORE, day), "day ${day - first} has no baseline yet")
        assertTrue((first..first + 6).any { dao.get(MetricType.STRESS_DAY_AGGREGATE_BPM, it) != null }, "aggregates are stored while calibrating")
        assertNotNull(dao.get(MetricType.STRESS_SCORE, today))
    }

    @Test
    fun replayAfterTheVersionBumpIsDeterministicAndWritesTheNewRows(): Unit = runBlocking {
        suspend fun derived() = dao.all().filter { it.provenance == DataProvenance.MATHEMATICALLY_DERIVED }
        val before = derived().map { Triple(it.metricType, it.epochDay, it.value) }.sortedBy { "${it.second} ${it.first}" }
        assertTrue(before.any { it.first == MetricType.STRESS_SCORE })

        // An upgraded install: every derived row is from formula version 3 and none of the version-4 rows exist yet.
        val v4 = setOf(
            MetricType.STRESS_DAY_AGGREGATE_BPM, MetricType.STRESS_SCORE, MetricType.STRESS_LOW_MINUTES,
            MetricType.STRESS_MEDIUM_MINUTES, MetricType.STRESS_HIGH_MINUTES, MetricType.HR_DIP,
        )
        val old = derived().filter { it.metricType !in v4 }.map { it.copy(algorithmVersion = 3) }
        dao.deleteByProvenance(DataProvenance.MATHEMATICALLY_DERIVED)
        dao.upsertAll(old)
        assertEquals(old.minOf { it.epochDay }, dao.firstStaleDerivedDay(ANALYTICS_ALGORITHM_VERSION))
        assertNull(dao.get(MetricType.STRESS_SCORE, today))

        val replayed = pipeline.recomputeIfStale()

        assertTrue(replayed > 0)
        assertNull(dao.firstStaleDerivedDay(ANALYTICS_ALGORITHM_VERSION))
        assertNotNull(dao.get(MetricType.STRESS_SCORE, today))
        val after = derived().map { Triple(it.metricType, it.epochDay, it.value) }.sortedBy { "${it.second} ${it.first}" }
        assertEquals(before, after)
        assertEquals(0, pipeline.recomputeIfStale())
    }

    // --- Journal ------------------------------------------------------------------------------------

    private suspend fun journal(metric: MetricType, from: Long, to: Long, yes: (Long) -> Boolean) {
        val rows = (from..to).map { DailyObservation(metric, it, if (yes(it)) 1.0 else 0.0) }
        ingestor.ingest(HealthBatch(DataProvenance.USER_REPORTED, daily = rows), ingestor.newSession())
    }

    @Test
    fun aFactorLoggedOnBothKindsOfDayGetsAnEffectOverTheLastNinetyDays(): Unit = runBlocking {
        journal(MetricType.JOURNAL_ALCOHOL, today - 31, today - 1) { it % 2 == 0L }
        val report = assertNotNull(pipeline.analyze(today, persist = false).journalEffects)
        val mine = report.effects.filter { it.factorMetric() == MetricType.JOURNAL_ALCOHOL }
        assertTrue(mine.isNotEmpty(), "skipped: ${report.skipped}")
        assertTrue(mine.all { it.nWith >= 5 && it.nWithout >= 5 })
        assertEquals(report.effects.size, report.testsPerformed)
    }

    @Test
    fun journalEffectsNeedAtLeastFiveDaysPerArm(): Unit = runBlocking {
        // Four "yes" days among twenty logged days.
        journal(MetricType.JOURNAL_ALCOHOL, today - 20, today - 1) { it in (today - 10)..(today - 7) }
        val report = assertNotNull(pipeline.analyze(today, persist = false).journalEffects)
        assertTrue(report.effects.none { it.factorMetric() == MetricType.JOURNAL_ALCOHOL })
        val skipped = report.skipped.filter { it.factor == MetricType.JOURNAL_ALCOHOL.storageKey }
        assertTrue(skipped.isNotEmpty())
        assertTrue(skipped.all { it.reason == JournalSkipReason.TOO_FEW_PER_ARM && it.nWith <= 4 })
    }

    @Test
    fun journalFactorsAreRejectedUnlessTheyAreYesOrNo(): Unit = runBlocking {
        val counts = ingestor.ingest(
            HealthBatch(DataProvenance.USER_REPORTED, daily = listOf(DailyObservation(MetricType.JOURNAL_ALCOHOL, today - 1, 2.0))),
            ingestor.newSession(),
        )
        assertEquals(1L, counts.rejected)
        assertNull(dao.get(MetricType.JOURNAL_ALCOHOL, today - 1))
    }

    // --- Fitness category, fitness age ------------------------------------------------------------------

    @Test
    fun vo2CategoryAndFitnessAgeNeedSexAndAgeAndSayWhichIsMissing(): Unit = runBlocking {
        val ok = pipeline.analyze(today, persist = false)
        val vo2 = assertNotNull(ok.vo2Max)
        assertNotNull(ok.vo2Category.category)
        assertTrue(ok.vo2Category.percentile!! in 5.0..95.0)
        assertNotNull(ok.fitnessAge.fitnessAgeYears)
        assertEquals(DataProvenance.SYNTHETIC_DEMO, vo2.provenance)

        profile = profile.copy(sex = Sex.UNSPECIFIED)
        val noSex = pipeline.analyze(today, persist = false)
        assertNull(noSex.vo2Category.category)
        assertNull(noSex.vo2Category.percentile)
        assertEquals(Vo2CategoryMissing.SEX_UNSPECIFIED, noSex.vo2Category.missing)
        assertNull(noSex.fitnessAge.fitnessAgeYears)

        profile = profile.copy(sex = Sex.FEMALE, birthYear = null)
        assertEquals(Vo2CategoryMissing.NO_AGE, pipeline.analyze(today, persist = false).vo2Category.missing)
    }

    // --- Exposed formula-v3 outputs ---------------------------------------------------------------------

    @Test
    fun weeklyHrvStatusRegularityLoadConfidenceAndTheStrainBaseAreExposed(): Unit = runBlocking {
        val a = pipeline.analyze(today, persist = false)
        val weekly = assertNotNull(a.weeklyHrvStatus)
        assertTrue(weekly.state != WeeklyHrvState.BASELINE_BUILDING, "38 nights before the week: ${weekly.baselineNights}")
        assertNotNull(a.sleepRegularity.index)
        assertTrue(a.loadConfidence in 0.0..1.0)
        assertEquals(a.load.loadConfidence, a.loadConfidence, 0.0)
        assertEquals(a.load.isCalibrating, a.loadCalibrating)
        assertEquals(a.fatigue.evaluable, a.fatigueEvaluable)
        assertNotNull(a.personalStrainBase)
        assertNotNull(a.strainTarget)
    }

    // --- Heart-rate recovery of a workout ---------------------------------------------------------------

    private fun workoutEndingAt(end: Long) = WorkoutEntity(
        id = "test:w", startEpochMillis = end - 40 * minuteMs, endEpochMillis = end, zoneOffsetSeconds = 0,
        epochDay = end / dayMs, exerciseType = "RUNNING", displayName = "Run", activeDurationMillis = 40 * minuteMs,
        provenance = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, updatedAtEpochMillis = now,
    )

    private suspend fun minuteHeartRate(startMinute: Long, vararg bpm: Double) {
        db.intradayHeartRateDao().upsertAll(
            bpm.mapIndexed { i, v ->
                IntradayHeartRateEntity((startMinute + i) * minuteMs, v, v.toInt(), v.toInt(), 12, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)
            },
        )
    }

    @Test
    fun heartRateRecoveryComesFromTheMinutesAroundTheEndAndIsNeverStored(): Unit = runBlocking {
        val end = (today - 30) * dayMs + 18 * 60 * minuteMs // overwrites the five demo minutes around 18:00 that day
        val e = end / minuteMs
        minuteHeartRate(e - 3, 168.0, 172.0, 170.0, 150.0, 140.0)
        val zones = HeartRateZoneModel.of(CardioProfile(50.0, 190.0))

        val r = assertNotNull(pipeline.heartRateRecovery(workoutEndingAt(end), zones))
        assertEquals(172.0, r.peakBpm!!, 0.0)
        assertEquals(22.0, r.dropAt60!!, 0.0)
        assertEquals(32.0, r.dropAt120!!, 0.0)
        assertNull(pipeline.heartRateRecovery(workoutEndingAt(end), null), "without a zone model the hard-enough test cannot run")
        assertTrue(db.workoutDao().all().none { it.id == "test:w" }, "recovery is computed on read, never stored")
    }

    @Test
    fun anEasyWorkoutIsNotScoredAndAMissingRecoveryMinuteRemovesOnlyThatDrop(): Unit = runBlocking {
        val zones = HeartRateZoneModel.of(CardioProfile(50.0, 190.0))
        val easyEnd = (today - 31) * dayMs + 18 * 60 * minuteMs
        minuteHeartRate(easyEnd / minuteMs - 3, 110.0, 112.0, 111.0, 90.0, 85.0)
        val easy = assertNotNull(pipeline.heartRateRecovery(workoutEndingAt(easyEnd), zones))
        assertNull(easy.dropAt60)
        assertNotNull(easy.missing)

        val gapEnd = (today - 32) * dayMs + 18 * 60 * minuteMs
        val g = gapEnd / minuteMs
        minuteHeartRate(g - 3, 170.0, 170.0, 170.0)
        db.intradayHeartRateDao().deleteRange(g * minuteMs, (g + 1) * minuteMs) // the first minute after the end has no reading
        minuteHeartRate(g + 1, 140.0)
        val gap = assertNotNull(pipeline.heartRateRecovery(workoutEndingAt(gapEnd), zones))
        assertNull(gap.dropAt60)
        assertEquals(30.0, gap.dropAt120!!, 0.0)
    }
}
