package com.apex.athlete.core.network.auth

/**
 * Google OAuth 2.0 installed-app configuration for the Google Health API.
 *
 * The redirect scheme depends on the OAuth client type chosen at build time ([OAuthClientType]); see
 * `docs/OPEN_POINTS.md` (sign-in client type) for what Google's documentation does and does not confirm.
 *
 * Endpoints are Google's documented OAuth 2.0 endpoints. Scope strings are copied verbatim from the
 * `auth.oauth2.scopes` section of the Google Health API v4 discovery document (revision 20261109,
 * `docs/api-snapshots/google-health-v4-discovery-2026-11-11.json`). Only `.readonly` scopes appear
 * here; Apex never writes to a Google account.
 */
object GoogleHealthAuthConfig {
    const val AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
    const val TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
    const val REVOCATION_ENDPOINT = "https://oauth2.googleapis.com/revoke"

    const val SCOPE_HEALTH_METRICS = "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly"
    const val SCOPE_ACTIVITY = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly"
    const val SCOPE_SLEEP = "https://www.googleapis.com/auth/googlehealth.sleep.readonly"

    /** Needed only for the paired-devices list (`pairedDevices.list`), which feeds the Fitbit Air status row. */
    const val SCOPE_SETTINGS = "https://www.googleapis.com/auth/googlehealth.settings.readonly"

    /** Scopes requested at sign-in. Location, ECG, IRN, profile, mindfulness etc. are deliberately omitted. */
    val READ_SCOPES: List<String> = listOf(SCOPE_HEALTH_METRICS, SCOPE_ACTIVITY, SCOPE_SLEEP, SCOPE_SETTINGS)

    const val REDIRECT_PATH = "/oauth2redirect"
    private const val CLIENT_ID_SUFFIX = ".apps.googleusercontent.com"
    private const val REDIRECT_SCHEME_PREFIX = "com.googleusercontent.apps."

    /** The application ID the Android-style redirect scheme is made from (matches `app/build.gradle.kts`). */
    const val DEFAULT_APPLICATION_ID = "com.apex.athlete"

    /** True when [clientId] has the shape Google client IDs have: `<prefix>.apps.googleusercontent.com`. */
    private fun clientIdPrefix(clientId: String): String? {
        val trimmed = clientId.trim()
        if (!trimmed.endsWith(CLIENT_ID_SUFFIX)) return null
        val prefix = trimmed.removeSuffix(CLIENT_ID_SUFFIX)
        if (prefix.isEmpty() || !prefix.all { it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9' || it == '-' || it == '_' }) return null
        return prefix
    }

    /**
     * The redirect scheme for [clientId]; null when the ID is blank or not in Google's shape.
     *
     * - [OAuthClientType.ANDROID]: the application ID (`com.apex.athlete`), Google's custom-scheme form
     *   `com.example.app:/path` for an Android-type client.
     * - [OAuthClientType.IOS]: the reversed client ID, `com.googleusercontent.apps.<prefix>`, where the
     *   prefix is everything before `.apps.googleusercontent.com`.
     *
     * Never throws. `:app` computes the same value for the manifest placeholder; `OAuthSchemeConsistencyTest`
     * in `:app` keeps the two in step.
     */
    fun redirectScheme(
        clientId: String,
        clientType: OAuthClientType = OAuthClientType.DEFAULT,
        applicationId: String = DEFAULT_APPLICATION_ID,
    ): String? {
        val prefix = clientIdPrefix(clientId) ?: return null
        return when (clientType) {
            OAuthClientType.ANDROID -> applicationId.trim().takeIf { it.isNotEmpty() && '.' in it }
            OAuthClientType.IOS -> REDIRECT_SCHEME_PREFIX + prefix
        }
    }

    fun redirectUri(
        clientId: String,
        clientType: OAuthClientType = OAuthClientType.DEFAULT,
        applicationId: String = DEFAULT_APPLICATION_ID,
    ): String? = redirectScheme(clientId, clientType, applicationId)?.let { "$it:$REDIRECT_PATH" }

    /**
     * The scheme this client ID needs when it differs from the scheme compiled into the manifest
     * ([manifestScheme]), otherwise null. A Settings-entered ID is the only way these can differ.
     */
    fun schemeNeededIfDifferent(
        clientId: String,
        clientType: OAuthClientType,
        applicationId: String,
        manifestScheme: String,
    ): String? {
        val needed = redirectScheme(clientId, clientType, applicationId) ?: return null
        return needed.takeUnless { it.equals(manifestScheme.trim(), ignoreCase = true) }
    }

    /**
     * Builds the configuration from the client ID that `:app` injects through BuildConfig.
     * A blank or malformed ID yields [AuthConfigState.NotConfigured], never an exception.
     */
    fun create(
        clientId: String?,
        clientType: OAuthClientType = OAuthClientType.DEFAULT,
        applicationId: String = DEFAULT_APPLICATION_ID,
    ): AuthConfigState {
        val id = clientId?.trim().orEmpty()
        if (id.isEmpty()) return AuthConfigState.NotConfigured
        val redirect = redirectUri(id, clientType, applicationId) ?: return AuthConfigState.NotConfigured
        return AuthConfigState.Configured(
            OAuthProviderConfig(
                providerId = "google-health",
                clientId = id,
                authorizationEndpoint = AUTHORIZATION_ENDPOINT,
                tokenEndpoint = TOKEN_ENDPOINT,
                revocationEndpoint = REVOCATION_ENDPOINT,
                scopes = READ_SCOPES,
                redirectUri = redirect,
                extraAuthorizationParameters = mapOf(
                    // A refresh token is only issued with offline access; consent is forced so it is
                    // returned again if the owner signs in a second time.
                    "access_type" to "offline",
                    "prompt" to "consent",
                    // Google's incremental-authorization switch: keeps previously granted scopes.
                    "include_granted_scopes" to "true",
                ),
            ),
        )
    }
}
