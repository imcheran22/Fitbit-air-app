package com.apex.athlete.core.database

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.apex.athlete.core.database.entity.BehaviourDefEntity
import com.apex.athlete.core.database.entity.BehaviourEntryEntity
import com.apex.athlete.core.database.entity.BehaviourKind
import com.apex.athlete.core.database.entity.BloodPressureReadingEntity
import com.apex.athlete.core.database.entity.BloodPressureSource
import com.apex.athlete.core.database.entity.BreatheSessionEntity
import com.apex.athlete.core.database.entity.CoachMessageEntity
import com.apex.athlete.core.database.entity.CoachRole
import com.apex.athlete.core.database.entity.CoachThreadEntity
import com.apex.athlete.core.database.entity.CoachTopic
import com.apex.athlete.core.database.entity.FoodLogEntity
import com.apex.athlete.core.database.entity.FoodSource
import com.apex.athlete.core.database.entity.GoalEntity
import com.apex.athlete.core.database.entity.GoalKind
import com.apex.athlete.core.database.entity.MealKind
import com.apex.athlete.core.database.entity.QuickLogEntity
import com.apex.athlete.core.database.entity.QuickLogKind
import com.apex.athlete.core.domain.DataProvenance
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** The schema v4 tables against a real SQLite engine: every query compiles and returns what was written. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ExtrasDaoTest {

    private lateinit var db: ApexDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ApexDatabase::class.java)
            .allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    @Test
    fun behavioursKeepDefinitionsAndDailyValues() = runBlocking {
        val dao = db.behaviourDao()
        assertNull(dao.maxSortOrder())
        dao.upsertDef(BehaviourDefEntity("custom:a", "Sauna", BehaviourKind.YES_NO, "sauna", 5, archived = false))
        dao.upsertDef(BehaviourDefEntity("custom:b", "Reading", BehaviourKind.SCALE_0_4, "book", 2, archived = true))
        assertEquals(listOf("custom:b", "custom:a"), dao.defs().map { it.id })
        assertEquals(5, dao.maxSortOrder())

        dao.upsertEntry(BehaviourEntryEntity(20_000, "custom:a", 1.0, 10))
        dao.upsertEntry(BehaviourEntryEntity(20_000, "custom:a", 0.0, 20)) // same key: replaced
        dao.upsertEntry(BehaviourEntryEntity(20_001, "custom:b", 3.0, 30))
        assertEquals(listOf(0.0), dao.entriesBetween(20_000, 20_000).map { it.value })
        assertEquals(2, dao.observeEntriesBetween(19_999, 20_005).first().size)
        assertEquals(1, dao.deleteEntry(20_000, "custom:a"))
        assertEquals(1, dao.entryCount())
        dao.deleteAllEntries(); dao.deleteAllDefs()
        assertEquals(0, dao.entryCount() + dao.defCount())
    }

    @Test
    fun quickLogRangesSumsAndTextRoundTrip() = runBlocking {
        val dao = db.quickLogDao()
        dao.upsertAll(
            listOf(
                QuickLogEntity("1", 1_000, QuickLogKind.WATER_ML, 250.0),
                QuickLogEntity("2", 2_000, QuickLogKind.WATER_ML, 500.0),
                QuickLogEntity("3", 3_000, QuickLogKind.WATER_ML, 300.0),
                QuickLogEntity("4", 2_500, QuickLogKind.NOTE, text = "slept badly", label = null),
                QuickLogEntity("5", 2_600, QuickLogKind.SYMPTOM, label = "headache"),
            ),
        )
        assertEquals(750.0, dao.observeSum(QuickLogKind.WATER_ML, 0, 3_000).first())
        assertNull(dao.observeSum(QuickLogKind.MOOD, 0, 10_000).first())
        assertEquals(listOf("1", "2", "4", "5"), dao.between(0, 3_000).map { it.id }) // end exclusive
        assertEquals(listOf("3", "5", "4"), dao.observeRecent(3).first().map { it.id })
        assertEquals("slept badly", dao.byId("4")?.text)
        assertNull(dao.byId("4")?.numericValue)
        assertEquals(1, dao.deleteById("1"))
        dao.deleteAll()
        assertEquals(0, dao.count())
    }

    @Test
    fun goalsRoundTrip() = runBlocking {
        val dao = db.goalDao()
        dao.upsert(GoalEntity("g1", GoalKind.DAILY_STEPS, 8_000.0, enabled = true, reminderEnabled = false, createdAtEpochMillis = 2))
        dao.upsert(GoalEntity("g2", GoalKind.WEEKLY_RECOVERED_DAYS, 4.0, enabled = false, reminderEnabled = true, createdAtEpochMillis = 1))
        assertEquals(listOf("g2", "g1"), dao.observeAll().first().map { it.id })
        dao.upsert(GoalEntity("g1", GoalKind.DAILY_STEPS, 9_000.0, enabled = true, reminderEnabled = true, createdAtEpochMillis = 2))
        assertEquals(9_000.0, dao.byId("g1")?.target)
        assertEquals(1, dao.deleteById("g2"))
        dao.deleteAll()
        assertEquals(0, dao.count())
    }

    @Test
    fun foodKeepsMissingNutrientsMissing() = runBlocking {
        val dao = db.foodLogDao()
        dao.upsert(FoodLogEntity("f1", 1_000, MealKind.LUNCH, "Soup", kcal = null, proteinG = 12.5, source = FoodSource.MANUAL, provenance = DataProvenance.USER_REPORTED))
        dao.upsert(FoodLogEntity("f2", 2_000, MealKind.SNACK, "Bar", kcal = 210.0, fibreG = 0.0, source = FoodSource.AI_ESTIMATE, provenance = DataProvenance.AI_INTERPRETED))
        val soup = dao.byId("f1")!!
        assertNull(soup.kcal); assertNull(soup.carbsG); assertNull(soup.fatG); assertNull(soup.fibreG)
        assertEquals(12.5, soup.proteinG)
        assertEquals(0.0, dao.byId("f2")?.fibreG) // a stated zero stays a zero
        assertEquals(DataProvenance.AI_INTERPRETED, dao.byId("f2")?.provenance)
        assertEquals(listOf("f1"), dao.between(0, 2_000).map { it.id })
        assertEquals(listOf("f2", "f1"), dao.observeRecent(10).first().map { it.id })
        dao.deleteAll()
        assertEquals(0, dao.count())
    }

    @Test
    fun bloodPressureAndBreatheRoundTrip() = runBlocking {
        val bp = db.bloodPressureDao()
        bp.upsert(BloodPressureReadingEntity("b1", 1_000, 121.5, 79.0, null, BloodPressureSource.MANUAL, DataProvenance.USER_REPORTED))
        bp.upsert(BloodPressureReadingEntity("b2", 2_000, 118.0, 76.0, 58, BloodPressureSource.HEALTH_CONNECT, DataProvenance.IMPORTED_HEALTH_CONNECT))
        assertEquals(listOf("b1", "b2"), bp.observeBetween(0, 5_000).first().map { it.id })
        assertEquals(121.5, bp.byId("b1")?.systolic)
        assertNull(bp.byId("b1")?.pulse)
        bp.deleteAll(); assertEquals(0, bp.count())

        val br = db.breatheSessionDao()
        br.upsert(BreatheSessionEntity("s1", 1_000, 300, 240, "box", avgHeartRate = null))
        br.upsert(BreatheSessionEntity("s2", 5_000, 300, 300, "four_seven_eight", avgHeartRate = 61))
        assertEquals(listOf("s2", "s1"), br.observeRecent(5).first().map { it.id })
        assertEquals(listOf("s1"), br.between(0, 5_000).map { it.id })
        assertNull(br.byId("s1")?.avgHeartRate)
        br.deleteAll(); assertEquals(0, br.count())
    }

    @Test
    fun coachMessagesCascadeWithTheirThread() = runBlocking {
        val dao = db.coachChatDao()
        dao.upsertThread(CoachThreadEntity("t1", "Sleep", CoachTopic.SLEEP, 1, 1))
        dao.upsertThread(CoachThreadEntity("t2", "General", CoachTopic.GENERAL, 2, 9))
        dao.upsertMessage(CoachMessageEntity("m1", "t1", CoachRole.USER, "Why am I tired?", 10, DataProvenance.USER_REPORTED))
        dao.upsertMessage(CoachMessageEntity("m2", "t1", CoachRole.COACH, "Short sleep.", 20, DataProvenance.AI_INTERPRETED, unverifiedNumerals = "7.5,12"))
        dao.upsertMessage(CoachMessageEntity("m3", "t2", CoachRole.COACH, "Rule reply.", 30, DataProvenance.MATHEMATICALLY_DERIVED))
        assertEquals(listOf("t2", "t1"), dao.observeThreads().first().map { it.id })
        assertEquals(listOf("m1", "m2"), dao.observeMessages("t1").first().map { it.id })
        assertEquals("7.5,12", dao.messages("t1").last().unverifiedNumerals)
        assertEquals(1, dao.touchThread("t1", 50))
        assertEquals(listOf("t1", "t2"), dao.observeThreads().first().map { it.id })
        assertEquals(1, dao.renameThread("t1", "Tiredness", 60))
        assertEquals("Tiredness", dao.threadById("t1")?.title)

        assertEquals(1, dao.deleteThread("t1"))
        assertEquals(listOf("m3"), dao.allMessages().map { it.id }) // t1's messages are gone with it
        dao.deleteAllThreads()
        assertEquals(0, dao.messageCount() + dao.threadCount())
    }
}
