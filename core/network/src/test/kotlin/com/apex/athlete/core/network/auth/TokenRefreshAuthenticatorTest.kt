package com.apex.athlete.core.network.auth

import com.apex.athlete.core.network.TestStack
import com.apex.athlete.core.network.googlehealth.ApiResult
import com.apex.athlete.core.network.googlehealth.GoogleHealthDataType
import com.apex.athlete.core.network.googlehealth.GoogleHealthError
import com.apex.athlete.core.network.googlehealth.ListRequest
import com.apex.athlete.core.network.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

private const val OK_STEPS = """{"dataPoints":[{"steps":{"count":"10","interval":{"startTime":"2026-11-10T10:00:00Z","endTime":"2026-11-10T10:01:00Z"}}}]}"""

class TokenRefreshAuthenticatorTest {
    private var stack = TestStack()

    @AfterTest fun tearDown() = stack.shutdown()

    private fun steps() = runBlocking { stack.client.listPage(ListRequest(GoogleHealthDataType.STEPS)) }

    @Test
    fun injectsBearerToken() {
        stack.dispatcher.handler = { json(OK_STEPS) }
        assertIs<ApiResult.Success<*>>(steps())
        assertEquals("Bearer access-1", stack.dispatcher.requests.single().getHeader("Authorization"))
    }

    @Test
    fun concurrent401sTriggerExactlyOneRefresh() {
        val tokenCalls = AtomicInteger()
        stack.dispatcher.handler = { req ->
            when {
                req.path == "/token" -> {
                    tokenCalls.incrementAndGet()
                    json(TestStack.tokenJson("access-2", null)).setBodyDelay(300, TimeUnit.MILLISECONDS)
                }
                req.getHeader("Authorization") == "Bearer access-2" -> json(OK_STEPS)
                else -> MockResponse().setResponseCode(401)
            }
        }
        val results = runBlocking {
            (1..8).map { async(Dispatchers.IO) { steps() } }.awaitAll()
        }
        assertTrue(results.all { it is ApiResult.Success<*> }, results.toString())
        assertEquals(1, tokenCalls.get(), "single-flight refresh")
        assertEquals("access-2", stack.store.load()?.accessToken)
        assertEquals("refresh-1", stack.store.load()?.refreshToken)
    }

    @Test
    fun proactiveRefreshHappensBeforeTheTokenExpires() {
        stack.shutdown()
        stack = TestStack(expiresInMillis = 30_000) // inside the 60 s skew
        stack.dispatcher.handler = { req ->
            if (req.path == "/token") json(TestStack.tokenJson("access-2", null)) else json(OK_STEPS)
        }
        assertIs<ApiResult.Success<*>>(steps())
        assertEquals(1, stack.dispatcher.count("/token"))
        val api = stack.dispatcher.requests.single { it.path != "/token" }
        assertEquals("Bearer access-2", api.getHeader("Authorization"))
    }

    @Test
    fun invalidGrantMovesToNeedsReauthWithPlainLanguageAndFailsFastAfterwards() {
        stack.dispatcher.handler = { req ->
            if (req.path == "/token") json("{\"error\":\"invalid_grant\",\"error_description\":\"Token has been expired or revoked.\"}", 400)
            else MockResponse().setResponseCode(401)
        }
        val result = steps()
        val failure = assertIs<ApiResult.Failure>(result)
        assertEquals(GoogleHealthError.AuthExpired(ReauthReason.REFRESH_TOKEN_REJECTED), failure.error)
        val state = assertIs<AuthState.NeedsReauth>(stack.store.currentState())
        assertEquals(ReauthReason.REFRESH_TOKEN_REJECTED, state.reason)
        assertTrue(state.reason.message.contains("7 days") && state.reason.message.contains("Testing"))
        assertTrue(state.reason.message.contains("untouched"))
        assertNull(stack.store.load())

        val before = stack.dispatcher.requests.size
        assertIs<ApiResult.Failure>(steps())
        assertEquals(before, stack.dispatcher.requests.size, "no network once signed out")
    }

    @Test
    fun aFreshTokenThatIsRejectedAgainDoesNotLoop() {
        stack.dispatcher.handler = { req ->
            if (req.path == "/token") json(TestStack.tokenJson("access-2", null)) else MockResponse().setResponseCode(401)
        }
        val failure = assertIs<ApiResult.Failure>(steps())
        assertIs<GoogleHealthError.AuthExpired>(failure.error)
        assertEquals(1, stack.dispatcher.count("/token"))
        assertEquals(2, stack.dispatcher.requests.count { it.path != "/token" })
        assertEquals(AuthState.NeedsReauth(ReauthReason.ACCESS_REJECTED), stack.store.currentState())
    }

    @Test
    fun transientRefreshFailureDoesNotSignTheOwnerOut() {
        stack.shutdown()
        stack = TestStack(expiresInMillis = 1_000)
        stack.dispatcher.handler = { req -> if (req.path == "/token") MockResponse().setResponseCode(503) else json(OK_STEPS) }
        val failure = assertIs<ApiResult.Failure>(steps())
        assertIs<GoogleHealthError.Network>(failure.error)
        assertIs<AuthState.SignedIn>(stack.store.currentState())
        assertNotNull(stack.store.load())
    }

    @Test
    fun tokensIssuedToAnotherClientIdForceANewSignIn() {
        stack.store.save(StoredTokens("a", "r", stack.clock.nowMillis() + 3_600_000, emptySet(), "other-client"))
        stack.dispatcher.handler = { json(OK_STEPS) }
        val failure = assertIs<ApiResult.Failure>(steps())
        assertEquals(GoogleHealthError.AuthExpired(ReauthReason.CLIENT_CHANGED), failure.error)
        assertEquals(0, stack.dispatcher.requests.size)
    }

    @Test
    fun missingRefreshTokenAsksForANewSignIn() {
        stack.store.save(StoredTokens("a", null, stack.clock.nowMillis() - 1, emptySet(), stack.oauth.clientId))
        val failure = assertIs<ApiResult.Failure>(steps())
        assertEquals(GoogleHealthError.AuthExpired(ReauthReason.NO_REFRESH_TOKEN), failure.error)
    }

    @Test
    fun bearerTokenIsNeverSentToOtherHosts() {
        stack.dispatcher.handler = { json("{}") }
        val client = OkHttpClient.Builder()
            .addInterceptor(BearerTokenInterceptor(stack.refresher, setOf("health.googleapis.com")))
            .build()
        client.newCall(Request.Builder().url(stack.server.url("/anything")).build()).execute().close()
        assertNull(stack.dispatcher.requests.single().getHeader("Authorization"))
    }

    @Test
    fun signedOutStateFlowTracksStore() {
        val s = InMemoryTokenStore()
        assertEquals(AuthState.SignedOut, s.currentState())
        s.save(StoredTokens("a", "r", 1, setOf("x"), "c"))
        assertEquals(AuthState.SignedIn(setOf("x")), s.currentState())
        s.markNeedsReauth(ReauthReason.ACCESS_REJECTED)
        assertEquals(AuthState.NeedsReauth(ReauthReason.ACCESS_REJECTED), s.currentState())
        s.clear()
        assertEquals(AuthState.SignedOut, s.currentState())
    }
}
