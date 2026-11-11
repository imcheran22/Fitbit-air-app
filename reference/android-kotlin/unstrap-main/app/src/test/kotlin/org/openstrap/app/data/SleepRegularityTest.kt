package org.openstrap.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openstrap.app.data.SleepRegularity.Band
import org.openstrap.app.data.db.SleepStage

class SleepRegularityTest {
    private val day = 86_400L

    /** Grid day [k] (noon to noon) with sleep from [bed] to [wake] minutes after noon, worn the whole day. */
    private fun day(k: Int, bed: Int, wake: Int, worn: Boolean = true): ByteArray {
        val noon = k * day
        val stages = listOf(Triple(noon + bed * 60L, noon + wake * 60L, SleepStage.LIGHT))
        return SleepRegularity.grid(noon, stages) { worn }
    }

    @Test fun `identical days are perfectly regular`() {
        val (sri, valid) = SleepRegularity.sri((0..7).map { day(it, 660, 1140) }) // 23:00-07:00
        assertEquals(100f, sri!!, 1e-4f)
        assertEquals(7 * 1440, valid)
        assertEquals(Band.VeryRegular, SleepRegularity.band(sri))
    }

    @Test fun `sri counts mismatched minutes`() {
        // Alternate bedtimes 23:00 and 01:00 (2 h shift): each pair disagrees for 120 of 1440 minutes.
        val grids = (0..7).map { if (it % 2 == 0) day(it, 660, 1140) else day(it, 780, 1140) }
        val (sri, _) = SleepRegularity.sri(grids)
        assertEquals(-100f + 200f * (1440 - 120) / 1440, sri!!, 1e-3f)
        assertEquals(Band.Regular, SleepRegularity.band(sri))
    }

    @Test fun `a week shifted 2 h either way every other day scores much lower`() {
        // 23:00-07:00 and 01:00-09:00 alternating: each pair disagrees at both ends, 240 of 1440 minutes.
        val regular = SleepRegularity.sri((0..7).map { day(it, 660, 1140) }).first!!
        val shifted = SleepRegularity.sri((0..7).map { if (it % 2 == 0) day(it, 660, 1140) else day(it, 780, 1260) }).first!!
        assertEquals(-100f + 200f * (1440 - 240) / 1440, shifted, 1e-3f) // 66.7
        assertTrue(regular - shifted > 30f)
        assertEquals(Band.Irregular, SleepRegularity.band(shifted))
    }

    @Test fun `only pairs with both minutes valid count, and under 120 h it is withheld`() {
        // Off the wrist outside sleep: only the 8 h of sleep per day are valid, 7 pairs × 480 = 3360 < 7200.
        val grids = (0..7).map { day(it, 660, 1140, worn = false) }
        val (sri, valid) = SleepRegularity.sri(grids)
        assertEquals(7 * 480, valid)
        assertNull(sri)
        // The midpoint fallback steps in with ≥ 4 sleeps.
        val r = SleepRegularity.result(grids, listOf(900f, 910f, 890f, 905f))
        assertNull(r.sri)
        assertTrue(r.midpointSdMinutes!! < 60f)
        assertEquals(true, r.good)
        assertNull(SleepRegularity.result(grids, listOf(900f, 910f)).midpointSdMinutes)
    }

    @Test fun `bands`() {
        assertEquals(Band.Irregular, SleepRegularity.band(71.9f))
        assertEquals(Band.Fair, SleepRegularity.band(72f))
        assertEquals(Band.Regular, SleepRegularity.band(79f))
        assertEquals(Band.VeryRegular, SleepRegularity.band(87f))
    }

    @Test fun `sleep wins over awake when stages touch, naps count as sleep`() {
        val g = SleepRegularity.grid(0, listOf(Triple(0L, 600L, SleepStage.AWAKE), Triple(300L, 900L, SleepStage.REM))) { false }
        assertEquals(SleepRegularity.WAKE, g[0])
        assertEquals(SleepRegularity.SLEEP, g[5])
        assertEquals(SleepRegularity.SLEEP, g[14])
        assertEquals(SleepRegularity.MISSING, g[15])
    }

    @Test fun `sleep-health count`() {
        val regular = SleepRegularity.Result(85f, 9000, null)
        val h = SleepRegularity.health(450, 20, 470, regular, 40, 3 * 60)
        assertEquals(3, h.count)
        assertFalse(h.midpointOutside)
        // Short, broken and irregular: none good. Late midpoint is flagged but never counted.
        val poor = SleepRegularity.health(360, 70, 450, SleepRegularity.Result(65f, 9000, null), 40, 6 * 60)
        assertEquals(0, poor.count)
        assertTrue(poor.midpointOutside)
        // Efficiency ≥ 90 % rescues continuity even with WASO over 30.
        assertEquals(true, SleepRegularity.health(450, 40, 495, regular, 40, 180).continuity)
        // From 65 the upper duration bound is 510.
        assertFalse(SleepRegularity.health(530, 10, 540, regular, 70, 180).duration)
        assertTrue(SleepRegularity.health(530, 10, 540, regular, 40, 180).duration)
    }
}
