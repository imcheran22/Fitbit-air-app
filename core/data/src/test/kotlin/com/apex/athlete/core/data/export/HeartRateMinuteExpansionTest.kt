package com.apex.athlete.core.data.export

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HeartRateMinuteExpansionTest {
    private val t0 = 1_728_000_000_000L

    @Test fun preservesCountMinMaxAndAverage() {
        for ((avg, mn, mx, n) in listOf(Quad(61.5, 60, 63, 4), Quad(70.0, 70, 70, 1), Quad(61.0 + 1.0 / 3, 55, 70, 3), Quad(88.0, 60, 150, 60))) {
            val pts = HeartRateMinuteExpansion.expand(t0, avg, mn, mx, n)
            assertEquals(n, pts.size)
            assertEquals(mn, pts.minOf { it.bpm }); assertEquals(mx, pts.maxOf { it.bpm })
            assertTrue(abs(pts.sumOf { it.bpm }.toDouble() / n - avg) <= 0.5 / n + 1e-9)
            assertTrue(pts.all { it.epochMillis in t0 until t0 + 60_000 })
        }
    }

    @Test fun deterministic() = assertEquals(HeartRateMinuteExpansion.expand(t0, 80.3, 70, 95, 9), HeartRateMinuteExpansion.expand(t0, 80.3, 70, 95, 9))

    private data class Quad(val a: Double, val b: Int, val c: Int, val d: Int)
}
