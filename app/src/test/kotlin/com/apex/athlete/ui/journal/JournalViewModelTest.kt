package com.apex.athlete.ui.journal

import androidx.lifecycle.SavedStateHandle
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
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
class JournalViewModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private class Saved { val calls = ArrayList<Triple<Long, Int?, Int?>>() }

    private fun vm(saved: Saved, load: (Long) -> Flow<StoredCheckIn?>) =
        JournalViewModel(
            initialDay = 100L,
            load = load,
            persist = { d, f, s -> saved.calls += Triple(d, f, s) },
            handle = SavedStateHandle(),
        ).also { v -> CoroutineScope(Dispatchers.Main).launch { v.stored.collect { } } }

    @Test fun equalCheckInOnTheNextDayStillSeedsTheDraftAndNeverSavesNulls() {
        val saved = Saved()
        val v = vm(saved) { flowOf(StoredCheckIn(4, 6)) } // every day has the same ratings
        assertEquals(CheckInDraft(4, 6), v.draft.value)
        v.setDay(101L)
        assertEquals(StoredCheckIn(4, 6), v.stored.value)
        assertEquals(CheckInDraft(4, 6), v.draft.value, "the draft must show the stored ratings of the new day")
        v.save()
        assertTrue(saved.calls.isEmpty(), "nothing changed, so nothing may be saved")
    }

    @Test fun savingWhileTheNewDayIsStillLoadingDoesNothing() {
        val saved = Saved()
        val gate = MutableStateFlow<StoredCheckIn?>(StoredCheckIn(4, 6))
        val v = vm(saved) { day -> if (day == 100L) gate else MutableStateFlow(null) }
        v.setDay(101L)
        assertNull(v.stored.value, "the previous day's value must not be shown for the new day")
        assertFalse(canSave(v.draft.value, v.stored.value))
        v.save()
        assertTrue(saved.calls.isEmpty())
    }
}
