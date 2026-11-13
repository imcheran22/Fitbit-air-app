package com.apex.athlete.core.network.auth

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

/** Both redirect styles, chosen at build time; blank, malformed and odd input never throws. */
class OAuthClientTypeTest {
    private val id = "123456-abc_DEF.apps.googleusercontent.com"

    @Test
    fun parseIsCaseInsensitiveAndFallsBackToIos() {
        assertEquals(OAuthClientType.ANDROID, OAuthClientType.parse("android"))
        assertEquals(OAuthClientType.ANDROID, OAuthClientType.parse(" ANDROID "))
        assertEquals(OAuthClientType.IOS, OAuthClientType.parse("ios"))
        assertEquals(OAuthClientType.IOS, OAuthClientType.parse("  iOS\n"))
        for (bad in listOf(null, "", "   ", "web", "desktop", "ios;rm", "androidx")) {
            assertEquals(OAuthClientType.IOS, OAuthClientType.parse(bad), "input: $bad")
        }
        assertEquals(OAuthClientType.IOS, OAuthClientType.DEFAULT)
        assertEquals(
            "com.googleusercontent.apps.123456-abc_DEF:/oauth2redirect",
            GoogleHealthAuthConfig.redirectUri(id),
        )
    }

    @Test
    fun androidSchemeIsThePackageNameWhateverTheClientId() {
        assertEquals("com.apex.athlete", GoogleHealthAuthConfig.redirectScheme(id, OAuthClientType.ANDROID))
        assertEquals("com.apex.athlete:/oauth2redirect", GoogleHealthAuthConfig.redirectUri(id, OAuthClientType.ANDROID))
        assertEquals("com.other.app", GoogleHealthAuthConfig.redirectScheme(id, OAuthClientType.ANDROID, "com.other.app"))
    }

    @Test
    fun iosSchemeIsTheReversedClientId() {
        assertEquals("com.googleusercontent.apps.123456-abc_DEF", GoogleHealthAuthConfig.redirectScheme(id, OAuthClientType.IOS))
        assertEquals(
            "com.googleusercontent.apps.123456-abc_DEF:/oauth2redirect",
            GoogleHealthAuthConfig.redirectUri("  $id  ", OAuthClientType.IOS),
        )
    }

    @Test
    fun blankOrMalformedIdsNeverThrowForEitherStyle() {
        val bad = listOf(
            "", "   ", "\n", "plain", ".apps.googleusercontent.com", "a b.apps.googleusercontent.com",
            "a/b.apps.googleusercontent.com", "x.apps.googleusercontent.com.evil", "é.apps.googleusercontent.com", "Ω9.apps.googleusercontent.com",
            "a:b.apps.googleusercontent.com", "\u0000.apps.googleusercontent.com",
        )
        for (type in OAuthClientType.entries) {
            for (raw in bad) {
                val scheme = runCatching { GoogleHealthAuthConfig.redirectScheme(raw, type) }
                assertEquals(true, scheme.isSuccess, "threw for '$raw' / $type")
                assertNull(scheme.getOrNull(), "'$raw' / $type")
                val state = runCatching { GoogleHealthAuthConfig.create(raw, type) }
                assertEquals(true, state.isSuccess, "create threw for '$raw' / $type")
            }
            assertEquals(AuthConfigState.NotConfigured, GoogleHealthAuthConfig.create(null, type))
        }
    }

    @Test
    fun androidStyleRejectsAnApplicationIdWithoutAPeriod() {
        // Google requires a period in a custom scheme; a bare word cannot be the redirect.
        assertNull(GoogleHealthAuthConfig.redirectScheme(id, OAuthClientType.ANDROID, "apex"))
        assertNull(GoogleHealthAuthConfig.redirectScheme(id, OAuthClientType.ANDROID, "  "))
    }

    @Test
    fun createdConfigCarriesTheRedirectOfTheChosenStyle() {
        val android = GoogleHealthAuthConfig.create(id, OAuthClientType.ANDROID)
        assertIs<AuthConfigState.Configured>(android)
        assertEquals("com.apex.athlete:/oauth2redirect", android.config.redirectUri)
        val ios = GoogleHealthAuthConfig.create(id, OAuthClientType.IOS)
        assertIs<AuthConfigState.Configured>(ios)
        assertEquals("com.googleusercontent.apps.123456-abc_DEF:/oauth2redirect", ios.config.redirectUri)
    }

    @Test
    fun mismatchGuardWorksForBothStyles() {
        val app = "com.apex.athlete"
        // Android style: the scheme never depends on the ID, so a Settings ID always matches the manifest.
        assertNull(GoogleHealthAuthConfig.schemeNeededIfDifferent(id, OAuthClientType.ANDROID, app, "com.apex.athlete"))
        assertNull(GoogleHealthAuthConfig.schemeNeededIfDifferent("9-z.apps.googleusercontent.com", OAuthClientType.ANDROID, app, "COM.apex.athlete"))
        // iOS style: an ID other than the one the manifest was built with needs another scheme.
        val manifest = "com.googleusercontent.apps.123456-abc_DEF"
        assertNull(GoogleHealthAuthConfig.schemeNeededIfDifferent(id, OAuthClientType.IOS, app, manifest))
        assertNull(GoogleHealthAuthConfig.schemeNeededIfDifferent(id, OAuthClientType.IOS, app, manifest.uppercase()))
        assertEquals(
            "com.googleusercontent.apps.9-z",
            GoogleHealthAuthConfig.schemeNeededIfDifferent("9-z.apps.googleusercontent.com", OAuthClientType.IOS, app, manifest),
        )
        // A build made without an ID uses the placeholder scheme; a Settings ID then needs a rebuild.
        assertEquals(
            "com.googleusercontent.apps.9-z",
            GoogleHealthAuthConfig.schemeNeededIfDifferent("9-z.apps.googleusercontent.com", OAuthClientType.IOS, app, "com.apex.athlete.oauth"),
        )
        // Garbage input: no opinion, never a throw.
        assertNull(GoogleHealthAuthConfig.schemeNeededIfDifferent("junk", OAuthClientType.IOS, app, manifest))
        assertNull(GoogleHealthAuthConfig.schemeNeededIfDifferent("", OAuthClientType.ANDROID, app, manifest))
    }

    @Test
    fun redirectParserAcceptsAndRejectsRedirectsOfBothStyles() {
        for (type in OAuthClientType.entries) {
            val expected = GoogleHealthAuthConfig.redirectUri(id, type)!!
            assertEquals(RedirectResult.Code("c", "s"), RedirectParser.parse("$expected?code=c&state=s", expected), "$type")
        }
        val android = GoogleHealthAuthConfig.redirectUri(id, OAuthClientType.ANDROID)!!
        val ios = GoogleHealthAuthConfig.redirectUri(id, OAuthClientType.IOS)!!
        // A redirect of the other style is not this build's redirect.
        assertIs<RedirectResult.Invalid>(RedirectParser.parse("$ios?code=c&state=s", android))
        assertIs<RedirectResult.Invalid>(RedirectParser.parse("$android?code=c&state=s", ios))
        assertIs<RedirectResult.Invalid>(RedirectParser.parse("com.apex.athlete.evil:/oauth2redirect?code=c&state=s", android))
    }
}
