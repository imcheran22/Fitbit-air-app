package org.openstrap.protocol.services

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openstrap.protocol.hexToBytes

/** Wire bytes from 03 §3.16; not yet captured from a strap. */
class FindDeviceTest {

    @Test
    fun commands() {
        assertArrayEquals("03".hexToBytes(), FindDevice.BUZZ)
        assertArrayEquals("0501".hexToBytes(), FindDevice.START)
        assertArrayEquals("06".hexToBytes(), FindDevice.STOP)
    }

    @Test
    fun findStrapFrames() {
        // Find strap starts with the one-shot buzz and stops with STOP, as calls do; Zepp's 05 01 doesn't vibrate.
        assertArrayEquals(byteArrayOf(0x03), FindDevice.BUZZ)
        assertArrayEquals(byteArrayOf(0x06), FindDevice.STOP)
        assertTrue(FindDevice.isBuzzOk("040101".hexToBytes()))
        assertEquals(60_000L, FindDevice.FIND_TIMEOUT_MS)
    }

    @Test
    fun buzzReply() {
        assertTrue(FindDevice.isBuzzOk("0401".hexToBytes()))
        assertFalse(FindDevice.isBuzzOk("0400".hexToBytes()))
        assertFalse(FindDevice.isBuzzOk("04".hexToBytes()))
    }

    @Test
    fun motorPattern() {
        // 200 on, 150 off, 200 on: padded with a zero pause to two pairs.
        assertArrayEquals("0300010102c8009600c8000000".hexToBytes(), MotorVibrate.play(listOf(200, 150, 200)))
        assertTrue(MotorVibrate.isOk("0401".hexToBytes()))
        assertFalse(MotorVibrate.isOk("0400".hexToBytes()))
    }
}
