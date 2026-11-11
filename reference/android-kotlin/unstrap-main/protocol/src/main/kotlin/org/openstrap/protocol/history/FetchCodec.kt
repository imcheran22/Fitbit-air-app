package org.openstrap.protocol.history

import org.openstrap.protocol.ByteReader
import org.openstrap.protocol.ByteWriter
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime

/**
 * Wall-clock time as carried on the GDSP wire (spec 02 §1.3/§1.4): local date fields plus the
 * UTC offset in quarter-hours (signed, DST included).
 */
data class GdspTime(
    val year: Int,
    val month: Int,
    val day: Int,
    val hour: Int,
    val minute: Int,
    val second: Int,
    val tzQuarters: Int,
) {
    /** `civil_to_days(Y,M,D)*86400 + h*3600 + m*60 + s - tz*900` (spec 02 §1.3). */
    fun toEpochSecond(): Long =
        LocalDateTime.of(year, month, day, hour, minute, second).toEpochSecond(ZoneOffset.UTC) - tzQuarters * 900L

    internal fun writeTo(w: ByteWriter) {
        w.u16(year).u8(month).u8(day).u8(hour).u8(minute).u8(second).u8(tzQuarters)
    }

    companion object {
        const val WIRE_SIZE = 8

        fun of(time: ZonedDateTime): GdspTime = GdspTime(
            time.year, time.monthValue, time.dayOfMonth, time.hour, time.minute, time.second,
            // Minutes -> quarter-hours, sign kept (truncates toward zero).
            time.offset.totalSeconds / 900,
        )

        fun of(epochSecond: Long, zone: ZoneId): GdspTime =
            of(ZonedDateTime.ofInstant(Instant.ofEpochSecond(epochSecond), zone))

        internal fun read(r: ByteReader): GdspTime =
            GdspTime(r.u16(), r.u8(), r.u8(), r.u8(), r.u8(), r.u8(), r.s8())
    }
}

/** Device status codes (spec 02 §1.4, enum `tyi`). */
enum class GdspStatus(val code: Int) {
    SUCCESS(1), UNKNOWN_COMMAND(2), INVALID_PARAMETER(3), OPERATION_FAILED(4), INVALID_STATE(5),
    PACKET_INDEX_ERROR(6), BUSY(7), CRC_MISMATCH(8), CANCELLED_BY_APP(9), CONTENT_PARSE_ERROR(10),
    UNAUTHORIZED(11), COMPRESS_FAILED(12), DECOMPRESS_FAILED(13), DATA_SIZE_MISMATCH(14),
    MUSIC_RUNNING(48), SPEECH_RUNNING(49), TIMEOUT(50), FAST_RECHARGE_MODE(51),
    UNKNOWN(-1);

    companion object {
        fun fromCode(code: Int): GdspStatus = entries.firstOrNull { it.code == code } ?: UNKNOWN
    }
}

/** Messages the device sends on the GDSP control path. */
sealed class GdspMessage {
    /** Generic `10 <op> <status> <data...>` response. */
    sealed class Response : GdspMessage() {
        abstract val opcode: Int
        abstract val statusCode: Int
        val status: GdspStatus get() = GdspStatus.fromCode(statusCode)
        val isSuccess: Boolean get() = statusCode == GdspStatus.SUCCESS.code
    }

    /**
     * QUERY_VERSION reply. On GATT only [version] is defined. On the channel path the remaining
     * bytes encode `{supportDataUpload, supportQueryDataStatus, dataTypeMap}`, whose layout is
     * UNVERIFIED; [rawData] keeps everything after the status byte.
     */
    class VersionReply(override val statusCode: Int, val version: Int?, val rawData: ByteArray) : Response() {
        override val opcode get() = FetchCodec.OP_QUERY_VERSION

        /**
         * Data types the device can serve. Verified on a Helio Strap (fw 3.20.0.1):
         * `version u8, supportDataUpload u8, count u16, count × {type u8, hasData u8} [supportQueryDataStatus u8]`
         * (04 §1.4). Returns null if the list doesn't fit.
         */
        fun supportedTypes(): Set<Int>? {
            if (rawData.size < 4) return null
            val r = ByteReader(rawData, 2)
            val count = r.u16()
            // The trailing supportQueryDataStatus byte is optional.
            if (r.remaining < count * 2) return null
            return (0 until count).map { r.u8().also { r.u8() } }.toSet()
        }
    }

    /** START reply. [size] == 0 means nothing newer; [firstRecordTime] is the first record's time. */
    class StartReply(
        override val statusCode: Int,
        val size: Long,
        val firstRecordTime: GdspTime?,
        val expansion: ByteArray,
    ) : Response() {
        override val opcode get() = FetchCodec.OP_START
        val firstRecordEpoch: Long? get() = firstRecordTime?.toEpochSecond()

        /** Expansion byte 0 is the compression flag: 1 = zlib payload (04 §1.4). Null when the strap sent no expansion. */
        val isCompressed: Boolean?
            get() = expansion.firstOrNull()?.let { it.toInt() == 1 }
    }

    /** `10 02 <status> [extra]`: end of the data stream. */
    class TransferComplete(override val statusCode: Int, val extra: ByteArray) : Response() {
        override val opcode get() = FetchCodec.OP_TRANSFER

        // UNVERIFIED: 02 §1.5 - CRC carrier. Best guess: first 4 extra bytes, u32 LE, CRC-32 of
        // the concatenated payload without index bytes. Log-only until confirmed.
        val crc32: Long? get() = if (extra.size >= 4) ByteReader(extra).u32() else null
    }

    /** `10 03 <status>`: ACK confirmation. */
    class AckReply(override val statusCode: Int, val data: ByteArray) : Response() {
        override val opcode get() = FetchCodec.OP_ACK
    }

    /** Any other `10 <op> <status>` reply (e.g. QUERY_DATA_STATUS). */
    class OtherReply(override val opcode: Int, override val statusCode: Int, val data: ByteArray) : Response()

    /** Unsolicited `11 <type>`: device has new data of [typeCode]. */
    data class DataAvailable(val typeCode: Int) : GdspMessage() {
        val type: HistoryDataType? get() = HistoryDataType.fromCode(typeCode)

        /** Types Zepp syncs in reaction (04 §1.7, ccf.java:668-695); it ignores every other type. */
        val typesToSync: List<Int>
            get() = when (typeCode) {
                5, 6 -> listOf(5, 6, 79)
                70, 96 -> listOf(typeCode)
                else -> emptyList()
            }
    }

    /** Bytes that could not be decoded. */
    class Malformed(val reason: String, val raw: ByteArray) : GdspMessage()
}

/** Builders for GDSP commands and the parser for control-path replies (spec 02 §1). */
object FetchCodec {
    const val OP_QUERY_VERSION = 0x00
    const val OP_START = 0x01
    const val OP_TRANSFER = 0x02
    const val OP_ACK = 0x03

    // UNVERIFIED: 02 §1.2 - opcode exists, no caller found.
    const val OP_QUERY_DATA_STATUS = 0x05

    const val RESPONSE_FLAG = 0x10
    const val NOTIFY_DATA_AVAILABLE = 0x11

    /** START flag the app sends for all health/workout types. Meaning UNVERIFIED (02 §1.3/§1.5). */
    const val START_FLAG_HEALTH = 0x01

    /** GDSP module id on the channel transport (0x004B). */
    const val CHANNEL_MODULE = 0x004B

    fun queryVersion(): ByteArray = byteArrayOf(OP_QUERY_VERSION.toByte())

    fun queryDataStatus(): ByteArray = byteArrayOf(OP_QUERY_DATA_STATUS.toByte())

    /**
     * START: `01 type Y(2) M D h m s tz [flag]`. [flag] is always sent on the channel path and on
     * GATT when the GDSP version is >= 2; pass `null` to omit it.
     */
    fun startFetch(typeCode: Int, since: GdspTime, flag: Int? = START_FLAG_HEALTH): ByteArray {
        val w = ByteWriter().u8(OP_START).u8(typeCode)
        since.writeTo(w)
        if (flag != null) w.u8(flag)
        return w.toByteArray()
    }

    fun startFetch(type: HistoryDataType, since: ZonedDateTime, flag: Int? = START_FLAG_HEALTH): ByteArray =
        startFetch(type.code, GdspTime.of(since), flag)

    fun startFetch(type: HistoryDataType, sinceEpochSecond: Long, zone: ZoneId, flag: Int? = START_FLAG_HEALTH): ByteArray =
        startFetch(type.code, GdspTime.of(sinceEpochSecond, zone), flag)

    fun transfer(): ByteArray = byteArrayOf(OP_TRANSFER.toByte())

    /**
     * ACK/STOP. The app sends `03` with no parameter after each chunk; the optional parameter's
     * meaning is UNVERIFIED (02 §1.5).
     */
    fun ack(param: Int? = null): ByteArray =
        if (param == null) byteArrayOf(OP_ACK.toByte()) else byteArrayOf(OP_ACK.toByte(), param.toByte())

    /** Decode one control-path message (channel payload or HUAMI(0004) notification). */
    fun parse(bytes: ByteArray): GdspMessage {
        if (bytes.isEmpty()) return GdspMessage.Malformed("empty", bytes)
        return when (bytes[0].toInt() and 0xFF) {
            NOTIFY_DATA_AVAILABLE ->
                if (bytes.size >= 2) GdspMessage.DataAvailable(bytes[1].toInt() and 0xFF)
                else GdspMessage.Malformed("data-available notification without type", bytes)
            RESPONSE_FLAG -> parseResponse(bytes)
            else -> GdspMessage.Malformed("unknown leading byte", bytes)
        }
    }

    private fun parseResponse(bytes: ByteArray): GdspMessage {
        if (bytes.size < 3) return GdspMessage.Malformed("response shorter than 3 bytes", bytes)
        val op = bytes[1].toInt() and 0xFF
        val status = bytes[2].toInt() and 0xFF
        val data = bytes.copyOfRange(3, bytes.size)
        return when (op) {
            OP_QUERY_VERSION -> GdspMessage.VersionReply(status, data.firstOrNull()?.toInt()?.and(0xFF), data)
            OP_START -> {
                if (status != GdspStatus.SUCCESS.code) {
                    GdspMessage.StartReply(status, 0, null, data)
                } else if (data.size < 4 + GdspTime.WIRE_SIZE) {
                    GdspMessage.Malformed("START reply too short (${data.size} data bytes)", bytes)
                } else {
                    val r = ByteReader(data)
                    val size = r.u32()
                    val time = GdspTime.read(r)
                    GdspMessage.StartReply(status, size, time, r.rest())
                }
            }
            OP_TRANSFER -> GdspMessage.TransferComplete(status, data)
            OP_ACK -> GdspMessage.AckReply(status, data)
            else -> GdspMessage.OtherReply(op, status, data)
        }
    }
}
