package com.apex.athlete.core.data.sync

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

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
}
