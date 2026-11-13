package com.apex.athlete.ble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class HeartRateMeasurementParserTest {
    private fun bytes(vararg v: Int) = ByteArray(v.size) { v[it].toByte() }

    @Test fun uint8HeartRateOnly() {
        val m = HeartRateMeasurementParser.parse(bytes(0x00, 72))!!
        assertEquals(72, m.bpm)
        assertNull(m.sensorContact); assertNull(m.energyExpendedKj)
        assertEquals(emptyList(), m.rrIntervalsMs)
    }

    @Test fun uint8ValueAbove127IsUnsigned() {
        assertEquals(200, HeartRateMeasurementParser.parse(bytes(0x00, 200))!!.bpm)
    }

    @Test fun uint16HeartRateIsLittleEndian() {
        assertEquals(300, HeartRateMeasurementParser.parse(bytes(0x01, 0x2C, 0x01))!!.bpm)
    }

    @Test fun sensorContactBits() {
        assertNull(HeartRateMeasurementParser.parse(bytes(0x02, 70))!!.sensorContact) // detected bit without supported bit
        assertEquals(false, HeartRateMeasurementParser.parse(bytes(0x04, 0))!!.sensorContact)
        assertEquals(true, HeartRateMeasurementParser.parse(bytes(0x06, 70))!!.sensorContact)
    }

    @Test fun energyExpendedField() {
        val m = HeartRateMeasurementParser.parse(bytes(0x08, 80, 0x10, 0x27))!!
        assertEquals(80, m.bpm)
        assertEquals(10_000, m.energyExpendedKj)
    }

    @Test fun rrIntervalsConvertFrom1024thsToMillis() {
        // 1024 -> 1000 ms, 512 -> 500 ms, 768 -> 750 ms
        val m = HeartRateMeasurementParser.parse(bytes(0x10, 60, 0x00, 0x04, 0x00, 0x02, 0x00, 0x03))!!
        assertEquals(listOf(1000, 500, 750), m.rrIntervalsMs)
    }

    @Test fun rrRoundsToNearestMillisecond() {
        assertEquals(1, HeartRateMeasurementParser.rrToMillis(1))   // 0.977 ms
        assertEquals(977, HeartRateMeasurementParser.rrToMillis(1000)) // 976.56
        assertEquals(0, HeartRateMeasurementParser.rrToMillis(0))
    }

    @Test fun allFieldsTogetherWithUint16() {
        val m = HeartRateMeasurementParser.parse(bytes(0x1F, 0x96, 0x00, 0x05, 0x00, 0x00, 0x04))!!
        assertEquals(150, m.bpm)
        assertEquals(true, m.sensorContact)
        assertEquals(5, m.energyExpendedKj)
        assertEquals(listOf(1000), m.rrIntervalsMs)
    }

    @Test fun rrFlagWithNoIntervalsGivesEmptyList() {
        assertEquals(emptyList(), HeartRateMeasurementParser.parse(bytes(0x10, 61))!!.rrIntervalsMs)
    }

    @Test fun trailingOddByteIsIgnored() {
        assertEquals(listOf(1000), HeartRateMeasurementParser.parse(bytes(0x10, 60, 0x00, 0x04, 0x07))!!.rrIntervalsMs)
    }

    @Test fun unknownReservedFlagBitsAreIgnored() {
        assertEquals(66, HeartRateMeasurementParser.parse(bytes(0xE0, 66))!!.bpm)
    }

    @Test fun truncatedOrEmptyPacketsAreNull() {
        assertNull(HeartRateMeasurementParser.parse(null))
        assertNull(HeartRateMeasurementParser.parse(bytes()))
        assertNull(HeartRateMeasurementParser.parse(bytes(0x00)))
        assertNull(HeartRateMeasurementParser.parse(bytes(0x01, 0x10)))
        assertNull(HeartRateMeasurementParser.parse(bytes(0x08, 70, 0x01)))
    }
}
