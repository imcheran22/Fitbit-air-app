package com.apex.athlete.core.network

import com.apex.athlete.core.network.auth.BearerTokenInterceptor
import com.apex.athlete.core.network.auth.InMemoryTokenStore
import com.apex.athlete.core.network.auth.OAuthProviderConfig
import com.apex.athlete.core.network.auth.PkceManager
import com.apex.athlete.core.network.auth.StoredTokens
import com.apex.athlete.core.network.auth.TokenRefreshAuthenticator
import com.apex.athlete.core.network.auth.TokenRefresher
import com.apex.athlete.core.network.googlehealth.GoogleHealthApiClient
import com.apex.athlete.core.network.googlehealth.GoogleHealthClientConfig
import com.apex.athlete.core.network.rate.RateLimitConfig
import com.apex.athlete.core.network.rate.RateLimitTracker
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

class FakeClock(start: Long = 1_800_000_000_000L) : NetClock {
    private val now = AtomicLong(start)
    override fun nowMillis(): Long = now.get()
    fun advance(millis: Long) { now.addAndGet(millis) }
}

class FixedJitter(var value: Double = 0.5) : JitterSource {
    override fun nextDouble(): Double = value
}

/** Records requested sleeps and advances the fake clock instead of waiting. */
class RecordingSleeper(private val clock: FakeClock) : Sleeper {
    val sleeps = CopyOnWriteArrayList<Long>()
    override suspend fun sleep(millis: Long) {
        sleeps += millis
        clock.advance(millis)
    }
}

/** Answers with whatever [handler] returns and remembers every request it saw. */
class ScriptedDispatcher(var handler: (RecordedRequest) -> MockResponse) : Dispatcher() {
    val requests = CopyOnWriteArrayList<RecordedRequest>()
    override fun dispatch(request: RecordedRequest): MockResponse {
        requests += request
        return handler(request)
    }
    fun count(pathPrefix: String) = requests.count { it.path.orEmpty().startsWith(pathPrefix) }
}

fun json(body: String, code: Int = 200): MockResponse =
    MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body)

/** A full stack against a local MockWebServer: token endpoint at /token, API under /v4. */
class TestStack(
    val server: MockWebServer = MockWebServer(),
    val clock: FakeClock = FakeClock(),
    val jitter: FixedJitter = FixedJitter(0.5),
    rateConfig: RateLimitConfig = RateLimitConfig(),
    clientConfig: GoogleHealthClientConfig = GoogleHealthClientConfig(allowInsecureHttp = true),
    signedIn: Boolean = true,
    expiresInMillis: Long = 3_600_000L,
    scopes: Set<String> = setOf("https://www.googleapis.com/auth/googlehealth.sleep.readonly"),
) {
    val dispatcher = ScriptedDispatcher { MockResponse().setResponseCode(500) }
    val store = InMemoryTokenStore()
    val sleeper = RecordingSleeper(clock)
    val limiter = RateLimitTracker(rateConfig, clock, jitter)
    val oauth: OAuthProviderConfig
    val pkce: PkceManager
    val refresher: TokenRefresher
    val http: OkHttpClient
    val client: GoogleHealthApiClient

    init {
        server.dispatcher = dispatcher
        server.start()
        oauth = OAuthProviderConfig(
            providerId = "test",
            clientId = "123-abc.apps.googleusercontent.com",
            authorizationEndpoint = "https://accounts.example.test/auth",
            tokenEndpoint = server.url("/token").toString(),
            revocationEndpoint = server.url("/revoke").toString(),
            scopes = listOf("https://www.googleapis.com/auth/googlehealth.sleep.readonly"),
            redirectUri = "com.googleusercontent.apps.123-abc:/oauth2redirect",
            extraAuthorizationParameters = mapOf("access_type" to "offline"),
        )
        val base = OkHttpClient.Builder().callTimeout(20, TimeUnit.SECONDS).build()
        pkce = PkceManager(oauth, base, store, store, clock)
        refresher = TokenRefresher(pkce, store, oauth.clientId, clock)
        val hosts = setOf(server.hostName)
        http = base.newBuilder()
            .addInterceptor(BearerTokenInterceptor(refresher, hosts))
            .authenticator(TokenRefreshAuthenticator(refresher, hosts))
            .build()
        if (signedIn) {
            store.save(StoredTokens("access-1", "refresh-1", clock.nowMillis() + expiresInMillis, scopes, oauth.clientId))
        }
        client = GoogleHealthApiClient(http, store, limiter, clientConfig.copy(baseUrl = server.url("/").toString()), sleeper)
    }

    fun shutdown() = server.shutdown()

    companion object {
        fun tokenJson(access: String, refresh: String? = null, expiresIn: Long = 3600, scope: String? = null) =
            buildString {
                append("{\"access_token\":\"$access\",\"expires_in\":$expiresIn,\"token_type\":\"Bearer\"")
                if (refresh != null) append(",\"refresh_token\":\"$refresh\"")
                if (scope != null) append(",\"scope\":\"$scope\"")
                append("}")
            }
    }
}
