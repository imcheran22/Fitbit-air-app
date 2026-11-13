package com.apex.athlete.widget

import com.apex.athlete.core.ui.state.MetricReason
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class WidgetSnapshotJsonTest {

    @Test
    fun roundTripKeepsEveryField() {
        val original = WidgetTestData.snapshot(
            recovery = WidgetTestData.value(74.0, prov = "derived", band = "GREEN"),
            sleep = WidgetMetric(WidgetMetricStatus.CALIBRATING, calibrationDaysLeft = 3),
            strain = WidgetMetric(WidgetMetricStatus.UNAVAILABLE, reason = MetricReason.AWAITING_SLEEP_SYNC.name),
        )
        val decoded = WidgetSnapshotJson.decode(WidgetSnapshotJson.encode(original))
        assertEquals(original, decoded)
    }

    @Test
    fun roundTripKeepsProvisionalStrainAndMissingHeartRate() {
        val original = WidgetTestData.snapshot(
            strain = WidgetTestData.value(12.3, provisional = true),
            heartRateBpm = null,
            heartRateAtMillis = null,
            heartRateProvenance = null,
        )
        assertEquals(original, WidgetSnapshotJson.decode(WidgetSnapshotJson.encode(original)))
    }

    @Test
    fun encodedFileHoldsNumbersAndEnumKeysOnly() {
        val text = WidgetSnapshotJson.encode(WidgetTestData.snapshot())
        val root = Json.parseToJsonElement(text) as JsonObject
        assertEquals(setOf("v", "updatedAt", "epochDay", "demo", "recovery", "sleep", "strain", "heartRate"), root.keys)
        val metric = root["recovery"] as JsonObject
        assertEquals(setOf("state", "value", "band", "prov", "provisional", "days", "reason"), metric.keys)
    }

    @Test
    fun unknownFieldsAreIgnored() {
        val text = """{"v":1,"updatedAt":5,"epochDay":9,"demo":false,"future":{"x":1},
            "recovery":{"state":"value","value":50.0,"extra":"?"},"sleep":{},"strain":{},"heartRate":{"bpm":60,"at":4,"zzz":1}}"""
        val decoded = assertNotNull(WidgetSnapshotJson.decode(text))
        assertEquals(50.0, decoded.recovery.value)
        assertEquals(60, decoded.heartRateBpm)
    }

    @Test
    fun unknownStatusAndMissingMetricsBecomeNoData() {
        val text = """{"v":1,"updatedAt":5,"epochDay":9,"recovery":{"state":"sparkly"},"strain":{"state":"value"}}"""
        val decoded = assertNotNull(WidgetSnapshotJson.decode(text))
        assertEquals(WidgetMetric.NO_DATA, decoded.recovery)
        assertEquals(WidgetMetric.NO_DATA, decoded.sleep)
        assertEquals(WidgetMetric.NO_DATA, decoded.strain, "a value without a number is no data, never zero")
    }

    @Test
    fun aHeartRateNeedsBothItsNumberAndItsTime() {
        val noTime = """{"v":1,"updatedAt":5,"epochDay":9,"heartRate":{"bpm":60}}"""
        val noBpm = """{"v":1,"updatedAt":5,"epochDay":9,"heartRate":{"at":4}}"""
        val zero = """{"v":1,"updatedAt":5,"epochDay":9,"heartRate":{"bpm":0,"at":4}}"""
        for (text in listOf(noTime, noBpm, zero)) {
            val decoded = assertNotNull(WidgetSnapshotJson.decode(text))
            assertNull(decoded.heartRateBpm, text)
            assertNull(decoded.heartRateAtMillis, text)
        }
    }

    @Test
    fun unreadableTextReturnsNullAndNeverThrows() {
        val bad = listOf(
            "",
            "not json",
            "[]",
            "null",
            "{",
            """{"v":1}""",
            """{"v":2,"updatedAt":5,"epochDay":9}""",
            """{"v":"1","updatedAt":5,"epochDay":9}""",
            """{"updatedAt":5,"epochDay":9}""",
            """{"v":1,"updatedAt":"x","epochDay":9}""",
            "\u0000\u0001\u0002",
        )
        for (text in bad) assertNull(WidgetSnapshotJson.decode(text), "should be null: $text")
    }

    @Test
    fun aNonFiniteValueIsNeverWritten() {
        val snapshot = WidgetTestData.snapshot(recovery = WidgetTestData.value(Double.NaN))
        val decoded = assertNotNull(WidgetSnapshotJson.decode(WidgetSnapshotJson.encode(snapshot)))
        assertEquals(WidgetMetric.NO_DATA, decoded.recovery)
        assertFalse(WidgetSnapshotJson.encode(snapshot).contains("NaN"))
    }
}
