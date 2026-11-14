package com.apex.athlete.ui.research

import com.apex.athlete.R
import com.apex.athlete.core.analytics.research.ClockVariability
import com.apex.athlete.core.analytics.research.GuidelineSleepShortfall
import com.apex.athlete.core.analytics.research.SedentaryBouts
import com.apex.athlete.core.analytics.research.SedentaryDay
import com.apex.athlete.core.data.pipeline.ActivityResearchMissing
import com.apex.athlete.core.data.pipeline.ResearchInsights
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ResearchMappingTest {
    private val empty = ResearchInsights.EMPTY

    @Test fun robustZIsPutIntoWords() {
        assertNull(vsUsualWordOf(null))
        assertNull(vsUsualWordOf(Double.NaN))
        assertEquals(VsUsualWord.ABOUT_USUAL, vsUsualWordOf(0.4))
        assertEquals(VsUsualWord.ABOUT_USUAL, vsUsualWordOf(-0.99))
        assertEquals(VsUsualWord.SOMEWHAT_HIGHER, vsUsualWordOf(1.5))
        assertEquals(VsUsualWord.SOMEWHAT_LOWER, vsUsualWordOf(-1.0))
        assertEquals(VsUsualWord.MUCH_HIGHER, vsUsualWordOf(2.0))
        assertEquals(VsUsualWord.MUCH_LOWER, vsUsualWordOf(-3.2))
    }

    @Test fun usualRowWithoutBaselineIsUnavailableNotZero() {
        val row = usualRow(MetricType.HRV_RMSSD, 0, "ms", hasBaseline = false, usual = null, average = null, robustZ = 5.0)
        assertIs<MetricState.Unavailable>(row.usual)
        assertIs<MetricState.Unavailable>(row.average)
        assertNull(row.today)
    }

    @Test fun immatureBaselineIsCalibratingForTheMissingFigure() {
        val row = usualRow(MetricType.RESTING_HEART_RATE, 0, "bpm", hasBaseline = true, usual = null, average = 55.0, robustZ = null)
        assertIs<MetricState.Calibrating>(row.usual)
        val avg = assertIs<MetricState.Value>(row.average)
        assertEquals(55.0, avg.value)
        assertEquals(DataProvenance.MATHEMATICALLY_DERIVED, avg.provenance)
        assertNull(row.today)
    }

    @Test fun usualIsTheMedianAndAverageTheMeanAndTodayHasAWord() {
        val row = usualRow(MetricType.HRV_RMSSD, 0, "ms", hasBaseline = true, usual = 58.0, average = 61.0, robustZ = -1.4)
        assertEquals(58.0, assertIs<MetricState.Value>(row.usual).value)
        assertEquals(61.0, assertIs<MetricState.Value>(row.average).value)
        assertEquals(VsUsualWord.SOMEWHAT_LOWER, row.today)
    }

    @Test fun emptyResearchGivesFourMissingRowsAndNoPatterns() {
        val ui = recoveryResearchOf(empty)
        assertEquals(4, ui.rows.size)
        assertTrue(ui.rows.all { it.usual is MetricState.Unavailable && it.average is MetricState.Unavailable })
        assertIs<MetricState.Unavailable>(ui.hrv.cv)
        assertNull(ui.hrv.swc)
        assertTrue(patternsOf(empty).isEmpty())
    }

    @Test fun sleepShortfallIsHoursAndNightsMissingAreCounted() {
        val r = empty.copy(
            guidelineShortfall = GuidelineSleepShortfall(420.0, 90.0, 60.0, validNights = 6, missingNights = 1),
            sleepMidpointMinuteOfDay = 200.4,
            sleepMidpointSd7 = ClockVariability(200.0, 38.0, 6),
            wasoMinutes = 22.0,
            awakeningsPerHour = 1.25,
        )
        val ui = sleepResearchOf(r)
        assertEquals(1.5, assertIs<MetricState.Value>(ui.shortfall).value)
        assertEquals(1, ui.shortfallMissingNights)
        assertEquals(6, ui.shortfallValidNights)
        assertEquals(200, ui.midpointMinute)
        assertEquals(38.0, assertIs<MetricState.Value>(ui.midpointSd).value)
        assertEquals(6, ui.midpointSdNights)
        assertEquals(22.0, assertIs<MetricState.Value>(ui.waso).value)
    }

    @Test fun missingSleepResearchStaysMissing() {
        val ui = sleepResearchOf(empty)
        assertIs<MetricState.Unavailable>(ui.shortfall)
        assertNull(ui.midpointMinute)
        assertIs<MetricState.Unavailable>(ui.waso)
        assertIs<MetricState.Unavailable>(ui.awakeningsPerHour)
    }

    @Test fun midpointWrapsIntoTheDay() {
        assertEquals(1430, sleepResearchOf(empty.copy(sleepMidpointMinuteOfDay = -10.0)).midpointMinute)
    }

    @Test fun activityMissingReasonShowsNoNumbers() {
        val cases = mapOf(
            ActivityResearchMissing.DAY_NOT_COMPLETE to R.string.research_activity_missing_day,
            ActivityResearchMissing.NO_STEP_DATA to R.string.research_activity_missing_steps,
            ActivityResearchMissing.COARSE_STEP_DATA to R.string.research_activity_missing_coarse,
            ActivityResearchMissing.TOO_FEW_MINUTES to R.string.research_activity_missing_few,
        )
        cases.forEach { (reason, res) ->
            val ui = activityResearchOf(empty.copy(activityMissing = reason, peakCadence30 = 120.0))
            assertEquals(res, ui.missingRes)
            assertIs<MetricState.Unavailable>(ui.peakCadence)
            assertIs<MetricState.Unavailable>(ui.sedentary)
        }
    }

    @Test fun activityValuesComeFromTheDay() {
        val bouts = SedentaryBouts(30.0, listOf(45.0, 96.0), 96.0, 141.0, 612.0)
        val day = SedentaryDay(bouts, 840, 12, 1.2, 0.9)
        val ui = activityResearchOf(empty.copy(sedentary = day, peakCadence30 = 104.0, activityMissing = null))
        assertNull(ui.missingRes)
        assertEquals(612.0, assertIs<MetricState.Value>(ui.sedentary).value)
        assertEquals(2.0, assertIs<MetricState.Value>(ui.prolongedBouts).value)
        assertEquals(96.0, assertIs<MetricState.Value>(ui.longestBout).value)
        assertEquals(1.2, assertIs<MetricState.Value>(ui.breaksPerHour).value)
        assertEquals(104.0, assertIs<MetricState.Value>(ui.peakCadence).value)
        assertEquals(30, ui.boutThresholdMinutes)
    }
}
