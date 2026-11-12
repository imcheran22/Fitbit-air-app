package com.apex.athlete.ui.overview

import com.apex.athlete.core.analytics.trend.RangeStatus
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.components.GoodDirection
import com.apex.athlete.core.ui.shell.SyncStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class OverviewLogicTest {

    @Test fun notLoadedIsLoadingEvenWithData() {
        assertEquals(OverviewPhase.Loading, overviewPhase(loaded = false, hasAnyData = true))
    }

    @Test fun loadedWithoutDataIsFirstRun() {
        assertEquals(OverviewPhase.Empty, overviewPhase(loaded = true, hasAnyData = false))
    }

    @Test fun loadedWithDataIsContent() {
        assertEquals(OverviewPhase.Content, overviewPhase(loaded = true, hasAnyData = true))
    }

    @Test fun syncStatusRules() {
        val now = 100L * 60 * 60 * 1000
        val hour = 60L * 60 * 1000
        assertEquals(SyncStatus.Stale, syncStatusFor(false, false, now, now))
        assertEquals(SyncStatus.Ok, syncStatusFor(true, true, null, now))
        assertEquals(SyncStatus.Stale, syncStatusFor(true, false, null, now))
        assertEquals(SyncStatus.Ok, syncStatusFor(true, false, now - hour, now))
        assertEquals(SyncStatus.Ok, syncStatusFor(true, false, now - 36 * hour, now))
        assertEquals(SyncStatus.Stale, syncStatusFor(true, false, now - 36 * hour - 1, now))
    }

    @Test fun rangeCountsIgnoreMissingAndCalibrating() {
        val counts = rangeCounts(
            listOf(
                RangeStatus.ABOVE_NORMAL, RangeStatus.BELOW_NORMAL, RangeStatus.WITHIN_NORMAL,
                RangeStatus.NO_READING, RangeStatus.CALIBRATING,
            ),
        )
        assertEquals(2 to 3, counts)
        assertEquals(0 to 0, rangeCounts(emptyList()))
    }

    @Test fun goodDirections() {
        assertEquals(GoodDirection.UP, goodDirectionFor(MetricType.HRV_RMSSD))
        assertEquals(GoodDirection.DOWN, goodDirectionFor(MetricType.RESTING_HEART_RATE))
        assertEquals(GoodDirection.NEUTRAL, goodDirectionFor(MetricType.RESPIRATORY_RATE))
        assertEquals(1, averageDecimalsFor(MetricType.SPO2_AVG))
        assertEquals(0, averageDecimalsFor(MetricType.HRV_RMSSD))
    }
}
