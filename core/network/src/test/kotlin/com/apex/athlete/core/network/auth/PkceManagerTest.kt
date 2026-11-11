package com.apex.athlete.core.network.auth

import com.apex.athlete.core.network.TestStack
import com.apex.athlete.core.network.json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.mockwebserver.MockResponse
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PkceManagerTest {
    private val stack = TestStack(signedIn = false)
    private val redirect = stack.oauth.redirectUri

    @AfterTest fun tearDown() = stack.shutdown()

    private fun formOf(body: String): Map<String, String> =
        "http://x/?$body".toHttpUrl().let { url -> url.queryParameterNames.associateWith { url.queryParameter(it)!! } }

    @Test
    fun authorizationUrlCarriesPkceStateScopesAndOfflineAccess() {
        val request = stack.pkce.beginAuthorization()
        val url = request.url.toHttpUrl()
        assertEquals("code", url.queryParameter("response_type"))
        assertEquals("S256", url.queryParameter("code_challenge_method"))
        assertEquals(stack.oauth.clientId, url.queryParameter("client_id"))
        assertEquals(redirect, url.queryParameter("redirect_uri"))
        assertEquals(request.state, url.queryParameter("state"))
        assertEquals(stack.oauth.scopeParameter, url.queryParameter("scope"))
        assertEquals("offline", url.queryParameter("access_type"))
        val pending = assertNotNull(stack.store.loadPending())
        assertEquals(Pkce.challengeS256(pending.codeVerifier), url.queryParameter("code_challenge"))
        assertEquals(request.state, pending.state)
        assertFalse(request.url.contains(pending.codeVerifier), "verifier must never be in the URL")
    }

    @Test
    fun happyPathExchangesCodeWithVerifierAndStoresTokens() {
        val request = stack.pkce.beginAuthorization()
        val scope = stack.oauth.scopes.first()
        stack.dispatcher.handler = { json(TestStack.tokenJson("acc", "ref", 3600, scope)) }

        val outcome = stack.pkce.completeAuthorizationBlocking("$redirect?code=CODE&state=${request.state}")

        assertIs<AuthorizationOutcome.Success>(outcome)
        assertEquals(emptySet(), outcome.missingScopes)
        val form = formOf(stack.dispatcher.requests.single().body.readUtf8())
        assertEquals("authorization_code", form["grant_type"])
        assertEquals("CODE", form["code"])
        assertEquals(redirect, form["redirect_uri"])
        assertEquals(stack.oauth.clientId, form["client_id"])
        assertTrue(form.containsKey("code_verifier") && Pkce.isValidVerifier(form.getValue("code_verifier")))
        assertFalse(form.containsKey("client_secret"))
        val tokens = assertNotNull(stack.store.load())
        assertEquals("acc", tokens.accessToken)
        assertEquals("ref", tokens.refreshToken)
        assertEquals(stack.clock.nowMillis() + 3_600_000L, tokens.expiresAtMillis)
        assertEquals(AuthState.SignedIn(setOf(scope)), stack.store.currentState())
        assertNull(stack.store.loadPending(), "authorization code is single use")
    }

    @Test
    fun scopesTheOwnerUntickedAreReportedAsMissing() {
        val request = stack.pkce.beginAuthorization()
        stack.dispatcher.handler = { json(TestStack.tokenJson("acc", "ref", scope = "")) }
        val outcome = stack.pkce.completeAuthorizationBlocking("$redirect?code=C&state=${request.state}")
        assertIs<AuthorizationOutcome.Success>(outcome)
        assertEquals(stack.oauth.scopes.toSet(), outcome.missingScopes)
    }

    @Test
    fun stateMismatchIsRejectedWithoutAnyNetworkCallAndKeepsPending() {
        stack.pkce.beginAuthorization()
        val outcome = stack.pkce.completeAuthorizationBlocking("$redirect?code=C&state=forged")
        assertEquals(AuthorizationOutcome.StateMismatch, outcome)
        assertEquals(0, stack.dispatcher.requests.size)
        assertNull(stack.store.load())
        assertNotNull(stack.store.loadPending())
        assertEquals(AuthorizationOutcome.StateMismatch, stack.pkce.completeAuthorizationBlocking("$redirect?code=C"))
    }

    @Test
    fun errorRedirectWithWrongStateIsAStateMismatchNotADenial() {
        stack.pkce.beginAuthorization()
        assertEquals(AuthorizationOutcome.StateMismatch, stack.pkce.completeAuthorizationBlocking("$redirect?error=access_denied&state=zzz"))
    }

    @Test
    fun deniedConsentIsReportedAndClearsPending() {
        val request = stack.pkce.beginAuthorization()
        val outcome = stack.pkce.completeAuthorizationBlocking("$redirect?error=access_denied&state=${request.state}")
        assertEquals(AuthorizationOutcome.Denied("access_denied", null), outcome)
        assertNull(stack.store.loadPending())
        assertEquals(0, stack.dispatcher.requests.size)
    }

    @Test
    fun withoutPendingAuthorizationNothingHappens() {
        assertEquals(AuthorizationOutcome.NoPendingAuthorization, stack.pkce.completeAuthorizationBlocking("$redirect?code=C&state=S"))
    }

    @Test
    fun expiredPendingAuthorizationIsRejected() {
        val request = stack.pkce.beginAuthorization()
        stack.clock.advance(PkceManager.DEFAULT_PENDING_TTL_MILLIS + 1)
        assertEquals(AuthorizationOutcome.PendingExpired, stack.pkce.completeAuthorizationBlocking("$redirect?code=C&state=${request.state}"))
        assertNull(stack.store.loadPending())
    }

    @Test
    fun strayRedirectDoesNotDiscardThePendingRequest() {
        stack.pkce.beginAuthorization()
        assertIs<AuthorizationOutcome.InvalidRedirect>(stack.pkce.completeAuthorizationBlocking("evil:/x?code=C&state=S"))
        assertNotNull(stack.store.loadPending())
    }

    @Test
    fun exchangeRejectionAndMalformedAnswersAreTypedFailures() {
        var request = stack.pkce.beginAuthorization()
        stack.dispatcher.handler = { json("{\"error\":\"invalid_grant\",\"error_description\":\"Bad code\"}", 400) }
        assertEquals(AuthorizationOutcome.ExchangeFailed(400, "invalid_grant"), stack.pkce.completeAuthorizationBlocking("$redirect?code=C&state=${request.state}"))

        request = stack.pkce.beginAuthorization()
        stack.dispatcher.handler = { json("not json at all") }
        assertEquals(AuthorizationOutcome.ExchangeFailed(200, "malformed_response"), stack.pkce.completeAuthorizationBlocking("$redirect?code=C&state=${request.state}"))
        assertNull(stack.store.load())
    }

    @Test
    fun networkFailureDuringExchangeKeepsPendingForRetry() {
        val request = stack.pkce.beginAuthorization()
        stack.dispatcher.handler = { MockResponse().setSocketPolicy(okhttp3.mockwebserver.SocketPolicy.DISCONNECT_AFTER_REQUEST) }
        assertEquals(AuthorizationOutcome.NetworkFailure, stack.pkce.completeAuthorizationBlocking("$redirect?code=C&state=${request.state}"))
        assertNotNull(stack.store.loadPending())
    }

    @Test
    fun refreshKeepsTheOldRefreshTokenWhenGoogleOmitsIt() {
        val current = StoredTokens("old", "ref-1", 0, setOf("s1"), stack.oauth.clientId)
        stack.dispatcher.handler = { json(TestStack.tokenJson("new", null, 1800)) }
        val outcome = stack.pkce.refreshBlocking(current)
        assertIs<RefreshOutcome.Refreshed>(outcome)
        assertEquals("new", outcome.tokens.accessToken)
        assertEquals("ref-1", outcome.tokens.refreshToken)
        assertEquals(setOf("s1"), outcome.tokens.grantedScopes)
        assertEquals(stack.clock.nowMillis() + 1_800_000L, outcome.tokens.expiresAtMillis)
        val form = formOf(stack.dispatcher.requests.single().body.readUtf8())
        assertEquals("refresh_token", form["grant_type"])
        assertEquals("ref-1", form["refresh_token"])
    }

    @Test
    fun refreshOutcomesAreClassified() {
        val current = StoredTokens("old", "ref-1", 0, emptySet(), stack.oauth.clientId)
        stack.dispatcher.handler = { json("{\"error\":\"invalid_grant\",\"error_description\":\"Token has been expired or revoked.\"}", 400) }
        assertEquals(RefreshOutcome.InvalidGrant, stack.pkce.refreshBlocking(current))
        stack.dispatcher.handler = { json("{\"error\":\"invalid_client\"}", 401) }
        assertEquals(RefreshOutcome.ClientRejected("invalid_client"), stack.pkce.refreshBlocking(current))
        stack.dispatcher.handler = { json("{\"error\":\"invalid_request\"}", 400) }
        assertEquals(RefreshOutcome.Rejected(400, "invalid_request"), stack.pkce.refreshBlocking(current))
        stack.dispatcher.handler = { MockResponse().setResponseCode(503) }
        assertEquals(RefreshOutcome.Transient(503), stack.pkce.refreshBlocking(current))
        stack.dispatcher.handler = { MockResponse().setResponseCode(429) }
        assertEquals(RefreshOutcome.Transient(429), stack.pkce.refreshBlocking(current))
        assertEquals(RefreshOutcome.NoRefreshToken, stack.pkce.refreshBlocking(current.copy(refreshToken = null)))
    }

    @Test
    fun signOutRevokesAndForgetsButOnlyLocalTokens() {
        stack.store.save(StoredTokens("a", "r", 0, emptySet(), stack.oauth.clientId))
        stack.dispatcher.handler = { MockResponse().setResponseCode(200) }
        assertTrue(stack.pkce.signOutBlocking())
        val form = formOf(stack.dispatcher.requests.single().body.readUtf8())
        assertEquals("r", form["token"])
        assertEquals("/revoke", stack.dispatcher.requests.single().path)
        assertNull(stack.store.load())
        assertEquals(AuthState.SignedOut, stack.store.currentState())
    }

    @Test
    fun signOutStillForgetsTokensWhenRevocationFails() {
        stack.store.save(StoredTokens("a", "r", 0, emptySet(), stack.oauth.clientId))
        stack.dispatcher.handler = { MockResponse().setSocketPolicy(okhttp3.mockwebserver.SocketPolicy.DISCONNECT_AFTER_REQUEST) }
        assertFalse(stack.pkce.signOutBlocking())
        assertNull(stack.store.load())
    }

    @Test
    fun storedTokensAndPendingNeverPrintSecrets() {
        val t = StoredTokens("SECRET-A", "SECRET-R", 0, emptySet(), "c")
        assertFalse(t.toString().contains("SECRET"))
        val p = PendingAuthorization("SECRET-V", "SECRET-S", "r", "c", 0)
        assertFalse(p.toString().contains("SECRET"))
    }
}
