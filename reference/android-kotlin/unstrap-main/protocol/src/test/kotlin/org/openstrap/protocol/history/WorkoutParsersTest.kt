package org.openstrap.protocol.history

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openstrap.protocol.hexToBytes

/** Payloads captured from a Helio Strap (fw 3.25.0.3) for one 2026-10-16 workout. */
class WorkoutParsersTest {

    private val trackId = 1_792_141_453L
    private fun fixture(name: String) = javaClass.getResourceAsStream("/workout/$name")!!.readBytes()

    @Test
    fun summary() {
        val r = WorkoutParsers.summary.parse(fixture("summary_5.bin"), ParseContext(trackId)) as ParseResult.Success
        val w = r.records.single()
        assertEquals(trackId, w.trackId)
        assertEquals(223, w.sportType)
        assertEquals(530, w.totalTime)
        assertEquals(530, w.exerciseTime)
        assertEquals(66, w.calories)
        assertEquals(119, w.averageHeartRate); assertEquals(132, w.maxHeartRate); assertEquals(96, w.minHeartRate)
        assertEquals(1.0f, w.aerobicTrainingEffect!!, 1e-6f)
        assertEquals(0.1f, w.anaerobicTrainingEffect!!, 1e-6f)
        assertEquals(6, w.trainingLoad)
        assertNull(w.vo2max)
        assertEquals(trackId + 1, r.nextCursor)
    }

    @Test
    fun summaryRejectsLegacyLayouts() {
        assertTrue(WorkoutParsers.summary.parse(byteArrayOf(2, 1, 0, 0), ParseContext(trackId)) is ParseResult.Failure)
    }

    @Test
    fun detailHeartRate() {
        val r = WorkoutParsers.detail.parse(fixture("detail_6.bin"), ParseContext(trackId)) as ParseResult.Success
        val d = r.records.single()
        assertEquals(1307, d.heartRate.size)
        assertEquals(1_792_141_453_710L to 96, d.heartRate.first())
        // About 1 Hz throughout, including the three minutes after the workout ends.
        assertTrue(d.heartRate.zipWithNext().all { (a, b) -> b.first - a.first in 400L..4000L })
        assertEquals(1_792_142_763L, d.heartRate.last().first / 1000)
        assertEquals(listOf(1, 6), d.events.map { it.second })
        assertEquals(trackId + 1, r.nextCursor)
    }

    @Test
    fun detailEventCodeIsU16() {
        // TimeStamp node (4 unknown bytes, base u64 ms), then Event `offset u16 = 10, code u16 = 0x0102`.
        val base = 1_792_141_453_000L
        val ts = ByteArray(12).also { b -> for (i in 0..7) b[4 + i] = (base ushr (8 * i)).toByte() }
        val payload = byteArrayOf(0x01, 12) + ts + "04040a000201".hexToBytes()
        val d = (WorkoutParsers.detail.parse(payload, ParseContext(trackId)) as ParseResult.Success).records.single()
        assertEquals(listOf((base + 10) to 0x0102), d.events)
    }

    @Test
    fun sportEffect() {
        val r = WorkoutParsers.sportEffect.parse(fixture("effect_59.bin"), ParseContext(1_792_142_584)) as ParseResult.Success
        val e = r.records.single()
        assertEquals(1_792_142_584L, e.timestamp)
        assertEquals(191, e.maximalHeartRate)
        assertEquals(127, e.recoveryTimeMinutes)
        assertNull(e.vo2max)
        assertEquals(6.826f, e.trainingLoadWeekly!!, 1e-3f)
        assertEquals(27.3f, e.trainingLoadMonthly!!, 0.01f)
        assertEquals(54, e.optimalLoadMin); assertEquals(182, e.optimalLoadMax)
    }
}
