package com.apex.athlete.ble

/** One decoded Heart Rate Measurement notification (Bluetooth SIG characteristic 0x2A37). */
data class HeartRateMeasurement(
    val bpm: Int,
    /** True/false when the strap reports skin contact; null when it does not support contact detection. */
    val sensorContact: Boolean?,
    /** Energy expended in kilojoules since the strap last reset it, when present. */
    val energyExpendedKj: Int?,
    /** RR intervals in milliseconds, in the order received. */
    val rrIntervalsMs: List<Int>,
)

/**
 * Pure parser for the Heart Rate Measurement characteristic (Bluetooth Heart Rate Service 1.0, 3.1).
 *
 * Layout (little endian): one flags byte, then the heart rate (uint8, or uint16 when flag bit 0 is set), then an
 * optional uint16 energy expended (flag bit 3) and zero or more uint16 RR intervals in units of 1/1024 s
 * (flag bit 4) filling the rest of the packet. Flag bits 1-2 are the sensor-contact status
 * (bit 2 = feature supported, bit 1 = contact detected). Returns null for a truncated packet; the strap's
 * own readings are never guessed at. Unknown flag bits are ignored.
 */
object HeartRateMeasurementParser {
    const val SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb"
    const val MEASUREMENT_UUID = "00002a37-0000-1000-8000-00805f9b34fb"
    const val CCCD_UUID = "00002902-0000-1000-8000-00805f9b34fb"

    private const val FLAG_UINT16 = 0x01
    private const val FLAG_CONTACT_DETECTED = 0x02
    private const val FLAG_CONTACT_SUPPORTED = 0x04
    private const val FLAG_ENERGY = 0x08
    private const val FLAG_RR = 0x10

    fun parse(data: ByteArray?): HeartRateMeasurement? {
        if (data == null || data.isEmpty()) return null
        val flags = data[0].toInt() and 0xFF
        var i = 1
        val bpm: Int
        if (flags and FLAG_UINT16 != 0) {
            if (data.size < i + 2) return null
            bpm = u16(data, i); i += 2
        } else {
            if (data.size < i + 1) return null
            bpm = data[i].toInt() and 0xFF; i += 1
        }
        var energy: Int? = null
        if (flags and FLAG_ENERGY != 0) {
            if (data.size < i + 2) return null
            energy = u16(data, i); i += 2
        }
        val rr = ArrayList<Int>()
        if (flags and FLAG_RR != 0) {
            while (i + 2 <= data.size) {
                rr += rrToMillis(u16(data, i)); i += 2
            }
        }
        val contact = if (flags and FLAG_CONTACT_SUPPORTED != 0) flags and FLAG_CONTACT_DETECTED != 0 else null
        return HeartRateMeasurement(bpm, contact, energy, rr)
    }

    /** 1/1024 s units to whole milliseconds, rounded to nearest. */
    fun rrToMillis(raw: Int): Int = (raw * 1000 + 512) / 1024

    private fun u16(d: ByteArray, i: Int): Int = (d[i].toInt() and 0xFF) or ((d[i + 1].toInt() and 0xFF) shl 8)
}
