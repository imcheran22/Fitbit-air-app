package com.apex.athlete.core.data.sync

import com.apex.athlete.core.data.model.IngestCounts
import com.apex.athlete.core.data.source.HealthSource
import com.apex.athlete.core.data.source.SourceAuthExpiredException
import com.apex.athlete.core.data.source.SourceAvailability
import com.apex.athlete.core.data.source.SourcePermissionException
import com.apex.athlete.core.data.source.SourceRateLimitedException
import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.database.entity.SyncWatermarkEntity
import com.apex.athlete.core.domain.SyncSource
import com.apex.athlete.core.domain.SyncStatus
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

enum class StreamOutcome { UP_TO_DATE, SYNCED, PARTIAL, PERMISSION_MISSING, RATE_LIMITED, AUTH_EXPIRED, FAILED }

data class StreamReport(val source: SyncSource, val stream: String, val outcome: StreamOutcome, val windows: Int)

data class SyncReport(
    val startedAtMillis: Long,
    val finishedAtMillis: Long,
    val skippedSources: Map<SyncSource, SourceAvailability>,
    val streams: List<StreamReport>,
    val counts: IngestCounts,
    val recomputedDays: Int,
) {
    val anySuccess: Boolean get() = streams.any { it.outcome == StreamOutcome.SYNCED || it.outcome == StreamOutcome.UP_TO_DATE }
    val needsSignIn: Boolean get() = streams.any { it.outcome == StreamOutcome.AUTH_EXPIRED }
}

/**
 * Pulls every live source (Google Health API, Health Connect) forward from its watermarks, writes
 * through the reconciling ingestor, then recomputes every day whose inputs changed and all later
 * days that build on them.
 *
 * Each (source, stream) keeps its own watermark. A stream is walked in bounded windows and the
 * watermark advances only after a window has been committed, so an interrupted run resumes where
 * it stopped and re-running a window is harmless (writes are idempotent upserts). Each run re-reads
 * a short overlap before the watermark, because sources revise recent data (sleep stages are
 * scored hours after waking, the band uploads late).
 *
 * The Takeout archive is the third source; it is user-initiated and runs through
 * `TakeoutZipImporter`, sharing the same ingestor, mutex and replay.
 */
class TriSourceSyncOrchestrator(
    private val sources: List<HealthSource>,
    private val writeMutex: Mutex,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val config: Config = Config(),
) {
    data class Config(
        /** How far back the first sync reaches. */
        val backfillDays: Int = 90,
        /** Re-read this much before the watermark on every run to pick up revised data. */
        val overlapMillis: Long = 36L * 60 * 60 * 1000,
        /** Upper bound of windows per stream in one run; the rest continues on the next run. */
        val maxWindowsPerStream: Int = Int.MAX_VALUE,
    )

    suspend fun sync(store: ActiveStore, onProgress: suspend (String) -> Unit = {}): SyncReport = writeMutex.withLock {
        check(!store.isDemo) { "Live sources never write into the demo store" }
        val started = nowMillis()
        val session = store.ingestor.newSession()
        val skipped = LinkedHashMap<SyncSource, SourceAvailability>()
        val reports = ArrayList<StreamReport>()
        val dao = store.db.syncWatermarkDao()

        for (source in sources) {
            val availability = source.availability()
            if (availability != SourceAvailability.Ready) {
                skipped[source.source] = availability
                continue
            }
            var stopSource: StreamOutcome? = null
            for (stream in source.streams) {
                if (stopSource != null) {
                    reports += StreamReport(source.source, stream.name, stopSource, 0)
                    continue
                }
                onProgress("${source.source.storageKey}:${stream.name}")
                dao.insertIfAbsent(SyncWatermarkEntity(source.source, stream.name))
                val mark = dao.get(source.source, stream.name)!!
                val end = nowMillis()
                val floor = end - config.backfillDays * DAY_MS
                var from = if (mark.lastSyncedEpochMillis <= 0L) floor else maxOf(floor, mark.lastSyncedEpochMillis - config.overlapMillis)
                if (mark.lastSyncedEpochMillis <= 0L) dao.extendBackfillFloor(source.source, stream.name, floor)

                var windows = 0
                var outcome = StreamOutcome.UP_TO_DATE
                try {
                    while (from < end && windows < config.maxWindowsPerStream) {
                        val to = minOf(end, from + stream.maxWindowMillis)
                        source.pull(stream, from, to) { batch -> store.ingestor.ingest(batch, session) }
                        // The window is committed; only now may the watermark move.
                        dao.advance(source.source, stream.name, to, null, SyncStatus.SUCCESS, nowMillis())
                        from = to
                        windows++
                        outcome = StreamOutcome.SYNCED
                    }
                    if (from < end) {
                        outcome = StreamOutcome.PARTIAL
                        dao.advance(source.source, stream.name, from, null, SyncStatus.PARTIAL, nowMillis())
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: SourcePermissionException) {
                    outcome = StreamOutcome.PERMISSION_MISSING
                    dao.recordFailure(source.source, stream.name, SyncStatus.PERMISSION_MISSING, "permission", nowMillis())
                } catch (e: SourceRateLimitedException) {
                    outcome = StreamOutcome.RATE_LIMITED
                    stopSource = StreamOutcome.RATE_LIMITED
                    dao.recordFailure(source.source, stream.name, SyncStatus.PARTIAL, "rate_limited", nowMillis())
                } catch (e: SourceAuthExpiredException) {
                    outcome = StreamOutcome.AUTH_EXPIRED
                    stopSource = StreamOutcome.AUTH_EXPIRED
                    dao.recordFailure(source.source, stream.name, SyncStatus.FAILED, "sign_in_expired", nowMillis())
                } catch (e: Exception) {
                    // Only the exception type is recorded: messages can carry URLs or payload fragments.
                    outcome = StreamOutcome.FAILED
                    dao.recordFailure(source.source, stream.name, SyncStatus.FAILED, e.javaClass.simpleName, nowMillis())
                }
                reports += StreamReport(source.source, stream.name, outcome, windows)
            }
        }

        val earliest = session.earliestAffectedDay
        val recomputed = if (earliest != null) store.pipeline.replay(earliest, store.pipeline.today()) else 0
        SyncReport(started, nowMillis(), skipped, reports, session.counts, recomputed)
    }

    private companion object {
        const val DAY_MS = 24L * 60 * 60 * 1000
    }
}
