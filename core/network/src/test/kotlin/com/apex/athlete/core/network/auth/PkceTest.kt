package com.apex.athlete.core.network.auth

import java.security.SecureRandom
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PkceTest {
    @Test
    fun rfc7636AppendixBVector() {
        val verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", Pkce.challengeS256(verifier))
    }

    @Test
    fun generatedVerifiersAreValidAndUnique() {
        val random = SecureRandom()
        val seen = HashSet<String>()
        repeat(50) {
            val v = Pkce.generateVerifier(random)
            assertTrue(Pkce.isValidVerifier(v), v)
            assertEquals(43, v.length)
            assertTrue(seen.add(v))
        }
        assertEquals(128, Pkce.generateVerifier(random, 96).length)
        assertFailsWith<IllegalArgumentException> { Pkce.generateVerifier(random, 31) }
        assertFailsWith<IllegalArgumentException> { Pkce.generateVerifier(random, 97) }
    }

    @Test
    fun verifierValidationFollowsTheRfc() {
        assertFalse(Pkce.isValidVerifier("short"))
        assertFalse(Pkce.isValidVerifier("a".repeat(129)))
        assertFalse(Pkce.isValidVerifier("a".repeat(42) + "+"))
        assertFalse(Pkce.isValidVerifier("a".repeat(42) + " "))
        assertTrue(Pkce.isValidVerifier("a-._~Z9".padEnd(43, 'x')))
        assertFailsWith<IllegalArgumentException> { Pkce.challengeS256("bad") }
    }

    @Test
    fun challengeHasNoPaddingAndIsUrlSafe() {
        repeat(20) {
            val c = Pkce.challengeS256(Pkce.generateVerifier())
            assertEquals(43, c.length)
            assertTrue(c.none { it == '=' || it == '+' || it == '/' })
        }
    }

    @Test
    fun stateIsRandomAndComparedExactly() {
        val a = Pkce.generateState()
        val b = Pkce.generateState()
        assertNotEquals(a, b)
        assertTrue(Pkce.constantTimeEquals(a, a))
        assertFalse(Pkce.constantTimeEquals(a, b))
        assertFalse(Pkce.constantTimeEquals(a, a + "x"))
        assertFalse(Pkce.constantTimeEquals(null, a))
        assertFalse(Pkce.constantTimeEquals(a, null))
        assertFalse(Pkce.constantTimeEquals(null, null))
    }
}

class RedirectParserTest {
    private val redirect = "com.googleusercontent.apps.123-abc:/oauth2redirect"

    @Test
    fun parsesCodeAndState() {
        val r = RedirectParser.parse("$redirect?state=S1&code=4%2F0AbC&scope=a%20b", redirect)
        assertEquals(RedirectResult.Code("4/0AbC", "S1"), r)
    }

    @Test
    fun parsesErrorWithDescription() {
        val r = RedirectParser.parse("$redirect?error=access_denied&error_description=User+said+no&state=S1", redirect)
        assertEquals(RedirectResult.Error("access_denied", "User said no", "S1"), r)
    }

    @Test
    fun errorWinsOverCode() {
        val r = RedirectParser.parse("$redirect?code=x&error=access_denied&state=S", redirect)
        assertIs<RedirectResult.Error>(r)
    }

    @Test
    fun firstDuplicateParameterWins() {
        val r = RedirectParser.parse("$redirect?code=real&code=evil&state=a&state=b", redirect)
        assertEquals(RedirectResult.Code("real", "a"), r)
    }

    @Test
    fun missingStateIsReportedAsNullNotInvalid() {
        assertEquals(RedirectResult.Code("c", null), RedirectParser.parse("$redirect?code=c", redirect))
    }

    @Test
    fun rejectsWrongSchemePathAndGarbage() {
        assertIs<RedirectResult.Invalid>(RedirectParser.parse("evil.app:/oauth2redirect?code=c&state=s", redirect))
        assertIs<RedirectResult.Invalid>(RedirectParser.parse("com.googleusercontent.apps.123-abc:/other?code=c", redirect))
        assertIs<RedirectResult.Invalid>(RedirectParser.parse("nonsense", redirect))
        assertIs<RedirectResult.Invalid>(RedirectParser.parse("$redirect", redirect))
        assertIs<RedirectResult.Invalid>(RedirectParser.parse("$redirect?state=s", redirect))
        assertIs<RedirectResult.Invalid>(RedirectParser.parse("$redirect?code=", redirect))
    }

    @Test
    fun acceptsSchemeCaseAndDoubleSlashForms() {
        assertIs<RedirectResult.Code>(RedirectParser.parse("COM.GOOGLEUSERCONTENT.APPS.123-abc:/oauth2redirect?code=c&state=s", redirect))
        assertIs<RedirectResult.Code>(RedirectParser.parse("com.googleusercontent.apps.123-abc://oauth2redirect?code=c&state=s", redirect))
    }

    @Test
    fun fragmentIsIgnoredAndBadEscapesDoNotThrow() {
        assertIs<RedirectResult.Code>(RedirectParser.parse("$redirect?code=c&state=s#frag", redirect))
        val r = RedirectParser.parse("$redirect?code=%ZZ&state=s", redirect)
        assertIs<RedirectResult.Invalid>(r)
    }
}

class GoogleHealthAuthConfigTest {
    @Test
    fun redirectIsDerivedFromClientId() {
        assertEquals(
            "com.googleusercontent.apps.123456-abcdef:/oauth2redirect",
            GoogleHealthAuthConfig.redirectUri("123456-abcdef.apps.googleusercontent.com"),
        )
    }

    @Test
    fun blankOrMalformedClientIdIsNotConfigured() {
        assertEquals(AuthConfigState.NotConfigured, GoogleHealthAuthConfig.create(null))
        assertEquals(AuthConfigState.NotConfigured, GoogleHealthAuthConfig.create(""))
        assertEquals(AuthConfigState.NotConfigured, GoogleHealthAuthConfig.create("   "))
        assertEquals(AuthConfigState.NotConfigured, GoogleHealthAuthConfig.create("not-a-google-client-id"))
        assertNull(GoogleHealthAuthConfig.redirectScheme(".apps.googleusercontent.com"))
        assertNull(GoogleHealthAuthConfig.redirectScheme("a b.apps.googleusercontent.com"))
    }

    @Test
    fun configuredStateRequestsOfflineConsentAndOnlyReadScopes() {
        val state = GoogleHealthAuthConfig.create("123-abc.apps.googleusercontent.com")
        assertIs<AuthConfigState.Configured>(state)
        val c = state.config
        assertEquals("offline", c.extraAuthorizationParameters["access_type"])
        assertEquals("consent", c.extraAuthorizationParameters["prompt"])
        assertTrue(c.scopes.all { it.startsWith("https://www.googleapis.com/auth/googlehealth.") && it.endsWith(".readonly") })
        assertEquals("https://accounts.google.com/o/oauth2/v2/auth", c.authorizationEndpoint)
        assertEquals("https://oauth2.googleapis.com/token", c.tokenEndpoint)
        assertEquals("https://oauth2.googleapis.com/revoke", c.revocationEndpoint)
    }

    @Test
    fun onlyTheFourScopesThatCallsUseAreRequested() {
        val c = (GoogleHealthAuthConfig.create("123-abc.apps.googleusercontent.com") as AuthConfigState.Configured).config
        assertEquals(
            listOf(
                GoogleHealthAuthConfig.SCOPE_HEALTH_METRICS, GoogleHealthAuthConfig.SCOPE_ACTIVITY,
                GoogleHealthAuthConfig.SCOPE_SLEEP, GoogleHealthAuthConfig.SCOPE_SETTINGS,
            ),
            c.scopes,
        )
        // settings.readonly is for the paired-devices list (Fitbit Air status on Data sources), the only call that needs it.
        assertTrue(GoogleHealthAuthConfig.SCOPE_SETTINGS in c.scopes)
    }

    @Test
    fun writeScopesAreRefusedByTheConfigType() {
        assertFailsWith<IllegalArgumentException> {
            OAuthProviderConfig("x", "id", "https://a", "https://b", null,
                listOf("https://www.googleapis.com/auth/googlehealth.sleep.writeonly"), "x:/y")
        }
    }
}
