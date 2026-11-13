package com.apex.athlete.ui.journal

import androidx.lifecycle.SavedStateHandle
import com.apex.athlete.core.data.repository.JournalState
import com.apex.athlete.core.domain.MetricType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class JournalFactorsViewModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private val alcohol = MetricType.JOURNAL_ALCOHOL
    private val caffeine = MetricType.JOURNAL_LATE_CAFFEINE

    private fun state(day: Long, vararg set: Pair<MetricType, Boolean>) = JournalState(
        isDemo = false,
        epochDay = day,
        factors = JOURNAL_FACTORS.associateWith { f -> set.toMap()[f] },
        effects = null,
    )

    private class Saved { val calls = ArrayList<Pair<Long, Map<MetricType, Boolean?>>>() }

    private fun vm(
        saved: Saved,
        load: (Long) -> Flow<JournalState?>,
        persist: suspend (Long, Map<MetricType, Boolean?>) -> Unit = { d, m -> saved.calls += d to m },
        day: Long = 100L,
    ) = JournalFactorsViewModel(day, load, persist, SavedStateHandle())
        .also { v -> CoroutineScope(Dispatchers.Main).launch { v.journal.collect { } } }

    @Test fun yesIsSavedAsTrueForThatFactorOnly() {
        val saved = Saved()
        val v = vm(saved, { d -> MutableStateFlow(state(d)) })
        v.select(alcohol, FactorChoice.YES)
        assertEquals(listOf(100L to mapOf<MetricType, Boolean?>(alcohol to true)), saved.calls)
        assertEquals(SaveStatus.SAVED, v.status.value)
        assertEquals(mapOf<MetricType, Boolean?>(alcohol to true), v.pending.value)
    }

    @Test fun noIsSavedAsFalse() {
        val saved = Saved()
        val v = vm(saved, { d -> MutableStateFlow(state(d)) })
        v.select(caffeine, FactorChoice.NO)
        assertEquals(listOf(100L to mapOf<MetricType, Boolean?>(caffeine to false)), saved.calls)
    }

    @Test fun notLoggedClearsAStoredAnswerBySavingNull() {
        val saved = Saved()
        val v = vm(saved, { d -> MutableStateFlow(state(d, alcohol to true)) })
        v.select(alcohol, FactorChoice.NOT_LOGGED)
        assertEquals(listOf(100L to mapOf<MetricType, Boolean?>(alcohol to null)), saved.calls)
        // The cleared choice shows at once.
        val panel = FactorsPanel.of(v.journal.value?.factors, v.pending.value, v.status.value)
        assertEquals(FactorChoice.NOT_LOGGED, panel.choices[alcohol])
    }

    @Test fun choosingWhatIsAlreadyStoredSavesNothing() {
        val saved = Saved()
        val v = vm(saved, { d -> MutableStateFlow(state(d, alcohol to true)) })
        v.select(alcohol, FactorChoice.YES)
        v.select(caffeine, FactorChoice.NOT_LOGGED)
        assertTrue(saved.calls.isEmpty())
        assertEquals(SaveStatus.IDLE, v.status.value)
    }

    @Test fun nothingIsSavedWhileTheDayIsStillLoading() {
        val saved = Saved()
        val v = vm(saved, { emptyFlow() })
        assertNull(v.journal.value)
        v.select(alcohol, FactorChoice.YES)
        assertTrue(saved.calls.isEmpty())
        assertTrue(v.pending.value.isEmpty())
    }

    @Test fun aFactorTheJournalDoesNotKnowIsIgnored() {
        val saved = Saved()
        val v = vm(saved, { d -> MutableStateFlow(state(d)) })
        v.select(MetricType.STEPS, FactorChoice.YES)
        assertTrue(saved.calls.isEmpty())
    }

    @Test fun aFailedSaveReportsAnErrorAndDropsThePendingChoice() {
        val saved = Saved()
        val v = vm(saved, { d -> MutableStateFlow(state(d)) }, persist = { _, _ -> throw IllegalStateException("The data store is not ready") })
        v.select(alcohol, FactorChoice.YES)
        assertEquals(SaveStatus.ERROR, v.status.value)
        assertTrue(v.pending.value.isEmpty())
        // The screen falls back to what is stored: not logged.
        assertEquals(FactorChoice.NOT_LOGGED, FactorsPanel.of(v.journal.value?.factors, v.pending.value, v.status.value).choices[alcohol])
    }

    @Test fun pendingChoiceIsDroppedOnceTheStoreHasCaughtUp() {
        val saved = Saved()
        val source = MutableStateFlow<JournalState?>(state(100L))
        val v = vm(saved, { source })
        v.select(alcohol, FactorChoice.YES)
        assertEquals(mapOf<MetricType, Boolean?>(alcohol to true), v.pending.value)
        source.value = state(100L, alcohol to true)
        assertTrue(v.pending.value.isEmpty())
        assertEquals(true, v.journal.value?.factors?.get(alcohol))
    }

    @Test fun changingTheDayClearsPendingAndNeverShowsTheOldDay() {
        val saved = Saved()
        val days = HashMap<Long, MutableStateFlow<JournalState?>>()
        val v = vm(saved, { d -> days.getOrPut(d) { MutableStateFlow(if (d == 100L) state(d, alcohol to true) else null) } })
        v.select(alcohol, FactorChoice.NO)
        v.setDay(101L)
        assertTrue(v.pending.value.isEmpty())
        assertEquals(SaveStatus.IDLE, v.status.value)
        assertNull(v.journal.value, "day 101 has not loaded: day 100's factors must not show")
        // Taps are ignored until the new day has loaded.
        v.select(alcohol, FactorChoice.YES)
        assertEquals(1, saved.calls.size)
        days.getValue(101L).value = state(101L)
        assertEquals(101L, v.journal.value?.epochDay)
        v.select(alcohol, FactorChoice.YES)
        assertEquals(101L to mapOf<MetricType, Boolean?>(alcohol to true), saved.calls.last())
    }
}
