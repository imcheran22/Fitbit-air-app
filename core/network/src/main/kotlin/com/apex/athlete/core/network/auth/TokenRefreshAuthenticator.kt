package com.apex.athlete.core.network.auth

import com.apex.athlete.core.network.NetClock
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import java.io.IOException

/** The owner has to sign in again; thrown out of the OkHttp chain and mapped by the API client. */
class ReauthRequiredException(val reason: ReauthReason?) : IOException("sign-in required")

/** Renewing the access token failed for a reason that says nothing about the sign-in itself (offline, 5xx). */
class TokenRefreshFailedException : IOException("token refresh failed")

/**
 * Owns every decision about the saved access token.
 *
 * Refreshing is single-flight: all callers go through one lock, and a caller that gets the lock
 * first re-reads the store, so threads that were waiting reuse the token the first one obtained and
 * exactly one request goes to the token endpoint.
 */
class TokenRefresher(
    private val pkce: PkceManager,
    private val store: TokenStore,
    private val clientId: String,
    private val clock: NetClock = NetClock.System,
    /** An access token that expires within this window is renewed before use. */
    private val refreshSkewMillis: Long = DEFAULT_SKEW_MILLIS,
) {
    private val lock = Any()

    /** Returns a usable access token, renewing it first if it is about to expire. */
    @Throws(IOException::class)
    fun validAccessToken(): String = synchronized(lock) {
        val tokens = loadOrFail()
        if (tokens.expiresAtMillis - clock.nowMillis() > refreshSkewMillis) return tokens.accessToken
        refreshLocked(tokens)
    }

    /**
     * Called after a 401. [rejectedAccessToken] is the token the failed request carried. When the
     * store already holds a different, unexpired token another caller refreshed it; use that.
     */
    @Throws(IOException::class)
    fun refreshAfterRejection(rejectedAccessToken: String?): String = synchronized(lock) {
        val tokens = loadOrFail()
        if (rejectedAccessToken != null && tokens.accessToken != rejectedAccessToken &&
            tokens.expiresAtMillis > clock.nowMillis()
        ) {
            return tokens.accessToken
        }
        refreshLocked(tokens)
    }

    /** A freshly renewed token was refused too; stop and ask for a new sign-in. */
    fun reportRejectedAfterRefresh() {
        synchronized(lock) { store.markNeedsReauth(ReauthReason.ACCESS_REJECTED) }
    }

    private fun loadOrFail(): StoredTokens {
        val tokens = store.load()
        if (tokens == null) {
            val reason = (store.currentState() as? AuthState.NeedsReauth)?.reason
            throw ReauthRequiredException(reason)
        }
        if (tokens.clientId != clientId) {
            store.markNeedsReauth(ReauthReason.CLIENT_CHANGED)
            throw ReauthRequiredException(ReauthReason.CLIENT_CHANGED)
        }
        return tokens
    }

    private fun refreshLocked(current: StoredTokens): String {
        return when (val outcome = pkce.refreshBlocking(current)) {
            is RefreshOutcome.Refreshed -> {
                store.save(outcome.tokens)
                outcome.tokens.accessToken
            }
            RefreshOutcome.NoRefreshToken -> fail(ReauthReason.NO_REFRESH_TOKEN)
            RefreshOutcome.InvalidGrant -> fail(ReauthReason.REFRESH_TOKEN_REJECTED)
            is RefreshOutcome.ClientRejected -> fail(ReauthReason.CLIENT_REJECTED)
            // Unknown rejections and transient problems must not wipe a possibly good sign-in.
            is RefreshOutcome.Rejected, is RefreshOutcome.Transient -> throw TokenRefreshFailedException()
        }
    }

    private fun fail(reason: ReauthReason): Nothing {
        store.markNeedsReauth(reason)
        throw ReauthRequiredException(reason)
    }

    companion object {
        const val DEFAULT_SKEW_MILLIS = 60_000L
    }
}

/** Adds `Authorization: Bearer` to requests for [allowedHosts] only, so the token never goes elsewhere. */
class BearerTokenInterceptor(
    private val refresher: TokenRefresher,
    private val allowedHosts: Set<String>,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.url.host !in allowedHosts) return chain.proceed(request)
        val token = refresher.validAccessToken()
        return chain.proceed(request.newBuilder().header("Authorization", "Bearer $token").build())
    }
}

/**
 * Handles 401: renews the token once (single-flight) and retries the request. A second 401 on the
 * retried request ends the attempt, so there is never a refresh loop.
 */
class TokenRefreshAuthenticator(
    private val refresher: TokenRefresher,
    private val allowedHosts: Set<String>,
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.url.host !in allowedHosts) return null
        if (priorResponseCount(response) >= 2) {
            refresher.reportRejectedAfterRefresh()
            return null
        }
        val used = response.request.header("Authorization")?.removePrefix("Bearer ")?.trim()
        val token = try {
            refresher.refreshAfterRejection(used)
        } catch (_: ReauthRequiredException) {
            return null // the 401 is passed on; the store already says "needs sign-in"
        }
        return response.request.newBuilder().header("Authorization", "Bearer $token").build()
    }

    private fun priorResponseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
