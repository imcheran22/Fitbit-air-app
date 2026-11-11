package app.fitdash.metrics

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.day
import app.fitdash.history
import app.fitdash.plus
import org.junit.Assert.assertEquals
import org.junit.Test

class ReadinessTest {
    @Test fun `hrv component mapping`() {
        assertEquals(70.0, hrvComponent(40.0, 40.0), 1e-6)
        assertEquals(100.0, hrvComponent(46.0, 40.0), 1e-6)
        assertEquals(30.0, hrvComponent(34.0, 40.0), 1e-6)
        assertEquals(100.0, hrvComponent(52.0, 40.0), 1e-6)
        assertEquals(0.0, hrvComponent(20.0, 40.0), 1e-6)
    }

    @Test fun `resting HR component mapping`() {
        assertEquals(70.0, rhrComponent(60.0, 60.0), 1e-6)
        assertEquals(100.0, rhrComponent(55.0, 60.0), 1e-6)
        assertEquals(30.0, rhrComponent(65.0, 60.0), 1e-6)
        assertEquals(54.0, rhrComponent(62.0, 60.0), 1e-6)
    }

    @Test fun `band cutoffs`() {
        assertEquals(Band.RECOVER, band(39))
        assertEquals(Band.STEADY, band(40))
        assertEquals(Band.STEADY, band(69))
        assertEquals(Band.PRIMED, band(70))
    }

    @Test fun `weighted score with all components`() {
        val snap = history(TODAY, 10) + day(TODAY, hrv = 40.0, rhr = 60.0, sleepHours = 6.4)
        // 0.4*70 + 0.3*70 + 0.3*80 = 73
        assertEquals(
            ReadinessResult.Ready(
                73, Band.PRIMED,
                mapOf(Component.HRV to 70.0, Component.RESTING_HR to 70.0, Component.SLEEP to 80.0),
            ),
            readiness(snap, TODAY, IST),
        )
    }

    @Test fun `parts carry each component score`() {
        val snap = history(TODAY, 10) + day(TODAY, hrv = 40.0, rhr = 60.0, sleepHours = 6.4)
        val r = readiness(snap, TODAY, IST) as ReadinessResult.Ready
        assertEquals(70.0, r.parts.getValue(Component.HRV), 1e-6)
        assertEquals(80.0, r.parts.getValue(Component.SLEEP), 1e-6)
    }

    @Test fun `missing HRV re-weights the other components`() {
        val snap = history(TODAY, 10, hrv = null) + day(TODAY, rhr = 60.0, sleepHours = 8.0)
        // (0.3*70 + 0.3*100) / 0.6 = 85
        assertEquals(
            ReadinessResult.Ready(85, Band.PRIMED, mapOf(Component.RESTING_HR to 70.0, Component.SLEEP to 100.0)),
            readiness(snap, TODAY, IST),
        )
    }

    @Test fun `zero HRV baseline drops HRV instead of dividing by zero`() {
        val snap = history(TODAY, 10, hrv = 0.0) + day(TODAY, hrv = 40.0, rhr = 60.0, sleepHours = 8.0)
        assertEquals(
            ReadinessResult.Ready(85, Band.PRIMED, mapOf(Component.RESTING_HR to 70.0, Component.SLEEP to 100.0)),
            readiness(snap, TODAY, IST),
        )
    }

    @Test fun `fewer than 7 nights is calibrating`() {
        val snap = history(TODAY, 3) + day(TODAY, hrv = 40.0, rhr = 60.0, sleepHours = 8.0)
        assertEquals(ReadinessResult.Calibrating(3), readiness(snap, TODAY, IST))
    }

    @Test fun `no data for today`() {
        assertEquals(ReadinessResult.NoData, readiness(history(TODAY, 10), TODAY, IST))
    }
}
