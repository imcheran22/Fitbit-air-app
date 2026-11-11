package org.openstrap.protocol.history

import java.io.ByteArrayOutputStream
import java.util.zip.CRC32

/**
 * Collects the indexed HUAMI(0005) data packets of one GDSP fetch (spec 02 §1.5).
 *
 * Each packet is `idx u8, payload...`. Indices must increase by one (mod 256). Any gap, or
 * receiving more bytes than [expectedSize], puts the assembler in a failed state; the caller
 * should then abort and retry the chunk (the app retries 3 times).
 *
 * Pure and not thread-safe.
 */
class FetchAssembler(val expectedSize: Long) {

    sealed class State {
        object Collecting : State()
        object Complete : State()
        data class Failed(val error: Error) : State()
    }

    sealed class Error {
        data class IndexGap(val expected: Int, val got: Int) : Error()
        data class Overflow(val received: Long, val expected: Long) : Error()
        object EmptyPacket : Error()
        data class SizeMismatch(val received: Long, val expected: Long) : Error()
    }

    sealed class Result {
        class Complete(val payload: ByteArray) : Result()
        data class Failed(val error: Error) : Result()
    }

    private val buffer = ByteArrayOutputStream()
    private var lastIndex: Int? = null

    var state: State = if (expectedSize == 0L) State.Complete else State.Collecting
        private set

    val receivedBytes: Long get() = buffer.size().toLong()
    val packetCount: Int get() = packets
    private var packets = 0

    /** Feed one raw data notification. Returns the new state. Ignored once failed/complete. */
    fun accept(packet: ByteArray): State {
        if (state != State.Collecting) {
            if (state == State.Complete && packet.size > 1) fail(Error.Overflow(receivedBytes + packet.size - 1, expectedSize))
            return state
        }
        if (packet.isEmpty()) return fail(Error.EmptyPacket)
        val idx = packet[0].toInt() and 0xFF
        // UNVERIFIED: 02 §1.5 - the first index of a fetch is not specified; any value is accepted.
        val prev = lastIndex
        if (prev != null && idx != (prev + 1) and 0xFF) return fail(Error.IndexGap((prev + 1) and 0xFF, idx))
        lastIndex = idx
        packets++
        buffer.write(packet, 1, packet.size - 1)
        val received = receivedBytes
        if (received > expectedSize) return fail(Error.Overflow(received, expectedSize))
        if (received == expectedSize) state = State.Complete
        return state
    }

    /** Call when the device sent `10 02 xx` (or on timeout). Checks `received == size`. */
    fun finish(): Result = when (val s = state) {
        is State.Failed -> Result.Failed(s.error)
        State.Complete -> Result.Complete(buffer.toByteArray())
        State.Collecting -> Result.Failed(Error.SizeMismatch(receivedBytes, expectedSize)).also {
            state = State.Failed(it.error)
        }
    }

    /** CRC-32 (zlib polynomial) of the payload collected so far, without index bytes. */
    fun crc32(): Long = CRC32().apply { update(buffer.toByteArray()) }.value

    /**
     * Compare against the CRC carried by [GdspMessage.TransferComplete.crc32]; `null` when the
     * device sent none. UNVERIFIED: 02 §1.5 - log mismatches only, do not discard.
     */
    fun crcMatches(deviceCrc: Long?): Boolean? = deviceCrc?.let { it == crc32() }

    private fun fail(error: Error): State {
        state = State.Failed(error)
        return state
    }
}
