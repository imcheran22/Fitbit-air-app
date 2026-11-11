package org.openstrap.protocol.transport

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openstrap.protocol.crypto.ChannelCipher
import org.openstrap.protocol.hexToBytes

class ChunksTest {
    @Test
    fun singleChunkMatchesSpecExample() {
        // docs/protocol/01 §2.4: services-list request.
        val chunks = buildChunks(endpoint = 0, sessionId = 0, data = byteArrayOf(3), plainLength = 1, encrypted = false, payloadMtu = 20)
        assertEquals(1, chunks.size)
        assertArrayEquals("030700000001000000000003".hexToBytes(), chunks[0])
    }

    @Test
    fun multiChunkSplitMatchesSpecTable() {
        // §2.4: 52-byte payload at payload MTU 20 -> 9 + 15 + 15 + 13 bytes, flags 01 00 00 06.
        val data = ByteArray(52) { it.toByte() }
        val chunks = buildChunks(0x0082, 7, data, 52, encrypted = false, payloadMtu = 20)
        assertEquals(listOf(20, 20, 20, 18), chunks.map { it.size })
        assertEquals(listOf(0x01, 0x00, 0x00, 0x06), chunks.map { it[1].toInt() and 0xFF })
        assertEquals(listOf(0, 1, 2, 3), chunks.map { it[4].toInt() })
        assertEquals(0x34, chunks[0][5].toInt())
        assertEquals(0x82, chunks[0][9].toInt() and 0xFF)
    }

    @Test
    fun reassemblesAndAcks() {
        val data = ByteArray(40) { (it * 3).toByte() }
        val received = mutableListOf<ChannelMessage>()
        val r = Reassembler({ true }, { _, c, _ -> c }, { received += it })
        val chunks = buildChunks(0x0029, 5, data, 40, encrypted = false, payloadMtu = 20)
        val acks = chunks.map { r.accept(it) }
        assertEquals(1, received.size)
        assertArrayEquals(data, received[0].payload)
        assertEquals(0x0029, received[0].endpoint)
        // Only the last chunk asked for an ack.
        assertNull(acks[0])
        assertEquals(4, chunks.size) // 9 + 15 + 15 + 1 bytes
        assertArrayEquals("0400050103".hexToBytes(), acks.last())
    }

    @Test
    fun detectsLostChunk() {
        val r = Reassembler({ true }, { _, c, _ -> c }, {})
        val chunks = buildChunks(1, 9, ByteArray(40), 40, encrypted = false, payloadMtu = 20)
        r.accept(chunks[0])
        val ack = r.accept(chunks[2])!!
        assertEquals(AckStatus.PACKET_LOST, ack[3].toInt())
    }

    @Test
    fun lostChunkDropsTheMessageAndLaterChunksAreIgnored() {
        val received = mutableListOf<ChannelMessage>()
        val r = Reassembler({ true }, { _, c, _ -> c }, { received += it })
        val chunks = buildChunks(1, 9, ByteArray(40), 40, encrypted = false, payloadMtu = 20)
        r.accept(chunks[0])
        r.accept(chunks[2])
        // The rest of the broken message gets no ACK and produces nothing.
        assertNull(r.accept(chunks[3]))
        assertTrue(received.isEmpty())
        // The next message goes through.
        buildChunks(1, 10, ByteArray(5), 5, encrypted = false, payloadMtu = 20).forEach { r.accept(it) }
        assertEquals(1, received.size)
    }

    @Test
    fun undecryptableMessageIsAckedAndDropped() {
        val received = mutableListOf<ChannelMessage>()
        var failures = 0
        val r = Reassembler({ true }, { _, _, _ -> error("bad crc") }, { received += it }).apply { onDecryptFailure = { failures++ } }
        val chunk = buildChunks(1, 3, ByteArray(16), 4, encrypted = true, payloadMtu = 40).single()
        val ack = r.accept(chunk)!!
        assertEquals(AckStatus.SUCCESS, ack[3].toInt())
        assertTrue(received.isEmpty())
        assertEquals(1, failures)
    }

    @Test
    fun rejectsUnknownEndpoint() {
        val r = Reassembler({ it == 1 }, { _, c, _ -> c }, {})
        val ack = r.accept(buildChunks(2, 1, byteArrayOf(1), 1, false, 20)[0])!!
        assertEquals(AckStatus.UNKNOWN_ENDPOINT, ack[3].toInt())
    }

    @Test
    fun encryptedRoundTripThroughChunksAndCipher() {
        val shared = ByteArray(24) { (it + 1).toByte() }
        val key = ByteArray(16) { (0xA0 + it).toByte() }
        val phone = ChannelCipher(shared, key)
        // The device's tx counter starts where our rx counter does; simulate with a second cipher whose
        // rx is checked against what the phone sends (phone tx = S[0..3], device rx expects the same).
        val payload = "hello strap, this is a longer encrypted message".toByteArray()
        val cipherText = phone.encrypt(sessionId = 3, payload)
        assertEquals(ChannelCipher.encryptedSize(payload.size), cipherText.size)

        val deviceView = object {
            // Decrypt like the device would: its rx counter equals our initial tx counter.
            val c = ChannelCipher(shared.copyOf().also { s -> for (i in 0..3) s[4 + i] = s[i] }, key)
        }
        val received = mutableListOf<ChannelMessage>()
        val r = Reassembler({ true }, deviceView.c::decrypt, { received += it })
        buildChunks(0x0047, 3, cipherText, payload.size, encrypted = true, payloadMtu = 20).forEach { r.accept(it) }
        assertArrayEquals(payload, received.single().payload)
    }

    @Test
    fun parsesBothAckForms() {
        // `04 00 sess status idx`, as the strap sends it (fw 3.25.0.3): session 1, status OK, last chunk 3.
        assertEquals(DeviceAck(1, 1, 3), parseDeviceAck("0400010103".hexToBytes()))
        assertEquals(DeviceAck(5, 1, 2), parseDeviceAck("04050102".hexToBytes()))
        assertNull(parseDeviceAck("0405010200".hexToBytes())) // second byte isn't 0
        assertNull(parseDeviceAck("03".hexToBytes()))
    }
}
