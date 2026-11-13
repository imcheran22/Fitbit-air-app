package com.apex.athlete.ui.common

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.analytics.load.LoadCaveat
import com.apex.athlete.core.analytics.load.TrainingLoadResult
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.ZoneOffset
import kotlin.test.assertEquals

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS", application = android.app.Application::class)
class WorkloadRatioMappingTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val mapper = MetricStateMapper(ApexFormatter(context, UnitSystem.METRIC, true, { ZoneOffset.UTC }, { 1_800_000_000_000L }))

    private fun load(
        ratio: Double?,
        days: Int,
        caveats: Set<LoadCaveat> = emptySet(),
        calibrating: Boolean = false,
    ) = TrainingLoadResult(
        asOfDay = 20_800L, acuteLoad = null, chronicLoad = null, acwrCoupled = ratio, acwrUncoupled = null, workloadZone = null,
        caveats = caveats, monotony = null, fosterStrain = null, weeklyLoad = null, previousWeeklyLoad = null,
        weekOverWeekChange = null, load28d = null, trainingBalance = null, chronicLoadChange7d = null,
        daysOfHistory = days, validDaysLast28 = days, series = emptyList(), isCalibrating = calibrating,
    )

    @Test fun calibratingLoadIsCalibratingNotUnavailable() {
        assertEquals(MetricState.Calibrating(4), mapper.workloadRatio(load(null, 10, calibrating = true), calibrating = true))
    }

    @Test fun calibratingWinsEvenWhenARatioExists() {
        assertEquals(MetricState.Calibrating(null), mapper.workloadRatio(load(1.1, 30), calibrating = true))
    }

    @Test fun aRatioIsAValueWhenNotCalibrating() {
        assertEquals(
            MetricState.Value(1.1, 2, null, DataProvenance.MATHEMATICALLY_DERIVED),
            mapper.workloadRatio(load(1.1, 30)),
        )
    }

    @Test fun shortHistoryStaysCalibratingAndAFullHistoryWithoutARatioIsUnavailable() {
        assertEquals(MetricState.Calibrating(9), mapper.workloadRatio(load(null, 5, setOf(LoadCaveat.SHORT_HISTORY))))
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA), mapper.workloadRatio(load(null, 30)))
    }
}
