package com.apex.athlete.core.ui.charts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DaySeriesMathTest {

    private fun pts(startDay: Long, vararg ys: Double?) = ys.mapIndexed { i, y -> ChartPoint(startDay + i, y) }

    @Test fun activeDaysAreTheUnionOfReadingsInsideTheWindowSortedWithoutDuplicates() {
        val a = pts(100, 1.0, null, 3.0, 4.0)      // 100, 102, 103
        val b = pts(102, 9.0, null, 7.0, 6.0)      // 102, 104, 105
        assertEquals(listOf(100L, 102L, 103L, 104L, 105L), DaySeriesMath.activeDays(a, b, 100, 105).map { it.x })
    }

    @Test fun daysOutsideTheWindowAndGapsAreNeverActive() {
        val a = pts(98, 1.0, 2.0, 3.0, null, 5.0)  // 98, 99, 100, (101 gap), 102
        assertEquals(listOf(100L, 102L), DaySeriesMath.activeDays(a, null, 100, 101 + 1).map { it.x })
        assertEquals(emptyList<Long>(), DaySeriesMath.activeDays(pts(10, null, null), null, 10, 11).map { it.x })
    }

    @Test fun valueOnFindsTheDayOrNull() {
        val a = pts(100, 1.5, null, 3.5)
        assertEquals(1.5, DaySeriesMath.valueOn(a, 100)!!, 1e-9)
        assertNull(DaySeriesMath.valueOn(a, 101))
        assertNull(DaySeriesMath.valueOn(a, 500))
    }

    @Test fun domainCoversTheDataAndTheBandAndFallsBackWithoutReadings() {
        val a = pts(0, 60.0, 64.0, null, 68.0)
        val plain = DaySeriesMath.domainFor(a, null)
        assertEquals(true, plain.min <= 60.0 && plain.max >= 68.0)
        val withBand = DaySeriesMath.domainFor(a, ChartBand(50.0, 80.0))
        assertEquals(true, withBand.min <= 50.0 && withBand.max >= 80.0)
        assertEquals(AxisDomain(0.0, 1.0), DaySeriesMath.domainFor(pts(0, null, null), null))
    }
}
