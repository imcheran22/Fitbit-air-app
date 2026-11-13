package com.apex.athlete.ui.quicklog

import androidx.lifecycle.SavedStateHandle
import com.apex.athlete.core.data.extras.DemoWriteRefusedException
import com.apex.athlete.core.database.entity.QuickLogEntity
import com.apex.athlete.core.database.entity.QuickLogKind
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class QuickLogModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun emptyDraftHasNothingToSave() {
        assertFalse(QuickLogForm.plan(QuickLogDraft()).canSave)
    }

    @Test fun waterMustBeWholeMlInRange() {
        assertEquals(250, QuickLogForm.waterMl("250"))
        assertNull(QuickLogForm.waterMl("0"))
        assertNull(QuickLogForm.waterMl("10001"))
        assertNull(QuickLogForm.waterMl("2.5"))
        assertEquals("250", QuickLogForm.sanitizeWater("2a5,0"))
        val bad = QuickLogForm.plan(QuickLogDraft(water = "0", mood = 3))
        assertTrue(bad.waterInvalid)
        assertFalse(bad.canSave, "an invalid water amount blocks the whole save instead of being dropped silently")
    }

    @Test fun planFollowsFixedOrderAndTrimsNote() {
        val plan = QuickLogForm.plan(QuickLogDraft("500", 4, setOf("nausea", "headache"), "  hi  "))
        assertEquals(
            listOf(
                QuickLogAction.Water(500), QuickLogAction.Mood(4),
                QuickLogAction.SymptomEntry("headache"), QuickLogAction.SymptomEntry("nausea"),
                QuickLogAction.Note("hi"),
            ),
            plan.actions,
        )
    }

    @Test fun noteIsCappedNeverRejected() {
        assertEquals(QuickLogForm.MAX_NOTE_CHARS, QuickLogForm.capNote("x".repeat(900)).length)
    }

    @Test fun blankNoteAndOutOfRangeMoodAreNotLogged() {
        assertTrue(QuickLogForm.plan(QuickLogDraft(mood = 9, note = "   ")).actions.isEmpty())
    }

    @Test fun entriesWithMissingValuesAreDroppedNotShownAsZero() {
        assertNull(toEntryUi(QuickLogEntity("a", 1, QuickLogKind.WATER_ML, null)))
        assertNull(toEntryUi(QuickLogEntity("b", 1, QuickLogKind.MOOD, null)))
        assertEquals(QuickLogEntryUi.Water("c", 1, 250), toEntryUi(QuickLogEntity("c", 1, QuickLogKind.WATER_ML, 250.0)))
        val s = toEntryUi(QuickLogEntity("d", 1, QuickLogKind.SYMPTOM, label = "headache")) as QuickLogEntryUi.SymptomLine
        assertEquals(Symptom.HEADACHE, s.symptom)
        val unknown = toEntryUi(QuickLogEntity("e", 1, QuickLogKind.SYMPTOM, label = "other")) as QuickLogEntryUi.SymptomLine
        assertNull(unknown.symptom)
    }

    private fun vm(writes: MutableList<QuickLogAction>, failOn: QuickLogAction? = null, error: Exception = IllegalStateException()) =
        QuickLogViewModel(
            todayEntries = flowOf(emptyList()),
            waterMlToday = flowOf(null),
            write = { a -> if (a == failOn) throw error else writes += a },
            remove = {},
            handle = SavedStateHandle(),
        )

    @Test fun savedPartsLeaveTheDraftAndAFailedPartStays() {
        val writes = ArrayList<QuickLogAction>()
        val v = vm(writes, failOn = QuickLogAction.Mood(3))
        v.setWater("250"); v.toggleMood(3); v.setNote("n")
        v.save()
        assertEquals(listOf<QuickLogAction>(QuickLogAction.Water(250)), writes)
        assertEquals(WriteOutcome.ERROR, v.outcome.value)
        assertEquals("", v.draft.value.water)
        assertEquals(3, v.draft.value.mood)
        assertEquals("n", v.draft.value.note)
    }

    @Test fun demoModeIsACalmOutcome() {
        val v = vm(ArrayList(), failOn = QuickLogAction.Water(250), error = DemoWriteRefusedException())
        v.setWater("250")
        v.save()
        assertEquals(WriteOutcome.DEMO, v.outcome.value)
        assertEquals("250", v.draft.value.water)
    }

    @Test fun moodToggleClears() {
        val v = vm(ArrayList())
        v.toggleMood(2); assertEquals(2, v.draft.value.mood)
        v.toggleMood(2); assertNull(v.draft.value.mood)
    }
}
