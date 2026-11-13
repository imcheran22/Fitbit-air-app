package com.apex.athlete.core.data.sync

import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.HeartRatePoint
import com.apex.athlete.core.data.source.FixtureReplaySource
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.SyncSource
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The decisions that keep a wrong clock or an interrupted run from leaving a permanent hole. */
class SyncResumePlanTest {
    private val hour = 3_600_000L
    private val day = 24 * hour
    private val now = 1_800_000_000_000L
    private val floor = now - 90 * day
    private val overlap = 36 * hour

    @Test
    fun aNeverSyncedStreamReadsFromTheFloor() {
        assertEquals(SyncResumePlan.ReadPlan(floor, null), SyncResumePlan.readPlan(0L, now, floor, overlap))
    }

    @Test
    fun anOrdinaryWatermarkReadsFromItsOverlapAndIsNotRewound() {
        val mark = now - 2 * hour
        assertEquals(SyncResumePlan.ReadPlan(mark - overlap, null), SyncResumePlan.readPlan(mark, now, floor, overlap))
        assertEquals(SyncResumePlan.ReadPlan(floor, null), SyncResumePlan.readPlan(floor + hour, now, floor, overlap))
    }

    @Test
    fun aWatermarkWithinTenMinutesAheadIsNotStale() {
        val mark = now + 10 * 60_000L
        assertEquals(SyncResumePlan.ReadPlan(mark - overlap, null), SyncResumePlan.readPlan(mark, now, floor, overlap))
    }

    @Test
    fun aWatermarkFurtherAheadThanTenMinutesIsStaleAndRewoundToTheFloor() {
        val plan = SyncResumePlan.readPlan(now + 3 * day, now, floor, overlap)
        assertEquals(SyncResumePlan.ReadPlan(floor, floor), plan)
        assertEquals(SyncResumePlan.ReadPlan(floor, floor), SyncResumePlan.readPlan(now + 10 * 60_000L + 1, now, floor, overlap))
    }

    @Test
    fun replayMarkRoundTripsAndIgnoresForeignTokens() {
        assertEquals(20_000L, SyncResumePlan.decodeReplayMark(SyncResumePlan.encodeReplayMark(20_000L)))
        assertNull(SyncResumePlan.decodeReplayMark(null))
        assertNull(SyncResumePlan.decodeReplayMark("some-change-token"))
        assertNull(SyncResumePlan.decodeReplayMark("replay-from:abc"))
    }

    @Test
    fun theReplayStartIsTheEarliestOfStoredMarksAndThisRun() {
        assertNull(SyncResumePlan.replayFrom(emptyList(), null))
        assertEquals(10L, SyncResumePlan.replayFrom(listOf(null, 12L, 10L), 15L))
        assertEquals(5L, SyncResumePlan.replayFrom(listOf(12L), 5L))
        assertEquals(12L, SyncResumePlan.replayFrom(listOf(12L, null), null))
    }

    @Test
    fun afterACappedOrFailedRunTheWalkResumesAtTheWatermarkWithoutOverlap() {
        val now = 100 * 86_400_000L
        val floor = now - 90 * 86_400_000L
        val overlap = 36 * 3_600_000L
        val mark = floor + 36 * 3_600_000L
        assertEquals(SyncResumePlan.ReadPlan(mark, null), SyncResumePlan.readPlan(mark, now, floor, overlap, caughtUp = false))
        assertEquals(SyncResumePlan.ReadPlan(floor, null), SyncResumePlan.readPlan(mark, now, floor, overlap, caughtUp = true))
        assertEquals(SyncResumePlan.ReadPlan(now - overlap, null), SyncResumePlan.readPlan(now, now, floor, overlap, caughtUp = true))
    }

    // --- window edges are whole minutes (DATA_FLOW_E2E item 11) -------------------------------------------

    private val minute = 60_000L

    @Test
    fun floorToMinuteRoundsDownAndLeavesWholeMinutesAlone() {
        assertEquals(1_800_000_000_000L, SyncResumePlan.floorToMinute(1_800_000_000_000L))
        assertEquals(1_800_000_000_000L, SyncResumePlan.floorToMinute(1_800_000_000_000L + 59_999L))
        assertEquals(1_800_000_000_000L + minute, SyncResumePlan.floorToMinute(1_800_000_000_000L + minute + 1L))
        assertEquals(-minute, SyncResumePlan.floorToMinute(-1L), "before 1970 it still rounds down, not towards zero")
        assertEquals(0L, SyncResumePlan.floorToMinute(0L))
    }

    /** The windows the orchestrator walks: oldest first, each one starting where the last ended. */
    private fun walk(fromMillis: Long, endMillis: Long, maxWindowMillis: Long): List<Pair<Long, Long>> {
        val out = ArrayList<Pair<Long, Long>>()
        var from = SyncResumePlan.floorToMinute(fromMillis)
        val end = SyncResumePlan.floorToMinute(endMillis)
        while (from < end) {
            val to = SyncResumePlan.windowEnd(from, end, maxWindowMillis)
            out += from to to
            from = to
        }
        return out
    }

    @Test
    fun everyWindowEdgeIsAWholeMinuteWhateverTheClockAndTheWindowWidth() {
        val unalignedNow = 1_800_000_000_000L + 37_123L
        for (width in listOf(12 * hour, 2 * day, 12 * hour + 7_001L, 90_000L, 5_000L)) {
            val windows = walk(unalignedNow - 3 * day, unalignedNow, width)
            assertTrue(windows.isNotEmpty())
            for ((from, to) in windows) {
                assertEquals(0L, from % minute, "start $from of width $width")
                assertEquals(0L, to % minute, "end $to of width $width")
                assertTrue(to > from)
            }
            assertEquals(windows.map { it.second }.dropLast(1), windows.map { it.first }.drop(1), "contiguous, nothing skipped or read twice")
            assertEquals(SyncResumePlan.floorToMinute(unalignedNow), windows.last().second, "the last window ends on the clock's minute")
        }
    }

    @Test
    fun theNewestWindowAlsoStartsOnAWholeMinute() {
        val end = SyncResumePlan.floorToMinute(1_800_000_000_000L + 41_000L)
        val from = end - 5 * day
        assertEquals(end - 12 * hour, SyncResumePlan.newestWindowStart(from, end, 12 * hour + 31_000L))
        assertEquals(from, SyncResumePlan.newestWindowStart(from, end, 6 * day), "a window wider than the backlog starts at the backlog")
    }

    @Test
    fun aHeartRateMinuteIsNeverSplitAcrossTwoWindows() {
        // The clock reads :37 into a minute, so an unrounded floor (now - 90 d) puts a window edge at :37.
        // Readings at :10 and :50 of the minute that holds the edge must land in one window, or the ingestor
        // sees half a minute twice and replaces instead of merging.
        val now = 1_800_000_000_000L - Math.floorMod(1_800_000_000_000L, minute) + 37_000L
        val floor = now - 6 * day
        val edgeMinute = SyncResumePlan.floorToMinute(floor + 2 * day)
        val points = listOf(edgeMinute + 10_000L, edgeMinute + 50_000L, edgeMinute - 20_000L, edgeMinute + 100_000L).map { HeartRatePoint(it, 60) }
        val source = FixtureReplaySource(
            SyncSource.GOOGLE_HEALTH_API, listOf(HealthBatch(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, heartRate = points)),
            windowMillis = 2 * day,
        )
        val windowOf = HashMap<Long, MutableSet<Pair<Long, Long>>>()
        runBlocking {
            for (w in walk(floor, now, 2 * day)) {
                source.pull(source.streams.single(), w.first, w.second) { b ->
                    for (p in b.heartRate) windowOf.getOrPut(Math.floorDiv(p.epochMillis, minute)) { HashSet() } += w
                }
            }
        }
        for ((m, windows) in windowOf) assertEquals(1, windows.size, "minute $m was delivered by ${windows.size} windows")
        assertEquals(3, windowOf.size)
    }
}
