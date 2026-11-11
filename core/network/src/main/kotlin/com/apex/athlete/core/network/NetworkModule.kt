package com.apex.athlete.core.network

import com.apex.athlete.core.network.auth.AuthConfigState
import com.apex.athlete.core.network.auth.AuthState
import com.apex.athlete.core.network.auth.BearerTokenInterceptor
import com.apex.athlete.core.network.auth.GoogleHealthAuthConfig
import com.apex.athlete.core.network.auth.OAuthProviderConfig
import com.apex.athlete.core.network.auth.PendingAuthorizationStore
import com.apex.athlete.core.network.auth.PkceManager
import com.apex.athlete.core.network.auth.TokenRefreshAuthenticator
import com.apex.athlete.core.network.auth.TokenRefresher
import com.apex.athlete.core.network.auth.TokenStore
import com.apex.athlete.core.network.googlehealth.GoogleHealthApiClient
import com.apex.athlete.core.network.googlehealth.GoogleHealthClientConfig
import com.apex.athlete.core.network.rate.RateLimitConfig
import com.apex.athlete.core.network.rate.RateLimitTracker
import kotlinx.coroutines.flow.Flow
import okhttp3.OkHttpClient
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.util.concurrent.TimeUnit

/** The wired-up network stack for Google Health, or the reason there is none. */
sealed interface GoogleHealthNetwork {
    /** No OAuth client ID in the build. The UI should explain how to set one up. */
    data object NotConfigured : GoogleHealthNetwork

    class Ready internal constructor(
        val config: OAuthProviderConfig,
        /** Start sign-in, handle the redirect, sign out. */
        val pkce: PkceManager,
        val client: GoogleHealthApiClient,
        val rateLimiter: RateLimitTracker,
        val authState: Flow<AuthState>,
    ) : GoogleHealthNetwork
}

/**
 * Builds the network stack from the build's client ID. Used once by `:app` dependency injection.
 *
 * Two OkHttp clients are made from the same base: the token client (no auth, talks to Google's
 * OAuth endpoints) and the API client (bearer interceptor plus 401 authenticator, talks to the API
 * host only). There is deliberately no HTTP logging interceptor.
 */
object NetworkModule {
    fun create(
        clientId: String?,
        tokenStore: TokenStore,
        pendingStore: PendingAuthorizationStore,
        baseHttpClient: OkHttpClient = defaultHttpClient(),
        rateLimitConfig: RateLimitConfig = RateLimitConfig(),
        clientConfig: GoogleHealthClientConfig = GoogleHealthClientConfig(),
        clock: NetClock = NetClock.System,
        jitter: JitterSource = JitterSource.Secure,
        sleeper: Sleeper = Sleeper.Real,
    ): GoogleHealthNetwork {
        val config = when (val state = GoogleHealthAuthConfig.create(clientId)) {
            AuthConfigState.NotConfigured -> return GoogleHealthNetwork.NotConfigured
            is AuthConfigState.Configured -> state.config
        }
        val pkce = PkceManager(config, baseHttpClient, pendingStore, tokenStore, clock)
        val refresher = TokenRefresher(pkce, tokenStore, config.clientId, clock)
        val apiHost = clientConfig.baseUrl.toHttpUrl().host
        val hosts = setOf(apiHost)
        val apiHttp = baseHttpClient.newBuilder()
            .addInterceptor(BearerTokenInterceptor(refresher, hosts))
            .authenticator(TokenRefreshAuthenticator(refresher, hosts))
            .build()
        val limiter = RateLimitTracker(rateLimitConfig, clock, jitter)
        val client = GoogleHealthApiClient(apiHttp, tokenStore, limiter, clientConfig, sleeper)
        return GoogleHealthNetwork.Ready(config, pkce, client, limiter, tokenStore.authState)
    }

    /** HTTPS only, sensible timeouts, no cache of responses to disk, no logging. */
    fun defaultHttpClient(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .callTimeout(90, TimeUnit.SECONDS)
        .followRedirects(false)
        .followSslRedirects(false)
        .build()
}
