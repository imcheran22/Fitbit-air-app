package org.openstrap.protocol.services

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openstrap.protocol.hexToBytes

class DeviceFeaturesTest {
    @Test
    fun parsesDocumentedExample() {
        // The annotated example from codemap 01 §3.2, with the 02 reply byte in front.
        val f = DeviceFeatures.parseMessage("02 01 03 01 05 0a 82 00 00 00 00 00 00 00 00 03".replace(" ", "").hexToBytes())!!
        assertEquals(1, f.version)
        assertEquals(0x03, f.mask)
        assertEquals(true, f.group1(0))
        assertEquals(false, f.group1(1))
        assertEquals(true, f.group1(2))
        assertEquals(true, f.group2(1))
        assertEquals(true, f.group2(7))
        assertEquals(false, f.group2(0))
        // Byte 9 = 0x03: bits 72 and 73.
        assertEquals(true, f.group2(72))
        // Past the end of the bitset reads as clear, like BitSet.get.
        assertEquals(false, f.group2(200))
        assertNull(f.group16(0))
        assertNull(f.algorithm)
        assertNull(f.activityRecordSize)
    }

    @Test
    fun parsesEveryBlockInMaskOrder() {
        // mask 0x1F: g1, g2, g4, alg (2 × u16le), g16.
        val blob = "07 1f 01 10 02 00 02 01 ff 04 0800 0300 01 06".replace(" ", "").hexToBytes()
        val f = DeviceFeatures.parse(blob)!!
        assertEquals(7, f.version)
        assertEquals(true, f.group1(DeviceFeatures.G1_GDSP_V1))
        assertEquals(true, f.group2(9))
        assertFalse(f.group2(0)!!)
        assertArrayEquals(byteArrayOf(0xFF.toByte()), f.group4)
        assertEquals(listOf(8, 3), f.algorithm)
        assertEquals(8, f.activityRecordSize)
        assertEquals(true, f.group16(1))
        assertEquals(true, f.group16(2))
    }

    @Test
    fun algBelowFiveMeansFourByteActivity() {
        assertEquals(4, DeviceFeatures.parse("00 08 02 0400".replace(" ", "").hexToBytes())!!.activityRecordSize)
        assertEquals(4, DeviceFeatures.parse("00 08 00".replace(" ", "").hexToBytes())!!.activityRecordSize)
    }

    @Test
    fun acceptsPushAndRejectsOthers() {
        assertEquals(true, DeviceFeatures.parseMessage("03 00 02 01 01".replace(" ", "").hexToBytes())!!.group2(0))
        assertNull(DeviceFeatures.parseMessage("01".hexToBytes()))
        assertNull(DeviceFeatures.parseMessage(ByteArray(0)))
        // Truncated: g2 says 4 bytes but only 1 follows.
        assertNull(DeviceFeatures.parseMessage("02 00 02 04 01".replace(" ", "").hexToBytes()))
        assertNull(DeviceFeatures.parseMessage("02 00".replace(" ", "").hexToBytes()))
    }

    @Test
    fun requestIsOneByte() {
        assertArrayEquals(byteArrayOf(1), DeviceFeatures.request)
    }
}
