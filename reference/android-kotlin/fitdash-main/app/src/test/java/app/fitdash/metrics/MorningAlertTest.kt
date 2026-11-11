package app.fitdash.metrics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class MorningAlertTest {
    private val zone = ZoneId.of("Asia/Kolkata")
    private val day = LocalDate.of(2026, 10, 26)
    private fun at(h: Int, m: Int = 0) = day.atTime(h, m).atZone(zone)
    private fun heart(rhr: Double?, hrv: Double?) = HeartSummary(hrv, 47.0, rhr, 60.0, emptyList(), emptyList(), 40.0..55.0, 54.75..64.25)
    // 20 days before `day` holding 50 to 69: the IQR is 54.75 to 64.25, the 10th to 90th band 51.9 to 67.1.
    private fun spread(kind: MetricKind) = mapOf(kind to (1..20).map { DayValue(day.minusDays(it.toLong()), 70.0 - it) })

    @Test fun `alert quotes the interquartile range`() {
        val alerts = morningAlert(emptyList(), heart(68.0, 48.0), spread(MetricKind.RESTING_HR), day)
        assertEquals(listOf("Resting HR"), alerts.map { it.label })
        assertEquals(68.0, alerts[0].value, 0.0)
        val usual = normalRange(spread(MetricKind.RESTING_HR)[MetricKind.RESTING_HR]!!.associate { it.date to it.value!! }, day)
        assertEquals(usual, alerts[0].range)
        assertEquals(54.75, alerts[0].range!!.start, 1e-9)
        assertTrue(68.0 > alerts[0].range!!.endInclusive)
    }

    @Test fun `just outside the interquartile range but inside the wide band is not returned`() {
        assertTrue(morningAlert(emptyList(), heart(66.0, 48.0), spread(MetricKind.RESTING_HR), day).isEmpty())
    }

    @Test fun `the good side of the band is not returned`() {
        assertTrue(morningAlert(emptyList(), heart(50.0, 48.0), spread(MetricKind.RESTING_HR), day).isEmpty())
    }

    @Test fun `HRV and SpO2 never alert`() {
        val spo2 = VitalReading("SpO₂", "%", 40.0, 96.0, 94.0..99.0, Good.HIGHER, MetricKind.SPO2)
        assertTrue(morningAlert(listOf(spo2), heart(null, 10.0), spread(MetricKind.SPO2) + spread(MetricKind.HRV), day).isEmpty())
    }

    @Test fun `respiratory rate outside the band on either side is returned, a vital without history is not`() {
        val low = VitalReading("Respiratory rate", "br/min", 51.0, 60.0, null, Good.MIDDLE, MetricKind.RESPIRATORY)
        val skin = VitalReading("Skin temperature", "°C", 1.0, null, null, Good.MIDDLE, MetricKind.SKIN_TEMP)
        assertEquals(listOf("Respiratory rate"), morningAlert(listOf(low, skin), null, spread(MetricKind.RESPIRATORY), day).map { it.label })
    }

    @Test fun `due between 6 AM and 11 AM`() {
        assertFalse(morningAlertDue(at(5, 59), null))
        assertTrue(morningAlertDue(at(6), null))
        assertTrue(morningAlertDue(at(8), null))
        assertFalse(morningAlertDue(at(11), null))
    }

    @Test fun `not due again once checked today`() {
        assertFalse(morningAlertDue(at(9), at(7).toInstant()))
        assertTrue(morningAlertDue(at(9), at(7).minusDays(1).toInstant()))
    }
}
