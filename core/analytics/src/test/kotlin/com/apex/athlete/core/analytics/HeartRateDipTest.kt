package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.sleep.DipCategory
import com.apex.athlete.core.analytics.sleep.DipMissing
import com.apex.athlete.core.analytics.sleep.HeartRateDip
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class HeartRateDipTest {

    // Hand: (70 - 56) / 70 = 0.2.
    @Test
    fun `twenty percent dip is a dipper`() {
        val r = HeartRateDip.compute(70.0, 56.0)
        assertEquals(0.2, r.dipFraction!!, 1e-12)
        assertEquals(DipCategory.DIPPER, r.category)
    }

    // Hand: (70 - 63) / 70 = 0.1 -> boundary is inclusive.
    @Test
    fun `ten percent is the dipper boundary`() {
        assertEquals(DipCategory.DIPPER, HeartRateDip.compute(70.0, 63.0).category)
    }

    // Hand: (100 - 95) / 100 = 0.05.
    @Test
    fun `five percent is blunted`() {
        val r = HeartRateDip.compute(100.0, 95.0)
        assertEquals(0.05, r.dipFraction!!, 1e-12)
        assertEquals(DipCategory.BLUNTED, r.category)
    }

    // Hand: (60 - 63) / 60 = -0.05: sleeping HR above the day's.
    @Test
    fun `negative dip is reversed and keeps its sign`() {
        val r = HeartRateDip.compute(60.0, 63.0)
        assertEquals(-0.05, r.dipFraction!!, 1e-12)
        assertEquals(DipCategory.REVERSED, r.category)
    }

    @Test
    fun `missing input stays missing`() {
        assertEquals(DipMissing.NO_DAYTIME_HEART_RATE, HeartRateDip.compute(null, 56.0).missing)
        assertEquals(DipMissing.NO_SLEEPING_HEART_RATE, HeartRateDip.compute(70.0, null).missing)
        assertNull(HeartRateDip.compute(null, null).dipFraction)
        assertEquals(DipMissing.INVALID_INPUT, HeartRateDip.compute(0.0, 56.0).missing)
        assertEquals(DipMissing.INVALID_INPUT, HeartRateDip.compute(70.0, Double.NaN).missing)
    }

    // Hand: 30 minutes at 80 and 30 at 60 -> daytime mean 80 from 30 awake minutes, sleep mean 64 from 30 -> (80-64)/80 = 0.2.
    @Test
    fun `minute lists need thirty minutes each`() {
        val day = List(30) { 80.0 }
        val sleep = List(30) { 64.0 }
        assertEquals(0.2, HeartRateDip.fromMinutes(day, sleep).dipFraction!!, 1e-12)
        assertEquals(DipMissing.TOO_FEW_MINUTES, HeartRateDip.fromMinutes(day.dropLast(1), sleep).missing)
        assertEquals(DipMissing.TOO_FEW_MINUTES, HeartRateDip.fromMinutes(day, sleep.dropLast(1)).missing)
    }
}
