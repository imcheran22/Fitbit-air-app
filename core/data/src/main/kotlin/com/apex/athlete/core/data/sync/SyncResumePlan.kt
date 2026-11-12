package com.apex.athlete.core.data.sync

/**
 * Pure decisions behind two recoveries of [TriSourceSyncOrchestrator]:
 *
 * - a watermark that lies in the future (the phone clock was set ahead, then corrected) is stale and
 *   would hide everything until real time catches up, so the stream is re-read from the backfill floor;
 * - days committed by a run that was interrupted before its replay are remembered as a replay mark on the
 *   stream's watermark row and replayed by the next run.
 */
internal object SyncResumePlan {
    const val FUTURE_TOLERANCE_MS = 10 * 60_000L
    private const val MARK_PREFIX = "replay-from:"

    /** Where to read from; [rewindTo] is the value the stored watermark must be reset to, if any. */
    data class ReadPlan(val fromMillis: Long, val rewindTo: Long?)

    fun readPlan(lastSyncedMillis: Long, nowMillis: Long, floorMillis: Long, overlapMillis: Long): ReadPlan = when {
        lastSyncedMillis <= 0L -> ReadPlan(floorMillis, null)
        lastSyncedMillis > nowMillis + FUTURE_TOLERANCE_MS -> ReadPlan(floorMillis, floorMillis)
        else -> ReadPlan(maxOf(floorMillis, lastSyncedMillis - overlapMillis), null)
    }

    fun encodeReplayMark(epochDay: Long): String = MARK_PREFIX + epochDay

    fun decodeReplayMark(token: String?): Long? =
        token?.takeIf { it.startsWith(MARK_PREFIX) }?.removePrefix(MARK_PREFIX)?.toLongOrNull()

    /** The earliest day owed a replay: stored marks and what this run touched. Null when nothing is owed. */
    fun replayFrom(storedMarks: List<Long?>, sessionEarliestDay: Long?): Long? =
        (storedMarks + sessionEarliestDay).filterNotNull().minOrNull()
}
