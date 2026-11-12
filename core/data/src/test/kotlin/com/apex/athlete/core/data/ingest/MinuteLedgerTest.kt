package com.apex.athlete.core.data.ingest

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The per-run record of heart-rate minutes must stay small however long the run is. */
class MinuteLedgerTest {
    private val minute = 60_000L
    private val hour = 60 * minute

    @Test
    fun aMinuteWrittenInTheCurrentChunkStaysKnownSoALaterBatchCanMergeIntoIt() {
        val ledger = MinuteLedger()
        val chunk = (0 until 100).map { it * minute }
        ledger.recordChunk(chunk)
        assertTrue(chunk.all { it in ledger })
    }

    @Test
    fun minutesFarFromTheLatestChunkAreForgotten() {
        val ledger = MinuteLedger()
        ledger.recordChunk((0 until 100).map { it * minute })
        val later = (0 until 100).map { 10 * hour + it * minute }
        ledger.recordChunk(later)
        assertFalse(0L in ledger, "older than one hour before the chunk")
        assertTrue(later.all { it in ledger })
        // A minute within an hour before the chunk's first minute is still remembered.
        ledger.recordChunk((0 until 10).map { 10 * hour + 100 * minute + it * minute })
        assertTrue(10 * hour + 50 * minute in ledger)
    }

    @Test
    fun descendingOrderIsBoundedToo() {
        val ledger = MinuteLedger()
        var peak = 0
        for (c in 99 downTo 0) {
            ledger.recordChunk((0 until 2_500).map { (c * 2_500L + it) * minute })
            peak = maxOf(peak, ledger.size)
        }
        assertTrue(peak <= 2_500 + 130, "peak $peak")
    }

    @Test
    fun aQuarterMillionAscendingMinutesStayBelowAFewThousand() {
        val ledger = MinuteLedger()
        var peak = 0
        var total = 0
        var next = 1_700_000_000_000L
        while (total < 250_000) {
            val chunk = (0 until 2_500).map { next + it * minute }
            next += 2_500 * minute
            ledger.recordChunk(chunk)
            total += chunk.size
            peak = maxOf(peak, ledger.size)
        }
        assertEquals(250_000, total)
        assertTrue(peak <= 2_500 + 130, "peak $peak")
    }

    @Test
    fun sparseWidelySpreadChunksCannotGrowTheLedgerWithoutBound() {
        val ledger = MinuteLedger()
        var peak = 0
        // Each chunk spans a year, so every chunk's window covers all earlier chunks.
        for (round in 0 until 40) {
            ledger.recordChunk((0 until 2_500).map { it * 210L * minute + round * minute })
            peak = maxOf(peak, ledger.size)
        }
        assertTrue(peak <= MinuteLedger.MAX_TRACKED, "peak $peak")
    }
}
