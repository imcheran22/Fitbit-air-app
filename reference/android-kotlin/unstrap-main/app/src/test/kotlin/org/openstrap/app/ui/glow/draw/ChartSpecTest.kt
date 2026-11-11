package org.openstrap.app.ui.glow.draw

import androidx.compose.ui.geometry.Offset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openstrap.app.data.db.SleepStage
import org.openstrap.app.ui.glow.GlowStage

/** The charts' shared geometry (widgets spec 6.2): what the cards and a widget's chart bitmaps both draw. */
class ChartSpecTest {
    private val density = 2.75f

    @Test fun `hypnogram bands are as long as their minutes`() {
        // A 400 minute night: 100 deep, 200 light, 60 REM, 40 awake.
        val stages = listOf(
            GlowStage(0f, 0.25f, 3), GlowStage(0.25f, 0.75f, 2), GlowStage(0.75f, 0.9f, 1), GlowStage(0.9f, 1f, 0),
        )
        val g = hypnogramGeometry(stages.shuffled(java.util.Random(3)), rows = 4, width = 318f * density, height = 96f * density, density = density, nameWidth = 0f, axis = false)!!
        val total = 318f * density
        listOf(100f, 200f, 60f, 40f).zip(g.bands).forEach { (minutes, band) -> assertEquals(minutes / 400f * total, band.size.width, 1e-2f) }
        // In order of time, each on its row's hairline, Awake at the top.
        assertEquals(stages, g.sorted)
        g.bands.forEach { b -> assertEquals(g.rowY[b.stage.row], b.topLeft.y + b.size.height / 2, 1e-3f) }
        assertTrue(g.rowY.zipWithNext().all { (a, b) -> a < b })
        assertEquals(4, g.rowY.size)
        // Round: the corner is half the band.
        g.bands.forEach { assertEquals(it.size.height / 2, it.corner, 1e-6f) }
        // Three changes of row, three joins for the white version.
        assertEquals(3, g.joins.size)
        assertNull(hypnogramGeometry(emptyList(), 4, 100f, 100f, density, 0f, false))
    }

    @Test fun `a stage too short to see is still as wide as it is high`() {
        val g = hypnogramGeometry(listOf(GlowStage(0f, 0.001f, 0)), 4, 300f, 100f, 1f, 0f, false)!!
        assertEquals(g.bands[0].size.height, g.bands[0].size.width, 1e-6f)
    }

    @Test fun `names and times take room off the plot`() {
        val g = hypnogramGeometry(listOf(GlowStage(0f, 1f, 0)), 4, 300f * density, 130f * density, density, 46f * density, axis = true)!!
        assertEquals(46f * density, g.gridX0, 0f)
        assertEquals(46f * density, g.bands[0].topLeft.x, 1e-3f)
        assertEquals((130f - 18f) * density, g.plotBottom, 1e-3f)
    }

    @Test fun `the ghost line ends in a dot on the latest hour`() {
        val today = listOf(0f, 100f, 900f, 2400f, null, null)
        val g = ghostLineGeometry(today, usual = listOf(0f, 200f, 800f, 2000f, 4000f, 6000f), max = 10_000f, width = 300f, height = 56f, density = 1f)!!
        assertEquals(4, g.today.size)
        assertEquals(4.5f, g.endDot, 0f)
        // Evenly spaced over the whole span, the ends in by the dot.
        assertEquals(4.5f, g.today.first().x, 1e-4f)
        assertEquals(4.5f + 3 * (300f - 9f) / 5, g.today.last().x, 1e-3f)
        // Zero sits on the floor, the axis tops out at max.
        assertEquals(56f - 4.5f, g.today.first().y, 1e-4f)
        assertEquals(6, g.usual!!.size)
        assertNull(ghostLineGeometry(listOf(1f), null, 10f, 300f, 56f, 1f))
        assertNull(ghostLineGeometry(listOf(1f, 2f), listOf(1f), 10f, 300f, 56f, 1f)!!.usual)
    }

    @Test fun `the ghost line is the one GhostLine always drew`() {
        // GhostLine's inline maths before it was shared, kept here as the reference.
        val today = listOf(10f, 40f, null, 70f)
        val (w, hgt, max) = Triple(173f * density, 52f * density, 100f)
        val r = 4.5f * density
        val h = hgt - r
        fun xOf(i: Int, n: Int) = r + i / (n - 1f) * (w - r * 2)
        fun yOf(v: Float) = r + (h - r) * (1f - (v / max).coerceIn(0f, 1f))
        val expected = today.mapIndexedNotNull { i, v -> v?.let { Offset(xOf(i, today.size), yOf(it)) } }
        assertEquals(expected, ghostLineGeometry(today, null, max, w, hgt, density)!!.today)
    }

    @Test fun `a gap breaks the line, a lone reading is a dot`() {
        val values = listOf(60f, 62f, 64f, null, 70f, null, null, 58f, 57f)
        val g = lineChartGeometry(values, 358f * density, 72f * density, density, inset = 7f * density, axis = true, band = 55f..65f)!!
        assertEquals(2, g.runs.size)
        assertEquals(listOf(3, 2), g.runs.map { it.size })
        assertEquals(1, g.dots.size)
        assertEquals(g.xOf(4), g.dots[0].x, 1e-4f)
        assertEquals(Offset(g.xOf(8), g.yOf(57f)), g.last)
        assertEquals(3, g.grid.size)
        assertEquals(10f * density, g.grid.first(), 1e-4f)
        assertEquals((72f - 18f) * density, g.plotBottom, 1e-3f)
        // The band covers your normal, from its top to its foot.
        assertEquals(g.yOf(65f), g.bandTopLeft!!.y, 1e-4f)
        assertEquals(g.yOf(55f) - g.yOf(65f), g.bandSize!!.height, 1e-4f)
        assertEquals(values.filterNotNull().average().toFloat(), g.average, 1e-4f)
        assertNull(lineChartGeometry(listOf(null, null), 100f, 100f, 1f, 0f))
    }

    @Test fun `a fixed axis holds whatever the data`() {
        val g = lineChartGeometry(listOf(40f, 50f), 200f, 64f, 1f, inset = 7f, yRange = 0f..100f)!!
        assertEquals(10f + 54f * 0.5f, g.yOf(50f), 1e-4f)
        assertEquals(64f, g.yOf(0f), 1e-4f)
    }

    @Test fun `the smooth line passes through every reading and never overshoots`() {
        val pts = listOf(Offset(0f, 50f), Offset(10f, 20f), Offset(20f, 20f), Offset(30f, 80f), Offset(40f, 70f))
        val ops = smoothOps(pts)
        assertEquals(PathOp.Move(0f, 50f), ops.first())
        val cubics = ops.drop(1).map { it as PathOp.Cubic }
        assertEquals(pts.drop(1), cubics.map { Offset(it.x3, it.y3) })
        cubics.forEachIndexed { i, c ->
            val lo = minOf(pts[i].y, pts[i + 1].y)
            val hi = maxOf(pts[i].y, pts[i + 1].y)
            assertTrue("segment $i", c.y1 in lo..hi && c.y2 in lo..hi)
        }
        assertEquals(listOf(PathOp.Move(0f, 0f), PathOp.Line(1f, 1f)), smoothOps(listOf(Offset(0f, 0f), Offset(1f, 1f))))
        assertTrue(smoothOps(emptyList()).isEmpty())
    }

    @Test fun `stage totals go deepest first and drop a stage under a minute`() {
        val totals = stageTotals(mapOf(SleepStage.AWAKE to 600L, SleepStage.LIGHT to 16_000L, SleepStage.DEEP to 5_500L, SleepStage.REM to 59L))
        assertEquals(listOf(SleepStage.DEEP to 5_500L, SleepStage.LIGHT to 16_000L, SleepStage.AWAKE to 600L), totals)
    }

    @Test fun `stage bar segments fill the bar in whole pixels, split by time`() {
        val totals = listOf(SleepStage.DEEP to 5_520L, SleepStage.REM to 6_060L, SleepStage.LIGHT to 16_020L, SleepStage.AWAKE to 1_080L)
        val width = 873
        val gap = 6
        val s = stageBarSegments(totals, width, gap)
        assertEquals(width, s.last().left + s.last().width)
        assertEquals(width - gap * 3, s.sumOf { it.width })
        s.zipWithNext().forEach { (a, b) -> assertEquals(a.left + a.width + gap, b.left) }
        val space = (width - gap * 3).toFloat()
        val total = totals.sumOf { it.second }.toFloat()
        s.forEachIndexed { i, seg -> assertEquals(space * totals[i].second / total, seg.width.toFloat(), 1f) }
        assertTrue(stageBarSegments(emptyList(), 100, 2).isEmpty())
    }

    @Test fun `pill bars stay thin and never shrink to a dot`() {
        val wide = pillBar(0f, pitch = 40f, bottom = 100f, height = 50f, maxWidth = 6f * density)
        assertEquals(6f * density, wide.size.width, 1e-4f)
        assertEquals((40f - 6f * density) / 2, wide.topLeft.x, 1e-4f)
        assertEquals(50f, wide.size.height, 0f)
        assertEquals(wide.size.width / 2, wide.corner, 0f)
        val short = pillBar(0f, pitch = 10f, bottom = 100f, height = 1f, maxWidth = 100f)
        assertEquals(short.size.width * 2, short.size.height, 1e-4f)
        assertEquals(100f, short.topLeft.y + short.size.height, 1e-4f)
    }

    @Test fun `hour pills light the latest hour with steps, or the picked one`() {
        val hourly = List(24) { h -> if (h in 7..15 && h != 12) (h * 100).toFloat() else 0f }
        val g = hourPills(hourly, picked = null, width = 318f * density, height = 56f * density, density = density)!!
        assertEquals(8, g.bars.size)
        assertEquals(listOf(false, false, false, false, false, false, false, true), g.bars.map { it.second })
        // The busiest hour reaches the top.
        assertEquals(0f, g.bars.minOf { it.first.topLeft.y }, 1e-3f)
        assertEquals(56f * density - 0.5f * density, g.baselineY, 1e-4f)
        val picked = hourPills(hourly, picked = 9, width = 318f * density, height = 56f * density, density = density)!!
        assertEquals(1, picked.bars.count { it.second })
        assertTrue(picked.bars.first { it.second }.first.topLeft.x < picked.bars.last().first.topLeft.x)
        assertNull(hourPills(emptyList(), null, 100f, 100f, 1f))
    }
}
