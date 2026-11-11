package ai.synheart.wear.adapters

import ai.synheart.wear.models.DeviceAdapter
import ai.synheart.wear.models.MetricType
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BleHrmTest {

    // MARK: - HeartRateSample Tests

    @Test
    fun `HeartRateSample construction with all fields`() {
        val sample = HeartRateSample(
            tsMs = 1700000000000L,
            bpm = 72,
            source = "ble_hrm",
            deviceId = "AA:BB:CC:DD:EE:FF",
            deviceName = "Polar H10",
            sessionId = "session-1",
            rrIntervalsMs = listOf(820.0, 835.0)
        )

        assertEquals(1700000000000L, sample.tsMs)
        assertEquals(72, sample.bpm)
        assertEquals("ble_hrm", sample.source)
        assertEquals("AA:BB:CC:DD:EE:FF", sample.deviceId)
        assertEquals("Polar H10", sample.deviceName)
        assertEquals("session-1", sample.sessionId)
        assertEquals(listOf(820.0, 835.0), sample.rrIntervalsMs)
    }

    @Test
    fun `HeartRateSample default source is ble_hrm`() {
        val sample = HeartRateSample(bpm = 80, deviceId = "test")
        assertEquals("ble_hrm", sample.source)
    }

    @Test
    fun `HeartRateSample toWearMetrics conversion`() {
        val sample = HeartRateSample(
            tsMs = 1700000000000L,
            bpm = 72,
            deviceId = "AA:BB:CC:DD:EE:FF",
            deviceName = "Polar H10",
            sessionId = "session-1",
            rrIntervalsMs = listOf(820.0, 835.0)
        )

        val metrics = sample.toWearMetrics()

        assertEquals("AA:BB:CC:DD:EE:FF", metrics.deviceId)
        assertEquals("ble_hrm", metrics.source)
        assertEquals(72.0, metrics.getMetric(MetricType.HR))
        assertEquals("Polar H10", metrics.meta["device_name"])
        assertEquals("session-1", metrics.meta["session_id"])
        assertEquals(listOf(820.0, 835.0), metrics.rrIntervals)
    }

    @Test
    fun `HeartRateSample toWearMetrics without optionals`() {
        val sample = HeartRateSample(bpm = 60, deviceId = "DEF-456")
        val metrics = sample.toWearMetrics()

        assertEquals("DEF-456", metrics.deviceId)
        assertEquals(60.0, metrics.getMetric(MetricType.HR))
        assertNull(metrics.meta["device_name"])
        assertNull(metrics.meta["session_id"])
        assertNull(metrics.rrIntervals)
    }

    // MARK: - BleHrmDevice Tests

    @Test
    fun `BleHrmDevice construction`() {
        val device = BleHrmDevice(deviceId = "AA:BB:CC:DD:EE:FF", name = "Wahoo TICKR", rssi = -65)

        assertEquals("AA:BB:CC:DD:EE:FF", device.deviceId)
        assertEquals("Wahoo TICKR", device.name)
        assertEquals(-65, device.rssi)
    }

    @Test
    fun `BleHrmDevice with null name`() {
        val device = BleHrmDevice(deviceId = "AA:BB:CC:DD:EE:FF", name = null, rssi = -80)
        assertNull(device.name)
    }

    // MARK: - BleHrmErrorCode Tests

    @Test
    fun `BleHrmErrorCode code values`() {
        assertEquals("PERMISSION_DENIED", BleHrmErrorCode.PERMISSION_DENIED.code)
        assertEquals("BLUETOOTH_OFF", BleHrmErrorCode.BLUETOOTH_OFF.code)
        assertEquals("DEVICE_NOT_FOUND", BleHrmErrorCode.DEVICE_NOT_FOUND.code)
        assertEquals("SUBSCRIBE_FAILED", BleHrmErrorCode.SUBSCRIBE_FAILED.code)
        assertEquals("DISCONNECTED", BleHrmErrorCode.DISCONNECTED.code)
    }

    @Test
    fun `BleHrmException carries error code and message`() {
        val exception = BleHrmException(BleHrmErrorCode.BLUETOOTH_OFF, "Bluetooth is off")
        assertEquals(BleHrmErrorCode.BLUETOOTH_OFF, exception.errorCode)
        assertEquals("Bluetooth is off", exception.message)
    }

    // MARK: - HeartRateParser Tests

    @Test
    fun `parse uint8 heart rate`() {
        // Flags: 0x00 (uint8, no RR)
        // BPM: 72
        val data = byteArrayOf(0x00, 72)
        val (bpm, rrIntervals) = HeartRateParser.parse(data)

        assertEquals(72, bpm)
        assertNull(rrIntervals)
    }

    @Test
    fun `parse uint16 heart rate`() {
        // Flags: 0x01 (uint16, no RR)
        // BPM: 260 (little-endian: 0x04, 0x01)
        val data = byteArrayOf(0x01, 0x04, 0x01)
        val (bpm, rrIntervals) = HeartRateParser.parse(data)

        assertEquals(260, bpm)
        assertNull(rrIntervals)
    }

    @Test
    fun `parse uint8 with RR intervals`() {
        // Flags: 0x10 (uint8, RR present)
        // BPM: 75
        // RR: 0x0340 = 832 (in 1/1024s)
        val data = byteArrayOf(0x10, 75, 0x40, 0x03)
        val (bpm, rrIntervals) = HeartRateParser.parse(data)

        assertEquals(75, bpm)
        assertNotNull(rrIntervals)
        assertEquals(1, rrIntervals.size)

        val expectedMs = 0x0340.toDouble() / 1024.0 * 1000.0
        assertEquals(expectedMs, rrIntervals[0], 0.01)
    }

    @Test
    fun `parse uint16 with RR intervals`() {
        // Flags: 0x11 (uint16, RR present)
        // BPM: 300 (0x2C, 0x01)
        // RR: 0x0380 = 896 (in 1/1024s)
        val data = byteArrayOf(0x11, 0x2C, 0x01, 0x80.toByte(), 0x03)
        val (bpm, rrIntervals) = HeartRateParser.parse(data)

        assertEquals(300, bpm)
        assertNotNull(rrIntervals)
        assertEquals(1, rrIntervals.size)
    }

    @Test
    fun `parse multiple RR intervals`() {
        // Flags: 0x10 (uint8, RR present)
        // BPM: 80
        // RR1: 0x0340 = 832, RR2: 0x0360 = 864
        val data = byteArrayOf(0x10, 80, 0x40, 0x03, 0x60, 0x03)
        val (bpm, rrIntervals) = HeartRateParser.parse(data)

        assertEquals(80, bpm)
        assertNotNull(rrIntervals)
        assertEquals(2, rrIntervals.size)
    }

    @Test
    fun `parse empty data returns zero`() {
        val data = byteArrayOf()
        val (bpm, rrIntervals) = HeartRateParser.parse(data)

        assertEquals(0, bpm)
        assertNull(rrIntervals)
    }

    @Test
    fun `parse single byte returns zero`() {
        val data = byteArrayOf(0x00)
        val (bpm, rrIntervals) = HeartRateParser.parse(data)

        assertEquals(0, bpm)
        assertNull(rrIntervals)
    }

    @Test
    fun `parse uint16 too short returns zero`() {
        // Flags say uint16 but only 1 byte of HR data
        val data = byteArrayOf(0x01, 72)
        val (bpm, _) = HeartRateParser.parse(data)

        assertEquals(0, bpm)
    }

    @Test
    fun `parse with energy expended field`() {
        // Flags: 0x18 (uint8, energy expended present, RR present)
        // BPM: 70
        // Energy: 2 bytes (skipped)
        // RR: 0x0340
        val data = byteArrayOf(0x18, 70, 0x00, 0x00, 0x40, 0x03)
        val (bpm, rrIntervals) = HeartRateParser.parse(data)

        assertEquals(70, bpm)
        assertNotNull(rrIntervals)
        assertEquals(1, rrIntervals.size)
    }

    // MARK: - DeviceAdapter Tests

    @Test
    fun `DeviceAdapter BLE_HRM exists`() {
        val adapter = DeviceAdapter.BLE_HRM
        assertNotNull(adapter)
        assertEquals("BLE_HRM", adapter.name)
    }
}
