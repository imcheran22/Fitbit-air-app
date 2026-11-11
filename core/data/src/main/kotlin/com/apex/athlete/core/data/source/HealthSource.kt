package com.apex.athlete.core.data.source

import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.domain.SyncSource

/** Whether a source can be read right now, and if not, why, in a form the screens can explain. */
sealed interface SourceAvailability {
    data object Ready : SourceAvailability

    /** The owner has not connected or permitted it yet. */
    data class NeedsAction(val reason: Reason) : SourceAvailability

    /** It cannot work on this phone or account at all. */
    data class Unavailable(val reason: Reason) : SourceAvailability

    enum class Reason {
        NOT_SIGNED_IN, SIGN_IN_EXPIRED, NO_CLIENT_ID,
        HEALTH_CONNECT_NOT_INSTALLED, HEALTH_CONNECT_UPDATE_REQUIRED, PERMISSIONS_MISSING,
    }
}

/** A named stream inside a source, with its own watermark (for example "heart-rate" or "sleep"). */
data class SourceStream(
    val name: String,
    /** Largest span one request may cover. */
    val maxWindowMillis: Long,
)

/** Thrown by a source when the stream needs a permission or scope the owner has not granted. */
class SourcePermissionException(val stream: String, message: String) : Exception(message)

/** Thrown when the source asked us to slow down; the orchestrator stops the run and resumes later. */
class SourceRateLimitedException(val retryAfterMillis: Long?) : Exception("rate limited")

/** Thrown when the sign-in is no longer valid and the owner has to sign in again. Local data is untouched. */
class SourceAuthExpiredException : Exception("sign-in expired")

/**
 * A place data is pulled from. Implementations only read and convert; they never write to the
 * database and never write anything back to the source.
 */
interface HealthSource {
    val source: SyncSource
    val streams: List<SourceStream>

    suspend fun availability(): SourceAvailability

    /**
     * Reads one stream for the half-open interval [fromMillis, toMillis) and hands the records to
     * [emit] in bounded batches. Returning normally means the whole interval was delivered.
     */
    suspend fun pull(stream: SourceStream, fromMillis: Long, toMillis: Long, emit: suspend (HealthBatch) -> Unit)
}
