package ai.synheart.wear.internal

/**
 * Rate limit for one kind of real-time read.
 *
 * [tryAcquire] returns true when at least [minIntervalMs] have passed since the
 * last acquired read (or none has happened yet) and records [nowMs] as that
 * read. Streaming ticks in between are skipped rather than answered from a
 * cache: a repeated sample would reach consumers with a stale timestamp and be
 * counted twice.
 */
internal class RealtimeReadGate(
    private val minIntervalMs: Long,
) {
    private var lastReadAtMs: Long? = null

    @Synchronized
    fun tryAcquire(nowMs: Long): Boolean {
        val last = lastReadAtMs
        if (last != null && nowMs - last < minIntervalMs) return false
        lastReadAtMs = nowMs
        return true
    }
}
