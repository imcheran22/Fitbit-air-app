package com.apex.athlete.core.network.rate

import com.apex.athlete.core.network.JitterSource
import com.apex.athlete.core.network.NetClock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.Headers
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.ArrayDeque

enum class RequestPriority {
    /** The owner is waiting (pull to refresh, opening a screen). May use the reserved part of the budget. */
    FOREGROUND,

    /** Scheduled sync and backfill. Leaves the reserve alone. */
    BACKGROUND,
}

/**
 * Budget and back-off settings.
 *
 * The Google Health discovery document publishes no quota, so [maxRequestsPerWindow] is a cautious
 * local assumption (the retired Fitbit Web API allowed 150 per hour), not a documented limit. Any
 * rate-limit headers the server does send take precedence over it.
 */
data class RateLimitConfig(
    val windowMillis: Long = 60 * 60 * 1000L,
    val maxRequestsPerWindow: Int = 150,
    /** Requests kept back for foreground use; background callers wait once only this many remain. */
    val foregroundReserve: Int = 20,
    val baseBackoffMillis: Long = 1_000L,
    val maxBackoffMillis: Long = 60_000L,
) {
    init {
        require(windowMillis > 0 && maxRequestsPerWindow > 0)
        require(foregroundReserve in 0 until maxRequestsPerWindow)
        require(baseBackoffMillis > 0 && maxBackoffMillis >= baseBackoffMillis)
    }
}

/** What the UI shows about the request budget. Null means "not known yet". */
data class RateLimitState(
    val limit: Int?,
    val remaining: Int?,
    /** Epoch millis at which the budget refills, if known. */
    val resetAtMillis: Long?,
    /** Epoch millis until which all requests are paused after a 429, if any. */
    val blockedUntilMillis: Long?,
    /** True when [remaining] came from response headers rather than local counting. */
    val reportedByServer: Boolean,
)

sealed interface BudgetDecision {
    /** The request may be sent now; it has been counted. */
    data object Granted : BudgetDecision

    /** The request must wait [millis] before it may be sent. Nothing was counted. */
    data class Wait(val millis: Long) : BudgetDecision
}

/**
 * One request budget shared by every call to the provider.
 *
 * It counts requests in a sliding window, reserves part of the budget for the foreground, pauses
 * everyone after a 429, reads rate-limit and `Retry-After` headers, and computes exponential
 * back-off with full jitter. The clock and the random source are injected for tests.
 */
class RateLimitTracker(
    val config: RateLimitConfig = RateLimitConfig(),
    private val clock: NetClock = NetClock.System,
    private val jitter: JitterSource = JitterSource.Secure,
) {
    private val lock = Any()
    private val issued = ArrayDeque<Long>()
    private var blockedUntil: Long? = null
    private var serverLimit: Int? = null
    private var serverRemaining: Int? = null
    private var serverResetAt: Long? = null
    private val mutableState = MutableStateFlow(RateLimitState(config.maxRequestsPerWindow, config.maxRequestsPerWindow, null, null, false))

    val state: StateFlow<RateLimitState> = mutableState.asStateFlow()

    /** Asks for permission to send one request. */
    fun tryAcquire(priority: RequestPriority): BudgetDecision = synchronized(lock) {
        val now = clock.nowMillis()
        prune(now)
        blockedUntil?.let { if (it > now) return BudgetDecision.Wait(it - now) }
        val remaining = effectiveRemaining(now)
        val floor = if (priority == RequestPriority.BACKGROUND) config.foregroundReserve else 0
        if (remaining <= floor) {
            return BudgetDecision.Wait(untilRefill(now).coerceAtLeast(1L))
        }
        issued.addLast(now)
        serverRemaining = serverRemaining?.let { (it - 1).coerceAtLeast(0) }
        publish(now)
        BudgetDecision.Granted
    }

    /** Reads rate-limit headers from any response. Safe to call for every response. */
    fun onResponse(headers: Headers) {
        val remaining = headerLong(headers, REMAINING_HEADERS)
        val limit = headerLong(headers, LIMIT_HEADERS)
        val reset = headerLong(headers, RESET_HEADERS)
        if (remaining == null && limit == null && reset == null) return
        synchronized(lock) {
            val now = clock.nowMillis()
            if (remaining != null) serverRemaining = remaining.coerceIn(0, Int.MAX_VALUE.toLong()).toInt()
            if (limit != null) serverLimit = limit.coerceIn(1, Int.MAX_VALUE.toLong()).toInt()
            if (reset != null) serverResetAt = resetToEpochMillis(reset, now)
            publish(now)
        }
    }

    /** Records a 429 so that every caller pauses, not only the one that saw it. */
    fun onRateLimited(retryAfterMillis: Long?) = synchronized(lock) {
        val now = clock.nowMillis()
        val pause = (retryAfterMillis ?: config.baseBackoffMillis).coerceIn(0, MAX_PAUSE_MILLIS)
        blockedUntil = maxOf(blockedUntil ?: 0L, now + pause)
        publish(now)
    }

    /**
     * Delay before retry number [attempt] (0 for the first retry): a uniformly random value between 0
     * and `min(max, base * 2^attempt)` (full jitter), but never less than a server's [retryAfterMillis].
     */
    fun backoffMillis(attempt: Int, retryAfterMillis: Long? = null): Long {
        val exponent = attempt.coerceIn(0, 30)
        val ceiling = minOf(config.maxBackoffMillis, config.baseBackoffMillis shl exponent).coerceAtLeast(config.baseBackoffMillis)
        val jittered = (jitter.nextDouble().coerceIn(0.0, 1.0) * ceiling).toLong()
        return maxOf(jittered, retryAfterMillis ?: 0L)
    }

    /** Parses a `Retry-After` header: whole seconds or an HTTP-date. Returns millis, or null if unusable. */
    fun parseRetryAfter(value: String?): Long? = parseRetryAfter(value, clock.nowMillis())

    private fun effectiveRemaining(now: Long): Int {
        val local = (config.maxRequestsPerWindow - issued.size).coerceAtLeast(0)
        val reportedAt = serverResetAt
        if (reportedAt != null && reportedAt <= now) {
            // The server's window has rolled over; what it told us is stale.
            serverRemaining = null
            serverResetAt = null
        }
        val reported = serverRemaining
        return if (reported != null) minOf(local, reported) else local
    }

    private fun untilRefill(now: Long): Long {
        val serverWait = serverResetAt?.takeIf { it > now && serverRemaining != null }?.let { it - now }
        val localWait = issued.peekFirst()?.let { it + config.windowMillis - now }
        return when {
            serverWait != null && serverRemaining == 0 -> serverWait
            serverWait != null && localWait != null -> minOf(serverWait, localWait)
            else -> serverWait ?: localWait ?: config.baseBackoffMillis
        }
    }

    private fun prune(now: Long) {
        // Entries from the future (the clock moved back) are dropped as well as expired ones.
        while (issued.isNotEmpty() && (now - issued.peekFirst() >= config.windowMillis || issued.peekFirst() > now)) {
            issued.removeFirst()
        }
        if (blockedUntil?.let { it <= now } == true) blockedUntil = null
    }

    private fun publish(now: Long) {
        prune(now)
        val remaining = effectiveRemaining(now)
        val reportedByServer = serverRemaining?.let { it <= config.maxRequestsPerWindow - issued.size } == true
        mutableState.value = RateLimitState(
            limit = serverLimit ?: config.maxRequestsPerWindow,
            remaining = remaining,
            resetAtMillis = serverResetAt?.takeIf { it > now } ?: issued.peekFirst()?.let { it + config.windowMillis },
            blockedUntilMillis = blockedUntil,
            reportedByServer = reportedByServer,
        )
    }

    companion object {
        private val REMAINING_HEADERS = listOf("RateLimit-Remaining", "X-RateLimit-Remaining", "Fitbit-Rate-Limit-Remaining")
        private val LIMIT_HEADERS = listOf("RateLimit-Limit", "X-RateLimit-Limit", "Fitbit-Rate-Limit-Limit")
        private val RESET_HEADERS = listOf("RateLimit-Reset", "X-RateLimit-Reset", "Fitbit-Rate-Limit-Reset")
        private const val MAX_PAUSE_MILLIS = 24 * 60 * 60 * 1000L
        private const val EPOCH_SECONDS_THRESHOLD = 1_000_000_000L

        private fun headerLong(headers: Headers, names: List<String>): Long? {
            for (name in names) {
                val v = headers[name]?.trim()?.toLongOrNull()
                if (v != null && v >= 0) return v
            }
            return null
        }

        /**
         * Reset headers differ between servers: seconds until reset (IETF draft, Fitbit) or an epoch
         * timestamp in seconds (many others). Values above 10^9 are treated as epoch seconds.
         */
        internal fun resetToEpochMillis(value: Long, now: Long): Long =
            if (value > EPOCH_SECONDS_THRESHOLD) value * 1000L else now + value * 1000L

        fun parseRetryAfter(value: String?, nowMillis: Long): Long? {
            val text = value?.trim().orEmpty()
            if (text.isEmpty()) return null
            text.toLongOrNull()?.let { return if (it < 0) null else minOf(it, MAX_PAUSE_MILLIS / 1000L) * 1000L }
            return try {
                val at = ZonedDateTime.parse(text, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli()
                (at - nowMillis).coerceIn(0L, MAX_PAUSE_MILLIS)
            } catch (_: DateTimeParseException) {
                null
            }
        }
    }
}
