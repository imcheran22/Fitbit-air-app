package com.apex.athlete.core.data.worker

import com.apex.athlete.core.data.source.SourceAvailability
import com.apex.athlete.core.data.sync.StreamOutcome
import com.apex.athlete.core.data.sync.SyncReport
import com.apex.athlete.core.network.rate.RequestPriority
import java.util.concurrent.atomic.AtomicInteger

/** Stable codes for the result of one sync run. Safe to store and show; no values. */
object SyncCodes {
    const val OK = "ok"
    const val PARTIAL = "partial"
    const val RATE_LIMITED = "rate_limited"
    const val NEEDS_SIGN_IN = "needs_sign_in"
    const val PERMISSION_MISSING = "permission_missing"
    const val NO_SOURCE = "no_source"
    const val NETWORK = "network"
    const val STORE_UNAVAILABLE = "store_unavailable"
    const val FAILED = "failed"
    const val SKIPPED = "skipped"
}

/**
 * What a worker should do after a run.
 * @param success data was (at least partly) brought up to date: the last-sync time moves.
 * @param retry ask WorkManager to run again with back-off (transient failure, attempts left).
 */
data class SyncOutcome(val code: String, val success: Boolean, val retry: Boolean)

/** The last finished run, as persisted by [SyncRunStatusStore]. */
data class LastRun(val code: String, val atMillis: Long, val succeeded: Boolean)

/** Pure decisions of the sync worker, kept apart from WorkManager so they can be tested on the JVM. */
object SyncOutcomes {
    const val MAX_ATTEMPTS = 3

    /**
     * Maps a [SyncReport] to a [SyncOutcome].
     * - Expired sign-in: not retried (retrying cannot help); the owner is asked to sign in again.
     * - Rate limited: not retried now (the budget refills; the next period continues from the watermark).
     * - Failed streams (network, server): retried with back-off up to [MAX_ATTEMPTS] runs, then reported as partial or failed.
     * - Missing permissions: reported, never retried.
     */
    fun classify(report: SyncReport, attempt: Int): SyncOutcome {
        val outcomes = report.streams.map { it.outcome }
        val expired = report.needsSignIn || report.skippedSources.values.any {
            it == SourceAvailability.NeedsAction(SourceAvailability.Reason.SIGN_IN_EXPIRED)
        }
        val success = report.anySuccess
        val failed = outcomes.any { it == StreamOutcome.FAILED }
        val canRetry = attempt + 1 < MAX_ATTEMPTS
        return when {
            expired -> SyncOutcome(SyncCodes.NEEDS_SIGN_IN, success, retry = false)
            failed && canRetry -> SyncOutcome(if (success) SyncCodes.PARTIAL else SyncCodes.NETWORK, success, retry = true)
            failed -> SyncOutcome(if (success) SyncCodes.PARTIAL else SyncCodes.NETWORK, success, retry = false)
            outcomes.any { it == StreamOutcome.RATE_LIMITED } -> SyncOutcome(SyncCodes.RATE_LIMITED, success, retry = false)
            outcomes.isEmpty() -> SyncOutcome(SyncCodes.NO_SOURCE, success = false, retry = false)
            outcomes.any { it == StreamOutcome.PARTIAL } -> SyncOutcome(SyncCodes.PARTIAL, success, retry = false)
            outcomes.any { it == StreamOutcome.PERMISSION_MISSING } ->
                SyncOutcome(if (success) SyncCodes.PARTIAL else SyncCodes.PERMISSION_MISSING, success, retry = false)
            else -> SyncOutcome(SyncCodes.OK, success, retry = false)
        }
    }

    /** The state shown for the combination of "a run is in progress" and the last finished run. */
    fun stateFor(running: Boolean, last: LastRun?): SyncRunState = when {
        running -> SyncRunState.Running
        last == null -> SyncRunState.Idle
        last.code == SyncCodes.NEEDS_SIGN_IN -> SyncRunState.NeedsSignIn
        last.succeeded -> SyncRunState.Succeeded(last.atMillis)
        else -> SyncRunState.Failed(last.code)
    }
}

/**
 * Whether the run in progress was started by the owner. The Google source is built by the app container
 * with `priority = SyncRunContext::currentPriority`, so an expedited (owner-started) run may use the
 * budget reserved for the foreground while scheduled runs leave it alone.
 */
object SyncRunContext {
    private val foregroundRuns = AtomicInteger(0)

    fun currentPriority(): RequestPriority =
        if (foregroundRuns.get() > 0) RequestPriority.FOREGROUND else RequestPriority.BACKGROUND

    suspend fun <T> withPriority(foreground: Boolean, block: suspend () -> T): T {
        if (foreground) foregroundRuns.incrementAndGet()
        try {
            return block()
        } finally {
            if (foreground) foregroundRuns.decrementAndGet()
        }
    }
}
