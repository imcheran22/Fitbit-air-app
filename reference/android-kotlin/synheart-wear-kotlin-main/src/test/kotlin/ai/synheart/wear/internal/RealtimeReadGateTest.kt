package ai.synheart.wear.internal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RealtimeReadGateTest {

    @Test
    fun firstReadIsAllowed() {
        assertTrue(RealtimeReadGate(10_000).tryAcquire(nowMs = 0))
    }

    @Test
    fun readsInsideTheIntervalAreSkipped() {
        val gate = RealtimeReadGate(10_000)
        assertTrue(gate.tryAcquire(0))
        assertFalse(gate.tryAcquire(1_000))
        assertFalse(gate.tryAcquire(9_999))
    }

    @Test
    fun aReadAtTheIntervalIsAllowedAgain() {
        val gate = RealtimeReadGate(10_000)
        assertTrue(gate.tryAcquire(0))
        assertTrue(gate.tryAcquire(10_000))
    }

    @Test
    fun aOneSecondStreamReadsOncePerInterval() {
        val gate = RealtimeReadGate(10_000)
        val reads = (0 until 60).count { s -> gate.tryAcquire(s * 1_000L) }
        assertEquals(6, reads)
    }
}
