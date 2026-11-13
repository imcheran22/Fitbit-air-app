package com.apex.athlete.ui.detail

import androidx.lifecycle.SavedStateHandle
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
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
class DetailLoadTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun aValueIsReadyAfterLoading() = runBlocking {
        val seen = flowOf<Int?>(7).asDetailLoad().toList()
        assertEquals(listOf<DetailLoad<Int>>(DetailLoad.Loading, DetailLoad.Ready(7)), seen)
    }

    @Test fun nullMeansTheStoreIsNotReadyAndStaysLoading() = runBlocking {
        val seen = flowOf<Int?>(null, 3).asDetailLoad().toList()
        assertEquals(listOf<DetailLoad<Int>>(DetailLoad.Loading, DetailLoad.Loading, DetailLoad.Ready(3)), seen)
    }

    @Test fun anExceptionIsFailedNeverANumber() = runBlocking {
        val seen = flow<Int?> { throw IllegalStateException("db closed") }.asDetailLoad().toList()
        assertEquals(listOf<DetailLoad<Int>>(DetailLoad.Loading, DetailLoad.Failed), seen)
    }

    @Test fun readyOrNullOnlyReturnsAReadyValue() {
        assertEquals(5, DetailLoad.Ready(5).readyOrNull())
        assertNull((DetailLoad.Loading as DetailLoad<Int>).readyOrNull())
        assertNull((DetailLoad.Failed as DetailLoad<Int>).readyOrNull())
    }

    @Test fun changingTheDayDropsTheOldResultAtOnce() {
        val day = MutableStateFlow(10L)
        val seen = ArrayList<DetailLoad<String>>()
        val job = CoroutineScope(Dispatchers.Main).launch {
            day.loadPerDay { d -> flowOf<String?>("day$d") }.collect { seen += it }
        }
        assertEquals(DetailLoad.Ready("day10"), seen.last())
        day.value = 11L
        assertEquals(DetailLoad.Ready("day11"), seen.last())
        // Between the two days the screen saw Loading, never day 10 under day 11's date.
        assertEquals(listOf<DetailLoad<String>>(DetailLoad.Loading, DetailLoad.Ready("day10"), DetailLoad.Loading, DetailLoad.Ready("day11")), seen)
        job.cancel()
    }

    @Test fun theDayViewModelLoadsThePickedDayAndRemembersItAcrossProcessDeath() {
        val loaded = ArrayList<Long>()
        val handle = SavedStateHandle()
        val vm = DayLoadViewModel<String>(100L, handle, "test.day") { d -> loaded += d; flowOf("v$d") }
        val job = CoroutineScope(Dispatchers.Main).launch { vm.state.collect { } }
        assertEquals(DetailLoad.Ready("v100"), vm.state.value)
        vm.setDay(98L)
        assertEquals(DetailLoad.Ready("v98"), vm.state.value)
        assertEquals(98L, handle.get<Long>("test.day"))
        job.cancel()

        // A recreated ViewModel with the same saved state starts on the saved day, not on the route's initial day.
        val again = DayLoadViewModel<String>(100L, handle, "test.day") { d -> flowOf("v$d") }
        val job2 = CoroutineScope(Dispatchers.Main).launch { again.state.collect { } }
        assertEquals(98L, again.day.value)
        assertEquals(DetailLoad.Ready("v98"), again.state.value)
        assertTrue(loaded.containsAll(listOf(100L, 98L)))
        job2.cancel()
    }
}
