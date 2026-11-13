package com.apex.athlete.ui.recovery

import com.apex.athlete.core.analytics.recovery.FatigueAssessment
import com.apex.athlete.core.analytics.recovery.FatigueLevel
import com.apex.athlete.core.analytics.trend.WeeklyHrvState
import com.apex.athlete.core.analytics.trend.WeeklyHrvStatus
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

class RecoveryWeeklyHrvTest {
    private val derived = DataProvenance.MATHEMATICALLY_DERIVED

    private fun status(state: WeeklyHrvState, baselineNights: Int = 60, average: Double? = 61.4) = WeeklyHrvStatus(
        state = state, weekNights = 7, baselineNights = baselineNights,
        weekAverage = average, baselineCenter = 63.0, rangeLow = 55.2, rangeHigh = 70.9, markedlyLowLine = 48.0, zScore = -0.2,
    )

    @Test fun judgedStatesMapToLabelsWithTheWeekAverage() {
        val cases = mapOf(
            WeeklyHrvState.WITHIN_RANGE to HrvWeekLabel.Balanced,
            WeeklyHrvState.ABOVE_RANGE to HrvWeekLabel.Above,
            WeeklyHrvState.BELOW_RANGE to HrvWeekLabel.Below,
            WeeklyHrvState.MARKEDLY_BELOW to HrvWeekLabel.MarkedlyBelow,
        )
        for ((engine, label) in cases) {
            val ui = weeklyHrvOf(status(engine))
            assertEquals(label, ui.label)
            assertEquals(MetricState.Value(61.4, 0, "ms", derived), ui.state)
            assertEquals(55.2, ui.rangeLow)
            assertEquals(70.9, ui.rangeHigh)
        }
    }

    @Test fun buildingBaselineIsCalibratingWithTheNightsStillNeeded() {
        val ui = weeklyHrvOf(status(WeeklyHrvState.BASELINE_BUILDING, baselineNights = 14, average = null))
        assertNull(ui.label)
        assertEquals(MetricState.Calibrating(7), ui.state) // 21 baseline nights are needed
        assertNull(ui.rangeLow)
        assertEquals(MetricState.Calibrating(21), weeklyHrvOf(status(WeeklyHrvState.BASELINE_BUILDING, baselineNights = 0, average = null)).state)
    }

    @Test fun tooFewRecentNightsOrNoStatusIsUnavailableNotCalibrating() {
        val none = weeklyHrvOf(status(WeeklyHrvState.NO_RECENT_NIGHTS, average = null))
        assertNull(none.label)
        assertEquals(MetricState.Unavailable(MetricReason.NO_HRV_LAST_NIGHT), none.state)
        assertEquals(MetricState.Unavailable(MetricReason.NO_HRV_LAST_NIGHT), weeklyHrvOf(null).state)
    }

    @Test fun aJudgedStatusWithoutAnAverageShowsNoNumber() {
        val ui = weeklyHrvOf(status(WeeklyHrvState.WITHIN_RANGE, average = null))
        assertNull(ui.label)
        assertIs<MetricState.Unavailable>(ui.state)
    }

    @Test fun fatigueIsNoDataWhenNotEvaluable() {
        val assessment = FatigueAssessment(FatigueLevel.NONE, emptySet(), evaluable = false)
        assertEquals(FatigueUi.NoData, fatigueUiOf(false, assessment))
        assertEquals(FatigueUi.Assessed(assessment), fatigueUiOf(true, assessment))
    }
}
