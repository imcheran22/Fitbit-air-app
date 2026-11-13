package com.apex.athlete.di

import com.apex.athlete.BuildConfig
import com.apex.athlete.core.network.auth.GoogleHealthAuthConfig
import com.apex.athlete.core.network.auth.OAuthClientType
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The scheme in the manifest (computed by `redirectSchemeFor` in app/build.gradle.kts) and the redirect the
 * runtime asks Google for (`GoogleHealthAuthConfig`) must always agree, whichever client type and client ID
 * the build was made with. If they drift, Google's redirect cannot reach the app and sign-in silently fails.
 */
class OAuthSchemeConsistencyTest {
    private val type = OAuthClientType.parse(BuildConfig.OAUTH_CLIENT_TYPE)

    @Test
    fun buildClientTypeIsOneOfTheTwoStyles() {
        assertTrue(BuildConfig.OAUTH_CLIENT_TYPE in setOf("android", "ios"), BuildConfig.OAUTH_CLIENT_TYPE)
        assertEquals(BuildConfig.OAUTH_CLIENT_TYPE, type.wireName)
    }

    @Test
    fun manifestSchemeAgreesWithTheRuntimeRedirectOfThisBuild() {
        val runtime = GoogleHealthAuthConfig.redirectScheme(BuildConfig.GOOGLE_CLIENT_ID, type, BuildConfig.APPLICATION_ID)
        if (runtime == null) {
            // Blank or malformed ID: sign-in reports "not configured"; the manifest holds a harmless scheme.
            assertTrue(BuildConfig.OAUTH_REDIRECT_SCHEME.isNotBlank())
        } else {
            assertEquals(runtime, BuildConfig.OAUTH_REDIRECT_SCHEME)
        }
    }

    @Test
    fun theDefaultStyleIsIosUnlessTheBuildAskedForAndroid() {
        // A build made without apex.oauthClientType / APEX_OAUTH_CLIENT_TYPE is an iOS-style build.
        assertEquals(OAuthClientType.IOS, OAuthClientType.DEFAULT)
        if (BuildConfig.OAUTH_CLIENT_TYPE != "android") assertEquals("ios", BuildConfig.OAUTH_CLIENT_TYPE)
    }

    @Test
    fun androidStyleManifestSchemeIsAlwaysThePackageName() {
        if (type == OAuthClientType.ANDROID) assertEquals(BuildConfig.APPLICATION_ID, BuildConfig.OAUTH_REDIRECT_SCHEME)
    }

    @Test
    fun theGuardAcceptsTheIdThisBuildWasMadeWith() {
        if (BuildConfig.GOOGLE_CLIENT_ID.isBlank()) return
        assertNull(
            GoogleHealthAuthConfig.schemeNeededIfDifferent(
                BuildConfig.GOOGLE_CLIENT_ID, type, BuildConfig.APPLICATION_ID, BuildConfig.OAUTH_REDIRECT_SCHEME,
            ),
        )
    }
}
