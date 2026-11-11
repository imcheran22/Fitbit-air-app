package org.openstrap.protocol.history

import org.openstrap.protocol.services.DeviceFeatures

/**
 * The activity record size (4 or 8 bytes) comes from alg entry 0 of the runtime feature blob (02 §3.1).
 * Without it, pick the layout under which the `mode` bytes look like real activity modes.
 */
object ActivityLayout {

    /**
     * Record size: the START size field when it divides the payload into 4- or 8-byte records (measured on the
     * strap), else the feature blob's value, else [detect].
     */
    fun recordSize(payload: ByteArray, sizeField: Long, features: DeviceFeatures?): Int {
        val unit = if (sizeField > 0 && payload.size % sizeField == 0L) (payload.size / sizeField).toInt() else 0
        if (unit == 4 || unit == 8) return unit
        return features?.activityRecordSize ?: detect(payload)
    }

    fun detect(payload: ByteArray): Int {
        if (payload.size % 8 != 0) return 4
        fun score(size: Int): Double {
            val n = payload.size / size
            if (n == 0) return 0.0
            return (0 until n).count { isPlausibleMode(payload[it * size].toInt() and 0xFF) }.toDouble() / n
        }
        // The mode byte can't always tell the layouts apart (an 8-byte record's byte 4 often looks like a
        // mode too). The Helio Strap sends 8-byte records, so a tie goes to 8. Prefer the size field when
        // the START reply gives one; this is only the fallback.
        return if (score(8) >= score(4)) 8 else 4
    }

    /** First byte: [ActivityMode] in the low nibble (high nibble is firmware state), 0xFF padding, or blank. */
    private fun isPlausibleMode(b: Int) = b == 0xFF || b == ActivityMode.BLANK || (b and 0x0F) in 0..9
}
