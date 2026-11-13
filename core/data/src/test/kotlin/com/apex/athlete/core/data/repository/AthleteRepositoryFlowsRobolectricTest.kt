package com.apex.athlete.core.data.repository

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.data.settings.SettingsStore
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.data.store.ApexStores
import com.apex.athlete.core.database.ApexDatabase
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
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
 * The public flows screens observe, on the real [ApexStores] with the demo store and the real settings store.
 * One test method on purpose: the settings DataStore is a per-process singleton, so a single Robolectric
 * application owns it for the whole class.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class AthleteRepositoryFlowsRobolectricTest {

    private val zone = ZoneId.of("UTC")
    private val now = Instant.parse("2026-11-10T14:00:00Z").toEpochMilli()
    private val wait = 300_000L

    @Test
    fun theNewFlowsEmitOnTheDemoStoreAndFollowTheProfile(): Unit = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        fun memoryDb(c: Context): ApexDatabase = Room.inMemoryDatabaseBuilder(c, ApexDatabase::class.java).allowMainThreadQueries().build()
        val settings = SettingsStore(context)
        settings.updateProfile(UserProfile(birthYear = 1990, sex = Sex.MALE, heightCm = 180.0))
        settings.update { it.copy(demoMode = true, onboardingDone = true) }
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val stores = ApexStores(
            context, settings, scope, zone = { zone }, nowMillis = { now },
            openReal = ::memoryDb, openDemo = ::memoryDb, demoDays = 45,
        )
        val repo = AthleteRepository(stores, settings, zone = { zone }, nowMillis = { now })
        try {
            val today = repo.today()

            val activity = withTimeout(wait) { repo.activityDay(today).filterNotNull().first() }
            assertNotNull(activity.readings.getValue(MetricType.STEPS).value)
            assertEquals(DataProvenance.SYNTHETIC_DEMO, activity.readings.getValue(MetricType.STEPS).provenance)
            assertTrue(activity.isDemo)

            val stressEnergy = withTimeout(wait) { repo.stressEnergy(today).filterNotNull().first() }
            assertNotNull(stressEnergy.stress)
            assertNotNull(stressEnergy.energy)

            val analysis = withTimeout(wait) { repo.analysis(today).filterNotNull().first() }
            assertNotNull(analysis.heartRateDip.dipFraction)
            assertNotNull(analysis.zoneMinutes)

            val vitals = withTimeout(wait) { repo.vitals(today).filterNotNull().first() }
            assertNotNull(vitals.readings.getValue(MetricType.SKIN_TEMP_NIGHTLY).value)

            // Profile: height present -> BMI; the flow follows the profile when the height is removed.
            val withHeight = withTimeout(wait) { repo.body(today).filterNotNull().first() }
            assertNotNull(withHeight.bmi.value)
            settings.updateProfile(UserProfile(birthYear = 1990, sex = Sex.MALE, heightCm = null))
            val noHeight = withTimeout(wait) { repo.body(today).filterNotNull().first { it.bmi.value == null } }
            assertEquals(ReadingMissing.NEEDS_HEIGHT, noHeight.bmi.missing)
            assertNotNull(noHeight.weight.value, "the weight itself is still shown")

            // Sex missing -> category null with a reason; the VO2 max stays.
            val fitness = withTimeout(wait) { repo.fitness(today).filterNotNull().first() }
            assertNotNull(fitness.category.category)
            settings.updateProfile(UserProfile(birthYear = 1990, sex = Sex.UNSPECIFIED, heightCm = 180.0))
            val noSex = withTimeout(wait) { repo.fitness(today).filterNotNull().first { it.category.category == null } }
            assertNotNull(noSex.category.missing)
            assertNotNull(noSex.vo2Max)

            // Journal: write through the repository, read it back through the flow.
            repo.saveJournalFactors(
                today,
                mapOf(MetricType.JOURNAL_ALCOHOL to true, MetricType.JOURNAL_LATE_MEAL to false, MetricType.JOURNAL_TRAVEL to null, MetricType.STEPS to true),
            )
            val journal = withTimeout(wait) { repo.journal(today).filterNotNull().first { it.factors[MetricType.JOURNAL_ALCOHOL] == true } }
            assertEquals(false, journal.factors[MetricType.JOURNAL_LATE_MEAL])
            assertNull(journal.factors[MetricType.JOURNAL_TRAVEL])
            assertNull(journal.factors[MetricType.STEPS], "only journal factors are accepted")
            repo.saveJournalFactors(today, mapOf(MetricType.JOURNAL_ALCOHOL to null))
            withTimeout(wait) { repo.journal(today).filterNotNull().first { it.factors[MetricType.JOURNAL_ALCOHOL] == null } }

            // Trends offer the activity, body, vitals and stress series.
            val trends = withTimeout(wait) { repo.trends(today, 30).filterNotNull().first() }
            val offered = trends.trends.map { it.metric }.toSet()
            for (m in listOf(MetricType.STEPS, MetricType.DISTANCE, MetricType.CALORIES_ACTIVE, MetricType.ACTIVE_ZONE_MINUTES,
                MetricType.WEIGHT, MetricType.SKIN_TEMP_NIGHTLY, MetricType.STRESS_SCORE, MetricType.HR_DIP)) {
                assertTrue(m in offered, "$m is missing from the trends")
            }
            assertTrue(AthleteRepository.TREND_METRICS.map { it.first }.containsAll(ACTIVITY_METRICS))

            // Workout detail through the repository.
            val workout = withTimeout(wait) { repo.recentWorkouts(5).first { it.isNotEmpty() } }.first()
            val detail = withTimeout(wait) { repo.workoutDetail(workout.id).filterNotNull().first() }
            assertEquals(workout.id, detail.workout.id)
        } finally {
            scope.cancel()
        }
    }
}
