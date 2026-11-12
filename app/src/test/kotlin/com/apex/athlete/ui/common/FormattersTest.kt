package com.apex.athlete.ui.common

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.data.settings.UnitSystem
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.test.assertEquals

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS")
class FormattersTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val now = LocalDate.of(2026, 11, 11).atTime(12, 0).toInstant(ZoneOffset.UTC).toEpochMilli()

    private fun formatter(units: UnitSystem = UnitSystem.METRIC, h24: Boolean = true) =
        ApexFormatter(context, units, h24, { ZoneOffset.UTC }, { now })

    @Test
    fun dayLabels() {
        val f = formatter()
        assertEquals("Today", f.dayLabel(LocalDate.of(2026, 11, 11)))
        assertEquals("Yesterday", f.dayLabel(LocalDate.of(2026, 11, 10)))
        assertEquals("Tomorrow", f.dayLabel(LocalDate.of(2026, 11, 12)))
    }

    @Test
    fun relativeTime() {
        val f = formatter()
        assertEquals("Never", f.relativeTime(null))
        assertEquals("Just now", f.relativeTime(now - 20_000))
        assertEquals("12 min ago", f.relativeTime(now - 12 * 60_000))
        assertEquals("3 h ago", f.relativeTime(now - 3 * 3_600_000L))
        assertEquals("2 d ago", f.relativeTime(now - 49 * 3_600_000L))
        assertEquals("Just now", f.relativeTime(now + 60_000)) // a clock set slightly back never shows a negative age
    }

    @Test
    fun durations() {
        val f = formatter()
        assertEquals("7 h 32 min", f.duration(452.0))
        assertEquals("45 min", f.duration(45.0))
        assertEquals("2 h", f.duration(120.0))
        assertEquals("--", f.duration(null))
        assertEquals("--", f.duration(Double.NaN))
        assertEquals("--", f.duration(-5.0))
    }

    @Test
    fun clockStyle() {
        assertEquals("23:30", formatter(h24 = true).clockTime(23 * 60 + 30))
        assertEquals("11:30 PM", formatter(h24 = false).clockTime(23 * 60 + 30))
        assertEquals("--", formatter().clockTime(null))
    }

    @Test
    fun units() {
        assertEquals("5.00 km", formatter().distance(5000.0))
        assertEquals("3.11 mi", formatter(UnitSystem.IMPERIAL).distance(5000.0))
        assertEquals("--", formatter().distance(null))
        assertEquals("72.4 kg", formatter().weight(72.4))
        assertEquals("5 ft 10 in", formatter(UnitSystem.IMPERIAL).height(178.0))
        assertEquals("--", formatter().weight(0.0))
    }

    @Test
    fun temperatureDeviationIsSignedAndConverted() {
        assertEquals("+0.5 °C", formatter().temperatureDeviation(0.5))
        assertEquals("+0.9 °F", formatter(UnitSystem.IMPERIAL).temperatureDeviation(0.5))
        assertEquals("--", formatter().temperatureDeviation(null))
    }
}
