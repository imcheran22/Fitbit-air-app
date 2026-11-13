package com.apex.athlete.ui.behaviours

import androidx.lifecycle.SavedStateHandle
import com.apex.athlete.core.data.extras.Behaviour
import com.apex.athlete.core.data.extras.DemoWriteRefusedException
import com.apex.athlete.core.database.entity.BehaviourKind
import com.apex.athlete.ui.quicklog.WriteOutcome
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
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
class BehavioursViewModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private fun b(id: String, builtIn: Boolean, archived: Boolean = false, kind: BehaviourKind = BehaviourKind.YES_NO) =
        Behaviour(id, id, kind, "behaviour", 0, archived, builtIn)

    private class Calls {
        val added = ArrayList<Pair<String, BehaviourKind>>()
        val hidden = ArrayList<Pair<String, Boolean>>()
        val deleted = ArrayList<String>()
        var failWith: Exception? = null
    }

    private fun vm(list: MutableStateFlow<List<Behaviour>>, calls: Calls, handle: SavedStateHandle = SavedStateHandle()) =
        BehavioursViewModel(
            behaviours = list,
            addCustom = { n, k -> calls.failWith?.let { throw it }; calls.added += n to k },
            applyHidden = { id, h -> calls.hidden += id to h },
            deleteCustom = { id -> calls.deleted += id },
            handle = handle,
        ).also { v -> CoroutineScope(Dispatchers.Main).launch { v.rows.collect { } } }

    @Test fun emptyListMeansLoadingAndRowsKeepOrderAndFlags() {
        val list = MutableStateFlow<List<Behaviour>>(emptyList())
        val v = vm(list, Calls())
        assertNull(v.rows.value)
        list.value = listOf(b("journal_alcohol", true), b("custom:1", false, archived = true, kind = BehaviourKind.SCALE_0_4))
        val rows = v.rows.value!!
        assertEquals(listOf("journal_alcohol", "custom:1"), rows.map { it.id })
        assertFalse(rows[0].canDelete)
        assertTrue(rows[1].canDelete)
        assertTrue(rows[1].hidden)
    }

    @Test fun builtInsAreNeverDeleted() {
        val calls = Calls()
        val v = vm(MutableStateFlow(listOf(b("journal_alcohol", true))), calls)
        v.delete("journal_alcohol")
        assertTrue(calls.deleted.isEmpty())
        v.delete("custom:9")
        assertEquals(listOf("custom:9"), calls.deleted)
    }

    @Test fun addTrimsClearsTheDraftAndRejectsBlankNames() {
        val calls = Calls()
        val v = vm(MutableStateFlow(listOf(b("journal_alcohol", true))), calls)
        v.setName("   ")
        assertFalse(v.canAdd())
        v.add()
        assertTrue(calls.added.isEmpty())
        v.setName("  Sauna ")
        v.setKind(BehaviourKind.SCALE_0_4)
        v.add()
        assertEquals(listOf("Sauna" to BehaviourKind.SCALE_0_4), calls.added)
        assertEquals("", v.name.value)
        assertEquals(WriteOutcome.SAVED, v.outcome.value)
    }

    @Test fun demoModeGivesACalmOutcomeAndKeepsTheDraft() {
        val calls = Calls().also { it.failWith = DemoWriteRefusedException() }
        val v = vm(MutableStateFlow(listOf(b("journal_alcohol", true))), calls)
        v.setName("Sauna")
        v.add()
        assertEquals(WriteOutcome.DEMO, v.outcome.value)
        assertEquals("Sauna", v.name.value)
    }

    @Test fun nameIsCappedAndValidated() {
        assertEquals(BehaviourNameError.EMPTY, BehaviourForm.nameError(""))
        assertEquals(BehaviourNameError.TOO_LONG, BehaviourForm.nameError("x".repeat(BehaviourForm.MAX_NAME_CHARS + 1)))
        assertNull(BehaviourForm.nameError("x".repeat(BehaviourForm.MAX_NAME_CHARS)))
        val v = vm(MutableStateFlow(emptyList()), Calls())
        v.setName("y".repeat(200))
        assertEquals(BehaviourForm.MAX_NAME_CHARS, v.name.value.length)
    }

    @Test fun draftSurvivesProcessDeath() {
        val handle = SavedStateHandle()
        vm(MutableStateFlow(emptyList()), Calls(), handle).apply { setName("Sauna"); setKind(BehaviourKind.SCALE_0_4) }
        val again = vm(MutableStateFlow(emptyList()), Calls(), handle)
        assertEquals("Sauna", again.name.value)
        assertEquals(BehaviourKind.SCALE_0_4, again.kind.value)
    }
}
