package org.openstrap.protocol.firmware

import org.openstrap.protocol.ByteReader
import org.openstrap.protocol.ByteWriter
import org.openstrap.protocol.crypto.crc32
import org.openstrap.protocol.u8

/** Firmware part types (docs/protocol/03 §3.6, recovered from bytecode). */
object FirmwareType {
    const val FIRMWARE = 0x00
    const val FONT = 0x01
    const val RESOURCE = 0x02
    const val GPS = 0x03
    const val CHANGE_LOG = 0x10
    const val RESOURCE_EXTERNAL = 0x12
    const val RESOURCE_BASE = 0x83
    const val BATCH = 0xFD

    /** Cloud JSON part prefix -> type (§3.6). */
    val BY_PREFIX = mapOf(
        "firmware" to FIRMWARE, "resource" to RESOURCE, "baseResource" to RESOURCE_BASE,
        "extResource" to RESOURCE_EXTERNAL, "font" to FONT, "gps" to GPS,
    )

    /** Single-file update order when the device lacks batch/multi-file support (§6): firmware first. */
    val SINGLE_ORDER = listOf(FIRMWARE, FONT, RESOURCE_BASE, RESOURCE_EXTERNAL, RESOURCE, GPS)
}

/** Result codes in `10 <cmd> <code>` replies (§3.7). */
object DfuCode {
    const val SUCCESS = 1
    private val NAMES = mapOf(
        0 to "unknown error", 2 to "invalid parameter or state", 3 to "not authorized", 4 to "file size out of range",
        5 to "CRC error", 7 to "packet lost", 8 to "file format error", 9 to "firmware busy", 10 to "timed out",
        11 to "state machine error", 14 to "disconnected", 32 to "a workout is running", 33 to "a timer is running",
        34 to "battery too low", 35 to "a countdown is running", 40 to "power saving is on", 41 to "fast-recharge mode is on",
        64 to "signed header missing", 65 to "header format error", 66 to "firmware is for a different device",
        67 to "signature verification failed", 71 to "not enough storage", 80 to "firmware internal error",
        81 to "unsupported file type", 82 to "unsupported sub-file type", 83 to "sub-file order error",
        86 to "decompression failed", 88 to "flashing failed",
    )

    fun describe(code: Int) = NAMES[code] ?: "error $code"
}

/** D1 device states (§3.5). */
object DfuState {
    const val IDLE = 0
    const val VALIDATING = 3
    const val IN_UPGRADING = 5
    const val WAITING_NEXT_FIRMWARE = 7
}

/** Commands written to HUAMI(1531) (§3.3). */
object DfuCommands {
    const val QUERY_PROTOCOL = 0xD0
    const val QUERY_STATUS = 0xD1
    const val PREPARE = 0xD2
    const val START = 0xD3
    const val PROGRESS = 0xD4
    const val VALIDATE = 0xD5
    const val APPLY = 0xD6

    const val MODE_NORMAL = 0
    const val MODE_BACKGROUND = 1

    fun prepare(type: Int, length: Int, crc: Long, maxChunk: Int, mode: Int = MODE_NORMAL): ByteArray =
        ByteWriter().u8(PREPARE).u8(type).u32(length.toLong()).u32(crc).u16(maxChunk).u8(mode).u8(0xFF).toByteArray()

    fun start(resume: Boolean): ByteArray = byteArrayOf(START.toByte(), if (resume) 0 else 1)
}

/** A parsed `10 <cmd> <code> …` notification from 1531. */
sealed class DfuReply(val command: Int, val code: Int) {
    val ok get() = code == DfuCode.SUCCESS

    class Protocol(code: Int, val version: Int, val maxChunkSize: Int, val backgroundUpgrade: Boolean) : DfuReply(DfuCommands.QUERY_PROTOCOL, code)
    class Status(code: Int, val state: Int, val doneSize: Long?) : DfuReply(DfuCommands.QUERY_STATUS, code)
    class Prepared(code: Int, val receivedSize: Long, val receivedCrc: Long) : DfuReply(DfuCommands.PREPARE, code)
    /** D4 carries no code byte; [receivedSize] is the device's total so far. */
    class Progress(val receivedSize: Long) : DfuReply(DfuCommands.PROGRESS, DfuCode.SUCCESS)
    class Simple(command: Int, code: Int) : DfuReply(command, code)

    companion object {
        fun parse(n: ByteArray): DfuReply? {
            if (n.size < 3 || n.u8(0) != 0x10) return null
            val cmd = n.u8(1)
            if (cmd == DfuCommands.PROGRESS) return Progress(ByteReader(n, 2).u32())
            val code = n.u8(2)
            val r = ByteReader(n, 3)
            return when (cmd) {
                DfuCommands.QUERY_PROTOCOL ->
                    if (r.remaining >= 3) Protocol(code, r.u8(), r.u16(), r.remaining > 0 && r.bool()) else Simple(cmd, code)
                DfuCommands.QUERY_STATUS -> {
                    val state = if (r.remaining > 0) r.u8() else -1
                    val done = if (state == DfuState.IN_UPGRADING && r.remaining >= 9) { r.u8(); r.u32(); r.u32() } else null
                    Status(code, state, done)
                }
                DfuCommands.PREPARE ->
                    if (r.remaining >= 8) Prepared(code, r.u32(), r.u32()) else Prepared(code, 0, 0)
                else -> Simple(cmd, code)
            }
        }
    }
}

/** The 32-byte `HMFW…SIGN` trailer at fileSize − 96 (§2.2). */
data class HmfwTrailer(val fwSize: Long, val fwType: Long, val fwVersion: Long, val pnpId: Int, val pnpVersion: Int) {
    companion object {
        private const val MAGIC_L = 0x57464D48L
        private const val MAGIC_H = 0x4E474953L

        fun read(file: ByteArray): HmfwTrailer? {
            if (file.size < 96) return null
            val r = ByteReader(file, file.size - 96)
            if (r.u32() != MAGIC_L || r.u32() != MAGIC_H) return null
            r.u16() // header size
            return HmfwTrailer(fwSize = r.u32(), fwType = r.u32(), fwVersion = r.u32(), pnpId = r.u16(), pnpVersion = r.u16())
        }
    }
}

/** Builds the batch `UIHH` container (§2.3–2.4). */
object UihhContainer {
    data class Part(val type: Int, val data: ByteArray)

    fun changeLog(buildTimeEpoch: Long, summary: String) =
        Part(FirmwareType.CHANGE_LOG, ByteWriter().u32(buildTimeEpoch).bytes(summary.toByteArray()).toByteArray())

    fun build(parts: List<Part>): ByteArray {
        val content = ByteWriter().apply {
            for (p in parts.sortedBy { it.type }) {
                u8(0x01).u8(p.type).u32(p.data.size.toLong()).u32(crc32(p.data)).bytes(p.data)
            }
        }.toByteArray()
        return ByteWriter()
            .bytes("UIHH".toByteArray()).u16(0x0004).bytes(ByteArray(5)).u8(0x01)
            .u32(crc32(content)).u16(0).u32(0).u32(content.size.toLong()).bytes(ByteArray(6))
            .bytes(content)
            .toByteArray()
    }
}
