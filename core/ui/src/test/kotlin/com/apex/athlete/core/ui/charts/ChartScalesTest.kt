package com.apex.athlete.core.ui.charts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.Locale

class ChartScalesTest {

    private val utc: ZoneId = ZoneOffset.UTC
    private val dayMs = 86_400_000L
    private val hourMs = 3_600_000L
    private val minMs = 60_000L
    private val midnight = 20_000L * dayMs // 2024-10-04T00:00Z

    private fun pts(vararg ys: Double?) = ys.mapIndexed { i, y -> ChartPoint(i.toLong(), y) }

    // ---- ticks and domains ----

    @Test fun niceStepPicksOneTwoFiveSteps() {
        assertEquals(0.5, ChartScales.niceStep(1.0, 4), 1e-9)
        assertEquals(50.0, ChartScales.niceStep(100.0, 4), 1e-9)
        assertEquals(10.0, ChartScales.niceStep(24.0, 4), 1e-9)
        assertEquals(1.0, ChartScales.niceStep(0.0, 4), 1e-9)
    }

    @Test fun niceTicksAreMultiplesInsideRange() {
        assertEquals(listOf(50.0, 60.0, 70.0), ChartScales.niceTicks(48.0, 72.0, 4))
        assertEquals(listOf(0.0, 50.0, 100.0), ChartScales.niceTicks(0.0, 100.0, 4))
        assertEquals(listOf(5.0), ChartScales.niceTicks(5.0, 5.0, 4))
    }

    @Test fun decimalsForStepKeepsStepVisible() {
        assertEquals(0, ChartScales.decimalsForStep(10.0))
        assertEquals(1, ChartScales.decimalsForStep(0.5))
        assertEquals(2, ChartScales.decimalsForStep(0.25))
    }

    @Test fun lineDomainPadsAndIncludesBand() {
        val d = ChartScales.lineDomain(listOf(50.0, 60.0))!!
        assertEquals(49.0, d.min, 1e-9)
        assertEquals(61.0, d.max, 1e-9)
        val withBand = ChartScales.lineDomain(listOf(50.0, 60.0), listOf(40.0, 70.0))!!
        assertEquals(37.0, withBand.min, 1e-9)
        assertEquals(73.0, withBand.max, 1e-9)
    }

    @Test fun lineDomainWidensFlatSeriesAndHandlesEmpty() {
        val d = ChartScales.lineDomain(listOf(60.0, 60.0))!!
        assertTrue(d.min < 60.0 && d.max > 60.0)
        assertNull(ChartScales.lineDomain(emptyList()))
    }

    @Test fun niceDomainWidensToTickMultiples() {
        val d = ChartScales.niceDomain(AxisDomain(48.2, 71.3), 4)
        assertEquals(40.0, d.min, 1e-9)
        assertEquals(80.0, d.max, 1e-9)
    }

    @Test fun barDomainStartsAtZero() {
        val d = ChartScales.barDomain(listOf(72.0))
        assertEquals(0.0, d.min, 0.0)
        assertEquals(80.0, d.max, 1e-9)
        assertEquals(1.0, ChartScales.barDomain(emptyList()).max, 1e-9)
    }

    @Test fun mapLinearMapsEndsAndDegenerate() {
        assertEquals(100f, ChartScales.mapLinear(0.0, 0.0, 10.0, 100f, 200f), 1e-4f)
        assertEquals(200f, ChartScales.mapLinear(10.0, 0.0, 10.0, 100f, 200f), 1e-4f)
        assertEquals(150f, ChartScales.mapLinear(5.0, 3.0, 3.0, 100f, 200f), 1e-4f)
    }

    // ---- gaps ----

    @Test fun runsBreakAtNulls() {
        val r = ChartScales.runs(pts(1.0, 2.0, null, null, 3.0, null, 4.0, 5.0))
        assertEquals(listOf(0..1, 4..4, 6..7), r)
    }

    @Test fun runsBreakAtMissingSlotsWithoutNullRows() {
        val p = listOf(ChartPoint(1, 1.0), ChartPoint(2, 1.0), ChartPoint(5, 1.0), ChartPoint(6, 1.0))
        assertEquals(listOf(0..1, 2..3), ChartScales.runs(p, 1L))
        assertEquals(listOf(0..3), ChartScales.runs(p))
    }

    @Test fun runsOfEmptyOrAllNullAreEmpty() {
        assertTrue(ChartScales.runs(emptyList()).isEmpty())
        assertTrue(ChartScales.runs(pts(null, null)).isEmpty())
    }

    @Test fun statsCountOnlyRealValues() {
        val s = ChartScales.stats(pts(null, 4.0, null, 9.0, 2.0, null))
        assertEquals(3, s.validCount)
        assertEquals(3, s.missingCount)
        assertEquals(2.0, s.min!!, 0.0)
        assertEquals(9.0, s.max!!, 0.0)
        assertEquals(4, s.latestIndex)
        assertEquals(1, s.firstIndex)
        val none = ChartScales.stats(pts(null))
        assertNull(none.min)
        assertNull(none.latestIndex)
    }

    @Test fun missingDaysCountsAbsentAndNullAndIgnoresOutside() {
        val p = listOf(ChartPoint(10, 1.0), ChartPoint(11, null), ChartPoint(13, 2.0), ChartPoint(13, 3.0), ChartPoint(99, 1.0))
        assertEquals(3, ChartScales.missingDays(p, 10, 14)) // 11, 12, 14 missing; day 13 counted once
        assertEquals(0, ChartScales.missingDays(p, 5, 4))
    }

    // ---- nearest point ----

    @Test fun nearestIndexSkipsGapsAndPrefersEarlierOnTie() {
        val p = pts(1.0, null, null, 4.0)
        assertEquals(0, ChartScales.nearestIndex(p, 1.4))
        assertEquals(3, ChartScales.nearestIndex(p, 2.6))
        assertEquals(0, ChartScales.nearestIndex(p, 1.5)) // equidistant: the earlier point wins
    }

    @Test fun nearestIndexNullWhenNoRealPoint() {
        assertNull(ChartScales.nearestIndex(pts(null, null), 0.0))
        assertNull(ChartScales.nearestIndex(emptyList(), 0.0))
    }

    @Test fun slotIndexClamps() {
        assertEquals(0, ChartScales.slotIndex(-50f, 10f, 110f, 10))
        assertEquals(0, ChartScales.slotIndex(19f, 10f, 110f, 10))
        assertEquals(1, ChartScales.slotIndex(21f, 10f, 110f, 10))
        assertEquals(9, ChartScales.slotIndex(500f, 10f, 110f, 10))
        assertEquals(0, ChartScales.slotIndex(5f, 10f, 10f, 10))
    }

    // ---- time axis ----

    @Test fun timeTicksAlignToLocalClock() {
        val start = midnight - 2 * hourMs + 48 * minMs // 22:48 previous evening
        val end = midnight + 6 * hourMs + 41 * minMs   // 06:41
        val ticks = ChartScales.timeTicks(start, end, utc, 4)
        assertEquals(listOf(midnight, midnight + 2 * hourMs, midnight + 4 * hourMs, midnight + 6 * hourMs), ticks)
    }

    @Test fun timeTicksRespectZoneOffset() {
        val plus2 = ZoneOffset.ofHours(2)
        // 00:00 UTC to 08:00 UTC is 02:00 to 10:00 local; even local hours.
        val ticks = ChartScales.timeTicks(midnight, midnight + 8 * hourMs, plus2, 4)
        assertEquals(listOf(midnight, midnight + 2 * hourMs, midnight + 4 * hourMs, midnight + 6 * hourMs, midnight + 8 * hourMs), ticks)
        assertTrue(ChartScales.timeTicks(5, 5, utc).isEmpty())
    }

    @Test fun clockFormatting() {
        val t = midnight - 2 * hourMs + 48 * minMs
        assertEquals("22:48", ChartScales.formatClock(t, utc, true, Locale.US))
        assertEquals("10:48 PM", ChartScales.formatClock(t, utc, false, Locale.US))
        assertEquals("22:00", ChartScales.formatClockTick(t - 48 * minMs, utc, true, Locale.US))
        assertEquals("10 PM", ChartScales.formatClockTick(t - 48 * minMs, utc, false, Locale.US))
        assertEquals("10:48 PM", ChartScales.formatClockTick(t, utc, false, Locale.US))
        assertEquals("04:48", ChartScales.formatClock(t, ZoneOffset.ofHours(6), true, Locale.US))
    }

    @Test fun dayFormatting() {
        assertEquals("Oct 4", ChartScales.formatDay(20_000L, Locale.US))
        assertEquals("Fri, Oct 4", ChartScales.formatDayLong(20_000L, Locale.US))
        assertEquals("Fri", ChartScales.formatWeekday(20_000L, Locale.US))
    }

    // ---- number formatting ----

    @Test fun numberFormattingHasNoFakePrecisionOrNegativeZero() {
        assertEquals("12.3", ChartScales.formatNumber(12.345, 1, Locale.US))
        assertEquals("12", ChartScales.formatNumber(12.345, 0, Locale.US))
        assertEquals("0.0", ChartScales.formatNumber(-0.04, 1, Locale.US))
        assertEquals("-0.4", ChartScales.formatNumber(-0.4, 1, Locale.US))
    }

    @Test fun signedFormatting() {
        assertEquals("+1.2", ChartScales.formatSigned(1.2, 1, Locale.US))
        assertEquals("-0.4", ChartScales.formatSigned(-0.4, 1, Locale.US))
        assertEquals("0.0", ChartScales.formatSigned(0.02, 1, Locale.US))
    }

    // ---- zone / segment maths ----

    @Test fun sharePercentAndDuration() {
        assertEquals(25.0, ChartScales.sharePercent(25, 100)!!, 1e-9)
        assertNull(ChartScales.sharePercent(5, 0))
        assertEquals(Triple(1L, 1L, 1L), ChartScales.splitDuration(3661))
        assertEquals(Triple(0L, 0L, 0L), ChartScales.splitDuration(-5))
    }

    @Test fun countTimeGapsIgnoresOverlapAndTolerance() {
        val segs = listOf(0L to 100L, 100L to 200L, 200_000L to 300_000L, 250_000L to 260_000L, 400_000L to 500_000L)
        assertEquals(2, ChartScales.countTimeGaps(segs, 60_000L))
        assertEquals(0, ChartScales.countTimeGaps(listOf(0L to 10L, 50_000L to 60_000L), 60_000L))
        assertEquals(0, ChartScales.countTimeGaps(emptyList(), 0L))
    }

    @Test fun segmentAtIsStartInclusiveEndExclusive() {
        val segs = listOf(0L to 10L, 20L to 30L)
        assertEquals(0, ChartScales.segmentAt(segs, 0.0))
        assertNull(ChartScales.segmentAt(segs, 10.0))
        assertNull(ChartScales.segmentAt(segs, 15.0))
        assertEquals(1, ChartScales.segmentAt(segs, 25.5))
    }

    // ---- ACWR bands and tones ----

    @Test fun acwrBandThresholds() {
        assertEquals(AcwrBand.LOW, acwrBandOf(0.79))
        assertEquals(AcwrBand.OPTIMAL, acwrBandOf(0.80))
        assertEquals(AcwrBand.OPTIMAL, acwrBandOf(1.29))
        assertEquals(AcwrBand.ELEVATED, acwrBandOf(1.30))
        assertEquals(AcwrBand.ELEVATED, acwrBandOf(1.49))
        assertEquals(AcwrBand.HIGH, acwrBandOf(1.50))
    }

    @Test fun recoveryToneThresholds() {
        assertEquals(ChartTone.RECOVERY_GREEN, recoveryTone(67))
        assertEquals(ChartTone.RECOVERY_YELLOW, recoveryTone(66))
        assertEquals(ChartTone.RECOVERY_YELLOW, recoveryTone(34))
        assertEquals(ChartTone.RECOVERY_RED, recoveryTone(33))
    }
}
