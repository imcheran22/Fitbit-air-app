package com.apex.athlete.ui.goals

import androidx.lifecycle.SavedStateHandle
import com.apex.athlete.core.data.extras.DemoWriteRefusedException
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.database.entity.GoalEntity
import com.apex.athlete.core.database.entity.GoalKind
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
import kotlin.test.assertIs
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class GoalsViewModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private val goals = MutableStateFlow(emptyList<GoalEntity>())
    private val trends = MutableStateFlow<TrendIntelligenceState?>(null)
    private val adds = ArrayList<Pair<GoalKind, Double>>()
    private var failWith: Exception? = null

    private fun vm() = GoalsViewModel(
        today = 19_725L, goals = goals, trends = trends,
        add = { k, t -> failWith?.let { throw it }; adds += k to t },
        updateTarget = { _, _ -> failWith?.let { throw it } },
        setEnabled = { _, _ -> failWith?.let { throw it } },
        remove = { _ -> failWith?.let { throw it } },
        handle = SavedStateHandle(),
    ).also { v -> CoroutineScope(Dispatchers.Main).launch { v.state.collect { } } }

    @Test fun loadingUntilTheRepositoryAnswers() {
        val v = vm()
        assertEquals(GoalsUi.Loading, v.state.value)
        trends.value = TrendIntelligenceState(isDemo = false, asOfDay = 19_725L, rangeDays = 90, trends = emptyList())
        val ready = assertIs<GoalsUi.Ready>(v.state.value)
        assertTrue(ready.rows.isEmpty())
        assertEquals(GoalKind.entries, ready.addable)
    }

    @Test fun invalidTargetIsNeverWritten() {
        val v = vm()
        v.create(GoalKind.DAILY_STEPS, "0")
        v.create(GoalKind.DAILY_STEPS, "abc")
        assertTrue(adds.isEmpty())
        v.create(GoalKind.DAILY_STEPS, "8000")
        assertEquals(listOf(GoalKind.DAILY_STEPS to 8000.0), adds)
        assertEquals(GoalSaveStatus.IDLE, v.status.value)
    }

    @Test fun demoRefusalIsACalmStatusNotACrash() {
        failWith = DemoWriteRefusedException()
        val v = vm()
        v.create(GoalKind.DAILY_STEPS, "8000")
        assertEquals(GoalSaveStatus.DEMO, v.status.value)
        v.dismissStatus()
        assertEquals(GoalSaveStatus.IDLE, v.status.value)
    }

    @Test fun otherFailuresAreAnErrorStatus() {
        failWith = IllegalStateException("no store")
        val v = vm()
        v.delete("x")
        assertEquals(GoalSaveStatus.ERROR, v.status.value)
    }
}
