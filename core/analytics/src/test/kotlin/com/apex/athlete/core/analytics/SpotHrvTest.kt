package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.breathe.SpotHrv
import com.apex.athlete.core.analytics.breathe.SpotHrvMissingReason
import com.apex.athlete.core.domain.DataProvenance
import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SpotHrvTest {

    private fun alternating(n: Int, a: Double = 800.0, b: Double = 850.0) = List(n) { if (it % 2 == 0) a else b }

    @Test
    fun cleanAlternatingSeriesGivesRmssdEqualToTheStep() {
        // 80 beats alternating 800/850: 79 successive differences of magnitude 50 -> RMSSD 50; mean RR 825 -> 72.727 bpm; 66 s.
        val r = SpotHrv.analyse(alternating(80))
        assertEquals(50.0, r.rmssdMs!!, 1e-9)
        assertEquals(60_000.0 / 825.0, r.meanHeartRateBpm!!, 1e-9)
        assertEquals(80, r.acceptedBeats)
        assertEquals(0, r.rejectedBeats)
        assertEquals(66.0, r.recordingSeconds, 1e-9)
        assertNull(r.missingReason)
        assertEquals(DataProvenance.ESTIMATED, r.provenanceHint)
        assertEquals(DataProvenance.ESTIMATED, SpotHrv.PROVENANCE_HINT)
    }

    @Test
    fun unequalStepsGiveTheRootMeanSquare() {
        // Repeating 800, 820, 800, 860 x 20: successive differences +20, -20, +60, -60 ...; 79 of them:
        // 20 x (400 + 400 + 3600) + 19 x 3600 = 156 400 -> sqrt(156400 / 79).
        val rr = List(80) { doubleArrayOf(800.0, 820.0, 800.0, 860.0)[it % 4] }
        val r = SpotHrv.analyse(rr)
        assertEquals(sqrt(156_400.0 / 79.0), r.rmssdMs!!, 1e-9)
        assertEquals(80, r.acceptedBeats)
    }

    @Test
    fun artifactsAreDroppedAndDifferencesAreNotTakenAcrossTheGap() {
        // idx 20 -> 1200 (more than 20 % from its neighbourhood median 850), idx 40 -> 250 (below 300 ms).
        val rr = alternating(80).toMutableList().also { it[20] = 1200.0; it[40] = 250.0 }
        val r = SpotHrv.analyse(rr)
        assertEquals(78, r.acceptedBeats)
        assertEquals(2, r.rejectedBeats)
        // 79 adjacent pairs minus the 4 that touch a dropped beat = 75 differences, all 50. Bridging the gaps would add
        // two zero differences (850 -> 850) and give sqrt(75 * 2500 / 77) = 49.3 instead.
        assertEquals(50.0, r.rmssdMs!!, 1e-9)
        // accepted sum = 38 x 800 + 40 x 850 = 64 400 ms over 78 beats
        assertEquals(60_000.0 * 78.0 / 64_400.0, r.meanHeartRateBpm!!, 1e-9)
        // Duration counts beats inside 300..2000 ms: the 1200 ms beat is included, the 250 ms one is not: 65.6 s.
        assertEquals(65.6, r.recordingSeconds, 1e-9)
    }

    @Test
    fun theFirstBeatIsCheckedAgainstAShortenedWindow() {
        val rr = alternating(80).toMutableList().also { it[0] = 1200.0 } // window idx 0..2 = 1200, 850, 800 -> median 850
        val r = SpotHrv.analyse(rr)
        assertEquals(79, r.acceptedBeats)
        assertEquals(50.0, r.rmssdMs!!, 1e-9) // 78 differences from idx 1..79
    }

    @Test
    fun twentyPercentDeviationExactlyIsKeptAndMoreIsDropped() {
        val at = List(80) { 1000.0 }.toMutableList().also { it[40] = 1200.0 }
        val kept = SpotHrv.analyse(at)
        assertEquals(80, kept.acceptedBeats)
        assertEquals(sqrt(80_000.0 / 79.0), kept.rmssdMs!!, 1e-9) // two differences of 200
        val beyond = List(80) { 1000.0 }.toMutableList().also { it[40] = 1201.0 }
        val dropped = SpotHrv.analyse(beyond)
        assertEquals(79, dropped.acceptedBeats)
        assertEquals(0.0, dropped.rmssdMs!!, 1e-12) // 77 differences, all zero: a real value for a perfectly regular series
    }

    @Test
    fun rangeEdgesAre300And2000Inclusive() {
        val fast = SpotHrv.analyse(List(200) { 300.0 }) // 200 x 0.3 s = 60 s exactly
        assertEquals(200, fast.acceptedBeats); assertEquals(0.0, fast.rmssdMs!!, 0.0); assertEquals(200.0, fast.meanHeartRateBpm!!, 1e-9)
        val slow = SpotHrv.analyse(List(30) { 2000.0 }) // 30 x 2 s = 60 s exactly
        assertEquals(30, slow.acceptedBeats); assertEquals(30.0, slow.meanHeartRateBpm!!, 1e-9)
        val below = SpotHrv.analyse(List(200) { 299.0 })
        assertEquals(0, below.acceptedBeats); assertNull(below.rmssdMs)
        assertEquals(SpotHrvMissingReason.TOO_FEW_BEATS, below.missingReason)
        assertEquals(0, SpotHrv.analyse(List(80) { 2001.0 }).acceptedBeats)
    }

    @Test
    fun tooFewBeatsOrTooShortGivesNullWithAReason() {
        val few = SpotHrv.analyse(alternating(29, 1900.0, 1950.0))
        assertNull(few.rmssdMs); assertNull(few.meanHeartRateBpm)
        assertEquals(29, few.acceptedBeats)
        assertEquals(SpotHrvMissingReason.TOO_FEW_BEATS, few.missingReason)
        // 40 beats of ~0.825 s = 33 s: enough beats, not enough time.
        val short = SpotHrv.analyse(alternating(40))
        assertNull(short.rmssdMs)
        assertEquals(40, short.acceptedBeats)
        assertEquals(33.0, short.recordingSeconds, 1e-9)
        assertEquals(SpotHrvMissingReason.TOO_SHORT_RECORDING, short.missingReason)
        assertEquals(DataProvenance.ESTIMATED, short.provenanceHint)
        assertEquals(SpotHrvMissingReason.TOO_FEW_BEATS, SpotHrv.analyse(emptyList()).missingReason)
    }

    @Test
    fun nonFiniteIntervalsAreRejected() {
        val rr = alternating(80).toMutableList().also { it[5] = Double.NaN; it[6] = Double.POSITIVE_INFINITY }
        val r = SpotHrv.analyse(rr)
        assertEquals(78, r.acceptedBeats)
        assertEquals(50.0, r.rmssdMs!!, 1e-9)
    }

    @Test
    fun noAdjacentAcceptedPairsGivesNoRmssd() {
        // Every other beat is out of range: 65 accepted beats (65 s) but never two in a row.
        val rr = List(130) { if (it % 2 == 0) 1000.0 else 100.0 }
        val r = SpotHrv.analyse(rr)
        assertEquals(65, r.acceptedBeats)
        assertNull(r.rmssdMs)
        assertEquals(SpotHrvMissingReason.NO_ADJACENT_BEATS, r.missingReason)
    }
}
