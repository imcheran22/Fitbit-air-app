package com.apex.athlete.core.data.ingest

/**
 * The heart-rate minutes one run has already written, so a later batch holding more samples of the same
 * minute is merged into it instead of replacing it.
 *
 * Only minutes near the latest chunk are remembered: sources deliver in time order, so a split minute
 * is always close to the chunk being written. After each chunk everything more than [windowMs] away
 * from it is dropped, and a hard cap of [MAX_TRACKED] covers out-of-order input. Forgetting a minute
 * only means a split minute re-delivered far apart in time is replaced, not merged.
 */
internal class MinuteLedger(private val windowMs: Long = 60 * 60_000L) {
    private val minutes = HashSet<Long>()

    val size: Int get() = minutes.size

    operator fun contains(minute: Long): Boolean = minute in minutes

    /** Records a committed chunk (ascending minute starts) and forgets minutes far from it. */
    fun recordChunk(chunk: List<Long>) {
        if (chunk.isEmpty()) return
        minutes.addAll(chunk)
        val lo = chunk.first() - windowMs
        val hi = chunk.last() + windowMs
        minutes.removeAll { it < lo || it > hi }
        if (minutes.size > MAX_TRACKED) {
            minutes.clear()
            minutes.addAll(chunk)
        }
    }

    companion object {
        const val MAX_TRACKED = 10_000
    }
}
