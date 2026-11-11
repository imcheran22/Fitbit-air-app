package com.apex.athlete.core.network.googlehealth

import com.apex.athlete.core.network.auth.ReauthReason

/**
 * Everything that can go wrong talking to the Google Health API. None of these carry a response
 * body, a URL, a token or a health value, so they are safe to log and to show.
 */
sealed interface GoogleHealthError {
    /** The sign-in is no longer valid (401 after one refresh, or the refresh was refused). */
    data class AuthExpired(val reason: ReauthReason?) : GoogleHealthError

    /**
     * 403. [missingScope] is set when it could be derived: from Google's answer ([scopeInferred]
     * false) or from comparing the granted scopes with the likely ones for the data type
     * ([scopeInferred] true). [reason] is Google's short machine reason, e.g. `SERVICE_DISABLED`.
     */
    data class PermissionDenied(
        val missingScope: String?,
        val scopeInferred: Boolean,
        val candidateScopes: List<String>,
        val reason: String?,
    ) : GoogleHealthError

    /** 429, or the local budget is exhausted. Try again after [retryAfterMillis] if known. */
    data class RateLimited(val retryAfterMillis: Long?) : GoogleHealthError

    data class ServerError(val httpCode: Int, val attempts: Int) : GoogleHealthError

    /** No connection, DNS failure, timeout or a connection cut mid-body, after [attempts] tries. */
    data class Network(val attempts: Int) : GoogleHealthError

    /** 400-class answer that is not 401/403/404/429: usually a malformed filter. */
    data class BadRequest(val httpCode: Int, val status: String?) : GoogleHealthError

    /** The body was not valid JSON of the expected shape. Counts only; never the body. */
    data class ParseFailure(val itemsParsed: Int, val itemsDropped: Int, val bodyBytes: Int) : GoogleHealthError

    data class Unexpected(val httpCode: Int) : GoogleHealthError

    /** No OAuth client ID has been configured. */
    data object NotConfigured : GoogleHealthError

    /** Short description that is safe to log. */
    fun describe(): String = when (this) {
        is AuthExpired -> "auth expired"
        is PermissionDenied -> "permission denied" + (missingScope?.let { " (scope ${it.substringAfterLast('/')})" } ?: "")
        is RateLimited -> "rate limited"
        is ServerError -> "server error $httpCode after $attempts attempts"
        is Network -> "network failure after $attempts attempts"
        is BadRequest -> "bad request $httpCode"
        is ParseFailure -> "parse failure ($itemsParsed parsed, $itemsDropped dropped)"
        is Unexpected -> "unexpected status $httpCode"
        NotConfigured -> "not configured"
    }
}

/** Exception form of [GoogleHealthError] for callers that prefer to throw. */
class GoogleHealthException(val error: GoogleHealthError) : Exception(error.describe())

/** Outcome of an API call. [NoData] (404 or an empty answer) is not an error. */
sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>
    data object NoData : ApiResult<Nothing>
    data class Failure(val error: GoogleHealthError) : ApiResult<Nothing>

    fun valueOrNull(): T? = (this as? Success)?.value

    /** The value, or null for [NoData]; throws [GoogleHealthException] for a failure. */
    fun getOrThrow(): T? = when (this) {
        is Success -> value
        NoData -> null
        is Failure -> throw GoogleHealthException(error)
    }
}

/** Why a paginated read stopped. */
enum class PageStopReason {
    /** The server returned no further page token. */
    COMPLETE,

    /** The server repeated a page token that was already used; stopped to avoid an endless loop. */
    REPEATED_TOKEN,

    /** The configured page cap was reached. */
    PAGE_CAP,

    /** A later page answered 404; treated as the end of the data. */
    PAGE_NOT_FOUND,
}

/** Totals of a paginated read. Pages are handed to the caller as they arrive. */
data class PageReadSummary(
    val pages: Int,
    val dataPoints: Int,
    val malformedDropped: Int,
    val stopReason: PageStopReason,
)
