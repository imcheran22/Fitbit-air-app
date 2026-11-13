package com.apex.athlete.ui.nap

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.data.repository.NapDetailResult
import com.apex.athlete.core.data.repository.NapDetailState
import com.apex.athlete.core.data.repository.NapsState
import com.apex.athlete.core.database.entity.SleepSessionEntity
import com.apex.athlete.core.database.entity.SleepStageSegmentEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.detail.TEST_TODAY
import com.apex.athlete.ui.detail.testFormatter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS", application = android.app.Application::class)
class NapModelsTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val f get() = testFormatter(context)
    private val minute = 60_000L
    private val hour = 60 * minute
    private val dayStart = TEST_TODAY * 24 * hour
    private val sensor = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    /** 12:10 to 12:55 UTC, recorded in a +01:00 offset at the start and +02:00 at the end (a clock change mid-nap). */
    private fun nap(
        id: String = "nap-1",
        provenance: DataProvenance = sensor,
        stages: Boolean = false,
        deep: Int? = null,
        rem: Int? = null,
        light: Int? = null,
        fall: Int? = null,
    ) = SleepSessionEntity(
        id = id,
        startEpochMillis = dayStart + 12 * hour + 10 * minute,
        endEpochMillis = dayStart + 12 * hour + 55 * minute,
        startZoneOffsetSeconds = 3600,
        endZoneOffsetSeconds = 7200,
        epochDay = TEST_TODAY,
        isMainSleep = false,
        isNap = true,
        hasStages = stages,
        minutesAsleep = 40,
        minutesAwake = 5,
        minutesInBed = 45,
        minutesToFallAsleep = fall,
        minutesDeep = deep,
        minutesRem = rem,
        minutesLight = light,
        provenance = provenance,
        updatedAtEpochMillis = 0L,
    )

    @Test fun theListRowShowsTheRecordedClockTimesTheDurationAndTheSource() {
        val rows = buildNapRows(NapsState(false, TEST_TODAY, listOf(nap("a"), nap("b", DataProvenance.IMPORTED_HEALTH_CONNECT))), f)
        assertEquals(listOf("a", "b"), rows.map { it.id })
        // Each end of the nap is shown in the offset it was recorded in.
        assertEquals("13:10 to 14:55", rows[0].timeRange)
        assertEquals(MetricState.Value(45.0, 0, "min", sensor), rows[0].duration)
        assertEquals(DataProvenance.IMPORTED_HEALTH_CONNECT, rows[1].provenance)
        assertEquals(MetricState.Value(45.0, 0, "min", DataProvenance.IMPORTED_HEALTH_CONNECT), rows[1].duration)
    }

    @Test fun noNapsIsAnEmptyListNotAFabricatedRow() {
        assertTrue(buildNapRows(NapsState(false, TEST_TODAY, emptyList()), f).isEmpty())
    }

    @Test fun aDetailWithoutStageScoringShowsNoStagesAndLeavesUnreportedMinutesBlank() {
        val ui = buildNapDetail(NapDetailState(false, nap(), emptyList()), f)
        assertEquals("Today", ui.dayLabel)
        assertEquals(MetricState.Value(45.0, 0, "min", sensor), ui.inBed)
        assertEquals(MetricState.Value(40.0, 0, "min", sensor), ui.asleep)
        assertEquals(MetricState.Value(5.0, 0, "min", sensor), ui.awake)
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA), ui.toFallAsleep)
        assertFalse(ui.hasStages)
        assertTrue(ui.stageRows.isEmpty())
        assertTrue(ui.segments.isEmpty())
    }

    @Test fun aScoredNapListsDeepRemAndLightWithAMissingOneUnavailable() {
        val n = nap(stages = true, deep = 10, rem = null, light = 30, fall = 3)
        val stages = listOf(
            SleepStageSegmentEntity(n.id, n.startEpochMillis, n.startEpochMillis + 10 * minute, SleepStage.DEEP),
            SleepStageSegmentEntity(n.id, n.startEpochMillis + 10 * minute, n.endEpochMillis, SleepStage.LIGHT),
        )
        val ui = buildNapDetail(NapDetailState(false, n, stages), f)
        assertTrue(ui.hasStages)
        assertEquals(listOf(SleepStage.DEEP, SleepStage.REM, SleepStage.LIGHT), ui.stageRows.map { it.stage })
        assertEquals(MetricState.Value(10.0, 0, "min", sensor), ui.stageRows[0].state)
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA), ui.stageRows[1].state)
        assertEquals(MetricState.Value(30.0, 0, "min", sensor), ui.stageRows[2].state)
        assertEquals(MetricState.Value(3.0, 0, "min", sensor), ui.toFallAsleep)
        assertEquals(2, ui.segments.size)
        assertEquals(3600, ui.zoneOffsetSeconds)
    }

    @Test fun aNapMarkedAsScoredButWithoutSegmentsDrawsNoHypnogram() {
        val ui = buildNapDetail(NapDetailState(false, nap(stages = true, deep = 5, rem = 5, light = 30), emptyList()), f)
        assertFalse(ui.hasStages)
        assertEquals(3, ui.stageRows.size)
    }

    // --- ViewModel ------------------------------------------------------------------------------

    private fun collect(vm: NapDetailViewModel) = CoroutineScope(Dispatchers.Main).launch { vm.state.collect { } }

    @Test fun nullIsLoadingAnUnknownIdIsNotFoundAndAFoundNapIsReady() {
        val loading = NapDetailViewModel("x") { flowOf(null) }
        val j1 = collect(loading)
        assertEquals(NapLoad.Loading, loading.state.value)
        j1.cancel()

        val missing = NapDetailViewModel("x") { flowOf(NapDetailResult(null)) }
        val j2 = collect(missing)
        assertEquals(NapLoad.NotFound, missing.state.value)
        j2.cancel()

        val found = NapDetailViewModel("nap-1") { id -> flowOf(NapDetailResult(NapDetailState(false, nap(id), emptyList()))) }
        val j3 = collect(found)
        assertEquals("nap-1", assertIs<NapLoad.Ready>(found.state.value).detail.nap.id)
        j3.cancel()
    }

    @Test fun aFailedReadIsFailedNotANumber() {
        val vm = NapDetailViewModel("x") { flow { throw IllegalStateException("closed") } }
        val job = collect(vm)
        assertEquals(NapLoad.Failed, vm.state.value)
        job.cancel()
    }

    @Test fun theNapsViewModelFollowsTheSleepDay() {
        val asked = ArrayList<Long>()
        val vm = NapsViewModel(TEST_TODAY, androidx.lifecycle.SavedStateHandle()) { d ->
            asked += d
            flowOf(NapsState(false, d, emptyList()))
        }
        val job = CoroutineScope(Dispatchers.Main).launch { vm.state.collect { } }
        vm.setDay(TEST_TODAY - 1)
        assertEquals(listOf(TEST_TODAY, TEST_TODAY - 1), asked)
        job.cancel()
    }
}
