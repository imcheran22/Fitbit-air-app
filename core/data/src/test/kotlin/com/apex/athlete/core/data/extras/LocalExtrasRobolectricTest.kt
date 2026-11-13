package com.apex.athlete.core.data.extras

import com.apex.athlete.core.database.entity.BehaviourKind
import com.apex.athlete.core.database.entity.BloodPressureSource
import com.apex.athlete.core.database.entity.CoachRole
import com.apex.athlete.core.database.entity.CoachTopic
import com.apex.athlete.core.database.entity.FoodSource
import com.apex.athlete.core.database.entity.GoalKind
import com.apex.athlete.core.database.entity.MealKind
import com.apex.athlete.core.database.entity.QuickLogKind
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** [LocalExtras] on a real Room database: what is written is what is read, bad input writes nothing, Demo and the write mutex are respected. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class LocalExtrasRobolectricTest {
    private val opened = ArrayList<ExtrasHarness>()
    private fun harness(isDemo: Boolean = false, ready: Boolean = true) = ExtrasHarness(isDemo, ready).also { opened += it }
    private val wait = 30_000L

    @After fun tearDown() = opened.forEach { it.close() }

    @Test fun builtInBehavioursLiveInDailyMetricsAsSelfReported() = runBlocking {
        val h = harness()
        val b = h.extras.behaviours
        b.setValue(h.today, "journal_alcohol", 1.0)
        b.setValue(h.today, "journal_travel", 0.0)

        val row = h.db.dailyBiometricSummaryDao().get(MetricType.JOURNAL_ALCOHOL, h.today)
        assertNotNull(row)
        assertEquals(1.0, row.value, 0.0)
        assertEquals(DataProvenance.USER_REPORTED, row.provenance)
        assertEquals(BehaviourRepository.PROVENANCE, row.provenance)
        assertTrue(h.changedNotifications >= 2, "journal writes feed the analytics, so screens are told")

        val day = withTimeout(wait) { b.observeDay(h.today).first { list -> list.first { it.behaviour.id == "journal_alcohol" }.value == 1.0 } }
        assertEquals(0.0, day.first { it.behaviour.id == "journal_travel" }.value, "a logged no is 0.0")
        assertNull(day.first { it.behaviour.id == "journal_late_meal" }.value, "not logged stays missing")

        b.setValue(h.today, "journal_alcohol", null)
        assertNull(h.db.dailyBiometricSummaryDao().get(MetricType.JOURNAL_ALCOHOL, h.today))
        assertFailsWith<IllegalArgumentException> { b.setValue(h.today, "journal_alcohol", 0.5) }
        assertNull(h.db.dailyBiometricSummaryDao().get(MetricType.JOURNAL_ALCOHOL, h.today), "an invalid value writes nothing")
    }

    @Test fun customBehavioursAddRenameArchiveReorderAndKeepValues() = runBlocking {
        val h = harness()
        val b = h.extras.behaviours
        val sauna = b.add("  Sauna ", BehaviourKind.YES_NO, "sauna")
        val reading = b.add("Reading", BehaviourKind.SCALE_0_4, "book")
        assertTrue(sauna.startsWith("custom:"))
        assertEquals(listOf(5, 6), h.db.behaviourDao().defs().map { it.sortOrder }, "new ones go after the five built-ins")
        assertEquals("Sauna", h.db.behaviourDao().defById(sauna)?.name)

        b.setValue(h.today, sauna, 1.0)
        b.setValue(h.today, reading, 4.0)
        assertFailsWith<IllegalArgumentException> { b.setValue(h.today, reading, 5.0) }
        assertFailsWith<IllegalArgumentException> { b.setValue(h.today, sauna, 2.0) }
        assertFailsWith<IllegalArgumentException> { b.setValue(h.today, "custom:nope", 1.0) }
        assertEquals(2, h.db.behaviourDao().entryCount())
        assertEquals(0, h.changedNotifications, "custom behaviours do not feed the analytics, so no recompute is triggered")

        b.rename(sauna, "Sauna / cold plunge")
        b.setArchived(reading, true)
        assertEquals(listOf(sauna), b.observeBehaviours().first().filter { !it.builtIn }.map { it.id })
        assertEquals(listOf(sauna, reading), b.observeBehaviours(includeArchived = true).first().filter { !it.builtIn }.map { it.id })
        assertEquals("Sauna / cold plunge", b.observeBehaviours().first().first { it.id == sauna }.name)
        assertEquals(4.0, b.observeDay(h.today, includeArchived = true).first().first { it.behaviour.id == reading }.value, "archiving keeps the values")

        // Reorder with a built-in moved behind the custom ones: the built-in gets an override row, its values stay in daily metrics.
        b.reorder(listOf(reading, sauna, "journal_alcohol", "journal_late_caffeine", "journal_late_meal", "journal_stressful_day", "journal_travel"))
        assertEquals(listOf(reading, sauna, "journal_alcohol"), b.observeBehaviours(includeArchived = true).first().take(3).map { it.id })
        assertFailsWith<IllegalArgumentException> { b.reorder(listOf(sauna, sauna)) }
        assertFailsWith<IllegalArgumentException> { b.reorder(listOf("custom:ghost")) }
        assertFailsWith<IllegalArgumentException> { b.add("   ", BehaviourKind.YES_NO, "x") }
        assertFailsWith<IllegalArgumentException> { b.rename("custom:ghost", "x") }
        b.setValue(h.today, sauna, null)
        assertEquals(1, h.db.behaviourDao().entryCount())
    }

    @Test fun deletingACustomBehaviourRemovesItsValuesAndBuiltInsRefuse() = runBlocking {
        val h = harness()
        val b = h.extras.behaviours
        val sauna = b.add("Sauna", BehaviourKind.YES_NO, "sauna")
        b.setValue(h.today, sauna, 1.0)
        assertEquals(1, h.db.behaviourDao().entryCount())
        b.delete(sauna)
        assertNull(h.db.behaviourDao().defById(sauna))
        assertEquals(0, h.db.behaviourDao().entryCount(), "the logged values go with the behaviour")
        assertFailsWith<IllegalArgumentException> { b.delete("journal_alcohol") }
        assertFailsWith<IllegalArgumentException> { b.delete("not-a-behaviour") }
        b.delete("custom:ghost") // unknown custom id: nothing to do
    }

    @Test fun builtInBehavioursCanBeRenamedWithoutMovingTheirValues() = runBlocking {
        val h = harness()
        val b = h.extras.behaviours
        b.rename("journal_travel", "Trips")
        b.setArchived("journal_late_meal", true)
        b.setValue(h.today, "journal_travel", 1.0)
        assertEquals(1.0, h.db.dailyBiometricSummaryDao().get(MetricType.JOURNAL_TRAVEL, h.today)?.value)
        assertEquals(0, h.db.behaviourDao().entryCount())
        val shown = b.observeDay(h.today).first()
        assertEquals("Trips", shown.first { it.behaviour.id == "journal_travel" }.behaviour.name)
        assertTrue(shown.none { it.behaviour.id == "journal_late_meal" })
    }

    @Test fun demoStoreReadsEmptyAndRefusesEveryWrite() = runBlocking {
        val h = harness(isDemo = true)
        val e = h.extras
        assertTrue(e.behaviours.observeBehaviours().first().size == 5, "built-ins are shown, nothing is logged")
        assertTrue(e.behaviours.observeDay(h.today).first().all { it.value == null })
        assertTrue(e.quickLog.observeRecent().first().isEmpty() && e.goals.observeAll().first().isEmpty() && e.food.observeRecent().first().isEmpty())
        assertTrue(e.bloodPressure.observeRecent().first().isEmpty() && e.breathe.observeRecent().first().isEmpty() && e.coachChats.observeThreads().first().isEmpty())
        assertNull(e.quickLog.observeWaterMl(h.today).first())

        assertFailsWith<DemoWriteRefusedException> { e.behaviours.setValue(h.today, "journal_alcohol", 1.0) }
        assertFailsWith<DemoWriteRefusedException> { e.behaviours.add("x", BehaviourKind.YES_NO, "x") }
        assertFailsWith<DemoWriteRefusedException> { e.quickLog.addWater(250.0) }
        assertFailsWith<DemoWriteRefusedException> { e.goals.add(GoalKind.DAILY_STEPS, 8000.0) }
        assertFailsWith<DemoWriteRefusedException> { e.food.add(MealKind.LUNCH, "Soup") }
        assertFailsWith<DemoWriteRefusedException> { e.bloodPressure.add(120.0, 80.0) }
        assertFailsWith<DemoWriteRefusedException> { e.breathe.add(h.now, 300, 300, "box") }
        assertFailsWith<DemoWriteRefusedException> { e.coachChats.createThread("Chat") }
        assertEquals(0, h.db.quickLogDao().count() + h.db.goalDao().count() + h.db.foodLogDao().count() + h.db.coachChatDao().threadCount() + h.db.behaviourDao().defCount())
        assertNull(h.db.dailyBiometricSummaryDao().get(MetricType.JOURNAL_ALCOHOL, h.today))
    }

    @Test fun beforeTheStoreIsReadyReadsAreEmptyAndWritesFail() = runBlocking {
        val h = harness(ready = false)
        assertTrue(h.extras.quickLog.observeRecent().first().isEmpty())
        assertFailsWith<IllegalStateException> { h.extras.quickLog.addWater(250.0) }
        assertEquals(0, h.db.quickLogDao().count())
    }

    @Test fun writesWaitForTheStoreWriteMutex() = runBlocking {
        val h = harness()
        h.writeMutex.lock()
        val pending = async { h.extras.quickLog.addWater(100.0) }
        delay(300)
        assertFalse(pending.isCompleted, "a write must not run while a sync or import holds the mutex")
        assertEquals(0, h.db.quickLogDao().count())
        h.writeMutex.unlock()
        withTimeout(wait) { pending.await() }
        assertEquals(1, h.db.quickLogDao().count())
    }

    @Test fun quickLogEnforcesLimitsAndSumsWaterPerCivilDay() = runBlocking {
        val h = harness()
        val q = h.extras.quickLog
        q.addWater(250.0, h.now)
        q.addWater(500.0, h.now + 1_000)
        q.addWater(300.0, h.now + 86_400_000L) // next civil day
        assertEquals(750.0, withTimeout(wait) { q.observeWaterMl(h.today).first { it == 750.0 } })
        assertEquals(2, q.observeDay(h.today).first().size)

        val note500 = "n".repeat(500)
        val id = q.add(QuickLogKind.NOTE, text = note500)
        assertEquals(500, h.db.quickLogDao().byId(id)?.text?.length)
        assertFailsWith<IllegalArgumentException> { q.add(QuickLogKind.NOTE, text = "n".repeat(501)) }
        assertFailsWith<IllegalArgumentException> { q.add(QuickLogKind.NOTE, text = "   ") }
        assertFailsWith<IllegalArgumentException> { q.add(QuickLogKind.SYMPTOM) }
        assertFailsWith<IllegalArgumentException> { q.addWater(0.0) }
        assertFailsWith<IllegalArgumentException> { q.addWater(Double.NaN) }
        assertFailsWith<IllegalArgumentException> { q.add(QuickLogKind.MOOD, numericValue = 11.0) }
        val symptom = q.add(QuickLogKind.SYMPTOM, label = "Headache")
        assertNull(h.db.quickLogDao().byId(symptom)?.numericValue, "no value was given, none is invented")
        q.delete(symptom)
        assertNull(h.db.quickLogDao().byId(symptom))
        assertEquals(4, h.db.quickLogDao().count())
    }

    @Test fun goalsCreateUpdateAndDelete() = runBlocking {
        val h = harness()
        val g = h.extras.goals
        val id = g.add(GoalKind.WEEKLY_AZM, 150.0)
        assertEquals(150.0, g.get(id)?.target)
        assertTrue(g.get(id)!!.enabled && !g.get(id)!!.reminderEnabled)
        g.update(id, reminderEnabled = true)
        g.update(id, target = 200.0, enabled = false)
        val goal = g.observeAll().first().single()
        assertEquals(200.0, goal.target); assertFalse(goal.enabled); assertTrue(goal.reminderEnabled)
        assertEquals(h.now, goal.createdAtEpochMillis)
        assertFailsWith<IllegalArgumentException> { g.add(GoalKind.DAILY_STEPS, 0.0) }
        assertFailsWith<IllegalArgumentException> { g.update(id, target = Double.NaN) }
        assertFailsWith<IllegalArgumentException> { g.update("ghost", enabled = true) }
        g.delete(id)
        assertTrue(g.observeAll().first().isEmpty())
    }

    @Test fun foodKeepsMissingNutrientsMissingAndDerivesProvenanceFromTheSource() = runBlocking {
        val h = harness()
        val f = h.extras.food
        val manual = f.add(MealKind.LUNCH, " Soup ", proteinG = 12.5)
        val ai = f.add(MealKind.SNACK, "Bar", kcal = 210.0, fibreG = 0.0, source = FoodSource.AI_ESTIMATE)
        val hc = f.add(MealKind.DINNER, "Pasta", source = FoodSource.HEALTH_CONNECT, id = "hc:123")
        f.add(MealKind.DINNER, "Pasta again", source = FoodSource.HEALTH_CONNECT, id = "hc:123") // the same record: replaced
        val dao = h.db.foodLogDao()
        val soup = dao.byId(manual)!!
        assertEquals("Soup", soup.name)
        assertNull(soup.kcal); assertNull(soup.carbsG); assertNull(soup.fatG); assertNull(soup.fibreG)
        assertEquals(DataProvenance.USER_REPORTED, soup.provenance)
        assertEquals(DataProvenance.AI_INTERPRETED, dao.byId(ai)?.provenance)
        assertEquals(0.0, dao.byId(ai)?.fibreG)
        assertEquals(DataProvenance.IMPORTED_HEALTH_CONNECT, dao.byId(hc)?.provenance)
        assertEquals(3, dao.count())
        assertEquals("Pasta again", dao.byId("hc:123")?.name)

        f.update(soup.copy(source = FoodSource.AI_ESTIMATE, provenance = DataProvenance.USER_REPORTED, kcal = 300.0))
        assertEquals(DataProvenance.AI_INTERPRETED, dao.byId(manual)?.provenance, "provenance follows the source, a caller cannot mislabel it")
        assertFailsWith<IllegalArgumentException> { f.add(MealKind.LUNCH, "x", kcal = -1.0) }
        assertFailsWith<IllegalArgumentException> { f.add(MealKind.LUNCH, "  ") }
        assertFailsWith<IllegalArgumentException> { f.add(MealKind.LUNCH, "x", fatG = Double.NaN) }
        assertEquals(3, f.observeDay(h.today).first().size)
        f.delete(ai)
        assertNull(dao.byId(ai))
    }

    @Test fun bloodPressureIsValidatedAndLabelledBySource() = runBlocking {
        val h = harness()
        val bp = h.extras.bloodPressure
        val manual = bp.add(121.5, 79.0)
        val hc = bp.add(118.0, 76.0, pulse = 58, source = BloodPressureSource.HEALTH_CONNECT, id = "hc:bp1")
        val dao = h.db.bloodPressureDao()
        assertNull(dao.byId(manual)?.pulse)
        assertEquals(121.5, dao.byId(manual)?.systolic)
        assertEquals(DataProvenance.USER_REPORTED, dao.byId(manual)?.provenance)
        assertEquals(DataProvenance.IMPORTED_HEALTH_CONNECT, dao.byId(hc)?.provenance)
        assertFailsWith<IllegalArgumentException> { bp.add(80.0, 90.0) }
        assertFailsWith<IllegalArgumentException> { bp.add(320.0, 80.0) }
        assertFailsWith<IllegalArgumentException> { bp.add(120.0, 80.0, pulse = 5) }
        assertFailsWith<IllegalArgumentException> { bp.add(Double.NaN, 80.0) }
        assertEquals(2, bp.observeDays(h.today, h.today).first().size)
        assertEquals(2, bp.observeRecent(10).first().size)
        bp.delete(manual)
        assertEquals(1, dao.count())
    }

    @Test fun breatheSessionsKeepTheHeartRateOnlyWhenMeasured() = runBlocking {
        val h = harness()
        val br = h.extras.breathe
        val a = br.add(h.now, 300, 240, "box")
        val b = br.add(h.now + 60_000, 300, 300, "four_seven_eight", avgHeartRate = 61)
        assertNull(h.db.breatheSessionDao().byId(a)?.avgHeartRate)
        assertEquals(61, h.db.breatheSessionDao().byId(b)?.avgHeartRate)
        assertEquals(listOf(b, a), br.observeRecent(5).first().map { it.id })
        assertEquals(2, br.observeDay(h.today).first().size)
        assertFailsWith<IllegalArgumentException> { br.add(h.now, 0, 0, "box") }
        assertFailsWith<IllegalArgumentException> { br.add(h.now, 300, -1, "box") }
        assertFailsWith<IllegalArgumentException> { br.add(h.now, 300, 10, " ") }
        br.delete(a)
        assertEquals(1, h.db.breatheSessionDao().count())
    }

    @Test fun coachChatsLabelWhoWroteEachMessageAndCascadeOnDelete() = runBlocking {
        val h = harness()
        val c = h.extras.coachChats
        val t = c.createThread(" Sleep ", CoachTopic.SLEEP)
        val other = c.createThread("General")
        h.now += 1_000
        val u = c.appendUserMessage(t, "Why am I tired?")
        h.now += 1_000
        val m = c.appendCoachMessage(t, "Short sleep. About 7.5 hours.", fromModel = true, unverifiedNumerals = listOf("7.5", "12"))
        h.now += 1_000
        val r = c.appendCoachMessage(t, "Rule reply.", fromModel = false)
        val msgs = c.observeMessages(t).first()
        assertEquals(listOf(u, m, r), msgs.map { it.id })
        assertEquals(listOf(CoachRole.USER, CoachRole.COACH, CoachRole.COACH), msgs.map { it.role })
        assertEquals(listOf(DataProvenance.USER_REPORTED, DataProvenance.AI_INTERPRETED, DataProvenance.MATHEMATICALLY_DERIVED), msgs.map { it.provenance })
        assertEquals("7.5,12", msgs[1].unverifiedNumerals)
        assertNull(msgs[0].unverifiedNumerals); assertNull(msgs[2].unverifiedNumerals)
        assertEquals(listOf(t, other), c.observeThreads().first().map { it.id }, "the thread with the newest message comes first")
        assertEquals("Sleep", c.observeThreads().first().first().title)

        c.renameThread(t, "Tiredness")
        assertEquals("Tiredness", h.db.coachChatDao().threadById(t)?.title)
        assertFailsWith<IllegalArgumentException> { c.appendUserMessage("ghost", "hi") }
        assertFailsWith<IllegalArgumentException> { c.appendUserMessage(t, "  ") }
        assertFailsWith<IllegalArgumentException> { c.appendCoachMessage(t, "x", fromModel = true, unverifiedNumerals = listOf("1,2")) }
        assertFailsWith<IllegalArgumentException> { c.renameThread("ghost", "x") }
        assertFailsWith<IllegalArgumentException> { c.createThread("  ") }
        assertEquals(3, h.db.coachChatDao().messageCount())

        c.deleteThread(t)
        assertEquals(0, h.db.coachChatDao().messageCount(), "messages go with their thread")
        assertEquals(listOf(other), c.observeThreads().first().map { it.id })
    }
}
