package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.strain.HeartRateRecovery
import com.apex.athlete.core.analytics.strain.HeartRateRecoveryInput
import com.apex.athlete.core.analytics.strain.HrrMissing
import com.apex.athlete.core.analytics.stress.MinuteHeartRate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class HeartRateRecoveryTest {

    // Workout ends at minute 100 (exclusive): last workout minute is 99, recovery minutes are 100 and 101.
    private fun series(vararg pairs: Pair<Int, Double>) = pairs.map { MinuteHeartRate(it.first.toLong(), it.second) }

    private val full = series(96 to 120.0, 97 to 150.0, 98 to 160.0, 99 to 155.0, 100 to 140.0, 101 to 128.0)

    // Hand: peak of minutes 97..99 = max(150, 160, 155) = 160; drop60 = 160 - 140 = 20; drop120 = 160 - 128 = 32.
    // Minute 96 (120) is outside the 3-minute peak window.
    @Test
    fun `drops at 60 and 120 seconds`() {
        val r = HeartRateRecovery.compute(HeartRateRecoveryInput(100L, full))
        assertEquals(160.0, r.peakBpm!!, 1e-12)
        assertEquals(20.0, r.dropAt60!!, 1e-12)
        assertEquals(32.0, r.dropAt120!!, 1e-12)
        assertNull(r.missing)
    }

    @Test
    fun `a missing peak minute gives null, not a guess`() {
        val r = HeartRateRecovery.compute(HeartRateRecoveryInput(100L, full.filter { it.minute != 98L }))
        assertNull(r.peakBpm); assertNull(r.dropAt60); assertNull(r.dropAt120)
        assertEquals(HrrMissing.PEAK_MINUTES_MISSING, r.missing)
    }

    @Test
    fun `a missing 120 s minute leaves the 60 s drop`() {
        val r = HeartRateRecovery.compute(HeartRateRecoveryInput(100L, full.filter { it.minute != 101L }))
        assertEquals(20.0, r.dropAt60!!, 1e-12)
        assertNull(r.dropAt120)
        assertNull(r.missing)
    }

    @Test
    fun `a missing 60 s minute leaves the 120 s drop`() {
        val r = HeartRateRecovery.compute(HeartRateRecoveryInput(100L, full.filter { it.minute != 100L }))
        assertNull(r.dropAt60)
        assertEquals(32.0, r.dropAt120!!, 1e-12)
    }

    @Test
    fun `no recovery minutes at all`() {
        val r = HeartRateRecovery.compute(HeartRateRecoveryInput(100L, full.filter { it.minute < 100 }))
        assertEquals(HrrMissing.RECOVERY_MINUTES_MISSING, r.missing)
    }

    @Test
    fun `peak below the minimum intensity is not scored`() {
        val r = HeartRateRecovery.compute(HeartRateRecoveryInput(100L, full, minPeakBpm = 170.0))
        assertEquals(HrrMissing.PEAK_BELOW_MINIMUM, r.missing)
        assertNull(r.dropAt60)
        val ok = HeartRateRecovery.compute(HeartRateRecoveryInput(100L, full, minPeakBpm = 160.0))
        assertEquals(20.0, ok.dropAt60!!, 1e-12)
    }

    @Test
    fun `a rise after the workout is reported as a negative drop`() {
        val s = series(97 to 150.0, 98 to 150.0, 99 to 150.0, 100 to 155.0, 101 to 152.0)
        val r = HeartRateRecovery.compute(HeartRateRecoveryInput(100L, s))
        assertEquals(-5.0, r.dropAt60!!, 1e-12)
        assertEquals(-2.0, r.dropAt120!!, 1e-12)
    }
}
