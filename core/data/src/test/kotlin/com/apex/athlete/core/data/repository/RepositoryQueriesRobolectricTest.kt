package com.apex.athlete.core.data.repository

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.analytics.fitness.Vo2CategoryMissing
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.data.ingest.HealthIngestor
import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.pipeline.DailyIntelligencePipeline
import com.apex.athlete.core.data.pipeline.EnergyMissingReason
import com.apex.athlete.core.data.pipeline.JournalDay
import com.apex.athlete.core.data.pipeline.StressMissingReason
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.data.source.DemoSource
import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.database.ApexDatabase
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
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The reads behind the repository's activity, body, vitals, stress/energy, journal, fitness and workout-detail flows,
 * on the demo seed in a real database. A value is null with a reason when it is missing, never 0, and carries its provenance.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class RepositoryQueriesRobolectricTest {

    private val zone = ZoneId.of("UTC")
    private val now = Instant.parse("2026-11-10T14:00:00Z").toEpochMilli()
    private val days = 45
    private val dayMs = 86_400_000L
    private lateinit var db: ApexDatabase
    private lateinit var ingestor: HealthIngestor
    private lateinit var store: ActiveStore
    private var profile = UserProfile(birthYear = 1990, sex = Sex.MALE)
    private val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate().toEpochDay()

    private fun newDb(): ApexDatabase =
        Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ApexDatabase::class.java).allowMainThreadQueries().build()

    private fun storeOn(database: ApexDatabase, userProfile: () -> UserProfile) = ActiveStore(
        database, true, HealthIngestor(database, { now }, { zone }), DailyIntelligencePipeline(database, { userProfile() }, { zone }, { now }),
    )

    @Before
    fun setUp() {
        db = newDb()
        store = storeOn(db) { profile }
        ingestor = store.ingestor
        runBlocking {
            val session = ingestor.newSession()
            for (b in DemoSource(days = days, zone = zone, nowMillis = { now }).batches()) ingestor.ingest(b, session)
            store.pipeline.replay(session.earliestAffectedDay!!, today)
        }
    }

    @After
    fun tearDown() = db.close()

    // --- Activity ----------------------------------------------------------------------------------

    @Test
    fun todaysActivityCarriesProvenanceAndIsProvisional(): Unit = runBlocking {
        val s = RepositoryQueries.activityDay(store, today)
        assertEquals(ACTIVITY_METRICS, s.readings.keys.toList())
        assertTrue(s.isProvisional)
        assertTrue(s.isDemo)
        for (m in listOf(MetricType.STEPS, MetricType.DISTANCE, MetricType.FLOORS, MetricType.CALORIES_TOTAL, MetricType.CALORIES_ACTIVE,
            MetricType.ACTIVE_ZONE_MINUTES, MetricType.LIGHTLY_ACTIVE_MINUTES, MetricType.MODERATELY_ACTIVE_MINUTES, MetricType.VERY_ACTIVE_MINUTES)) {
            val r = s.readings.getValue(m)
            assertNotNull(r.value, "$m")
            assertEquals(DataProvenance.SYNTHETIC_DEMO, r.provenance, "$m")
            assertEquals(today, r.epochDay)
            assertNull(r.missing)
        }
        // Sedentary minutes exist only for a finished day: today's stays missing with a reason.
        val sedentary = s.readings.getValue(MetricType.SEDENTARY_MINUTES)
        assertNull(sedentary.value)
        assertEquals(ReadingMissing.NO_DATA, sedentary.missing)
        assertNull(sedentary.provenance)
        assertEquals(14, s.stepsHistory.size)
        assertEquals(s.readings.getValue(MetricType.STEPS).value, s.stepsHistory.last().value)
    }

    @Test
    fun aFinishedDayHasEveryActivityValueAndTheStepsAreTheSumOfTheMinuteSamples(): Unit = runBlocking {
        val day = today - 1
        val s = RepositoryQueries.activityDay(store, day)
        assertFalse(s.isProvisional)
        assertTrue(s.readings.values.all { it.value != null }, s.readings.filterValues { it.value == null }.keys.toString())
        val start = day * dayMs
        val sampled = db.metricSampleDao().stats(MetricType.STEPS, start, start + dayMs)
        assertEquals(sampled.sum!!, s.readings.getValue(MetricType.STEPS).value!!, 1e-9)
    }

    @Test
    fun aBandOffDayHasNoActivityValuesAtAllNotZeros(): Unit = runBlocking {
        val s = RepositoryQueries.activityDay(store, today - 19)
        assertTrue(s.readings.values.all { it.value == null && it.provenance == null && it.missing == ReadingMissing.NO_DATA })
        assertNull(s.stepsHistory.single { it.epochDay == today - 19 }.value)
    }

    // --- Body --------------------------------------------------------------------------------------

    @Test
    fun bmiIsNullWithoutHeightAndDerivedOnReadWithIt(): Unit = runBlocking {
        val noHeight = RepositoryQueries.body(store, today, UserProfile())
        assertNotNull(noHeight.weight.value)
        assertEquals(DataProvenance.SYNTHETIC_DEMO, noHeight.weight.provenance)
        assertNull(noHeight.bmi.value)
        assertNull(noHeight.bmi.provenance)
        assertEquals(ReadingMissing.NEEDS_HEIGHT, noHeight.bmi.missing)
        assertTrue(noHeight.bmiHistory.all { it.value == null })

        val withHeight = RepositoryQueries.body(store, today, UserProfile(heightCm = 180.0))
        val bmi = assertNotNull(withHeight.bmi.value)
        assertEquals(withHeight.weight.value!! / (1.8 * 1.8), bmi, 1e-9)
        assertEquals(DataProvenance.MATHEMATICALLY_DERIVED, withHeight.bmi.provenance)
        assertEquals(withHeight.weight.epochDay, withHeight.bmi.epochDay)
        assertTrue(withHeight.bmiHistory.any { it.value != null })
        assertTrue(withHeight.bodyFat.value!! in 1.0..75.0)
        // BMI is derived on read: it is never a stored row.
        assertNull(db.dailyBiometricSummaryDao().get(MetricType.BMI, today))
    }

    @Test
    fun withoutAnyWeightBmiNeedsAWeightAndTheProfileWeightIsLabelledUserReported(): Unit = runBlocking {
        val early = today - 100 // before the demo starts
        val none = RepositoryQueries.body(store, early, UserProfile(heightCm = 175.0))
        assertNull(none.weight.value)
        assertNull(none.bodyFat.value)
        assertEquals(ReadingMissing.NEEDS_WEIGHT, none.bmi.missing)

        val typed = RepositoryQueries.body(store, early, UserProfile(heightCm = 175.0, weightKg = 70.0))
        assertEquals(70.0, typed.weight.value)
        assertEquals(DataProvenance.USER_REPORTED, typed.weight.provenance)
        assertNull(typed.weight.epochDay)
        assertEquals(70.0 / (1.75 * 1.75), typed.bmi.value!!, 1e-9)
    }

    // --- Vitals ------------------------------------------------------------------------------------

    @Test
    fun vitalsOfTonightsMorningHaveProvenanceAndTheRawFrequencyBandsAreNightMeans(): Unit = runBlocking {
        val v = RepositoryQueries.vitals(store, today)
        assertEquals(VITALS_METRICS, v.readings.keys.toList())
        for (m in listOf(MetricType.SKIN_TEMP_NIGHTLY, MetricType.SPO2_LOWER_BOUND, MetricType.SPO2_UPPER_BOUND,
            MetricType.HRV_DEEP_SLEEP_RMSSD, MetricType.HRV_SLEEP_SAMPLES, MetricType.SLEEPING_HEART_RATE)) {
            assertNotNull(v.readings.getValue(m).value, "$m")
            assertNotNull(v.readings.getValue(m).provenance, "$m")
        }
        val lf = v.readings.getValue(MetricType.HRV_LOW_FREQUENCY)
        assertNotNull(lf.value)
        assertTrue(lf.sampleCount!! > 10, "five-minute windows across the night")
        assertEquals(DataProvenance.SYNTHETIC_DEMO, lf.provenance)
        assertTrue(v.readings.getValue(MetricType.SPO2_LOWER_BOUND).value!! <= v.readings.getValue(MetricType.SPO2_UPPER_BOUND).value!!)
        // No observed sleeping heart rate in the demo, so the pipeline's own value fills the day and says so.
        assertEquals(DataProvenance.MATHEMATICALLY_DERIVED, v.readings.getValue(MetricType.SLEEPING_HEART_RATE).provenance)
    }

    @Test
    fun aBandOffNightHasNoVitals(): Unit = runBlocking {
        val v = RepositoryQueries.vitals(store, today - 19)
        assertTrue(v.readings.values.all { it.value == null && it.missing == ReadingMissing.NO_DATA })
    }

    // --- Stress and energy -------------------------------------------------------------------------

    @Test
    fun stressAndEnergyForTodayAndForABandOffDay(): Unit = runBlocking {
        val s = RepositoryQueries.stressEnergy(store, today)
        assertNotNull(s.stress)
        assertNull(s.stressMissing)
        assertNotNull(s.energy)
        assertNull(s.energyMissing)
        assertEquals(DataProvenance.MATHEMATICALLY_DERIVED, s.provenance)
        assertEquals(14, s.stressHistory.size)
        assertNotNull(s.stressHistory.last().value)
        assertTrue(s.stressHistory.first().value == null || s.stressHistory.first().value!! in 0.0..3.0)

        val off = RepositoryQueries.stressEnergy(store, today - 19)
        assertNull(off.stress)
        assertEquals(StressMissingReason.NO_HEART_RATE_DATA, off.stressMissing)
        assertNull(off.energy)
        assertNotNull(off.energyMissing)
        assertTrue(off.energyMissing in setOf(EnergyMissingReason.NO_RECOVERY, EnergyMissingReason.NO_WAKE_TIME))
        assertNull(off.stressHistory.single { it.epochDay == today - 19 }.value)
    }

    // --- Journal -----------------------------------------------------------------------------------

    @Test
    fun journalFactorsDistinguishNoFromNotLogged(): Unit = runBlocking {
        val rows = listOf(DailyObservation(MetricType.JOURNAL_ALCOHOL, today, 1.0), DailyObservation(MetricType.JOURNAL_LATE_MEAL, today, 0.0))
        ingestor.ingest(HealthBatch(DataProvenance.USER_REPORTED, daily = rows), ingestor.newSession())
        val s = RepositoryQueries.journal(store, today)
        assertEquals(JournalDay.FACTORS, s.factors.keys.toList())
        assertEquals(true, s.factors[MetricType.JOURNAL_ALCOHOL])
        assertEquals(false, s.factors[MetricType.JOURNAL_LATE_MEAL])
        assertNull(s.factors[MetricType.JOURNAL_TRAVEL], "not logged is not the same as no")
        assertEquals(DataProvenance.USER_REPORTED, s.provenance)
        // Two logged days cannot reach 5 per arm.
        assertTrue(s.effects == null || s.effects!!.effects.isEmpty())
    }

    // --- Fitness -----------------------------------------------------------------------------------

    @Test
    fun fitnessNeedsSexAndSaysWhenItIsMissing(): Unit = runBlocking {
        val ok = RepositoryQueries.fitness(store, today)
        assertNotNull(ok.vo2Max)
        assertNotNull(ok.category.category)
        assertNotNull(ok.fitnessAge.fitnessAgeYears)
        assertEquals(90, ok.vo2History.size)
        assertTrue(ok.vo2History.any { it.value != null })

        profile = profile.copy(sex = Sex.UNSPECIFIED)
        val noSex = RepositoryQueries.fitness(store, today)
        assertNotNull(noSex.vo2Max, "the VO2 max itself is still shown")
        assertNull(noSex.category.category)
        assertEquals(Vo2CategoryMissing.SEX_UNSPECIFIED, noSex.category.missing)
        assertNull(noSex.fitnessAge.fitnessAgeYears)
    }

    // --- Workout detail ----------------------------------------------------------------------------

    @Test
    fun aRunShowsItsReportedFieldsRecoveryZoneMinutesAndMinuteHeartRate(): Unit = runBlocking {
        val run = db.workoutDao().all().filter { it.exerciseType == "RUNNING" }.maxByOrNull { it.startEpochMillis }!!
        val d = assertNotNull(RepositoryQueries.workoutDetail(store, run.id))
        assertEquals(run.id, d.workout.id)
        assertNotNull(d.workout.caloriesKcal)
        assertNotNull(d.workout.distanceMeters)
        assertNotNull(d.workout.steps)
        assertNotNull(d.workout.elevationGainMeters)
        assertNotNull(d.workout.activeZoneMinutes)
        assertEquals(DataProvenance.SYNTHETIC_DEMO, d.workout.provenance)
        assertFalse(d.recoveryNeedsZones)
        assertNotNull(d.recovery, "with a zone model recovery is evaluated; it may still carry a missing reason")
        assertEquals(d.heartRate.size.toDouble(), assertNotNull(d.zoneMinutes).values.sum(), 0.0)
        assertTrue(d.heartRate.size >= 30)
        assertNull(RepositoryQueries.workoutDetail(store, "no-such-workout"))
    }

    @Test
    fun withoutAZoneModelRecoveryIsNullAndSaysItNeedsOne(): Unit = runBlocking {
        val bare = newDb()
        try {
            val s = storeOn(bare) { UserProfile() }
            val end = (today - 2) * dayMs + 18 * 3_600_000L
            bare.workoutDao().upsertAll(
                listOf(
                    WorkoutEntity(
                        id = "w1", startEpochMillis = end - 30 * 60_000L, endEpochMillis = end, zoneOffsetSeconds = 0, epochDay = today - 2,
                        exerciseType = "RUNNING", displayName = "Run", activeDurationMillis = 30 * 60_000L,
                        provenance = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, updatedAtEpochMillis = now,
                    ),
                ),
            )
            val d = assertNotNull(RepositoryQueries.workoutDetail(s, "w1"))
            assertNull(d.recovery)
            assertTrue(d.recoveryNeedsZones)
            assertNull(d.zoneMinutes)
            assertTrue(d.heartRate.isEmpty())
            assertNull(d.workout.caloriesKcal, "a field the source did not report stays null")
        } finally {
            bare.close()
        }
    }
}
