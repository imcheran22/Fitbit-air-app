package com.apex.athlete.ui.datasources

import com.apex.athlete.core.data.source.AirStatusResult
import com.apex.athlete.core.data.source.FitbitAirStatus
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

@OptIn(ExperimentalCoroutinesApi::class)
class FitbitAirViewModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private val found = AirStatusResult.Found(FitbitAirStatus("Fitbit Air", 64, "Medium", 9_000L))

    @Test fun startsLoadingThenShowsTheFetchedStatus() {
        val vm = FitbitAirViewModel(read = { found }, cached = { null })
        assertEquals(AirRowKind.LOADING, vm.state.value.kind)
        vm.refresh()
        assertEquals(AirRowKind.FOUND, vm.state.value.kind)
        assertEquals(64, vm.state.value.batteryPercent)
        assertEquals("Fitbit Air", vm.state.value.model)
    }

    @Test fun usesTheInMemoryCacheForTheFirstFrame() {
        val vm = FitbitAirViewModel(read = { found }, cached = { found })
        assertEquals(AirRowKind.FOUND, vm.state.value.kind)
    }

    @Test fun aThrowingReadBecomesUnavailableNotACrash() {
        val vm = FitbitAirViewModel(read = { throw IllegalStateException("boom") }, cached = { null })
        vm.refresh()
        assertEquals(AirRowKind.UNAVAILABLE, vm.state.value.kind)
        assertNull(vm.state.value.model)
    }

    @Test fun aRefreshWhileOneIsRunningDoesNotStackAndKeepsTheOldRowVisible() {
        val gate = CompletableDeferred<AirStatusResult>()
        var reads = 0
        val vm = FitbitAirViewModel(read = { reads++; gate.await() }, cached = { found })
        vm.refresh(); vm.refresh()
        assertEquals(1, reads)
        assertEquals(AirRowKind.FOUND, vm.state.value.kind) // the cached row stays while loading
        gate.complete(AirStatusResult.ScopeMissing)
        assertEquals(AirRowKind.RECONNECT, vm.state.value.kind)
    }

    @Test fun scopeMissingAsksToReconnect() {
        val vm = FitbitAirViewModel(read = { AirStatusResult.ScopeMissing }, cached = { null })
        vm.refresh()
        assertEquals(AirRowKind.RECONNECT, vm.state.value.kind)
    }
}
