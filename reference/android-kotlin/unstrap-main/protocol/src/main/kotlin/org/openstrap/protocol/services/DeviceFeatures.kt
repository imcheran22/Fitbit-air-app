package org.openstrap.protocol.services

import org.openstrap.protocol.bytesOf
import org.openstrap.protocol.u16
import org.openstrap.protocol.u8

/**
 * The strap's runtime feature bitmap from DeviceFeatureModule 0x0028 (Zepp `mhc`/`vvg`, codemap 01 §3, 03 §3.7).
 * Separate from the static capability flags: Zepp reads it at runtime to decide which history jobs to run.
 *
 * Each group is null when the mask leaves it out, so a caller can tell "bit clear" from "not reported" and keep its
 * own default for the latter.
 */
data class DeviceFeatures(
    /** Stored by Zepp but never read (01 §3.2). */
    val version: Int,
    val mask: Int,
    val group1: ByteArray?,
    /** The main runtime feature set (Zepp's `deviceInfo.a().d(n)`). */
    val group2: ByteArray?,
    /** Parsed by Zepp but never read. */
    val group4: ByteArray?,
    /** "alg" u16 parameters; only entry 0 (the activity record size) has a reader. */
    val algorithm: List<Int>?,
    val group16: ByteArray?,
) {
    fun group1(bit: Int): Boolean? = group1?.bit(bit)
    fun group2(bit: Int): Boolean? = group2?.bit(bit)
    fun group16(bit: Int): Boolean? = group16?.bit(bit)

    /**
     * Activity record size, as Zepp derives it: alg entry 0 when it is above 4, else 4 (04 §3.1). Null when the blob
     * has no alg block, since Zepp's 4 default contradicts the 8-byte records seen on the strap.
     */
    val activityRecordSize: Int?
        get() = algorithm?.let { alg -> alg.firstOrNull()?.takeIf { it > 4 } ?: 4 }

    override fun equals(other: Any?): Boolean =
        other is DeviceFeatures && version == other.version && mask == other.mask && algorithm == other.algorithm &&
            group1.contentEquals(other.group1) && group2.contentEquals(other.group2) &&
            group4.contentEquals(other.group4) && group16.contentEquals(other.group16)

    override fun hashCode(): Int =
        listOf(version, mask, algorithm, group1?.contentHashCode(), group2?.contentHashCode(), group4?.contentHashCode(), group16?.contentHashCode()).hashCode()

    companion object {
        const val ENDPOINT = 0x0028
        const val QUERY = 0x01
        const val REPLY = 0x02
        /** Unsolicited "features changed" push, same blob as [REPLY]. */
        const val PUSH = 0x03

        val request: ByteArray = bytesOf(QUERY)

        // Group-2 bits Zepp gates history jobs on (04 §2.2, 01 §3.4).
        const val G2_SLEEP_SPO2 = 21
        const val G2_SPO2_VERSIONED = 25
        const val G2_DAILY_MAX_HR = 52
        const val G2_RECOVERY_HR = 62
        const val G2_HLD = 63
        const val G2_SLEEP_RESULT = 65
        const val G2_HRV = 66
        const val G2_OSA = 68
        const val G2_HEALTH_DATA = 69
        const val G2_HLD_COMPOSITION = 72

        /** Group-1 bit 4: GDSP version 1 (01 §3.3). */
        const val G1_GDSP_V1 = 4

        /** `02 <blob>` reply or `03 <blob>` push; null for anything else or a malformed blob. */
        fun parseMessage(message: ByteArray): DeviceFeatures? {
            if (message.isEmpty() || (message.u8(0) != REPLY && message.u8(0) != PUSH)) return null
            return parse(message.copyOfRange(1, message.size))
        }

        /**
         * Blob layout (01 §3.2): `version mask`, then for each mask bit in order 0x01, 0x02, 0x04, 0x08, 0x10 a
         * `u8 len` block. The 0x08 block holds len/2 u16le alg values; the others are LSB-first bitsets.
         */
        fun parse(blob: ByteArray): DeviceFeatures? {
            if (blob.size < 2) return null
            val mask = blob.u8(1)
            var pos = 2
            fun block(bit: Int): ByteArray? {
                if (mask and bit == 0) return null
                if (pos >= blob.size) throw IndexOutOfBoundsException()
                val len = blob.u8(pos)
                if (pos + 1 + len > blob.size) throw IndexOutOfBoundsException()
                return blob.copyOfRange(pos + 1, pos + 1 + len).also { pos += 1 + len }
            }
            return try {
                val g1 = block(0x01)
                val g2 = block(0x02)
                val g4 = block(0x04)
                val alg = block(0x08)?.let { b -> List(b.size / 2) { b.u16(it * 2) } }
                val g16 = block(0x10)
                DeviceFeatures(blob.u8(0), mask, g1, g2, g4, alg, g16)
            } catch (_: IndexOutOfBoundsException) {
                null
            }
        }

        private fun ByteArray.bit(n: Int): Boolean = n >= 0 && n / 8 < size && (u8(n / 8) shr (n % 8)) and 1 == 1
    }
}
