package org.openstrap.protocol.firmware

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openstrap.protocol.ByteReader
import org.openstrap.protocol.ByteWriter
import org.openstrap.protocol.crypto.crc32
import org.openstrap.protocol.hexToBytes

/** Device side of DFU V5 (docs/protocol/03 §3.3–3.4). */
private class SimulatedDfu(
    val window: Int = 64,
    var state: Int = DfuState.IDLE,
    val alreadyHave: ByteArray = ByteArray(0),
    val failApplyWith: Int? = null,
) : DfuLink {
    override val payloadMtu = 20
    override val replies = MutableSharedFlow<ByteArray>(extraBufferCapacity = 256)
    val received = java.io.ByteArrayOutputStream().apply { write(alreadyHave) }
    var expectedLen = 0
    var applied = false
    var prepareType = -1
    private var windowStart = 0

    private suspend fun reply(cmd: Int, code: Int, extra: ByteArray = ByteArray(0)) =
        replies.emit(byteArrayOf(0x10, cmd.toByte(), code.toByte()) + extra)

    override suspend fun writeCommand(data: ByteArray) {
        when (data[0].toInt() and 0xFF) {
            0xD0 -> reply(0xD0, 1, ByteWriter().u8(1).u16(window).u8(0).toByteArray())
            0xD1 -> reply(0xD1, 1, byteArrayOf(state.toByte()))
            0xD2 -> {
                val r = ByteReader(data, 1)
                prepareType = r.u8(); expectedLen = r.u32().toInt()
                val have = received.toByteArray()
                reply(0xD2, 1, ByteWriter().u32(have.size.toLong()).u32(crc32(have)).toByteArray())
            }
            0xD3 -> {
                if (data[1].toInt() == 1) received.reset()
                windowStart = received.size()
                reply(0xD3, 1)
            }
            0xD5 -> reply(0xD5, if (crc32(received.toByteArray()) != 0L) 1 else 5)
            0xD6 -> { applied = failApplyWith == null; reply(0xD6, failApplyWith ?: 1) }
        }
    }

    override suspend fun writeData(data: ByteArray) {
        received.write(data)
        val n = received.size()
        if (n - windowStart >= window || n == expectedLen) {
            windowStart = n
            replies.emit(byteArrayOf(0x10, 0xD4.toByte()) + ByteWriter().u32(n.toLong()).u8(0).u32(0).toByteArray())
        }
    }
}

class DfuSessionTest {
    private val file = ByteArray(500) { (it * 31 + 7).toByte() }

    @Test
    fun fullTransferValidatesAndApplies() = runTest {
        val dev = SimulatedDfu()
        val progress = mutableListOf<DfuProgress>()
        DfuSession(dev).flash(file, FirmwareType.FIRMWARE) { progress += it }
        assertArrayEquals(file, dev.received.toByteArray())
        assertTrue(dev.applied)
        assertEquals(FirmwareType.FIRMWARE, dev.prepareType)
        assertEquals(DfuProgress.Done, progress.last())
    }

    @Test
    fun resumesFromMatchingPrefix() = runTest {
        val dev = SimulatedDfu(alreadyHave = file.copyOfRange(0, 128))
        DfuSession(dev).flash(file, FirmwareType.FIRMWARE)
        assertArrayEquals(file, dev.received.toByteArray())
    }

    @Test
    fun restartsWhenPrefixDiffers() = runTest {
        val dev = SimulatedDfu(alreadyHave = ByteArray(128) { 0x55 })
        DfuSession(dev).flash(file, FirmwareType.FIRMWARE)
        assertArrayEquals(file, dev.received.toByteArray())
    }

    @Test
    fun refusesWhenStrapBusy() = runTest {
        val dev = SimulatedDfu(state = 2)
        val e = runCatching { DfuSession(dev).flash(file, FirmwareType.FIRMWARE) }.exceptionOrNull()
        assertTrue(e is DfuException && e.message!!.contains("busy"))
        assertEquals(0, dev.received.size())
    }

    @Test
    fun backgroundModeNeverApplies() = runTest {
        val dev = SimulatedDfu()
        DfuSession(dev).flash(file, FirmwareType.FIRMWARE, DfuCommands.MODE_BACKGROUND)
        assertTrue(!dev.applied)
    }

    @Test
    fun reportsDeviceError() = runTest {
        val dev = SimulatedDfu(failApplyWith = 66)
        val e = runCatching { DfuSession(dev).flash(file, FirmwareType.FIRMWARE) }.exceptionOrNull() as DfuException
        assertEquals(66, e.code)
        assertTrue(e.message!!.contains("different device"))
    }

    @Test
    fun prepareEncodingMatchesSpec() {
        // §3.3: D2 tt LLLLLLLL CCCCCCCC SSSS mm FF (14 bytes)
        assertArrayEquals("d2 00 f4010000 78563412 f000 00 ff".hexToBytes(), DfuCommands.prepare(0, 500, 0x12345678, 240))
    }

    @Test
    fun parsesTrailerAndBuildsContainer() {
        val trailer = ByteWriter().u32(0x57464D48).u32(0x4E474953).u16(32).u32(1000).u32(0).u32(0x03140001)
            .u16(157).u16(259).u16(0).u32(0).toByteArray()
        val f = ByteArray(200) + trailer + ByteArray(64)
        val t = HmfwTrailer.read(f)!!
        assertEquals(157, t.pnpId)
        assertEquals(259, t.pnpVersion)

        val c = UihhContainer.build(listOf(UihhContainer.Part(0x02, byteArrayOf(9)), UihhContainer.Part(0x00, byteArrayOf(1, 2))))
        assertEquals("UIHH", String(c.copyOfRange(0, 4)))
        // Parts sorted by type: firmware (0x00) first.
        assertEquals(0x00, c[33].toInt())
        assertEquals(32 + 12 + 11, c.size)
    }
}
