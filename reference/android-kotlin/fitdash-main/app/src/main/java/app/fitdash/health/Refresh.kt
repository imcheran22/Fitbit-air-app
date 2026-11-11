package app.fitdash.health

import app.fitdash.metrics.Tuning
import java.time.Duration
import java.time.Instant
import java.time.ZonedDateTime

data class ReadProgress(val done: Int, val total: Int, val label: String) {
    val fraction: Float get() = done.toFloat() / total
}

data class ReadResult(val snapshot: HealthSnapshot, val full: Boolean)

// One read on top of what is cached, shared by the dashboard and the background worker.
// Incremental: re-read from two days before the last read so late wearable syncs are caught, and lay it over the cache.
// Full: nothing cached, FULL_READ_HOURS since the last full read, or the window changed (history granted or revoked).
suspend fun readFresh(source: HealthSource, base: HealthSnapshot?, lastRead: Instant?, lastFullRead: Instant?, now: ZonedDateTime, onProgress: (ReadProgress) -> Unit = {}): ReadResult {
    val fullDue = base == null || lastFullRead?.let { Duration.between(it, now.toInstant()) > Duration.ofHours(Tuning.FULL_READ_HOURS) } ?: true
    val cutoff = if (fullDue) null else lastRead?.let { it.atZone(now.zone).toLocalDate().minusDays(Tuning.REREAD_DAYS).atStartOfDay(now.zone).toInstant() }
    val fresh = source.read(now, cutoff, onProgress)
    if (cutoff == null || base == null) return ReadResult(fresh, full = true)
    if (fresh.windowDays != base.windowDays) return ReadResult(source.read(now, null, onProgress), full = true)
    return ReadResult(base.mergedWith(fresh, cutoff, now), full = false)
}
